// Вкладка «Архитектура» (D5b): граф компонентов из arch-data.json + статусы из status.json.
// Без библиотек: SVG + CSS. Поток на связи — только по реальному событию (source=result, свежее окна).
// Логика без DOM экспортируется для тестов (node), DOM-часть запускается только в браузере.
(function (root, factory) {
  const api = factory(root.BoardLogic || (typeof require === "function" ? require("./logic.js") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  else { root.ArchLogic = api; if (root.document) api.boot(root); }
})(typeof self !== "undefined" ? self : this, function (L) {
  "use strict";

  const ACCESS = { READ: "READ — только чтение", PREPARE: "PREPARE — готовит черновик, применяет человек" };
  const GEN = "_generated"; // псевдо-карточка: время выпуска status.json коллектором

  // ---------- логика ----------
  function validateGraph(g) {
    const err = [];
    if (!g || !Array.isArray(g.nodes) || !Array.isArray(g.edges)) return ["нет nodes/edges"];
    const ids = new Set();
    for (const n of g.nodes) {
      if (!n.id || ids.has(n.id)) err.push("дубль или пустой id: " + n.id);
      ids.add(n.id);
      if (!n.title || !n.place || !n.check) err.push("неполный узел: " + n.id);
      if (!ACCESS[n.access]) err.push("неизвестный доступ у " + n.id + ": " + n.access);
      if (g.groups && !g.groups[n.group]) err.push("неизвестная группа у " + n.id);
    }
    for (const e of g.edges) if (!ids.has(e.from) || !ids.has(e.to)) err.push("связь к несуществующему узлу: " + e.from + "→" + e.to);
    for (const p of g.paths || []) {
      for (const id of p.nodes) if (!ids.has(id)) err.push("путь " + p.id + ": нет узла " + id);
      if (pathEdges(g, p.id).some(i => i < 0)) err.push("путь " + p.id + ": соседние узлы не связаны");
    }
    return err;
  }

  function cardOf(status, key) {
    return status && Array.isArray(status.cards) ? status.cards.find(c => c.key === key) || null : null;
  }

  // Время и возраст последнего действия по карточке; для _generated — выпуск status.json.
  function lastAction(key, status, nowMs) {
    if (!status || !key) return { at: null, age_s: null, source: "unknown" };
    if (key === GEN) {
      const t = Date.parse(status.generated_at);
      return Number.isFinite(t) ? { at: status.generated_at, age_s: Math.max(0, Math.round((nowMs - t) / 1000)), source: "result" }
        : { at: null, age_s: null, source: "unknown" };
    }
    const c = cardOf(status, key);
    if (!c) return { at: null, age_s: null, source: "unknown" };
    return { at: c.last_useful_result || null, age_s: L.effectiveAge(c, status.generated_at, nowMs), source: c.source || "unknown" };
  }

  // Статус узла в терминах легенды: ok / warn / fail / unknown / stale.
  function nodeState(node, status, nowMs) {
    const st = status ? L.staleness(status.generated_at, nowMs) : { stale: true };
    const last = lastAction(node.card, status, nowMs);
    if (!node.card) return { cls: "unknown", label: "Нет данных", note: "в status.json нет карточки этого компонента", last };
    if (!status) return { cls: "unknown", label: "Нет данных", note: "status.json не загружен", last };
    if (node.card === GEN) {
      return st.stale ? { cls: "stale", label: "Нет свежих данных", note: st.reason, last }
        : { cls: "ok", label: "Работает — есть результат", note: "status.json выпущен " + L.fmtAge(last.age_s), last };
    }
    const c = cardOf(status, node.card);
    if (!c) return { cls: "unknown", label: "Нет данных", note: "карточка " + node.card + " отсутствует", last };
    const v = L.verdict(c, st);
    return { cls: v.cls, label: v.label, note: c.wait_reason ? (L.explainWait(c.wait_reason) || {}).text || c.wait_reason : null, last };
  }

  // Поток рисуем только при доказанном недавнем событии.
  function edgeFlow(edge, status, nowMs, windowS) {
    if (!edge.event) return { flow: false, why: "событие не собирается — нет потока" };
    if (!status) return { flow: false, why: "status.json не загружен" };
    if (L.staleness(status.generated_at, nowMs).stale) return { flow: false, why: "данные устарели" };
    const a = lastAction(edge.event, status, nowMs);
    if (a.source !== "result") return { flow: false, why: a.source === "unknown" ? "нет данных" : "источник «" + (L.SOURCE[a.source] || a.source) + "» — не событие" };
    if (a.age_s == null) return { flow: false, why: "нет времени результата" };
    if (a.age_s > windowS) return { flow: false, why: "последний результат " + L.fmtAge(a.age_s) };
    return { flow: true, why: "результат " + L.fmtAge(a.age_s) };
  }

  // Индексы связей вдоль пути (связь в любую сторону); -1 — разрыв.
  function pathEdges(g, pathId) {
    const p = (g.paths || []).find(x => x.id === pathId);
    if (!p) return [];
    const out = [];
    for (let i = 0; i + 1 < p.nodes.length; i++) {
      const a = p.nodes[i], b = p.nodes[i + 1];
      out.push(g.edges.findIndex(e => (e.from === a && e.to === b) || (e.from === b && e.to === a)));
    }
    return out;
  }

  function searchNodes(g, q) {
    const s = String(q || "").trim().toLowerCase();
    if (!s) return [];
    return g.nodes.filter(n => [n.id, n.title, n.role, n.place, (g.groups || {})[n.group]].join(" ").toLowerCase().includes(s));
  }

  function linksOf(g, id) { return g.edges.map((e, i) => ({ e, i })).filter(x => x.e.from === id || x.e.to === id); }

  // Точка на границе прямоугольника узла по направлению к (tx, ty).
  function clip(n, w, h, tx, ty) {
    const cx = n.x + w / 2, cy = n.y + h / 2, dx = tx - cx, dy = ty - cy;
    if (!dx && !dy) return [cx, cy];
    const k = Math.min(dx ? (w / 2) / Math.abs(dx) : Infinity, dy ? (h / 2) / Math.abs(dy) : Infinity);
    return [cx + dx * k, cy + dy * k];
  }
  function edgeLine(g, e) {
    const w = g.view.node_w, h = g.view.node_h, by = id => g.nodes.find(n => n.id === id);
    const a = by(e.from), b = by(e.to);
    const p = clip(a, w, h, b.x + w / 2, b.y + h / 2), q = clip(b, w, h, a.x + w / 2, a.y + h / 2);
    return p.concat(q).map(v => Math.round(v * 10) / 10);
  }

  function counts(g, status, nowMs) {
    const c = { total: g.nodes.length, ok: 0, warn: 0, fail: 0, unknown: 0, stale: 0, flow: 0 };
    for (const n of g.nodes) c[nodeState(n, status, nowMs).cls]++;
    for (const e of g.edges) if (edgeFlow(e, status, nowMs, g.flow_window_s).flow) c.flow++;
    return c;
  }

  // ---------- DOM ----------
  function boot(win) {
    const doc = win.document, NS = "http://www.w3.org/2000/svg";
    const S = { g: null, status: null, sel: null, path: null, zoom: null, anim: true, err: null };
    const $ = id => doc.getElementById(id);
    const el = (tag, attrs, text, ns) => {
      const e = ns ? doc.createElementNS(NS, tag) : doc.createElement(tag);
      for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
      if (text != null) e.textContent = text;
      return e;
    };
    const svgEl = (tag, attrs, text) => el(tag, attrs, text, true);

    function setView() {
      const arch = win.location.hash === "#architecture";
      if (win.location.hash === "#ask") { doc.body.dataset.view = "ask"; return; }  // B25: вкладкой владеет ask.js
      doc.body.dataset.view = arch ? "arch" : "work";
      const t1 = doc.querySelector(".tabs .tab"), t2 = $("tab-arch");
      if (t1 && t2) { if (arch) { t1.removeAttribute("aria-current"); t2.setAttribute("aria-current", "page"); }
        else { t2.removeAttribute("aria-current"); t1.setAttribute("aria-current", "page"); } }
    }

    async function getJSON(u) {
      const r = await win.fetch(u + "?t=" + Date.now(), { cache: "no-store" });
      if (!r.ok) throw new Error(u + ": HTTP " + r.status);
      return r.json();
    }
    async function load() {
      try {
        if (!S.g) { S.g = await getJSON("arch-data.json"); const e = validateGraph(S.g); if (e.length) throw new Error("arch-data.json: " + e[0]); }
        try { S.status = await getJSON("status.json"); S.err = null; } catch (e) { S.err = e.message; }
      } catch (e) { S.err = e.message; }
      render();
    }

    function render() {
      const g = S.g, now = Date.now();
      $("arch-err").hidden = !S.err; $("arch-err").textContent = S.err ? "Ошибка: " + S.err : "";
      if (!g) return;
      const svg = $("arch-svg"); svg.textContent = "";
      if (S.zoom === null) { S.zoom = fitZoom(g); S.fit = true; }
      svg.setAttribute("viewBox", "0 0 " + g.view.w + " " + g.view.h);
      svg.setAttribute("width", Math.round(g.view.w * S.zoom)); svg.setAttribute("height", Math.round(g.view.h * S.zoom));
      const defs = svgEl("defs");
      const mk = svgEl("marker", { id: "arr", viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse" });
      mk.appendChild(svgEl("path", { d: "M0,0 L10,5 L0,10 z", class: "arr" })); defs.appendChild(mk); svg.appendChild(defs);

      const onPath = new Set(), onEdges = new Set();
      if (S.path) { const p = g.paths.find(x => x.id === S.path); p.nodes.forEach(n => onPath.add(n)); pathEdges(g, S.path).forEach(i => onEdges.add(i)); }
      const hits = new Set(searchNodes(g, $("arch-q").value).map(n => n.id));

      g.edges.forEach((e, i) => {
        const f = edgeFlow(e, S.status, now, g.flow_window_s), [x1, y1, x2, y2] = edgeLine(g, e);
        const cls = "edge " + (f.flow ? "flow" : "still") + (S.path ? (onEdges.has(i) ? " on" : " dim") : "");
        const ln = svgEl("line", { x1, y1, x2, y2, class: cls, "marker-end": "url(#arr)" });
        ln.appendChild(svgEl("title", null, e.label + " — " + f.why)); svg.appendChild(ln);
      });
      for (const n of g.nodes) {
        const s = nodeState(n, S.status, now);
        const cls = "node " + s.cls + (S.sel === n.id ? " sel" : "") + (hits.has(n.id) ? " hit" : "") + (S.path ? (onPath.has(n.id) ? " on" : " dim") : "");
        const gr = svgEl("g", { class: cls, tabindex: "0", role: "button", "data-id": n.id,
          "aria-label": n.title + ": " + s.label + ". " + n.place, transform: "translate(" + n.x + "," + n.y + ")" });
        gr.appendChild(svgEl("rect", { width: g.view.node_w, height: g.view.node_h, rx: "14" }));
        gr.appendChild(svgEl("circle", { cx: "18", cy: "22", r: "6", class: "dot" }));
        gr.appendChild(svgEl("text", { x: "32", y: "27", class: "t" }, n.title));
        gr.appendChild(svgEl("text", { x: "14", y: "50", class: "s" }, s.label));
        gr.appendChild(svgEl("text", { x: "14", y: "70", class: "m" }, n.place + " · " + (s.last.age_s == null ? "нет данных" : L.fmtAge(s.last.age_s))));
        svg.appendChild(gr);
      }
      const c = counts(g, S.status, now);
      $("arch-foot").textContent = c.total + " компонентов на карте · работает " + c.ok + ", внимание " + c.warn + ", ошибка " + c.fail +
        ", нет данных " + (c.unknown + c.stale) + " · связей с потоком " + c.flow + " из " + g.edges.length +
        (S.status ? " · status.json " + L.fmtAge(lastAction(GEN, S.status, now).age_s) : "");
      $("arch-zoom").textContent = Math.round(S.zoom * 100) + "%";
      panel();
    }

    function row(dl, k, v) { dl.appendChild(el("dt", null, k)); const d = el("dd"); if (v && v.nodeType) d.appendChild(v); else d.textContent = v; dl.appendChild(d); }
    function panel() {
      const box = $("arch-panel"), g = S.g; box.textContent = "";
      const n = S.sel && g.nodes.find(x => x.id === S.sel);
      if (!n) { box.appendChild(el("p", { class: "note" }, "Выберите компонент на карте (клик, Enter) или найдите через Ctrl K.")); return; }
      const s = nodeState(n, S.status, Date.now());
      box.appendChild(el("h3", { id: "arch-ph" }, n.title));
      box.appendChild(el("p", { class: "note" }, n.role + " · " + g.groups[n.group]));
      box.appendChild(el("span", { class: "st " + s.cls }, s.label));
      if (s.note) box.appendChild(el("p", { class: "why-n" }, s.note));
      const dl = el("dl", { class: "kv" });
      row(dl, "Размещение", n.place);
      row(dl, "Последнее действие", s.last.at ? L.fmtAge(s.last.age_s) + " (" + new Date(s.last.at).toLocaleString("ru-RU") + ")" : "нет данных");
      row(dl, "Источник", n.card ? (L.SOURCE_LONG && L.SOURCE_LONG[s.last.source]) || L.SOURCE[s.last.source] || s.last.source : "не собирается");
      row(dl, "Уровень доступа", ACCESS[n.access]);
      row(dl, "Как проверить", el("code", null, n.check));
      box.appendChild(dl);
      const ul = el("ul", { class: "links" });
      for (const { e } of linksOf(g, n.id)) {
        const other = g.nodes.find(x => x.id === (e.from === n.id ? e.to : e.from));
        const f = edgeFlow(e, S.status, Date.now(), g.flow_window_s);
        ul.appendChild(el("li", { class: f.flow ? "flow" : "" }, (e.from === n.id ? "→ " : "← ") + other.title + ": " + e.label + " — " + f.why));
      }
      box.appendChild(el("h4", null, "Связи")); box.appendChild(ul);
      box.appendChild(el("p", { class: "note" }, "С карты ничего не запускается. Связь ≠ факт выполнения."));
    }

    function select(id, focusPanel) { S.sel = id; render(); if (focusPanel && $("arch-ph")) $("arch-ph").scrollIntoView({ block: "nearest" }); }
    // «По ширине»: карта целиком помещается в холст (мин. 0.5, чтобы на телефоне текст оставался читаемым — дальше прокрутка).
    function fitZoom(g) {
      const box = doc.querySelector(".arch-canvas"), w = box ? box.clientWidth - 20 : 0;
      return w > 0 ? Math.min(1, Math.max(0.5, Math.floor(w / g.view.w * 100) / 100)) : 1;
    }
    function zoom(k) { S.fit = !k; S.zoom = k ? Math.min(2, Math.max(0.5, Math.round((S.zoom + k) * 10) / 10)) : null; render(); }

    function bind() {
      const svg = $("arch-svg");
      svg.addEventListener("click", ev => { const n = ev.target.closest && ev.target.closest("g.node"); if (n) select(n.dataset.id, true); });
      svg.addEventListener("keydown", ev => {
        const n = ev.target.closest && ev.target.closest("g.node");
        if (n && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); select(n.dataset.id, true); }
      });
      $("arch-find").addEventListener("submit", ev => {
        ev.preventDefault(); const h = searchNodes(S.g, $("arch-q").value)[0];
        if (h) { select(h.id); const g = svg.querySelector('g.node[data-id="' + h.id + '"]'); if (g) g.focus(); }
      });
      $("arch-q").addEventListener("input", render);
      $("arch-in").addEventListener("click", () => zoom(0.1));
      $("arch-out").addEventListener("click", () => zoom(-0.1));
      $("arch-zoom").addEventListener("click", () => zoom(0));
      $("arch-anim").addEventListener("click", () => {
        S.anim = !S.anim; $("arch-anim").setAttribute("aria-pressed", String(S.anim));
        $("arch-anim").textContent = "Анимация: " + (S.anim ? "вкл" : "выкл"); $("architecture").classList.toggle("anim-off", !S.anim);
      });
      $("arch-show").addEventListener("click", () => {
        const v = $("arch-path").value; S.path = S.path === v ? null : v;
        $("arch-show").textContent = S.path ? "Сбросить маршрут" : "Показать маршрут"; $("arch-show").setAttribute("aria-pressed", String(!!S.path));
        if (S.path) S.sel = S.g.paths.find(p => p.id === v).nodes[0];
        render();
      });
      doc.addEventListener("keydown", ev => {
        if ((ev.ctrlKey || ev.metaKey) && (ev.key === "k" || ev.key === "K" || ev.key === "л" || ev.key === "Л")) {
          ev.preventDefault(); if (win.location.hash !== "#architecture") win.location.hash = "architecture";
          $("arch-q").focus(); $("arch-q").select();
        }
      });
      // Скрытый холст имеет ширину 0 — пересчитать «по ширине» при открытии вкладки, если масштаб не меняли вручную.
      win.addEventListener("hashchange", () => { setView(); if (S.fit) { S.zoom = null; render(); } });
    }

    function fillPaths() {
      const sel = $("arch-path"); if (!S.g || sel.options.length) return;
      for (const p of S.g.paths) sel.appendChild(el("option", { value: p.id }, p.title));
    }

    function start() {
      if (!$("arch-svg")) return;
      setView(); bind();
      load().then(fillPaths);
      win.setInterval(() => { if (!doc.hidden) load(); }, 60000);
    }
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start); else start();
  }

  return { ACCESS, GEN, validateGraph, lastAction, nodeState, edgeFlow, pathEdges, searchNodes, linksOf, edgeLine, counts, boot };
});
