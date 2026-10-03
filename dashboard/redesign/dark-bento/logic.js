// Чистая логика доски ILYA CORE: без DOM, работает в браузере (window.BoardLogic) и в node (require).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BoardLogic = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const STALE_S = 300;          // generated_at старше 5 мин -> «данные устарели»
  const HISTORY_N = 60;         // последних обновлений в localStorage (~1 ч при минутном шаге)
  const HISTORY_KEY = "ilya-board-history-v1";
  const COLORS = ["green", "yellow", "red", "gray"];
  const RANK = { red: 3, yellow: 2, gray: 1, green: 0 };

  const SOURCE = {
    result: "есть результат", process: "процесс жив",
    "self-report": "самоотчёт", unknown: "неизвестно"
  };

  // Контуры: группировка для фильтра. Неизвестный ключ -> "other".
  const CONTOURS = {
    ai: { title: "ИИ-контур", keys: ["core", "gateway", "controller", "memory_mode"] },
    qa: { title: "Качество и исполнитель", keys: ["qa", "qa_bridge", "executor"] },
    infra: { title: "Инфраструктура", keys: ["memory", "db", "backup", "audit"] },
    business: { title: "Чат и бизнес", keys: ["chat"] },
    other: { title: "Прочее", keys: [] }
  };

  // Карта связей: from зависит от to (Core ← шлюз ← контроллер ← память).
  const EDGES = [
    ["core", "gateway", "ответы Core идут через GPU-шлюз"],
    ["core", "db", "Core читает базы"],
    ["gateway", "controller", "режим LIGHT/HEAVY разрешает задачи"],
    ["controller", "memory", "контроллер смотрит свободную RAM Windows"],
    ["controller", "memory_mode", "режим и его причина"],
    ["qa", "qa_bridge", "мост передаёт ревью исполнителю"],
    ["qa_bridge", "executor", "исполнитель делает ревью"],
    ["chat", "db", "чат хранит задачи в SQLite"],
    ["backup", "db", "бэкап снимает базы"],
    ["audit", "db", "аудит читает базы и журналы"]
  ];

  // Справочник причин ожидания: что значит, как проверить, что сделать владельцу.
  const WAIT_HELP = [
    { m: /^waiting_for_heavy$/, text: "Задачи ждут режима HEAVY (большие модели).",
      check: "curl -s 127.0.0.1:8771/health → mode, mode_reason",
      fix: "Освободить RAM Windows (план B4: memory=14GB в .wslconfig) или дождаться ночного окна 23:00–10:00." },
    { m: /^windows_low_ram$/, text: "У Windows мало свободной памяти, контроллер держит LIGHT.",
      check: "Карточка памяти: win_free_mib; Диспетчер задач → vmmem",
      fix: "Дать «да» на step83 (memory=14GB) и окно перезапуска WSL." },
    { m: /^mode_light_reason_not_recorded$/, text: "Режим LIGHT, а причина не записана (дефект H1).",
      check: "/health 8771 → mode_reason", fix: "Выкатить план #7 контроллера (step79)." },
    { m: /^mode_light_reason_(.+)$/, text: "Режим LIGHT, причина: $1.",
      check: "/health 8771 → mode_reason, mode_until_utc",
      fix: "Если причина critical_windows_ram — см. windows_low_ram; outside_heavy_window — норма днём." },
    { m: /^awaiting_external_review\((\d+)\)$/, text: "$1 задач ждут внешнего ревью.",
      check: "outbox quality.sqlite: pending / reviewed",
      fix: "Проверить таймер smart-qa-bridge и исполнитель." },
    { m: /^no_completed_result_recorded$/, text: "Исполнитель жив, но завершённых задач не видно.",
      check: "executor.sqlite events: completed_at", fix: "Прогнать пробную задачу через мост QA." },
    { m: /^no_executor$/, text: "Нет подключённого исполнителя.",
      check: "assignment-supervisor: adapter", fix: "Решение владельца: какой исполнитель включить." },
    { m: /^no_result_metric_yet$/, text: "Для контура ещё нет метрики полезного результата.",
      check: "—", fix: "Внедрить эталонный набор Core (core-rates/run_eval.py) как метрику." },
    { m: /^unit_(.+)$/, text: "Служба в состоянии «$1».",
      check: "systemctl status <служба>; journalctl -u <служба> | tail -n 30",
      fix: "Передать Claude вывод проверки (кнопка «Скопировать для Claude»)." }
  ];

  function explainWait(reason) {
    if (!reason) return null;
    for (const h of WAIT_HELP) {
      const r = String(reason).match(h.m);
      if (r) {
        const sub = s => s.replace(/\$(\d)/g, (_, i) => r[+i] || "");
        return { reason, text: sub(h.text), check: h.check, fix: sub(h.fix), known: true };
      }
    }
    return { reason, text: "Причина: " + reason, check: "Описание причины в коде коллектора.",
      fix: "Неизвестная причина — скопировать состояние и передать Claude.", known: false };
  }

  function normColor(c) { return COLORS.includes(c) ? c : "gray"; }

  function contourOf(key) {
    for (const [id, c] of Object.entries(CONTOURS)) if (c.keys.includes(key)) return id;
    return "other";
  }

  function parseTime(s) { const t = Date.parse(s); return Number.isFinite(t) ? t : null; }

  // Возраст данных относительно «сейчас».
  function staleness(generatedAt, nowMs, limitS) {
    const t = parseTime(generatedAt);
    const lim = limitS == null ? STALE_S : limitS;
    if (t == null) return { stale: true, age_s: null, reason: "нет generated_at" };
    const age = Math.max(0, Math.round((nowMs - t) / 1000));
    return { stale: age > lim, age_s: age, reason: age > lim ? "данные старше " + Math.round(lim / 60) + " мин" : null };
  }

  // age_s из файла посчитан на момент generated_at; к нему добавляем, сколько файл лежит.
  function effectiveAge(card, generatedAt, nowMs) {
    if (card.age_s == null) return null;
    const t = parseTime(generatedAt);
    const extra = t == null ? 0 : Math.max(0, Math.round((nowMs - t) / 1000));
    return card.age_s + extra;
  }

  function fmtAge(s) {
    if (s == null) return "нет данных";
    if (s < 90) return s + " с назад";
    if (s < 5400) return Math.round(s / 60) + " мин назад";
    if (s < 172800) return Math.round(s / 3600) + " ч назад";
    return Math.round(s / 86400) + " дн назад";
  }

  function fmtValue(v) {
    if (v == null) return "—";
    if (typeof v === "object") return Object.entries(v).map(([a, b]) => a + "=" + fmtValue(b)).join(", ");
    return String(v);
  }

  function detailPairs(detail) {
    return Object.entries(detail || {}).filter(([, v]) => v != null).map(([k, v]) => [k, fmtValue(v)]);
  }

  // Сводный светофор. gray = «нет метрики»: не поломка, но и не «всё хорошо».
  function overall(cards, stale) {
    const counts = { green: 0, yellow: 0, red: 0, gray: 0 };
    for (const c of cards || []) counts[normColor(c.color)]++;
    const total = (cards || []).length;
    let level = "green", text = "Всё работает";
    if (!total) { level = "gray"; text = "Нет карточек"; }
    else if (counts.red) { level = "red"; text = "Сломано: " + counts.red; }
    else if (counts.yellow) { level = "yellow"; text = "Требует внимания: " + counts.yellow; }
    else if (counts.gray === total) { level = "gray"; text = "Нет метрик результата"; }
    if (stale && stale.stale) { text += " · данные устарели"; if (level === "green") level = "gray"; }
    return { level, text, counts, total };
  }

  // «Что сломано сейчас»: красные и жёлтые, худшие и самые старые сверху; корень — по карте связей.
  function brokenNow(cards, generatedAt, nowMs) {
    const byKey = Object.fromEntries((cards || []).map(c => [c.key, c]));
    return (cards || [])
      .filter(c => ["red", "yellow"].includes(normColor(c.color)))
      .map(c => ({
        key: c.key, title: c.title, color: normColor(c.color),
        age_s: effectiveAge(c, generatedAt, nowMs),
        wait: explainWait(c.wait_reason),
        upstream: upstreamProblems(c.key, byKey)
      }))
      .sort((a, b) => RANK[b.color] - RANK[a.color] || (b.age_s ?? 1e12) - (a.age_s ?? 1e12));
  }

  // Плохие карточки, от которых зависит key (транзитивно).
  function upstreamProblems(key, byKey, seen) {
    seen = seen || new Set([key]);
    const out = [];
    for (const [from, to] of EDGES) {
      if (from !== key || seen.has(to)) continue;
      seen.add(to);
      const c = byKey[to];
      if (c && ["red", "yellow"].includes(normColor(c.color))) out.push(to);
      out.push(...upstreamProblems(to, byKey, seen));
    }
    return out;
  }

  // Карта связей данными: узлы (только присутствующие) и рёбра.
  function graph(cards) {
    const byKey = Object.fromEntries((cards || []).map(c => [c.key, c]));
    const edges = EDGES.filter(([a, b]) => byKey[a] && byKey[b])
      .map(([from, to, why]) => ({ from, to, why, broken: ["red", "yellow"].includes(normColor(byKey[to].color)) }));
    const chains = [];
    const roots = Object.keys(byKey).filter(k => !edges.some(e => e.to === k) && edges.some(e => e.from === k));
    const walk = (k, path) => {
      const next = edges.filter(e => e.from === k && !path.includes(e.to));
      if (!next.length) { chains.push(path); return; }
      for (const e of next) walk(e.to, path.concat(e.to));
    };
    roots.forEach(r => walk(r, [r]));
    return { nodes: Object.keys(byKey), edges, chains };
  }

  function filterCards(cards, f) {
    f = f || {};
    return (cards || []).filter(c =>
      (!f.status || f.status === "all" || normColor(c.color) === f.status) &&
      (!f.contour || f.contour === "all" || contourOf(c.key) === f.contour));
  }

  // История: [{t: generated_at, c: {key: color}, a: {key: age_s}}], без дублей по generated_at.
  function pushHistory(hist, data, n) {
    n = n || HISTORY_N;
    const h = Array.isArray(hist) ? hist.filter(x => x && x.t && x.c) : [];
    if (!data || !data.generated_at || !Array.isArray(data.cards)) return h.slice(-n);
    if (h.length && h[h.length - 1].t === data.generated_at) return h.slice(-n);
    const c = {}, a = {};
    for (const k of data.cards) { c[k.key] = normColor(k.color); a[k.key] = k.age_s ?? null; }
    h.push({ t: data.generated_at, c, a });
    h.sort((x, y) => (parseTime(x.t) || 0) - (parseTime(y.t) || 0));
    return h.slice(-n);
  }

  function series(hist, key) {
    return (hist || []).map(x => ({ t: x.t, color: x.c[key] || null, age_s: x.a ? x.a[key] ?? null : null }));
  }

  // Сколько раз цвет менялся и доля «плохих» точек — для подписи под мини-графиком.
  function trend(hist, key) {
    const s = series(hist, key).filter(p => p.color);
    let changes = 0, bad = 0;
    s.forEach((p, i) => { if (i && p.color !== s[i - 1].color) changes++; if (p.color === "red") bad++; });
    return { points: s.length, changes, red_share: s.length ? bad / s.length : 0, last: s.length ? s[s.length - 1].color : null };
  }

  function loadHistory(storage) {
    try { const v = JSON.parse(storage.getItem(HISTORY_KEY) || "[]"); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  function saveHistory(storage, hist) {
    try { storage.setItem(HISTORY_KEY, JSON.stringify(hist)); return true; } catch (e) { return false; }
  }

  // Проверка формы status.json (как публикатор, но мягче: показываем, что пришло не так).
  function validate(d) {
    const errs = [];
    if (!d || typeof d !== "object") return ["ответ не JSON-объект"];
    if (!d.generated_at) errs.push("нет generated_at");
    if (!Array.isArray(d.cards)) errs.push("нет cards[]");
    else d.cards.forEach((c, i) => {
      if (!c || !c.key) errs.push("карточка #" + i + " без key");
      else if (!COLORS.includes(c.color)) errs.push(c.key + ": цвет «" + c.color + "»");
    });
    return errs;
  }

  // Текст для копирования «скинуть Claude»: без ПДн, только то, что уже в публичном status.json.
  function exportText(d, nowMs, hist) {
    if (!d || !Array.isArray(d.cards)) return "Доска ILYA CORE: данных нет.";
    const st = staleness(d.generated_at, nowMs);
    const o = overall(d.cards, st);
    const L = [];
    L.push("Доска ILYA CORE — состояние");
    L.push("generated_at: " + d.generated_at + " (возраст " + fmtAge(st.age_s) + (st.stale ? ", УСТАРЕЛО" : "") + ")");
    L.push("Светофор: " + o.level + " — " + o.text + " (зел " + o.counts.green + ", жёлт " + o.counts.yellow +
      ", красн " + o.counts.red + ", нет данных " + o.counts.gray + ")");
    const br = brokenNow(d.cards, d.generated_at, nowMs);
    if (br.length) {
      L.push("", "Сломано / внимание:");
      for (const b of br) L.push("- [" + b.color + "] " + b.key + " (" + b.title + "): результат " + fmtAge(b.age_s) +
        (b.wait ? "; ожидание " + b.wait.reason : "") + (b.upstream.length ? "; выше по цепочке: " + b.upstream.join(", ") : ""));
    }
    L.push("", "Карточки:");
    for (const c of d.cards) {
      const t = hist ? trend(hist, c.key) : null;
      L.push("- " + c.key + " | " + normColor(c.color) + " | источник " + (c.source || "unknown") +
        " | результат " + fmtAge(effectiveAge(c, d.generated_at, nowMs)) +
        " | ожидание " + (c.wait_reason || "—") +
        (t && t.points > 1 ? " | история " + t.points + " точек, смен цвета " + t.changes : ""));
      const dp = detailPairs(c.detail);
      if (dp.length) L.push("    " + dp.map(([k, v]) => k + ": " + v).join("; "));
    }
    return L.join("\n");
  }

  // ---------- D5a: итоговая доска (группы, честный статус, фраза-итог, ресурсы) ----------

  // Источник факта человеческими словами (как в референсе: «подтверждено процессом…»).
  const SOURCE_LONG = {
    result: "Подтверждено результатом (время последнего полезного результата)",
    process: "Подтверждено процессом (служба/замер жив), результат не измеряется",
    "self-report": "По сообщению самой службы — не проверено независимо",
    unknown: "Источник не указан — не подтверждено"
  };

  // Честный статус карточки: зелёный только с доказательством; устаревшие данные — отдельное состояние.
  function verdict(card, stale) {
    const col = normColor(card && card.color), src = (card && card.source) || "unknown";
    if (stale && stale.stale) return { cls: "stale", label: "Нет свежих данных" };
    if (col === "red") return { cls: "fail", label: "Ошибка или долгая пауза" };
    if (col === "yellow") return { cls: "warn", label: "Требует внимания" };
    if (col === "gray") return { cls: "unknown", label: "Не подтверждено" };
    if (src === "result") return { cls: "ok", label: "Работает — есть результат" };
    if (src === "process") return { cls: "ok", label: "Процесс жив" };
    return { cls: "unknown", label: "Не подтверждено" };
  }

  // Группы референса + честная четвёртая: «нет доказательства».
  const GROUPS = [
    { id: "now", title: "Сейчас делаем", hint: "Есть свежий результат или живой замер." },
    { id: "pause", title: "Техническая пауза или ошибка", hint: "С причиной остановки и тем, что проверить." },
    { id: "review", title: "Готово и проверяется", hint: "Результат есть, ждёт проверки (ревью)." },
    { id: "unconfirmed", title: "Не подтверждено", hint: "Нет метрики результата — зелёным не считаем." }
  ];
  const REVIEW_RE = /^awaiting_/;

  function groupOf(card, stale) {
    const v = verdict(card, stale);
    if (v.cls === "fail" || v.cls === "warn") return "pause";
    if (v.cls === "unknown" || v.cls === "stale") return "unconfirmed";
    if (REVIEW_RE.test(card.wait_reason || "")) return "review";
    return "now";
  }

  function grouped(cards, stale) {
    const out = Object.fromEntries(GROUPS.map(g => [g.id, []]));
    for (const c of cards || []) out[groupOf(c, stale)].push(c);
    return out;
  }

  // Фильтры-чипы по контурам (D1 CONTOURS) с числами.
  function chips(cards) {
    const n = { all: (cards || []).length };
    for (const id of Object.keys(CONTOURS)) n[id] = 0;
    for (const c of cards || []) n[contourOf(c.key)]++;
    return [{ id: "all", title: "Все", n: n.all }].concat(
      Object.entries(CONTOURS).map(([id, c]) => ({ id, title: c.title, n: n[id] })).filter(x => x.id === "all" || x.n));
  }

  function plural(n, one, few, many) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b === 1) return one;
    if (b >= 2 && b <= 4) return few;
    return many;
  }

  function contourTitle(key) { return CONTOURS[contourOf(key)].title; }

  function byKeyOf(cards) { return Object.fromEntries((cards || []).map(c => [c.key, c])); }

  // Обзорная фраза-итог и пояснение (честно: «проверено ≠ всё завершено»).
  function summary(d, nowMs) {
    const cards = (d && d.cards) || [];
    const st = staleness(d && d.generated_at, nowMs);
    const g = grouped(cards, st);
    const k = byKeyOf(cards);
    let head;
    if (!cards.length) head = "Данных о работе нет";
    else if (st.stale) head = "Доска не обновляется — данные " + fmtAge(st.age_s);
    else if (g.pause.length) head = g.pause.length + " " + plural(g.pause.length, "контур на паузе или с ошибкой", "контура на паузе или с ошибкой", "контуров на паузе или с ошибкой");
    else if (g.now.length) head = g.now.length + " " + plural(g.now.length, "контур работает", "контура работают", "контуров работают");
    else head = "Работа не подтверждена";
    const parts = [];
    if (g.now.length && g.pause.length) parts.push("Работают с подтверждением: " + g.now.length + ".");
    const qa = k.qa && k.qa.detail && k.qa.detail.awaiting;
    if (qa) parts.push(qa + " " + plural(qa, "результат ждёт", "результата ждут", "результатов ждут") + " проверки.");
    if (g.unconfirmed.length) parts.push("Без доказательства: " + g.unconfirmed.length + " — показаны серым, не зелёным.");
    const gw = k.gateway && k.gateway.detail;
    const ai = gw ? "Локальный ИИ: " + (gw.running ?? 0) + " выполняется, " + (gw.queued ?? 0) + " ждут" + (gw.mode ? ", режим " + gw.mode : "") : null;
    const checked = st.age_s == null ? "время проверки неизвестно" : "сервер проверен " + fmtAge(st.age_s);
    return { head, sub: parts.join(" "), ai, checked: checked + " — это не значит, что все задачи завершены.",
      stale: st, counts: Object.fromEntries(Object.entries(g).map(([a, b]) => [a, b.length])) };
  }

  // Плитки ресурсов: значение, если есть в status.json, иначе «нет данных» + какое поле нужно.
  // card "resources" пока не существует — его поля описаны в README (план collector).
  const RESOURCE_TILES = [
    { id: "cpu", title: "CPU", card: "resources", f: d => d.cpu_pct != null ? { v: d.cpu_pct + " %", p: d.cpu_pct / 100 } : null, need: "resources.cpu_pct" },
    { id: "ram", title: "RAM Windows", card: "memory", f: d => d.win_free_mib != null ? { v: gib(d.win_free_mib) + " ГБ свободно" } : null, need: "memory.win_free_mib (сейчас null)" },
    { id: "wsl", title: "WSL RAM", card: "memory", f: d => d.wsl_total_mib ? { v: gib(d.wsl_total_mib - (d.wsl_avail_mib || 0)) + " из " + gib(d.wsl_total_mib) + " ГБ", p: 1 - (d.wsl_avail_mib || 0) / d.wsl_total_mib, h: "кэш " + gib(d.wsl_cache_mib) + " ГБ, swap " + gib(d.swap_used_mib) + " ГБ" } : null, need: "memory.wsl_total_mib" },
    { id: "gpu", title: "GPU", card: "resources", f: d => d.gpu_pct != null ? { v: d.gpu_pct + " %", p: d.gpu_pct / 100, h: [d.gpu_temp_c != null ? d.gpu_temp_c + " °C" : null, d.gpu_power_w != null ? d.gpu_power_w + " Вт" : null].filter(Boolean).join(", ") } : null, need: "resources.gpu_pct" },
    { id: "vram", title: "VRAM", card: "resources", f: d => d.vram_total_mib ? { v: gib(d.vram_used_mib) + " из " + gib(d.vram_total_mib) + " ГБ", p: d.vram_used_mib / d.vram_total_mib } : null, need: "resources.vram_used_mib, vram_total_mib" },
    { id: "mode", title: "Режим и причина", card: "controller", f: (d, k) => d.mode ? { v: d.mode, h: modeReason(d, k) } : null, need: "controller.mode" },
    { id: "model", title: "Локальная модель", card: "controller", f: d => d.desired_model ? { v: d.desired_model, h: d.sched_state === "unloaded" ? "не загружена (ожидает)" : (d.sched_state || "") } : null, need: "controller.desired_model" },
    { id: "queue", title: "Очередь локального ИИ", card: "gateway", f: d => d.queued != null ? { v: d.queued + " ждут", h: (d.running ?? 0) + " выполняется · " + (d.completed ?? 0) + " завершено · " + (d.failed ?? 0) + " ошибок" } : null, need: "gateway.queued" },
    { id: "disk", title: "Свободно на диске", card: "resources", f: d => d.disk_free_gib != null ? { v: d.disk_free_gib + " ГБ" } : null, need: "resources.disk_free_gib" }
  ];

  function gib(mib) { return mib == null ? "—" : (mib / 1024).toFixed(1).replace(".", ","); }

  function modeReason(d, k) {
    const mm = k.memory_mode && k.memory_mode.detail;
    const r = (mm && mm.mode_reason) || (k.controller && k.controller.wait_reason);
    if (!r) return "причина не записана";
    const w = explainWait(r);
    return w && w.known ? w.text : "причина: " + r;
  }

  function resources(d) {
    const k = byKeyOf(d && d.cards);
    return RESOURCE_TILES.map(t => {
      const c = k[t.card];
      const r = c ? t.f(c.detail || {}, k) : null;
      return r ? { id: t.id, title: t.title, value: r.v, pct: r.p == null ? null : Math.max(0, Math.min(1, r.p)), hint: r.h || "",
        source: t.card + " · " + (SOURCE[c.source] || "неизвестно"), have: true }
        : { id: t.id, title: t.title, value: "нет данных", pct: null, hint: "нужно поле " + t.need, source: "нет в status.json", have: false };
    });
  }

  // «Почему ещё не готово»: причина, что проверить, что сделать, кто выше по цепочке.
  function whyNotReady(card, cards) {
    const w = explainWait(card.wait_reason);
    const up = upstreamProblems(card.key, byKeyOf(cards));
    if (!w && !up.length && ["green"].includes(normColor(card.color))) return null;
    return {
      text: w ? w.text : (normColor(card.color) === "gray" ? "Нет метрики полезного результата." : "Результат давно не появлялся, причина не записана."),
      check: w ? w.check : "journalctl -u <служба> | tail -n 30",
      fix: w ? w.fix : "Передать состояние Claude (кнопка «Скопировать для Claude»).",
      upstream: up, known: w ? w.known : false
    };
  }

  function search(cards, q) {
    q = String(q || "").trim().toLowerCase();
    if (!q) return cards || [];
    return (cards || []).filter(c => [c.key, c.title, c.wait_reason, JSON.stringify(c.detail || {})].join(" ").toLowerCase().includes(q));
  }

  return { STALE_S, HISTORY_N, HISTORY_KEY, SOURCE, SOURCE_LONG, CONTOURS, EDGES, WAIT_HELP, GROUPS, RESOURCE_TILES,
    explainWait, normColor, contourOf, staleness, effectiveAge, fmtAge, fmtValue, detailPairs,
    overall, brokenNow, upstreamProblems, graph, filterCards, pushHistory, series, trend,
    loadHistory, saveHistory, validate, exportText,
    verdict, groupOf, contourTitle, grouped, chips, plural, summary, resources, whyNotReady, search, gib };
});
