// ask.js — вкладка «Спросить» (B25). PULL-модель: браузер кладёт вопрос в ask-api.php на хостинге,
// сервер сам забирает его исходящим запросом и возвращает ответ. Данные — только textContent, CSP 'self'.
// Чистая логика (AskLogic) экспортируется для node:test; DOM-часть запускается только в браузере.
(function (root, factory) {
  const m = factory();
  if (typeof module === "object" && module.exports) module.exports = m;
  else { root.AskLogic = m; if (root.document) m.boot(root); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const API = "ask-api.php", MAX_LEN = 1000, POLL_MS = 4000, HIST_KEY = "ilya-ask-history", HIST_MAX = 20;
  const INVIS = /[­​-‏‪-‮⁠-⁩﻿]/g;
  const EXAMPLES = [
    "Что сейчас делает сервер?",
    "Почему очередь шлюза стоит?",
    "Какие службы в ошибке?",
    "Когда был последний бэкап?",
    "Что осталось сделать по аудиту?",
  ];
  const STATUS = {
    sending: ["Отправляю…", "wait"],
    queued: ["В очереди", "wait"],
    processing: ["Отвечаю…", "wait"],
    answered: ["Ответ", "ok"],
    failed: ["Не смог", "fail"],
    lost: ["Нет на хостинге", "unknown"],
    error: ["Ошибка связи", "fail"],
  };
  const ERR = {
    empty_question: "Введите вопрос.",
    question_too_long: `Вопрос длиннее ${MAX_LEN} символов.`,
    too_fast: "Слишком часто. Подождите несколько секунд.",
    rate_limit: "Лимит вопросов на час исчерпан.",
    queue_full: "Очередь переполнена, попробуйте позже.",
  };

  function clean(s) {
    return String(s || "").replace(INVIS, "").replace(/<!--[\s\S]*?(?:-->|$)/g, "").replace(/<[^>]*>/g, "").trim();
  }
  function validate(s) {
    const t = clean(s);
    if (!t) return { ok: false, error: ERR.empty_question };
    if (t.length > MAX_LEN) return { ok: false, error: ERR.question_too_long };
    return { ok: true, text: t };
  }
  const isFinal = st => st === "answered" || st === "failed" || st === "lost";
  function statusLabel(st) { return STATUS[st] || ["Неизвестно", "unknown"]; }
  function errText(code) { return ERR[code] || `Ошибка: ${code}`; }
  function fmtTime(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    const p = n => String(n).padStart(2, "0");
    return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  // Источник ответа: честная пометка. Пусто -> «не проверено».
  function sourceText(src) { const s = clean(src); return s ? s : "источник не указан — не проверено"; }
  function mergeHist(list, item) {
    const out = [item, ...list.filter(x => x.id !== item.id)];
    return out.slice(0, HIST_MAX);
  }

  // ---------------- DOM ----------------
  function boot(win) {
    const doc = win.document;
    const ready = fn => doc.readyState === "loading" ? doc.addEventListener("DOMContentLoaded", fn) : fn();
    ready(() => {
      const box = doc.getElementById("ask-container");
      if (!box) return;
      const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
      let hist = [];
      try { hist = JSON.parse(win.localStorage.getItem(HIST_KEY) || "[]"); if (!Array.isArray(hist)) hist = []; } catch (_) { hist = []; }
      const saveHist = () => { try { win.localStorage.setItem(HIST_KEY, JSON.stringify(hist)); } catch (_) { /* приватный режим */ } };
      const timers = {};

      // разметка
      const h = el("h2", null, "Спросить сервер"); h.id = "ask-section-h";
      const hint = el("p", "ask-hint", "Ответ собирается из статуса сервера, почасового аудита и HANDOFF. "
        + "Сервер ничего не выполняет по вопросам с доски. Про клиентов и переписки — позже.");
      const form = el("form", "ask-form glass"); form.noValidate = true;
      const lab = el("label", "ask-label", "Вопрос"); lab.htmlFor = "ask-input";
      const ta = el("textarea", "ask-input"); ta.id = "ask-input"; ta.rows = 3; ta.maxLength = MAX_LEN;
      ta.placeholder = "Например: что сейчас делает сервер?";
      const row = el("div", "ask-row");
      const cnt = el("span", "ask-counter", `0 / ${MAX_LEN}`); cnt.setAttribute("aria-live", "off");
      const btn = el("button", "btn ask-send", "Спросить"); btn.type = "submit";
      const msg = el("p", "ask-msg"); msg.setAttribute("role", "status"); msg.setAttribute("aria-live", "polite");
      row.append(cnt, btn);
      const ex = el("div", "ask-examples"); ex.setAttribute("role", "group"); ex.setAttribute("aria-label", "Примеры вопросов");
      EXAMPLES.forEach(q => { const b = el("button", "btn ask-ex", q); b.type = "button"; b.addEventListener("click", () => { ta.value = q; upd(); ta.focus(); }); ex.append(b); });
      form.append(lab, ta, ex, row, msg);
      const hh = el("h3", "ask-hist-h", "История (в этом браузере)");
      const list = el("ol", "ask-list"); list.setAttribute("aria-live", "polite");
      const clr = el("button", "btn ask-clear", "Очистить историю"); clr.type = "button";
      box.append(h, hint, form, hh, list, clr);

      function upd() { const n = clean(ta.value).length; cnt.textContent = `${n} / ${MAX_LEN}`; cnt.classList.toggle("over", n > MAX_LEN); }
      ta.addEventListener("input", upd);

      function render() {
        list.textContent = "";
        if (!hist.length) { list.append(el("li", "ask-empty", "Вопросов пока нет.")); clr.hidden = true; return; }
        clr.hidden = false;
        hist.forEach(it => {
          const li = el("li", "ask-item glass"); li.dataset.id = it.id || "";
          const [lbl, cls] = statusLabel(it.status);
          const top = el("div", "ask-top");
          top.append(el("span", `st ${cls === "wait" ? "warn" : cls}`, lbl), el("time", "ask-time", fmtTime(it.created_at)));
          li.append(top, el("p", "ask-q", it.question));
          if (it.answer) {
            li.append(el("div", "ask-a", it.answer));
            li.append(el("p", "ask-src", sourceText(it.source) + (it.answered_at ? ` · ${fmtTime(it.answered_at)}` : "")));
          }
          if (it.status === "error" && it.err) li.append(el("p", "ask-src", it.err));
          list.append(li);
        });
      }

      async function poll(id) {
        clearTimeout(timers[id]);
        const it = hist.find(x => x.id === id);
        if (!it || isFinal(it.status)) return;
        try {
          const r = await win.fetch(`${API}?id=${encodeURIComponent(id)}&t=${Date.now()}`, { cache: "no-store", credentials: "same-origin" });
          if (r.status === 404) Object.assign(it, { status: "lost" });
          else if (r.ok) { const d = await r.json(); Object.assign(it, { status: d.status, answer: d.answer, source: d.source, answered_at: d.answered_at }); }
        } catch (_) { /* сеть: повторим */ }
        saveHist(); render();
        if (!isFinal(it.status) && doc.body.dataset.view === "ask") timers[id] = setTimeout(() => poll(id), POLL_MS);
      }
      const pollAll = () => hist.filter(x => x.id && !isFinal(x.status) && x.status !== "error").forEach(x => poll(x.id));

      form.addEventListener("submit", async ev => {
        ev.preventDefault();
        const v = validate(ta.value);
        if (!v.ok) { msg.textContent = v.error; return; }
        btn.disabled = true; msg.textContent = "Отправляю…";
        try {
          const r = await win.fetch(API, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: v.text }) });
          const d = await r.json().catch(() => ({}));
          if (!r.ok || !d.id) { msg.textContent = errText(d.error || `HTTP ${r.status}`); return; }
          hist = mergeHist(hist, { id: d.id, question: v.text, status: "queued", created_at: new Date().toISOString() });
          saveHist(); render(); ta.value = ""; upd(); msg.textContent = "Вопрос в очереди. Ответ появится здесь.";
          timers[d.id] = setTimeout(() => poll(d.id), 1500);
        } catch (_) {
          msg.textContent = "Хостинг недоступен. Проверьте связь.";
        } finally { btn.disabled = false; }
      });
      clr.addEventListener("click", () => { hist = []; saveHist(); render(); });

      // вкладка: hash #ask -> body[data-view=ask]; arch.js владеет #architecture
      const tab = doc.getElementById("tab-ask");
      function setView() {
        const on = win.location.hash === "#ask";
        if (on) doc.body.dataset.view = "ask";
        else if (doc.body.dataset.view === "ask") doc.body.dataset.view = win.location.hash === "#architecture" ? "arch" : "work";
        doc.querySelectorAll(".tabs .tab").forEach(t => t.removeAttribute("aria-current"));
        const cur = on ? tab : (win.location.hash === "#architecture" ? doc.getElementById("tab-arch") : doc.querySelector(".tabs .tab"));
        if (cur) cur.setAttribute("aria-current", "page");
        if (on) pollAll();
      }
      if (tab) tab.addEventListener("click", ev => { ev.preventDefault(); win.location.hash = "ask"; });
      win.addEventListener("hashchange", setView);
      render(); setView();
    });
  }

  return { clean, validate, isFinal, statusLabel, errText, fmtTime, sourceText, mergeHist, boot, MAX_LEN, EXAMPLES };
});
