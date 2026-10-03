// Скриншоты для dashboard dark-bento
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CANDIDATES = [process.env.BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe"].filter(Boolean);
const BROWSER = CANDIDATES.find(p => existsSync(p));
if (!BROWSER) { console.error("Браузер не найден"); process.exit(2); }

const ROOT = ".", OUT = "shots", PORT = 8800, URL_ = `http://127.0.0.1:${PORT}/`;
const MIME = { html: "text/html; charset=utf-8", js: "text/javascript", css: "text/css", json: "application/json" };

const srv = createServer((q, s) => {
  const p = decodeURIComponent(new URL(q.url, URL_).pathname).replace(/^\/+/, "") || "index.html";
  if (p.includes("..") || !existsSync(join(ROOT, p))) { s.writeHead(404); s.end(); return; }
  s.writeHead(200, { "Content-Type": MIME[p.split(".").pop()] || "application/octet-stream" });
  let body = readFileSync(join(ROOT, p));
  if (p === "status.json" && !process.env.KEEP_TIME) {
    const d = JSON.parse(body);
    const shift = Date.now() - 60000 - Date.parse(d.generated_at);
    d.generated_at = new Date(Date.now() - 60000).toISOString();
    for (const c of d.cards) if (c.last_useful_result) c.last_useful_result = new Date(Date.parse(c.last_useful_result) + shift).toISOString();
    body = JSON.stringify(d);
  }
  s.end(body);
}).listen(PORT, "127.0.0.1");

const prof = join(tmpdir(), "board-" + Date.now());
mkdirSync(OUT, { recursive: true });
const br = spawn(BROWSER, ["--headless=new", "--remote-debugging-port=0", "--user-data-dir=" + prof,
  "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let ws, id = 0;
const wait = new Map();
async function connect() {
  for (let i = 0; i < 75 && !ws; i++) {
    try {
      const port = readFileSync(join(prof, "DevToolsActivePort"), "utf8").split("\n")[0].trim();
      const l = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const pg = l.find(t => t.type === "page");
      if (pg) ws = new WebSocket(pg.webSocketDebuggerUrl);
    } catch (e) {}
    if (!ws) await sleep(200);
  }
  if (!ws) throw new Error("браузер не отдал DevTools");
  await new Promise(r => ws.onopen = r);
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } };
}

const send = (method, params = {}) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

async function shot(name, w, h, dark, mobile) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: dark ? "dark" : "light" }] });
  await send("Page.navigate", { url: URL_ });
  await sleep(2000);
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(join(OUT, name + ".png"), Buffer.from(r.result.data, "base64"));
  console.log(name, "saved");
}

let code = 0;
try {
  await connect();
  await send("Page.enable");
  await send("Runtime.enable");
  await shot("board-1440x900-dark", 1440, 900, true, false);
  await shot("board-1440x900-light", 1440, 900, false, false);
  await shot("board-375x812-dark", 375, 812, true, true);
  await shot("board-375x812-light", 375, 812, false, true);
} catch (e) {
  console.error("ERROR:", e.message);
  code = 1;
}
finally {
  try { ws && ws.close(); } catch (e2) {}
  br.kill();
  srv.close();
  await sleep(500);
}
process.exit(code);
