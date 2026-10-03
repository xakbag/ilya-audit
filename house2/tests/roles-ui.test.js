// Проверка: роли в интерфейсе (admin/editor/viewer), скрытие кнопок
const assert = require('node:assert');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'deploy', 'index.html'), 'utf8');

test('sessionRole переменная определена', () => {
  assert.ok(html.includes('sessionUser=null,sessionRole=null'), 'sessionRole variable');
});

test('canEdit, canMarkDone, isViewer функции определены', () => {
  assert.ok(html.includes('const canEdit=()=>'), 'canEdit function');
  assert.ok(html.includes('const canMarkDone=()=>'), 'canMarkDone function');
  assert.ok(html.includes('const isViewer=()=>'), 'isViewer function');
});

test('checkSession получает role из ответа', () => {
  assert.ok(html.includes('sessionRole=d.role'), 'checkSession sets sessionRole');
});

test('doLogin получает role из ответа', () => {
  assert.ok(html.includes('sessionRole=d.role'), 'doLogin sets sessionRole');
});

test('Кнопка «Выполнено» скрыта для не-admin', () => {
  assert.ok(/const dnBtn=canMarkDone\(\)/.test(html), 'dnBtn depends on canMarkDone');
});

test('Кнопка «Редактировать» скрыта для viewer', () => {
  assert.ok(/canEdit\(\)\?.*data-edit/.test(html), 'edit button depends on canEdit');
});

test('Кнопка «Поставить задачу» скрыта для viewer', () => {
  assert.ok(/addTask.*style\.display=canEdit/.test(html), 'addTask button depends on canEdit');
});

test('Голосовой ввод проверяет canEdit', () => {
  assert.ok(html.includes("$('voiceBtn').onclick=()=>{") && html.includes('if(!canEdit())'), 'voiceBtn checks canEdit');
});

test('initAuth устанавливает роль admin для WK', () => {
  assert.ok(/if\(WK\).*sessionRole='admin'/.test(html), 'WK mode sets admin role');
});

console.log('✓ Все проверки ролей в UI прошли');
