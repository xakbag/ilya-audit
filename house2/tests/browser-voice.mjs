// Headless Edge/Chrome через DevTools Protocol (как dashboard/redesign/final/tools/shot.mjs, без пакетов).
// Окно «Новая задача»: выделение текста с отпусканием на фоне не закрывает окно, клик по фону закрывает;
// диктовка с подменённым SpeechRecognition: перезапуск после onend, кнопка Стоп.
// node house2/tests/browser-voice.mjs [html=house2/deploy/index.html]   BROWSER=<путь>
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const BROWSER = [process.env.BROWSER, "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe"]
  .filter(Boolean).find(p => existsSync(p));
if (!BROWSER) { console.error("Браузер не найден: задайте BROWSER=<путь>"); process.exit(2); }
const PAGE = pathToFileURL(resolve(process.argv[2] || "house2/deploy/index.html")).href;
const prof = join(tmpdir(), "h2-voice-" + Date.now()); mkdirSync(prof, { recursive: true });
const br = spawn(BROWSER, ["--headless=new", "--remote-debugging-port=0", "--user-data-dir=" + prof, "--no-first-run",
  "--no-default-browser-check", "about:blank"], { stdio: "ignore" });
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
if (!ws) { console.error("браузер не отдал DevTools"); br.kill(); process.exit(2); }
await new Promise(r => ws.onopen = r);
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
const mouse = (type, x, y) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });

// Подмена распознавания до загрузки страницы: экземпляры в window.__sr, события дергаем из теста
const FAKE = `(()=>{window.__sr=[];class SR{constructor(){this.n=__sr.push(this)}start(){this.on=1;setTimeout(()=>this.onstart&&this.onstart())}
 stop(){this.on=0;setTimeout(()=>this.onend&&this.onend())}abort(){this.stop()}}
 window.SpeechRecognition=SR;window.webkitSpeechRecognition=SR;
 window.__say=(t,fin)=>{const r=__sr[__sr.length-1];const x=[{transcript:t}];x.isFinal=fin;r.onresult({resultIndex:0,results:[x]})}})()`;
await send("Page.enable"); await send("Runtime.enable");
await send("Page.addScriptToEvaluateOnNewDocument", { source: FAKE });

const fails = []; const ok = (c, m) => { console.log((c ? "OK   " : "FAIL ") + m); if (!c) fails.push(m); };
for (const [w, h, mob] of [[375, 812, true], [1440, 900, false]]) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mob ? 2 : 1, mobile: mob });
  await send("Page.navigate", { url: PAGE }); await sleep(300);
  for (let i = 0; i < 50 && !(await ev(`document.readyState==='complete'&&!!document.getElementById('addTask')&&typeof makeDictation==='function'`)); i++) await sleep(200);
  const tag = `${w}x${h}:`;
  const open = () => ev(`(document.getElementById('newTaskDlg').open||document.getElementById('addTask').click(),document.getElementById('newTaskDlg').open)`);
  ok(await open(), tag + " окно «Новая задача» открылось");
  // Точки: внутри поля ввода и на фоне (верхний левый угол, вне окна)
  const r = await ev(`(()=>{const b=document.getElementById('taskInput').getBoundingClientRect(),d=document.getElementById('newTaskDlg').getBoundingClientRect();
    document.getElementById('taskInput').value='Роман, плинтус в прихожей до пятницы';return {x:b.left+20,y:b.top+12,bx:4,by:Math.max(4,d.top/2)}})()`);
  // 1) выделение: нажать в поле → протянуть → отпустить на фоне
  await mouse("mousePressed", r.x, r.y); await mouse("mouseMoved", (r.x + r.bx) / 2, (r.y + r.by) / 2);
  await mouse("mouseMoved", r.bx, r.by); await mouse("mouseReleased", r.bx, r.by); await sleep(200);
  ok(await ev(`document.getElementById('newTaskDlg').open`), tag + " mousedown в поле → mouseup на фоне: окно осталось");
  // 2) клик по фону
  await ev(`getSelection().removeAllRanges()`);
  await mouse("mousePressed", r.bx, r.by); await mouse("mouseReleased", r.bx, r.by); await sleep(200);
  ok(!(await ev(`document.getElementById('newTaskDlg').open`)), tag + " клик по фону: окно закрылось");

  // 3) диктовка с подменённым распознаванием
  await open(); await ev(`document.getElementById('taskInput').value='Роман,'`);
  await ev(`document.getElementById('voiceBtn').click()`);
  for (let i = 0; i < 25 && !(await ev(`/Слушаю/.test(document.getElementById('voiceStatus').textContent)`)); i++) await sleep(100);
  const s1 = await ev(`({n:__sr.length,c:__sr[0]&&__sr[0].continuous,b:document.getElementById('voiceBtn').textContent,s:document.getElementById('voiceStatus').textContent})`);
  ok(s1.n === 1 && s1.c === true && /Стоп/.test(s1.b), tag + ` старт: continuous=${s1.c}, кнопка «${s1.b}»`);
  await ev(`__say('плинтус в прихожей',true)`);
  await ev(`__sr[0].onend()`); // сервис сам оборвал сессию
  for (let i = 0; i < 30 && (await ev(`__sr.length`)) < 2; i++) await sleep(100); await sleep(100);
  await ev(`__say('до пятницы',true)`);
  const s2 = await ev(`({n:__sr.length,v:document.getElementById('taskInput').value})`);
  ok(s2.n === 2 && s2.v === "Роман, плинтус в прихожей до пятницы", tag + ` onend → перезапуск (${s2.n} сессии), текст: «${s2.v}»`);
  await ev(`document.getElementById('voiceBtn').click()`); await sleep(600);
  const s3 = await ev(`({n:__sr.length,b:document.getElementById('voiceBtn').textContent,s:document.getElementById('voiceStatus').textContent})`);
  ok(s3.n === 2 && !/Стоп/.test(s3.b) && /Готово/.test(s3.s), tag + ` стоп: без перезапуска, статус «${s3.s}»`);
  await ev(`document.getElementById('newTaskDlg').close()`);
}
const errs = await ev(`(window.__errs||[]).length`);
ws.close(); br.kill(); await sleep(500); try { rmSync(prof, { recursive: true, force: true }); } catch {}
console.log(fails.length ? `ИТОГ: ${fails.length} FAIL` : "ИТОГ: все проверки OK");
process.exit(fails.length ? 1 : 0);
