// B25: headless-проверка вкладки «Спросить» с заглушкой ask/api.php (эмуляция очереди хостинга).
// node tools/ask-shot.mjs [корень=.] [папка=shots]   BROWSER=<путь к msedge/chrome>
// Сценарий: открыть #ask -> ввести вопрос (с невидимым символом) -> отправить -> «сервер» отвечает -> снимок.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BROWSER = [process.env.BROWSER, "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe"]
  .filter(Boolean).find(p => existsSync(p));
if (!BROWSER) { console.error("Браузер не найден: задайте BROWSER=<путь>"); process.exit(2); }

const ROOT = process.argv[2] || ".", OUT = process.argv[3] || "shots", PORT = 8798, URL_ = `http://127.0.0.1:${PORT}/`;
const MIME = { html: "text/html; charset=utf-8", js: "text/javascript", css: "text/css", json: "application/json",
  webmanifest: "application/manifest+json", svg: "image/svg+xml", png: "image/png" };
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'";

// Заглушка очереди: вопрос -> processing на 1-м опросе -> ответ на 2-м. Вопрос с «перезапусти» -> отказ.
const Q = new Map(); const seen = [];
function api(q, s, body) {
  const u = new URL(q.url, URL_), json = (c, d) => { s.writeHead(c, { "Content-Type": "application/json" }); s.end(JSON.stringify(d)); };
  if (q.method === "POST") {
    const d = JSON.parse(body || "{}"), id = Math.random().toString(16).slice(2, 10).padEnd(16, "0");
    seen.push(d.question);
    Q.set(id, { id, status: "queued", polls: 0, q: d.question, created_at: new Date().toISOString() });
    return json(200, { id, status: "queued" });
  }
  const r = Q.get(u.searchParams.get("id")); if (!r) return json(404, { error: "not_found" });
  r.polls++;
  if (r.polls === 1) r.status = "processing";
  else if (r.status !== "answered") {
    const act = /перезапусти/i.test(r.q);
    Object.assign(r, { status: "answered", answered_at: new Date().toISOString(),
      answer: act ? "Это действие делает только владелец через чат с агентом. С доски можно только спрашивать: я ничего не выполняю."
        : "Шлюз очереди в режиме LIGHT, 140 задач ждут окна (status.json 22:10). Ошибок служб нет (почасовой аудит 22:00). Причина ожидания в контроллере не пишется (HANDOFF).",
      source: act ? "правило доски" : "по данным: status.json 02.10 22:10, почасовой аудит 02.10 22:00, HANDOFF 02.10 21:40 · модель kilo/dots3-note-preview" });
  }
  json(200, { id: r.id, status: r.status, answer: r.answer || null, source: r.source || null, created_at: r.created_at, answered_at: r.answered_at || null });
}
const srv = createServer((q, s) => {
  const p = decodeURIComponent(new URL(q.url, URL_).pathname).replace(/^\/+/, "") || "index.html";
  if (p === "ask/api.php") { let b = ""; q.on("data", c => b += c); q.on("end", () => api(q, s, b)); return; }
  if (p.includes("..") || !existsSync(join(ROOT, p))) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { "Content-Type": MIME[p.split(".").pop()] || "application/octet-stream", "Content-Security-Policy": CSP });
  let body = readFileSync(join(ROOT, p));
  if (p === "status.json") { const d = JSON.parse(body); d.generated_at = new Date(Date.now() - 60000).toISOString(); body = JSON.stringify(d); }
  s.end(body);
}).listen(PORT, "127.0.0.1");

const prof = join(tmpdir(), "board-ask-" + Date.now()); mkdirSync(OUT, { recursive: true });
const br = spawn(BROWSER, ["--headless=new", "--remote-debugging-port=0", "--user-data-dir=" + prof, "--no-first-run",
  "--no-default-browser-check", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const wait = new Map(), errors = [];
async function connect() {
  for (let i = 0; i < 75 && !ws; i++) {
    try {
      const port = readFileSync(join(prof, "DevToolsActivePort"), "utf8").split("\n")[0].trim();
      const l = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const p = l.find(t => t.type === "page"); if (p) ws = new WebSocket(p.webSocketDebuggerUrl);
    } catch {}
    if (!ws) await sleep(200);
  }
  if (!ws) throw new Error("браузер не отдал DevTools");
  await new Promise(r => ws.onopen = r);
  ws.onmessage = m => { const d = JSON.parse(m.data);
    if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.text);
    if (d.method === "Log.entryAdded" && d.params.entry.level === "error") errors.push(d.params.entry.text);
    if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } };
}
const send = (method, params = {}) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;

const CHECK = `(()=>{const vis=e=>e&&e.offsetParent!==null;
 const small=innerWidth<=620?[...document.querySelectorAll('#ask-section button,#ask-section textarea')].filter(vis).map(e=>[e.textContent.trim().slice(0,14)||e.id,Math.round(e.getBoundingClientRect().height)]).filter(([,h])=>h<48):[];
 const items=[...document.querySelectorAll('.ask-item')].map(li=>({st:li.querySelector('.st').textContent,q:li.querySelector('.ask-q').textContent,a:(li.querySelector('.ask-a')||{}).textContent||'',src:(li.querySelector('.ask-src')||{}).textContent||''}));
 return {view:document.body.dataset.view,askVisible:vis(document.getElementById('ask-section')),workHidden:!vis(document.getElementById('groups')),
  current:(document.querySelector('.tabs [aria-current=page]')||{}).id||'',items,hscroll:document.documentElement.scrollWidth>innerWidth,small}})()`;

async function ask(text) {
  await ev(`(()=>{const t=document.getElementById('ask-input');t.value=${JSON.stringify(text)};t.dispatchEvent(new Event('input'));document.querySelector('.ask-send').click()})()`);
  await sleep(1500 + 4000 + 4500);
}

async function run(name, w, h, dark, mobile, questions) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: dark ? "dark" : "light" }] });
  await send("Page.navigate", { url: URL_ + "#ask" }); await sleep(1200);
  await ev("localStorage.clear()"); await send("Page.reload"); await sleep(1200);
  for (const q of questions) await ask(q);
  await ev("window.scrollTo(0,0)");
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(join(OUT, name + ".png"), Buffer.from(r.result.data, "base64"));
  const c = await ev(CHECK); console.log(name, JSON.stringify(c)); return c;
}

let code = 0;
try {
  await connect(); await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable");
  const Q1 = "Почему очередь\u200b шлюза стоит?", Q2 = "перезапусти smart-quality30";
  const res = [await run("ask-1440x900-light", 1440, 900, false, false, [Q1, Q2]),
    await run("ask-1440x900-dark", 1440, 900, true, false, [Q1]),
    await run("ask-375x812-light", 375, 812, false, true, [Q1]),
    await run("ask-375x812-dark", 375, 812, true, true, [Q2])];
  // возврат на «Текущая работа» не ломается
  await send("Page.navigate", { url: URL_ + "#architecture" }); await sleep(800);
  await ev("location.hash=''"); await sleep(500);
  const back = await ev("({view:document.body.dataset.view,ask:document.getElementById('ask-section').offsetParent!==null})");
  console.log("back:", JSON.stringify(back), "вопросы на хостинг:", JSON.stringify(seen));
  const bad = [];
  for (const c of res) {
    if (c.view !== "ask" || !c.askVisible || !c.workHidden || c.current !== "tab-ask") bad.push("вкладка");
    if (!c.items.length || c.items.some(i => i.st !== "Ответ" || !i.a || !i.src)) bad.push("ответ");
    if (c.hscroll) bad.push("прокрутка"); if (c.small.length) bad.push("цели<48: " + JSON.stringify(c.small));
  }
  if (seen.some(q => /\u200b/.test(q))) bad.push("невидимый символ ушёл на хостинг");
  if (back.view !== "work" || back.ask) bad.push("возврат на работу");
  if (errors.length) bad.push("ошибки консоли: " + errors.slice(0, 3).join(" | "));
  console.log(bad.length ? "НЕ ОК: " + bad.join("; ") : "OK"); code = bad.length ? 1 : 0;
} catch (e) { console.error("ОШИБКА:", e.message); code = 1; }
finally {
  try { ws && ws.close(); } catch {}
  br.kill(); srv.close();
  await sleep(500); try { rmSync(prof, { recursive: true, force: true }); } catch {}
}
process.exit(code);
