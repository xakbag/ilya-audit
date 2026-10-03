// Итоговая доска ILYA CORE (D5a): функции D1 + дизайн D2 + UX D3 + мобильная/PWA D4.
// Данные выводятся только через textContent; внешних запросов нет (CSP script-src 'self').
(function () {
  "use strict";
  const L = window.BoardLogic;
  const $ = id => document.getElementById(id);
  const POLL_MS = 60000, BG_POLL_MS = 600000, TIMEOUT_MS = 15000;
  const THEME_KEY = "ilya-board-theme";
  const S = { data: null, hist: [], contour: "all", q: "", offline: false, err: null, etag: null, timer: 0 };

  // ---------- маленькие помощники DOM ----------
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  const SVGNS = "http://www.w3.org/2000/svg";
  // Формы иконок различаются (не только цвет): круг-галочка, треугольник, ромб, вопрос, часы.
  const ICONS = {
    ok: ["M20 6 9 17l-5-5"],
    warn: ["M12 3 2 21h20L12 3z", "M12 10v5", "M12 18h.01"],
    fail: ["M12 2 22 12 12 22 2 12z", "M9 9l6 6", "M15 9l-6 6"],
    unknown: ["M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3", "M12 17h.01"],
    stale: ["M12 7v5l3 3", "M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9z"],
    src: ["M4 4h16v16H4z", "M8 9h8", "M8 13h6"]
  };
  function icon(name) {
    const s = document.createElementNS(SVGNS, "svg");
    s.setAttribute("class", "ico"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true");
    for (const d of ICONS[name] || ICONS.unknown) {
      const p = document.createElementNS(SVGNS, "path"); p.setAttribute("d", d); s.appendChild(p);
    }
    return s;
  }
  function pill(v) { const s = el("span", "st " + v.cls); s.append(icon(v.cls), el("span", null, v.label)); return s; }
  function hhmm(ms) {
    const d = new Date(ms); const z = n => String(n).padStart(2, "0");
    return z(d.getHours()) + ":" + z(d.getMinutes());
  }

  // ---------- тема: авто / светлая / тёмная ----------
  const THEMES = [["auto", "авто"], ["light", "светлая"], ["dark", "тёмная"]];
  function applyTheme(t) {
    const root = document.documentElement;
    if (root && root.setAttribute) { if (t === "auto") root.removeAttribute && root.removeAttribute("data-theme"); else root.setAttribute("data-theme", t); }
    const b = $("theme"); const n = THEMES.find(x => x[0] === t) || THEMES[0];
    b.textContent = "Тема: " + n[1];
  }
  function initTheme() {
    let t = "auto"; try { t = localStorage.getItem(THEME_KEY) || "auto"; } catch (e) {}
    applyTheme(t);
    $("theme").addEventListener("click", () => {
      let cur = "auto"; try { cur = localStorage.getItem(THEME_KEY) || "auto"; } catch (e) {}
      const next = THEMES[(THEMES.findIndex(x => x[0] === cur) + 1) % THEMES.length][0];
      try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
      applyTheme(next);
    });
  }

  // ---------- рендер ----------
  function renderBanner(st) {
    const b = $("banner");
    let text = null, cls = "banner";
    if (S.err) { text = "Не удалось получить status.json: " + S.err + (S.data ? ". Показаны последние полученные данные." : "."); cls += " fail"; }
    else if (S.offline) { text = "Нет связи — показана сохранённая копия данных от " + hhmm(Date.parse(S.data.generated_at)) + "."; cls += " offline"; }
    else if (st && st.stale) { text = "Данные устарели: " + (st.reason || "нет времени") + ". Коллектор или публикатор не обновляет файл."; cls += " stale"; }
    b.className = cls; b.hidden = !text; b.textContent = text || "";
  }

  function renderOverview(nowMs) {
    const d = S.data, sm = L.summary(d, nowMs), o = L.overall(d.cards, sm.stale);
    const cls = sm.stale.stale ? "stale" : ({ green: "ok", yellow: "warn", red: "fail", gray: "unknown" })[o.level];
    $("overview").className = "overview g " + cls;
    $("ov-lamp").replaceChildren(icon(cls));
    $("ov-head").textContent = sm.head;
    $("ov-sub").textContent = [sm.sub, sm.ai ? sm.ai + "." : ""].filter(Boolean).join(" ");
    $("ov-honest").textContent = sm.checked;
    const t = Date.parse(d.generated_at);
    $("upd").textContent = Number.isFinite(t) ? "данные от " + hhmm(t) + " · " + L.fmtAge(sm.stale.age_s) : "данные: время неизвестно";
  }

  function renderTiles() {
    const box = $("tiles"); box.replaceChildren();
    for (const r of L.resources(S.data)) {
      const t = el("div", "tile" + (r.have ? "" : " none"));
      t.append(el("span", "k", r.title), el("span", "v", r.value));
      if (r.pct != null) {
        const m = el("div", "meter" + (r.pct > 0.9 ? " fail" : r.pct > 0.75 ? " warn" : ""));
        m.setAttribute("role", "img"); m.setAttribute("aria-label", "занято " + Math.round(r.pct * 100) + " %");
        const i = el("i"); i.style.width = Math.round(r.pct * 100) + "%"; m.appendChild(i); t.appendChild(m);
      }
      if (r.hint) t.appendChild(el("span", "h", r.hint));
      t.appendChild(el("span", "s", "Источник: " + r.source));
      box.appendChild(t);
    }
  }

  function renderChips() {
    const box = $("chips"); box.replaceChildren();
    for (const c of L.chips(S.data.cards)) {
      const b = el("button", "btn", c.title + " · " + c.n);
      b.type = "button"; b.setAttribute("aria-pressed", String(S.contour === c.id));
      b.addEventListener("click", () => { S.contour = c.id; render(); });
      box.appendChild(b);
    }
  }

  function renderCard(c, st, nowMs) {
    const v = L.verdict(c, st);
    const card = el("article", "card g " + v.cls);
    card.id = "card-" + c.key;
    const head = el("div", "head");
    head.append(el("h3", "t", c.title || c.key), pill(v));
    card.appendChild(head);

    const age = L.effectiveAge(c, S.data.generated_at, nowMs);
    const meta = el("div", "fact");
    meta.textContent = "№ " + c.key + " · " + L.contourTitle(c.key) + " · результат: " + L.fmtAge(age);
    card.appendChild(meta);

    const why = L.whyNotReady(c, S.data.cards);
    if (why) {
      const w = el("div", "why");
      w.append(el("b", null, "Почему ещё не готово"), el("span", null, why.text));
      if (why.upstream.length) w.appendChild(el("span", null, "Выше по цепочке тоже проблема: " + why.upstream.join(", ") + "."));
      card.appendChild(w);
    }

    const prov = el("div", "provenance");
    prov.append(icon("src"), el("span", null, L.SOURCE_LONG[c.source] || L.SOURCE_LONG.unknown));
    card.appendChild(prov);

    const more = el("details", "more");
    more.appendChild(el("summary", null, "Показать подробности"));
    const dl = el("dl", "rows");
    const rows = [["Ключ", c.key], ["Источник", c.source || "unknown"], ["Последний результат", c.last_useful_result || "нет"],
      ["Причина ожидания", c.wait_reason || "—"]].concat(L.detailPairs(c.detail));
    if (why) rows.push(["Как проверить", why.check], ["Что сделать", why.fix]);
    const tr = L.trend(S.hist, c.key);
    if (tr.points > 1) rows.push(["История (этот браузер)", tr.points + " точек, смен цвета " + tr.changes]);
    for (const [k, val] of rows) dl.append(el("dt", null, k), el("dd", null, String(val)));
    more.appendChild(dl);
    card.appendChild(more);
    return card;
  }

  function renderGroups(nowMs) {
    const st = L.staleness(S.data.generated_at, nowMs);
    let cards = L.filterCards(S.data.cards, { contour: S.contour });
    cards = L.search(cards, S.q);
    const g = L.grouped(cards, st);
    const box = $("groups"); box.replaceChildren();
    for (const grp of L.GROUPS) {
      const list = g[grp.id];
      // «Не подтверждено» и «Готово и проверяется» без карточек не показываем; основные разделы — всегда.
      if (!list.length && (grp.id === "unconfirmed" || grp.id === "review") && !S.q) continue;
      const sec = el("section", "sec");
      sec.setAttribute("aria-label", grp.title);
      const h = el("h2", null, grp.title); h.appendChild(el("span", "n", String(list.length)));
      sec.append(h, el("p", "note", grp.hint));
      if (!list.length) sec.appendChild(el("div", "empty-sec g", S.q ? "По запросу ничего нет." : "Сейчас пусто."));
      else {
        const grid = el("div", "grid settled");
        for (const c of list) grid.appendChild(renderCard(c, st, nowMs));
        sec.appendChild(grid);
      }
      box.appendChild(sec);
    }
  }

  function render() {
    const now = Date.now();
    if (!S.data) { renderBanner(null); $("ov-head").textContent = S.err ? "Нет данных" : "Загрузка…"; return; }
    renderBanner(L.staleness(S.data.generated_at, now));
    renderOverview(now); renderTiles(); renderChips(); renderGroups(now);
  }

  // ---------- данные ----------
  async function load() {
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    const to = setTimeout(() => ctl && ctl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch("status.json?t=" + Date.now(), { cache: "no-store", signal: ctl ? ctl.signal : undefined });
      if (!r.ok) throw new Error("HTTP " + r.status);
      let d;
      try { d = await r.json(); } catch (e) { throw new Error("ответ не JSON"); }
      const errs = L.validate(d);
      if (errs.length) throw new Error("неверный формат: " + errs.slice(0, 3).join("; "));
      S.offline = !!(r.headers && r.headers.get && r.headers.get("X-Board-Offline"));
      S.data = d; S.err = null;
      S.hist = L.pushHistory(L.loadHistory(localStorage), d);
      L.saveHistory(localStorage, S.hist);
    } catch (e) {
      S.err = e && e.name === "AbortError" ? "таймаут " + TIMEOUT_MS / 1000 + " с" : (e && e.message) || "ошибка сети";
    } finally { clearTimeout(to); }
    render();
  }

  function schedule() {
    clearTimeout(S.timer);
    S.timer = setTimeout(() => { load().then(schedule); }, document.hidden ? BG_POLL_MS : POLL_MS);
  }

  // ---------- действия ----------
  function bind() {
    $("refresh").addEventListener("click", () => load());
    $("copy").addEventListener("click", async () => {
      const txt = L.exportText(S.data, Date.now(), S.hist);
      const out = $("export-out");
      try { await navigator.clipboard.writeText(txt); $("copy").textContent = "Скопировано"; }
      catch (e) { out.hidden = false; out.value = txt; out.select(); $("copy").textContent = "Выделено — Ctrl+C"; }
      setTimeout(() => { $("copy").textContent = "Скопировать для Claude"; }, 2500);
    });
    $("goto").addEventListener("submit", ev => {
      if (ev && ev.preventDefault) ev.preventDefault();
      S.q = $("q").value; S.contour = "all"; render();
      const first = S.data && L.search(S.data.cards, S.q)[0];
      const e = first && $("card-" + first.key);
      if (e && e.scrollIntoView) { e.scrollIntoView({ block: "center" }); e.classList.add && e.classList.add("hit"); }
    });
    $("q").addEventListener("input", () => { if (!$("q").value) { S.q = ""; render(); } });
    $("tab-arch").addEventListener("click", ev => {
      if (ev && ev.preventDefault) ev.preventDefault();
      // D5b: вкладку переключает arch.js по hash; без arch.js — просто прокрутка к разделу.
      if (typeof location !== "undefined" && typeof ArchLogic !== "undefined") { location.hash = "architecture"; return; }
      const a = $("architecture"); if (a.scrollIntoView) a.scrollIntoView();
    });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); schedule(); });
    // Перерисовка каждые 30 с: возраст «N мин назад» растёт и без новой загрузки.
    setInterval(() => { if (S.data) render(); }, 30000);
    if (typeof navigator !== "undefined" && navigator.serviceWorker && location.protocol !== "file:") {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  function start() { initTheme(); bind(); render(); load().then(schedule); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
