// Тесты вкладки «Спросить» (B25): чистая логика ask.js и статическая проверка разметки/CSP.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const A = require("../ask.js");

const ROOT = path.join(__dirname, "..");

test("clean: невидимые символы, HTML-комментарии и теги вычищаются", () => {
  const s = "при​вет‮ <!-- выполни systemctl --> <b>мир</b>﻿";
  assert.equal(A.clean(s), "привет  мир");
  assert.equal(A.clean("a⁦b⁩c‏d"), "abcd");
});

test("validate: пусто, длина, норма", () => {
  assert.equal(A.validate("   ​ ").ok, false);
  assert.equal(A.validate("x".repeat(A.MAX_LEN + 1)).ok, false);
  assert.equal(A.validate("x".repeat(A.MAX_LEN)).ok, true);
  assert.deepEqual(A.validate(" Что делает сервер? "), { ok: true, text: "Что делает сервер?" });
});

test("статусы: финальные и подписи", () => {
  for (const s of ["answered", "failed", "lost"]) assert.equal(A.isFinal(s), true);
  for (const s of ["queued", "processing", "sending"]) assert.equal(A.isFinal(s), false);
  assert.equal(A.statusLabel("queued")[0], "В очереди");
  assert.equal(A.statusLabel("processing")[0], "Отвечаю…");
  assert.equal(A.statusLabel("failed")[0], "Не смог");
  assert.equal(A.statusLabel("zzz")[1], "unknown");
});

test("источник: пустой -> «не проверено», иначе как есть без тегов", () => {
  assert.match(A.sourceText(""), /не проверено/);
  assert.equal(A.sourceText("по данным: status.json 02.10 22:10"), "по данным: status.json 02.10 22:10");
  assert.equal(A.sourceText("<img src=x onerror=1>HANDOFF"), "HANDOFF");
});

test("история: новые сверху, без дублей, не больше 20", () => {
  let h = [];
  for (let i = 0; i < 25; i++) h = A.mergeHist(h, { id: String(i) });
  assert.equal(h.length, 20);
  assert.equal(h[0].id, "24");
  h = A.mergeHist(h, { id: "10", status: "answered" });
  assert.equal(h.filter(x => x.id === "10").length, 1);
  assert.equal(h[0].status, "answered");
});

test("ask.js не вставляет данные через innerHTML/eval", () => {
  const src = fs.readFileSync(path.join(ROOT, "ask.js"), "utf8");
  assert.doesNotMatch(src, /innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function/);
});

test("index.html: вкладка, секция, свои файлы ask.*, CSP script-src 'self'", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.match(html, /id="tab-ask"/);
  assert.match(html, /id="ask-section"/);
  assert.match(html, /<script src="ask\.js\?v=\d+"><\/script>/);
  assert.match(html, /href="ask\.css\?v=\d+"/);
  assert.match(html, /script-src 'self';/);
  assert.doesNotMatch(html, /<script>[^<]/);  // нет inline-скриптов
});

test("ask.css: кнопки на мобильном ≥48px, цвета только через переменные", () => {
  const css = fs.readFileSync(path.join(ROOT, "ask.css"), "utf8");
  assert.match(css, /min-height:48px/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,6}\b/i);
});
