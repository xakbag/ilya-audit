# План: роли, фото, первый экран (ai-ilya.online)

## Что уже есть (проверено 03.10.2026, 14:30)
- **Вход**: `loginScreen`, `checkSession()`, `doLogin()`, сессии в `sessions.json`, лимит попыток в `login_attempts.json`
- **Пользователи в api.php**: `USERS` — массив `'логин' => 'bcrypt-hash'`, сейчас только `'1'` и `'2'` (admin)
- **Объекты**: 4 объекта (`Дом 2`, `Сколково`, `Переделкино-2`, `Переделкино-3`), переключатель `objSwitch`, префиксы `D2-/SK-/P2-/P3-`, фильтр `fobj`, одно поле `object` в задачах
- **Секреты**: разрешение владельца от 30.09 на чтение для задачи, без вывода в чат; bcrypt-хэши заменены на `[R]` при чтении
- **Первый экран**: сводка `.sum` (gauge + tiles `hi/buy/late/q/inw`), но НЕ список задач

## Задачи (по порядку)
### 1. Роли на сервере (api.php)
- [ ] `USERS` → структура `['login' => ['hash' => '...', 'role' => 'admin|editor|viewer']]`
- [ ] Функция `get_user_role($user)` → возвращает роль или null
- [ ] **Проверка действий по роли на сервере** (не только JS):
  - `action=parse` (LLM-разбор) — только admin/editor
  - Запись `ed` (правка задач) — только admin/editor
  - Запись `nt` (новые задачи) — admin/editor
  - **Отметка «Выполнена» (status=Выполнена) — только admin** (editor не может ставить и снимать)
  - `bought` — все (или admin/editor, решить)
- [ ] Ответ 403 `{error: 'forbidden', required_role: 'admin'}` при нарушении

### 2. Роли в интерфейсе (index.html)
- [ ] Переменная `sessionRole` (из `/check_session` → `{ok, user, role}`)
- [ ] Кнопка «✓ Выполнено» видна только `admin` (скрыть `.dn` для editor/viewer)
- [ ] Кнопка «✎ Редактировать» видна только admin/editor (скрыть для viewer)
- [ ] Кнопка «➕ Поставить задачу» видна только admin/editor
- [ ] Голосовой ввод — только admin/editor
- [ ] Для viewer: все input/select/textarea readonly, кнопки сохранения скрыты

### 3. Утилита создания пользователей (house2/tools/add-user.py)
```python
#!/usr/bin/env python3
import sys, bcrypt, json

roles = ['admin', 'editor', 'viewer']
if len(sys.argv) < 3 or sys.argv[2] not in roles:
    print(f"Usage: {sys.argv[0]} <password> <role>")
    print(f"Roles: {', '.join(roles)}")
    sys.exit(1)

password = sys.argv[1].encode('utf-8')
role = sys.argv[2]
salt = bcrypt.gensalt(rounds=12)
hashed = bcrypt.hashpw(password, salt).decode('utf-8')

print(json.dumps({'hash': hashed, 'role': role}, ensure_ascii=False))
# Вставить в USERS: 'login' => {...}
```
- [ ] Проверить `pip install bcrypt` или использовать `password_hash()` PHP напрямую
- [ ] Инструкция в REQUIREMENTS.md: «Генерация: `python house2/tools/add-user.py <pass> <role>`, вставить в api.php вручную»

### 4. Фото (api.php + index.html)
#### Сервер (api.php):
- [ ] Константы: `PHOTO_DIR = __DIR__ . '/photos'`, `MAX_PHOTO_SIZE = 3145728` (3 МБ), `MAX_PHOTOS_PER_TASK = 6`
- [ ] `action=upload_photo`: POST multipart, параметры `task_id`, файл `photo`
  - Проверка роли: viewer+ (или admin/editor — решить)
  - Проверка `task_id` существует
  - `getimagesize()` — только JPEG/PNG/WEBP
  - Имя: `{task_id}_{timestamp}_{rand}.jpg` (lowercase ID)
  - Папка `PHOTO_DIR` создаётся с `.htaccess`: `Require all denied` + `php_flag engine off`
  - Запись метаданных: `photos.json` → `{photo_id: {task_id, filename, uploaded_by, uploaded_at, status: 'pending|approved|rework', comment: ''}}`
  - Ответ: `{ok: true, photo_id, url: 'api.php?action=photo&id=...'}`
- [ ] `action=photo`: GET `?id=<photo_id>` — проверка сессии, возврат `readfile()` с `Content-Type: image/jpeg`
- [ ] `action=list_photos`: GET `?task_id=...` → массив `[{id, url, status, comment, uploaded_at}]` (без `uploaded_by` для viewer)
- [ ] `action=update_photo_status`: POST `{photo_id, status, comment}` — только admin
- [ ] История: добавить `photo_upload`, `photo_status_change` в `history`

#### Клиент (index.html):
- [ ] В карточке задачи (`.bd`): блок «Фото» после материалов
- [ ] Кнопка `<input type="file" accept="image/*" capture="environment" multiple data-photoup="<id>">` + `<button data-photobtn="<id>">📷 Прикрепить фото</button>` (viewer+)
- [ ] Сжатие на клиенте перед отправкой:
  ```js
  function compressPhoto(file, maxW, maxH, quality) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        let {width: w, height: h} = img;
        if (w > maxW || h > maxH) {
          const r = Math.min(maxW / w, maxH / h);
          w *= r; h *= r;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(resolve, 'image/jpeg', quality);
      };
      img.src = URL.createObjectURL(file);
    });
  }
  ```
  Лимиты: `maxW=1600, maxH=1600, quality=0.8`
- [ ] Загрузка: `FormData`, `fetch(API + '?action=upload_photo', {method: 'POST', body: fd})`
- [ ] Список фото: запрос при раскрытии карточки, миниатюры с `<img src="api.php?action=photo&id=...&thumb=1">` (или без thumb, если нет)
- [ ] Статус фото: admin видит `<select data-phs="<photo_id>"><option>pending</option><option>approved</option><option>rework</option></select>` + `<input data-phc="<photo_id>" placeholder="Комментарий">`
- [ ] UZ-тексты: `photoBtn: 'Fotosurat biriktirish'`, `photoStatus: {pending: 'Tekshiruvda', approved: 'Qabul qilindi', rework: 'Qayta ishlash'}`, `photoComment: 'Izoh'`

### 5. Первый экран: задачи с высоким приоритетом и закупкой
- [ ] Переменная `topTasks` — фильтр `KF.hi` (Высокий) + `KF.buy` (нужна закупка), сортировка по `dl` (срок)
- [ ] После `.sum` (gauge + tiles): блок `<div class="top g" id="topList"></div>`, заголовок «Высокий приоритет и закупка»
- [ ] Рендер: `topTasks.slice(0, 10).map(card).join('')` — до 10 задач, полные карточки (как в основном списке)
- [ ] Под блоком — основной список (все объекты или выбранный)
- [ ] Скролл: при загрузке страницы `#topList` видно, основной список ниже

### 6. Слияние dom2 → ai-ilya.online
- [ ] Файл `house2/redirect/index.php`:
  ```php
  <?php header('Location: https://ai-ilya.online/', true, 301); exit;
  ```
- [ ] Файл `house2/redirect/.htaccess`:
  ```
  RewriteEngine On
  RewriteRule ^(.*)$ index.php [L]
  ```
- [ ] **НЕ выкладывать** без явного «да» владельца (проверка редиректа на staging)

### 7. Тесты
#### house2/tests/roles-server.test.js (Node, имитация PHP-ответов или curl):
- [ ] admin может `ed`, `nt`, `status=Выполнена`
- [ ] editor может `ed`, `nt`, НЕ может `status=Выполнена`
- [ ] viewer не может `ed`, `nt`, `status=Выполнена`
- [ ] Ответ 403 при нарушении

#### house2/tests/roles-ui.test.js (Node, чтение HTML + проверка логики):
- [ ] `.dn` скрыта для editor/viewer
- [ ] `#addTask` скрыта для viewer
- [ ] `data-edit` скрыта для viewer

#### house2/tests/photo.test.js (Node, mock upload):
- [ ] Сжатие: 2000×1500 → ≤1600×1200
- [ ] Отклонение файла >3 МБ
- [ ] Отклонение не-изображения

#### house2/tests/top-tasks.test.js (Node):
- [ ] `topTasks` содержит только `priority=Высокий` и `purchase_required=True`
- [ ] Сортировка по `deadline`
- [ ] Не больше 10 задач

#### Скриншоты (Node, house2/tests/shot-h2.mjs):
- [ ] Запуск: `node house2/tests/shot-h2.mjs house2/site/index.html house2/shots`
- [ ] 4 скриншота: 375×812 light/dark, 1440×900 light/dark
- [ ] Проверка: горизонтальная прокрутка (должна быть false), контраст ≥4.5, зоны касания ≥48px (телефон)

### 8. Документация
- [ ] `house2/REQUIREMENTS.md` (обновить): роли, фото, первый экран
- [ ] `HANDOFF.md` (обновить): пункты 1–5 выполнены, слияние готово к деплою (ждёт «да»)

## Критерии готовности
- [ ] Роли проверяются на сервере (403 при нарушении), не только в JS
- [ ] Фото: сжатие, лимиты, статусы, комментарий (только admin), журнал
- [ ] Первый экран: блок «Высокий приоритет и закупка» (до 10 задач) над основным списком
- [ ] Тесты: роли (server + UI), фото, первый экран, скриншоты без горизонтальной прокрутки и с зонами ≥48px
- [ ] Слияние dom2: редирект готов, но НЕ выложен без «да»
- [ ] Дизайн не изменён (палитра, шрифты, карточки — прежние)
- [ ] Коммит без секретов (`.githooks/pre-commit` проверяет)

## Следующий шаг после проверки
Владелец: проверить локально (house2/site/index.html + api.php на локальном PHP), дать «да» на выкладку.
