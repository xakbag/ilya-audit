# AUDIT-REPORT — ILYA CORE, этап 0 (только чтение)

| # | Гипотеза | Статус | Evidence |
|---|---|---|---|
| H1 | Очередь стоит из-за контроллера LIGHT | **Подтверждена с уточнением**: до #2 держала память Windows, после #2 держат блокеры присутствия `interactive_console`/`active_rdp` (код :145-146), ночного окна нет; HEAVY не включался с 27.09 23:10 | evidence/step2-20260929-1357.txt, evidence/step2b-20260929-1359.txt, evidence/step26-transitions-*.txt, evidence/step27-presence-code-*.txt |
| H2 | `empty_queue` при awaiting=4 — неверная метка | **Подтверждена** (awaiting=5) | evidence/step3-20260929-1404.txt, evidence/step3b-20260929-1410.txt |
| H3 | `smart-quality30` failed из-за Restart/Type | **Опровергнута** (start-limit-hit от внешних запусков) | evidence/step3-20260929-1404.txt |
| H4 | Одновременные таймеры → database is locked | **Не подтверждена** (02.10: context/knowledge/qa-bridge стартуют в одну секунду, locked за 7 дней 0) | evidence/step4-20260929-1413.txt, evidence/step84-b6-recheck-20261002.raw.txt |
| H5 | n8n-guard охраняет несуществующий n8n | **Опровергнута** (02.10: smart-n8n healthy, /healthz 200, RestartCount 0) | evidence/step4-20260929-1413.txt, evidence/step84-b6-recheck-20261002.raw.txt, evidence/step84b-b6-detail-20261002.raw.txt |
| H6 | partner@replies может отвечать клиентам | **Опровергнута** (02.10: в ветке replies отправки нет; отправка только proposals + ручное одобрение + флаг) | evidence/step4-20260929-1413.txt, evidence/step84-b6-recheck-20261002.raw.txt, evidence/step84c-b6-extra-20261002-1804.txt |
| H7 | sender тикает каждую минуту при «выключен» | **Подтверждена** (02.10: ~1 запуск/мин, все `disabled, sent 0`, флаг false) | evidence/step4-20260929-1413.txt, evidence/step84-b6-recheck-20261002.raw.txt |
| H8 | Доска открыта через Funnel | **Подтверждена** (весь `/` → :8766 в интернет). 29.09 — владелец решил Funnel оставить, риск принят | evidence/step5-20260929-1425.txt |
| H9 | Бэкапы только локальные | **Подтверждена** (+ токены в копии открытым текстом). 29.09 — решение «только локально»: restic в `C:\Backups\ilya-core`, снимок b2e6d75c 22:06, check OK, таймер 04:45; **восстановление проверено 30.09 11:04** (8457350a: 56/56 файлов, 29/29 SQLite ok) | evidence/step23-restore-test-20260930-1104.txt, evidence/step5b-20260929-1427.txt, evidence/step16-verify-20260929-2208.txt |
| H10 | Автообновления перезапускают службы | **Опровергнута** (02.10: только security, needrestart нет, после openssl 01.10 перезапусков служб нет, процессов со старой libssl 0) | evidence/step4-20260929-1413.txt, evidence/step84-b6-recheck-20261002.raw.txt, evidence/step84c-b6-extra-20261002-1804.txt |
| H11 | Исполнители зависят от smart-vpn | **Не подтверждена** (VPN стабилен, исполнитель выключен) | evidence/step4-20260929-1413.txt |

---

## H1. Очередь шлюза ждёт HEAVY

**Факт** (2026-09-29 13:57–13:59 МСК, `steps/step2.sh`, `steps/step2b.sh`):
- /health шлюза: mode LIGHT, queued 272 (в снимке 28.09 было 140), running 0, completed 175, failed 0, `wait_reason=waiting_for_heavy`; модели в Ollama не загружены, GPU занято 407 МиБ из 16 ГБ.
- `/run/smart-model-controller/state.json`: mode LIGHT, reason `["interactive_console"]`, override AUTO, pending_work 272.
- Сенсор Windows: консоль `unlocked`, RDP нет, CPU 11%, **свободно RAM Windows 3078 МиБ** из 31862.
- Пороги config: вход в HEAVY при RAM Windows ≥ 8192, удержание ≥ 7168 (45 с), критический < 6144; VRAM на входе ≥ 12000.
- Логика `decide()`: сначала присутствие (консоль не заблокирована/RDP), затем `critical_windows_ram`, затем мягкий порог RAM, VRAM, нагрузка.
- Журнал контроллера: 27.09 частые переходы HEAVY↔LIGHT (`critical_windows_ram`/`sustained_low_windows_ram`) каждые 1–25 мин; последний переход 27.09 23:10:21 HEAVY→LIGHT, после этого ~38 ч без записей.
- Шлюз формирует `wait_reason` сам: `"waiting_for_heavy" if pending else "idle_no_backlog"` — причину контроллера не передаёт.

**Причина.** Два независимых блокера: (1) присутствие пользователя (консоль разблокирована); (2) у Windows ~3 ГБ свободной RAM < критического порога 6 ГБ. Даже при блокировке консоли HEAVY не включится. Память Windows съедает WSL: ~17 ГБ page cache удерживает VM (`.wslconfig` 24GB без autoMemoryReclaim, шаг 1).

**Влияние.** Вся тяжёлая работа (272 задачи) стоит ≥ 38 ч. Причина видна только в state.json контроллера; /health и журналы её не показывают. 27.09 — флаппинг режима из-за памяти.

**Исправления:**
1. **P0** — `.wslconfig`: `memory=18GB`–`20GB`, `autoMemoryReclaim=gradual` (нужен перезапуск WSL, окно согласует владелец). Откат: вернуть сохранённую копию `.wslconfig`, перезапуск WSL.
2. **P1** — шлюз: в /health отдавать `controller_reason` из state.json контроллера; контроллер раз в N минут логирует текущую причину удержания LIGHT при pending>0. Откат: git-revert/копия файла кода, restart службы.
3. **P1** — гистерезис против флаппинга (например, выход из HEAVY только после 5 мин ниже critical) и режим «Ночь» (окно, в котором разрешён HEAVY при незаблокированной консоли). Решение владельца.

**Критерий готовности:** свободная RAM Windows в простое ≥ 8 ГБ; при заблокированной консоли/в ночном окне контроллер переходит в HEAVY и queued убывает; /health показывает реальную причину; не более 2 переходов режима в час.

**Нужно от владельца:** ~~окно перезапуска WSL; значение memory~~ **решено 29.09: 20 ГБ + gradual; применено 30.09 в 10:56 по команде «перезапускай сейчас»** (см. «Результат #2»; у Windows свободно ~15,7 ГБ вместо ~2 ГБ, режим всё ещё LIGHT). Осталось: часы ночного окна и разрешён ли HEAVY при незаблокированной консоли в это окно.

---

## H2. Контур качества: `empty_queue` при awaiting=5, исполнителя нет

**Факт** (2026-09-29 14:03–14:10 МСК): status.json — state idle, wait_reason `empty_queue`, awaiting 5, last_progress 27.09 16:22 UTC (≈43 ч без прогресса), heartbeat живой. Код `continuous_quality.py`: `empty_queue` ставится, когда `claim_next()` вернул None (стр. 682, 734), awaiting не учитывается; облачное ревью = `pending_no_supported_executor` (стр. 408, 414). `assignment-executor.service` — inactive/dead, **disabled**; порт 8780 никто не слушает, хотя `assignment-supervisor` шлёт события на `127.0.0.1:8780/v1/events`.
**Причина.** Исполнитель выключен, а метка статуса скрывает это.
**Влияние.** 5 элементов QA ждут ревью или исправления без движения; supervisor показывает healthy.
**Исправления:** P0 — решение владельца: включать ли `assignment-executor` (Codex = платный/квота) или подключить другой адаптер (FreeLLMAPI/Ollama). P1 — wait_reason `awaiting_external_executor` при awaiting>0; supervisor помечает unhealthy, если 8780 недоступен.
**Критерий:** awaiting убывает; wait_reason отражает реальную причину; healthy=false при недоступном исполнителе.
**Откат:** `systemctl disable --now assignment-executor`; копия файла кода.
**Нужно от владельца:** ~~какой исполнитель разрешён~~ **решено 29.09: адаптер на FreeLLMAPI** (план — действие #6 ниже).

**Факт** (2026-09-29 22:53 МСК, evidence/step19-executor-20260929-2253.txt):
- Код исполнителя `/srv/smart-server/assignment-supervisor/codex_event_executor.py` (381 строка, mtime 27.09 18:22); пользователь `assignment-executor` может его читать.
- Юнит: Result=success, NRestarts=0, inactive/dead, disabled; журнал за 2 дня пуст. Значит, не упал, а был штатно остановлен и выключен.
- Логика: `accept` (147) → pending; `claim` (188) — одна задача running; `run_claimed` (250) запускает `codex`, результат в `result-<id>.json`; HTTP `do_POST`/`do_GET` (321/337) на порту 8780.
- Реестр `/etc/assignment-supervisor/executor-tasks.json`: только `synthetic-channel-test`. executor.sqlite: 1 событие completed (синтетический тест).
- quality.sqlite: cases 3 ready; queue 1 technical_failed; runs 3 technical_error; incidents 3 awaiting_fix; outbox 3 × `pending_no_supported_executor` (27.09 16:19–16:22 UTC).

**Причина (факт):** исполнитель исправен, но после синтетического теста 27.09 выключен; в реестре нет ни одной задачи QA, а outbox QA не имеет потребителя.

## H3. `smart-quality30` failed

**Факт:** Type=simple, Restart=on-failure, NRestarts=0, ExecMainStatus=0. 27.09 14:47 — HTTP 404 в `quality30-runner.py`; затем 4 внешних запуска за ~45 мин; 15:33 — успешный выход; 15:35 — ещё один запуск → `start-limit-hit`.
**Причина.** Не Restart=always: лимит StartLimitBurst сработал из-за частых ручных или скриптовых запусков. Разовая задача оформлена как служба с `WantedBy=multi-user.target`.
**Влияние.** Юнит висит в failed и шумит в мониторинге; полезная работа выполнена (exit 0).
**Исправления:** P2 — Type=oneshot, убрать WantedBy (или сделать таймер), затем `reset-failed`.
**Критерий:** `systemctl --failed` не показывает quality30.
**Откат:** вернуть копию юнита, daemon-reload.
**Нужно от владельца:** нужен ли quality30 дальше или он разовый.

## H4. Совпадающие таймеры

**Факт** (2026-09-29 14:13 МСК, step4): context-refresh (`build-context-registry.py`) и knowledge-refresh (`knowledge.py build`) — следующий запуск оба в 14:13:23, OnBootSec 180 с / 3 мин. sender и normalizer (`pipeline.py`) — OnUnitActiveSec=1min, RandomizedDelaySec=15. Строк `database is locked`/`no such column` в журнале за сутки: 0.
**Факт** (step5c, 14:30): context-refresh пишет только JSON (`catalog/context-registry.json`, чтение БД readonly) — с knowledge-refresh по базам не пересекается. sender и normalizer оба пишут в business.sqlite — пересечение реально, но locked-ошибок 0.
**Влияние:** сейчас не наблюдается. **Исправление:** P2 — сдвинуть knowledge-refresh на +2 мин. **Критерий:** 0 locked за 7 дней. **Откат:** копия timer-юнита, daemon-reload. **От владельца:** ничего.

**Перепроверка 02.10 18:00–18:04 МСК** (evidence/step84-b6-recheck-20261002.raw.txt): совпадение есть — `smart-qa-bridge`, `smart-context-refresh`, `smart-knowledge-refresh`: последний запуск 17:56:56, следующий 18:01:56, все три в одну секунду (qa-bridge — новый таймер от 02.10, пишет quality.sqlite; с двумя другими по базам не пересекается). sender и normalizer (оба `pipeline.py`, пишут business.sqlite) — 1 мин ±15 с (18:01:31 и 18:01:50). `database is locked`/`no such column` за 1 и 7 дней: 0.
**Вывод:** не подтверждена, риск теоретический. Исправление P2: развести старты (`RandomizedDelaySec=60` у knowledge-refresh и qa-bridge). **Критерий:** разные секунды в `list-timers`, 0 locked за 7 дней. **Откат:** `.bak` timer-юнитов, daemon-reload. **От владельца:** «да» на правку двух timer-юнитов.

## H5. n8n-guard

**Факт:** `smart-n8n-guard` — oneshot `n8n-health-guard.py`, ~каждые 61 с, After=docker.service; контейнер `smart-n8n` Up 2 days (healthy), 127.0.0.1:5678. Гипотеза опровергнута.
**Исправление:** не требуется (P2 — при переходе на мониторинг по результату заменить healthcheck'ом Docker).

**Перепроверка 02.10** (evidence/step84-b6-recheck-20261002.raw.txt, evidence/step84b-b6-detail-20261002.raw.txt): `smart-n8n-guard.timer` enabled, сервис oneshot Result=success; за 10 мин 10 прогонов, реальных восстановлений за 3 дня 0; `docker inspect smart-n8n`: StartedAt 2026-09-30 07:56:57Z, RestartCount 0; `127.0.0.1:5678/healthz` → 200. Юнита n8n в systemd нет, n8n только в Docker — guard охраняет реальный контейнер. Опровергнута. Мелочь P2: 174 строки журнала в час от guard (шум).

## H6. partner@replies

**Факт:** юнит inactive/dead. `partner_agents.py`: пишет только `state='draft_unapproved'` (стр. 321, 329); отправка — `approve_batch` (398) → `stage_approved_batch` (406), требует `state=approved`. Отправлено 0. Опровергнута: автоответов клиентам нет.
**Исправление:** не требуется. Зафиксировать политику «только черновики» (решение владельца, §7 п.10).

**Перепроверка 02.10** (evidence/step84-b6-recheck-20261002.raw.txt, evidence/step84c-b6-extra-20261002-1804.txt; читался только код, тексты клиентов — нет): `partner@replies` запускает `ilya-business-partner-replies.timer` (~5 мин), User=smart-business, `partner_agents.py` mtime 27.09 12:15 (без изменений). Ветка `replies` (стр. 628–632): только `poll_gmail_replies` и локальный анализ (`submit_reply_reviews`), вызова отправки нет. Единственный путь к SMTP — `dispatch_deliveries` (стр. 451): вызывается только из ветки `proposals` (стр. 623), берёт только `proposal_deliveries.state='ready'` (после ручных `approve_batch` → `stage_approved_batch`) и только при `BUSINESS_SEND_ENABLED=="true"`. Ни один таймер `approve_batch` не вызывает. Флаг сейчас `false`.
**Вывод:** опровергнута, автоответов нет; защита двойная (ручное одобрение + флаг). **Гипотеза-риск:** при включении флага все уже одобренные `ready` уйдут по таймеру proposals — это ожидаемое поведение. P2: закрепить «только черновики» в CONSTITUTION, показывать число `ready` на доске. **От владельца:** политика ответов клиентам (§7).

## H7. sender при выключенной отправке

**Факт:** timer каждую минуту запускает `pipeline.py sender`; стр. 196 `send(..., enabled=os.environ.get('BUSINESS_SEND_ENABLED')=='true')`, иначе возвращает `{'state':'disabled','sent':0}`. Env из `/etc/ilya-business/workers.env` (не читался).
**Влияние:** ~1440 холостых запусков в сутки, шум в журнале; статус «выключен» не виден в systemctl.
**Исправление:** P2 — при выключенной отправке держать таймер disabled; флаг и таймер синхронизировать. **Критерий:** 0 запусков sender при BUSINESS_SEND_ENABLED≠true. **Откат:** `systemctl enable --now ilya-business-sender.timer`. **От владельца:** согласие.

**Перепроверка 02.10 18:00 МСК** (evidence/step84-b6-recheck-20261002.raw.txt): `ilya-business-sender.timer` active/enabled, OnUnitActiveSec=1min, RandomizedDelaySec=15; за 60 мин 96 строк Started/Finished/Deactivated (≈1 прогон в минуту); каждый прогон пишет `{"state": "disabled", "sent": 0}`. В `/etc/ilya-business/workers.env` (прочитан только этот флаг) `BUSINESS_SEND_ENABLED=false`, mtime 26.09. `pipeline.py` стр. 153 и 196 без изменений с 26.09.
**Вывод:** подтверждена. Вреда нет: шум и ~1440 холостых запусков Python в сутки. Исправление P2: `systemctl disable --now ilya-business-sender.timer`, пока флаг false; при включении отправки — включить таймер. **Критерий:** за 1 ч 0 запусков sender при флаге false. **Откат:** `systemctl enable --now ilya-business-sender.timer`. **От владельца:** «да».

## H8. Доска в интернете через Tailscale Funnel

**Факт** (2026-09-29 14:24 МСК, step5): `tailscale funnel status` — `https://desktop-i53h0d8.taile433c9.ts.net (Funnel on)`, `/ proxy http://127.0.0.1:8766`. Доска доступна из интернета любому, кто знает адрес.
**Влияние:** утечка данных доски/управления наружу. **P0.**
**Исправление:** `tailscale funnel off` (оставить `serve` только внутри tailnet) или auth на доске.
**Критерий:** `funnel status` без «Funnel on»; с устройства вне tailnet адрес не открывается; внутри tailnet открывается.
**Откат:** `tailscale funnel --bg http://127.0.0.1:8766`.
**Решение владельца (29.09):** Funnel **оставить**. Риск принят владельцем, действие #1 закрыто. При желании позже: пароль/auth на доске без закрытия Funnel.

## H9. Бэкапы только локальные

**Факт** (step5b 14:27, step5c 14:30): `smart-database-backup.timer` ежедневно 04:30 МСК → `apps/backup-databases.py` → `/srv/smart-server/backups/daily`. Копирование `sqlite3 backup()` из `mode=ro` — корректно при WAL. Базы: documents, knowledge, n8n, core (tasks.sqlite), telegram (gateway.sqlite), messenger-context. Ротация: `shutil.rmtree` старых (стр. 32); в daily 7 копий (27.09–29.09), новая 599M; весь `backups/` 4.9G. Прогоны 28.09 и 29.09 OK. rclone/restic нет, внешних монтирований нет, восстановление не проверялось. **В копию попадают секреты открытым текстом:** `core-access-token`, `telegram-bot-token`, `n8n-env`, `n8n-config`.
**Влияние:** отказ диска/WSL = потеря всех данных и бэкапов; любая выгрузка копии «как есть» = утечка токенов.
**Исправление (P0/P1):** restic (шифрование) → внешняя цель (выбор владельца, **не Google**) после локального бэкапа; ежемесячная проверка восстановления в отдельный каталог + сверка `integrity_check` копии.
**Критерий:** во внешнем хранилище снапшот ≤ 24 ч; `restic check` OK; тестовое восстановление раз в месяц с записью результата.
**Откат:** отключить таймер выгрузки; локальный бэкап не трогается.
**Нужно от владельца:** выбор внешней цели и доступ к ней; хранение пароля restic вне сервера.

**Ход работ (29.09):**
- 20:49 — remote `gdrive` на сервере переведён на OAuth-клиент владельца (проект serious-music-459710-j4, приложение «Ilya-AI», режим Testing). Бэкап конфига: `/root/.config/rclone/rclone.conf.bak-20260929-204919`. Откат: `cp` его обратно.
- 20:51 — **факт** (evidence/step13-check-20260929-2052.txt): `rclone lsd gdrive:` rc=0; старое хранилище `ilya-core-backup` читается (0 снимков, ~1,3 ГиБ мусора от прерванной выгрузки); `ilya-core-backup2` ещё нет; restic не запущен.
- **Риск:** в режиме Testing refresh-токен Google живёт 7 дней → примерно 06.10 выгрузка начнёт падать. Исправление: опубликовать приложение (Production) или перейти на сервисный аккаунт. Решение владельца.
- Владелец дал «да» на `steps/step12.sh` — первый бэкап в `rclone:gdrive:ilya-core-backup2` (юнит `restic-first`, затем `restic check`).
- 21:13 — **факт**: выгружено 7056 файлов, ~9,3 ГиБ, ошибок 0.
- 21:16:22 — **факт** (evidence/step12-watch-20260929-2118.txt): снимок `0e4258ee` (2026-09-29 21:01:37, тег `first`); `restic check` — «no errors were found», `check rc=0`; юнит `restic-first` inactive/dead, ExecMainStatus=0; CPU 2 мин 9 с, пик памяти 4,9G, swap 0.
- 21:29 — **факт** (evidence/step12-summary-20260929-2127.txt, evidence/step12-verify-20260929-2129.txt): в снимке 7928 файлов, 10,169 ГиБ (9,143 ГиБ после сжатия); снимки SQLite: `ok=29 failed=0`, в `0e4258ee` 29 файлов `.snap` (core, business, catalog, messenger-context, telegram, ilya-map, assignment-executor, coordinator-watcher, smart-quality, smart-local-ai, docker volumes). Локальная папка `/var/backups/ilya-backup` пуста (8K): скрипт удаляет её после выгрузки, так задумано.
- Попутно: в `/var/lib/docker/volumes` есть SQLite, значит Docker используется. Это сходится с H5: n8n работает в контейнере `smart-n8n`.
- **Не сделано:** `check --read-data` (данные не перечитывались), регулярный таймер проверки (разовое тестовое восстановление выполнено 30.09 11:04). Кандидаты на исключение из регулярного бэкапа: `incoming/*.zip`, `ollama-linux-amd64.tar.zst`, модели faster-whisper в `messenger-context/models`.
- **29.09, решение владельца:** Google Drive/Cloud исключён из процесса как нестабильный. Пункт «OAuth в Production» отменён. Снимок `0e4258ee` в `gdrive:ilya-core-backup2` остаётся как есть и не поддерживается; после ~06.10 будет недоступен с сервера. Папки на Drive (`ilya-core-backup`, `ilya-core-backup2`) владелец удаляет сам, если захочет. Remote `gdrive` и `rclone` на сервере пока не трогаются, удаление только по «да».
- Откат первого бэкапа: `restic forget --tag first --prune` + `rm -rf /var/backups/ilya-backup`.
- **29.09, решение владельца: «только локально».** Действие #4 (внешняя цель) отменено.
- 22:06–22:07 — **факт** (evidence/step16-verify-20260929-2208.txt): новый репозиторий restic `/mnt/c/Backups/ilya-core` (= `C:\Backups\ilya-core` на диске Windows, вне VHD WSL). `ilya-backup.service` Result=success (22:06:29–22:07:06), снимок `b2e6d75c` (22:06:34, тег daily), 29 `.snap`, 3.8G; `restic check` — «no errors were found». `ilya-backup.timer` — ежедневно 04:45 (после `smart-database-backup` 04:30). Пароль в `/etc/restic/password`; копию ключа владелец сохранил у себя, локальный файл с ключом удалён.
- **Статус H9:** ежедневный зашифрованный бэкап есть, но на том же ПК (отказ диска C: = потеря и данных, и копий — риск принят решением «только локально»). Восстановление проверено 30.09 11:04 (см. «Результат #5»).
- Откат step16: `systemctl disable --now ilya-backup.timer; systemctl stop ilya-backup.service; rm -f /etc/systemd/system/ilya-backup.{service,timer}; systemctl daemon-reload; rm -rf /mnt/c/Backups/ilya-core /var/backups/ilya-backup`.

## Базы: `no such column owner_id/channel`

**Факт** (step5c): в `core/data/tasks.sqlite` колонки `owner_id,channel` есть только в `conversation_context`; в `tasks` их нет (`id,request_key,question,project,state,…,context_json`). В копиях `continuous_quality.py` (backups/continuous-quality-20260927-*) стр. 379: `select owner_id,channel from tasks where id=?` — несоответствие схеме.
**Факт** (2026-09-29 21:34 МСК, evidence/step14-20260929-2134.txt): служба запускает `/srv/smart-server/apps/continuous_quality.py --daemon`. Это единственная живая копия, mtime 27.09 19:19, md5 81b1c3d7. Стр. 33: `CORE_DB = APP_ROOT / "core/data/tasks.sqlite"`. Стр. 379: тот же `select owner_id,channel from tasks`. Стр. 386: `delete from tasks`. В журнале службы ошибок `no such column` за 3 дня 0, по всем юнитам тоже 0. Были ошибки другого рода: 27.09 в 18:38–18:42 трижды `table candidates has 9 columns but 8 values were supplied`. Это до правки файла в 19:19, после неё таких ошибок нет.
**Гипотеза:** запрос на стр. 379 выполняется редко (только при удалении задачи Core), поэтому ошибка пока не проявилась. Значение `APP_ROOT` не проверено. Если это `/srv/smart-server/apps`, запрос идёт в другую базу, которой может не быть.
**Влияние:** сейчас не наблюдается. Первое же удаление задачи через QA упадёт.
**Исправление (P1):** брать owner_id/channel из `conversation_context` через `tasks.conversation_id`; проверять версию схемы при старте; сверить `APP_ROOT`. Код пишет FreeLLMAPI, ревью моё. **Критерий:** тест на копии базы проходит; за 7 дней 0 `OperationalError`. **Откат:** копия файла + restart `smart-quality-continuous`. **От владельца:** «да» на правку файла и перезапуск.

## H10. Автообновления

**Факт:** `20auto-upgrades`: Update-Package-Lists "1", Unattended-Upgrade "1"; apt-daily-upgrade ежедневно ~06:30. Обновлялись: 27.09 libsqlite3, rsyslog, polkitd; 29.09 python3-jwt, python3-requests, libevent-core. Настройки Automatic-Reboot/needrestart не найдены (grep пуст).
**Гипотеза:** обновление libsqlite3/python3-* без перезапуска служб — старые библиотеки в памяти; перезапуски не доказаны.
**Исправление:** P2 — оставить только security-обновления, окно в ночное время, журнал перезапусков. **От владельца:** политика обновлений.

**Перепроверка 02.10** (evidence/step84-b6-recheck-20261002.raw.txt, evidence/step84c-b6-extra-20261002-1804.txt): `Allowed-Origins` — только `-security` (noble-security, ESM apps/infra security); `apt-daily-upgrade.timer` ежедневно 06:39–06:43; `needrestart` не установлен, Automatic-Reboot не задан. Последнее обновление 01.10 06:15:39–06:15:43 (openssl/libssl3t64/libssl-dev, libheif, libauthen-sasl-perl); 02.10 — «No packages found». В 20 мин после обновления — только обычные таймерные oneshot (knowledge/context/entity-refresh, partner, channels, packagekit), остановок основных служб нет. Основные службы стартовали 30.09 10:56 (загрузка) или 02.10 17:48 (controller, local-ai — вручную, шаг 79), NRestarts=0. Процессов со старой (deleted) libssl/libcrypto/libsqlite3: 0.
**Вывод:** перезапусков служб автообновлениями нет — опровергнута. Обратный риск (гипотеза): без needrestart службы после security-обновления могут держать старую библиотеку; сейчас таких 0. P2: оставить security-only; в почасовой аудит добавить счётчик процессов с `(deleted)` библиотеками. **Критерий:** счётчик на доске, 0 после каждой ночи. **Откат:** не требуется. **От владельца:** подтвердить политику security-only.

## H11. smart-vpn

**Факт:** active/running, NRestarts=0, ошибок error/fail/timeout за 3 дня: 0. Проверить связь с исполнителем нельзя — исполнитель выключен (H2).
**Статус:** не подтверждена; вернуться после включения исполнителя.

---

## Итог этапа 0 (29.09.2026, 21:40 МСК)

1. **Полезная работа стоит.** Шлюз: 272 задачи ждут HEAVY ≥ 38 ч. QA: 5 элементов без движения ≈ 2 суток. В обоих случаях службы active, heartbeat живой, а прогресса нет.
2. **Причина по шлюзу (H1):** консоль разблокирована, свободной RAM у Windows ~3 ГБ при критическом пороге 6 ГБ. Память держит page cache WSL: `.wslconfig` 24 ГБ без `autoMemoryReclaim`.
3. **Причина по QA (H2):** `assignment-executor` выключен (disabled, порт 8780 пуст), а статус показывает `empty_queue`, supervisor показывает healthy.
4. **Наблюдаемость:** причины ожидания не доходят до /health и журналов. Это общий дефект, из-за которого простой выглядел как «всё работает».
5. **Безопасность (H8):** доска `:8766` открыта в интернет через Tailscale Funnel. Владелец решил оставить, риск принят.
6. **Бэкапы (H9):** с 29.09 ежедневный restic в `C:\Backups\ilya-core` (04:45), снимок b2e6d75c, check OK. Копия только на этом ПК (решение владельца). Восстановление проверено 30.09 11:04: 29/29 баз целы, файлы совпадают. Незашифрованные локальные бэкапы в `/srv/smart-server/backups` содержат токены открытым текстом (#10).
7. **Код против схемы:** в `continuous_quality.py:379` запрос `owner_id,channel from tasks` не совпадает со схемой `tasks.sqlite`. Ошибка пока не проявилась, но упадёт при первом удалении задачи.
8. **Опровергнуто:** H3 (quality30 упал из-за частых внешних запусков, а не из-за Restart), H5 (n8n жив в Docker), H6 (агент ответов делает только черновики), H11 (VPN стабилен).
9. **Мелочи (P2):** sender тикает 1440 раз в сутки впустую (H7); knowledge-refresh совпадает по времени с context-refresh (H4, без ошибок); unattended-upgrades без окна (H10).

### Предлагаемые изменения — каждое отдельно на «да»

| # | Действие | Пр. | Откат | От владельца |
|---|---|---|---|---|
| 1 | ~~`tailscale funnel off`~~ **закрыто 29.09: владелец решил Funnel оставить** | — | — | — |
| 2 | `.wslconfig`: `memory=20GB`, `autoMemoryReclaim=gradual` + разовый ночной перезапуск WSL задачей Планировщика (план ниже) | P0 | копия `.wslconfig`, перезапуск WSL | «да» на план |
| 3 | ~~Таймер restic~~ **выполнено 29.09 22:06:** `ilya-backup.timer` 04:45, репозиторий `C:\Backups\ilya-core` | — | см. H9 | — |
| 4 | ~~Внешняя цель restic~~ **отменено 29.09: решение «только локально»** | — | — | — |
| 5 | ~~Тестовое восстановление~~ **выполнено 30.09 11:04:** 8457350a, 56/56 файлов, 29/29 SQLite ok | — | см. «Результат #5» | — |
| 6 | Исполнитель QA: адаптер на FreeLLMAPI (127.0.0.1:31416) для outbox `pending_no_supported_executor` (план ниже) | P0 | см. план | **ОДОБРЕНО 30.09**; ждёт восстановления SSH (ключ хоста) |
| 7 | Контроллер: HEAVY разрешён 23:00–10:00 ежедневно; датчик присутствия больше не блокирует; хоткей Windows → LIGHT (override с TTL) | P1 | копия config и .py | решено 30.09 (окно, хоткей); нужен конкретный план → «да» |
| 8 | /health шлюза: `controller_reason`; QA: `awaiting_external_executor`; supervisor unhealthy без 8780 | P1 | копии файлов, restart | «да» |
| 9 | `continuous_quality.py:379`: owner_id/channel через `conversation_context` | P1 | копия файла, restart | «да» |
| 10 | Убрать токены из локальных бэкапов (или шифровать `backups/`) | P1 | копия скрипта | «да» |
| 11 | `smart-quality30`: Type=oneshot, без WantedBy, `reset-failed` | P2 | копия юнита | нужен ли он дальше |
| 12 | sender-таймер выключать вместе с флагом отправки | P2 | `enable --now` таймера | «да» |
| 13 | knowledge-refresh +2 мин; unattended-upgrades только security, ночью | P2 | копии юнитов/конфига | политика обновлений |
| 14 | Отдельный пользователь только для чтения для аудита | P1 | `userdel` | «да» |

---

## План #2: память WSL (20 ГБ + gradual) и ночной перезапуск

**Факты (step20 29.09 23:04, step20b 23:05):**
- WSL 2.7.14.0, ядро 6.18.33.2-2, Windows 10.0.19045.6456. Источник: `evidence/step20-wsl-keepalive-20260929-2304.txt`.
- `C:\Users\Ilya\.wslconfig` (изменён 26.09 19:25): `memory=24GB, processors=8, swap=4GB, localhostForwarding=true`. `autoMemoryReclaim` нет.
- **Автоподъём WSL без входа владельца уже есть.** Задача `\SmartServer-WSL-Boot` запускается при загрузке от имени Ilya (S4U, Highest) и выполняет `C:\ProgramData\SmartServer\Keep-WSL.ps1`. Скрипт в бесконечном цикле держит `wsl.exe … /bin/sleep infinity`. Если WSL завершается, скрипт пишет строку в `wsl-lifecycle.log` и **через 30 с поднимает WSL снова** (`evidence/step20b-keep-wsl-20260929-2305.txt`).
- Вторая задача `\SmartServer-WSL-KeepAlive` запускается при входе и держит WSL разово. После перезапуска WSL она не нужна, её работу выполняет Boot-задача.
- Висит `wsl.exe … rclone config` с 29.09 15:46, остаток попытки с GDrive. Перезапуск его завершит, это ожидаемо.
- Ночные таймеры: 01:22 collector, 02:31 partner-search, 04:30 smart-database-backup, 04:45 ilya-backup, 06:57 apt-daily-upgrade. **Свободное окно 03:00–04:00.**

**Шаги (каждый выполняется после одного «да» на весь план):**
1. Сделать копию `C:\Users\Ilya\.wslconfig` → `C:\Users\Ilya\.wslconfig.bak-20260929`.
2. Новый `.wslconfig`. Остальные значения не меняются:
   ```
   [wsl2]
   memory=20GB
   processors=8
   swap=4GB
   localhostForwarding=true

   [experimental]
   autoMemoryReclaim=gradual
   ```
   Файл читается только при старте VM, поэтому до перезапуска ничего не изменится.
3. Создать разовую задачу Планировщика `\SmartServer-WSL-NightRestart`: запуск 30.09 в 03:30 от имени Ilya (S4U). Действие: записать строку в `wsl-lifecycle.log`, затем `wsl.exe --shutdown`. Поднимать WSL задача не должна: это за ≤30 с сделает Keep-WSL.ps1, а systemd поднимет службы. Задачу удалить после успешного прогона. Скрипт задачи пишет FreeLLMAPI (`fl-code.ps1`), я проверяю. LLM в самом перезапуске не участвует.
4. Проверка утром (только чтение) по списку ниже.

**Критерий готовности (замер после 03:30):**
- WSL `free -m`: total ≈ 20 000 МБ;
- у Windows свободно ≥ 6 ГБ днём при тех же нагрузках (было 3,2 ГБ);
- `systemctl list-units --failed` не хуже, чем до перезапуска;
- `/health` на 8771 отвечает;
- контроллер выходит из LIGHT, если его держала память (проверка H1);
- бэкапы 04:30 и 04:45 прошли, в restic появился новый снимок.

**Откат:** скопировать `.wslconfig.bak-20260929` обратно в `.wslconfig`, выполнить `wsl --shutdown` (Keep-WSL поднимет WSL сам), удалить задачу `\SmartServer-WSL-NightRestart`.

**Риск:** службы, работающие в 03:30, будут прерваны. По таймерам в это время ничего не запланировано. Постоянные службы (шлюз, n8n в Docker, FreeLLMAPI с `unless-stopped`) поднимаются автоматически.

### Результат #2 (применено 30.09 10:56, замер 10:58)

Владелец 30.09 утром решил «перезапускай сейчас», поэтому ночная задача `\SmartServer-WSL-NightRestart` не создавалась. Копия `.wslconfig.bak-20260929` сделана, новый конфиг проверен, `wsl --shutdown` выполнен отвязанным процессом через WMI. Keep-WSL поднял WSL сам (`wsl-lifecycle.log`: 10:56:49 shutdown, 10:56:50 keeper retry).

| Показатель | До (10:55:59) | После (10:58:44) |
|---|---|---|
| WSL `free -m` total | 24033 МБ | **20001 МБ** |
| WSL buff/cache | 20715 МБ | 5322 МБ (1-я минута аптайма) |
| WSL swap used | 1819 МБ | 77 МБ |
| Windows свободно | ~2,0 ГБ | **~15,7 ГБ** |
| failed units | 1 (`smart-quality30`) | 0 |
| systemd | — | running |
| /health 8771 | LIGHT, queued 310, completed 175 | LIGHT, queued 318, completed 175, failed 0 |
| Docker freellmapi / n8n | healthy | healthy |
| GPU | 452 МиБ, 0 % | 445 МиБ, 0 % |

**Критерии:** total ≈ 20 ГБ — выполнено; Windows ≥ 6 ГБ — выполнено (на 1-й минуте); failed не хуже — выполнено; /health отвечает — выполнено; ночные бэкапы 30.09 04:30/04:45 прошли, следующий запуск 01.10.

**Оговорки (гипотезы, требуют повторного замера):**
- замер на 1-й минуте, кэш ещё пуст; работает ли `gradual`, будет видно через несколько часов (цель: у Windows ≥ 6 ГБ днём);
- контроллер остался в LIGHT, `completed` не растёт. Память больше не блокирует, но остаётся блокер присутствия (`interactive_console`) — проверить по state.json контроллера;
- `smart-quality30` не в failed только из-за перезапуска; причина start-limit-hit (H3) не устранена.

**Evidence:** `evidence/step22-pre-20260930-1056.txt`, `evidence/step22-post-20260930-1059.txt`; скрипты `steps/step22-{pre,apply,post}.sh`.

### Результат #5 (тестовое восстановление, 30.09 11:04)

**Факт:** снимки b2e6d75c (29.09 22:06) и 8457350a (30.09 04:45, ночной таймер). Восстановлен latest 8457350a во `/var/tmp/restic-restore-test` (юниты, исполнитель, реестр, status.json, копии SQLite): 641,6 МиБ, < 1 с, rc=0.
- файлы vs живые (sha256): same=56, diff=0, missing=0;
- SQLite-копии: 29 из 29 `integrity_check = ok`; строк в копии = живым или меньше (базы выросли после 04:45), например tasks 253=253, documents 1007042=1007042, knowledge 1102442 vs 1102564;
- временный каталог удалён.

**Вывод:** бэкап восстанавливается и пригоден. Остаётся принятый риск: копия на том же ПК. Не сделано: `restic check --read-data`, ежемесячная автоматическая проверка.

**Evidence:** `evidence/step23-restore-test-20260930-1104.txt`; скрипт `steps/step23-restore-test.sh`.

### Повторный замер после #2 и причина стоящего шлюза (30.09, 13:20–13:25)

**Факты:**
- 13:20. WSL total 20001, buff/cache 5822, available 17565. У Windows свободно ~14,8 ГБ, за 2,5 часа кэш не разросся, значит `gradual` работает. Упавших юнитов 0, оба контейнера healthy. GPU 577/16376 МиБ.
- Шлюз: LIGHT, queued 334 (было 318 в 10:58), completed 175 без изменений.
- Журнал контроллера (step26): до #2, 27.09 14:45–23:10, было ~30 переходов HEAVY↔LIGHT по `low/sustained_low/critical_windows_ram`. Последний переход 27.09 23:10:21 `HEAVY->LIGHT sustained_low_windows_ram`. С тех пор HEAVY не включался ни разу, а это ~2,5 суток.
- Код `model_presence_controller.py:145-146`. Жёсткие блокеры: `console_lock_state ∉ {locked,no_console}` → `interactive_console`; `active_rdp is not False` → `active_rdp`. Любой из них сразу даёт LIGHT и сбрасывает таймеры подтверждения.
- state.json: в 13:23 причина `interactive_console`, в 13:25 `active_rdp`. Датчик в 13:24: `locked`, `active_rdp=True`. Противоречия нет: консоль заблокировали, но осталась RDP-сессия.

**Вывод по H1 (уточнён):** до #2 шлюз держала память. После #2 держит присутствие: открытая консоль или любая RDP-сессия, вероятно и отключённая (гипотеза). На ПК играют дети и заходит владелец, поэтому по этому правилу HEAVY почти никогда не наступает.

**Дефект наблюдаемости:** причина есть только в `state.json.reason`. В `/health` 8771 её нет.

**Предложение #7 (P0, на согласование):** режимы Игра/День/Ночь.
- Ночное окно (например, 01:00–07:00): HEAVY разрешён при RDP и заблокированной консоли. RAM, VRAM и нагрузка GPU остаются защитами: если идёт игра, GPU занят, и защита сработает.
- Днём как сейчас.
- `wait_reason` вывести в `/health`.
- Откат: вернуть `.bak` контроллера и перезапустить `smart-model-controller`.
- Критерий: `completed` растёт ночью, очередь 334 уменьшается.
- От владельца: «да» и часы окна.

**Evidence:** `evidence/step24-status-*.txt`, `evidence/step25-reason-*.txt`, `evidence/step26-transitions-*.txt`, `evidence/step27-presence-code-*.txt`.

## План #6: исполнитель QA через FreeLLMAPI (устарел, см. План #6b)

**Факты (step19):**
- В outbox `quality.sqlite` 3 события `pending_no_supported_executor`: `evt-inc-9cfab38f9eb1f0a2`, `evt-inc-e8275ed80dfb1436`, `evt-inc-9360ca38c8b52f49`.
- 3 инцидента в `awaiting_fix`.
- Исполнитель `codex_event_executor.py` (порт 8780, юнит `assignment-executor`) выключен. Его реестр `/etc/assignment-supervisor/executor-tasks.json` знает только `synthetic-channel-test`. Исполняет через codex.
- FreeLLMAPI на сервере: `127.0.0.1:31416` (контейнер `smart-freellmapi`), `/v1/*` требует ключ.

**Вариант (рекомендую): новый бэкенд внутри существующего исполнителя.** Протокол `accept → claim → run_claimed → receipt` и проверка supervisor не меняются, меняется только то, что вызывается в `run_claimed`.
1. Чтение (step21): формат payload событий outbox (только имена полей, без текстов), формат receipt, которого ждёт supervisor, тесты `test_codex_event_executor.py`.
2. Код: в `run_claimed` добавить бэкенд `freellmapi`. Он отправляет задание на `127.0.0.1:31416/v1/chat/completions`, ключ процесс читает сам из файла (права `assignment-executor`, в отчёты ключ не попадает). Ответ приходит как **предложение исправления** (текст/патч в receipt), в код и базы ничего автоматически не применяется. Код пишет `fl-code.ps1`, я проверяю, тесты гоняю локально.
3. Реестр: добавить тип задачи для событий QA-инцидентов с `backend=freellmapi`, таймаутом и лимитом повторов (2).
4. Выкладка: копии `codex_event_executor.py` и `executor-tasks.json` → `*.bak-<дата>`, `systemctl enable --now assignment-executor`.
5. Проверка: supervisor отдаёт одно событие из outbox, смотрим цепочку ACK → started → completed в журнале и receipt. Только потом остальные два.

**Критерий готовности:** 3 события outbox вышли из `pending_no_supported_executor` в `completed` или `failed` с причиной. На каждое есть receipt. Инциденты сдвинулись из `awaiting_fix`. QA-статус больше не показывает `empty_queue` при `awaiting>0`. `assignment-executor` active, `MemoryMax=768M` соблюдается.

**Откат:** `systemctl disable --now assignment-executor`, вернуть `.bak` файлы. События, которые остались невыполненными, вернутся в `pending_no_supported_executor`. Проверить это в step21 по коду `claim`.

**От владельца:** «да» на план. Решение, можно ли FreeLLMAPI-исполнителю в будущем **применять** исправления самому, пока только предлагает.

## План #6b: мост QA→исполнитель (01.10, заменяет устаревший «План #6»)
**Факты (01.10 11:23, `evidence/step74-bridge-check-20261001-*.txt`, `step73-bridge-recon-20261001-1119.txt`):**
- `assignment-executor` active, бэкенд `freellmapi` (порт 31416), MemoryMax=768M; токен HTTP из credential.
- В серверном реестре уже есть `qa-substantive-review` (enabled, allow_kinds=substantive_error, external_effects=false), workspace создан 30.09 17:47. Правка реестра не нужна.
- В outbox `quality.sqlite` 3 события `pending_no_supported_executor` (evt-inc-9cfab38f…, e8275ed8…, 9360ca38…).
- `continuous_quality.py`: `executor_adapter_configured: False` зашито (стр. 576); никто не отправляет outbox на 8780 — **недостающее звено = диспетчер**.
- Побочная находка (P2): токен исполнителя дублируется в `Environment=` юнита (виден через `systemctl show`); достаточно `LoadCredential`.

**Предложение (P0):** отдельный скрипт `qa-outbox-dispatcher.py` + таймер (5 мин), `continuous_quality.py` не трогаем.
- Выборка: outbox `state='pending_no_supported_executor'`, по одному.
- Payload: delivery_id=event_id, incident_id, revision=1, task_id=`qa-substantive-review`, owner_id=`core-owner-and-astra`, kind=`substantive_error`, severity, title/detail ← summary/evidence, action_required, analysis.
- POST `127.0.0.1:8780/v1/events` (токен из credential, не логируется) → опрос `GET /v1/events/<sha>` → `outbox.state`: `sent` при accepted, `reviewed` при completed; failed — с причиной.
- Запись в `quality.sqlite`: busy_timeout=5000, одна короткая транзакция на событие (гонка с smart-quality-continuous).
- Пилот: ручной запуск на 1 событии, затем остальные 2, затем таймер.

**Критерий готовности:** 3 события accepted→completed с `status/summary/evidence/next_step`; outbox.state ≠ pending; счётчики sent/reviewed > 0; в status.json нет `empty_queue` при awaiting>0; исполнитель в пределах 768M.
**Откат:** `systemctl disable --now qa-outbox-dispatcher.timer`; удалить юнит/скрипт; `.bak` quality.sqlite (снят через `sqlite3.backup()`) или `update outbox set state='pending_no_supported_executor'` для 3 event_id.
**Нужно от владельца:** только «да» на пилот.

## B4. Свободная память Windows ночью и HEAVY (02.10, 17:43–17:51 МСК)

**Факт:** журнал `smart-model-controller` с 27.09 14:44 по 02.10 17:48 (~123 ч): HEAVY 5,7 ч (4,6 %), LIGHT по RAM 114,6 ч (93 %). Ночью (23:00–10:00) HEAVY 0,13 ч из 55 (0,2 %). Причины входа в LIGHT: `sustained_low_windows_ram` 10, `low_windows_ram` 3, `critical_windows_ram` 3. После 30.09 13:39 переходов нет. Свободная RAM Windows 02.10 17:47–17:51: 3645–3823 МиБ при пороге входа 8192. `vmmem` держит 19,9–20,0 ГБ из лимита 20 ГБ, в WSL кэш 14,7–14,9 ГБ при ~3,4 ГБ у программ. `autoMemoryReclaim=gradual` кэш не вернул: 15,3 ГБ свободно 30.09 13:20 → < 6 ГБ к 13:39. Поминутной истории RAM на сервере нет, таблица по часам построена по переходам. Таблица, оговорки и варианты: `evidence/b4-memory-history.md`, сырьё `evidence/step81a…81f-*-20261002.txt`.
**Вывод:** ночью памяти для HEAVY **не хватит**: не хватает ~4,5 ГБ. #7 убрал блокер присутствия, но LIGHT удержит `critical_windows_ram`. Это гипотеза высокой уверенности, проверить `mode_reason` в ночь 02→03.10.
**Влияние:** очередь шлюза (≈570) ночью не обслуживается тяжёлой моделью.
**Причина:** лимит WSL 20 ГБ почти целиком занят файловым кэшем, gradual его не отдаёт.
**Исправление (P0):** A — `.wslconfig memory=14GB`, ожидаемо ~9,7 ГБ свободно у Windows. Альтернативы: B 16GB (≈7,7 ГБ, вход в HEAVY не проходит), C `dropcache`, D ночные пороги ниже, E закрывать Steam/браузеры (+1–2 ГБ, мало). Плюс F — минутный сэмпл RAM в jsonl для истории.
**Критерий готовности:** ночью свободно ≥ 8192 МиБ, `mode_reason` без `*_windows_ram`, `completed` шлюза растёт.
**Откат:** вернуть `memory=20GB` и перезапустить WSL.
**Нужно от владельца:** выбрать вариант и дать «да» на правку `.wslconfig` и перезапуск WSL ночью.
