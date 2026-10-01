# Сервер ILYA CORE — материалы для независимого аудита

Собрано 28 сентября 2026 года. Свежий снимок: 16:57 МСК.

Это технические заметки координатора и проверенные наблюдения, а не завершённый независимый аудит. Формулировки сохранены в рабочем виде. Бесплатный исполнитель оформления недоступен: таймаут и дневная квота. Платная замена не использовалась.

Временные отметки важны: работа службы не доказывает выполнение задач. Исторические результаты, планы и неподтверждённые изменения отмечены в тексте. Приложенный JSON имеет приоритет для показателей, измеренных в 16:57.

## Назначение и архитектура

Система ILYA CORE/умный сервер на домашнем Windows с WSL Ubuntu24.04. Железо Ryzen7800X3D RAM32GB DDR5 RTX4070TiSUPER16GB. WSL лимит24GB,8CPU,swap4GB по прежней конфигурации, свежо не перечитывали. Приложения /srv/smart-server, SQLite (не считать PostgreSQL/векторнуюБД реально внедрёнными по картинке108компонентов). n8n упоминался установленным, рабочие цепочки не подтверждены. Документы→извлечение/OCR/Docling→knowledge/evidence→сущности/контекст→поиск Core→проверенный ответ с цитатами. Telegram/MAX→browser ingest→recognition→context/literaltasks→semantic локальныйИИ→кандидаты→review. Не все данные прошли semantic: baseline_skipped не анализировано. Личные данные исключать из рабочих индексов.

## Главная задача

Главная цель: точные ответы о стоимости работ/договорах/объектах, не просто чат; отделять проект/очередь/дом, работу/материал/комплекс, ставку/сумму,м2/м/м3,даты/версии/конфликты. Верный отказ при недостатке данных, никакого выбора удобной цены. Эталонные ответы/синтетика отдельно от бизнесфактов. «Обучение» сейчас retrieval+контекст+регрессии, НЕ fine-tuning весов.

## Проблемный пример: дом 10

Кейс дом10 террасная доска: в базе две версии акта21126.08.26:3500 и4000руб/м2 комплексной строки включая сваи/каркас/покраску/настил; отдельная укладка не выделена. Другие ставки1700/2000руб/м нельзя смешивать. Ранее Core вернул partial matches sources[] несмотря на наличие evidence. Evidence ids59762/59763,54441/54442 — исторические подсказки для проверки, не ответ о текущей согласованной цене.

## Модели и ресурсы

Управление: главныйCodex координация; раньше5.6Sol/Luna исполнители,Astra сложныйreview. Новое правило пользователя: substantive execution через локальное приложение FreeLLMAPI auto:free-agents balanced только бесплатный пул; это шлюз к бесплатным внешним моделям, НЕ равнозначно модели вGPU. Локальные Ollama qwen3:4b qwen3:14b gemma4:12b по проверке28.09 16:07 установлены, не загружены. Gateway127.0.0.1:8771/health, singleworker, userpriority, LIGHT/HEAVY охрана памяти/активности. GPU0 при idle нормально, при backlog нужна диагностика. WindowsRAM мало, Linux cache удерживаетRAM; разово очищали17GBcache→<1GB, свободнаяWindows2.3→7.5GB, GPU70%,7задач прошли; cache вырос при чтениивесов. autoMemoryReclaim gradual предлагался, применение и перезапуск НЕ подтверждены, не делать периодический drop.

## Контролёр и исполнитель

Контролёр программа/локальныйанализ/отдельныйCLIexecutor разделены. CodexCLI0.157.1 установлен, отдельныйuser assignment-executor; OAuth выполнен послеVLESS, syntheticE2E27.09 18:23успешен, dedup. На28.09 16:07executor inactive disabled, registry толькоsynthetic, реальныхexecutions0. Не пробуждает старые desktop-чаты; не путать submit/ACK сstarted/completed. Supervisoractive не доказательство coverage. Без конкурентных редакторов, boundedretries, lease, terminalresult.

## Почасовой аудит

ПочасовойаудиторAstra: schedulerACTIVE не значит run. Ошибка direct app-server input is not allowed for multi-agent v2 sub-agents; предлагалось переключить heartbeat на главного, завершение не подтверждено, последовал лимитCodex. Платныйfallback запрещён новым правилом. В snapshot запрашивался ошибочный smart-continuous-quality, настоящий smart-quality-continuous active; явно предупреди не смешивать имена.

## Проверки качества

Качество:100тестов technical100/100,28приемлемых НЕ accuracyvalidated.1000 technical1000,530unique,273flags НЕ доказанныеошибки.quality30completed30, но unitfailed изrestart-loop. Новый continuous checked0,awaiting4,idleempty_queue,lastprogress27.09 19:22. Аудит00:07:3technicalerrors no such column owner_id/channel на cleanup tasks.sqlite ошибочно классифицированы semanticerror; queuedtechnical_failed,outboxpending_no_supported_executor. Исправление обещано, по свежим счётчикам успеха нет. Другой INSERT9columns/8placeholders исправлен картой. Astra2партиипо5разобрала, не10исправлений. Счётчики sent/astra cumulative иначе scopeпрогона не смешивать.

## Пути и хранилища

Пути: /srv/smart-server/core/data/core.sqlite; /srv/smart-server/knowledge (точныйsqliteпуть обследовать); /srv/smart-server/messenger-context/data/{context.sqlite,semantic.sqlite,status.json,semantic-status.json}; ingestion messages.sqlite точныйпуть выяснить; /srv/smart-server/business; /srv/smart-server/reports; /var/lib/smart-quality/status.json; /etc/ilya-map/progress.json описательный источник; /var/lib/ilya-map/observer.json производный read-only; /var/lib/ilya-map/assignment-supervisor отдельныйstate; точный актуальныйexecutorregistry выяснить. Не читать/выгружать auth.json,.env,tokens,keyfiles.

## Доска и актуальность статусов

Доска /srv/smart-server/ai-map/releases; ReactTS/Vite +Pythonapp; /api/board,/api/mobile/delegations,/api/agent-events SSE inotify dedup reconnect; компьютер sampling0.5с, старыеboardpoll15с/delegations10с. SSE не делает upstreamlive. lastprogress≠heartbeat. Номераtask/agentраздельно. Завершённые вarchive. Вопросы черезquestion id/version/prompt/choices/allow_text/target_id. Нужна provenance статуса:process/result/selfreport/unknown. Доска108узлов была прототипом, не считать всё запущенным.

## Адреса и мобильное приложение

Адресдоски https://desktop-i53h0d8.taile433c9.ts.net/ai-map/ PWA/mobile/; защищённыйlogin,пароль не включать. ai-ilya.ru куплен, ранее404REGру, перенос НЕ подтверждён. PWAопубликована, mobileauthtested, физическийiPhone/micнетпроверки, Macнет. Персональныеaccountemail не требуются.

## Бизнес и смежные проекты

Бизнес: GranitLine ригельныйкирпич flagship, продавцыкирпича/плитки/укладчики; КубЛеса пиломатериалы стройфирмы/бригады. Автосборpublicleads dedup/backoff checkpoint, нельзя запускатьвторой.28.09 16:0787companies51GranitLine36КубЛеса85contacts; последнийчас11циклов0новых. Senderoff,10кампанийных+2userтеста SMTPaccepted/Sent, delivery/readНЕдоказаны,повторовнет. Реальноефото каталога не подтверждено, версии письма конфликтовали изза replayстарого контекста. СайтGraniteразработкастоп поручено28.09,подтверждениестопнет; самсайтневыключать. Формадоставки последняяполнаяпроверканет, старый503невыдаватьсвежим. Отдельный журналстройки«Пилот»GoogleDrive RU/UZsite и Дом2реестр интеграцияпоручена,готовностьнет; нечасть servercoreconfirmed.

## Удалённый доступ

ДОСТУП: прямо в этойсессии SSHподключение проверено через существующий ключ (непередавать) к Windows100.66.82.120 userIlya черезTailscale, verifiedknown_hosts. Внутри wsl.exe -d Ubuntu-24.04 --exec ... . Это существующий привилегированный маршрут администратора, не read-only аудитор. Отдельный ограниченный пользователь НЕсоздан, публичныйключ нового аудитораНЕполучен. Tailscale100.xнепубличныйинтернет: внешнему нужен авторизованныйtailnetACL/маршрут и согласованный SSHpublickey, никакого public22/rootpassword. Один файл не даётИИshell/network. Для ИИ безинструментов—аудитsnapshot, для локальногоtoolagentможет использовать авторизованныйlocalenvironment безэкспорта приватного ключа. Предпочтительныйпервыйэтапread-only export, отдельнаяминимальнаяучёткапоpublickey при ответепользователя, изменениясерверныхнастроеквэтомпакетенепроизводились. ВладелецуточняетгдебудетИИ. Приведи пример ssh <audit-user>@100.66.82.120 как ШАБЛОН послеprovision, неготовуюучётку. Hostfingerprint сверять доверенным каналом. Необещать что этотhostпубличнодоступен.

## Границы и порядок аудита

Аудитнеизменяющий: systemctl show/list-units,list-timers,journalctl узкий диапазон сredact; SQLite mode=ro иликонсистентныйbackup, не копироватьliveSQLiteбезWAL; не полныечаты/креды. Проверитьregistry/off, очередьLIGHTHEAVY,qualitytechnicalfail,schema,labels,collectorcoverage,backupsrestore. Порядок P0реальныйQA/контролёр, P1контекст/observability/память, затем прочее. Не выключатьguards/TLS,неперезагружатьWSL,нераскрыватьпорты,неотправлятьписем в рамках аудита. РабочиеJSON/SQL/dbне класть вhandoffархив. Ответ независимогоИИ: evidence/время/влияние/причина/план/владелец/приёмка/rollback/нужныйдоступ.
