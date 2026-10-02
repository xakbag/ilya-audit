// Тесты итоговой доски D5a: логика (без DOM) и дымовой рендер monitor.js на заглушке DOM.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const L = require("../logic.js");

const ROOT = path.join(__dirname, "..");
const live = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "live-status.json"), "utf8"));
const fresh = Date.parse(live.generated_at) + 30000;
const clone = d => JSON.parse(JSON.stringify(d));

// ---------- логика ----------
test("verdict: зелёный только с доказательством", () => {
  assert.equal(L.verdict({ color: "green", source: "result" }).cls, "ok");
  assert.equal(L.verdict({ color: "green", source: "self-report" }).cls, "unknown");
  assert.equal(L.verdict({ color: "green" }).label, "Не подтверждено");
  assert.equal(L.verdict({ color: "gray", source: "result" }).cls, "unknown");
  assert.equal(L.verdict({ color: "green", source: "result" }, { stale: true }).cls, "stale");
  assert.equal(L.verdict({ color: "weird" }).cls, "unknown");
});

test("группы: пауза, проверка, не подтверждено, сейчас", () => {
  const cards = [
    { key: "a", color: "red", source: "result" },
    { key: "b", color: "green", source: "result", wait_reason: "awaiting_external_review(2)" },
    { key: "c", color: "gray", source: "process" },
    { key: "d", color: "green", source: "process" }
  ];
  const g = L.grouped(cards, { stale: false });
  assert.deepEqual(Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.map(x => x.key)])),
    { now: ["d"], pause: ["a"], review: ["b"], unconfirmed: ["c"] });
  // устаревшие данные никогда не попадают в «Сейчас делаем»
  assert.equal(L.grouped(cards, { stale: true }).now.length, 0);
});

test("summary: живой status.json — фраза-итог и честная оговорка", () => {
  const s = L.summary(live, fresh);
  assert.match(s.head, /на паузе или с ошибкой/);
  assert.match(s.checked, /не значит, что все задачи завершены/);
  assert.match(s.ai, /Локальный ИИ: 0 выполняется, \d+ ждут, режим LIGHT/);
  assert.equal(s.counts.pause + s.counts.now + s.counts.review + s.counts.unconfirmed, live.cards.length);
});

test("summary: устаревшие данные и пусто", () => {
  assert.match(L.summary(live, Date.parse(live.generated_at) + 3600e3).head, /не обновляется/);
  assert.equal(L.summary({ generated_at: live.generated_at, cards: [] }, fresh).head, "Данных о работе нет");
});

test("plural по-русски", () => {
  assert.equal(L.plural(1, "а", "б", "в"), "а");
  assert.equal(L.plural(3, "а", "б", "в"), "б");
  assert.equal(L.plural(11, "а", "б", "в"), "в");
  assert.equal(L.plural(22, "а", "б", "в"), "б");
  assert.equal(L.plural(25, "а", "б", "в"), "в");
});

test("resources: есть данные — значение и источник; нет — «нет данных» и нужное поле", () => {
  const r = Object.fromEntries(L.resources(live).map(x => [x.id, x]));
  assert.equal(r.wsl.have, true);
  assert.match(r.wsl.value, /из/);
  assert.match(r.wsl.source, /^memory/);
  assert.equal(r.queue.have, true);
  assert.equal(r.mode.value, "LIGHT");
  for (const id of ["cpu", "gpu", "vram", "disk"]) {
    assert.equal(r[id].have, false);
    assert.equal(r[id].value, "нет данных");
    assert.match(r[id].hint, /resources\./);
  }
  // будущая карточка resources включает плитки без правок логики
  const d = clone(live);
  d.cards.push({ key: "resources", title: "Ресурсы", source: "process", color: "green",
    detail: { cpu_pct: 37, gpu_pct: 5, vram_used_mib: 410, vram_total_mib: 16384, disk_free_gib: 120 } });
  const r2 = Object.fromEntries(L.resources(d).map(x => [x.id, x]));
  assert.equal(r2.cpu.value, "37 %");
  assert.equal(r2.disk.value, "120 ГБ");
  assert.ok(r2.vram.pct > 0 && r2.vram.pct < 0.1);
});

test("whyNotReady: известная причина, неизвестная, зелёный без причины", () => {
  const w = L.whyNotReady({ key: "gateway", color: "red", wait_reason: "waiting_for_heavy" }, live.cards);
  assert.match(w.text, /HEAVY/);
  assert.equal(w.known, true);
  assert.equal(L.whyNotReady({ key: "x", color: "yellow", wait_reason: "zzz" }, []).known, false);
  assert.equal(L.whyNotReady({ key: "db", color: "green" }, []), null);
  assert.match(L.whyNotReady({ key: "core", color: "gray" }, []).text, /Нет метрики/);
});

test("chips и поиск", () => {
  const ch = L.chips(live.cards);
  assert.equal(ch[0].id, "all");
  assert.equal(ch[0].n, live.cards.length);
  assert.ok(ch.every(c => c.n > 0));
  assert.deepEqual(L.search(live.cards, "шлюз").map(c => c.key), ["gateway"]);
  assert.equal(L.search(live.cards, "").length, live.cards.length);
});

// ---------- рендер на заглушке DOM ----------
function makeEl(tag) {
  const e = { tagName: tag, children: [], attrs: {}, listeners: {}, className: "", hidden: false, value: "", id: "", _text: "",
    style: {}, type: "", open: false,
    get textContent() { return this._text + this.children.map(c => typeof c === "string" ? c : c.textContent).join(""); },
    set textContent(v) { this._text = String(v); this.children = []; },
    appendChild(c) { this.children.push(c); return c; }, append(...c) { this.children.push(...c); },
    replaceChildren(...c) { this.children = c; this._text = ""; },
    setAttribute(k, v) { this.attrs[k] = String(v); }, removeAttribute(k) { delete this.attrs[k]; },
    addEventListener(t, f) { (this.listeners[t] ||= []).push(f); },
    fire(t) { (this.listeners[t] || []).forEach(f => f({ target: this, preventDefault() {} })); },
    select() {}, classList: { add() {} } };
  return e;
}
function find(e, pred, out = []) { if (e && typeof e === "object") { if (pred(e)) out.push(e); (e.children || []).forEach(c => find(c, pred, out)); } return out; }

async function run(responder, nowShift) {
  const ids = {};
  const document = { readyState: "complete", hidden: false, addEventListener() {}, documentElement: makeEl("html"),
    getElementById: id => (ids[id] ||= Object.assign(makeEl("div"), { id })),
    createElement: makeEl, createElementNS: (ns, t) => makeEl(t) };
  const mem = {};
  const localStorage = { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); } };
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { super(...(a.length ? a : [RealDate.parse(live.generated_at) + nowShift])); }
    static now() { return RealDate.parse(live.generated_at) + nowShift; }
  }
  const ctx = { document, localStorage, console, Date: FakeDate, URL, AbortController, setTimeout: (f, ms) => ms < 1000 ? setTimeout(f, ms) : 0,
    clearTimeout, setInterval: () => 0, location: { protocol: "file:" },
    navigator: { clipboard: { writeText: async t => { ctx.copied = t; } } }, fetch: responder };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  for (const f of ["logic.js", "monitor.js"]) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
  await new Promise(r => setTimeout(r, 30));
  return { ids, ctx, mem };
}
const ok = d => async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => clone(d) });

test("рендер: живые данные — итог, плитки, группы, подробности, источник", async () => {
  const { ids, mem } = await run(ok(live), 30000);
  assert.match(ids["ov-head"].textContent, /на паузе или с ошибкой/);
  assert.match(ids["ov-honest"].textContent, /не значит/);
  assert.match(ids.upd.textContent, /^данные от \d\d:\d\d/);
  assert.equal(ids.banner.hidden, true);
  assert.equal(find(ids.tiles, e => /\btile\b/.test(e.className)).length, L.RESOURCE_TILES.length);
  const secs = find(ids.groups, e => e.tagName === "section").map(s => s.attrs["aria-label"]);
  assert.ok(secs.includes("Сейчас делаем") && secs.includes("Техническая пауза или ошибка"));
  const cards = find(ids.groups, e => e.tagName === "article");
  assert.equal(cards.length, live.cards.length);
  assert.ok(cards.every(c => find(c, e => e.className === "provenance").length === 1));
  assert.ok(cards.every(c => find(c, e => e.tagName === "details").length === 1));
  assert.ok(find(ids.groups, e => e.className === "why").length >= 2);
  assert.ok(mem["ilya-board-history-v1"]);
});

test("рендер: фильтр-чип и копирование для Claude", async () => {
  const { ids, ctx } = await run(ok(live), 30000);
  const qa = find(ids.chips, e => e.tagName === "button" && /^Качество/.test(e.textContent))[0];
  qa.fire("click");
  const keys = find(ids.groups, e => e.tagName === "article").map(c => c.id);
  assert.ok(keys.length > 0 && keys.every(k => ["card-qa", "card-executor", "card-qa_bridge"].includes(k)));
  ids.copy.fire("click"); await new Promise(r => setTimeout(r, 10));
  assert.match(ctx.copied, /^Доска ILYA CORE/);
});

test("рендер: устаревшие данные — баннер, «Сейчас делаем» пусто", async () => {
  const { ids } = await run(ok(live), 3600e3);
  assert.equal(ids.banner.hidden, false);
  assert.match(ids.banner.className, /stale/);
  const now = find(ids.groups, e => e.tagName === "section" && e.attrs["aria-label"] === "Сейчас делаем")[0];
  assert.equal(find(now, e => e.tagName === "article").length, 0);
});

test("рендер: HTTP 503 и не-JSON — ошибка без падения", async () => {
  let r = await run(async () => ({ ok: false, status: 503 }), 0);
  assert.match(r.ids.banner.textContent, /HTTP 503/);
  r = await run(async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => { throw new SyntaxError("x"); } }), 0);
  assert.match(r.ids.banner.textContent, /не JSON/);
});

test("рендер: офлайн-копия от service worker", async () => {
  const { ids } = await run(async () => ({ ok: true, status: 200, headers: { get: k => k === "X-Board-Offline" ? "1" : null }, json: async () => clone(live) }), 30000);
  assert.match(ids.banner.textContent, /Нет связи/);
});

test("безопасность: нет innerHTML/eval/внешних URL, CSP self в index.html", () => {
  for (const f of ["logic.js", "monitor.js", "sw.js"]) {
    const s = fs.readFileSync(path.join(ROOT, f), "utf8");
    assert.doesNotMatch(s, /innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function/, f);
    assert.doesNotMatch(s.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, ""), /https?:\/\//, f);
  }
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.match(html, /script-src 'self'/);
  assert.doesNotMatch(html, /<script>|\son\w+="|https?:\/\/(?!www\.w3)/);
  const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  const shell = sw.match(/SHELL = (\[[^\]]+\])/);  // step99c: sw.js — сброс без оболочки
  for (const f of shell ? JSON.parse(shell[1].replace(/\s+/g, " ")) : []) {
    if (f !== "./") assert.ok(fs.existsSync(path.join(ROOT, f)), "SW оболочка: " + f);
  }
});
