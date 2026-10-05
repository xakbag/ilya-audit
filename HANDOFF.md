# HANDOFF — ILYA CORE, 05.10.2026, переход в новый чат
## Цель и последнее решение
- Пользователь предложил новый чат для экономии токенов. Состояние сохранено; новых API заданий не запускать до продолжения.
- Главная цель: исправить ответы Core по строительным документам, исключить чужой дом/проект, проверить свежую полную цепочку. Дедлайн05.10 19:00 МСК пропущен; полная готовность НЕ достигнута.
- Последний запрос до перехода: «Ну что тогда делать будешь?»; интеграционный патч заказан Astra, обе версии отклонены при проверке, не выложены.
## Исполнитель, доступ и разрешения
- Только gpt-6-astra через Portix API; Codex постановка/независимая проверка/контролируемое применение. Встроенные агенты, FreeLLM и скрытый fallback запрещены.
- Skill C:/Users/Илья Работа/.codex/skills/portix-astra-worker/SKILL.md; runner scripts/run.py. После каждого API процесса отдельный tools/portix-minute-monitor.py; metadata проверять всегда.
- Ключ только память/окружение. В прежнем CUA REPL portixKey; новый чат может не сохранить binding. Авторизация кабинета Portix была доступна; не искать секреты широко и не выводить.
- SSH проверен в этом сеансе через C:/Users/Илья Работа/Documents/Codex/2026-09-29/new-chat/outputs/remote-server.py. Сервер Ilya@100.66.82.120, WSL Ubuntu-24.04. Приватный ключ не читать.
- Старую запись другого запуска про отсутствие SSH/API не считать актуальным результатом: точные live файлы скачаны в текущем сеансе, оба API запроса завершились ok.
- Владелец разрешил безопасные исправления/выкладку с резервной копией и откатом; служебный вход отдельно разрешён. Повторно «да» не спрашивать. Не включать чтение Telegram/MAX и бизнес-рассылки.
- Автоматизации ilya-core-30 и ilya-core-19-00 PAUSED после дедлайна. Активных API заданий после step142 нет; фоновой работы не обещать.
## Подтверждённое состояние сервера
- step130/131: Portix executor установлен; синтетическая CANARY_42 прошла очередь за5с, это не приёмка бизнес-задач. Откат bash /var/tmp/ilya-portix-20261005/rollback-v2.sh.
- step133/134: отдельный служебный вход доски создан, прежние логины сохранены; новый вопрос через UI→очередь→Astra→ответ автоматически проверен17:35МСК. smart-board-ask active/NRestarts0. evidence/step133-ask-live-20261005.json.
- Доска asset ask-458d643a9614.js; backup /var/lib/ilya-map/monitor/board-auth-20261005/index.html. Portix ключ сервера только manager environment, после перезагрузки может требовать восстановления.
- step137: QA cleanup при отсутствии owner_id/channel пропускает удаление, не теряет результат;4теста PASS. Backup /var/lib/ilya-map/monitor/qa-cleanup-20261005/continuous_quality.py; откат restore+restart smart-quality-continuous.
- step139: локальный модельный fallback отключён, детерминированные ветки сохранены, иначе retrieval_only. UTF8 сообщения проверен. Live knowledge SHA3839fe1fc16391df48fc10a5a0d2ee592285ca056a87f2e91194bd4c11c4df4c.
- Откат step139: /var/lib/ilya-map/monitor/core-no-local-20261005/knowledge.py (исходный корректный backup); не брать промежуточный core-no-local-utf8 backup с mojibake.
## Нерешённая ошибка и новые проверки
- «на третьем доме» не распознаётся текущим house_number; исторические3ответа дали12источников дома1 каждый. Маршрут verified_act_columns, model=null.
- Core worker при нераспознанном доме сохраняет дом из источников в conversation_context; это закрепляет ошибку. Есть старый небезопасный anchor.
- Нужно единое распознавание; unknown/ambiguous не превращать в unrestricted; явный дом по цепочке; фильтр ДО цены/ссылок; финальный guard; только доверенный пользовательский контекст.
- step142 baseline:14тестов core-rates/tests/test_rates.py PASS;17эталонов core-rates/run_eval.py PASS. Не менять эталоны/статусы QA ради прохождения.
- steps/step142-baseline-direct.sh дал3СВЕЖИХ прямых ответа backend без сетевых вызовов/записиБД: все confirmed_error. 1:house_scope12+required_primary_evidence_missing1; 2:absence_not_explained1+excerpt_not_grounded4; 3:missing_semantics3. Это не прогон очереди.
- Не считать исправление парсера достаточным: есть отдельные проблемы семантики/полноты цитат. Версии дома10 3500/4000руб/м² сохранять отдельно от1700/2000руб/м.
## Файлы текущей работы и приёмка
- work/core-scope-integration-20261005/baseline:6точных live файлов apps/{contract_answers,knowledge,structured_rates,work_prices}.py и core/app/{core,dialogue_context}.py; manifest.json с SHA. Дополнительно query_context.py скачан точно.
- Exact source получать remote base64 -w0 и decode; plain wrapper меняет newline и хеш. Все локальные чтения/записи explicit UTF8; python -X utf8. Default cp1251 уже вызывал поломку.
- Первая генерация result/:ok230с, НЕ ПРИНЯТА: обрезание1234→123, неоднозначность→дом3, Latin Dom guard, переопределённый импорт парсера, нет защиты work_prices/контекста.
- Повтор repair/result/:ok268с, НЕ ПРИНЯТ: SyntaxError house_scope.py:45, old snippet не найден, существующий work_prices ошибочно new_file и потеря оговорок, контекст не исправлен. Ничего из двух версий не применять автоматически.
- evidence/step142-integration-acceptance.json; подробности AUDIT-REPORT.md. Исходные prompt.txt и repair/prompt.txt сохранены; повторно всю историю/все baseline не читать без необходимости.
- Проверочные скрипты координатора: materialize.py (exact replacements/allowed paths/syntax), accept_parser.py (18случаев), accept_integration.py (искусственнаяSQLite, реальная knowledge→structured→price, две версии/единицы/ссылки). Последний ещё НЕ запускался на годном кандидате.
- Старые work/core-house-fix-20261005 и docs/core-house-scope-patch-20261005.md НЕ готовы к выкладке. step140/141 внешние предложения тоже отклонены; evidence/step140-scope-proposal-review.json и step141-pasted-patch-review.json.
## Другие поручения владельца
- ai-ilya.online: импорт10работ Excel выполнен; Переделкино3=13,14,15, Переделкино2=7..12+КПП. Нижний раскрываемый архив и Ждёт оплаты опубликованы; evidence/step120-journal-import-20261005.json, step121-journal-import-data-20261005.json, step123-journal-archive-20261005.json.
- Добавление/редактирование исполнителей НЕ готово: work/journal-performers-20261005, предыдущий backend timeout, UI без кода. Не выдавать за сделанное.
- Юридические изменения Куб леса/Гранит-лайн НЕ внесены; work/sites-legal-20261005/result, уточнения оператора/данных остаются.
## Блокер и одно следующее действие
- Блокер: нет принятого интеграционного кода, транспорт Portix работал. Две крупные генерации дали негодный результат.
- Следующее действие: после короткой проверки Portix дать Astra узкое задание на один самостоятельный модуль house_scope с18проверками из accept_parser.py (без всей28kбазы); принять его независимо, затем продолжать интеграцию отдельными проверяемыми шагами. На сервер до приёмки не выкладывать.
