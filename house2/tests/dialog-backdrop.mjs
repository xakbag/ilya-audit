// Headless-проверка закрытия dialog по фону: node house2/tests/dialog-backdrop.mjs [файл=house2/site/index.html]
// Реальные события мыши через CDP (Input.dispatchMouseEvent), 375x812 и 1440x900.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, existsSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";

const BROWSER = [process.env.BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe"].filter(Boolean).find(p => existsSync(p));
if (!BROWSER) { console.error("Браузер не найден"); process.exit(2); }

const FILE = process.argv[2] || "house2/site/index.html", ROOT = dirname(FILE), PAGE = basename(FILE), PORT = 8798;
const srv = createServer((q, s) => {
  const p = decodeURIComponent(new URL(q.url, "http://x/").pathname).replace(/^\/+/, "") || PAGE;
  if (p.includes("..") || !existsSync(join(ROOT, p))) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { "Content-Type": p.endsWith(".js") ? "text/javascript" : "text/html; charset=utf-8" });
  s.end(readFileSync(join(ROOT, p)));
}).listen(PORT, "127.0.0.1");

const prof = join(tmpdir(), "h2-dlg-" + Date.now()); mkdirSync(prof, { recursive: true });
const br = spawn(BROWSER, ["--headless=new", "--remote-debugging-port=0", "--user-data-dir=" + prof,
  "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const wait = new Map();
for (let i = 0; i < 75 && !ws; i++) {
  try {
    const port = readFileSync(join(prof, "DevToolsActivePort"), "utf8").split("\n")[0].trim();
    const p = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === "page");
    if (p) ws = new WebSocket(p.webSocketDebuggerUrl);
  } catch {}
  if (!ws) await sleep(200);
}
if (!ws) { console.error("DevTools недоступен"); process.exit(2); }
await new Promise(r => ws.onopen = r);
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => (await send("Runtime.evaluate", { expression: e, returnByValue: true })).result?.result?.value;
const mouse = (type, x, y, buttons = 1) => send("Input.dispatchMouseEvent",
  { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : buttons, clickCount: 1 });
const key = k => send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code: k, windowsVirtualKeyCode: 27 });

let fail = 0;
const ok = (name, cond) => { console.log((cond ? "PASS " : "FAIL ") + name); if (!cond) fail++; };

for (const [w, h] of [[375, 812], [1440, 900]]) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/${PAGE}` }); await sleep(1500);
  for (const dlg of ["dlg", "newTaskDlg"]) {
    const tag = `${w}x${h} #${dlg}`;
    // открыть и положить выделяемый текст в начало окна
    const open = `(()=>{const d=document.getElementById('${dlg}');if(!d)return null;if(d.open)d.close();
      let p=d.querySelector('#selp');if(!p){p=document.createElement('p');p.id='selp';p.style.padding='8px';d.prepend(p)}
      p.textContent='Текст для выделения мышью, длинная строка для проверки';getSelection().removeAllRanges();d.showModal();
      const r=p.getBoundingClientRect(),b=d.getBoundingClientRect();return {x:r.left+20,y:r.top+r.height/2,bx:Math.max(2,b.left/2),by:Math.max(2,b.top/2)}})()`;
    const isOpen = () => ev(`document.getElementById('${dlg}').open`);
    let c = await ev(open); if (!c) { ok(tag + " найден", false); continue; }
    // 1) выделение: нажать внутри → тянуть → отпустить на фоне
    await mouse("mousePressed", c.x, c.y); await mouse("mouseMoved", (c.x + c.bx) / 2, (c.y + c.by) / 2);
    await mouse("mouseMoved", c.bx, c.by); await mouse("mouseReleased", c.bx, c.by); await sleep(150);
    ok(tag + " выделение внутри→фон: окно остаётся", await isOpen());
    // 2) нажать внутри, отпустить на фоне без выделения (сбросить выделение до mouseup нельзя — проверяем флаг dn)
    await ev(`getSelection().removeAllRanges()`);
    await mouse("mousePressed", c.x, c.y); await ev(`getSelection().removeAllRanges()`);
    await mouse("mouseMoved", c.bx, c.by); await ev(`getSelection().removeAllRanges()`);
    await mouse("mouseReleased", c.bx, c.by); await sleep(150);
    ok(tag + " нажатие внутри, отпускание на фоне: окно остаётся", await isOpen());
    // 3) клик внутри окна
    await ev(`getSelection().removeAllRanges()`);
    await mouse("mousePressed", c.x, c.y); await mouse("mouseReleased", c.x, c.y); await sleep(150);
    ok(tag + " клик внутри: окно остаётся", await isOpen());
    // 4) клик по фону
    await ev(`getSelection().removeAllRanges()`);
    await mouse("mousePressed", c.bx, c.by); await mouse("mouseReleased", c.bx, c.by); await sleep(150);
    ok(tag + " клик по фону: окно закрывается", !(await isOpen()));
    // 5) Escape
    c = await ev(open); await key("Escape"); await sleep(150);
    ok(tag + " Escape: окно закрывается", !(await isOpen()));
  }
}
const errs = await ev(`window.__errs||null`);
br.kill(); srv.close(); try { rmSync(prof, { recursive: true, force: true }); } catch {}
console.log(fail ? `ИТОГ: ${fail} FAIL` : "ИТОГ: все PASS"); process.exit(fail ? 1 : 0);
