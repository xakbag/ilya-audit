// Скриншоты и замеры публичных страниц (только GET, формы не отправляются). Node 22+.
// node sites/tools/site-shot.mjs <pages.json> [папка=sites/shots]   pages.json: [{"name":"gl-home","url":"https://..."}]
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BROWSER = [process.env.BROWSER, "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe"]
  .filter(Boolean).find(p => existsSync(p));
if (!BROWSER) { console.error("Браузер не найден"); process.exit(2); }
// Доп. аргументы: --full --tag=<имя> --wait=<мс> (вместо переменных окружения)
for (const a of process.argv.slice(4)) { if (a === "--full") process.env.FULL = "1"; const m = a.match(/^--(tag|wait|views)=(.+)/); if (m) process.env[m[1].toUpperCase()] = m[2]; }
const PAGES = JSON.parse(readFileSync(process.argv[2], "utf8")), OUT = process.argv[3] || "sites/shots";
const VIEWS = (process.env.VIEWS || "d,m").split(",");
const prof = join(tmpdir(), "site-shot-" + Date.now()); mkdirSync(OUT, { recursive: true });
const br = spawn(BROWSER, ["--headless=new", "--remote-debugging-port=0", "--user-data-dir=" + prof, "--no-first-run",
  "--no-default-browser-check", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const wait = new Map();
async function connect() {
  for (let i = 0; i < 75 && !ws; i++) {
    try {
      const port = readFileSync(join(prof, "DevToolsActivePort"), "utf8").split("\n")[0].trim();
      const p = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === "page");
      if (p) ws = new WebSocket(p.webSocketDebuggerUrl);
    } catch {}
    if (!ws) await sleep(200);
  }
  if (!ws) throw new Error("нет DevTools");
  await new Promise(r => ws.onopen = r);
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } };
}
const send = (method, params = {}) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;

// Замеры на странице: вес ресурсов, картинки, тексты первого экрана, CTA, формы, контраст, мелкие цели, прокрутка.
const CHECK = `(()=>{
 const lum=c=>{const m=c.match(/[\\d.]+/g).map(Number);const f=v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4};return .2126*f(m[0])+.7152*f(m[1])+.0722*f(m[2])};
 const bgOf=e=>{for(;e;e=e.parentElement){const c=getComputedStyle(e).backgroundColor;const a=c.match(/[\\d.]+/g);if(a&&(a[3]===undefined||+a[3]>.5))return c}return 'rgb(255,255,255)'};
 const vis=e=>e.offsetParent!==null&&e.getBoundingClientRect().width>0;
 const res=performance.getEntriesByType('resource');const nav=performance.getEntriesByType('navigation')[0]||{};
 const byType={};for(const r of res){const t=r.initiatorType;byType[t]=byType[t]||{n:0,kb:0};byType[t].n++;byType[t].kb+=Math.round((r.transferSize||r.encodedBodySize||0)/1024)}
 const imgs=[...document.images].map(i=>({src:i.currentSrc.split('/').pop().slice(0,50),nw:i.naturalWidth,nh:i.naturalHeight,w:Math.round(i.getBoundingClientRect().width),alt:i.alt.slice(0,40),lazy:i.loading,kb:Math.round(((res.find(r=>r.name===i.currentSrc)||{}).encodedBodySize||0)/1024)}));
 const bgImgs=[...document.querySelectorAll('*')].map(e=>getComputedStyle(e).backgroundImage).filter(b=>b&&b!=='none'&&b.includes('url')).length;
 const low=[];for(const e of document.querySelectorAll('p,a,button,span,li,h1,h2,h3,label,td,small,div')){if(!vis(e)||![...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))continue;const s=getComputedStyle(e);if(s.color.includes('rgba')&&+s.color.match(/[\\d.]+/g)[3]<.5)continue;const a=lum(s.color),b=lum(bgOf(e));const cr=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);const big=parseFloat(s.fontSize)>=24||(parseFloat(s.fontSize)>=18.6&&+s.fontWeight>=700);if(cr<(big?3:4.5))low.push([e.tagName,e.textContent.trim().slice(0,24),cr.toFixed(2),s.color,b])}
 const small=innerWidth<=620?[...document.querySelectorAll('a,button,input,select,summary')].filter(vis).map(e=>{const r=e.getBoundingClientRect();return [e.tagName,(e.textContent||e.placeholder||e.name||'').trim().slice(0,18),Math.round(r.width),Math.round(r.height)]}).filter(([,,w,h])=>h<40||w<40):[];
 const fonts=[...new Set([...document.querySelectorAll('h1,h2,p,a,button')].map(e=>getComputedStyle(e).fontFamily.split(',')[0]))];
 const sizes={};for(const t of ['h1','h2','h3','p','body']){const e=document.querySelector(t);if(e)sizes[t]=getComputedStyle(e).fontSize+'/'+getComputedStyle(e).fontWeight+'/'+getComputedStyle(e).color}
 const ctas=[...document.querySelectorAll('a,button,input[type=submit]')].filter(vis).filter(e=>/позвон|звон|заявк|заказ|купить|корзин|расч|калькул|whatsapp|telegram|написать|связ|консульт|оформ|доставк|цен/i.test(e.textContent+e.value+e.href)).map(e=>{const r=e.getBoundingClientRect();return [e.tagName,(e.textContent||e.value).trim().replace(/\\s+/g,' ').slice(0,30),(e.getAttribute('href')||'').slice(0,40),Math.round(r.top),Math.round(r.width)+'x'+Math.round(r.height),getComputedStyle(e).backgroundColor]});
 const forms=[...document.forms].map(f=>({action:(f.getAttribute('action')||'').slice(0,40),fields:[...f.elements].filter(x=>x.type!=='hidden').map(x=>(x.type||x.tagName)+':'+(x.name||'')+(x.required?'*':'')+(x.labels&&x.labels.length?'[L]':'')).join(' '),consent:/соглас|персональн|152/i.test(f.textContent)}));
 const fold=[...document.querySelectorAll('h1,h2,h3,p,a,button,li,span,strong,b')].filter(e=>{const r=e.getBoundingClientRect();return vis(e)&&r.top<innerHeight&&r.bottom>0&&e.children.length===0&&e.textContent.trim().length>2}).map(e=>e.textContent.trim().replace(/\\s+/g,' ').slice(0,60));
 const links=[...document.querySelectorAll('a[href]')].filter(a=>/корзин|cart|заявк|контакт|kontak|contact|оформ|калькул|расч|отзыв|сертиф|доставк|о нас|o-nas|about|оплат|объект|портфол|работ/i.test(a.textContent+a.href)).map(a=>a.textContent.trim().slice(0,20)+'→'+a.getAttribute('href').slice(0,50));
 const focusCss=[...document.styleSheets].some(s=>{try{return [...s.cssRules].some(r=>/:focus/.test(r.selectorText||''))}catch{return false}});
 const outlineNone=[...document.styleSheets].some(s=>{try{return [...s.cssRules].some(r=>/:focus/.test(r.selectorText||'')&&/outline:\\s*(none|0)/.test(r.cssText))}catch{return false}});
 return {title:document.title,desc:(document.querySelector('meta[name=description]')||{}).content,viewport:(document.querySelector('meta[name=viewport]')||{}).content,
  h1:[...document.querySelectorAll('h1')].map(e=>e.textContent.trim().slice(0,90)),h2:[...document.querySelectorAll('h2')].map(e=>e.textContent.trim().slice(0,50)).slice(0,20),
  docH:document.documentElement.scrollHeight,hscroll:document.documentElement.scrollWidth>innerWidth,
  ttfb:Math.round(nav.responseStart||0),dcl:Math.round(nav.domContentLoadedEventEnd||0),load:Math.round(nav.loadEventEnd||0),htmlKb:Math.round((nav.transferSize||0)/1024),
  totalKb:Math.round(res.reduce((s,r)=>s+(r.transferSize||r.encodedBodySize||0),0)/1024)+Math.round((nav.transferSize||0)/1024),nRes:res.length,byType,
  lcp:window.__lcp||null,cls:window.__cls||0,imgs:imgs.slice(0,40),nImgs:imgs.length,bgImgs,fonts,sizes,ctas:ctas.slice(0,25),forms,fold:fold.slice(0,45),links:[...new Set(links)].slice(0,30),
  tel:[...document.querySelectorAll('a[href^="tel:"]')].length,focusCss,outlineNone,low:low.slice(0,15),nLow:low.length,small:small.slice(0,15),nSmall:small.length,
  jsonld:[...document.querySelectorAll('script[type="application/ld+json"]')].map(s=>{try{return JSON.parse(s.textContent)['@type']}catch{return 'bad'}}),
  ext:[...new Set(res.map(r=>new URL(r.name).host).filter(h=>h!==location.host))]}})()`;
const OBS = `window.__cls=0;new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lcp=Math.round(e.startTime)}).observe({type:'largest-contentful-paint',buffered:true});
new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__cls+=e.value}).observe({type:'layout-shift',buffered:true});`;

async function shot(p, v) {
  const mob = v === "m", w = mob ? 375 : 1440, h = mob ? 812 : 900;
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mob ? 2 : 1, mobile: mob });
  await send("Emulation.setUserAgentOverride", { userAgent: mob
    ? "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36"
    : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36" });
  await send("Network.clearBrowserCache");
  await send("Page.navigate", { url: p.url }); await sleep(+(process.env.WAIT || 5000));
  // p.pre — список JS-выражений (клики по кнопкам «в запрос»/«открыть форму»); формы НЕ отправляются
  for (const js of p.pre || []) { const r = await ev(js); if (r !== undefined) console.log("  pre:", JSON.stringify(r).slice(0, 300)); await sleep(1500); }
  const name = `${p.name}-${w}x${h}`;
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, name + ".png"), Buffer.from(r.result.data, "base64"));
  const m = await ev(CHECK);
  if (process.env.FULL && m) { // длинный снимок (ограничен 6000 px), JPEG; сначала прокрутка для lazy-картинок
    await ev(`(async()=>{for(let y=0;y<document.documentElement.scrollHeight;y+=innerHeight/2){scrollTo(0,y);await new Promise(r=>setTimeout(r,250))}scrollTo(0,0);await new Promise(r=>setTimeout(r,1200))})()`);
    m.brokenImgs = await ev(`[...document.images].filter(i=>i.complete&&i.naturalWidth===0&&i.getAttribute('src')).map(i=>i.getAttribute('src').slice(-50))`);
    m.unloadedImgs = await ev(`[...document.images].filter(i=>!i.currentSrc).length`);
    const fh = Math.min(m.docH, 6000);
    const f = await send("Page.captureScreenshot", { format: "jpeg", quality: 60, captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: fh, scale: 1 } });
    if (f.result) writeFileSync(join(OUT, name + "-full.jpg"), Buffer.from(f.result.data, "base64"));
  }
  return { name, url: p.url, view: v, ...m };
}

let code = 0; const report = [];
try {
  await connect(); await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: OBS });
  for (const p of PAGES) for (const v of VIEWS) {
    try { const m = await shot(p, v); report.push(m); console.log("OK", m.name, m.totalKb + "KB", "load", m.load, "lcp", m.lcp); }
    catch (e) { console.log("ERR", p.name, v, e.message); }
  }
} catch (e) { console.error("ОШИБКА:", e.message); code = 1; }
finally {
  writeFileSync(join(OUT, (process.env.TAG || "metrics") + ".json"), JSON.stringify(report, null, 1));
  try { ws && ws.close(); } catch {}
  br.kill(); await sleep(500); try { rmSync(prof, { recursive: true, force: true }); } catch {}
}
process.exit(code);
