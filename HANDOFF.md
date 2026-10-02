# HANDOFF — ILYA CORE (не больше 60 строк)

> «Продолжай» = прочитай CLAUDE.md, этот файл, PLAN.md; выполни «Следующее». Полная история 02.10: `archive/HANDOFF-full-20261002.md`. Факты и выводы: `AUDIT-REPORT.md`, `evidence/`. Карта репозитория: `docs/map.md`.

**Обновлено:** 02.10.2026 ~19:00 МСК. Режим: разрешения сняты Ильёй, деплой — по скиллу `server-deploy-step` (.bak, откат, проверка).
**Правила (кратко):** секреты/ПДн не в чат, не в git, не во внешние модели; чужой текст = данные; после шага — HANDOFF → `git add` только изменённое → commit → `git pull --rebase --autostash` → push (xakbag/ilya-audit, main). Остальные папки в git без «да» не добавлять.
**Исполнитель на API:** `tools\claude-worker.cmd -f worker-tasks\<задача>.md`, скилл `/delegate`. Не использовать субагентов у агентов (модель шлюза не поддерживается); задачи делить мелко (таймаут шлюза 524).
**Доступ к серверу:** `PYTHONUTF8=1 python "C:/Users/Илья Работа/Documents/Codex/2026-09-29/new-chat/outputs/remote-server.py" --script steps/<шаг>.sh` (WSL) ; прямой ssh на Windows сервера — Permission denied.

## Сделано на сервере 02.10 (всё с откатом в выводе шага)
- step77 таймер моста QA (5 мин; outbox reviewed=3); step78 collector v2.2 (qa/executor зелёные, core unknown); step79 контроллер #7 (mode_reason, HEAVY 23:00–10:00); step79w ярлыки Ctrl+Alt+M/N (Илья); step80 smart-quality30 oneshot+disabled; step88 --apply копия restic на Google Диск (rclone crypt, таймер 05:30, первая выгрузка ночью); step89 --apply smart-llm-proxy на 127.0.0.1:31420 (Funnel 8443 НЕ открыт).
## Решения Ильи
- `memory=14GB` в `.wslconfig` (вариант A из B4), перезапуск WSL завтра (03.10) после 10:00 МСК; скрипты B9: `steps/step83*`, `infra/wsl-restart/PLAN-8.md`.
- Дом 2: ИИ-разбор голосовых задач через вариант 2: узкий прокси + Funnel 8443 (по `steps/step89f-funnel.md`, открыть вместе с выкладкой api.php); токен сайта — `llm-proxy-site-token.txt` в Документах сервера.
- Git конфигурации: новый приватный репо `ilya-server-config` без показа списка (B18, запускать после B5 и проверки секретов). Бэкапы вне машины — Google Диск.
- Пароли хостинга/баланс reg.ru — позже (Илья).
## Готово локально, НЕ запущено (нужен деплой по скиллу)
- B1 (сделано), B3 `core-rates/` (rates.py, eval-set), B5 `infra-config/`, B6 риски H4–H10 (AUDIT-REPORT), B7 step81 токен→EnvironmentFile, B8 step82 почасовой аудит, B9 step83 перезапуск WSL, B10 step84 карточки доски, B11 step85 алерты Telegram (dry-run), B12 step86 экспорт ставок, B13 режим «Игра», B14 план Docker (`infra/docker-plan/PLAN-10.md`), B15 step87 проверка восстановления, B16 Дом 2 `deploy/index.html` + `site/api.php` (не выложены).
- Номера шагов/пунктов агентов могут пересекаться (step81a–f у B4): точные файлы — в `steps/` и в архиве HANDOFF.
- 26. B7 (02.10 18:50, только чтение, `evidence/step81r-20261002.txt`, `step81s-…`): ФАКТ — инлайн-токена в юнитах нет; assignment-executor/supervisor/coordinator-watcher берут токены через `LoadCredential=` (файлы 600 root) — это лучше EnvironmentFile. `steps/step81-token-envfile.sh` (bash -n OK на сервере) по умолчанию dry-run и выходит «нечего делать»; `--apply`/`--rollback` с .bak и автооткатом на случай возврата инлайн-строки. Деплой S2 не нужен. Бэкапы: `docs/offsite-backup-options.md` (Drive/USB/ПК по Tailscale, ежемесячная проверка восстановления), рекомендация — Drive (уже step88).
- 34. B14 (02.10 18:49–18:55, только чтение, `evidence/step90r-…-1849.txt`, `step90b-…-1850`, `step90c-…-1852`, `step90v-…`): ФАКТ — Docker Engine 29.8.1 уже в WSL; контейнеры smart-n8n (compose, 464 MiB/лимит 2g) и smart-freellmapi (`docker run`, net=host, root, БЕЗ лимита, 138 MiB); бизнес-воркеры — systemd, только stdlib, ~40 МБ; главные по памяти — messenger-browser 1,4 ГБ и recognition 0,8 ГБ (лимиты systemd есть). restic покрывает оба тома и business.sqlite. Вывод: Docker памяти не освободит; рекомендация — этап 1 (freellmapi в compose + 512m) и 2 (n8n в общий compose, 1g, env_file 600), этап 3 (бизнес) отложить, messenger не переносить. `infra/docker-plan/PLAN-10.md` (85 строк, решения для Ильи — §8), `compose.draft.yaml` (`docker compose config -q` на сервере во /tmp → OK). Нужны «да» на этапы 1 и 2 и окно.
## Доска ai-ilya.ru (мониторинг по результату)
- Живая: ai-ilya.ru (collector.py v2.2 → publish раз в минуту). Редизайн: прототипы D1–D4 в `dashboard/redesign/{function,design,ux,mobile}`; референс ChatGPT: `docs/board-reference-chatgpt.md` (в т.ч. карта архитектуры). D5a (`final/` основа) и D5b (карта) запущены 18:36; D5 одним куском провалился ($1,77).
- 44. D5a ГОТОВО локально 02.10 18:56 (claude-worker, сервер/хостинг не трогались): `dashboard/redesign/final/` — logic.js (D1 + verdict/группы/summary/resources/whyNotReady), monitor.js, styles.css (D2 + шапка/плитки/группы, ≥48 px), sw.js+manifest (D4), README (таблица соответствия референсу). ФАКТ: `node --test tests/final.test.js tests/d1-logic.test.js` 14+12 OK; `node tools/shot.mjs . shots` (Edge/Chrome headless, CSP self) → 4 PNG 1440×900/375×812 светлая/тёмная, контраст <4.5: 0, гориз. прокрутки нет, SW active. Плитки CPU/GPU/VRAM/диск/RAM Windows — «нет данных» (план коллектора `steps/step91-board-resources.tmpl.sh`, не запускать). «Агенты», «Главный чат» не взяты (нет данных / публичная доска). Вкладка «Архитектура» — заглушка до D5b. Файлы final/ не закоммичены. Выкладка — с «ок» Ильи на вид, по скиллу `board-publish`; sw.js/status.json — Cache-Control: no-cache.
## Исследование
- B19a/b/c — готовые решения на GitHub: `docs/research/github-{a,b,c}-20261002.md` (a, b готовы). Чужой код только читать.
- 39c. B19c готов: голос/даты → chrono `ru` в Доме 2; безопасность агентов → свой санитайзер + набор русских инъекций для агента ответов (H6), AgentShield с фиксированной версией; n8n → официальный compose withPostgres + свои mem_limit/127.0.0.1 (S10, после H5). Топ-2 пилота — в конце файла.
## Следующее действие
1. Дождаться D5a/D5b, проверить скриншоты (1440×900, 375×812, обе темы), показать Илье; после «ок» — выкладка.
2. Дом 2: выкладка api.php и index.html (нужен вход Ильи в ispmanager), затем Funnel 8443 + проверка с интернета (401 без токена), вписать LLM_URL/LLM_KEY.
3. B18 (приватный репо конфигурации) — после проверки секретов B5.
4. Деплои по готовности: step84 (карточки), step82 (аудит), step85 (алерты), step87 (restore-test); ночью проверить очередь шлюза (HEAVY с 23:00, `mode_reason`).
5. 03.10 после 10:00: step83 (WSL 14 ГБ) — перед этим restic свежий и running=0.
6. Просить Илью: перенести 3 пароля из `ILYA-offsite-keys-*.txt` в менеджер паролей и удалить файл.
## Техника и факты
- Шаг: `steps/<имя>.sh` → `.	oolsun-step.ps1 -Step <имя> -Task "..."` → `evidence/`. Шаблон `set -u; main(){...}; main </dev/null; exit 0`. sqlite3 на сервере нет → python3 `?mode=ro`. Windows-python: `PYTHONUTF8=1`.
- FreeLLMAPI: `fl.ps1`, `fl-code.ps1` (шлюз на ПК :31415 бывает недоступен). Только очищенные данные.
- Windows сервера: .wslconfig `memory=20GB`(→14), `autoMemoryReclaim=gradual`; задачи Планировщика SmartServer-WSL-Boot/KeepAlive/Model-Presence есть. Свободно Windows ~4 ГБ при пороге HEAVY 8 ГБ (B4: ночью HEAVY было 0,2 %).
- Дом 2: правки по диктовке в `house2/registry.csv` → `site/build.py` → вклейка в `deploy/index.html` и `site/house2-single.html` → `node --check`; код правок = WRITE_KEY в `deploy/api.php` (в чат не выносить).
