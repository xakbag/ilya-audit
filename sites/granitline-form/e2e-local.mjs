// Сквозной тест формы на ЛОКАЛЬНОЙ копии granitline.ru (php -S + transport=file, писем наружу нет).
// node e2e-local.mjs <php.exe> <папка-копии> <папка-скриншотов вне git>
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [PHP, MIRROR, SHOTS] = process.argv.slice(2);
const BROWSER = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe"]
  .find(p => existsSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const port = 18500 + Math.floor(Math.random() * 400);
const tmp = join(tmpdir(), "gl-e2e-" + Date.now()), outbox = join(tmp, "outbox");
mkdirSync(outbox, { recursive: true }); mkdirSync(join(tmp, "state")); mkdirSync(SHOTS, { recursive: true });
const cfg = join(tmp, "cfg.php");
writeFileSync(cfg, `<?php return ['enabled'=>true,'transport'=>'file','recipient'=>'owner@example.invalid',
'sender'=>'site@example.invalid','allowed_origins'=>['http://127.0.0.1:${port}'],'ip_salt'=>'t','ip_max'=>5,
'ip_window_sec'=>3600,'day_max'=>100,'state_dir'=>'${join(tmp, "state").replace(/\\/g, "/")}',
'outbox_dir'=>'${outbox.replace(/\\/g, "/")}'];`);
const srv = spawn(PHP, ["-S", `127.0.0.1:${port}`, "-t", MIRROR], { env: { ...process.env, GL_DELIVERY_CONFIG: cfg }, stdio: "ignore" });
const prof = join(tmp, "prof");
const br = spawn(BROWSER, ["--headless=new", "--remote-debugging-port=0", "--user-data-dir=" + prof, "--no-first-run",
  "--window-size=390,844", "about:blank"], { stdio: "ignore" });
let ws, id = 0; const wait = new Map();
for (let i = 0; i < 75 && !ws; i++) {
  try {
    const p = readFileSync(join(prof, "DevToolsActivePort"), "utf8").split("\n")[0].trim();
    const t = (await (await fetch(`http://127.0.0.1:${p}/json`)).json()).find(t => t.type === "page");
    ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  } catch { await sleep(200); }
}
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m.result); wait.delete(m.id); } };
const cdp = (method, params = {}) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async expr => (await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.value;
const shot = async name => writeFileSync(join(SHOTS, name), Buffer.from((await cdp("Page.captureScreenshot", { format: "png" })).data, "base64"));

const results = [];
try {
  await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp("Page.navigate", { url: `http://127.0.0.1:${port}/` }); await sleep(3500);
  await js(`[...document.querySelectorAll('button')].find(b=>/Рассчитать/.test(b.textContent))?.click()`); await sleep(800);
  const st = await js(`(()=>{const f=document.querySelector('form');const b=f?.querySelector('.form-submit');
    return {form:!!f, note:!!f?.querySelector('.availability-note'), btn:b?.textContent, disabled:b?.disabled}})()`);
  results.push(["форма включена (нет плашки, кнопка активна)", st.form && !st.note && !st.disabled, JSON.stringify(st)]);
  await shot("gl-form-local-1-open.png");
  // Заполняет телефон и комментарий (оба required), согласие — по флагу.
  const fill = consent => js(`(()=>{const f=document.querySelector('form');
    const si=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
    const st=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
    const i=f.querySelector('input[name=phone]');si.call(i,'+7 (999) 000-00-00');i.dispatchEvent(new Event('input',{bubbles:true}));
    const c=f.querySelector('textarea[name=comment]');st.call(c,'Тест: двор 60 м2');c.dispatchEvent(new Event('input',{bubbles:true}));
    const cb=f.querySelector('[role=checkbox]');if(${consent}&&cb&&cb.getAttribute('aria-checked')!=='true')cb.click()})()`);
  const submit = () => js(`document.querySelector('form .form-submit').click()`);
  // Без согласия → ошибка, письма нет
  await fill(false); await sleep(300); await submit(); await sleep(800);
  const e1 = await js(`document.querySelector('.form-error')?.textContent||''`);
  results.push(["без согласия: ошибка, писем 0", /согласие/i.test(e1) && readdirSync(outbox).length === 0, e1]);
  // С согласием → «Заявка принята» и ровно одно письмо
  await fill(true); await sleep(300); await submit(); await sleep(2500);
  const ok1 = await js(`document.querySelector('.form-success')?.innerText||''`);
  const n = readdirSync(outbox).length;
  results.push(["с согласием: «Заявка принята», письмо 1", /принята/.test(ok1) && n === 1, `outbox=${n}`]);
  await shot("gl-form-local-2-sent.png");
  // Сбой доставки → честная ошибка, без «принята»
  writeFileSync(cfg, readFileSync(cfg, "utf8").replace(/'outbox_dir'=>'[^']*'/, "'outbox_dir'=>'/nonexistent'"));
  await cdp("Page.reload"); await sleep(3500);
  await js(`[...document.querySelectorAll('button')].find(b=>/Рассчитать/.test(b.textContent))?.click()`); await sleep(800);
  await fill(true); await sleep(300); await submit(); await sleep(2500);
  const e2 = await js(`document.querySelector('.form-error')?.textContent||''`);
  const succ2 = await js(`!!document.querySelector('.form-success')`);
  results.push(["сбой доставки: честная ошибка, без «принята»", /Не удалось/.test(e2) && !succ2 && readdirSync(outbox).length === 1, e2]);
  await shot("gl-form-local-3-error.png");
} finally {
  ws?.close(); br.kill(); srv.kill(); await sleep(500);
  try { rmSync(tmp, { recursive: true, force: true }); } catch {}
}
let fail = 0;
for (const [name, ok, info] of results) { if (!ok) fail++; console.log((ok ? "OK   " : "FAIL ") + name + "  " + info); }
console.log(`Итого: ${results.length - fail} OK, ${fail} FAIL`); process.exit(fail ? 1 : 0);
