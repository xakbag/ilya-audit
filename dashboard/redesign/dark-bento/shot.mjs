// Скриншоты и проверки итоговой доски через DevTools Protocol (без внешних пакетов, Node 22+).
// node shot.mjs [корень=.] [папка=shots]   BROWSER=<путь к msedge/chrome>
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CANDIDATES = [process.env.BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe"].filter(Boolean);
const BROWSER = CANDIDATES.find(p => existsSync(p));
if (!BROWSER) { console.error("Браузер не найден: задайте BROWSER=<путь>"); process.exit(2); }

const ROOT = process.argv[2] || ".", OUT = process.argv[3] || "shots", PORT = 8799, URL_ = `http://127.0.0.1:${PORT}/`;
const MIME = { html: "text/html; charset=utf-8", js: "text/javascript", css: "text/css", json: "application/json",
  webmanifest: "application/manifest+json", svg: "image/svg+xml", png: "image/png" };
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'";
const srv = createServer((q, s) => {
  const p = decodeURIComponent(new URL(q.url, URL_).pathname).replace(/^\/+/, "") || "index.html";
  if (p.includes("..") || !existsSync(join(ROOT, p))) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { "Content-Type": MIME[p.split(".").pop()] || "application/octet-stream", "Content-Security-Policy": CSP });
  let body = readFileSync(join(ROOT, p));
  // Образец сдвигаем во времени, будто сервер только что его выпустил (иначе всегда «устарело»).
  if (p === "status.json" && !process.env.KEEP_TIME) {
    const d = JSON.parse(body), shift = Date.now() - 60000 - Date.parse(d.generated_at);
    d.generated_at = new Date(Date.now() - 60000).toISOString();
    for (const c of d.cards) if (c.last_useful_result) c.last_useful_result = new Date(Date.parse(c.last_useful_result) + shift).toISOString();
    body = JSON.stringify(d);
  }
  s.end(body);
}).listen(PORT, "127.0.0.1");

const prof = join(tmpdir(), "board-final-" + Date.now()); mkdirSync(OUT, { recursive: true });
const br = spawn(BROWSER, ["--headless=new", "--remote-debugging-port=0", "--user-data-dir=" + prof, "--no-first-run",
  "--no-default-browser-check", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let ws, id = 0; const wait = new Map();
async function connect() {
  for (let i = 0; i < 75 && !ws; i++) {
    try {
      const port = readFileSync(join(prof, "DevToolsActivePort"), "utf8").split("\n")[0].trim();
      const l = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const p = l.find(t => t.type === "page"); if (p) ws = new WebSocket(p.webSocketDebuggerUrl);
    } catch {}
    if (!ws) await sleep(200);
  }
  if (!ws) throw new Error("браузер не отдал DevTools (возможно, требуется подтверждение запуска)");
  await new Promise(r => ws.onopen = r);
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } };
}
const send = (method, params = {}) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;

// Проверки на странице: горизонтальная прокрутка, цели <48 px (на мобиле), контраст текста <4.5, ошибки CSP.
const CHECK = `(()=>{
 const lum=c=>{const m=c.match(/[\\d.]+/g).map(Number);const f=v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4};return .2126*f(m[0])+.7152*f(m[1])+.0722*f(m[2])};
 const bgOf=e=>{for(;e;e=e.parentElement){const c=getComputedStyle(e).backgroundColor;const a=c.match(/[\\d.]+/g);if(a&&(a[3]===undefined||+a[3]>.5))return c}return getComputedStyle(document.body).backgroundColor};
 const small=innerWidth<=620?[...document.querySelectorAll('button,summary,input,a.tab')].filter(e=>e.offsetParent).map(e=>{const r=e.getBoundingClientRect();return [e.id||e.textContent.trim().slice(0,16),Math.round(r.width),Math.round(r.height)]}).filter(([,w,h])=>h<48):[];
 const low=[];for(const e of document.querySelectorAll('h2,h3,p,.st,.k,.v,.h,.s,.fact,.why span,.provenance span,.btn,dt,dd,.upd')){if(!e.offsetParent||!e.textContent.trim())continue;const s=getComputedStyle(e);const a=lum(s.color),b=lum(bgOf(e));const cr=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);if(cr<4.5)low.push([e.className||e.tagName,e.textContent.trim().slice(0,18),cr.toFixed(2)])}
 return {head:document.getElementById('ov-head').textContent,cards:document.querySelectorAll('article.card').length,tiles:document.querySelectorAll('.tile').length,
  hscroll:document.documentElement.scrollWidth>innerWidth,small,low:low.slice(0,10)}})()`;

const ARCH_CHECK = `(()=>{const s=document.getElementById('arch-svg');return {nodes:s?s.querySelectorAll('[data-id]').length:0,
  foot:(document.getElementById('arch-foot')||{}).textContent||'',err:!document.getElementById('arch-err').hidden,hscroll:document.documentElement.scrollWidth>innerWidth}})()`;

async function shot(name, w, h, dark, mobile, hash = "") {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: dark ? "dark" : "light" }] });
  await send("Page.navigate", { url: URL_ + hash }); await sleep(1800);
  if (hash) {
    const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    writeFileSync(join(OUT, name + ".png"), Buffer.from(r.result.data, "base64"));
    console.log(name, JSON.stringify(await ev(ARCH_CHECK)));
    return;
  }
  await ev("document.querySelectorAll('article.card.fail details').forEach(d=>d.open=true)"); await sleep(300);
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(join(OUT, name + ".png"), Buffer.from(r.result.data, "base64"));
  console.log(name, JSON.stringify(await ev(CHECK)));
}

let code = 0;
try {
  await connect(); await send("Page.enable"); await send("Runtime.enable");
  await shot("final-1440x900-light", 1440, 900, false, false);
  await shot("final-1440x900-dark", 1440, 900, true, false);
  await shot("final-375x812-light", 375, 812, false, true);
  await shot("final-375x812-dark", 375, 812, true, true);
  await shot("arch-1440x900-light", 1440, 900, false, false, "#architecture");
  await shot("arch-1440x900-dark", 1440, 900, true, false, "#architecture");
  await shot("arch-375x812-light", 375, 812, false, true, "#architecture");
  const sw = await ev("navigator.serviceWorker.getRegistration().then(r=>r?(r.active?'active':'installing'):'none')");
  console.log("service worker:", sw);
} catch (e) { console.error("ОШИБКА:", e.message); code = 1; }
finally {
  try { ws && ws.close(); } catch {}
  br.kill(); srv.close();
  await sleep(500); try { rmSync(prof, { recursive: true, force: true }); } catch {}
}
process.exit(code);
