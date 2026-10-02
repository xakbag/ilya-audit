// Тесты D5b: граф arch-data.json и честная логика потока (без DOM).
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const A = require("../arch.js");

const ROOT = path.join(__dirname, "..");
const g = JSON.parse(fs.readFileSync(path.join(ROOT, "arch-data.json"), "utf8"));
const st = JSON.parse(fs.readFileSync(path.join(ROOT, "status.json"), "utf8"));
const now = Date.parse(st.generated_at) + 60000;
const clone = d => JSON.parse(JSON.stringify(d));
const node = id => g.nodes.find(n => n.id === id);
const edge = (a, b) => g.edges.find(e => e.from === a && e.to === b);

test("граф: валиден, узлы не перекрываются и в пределах холста", () => {
  assert.deepEqual(A.validateGraph(g), []);
  const { w, h, node_w, node_h } = g.view;
  for (const n of g.nodes) assert.ok(n.x >= 0 && n.y >= 0 && n.x + node_w <= w && n.y + node_h <= h, n.id);
  for (const a of g.nodes) for (const b of g.nodes) if (a !== b)
    assert.ok(a.x + node_w <= b.x || b.x + node_w <= a.x || a.y + node_h <= b.y || b.y + node_h <= a.y, a.id + "/" + b.id);
});

test("граф: обязательные цепочки из задания", () => {
  for (const [a, b] of [["ollama", "controller"], ["controller", "gateway"], ["gateway", "core"], ["executor", "bridge"],
    ["bridge", "qa"], ["collector", "publisher"], ["publisher", "site"], ["restic", "gdrive"], ["win", "wsl"]]) assert.ok(edge(a, b), a + "→" + b);
  assert.ok(node("house2"));
  for (const k of new Set(g.nodes.map(n => n.card).filter(c => c && c !== A.GEN)))
    assert.ok(st.cards.some(c => c.key === k), "карточка " + k + " есть в status.json");
});

test("граф: без ПДн (нет e-mail, телефонов, адресов Tailscale)", () => {
  const txt = JSON.stringify(g);
  assert.doesNotMatch(txt, /@[a-z0-9-]+\.[a-z]/i);
  assert.doesNotMatch(txt, /\+?\d[\d\s()-]{9,}\d/);
  assert.doesNotMatch(txt, /100\.\d+\.\d+\.\d+/);
});

test("validateGraph ловит ошибки", () => {
  const b = clone(g); b.edges.push({ from: "core", to: "nope", label: "x", event: null });
  assert.match(A.validateGraph(b).join(), /несуществующему/);
  const c = clone(g); c.nodes[0].access = "WRITE";
  assert.match(A.validateGraph(c).join(), /доступ/);
  const d = clone(g); d.paths.push({ id: "bad", title: "x", nodes: ["ollama", "site"] });
  assert.match(A.validateGraph(d).join(), /не связаны/);
  assert.deepEqual(A.validateGraph(null), ["нет nodes/edges"]);
});

test("поток только по свежему результату (source=result)", () => {
  const W = g.flow_window_s;
  assert.equal(A.edgeFlow(edge("db", "collector"), st, now, W).flow, true);
  assert.equal(A.edgeFlow(edge("collector", "publisher"), st, now, W).flow, true);
  // самоотчёт контроллера — не событие
  assert.match(A.edgeFlow(edge("controller", "gateway"), st, now, W).why, /самоотчёт/);
  assert.equal(A.edgeFlow(edge("controller", "gateway"), st, now, W).flow, false);
  // результат шлюза 7,5 ч назад — нет потока
  assert.equal(A.edgeFlow(edge("gateway", "core"), st, now, W).flow, false);
  // событие не собирается
  assert.match(A.edgeFlow(edge("publisher", "site"), st, now, W).why, /нет потока/);
  // устаревший status.json гасит все потоки
  const late = now + 3 * 3600 * 1000;
  assert.equal(g.edges.filter(e => A.edgeFlow(e, st, late, W).flow).length, 0);
  // без status.json — потоков нет
  assert.equal(A.edgeFlow(edge("db", "collector"), null, now, W).flow, false);
});

test("статусы узлов: зелёный только с доказательством", () => {
  assert.equal(A.nodeState(node("db"), st, now).cls, "ok");
  assert.equal(A.nodeState(node("gateway"), st, now).cls, "fail");
  assert.equal(A.nodeState(node("controller"), st, now).cls, "warn");
  assert.equal(A.nodeState(node("core"), st, now).cls, "unknown");
  assert.equal(A.nodeState(node("ollama"), st, now).label, "Нет данных");
  assert.equal(typeof A.nodeState(node("qa"), st, now).note, "string");
  const s = clone(st); s.cards.find(c => c.key === "db").color = "green"; s.cards.find(c => c.key === "db").source = "self-report";
  assert.equal(A.nodeState(node("db"), s, now).cls, "unknown");
  assert.equal(A.nodeState(node("collector"), st, now + 3 * 3600e3).cls, "stale");
});

test("последнее действие: возраст растёт с момента выпуска файла", () => {
  const a = A.lastAction("db", st, now);
  assert.equal(a.age_s, 4 + 60);
  assert.equal(A.lastAction(A.GEN, st, now).age_s, 60);
  assert.equal(A.lastAction("nope", st, now).age_s, null);
});

test("путь задачи: все связи найдены, поиск, линии", () => {
  for (const p of g.paths) assert.ok(A.pathEdges(g, p.id).every(i => i >= 0), p.id);
  assert.deepEqual(A.pathEdges(g, "nope"), []);
  assert.deepEqual(A.searchNodes(g, "restic").map(n => n.id), ["restic"]);
  assert.ok(A.searchNodes(g, "шлюз").some(n => n.id === "gateway"));
  assert.deepEqual(A.searchNodes(g, "  "), []);
  const [x1, y1, x2, y2] = A.edgeLine(g, edge("ollama", "controller"));
  assert.equal(x1, 230); assert.equal(x2, 280); assert.equal(y1, y2);
  const c = A.counts(g, st, now);
  assert.equal(c.total, g.nodes.length); assert.equal(c.flow, 2);
  assert.equal(c.ok + c.warn + c.fail + c.unknown + c.stale, c.total);
});

test("index.html: вкладка подключена, CSP без внешних источников", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  for (const s of ['src="arch.js', 'href="arch.css', 'id="arch-svg"', 'id="arch-q"', 'id="arch-path"', 'id="arch-panel"'])
    assert.ok(html.includes(s), s);
  assert.doesNotMatch(html, /https?:\/\/(?!www\.w3\.org)/);
  const css = fs.readFileSync(path.join(ROOT, "arch.css"), "utf8");
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,6}\b/i, "цвета только из токенов");
});
