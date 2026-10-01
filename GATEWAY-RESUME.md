# Продолжение работы в режиме Gateway (ai-funpay)

Дата: 01.10.2026. Секретов в этом файле нет.

## Как продолжить
1. Claude Desktop → Developer → Configure Third-Party Inference:
   - Inference provider: Gateway
   - Gateway base URL: https://www.ai-funpay.ru (если 404, то с /v1)
   - Credential kind: Static API key; ключ: новый ключ ai-funpay (старый засвечен, его перевыпустить)
   - Auth scheme: Bearer (если 401, то x-api-key)
   - Модель: claude-opus-5-5
2. Перезапустить приложение, открыть **новый локальный сеанс** в папке `C:\Ilya-audit`.
3. Написать: **Продолжай** (агент читает CLAUDE.md и HANDOFF.md и выполняет следующий шаг).

Ограничения Gateway: только локальные сеансы; облако, встроенный SSH приложения и Remote Control отключаются. Обычный `ssh` из сеанса к серверу работает.

## Главные файлы
- `CLAUDE.md`: задание, правила, гипотезы H1–H11.
- `HANDOFF.md`: текущий шаг и следующее действие (до 60 строк).
- `AUDIT-REPORT.md`: отчёт; `evidence/`: доказательства; `steps/`: скрипты шагов.
- `dashboard/`, `infra/publish/`: доска и публикация на ai-ilya.ru (корень).
- `memory/`: копия памяти агента (в архиве).

## Открытые задачи
- Проверить, что запросы идут через ai-funpay (растёт расход в кабинете, cache_read_input_tokens > 0).
- В `~/.claude/settings.json` подстановка haiku=`auto:free-agents` даёт 404, из-за неё падают субагенты. Исправить по согласованию, бэкап есть: settings.json.bak-20261001-112245.
- Перевыпустить ключ ai-funpay, сменить пароли хостинга reg.ru (были в чате).
- Доска: (a) сайт в ispmanager; (b) A-запись monitor → 37.140.192.183; (c) /etc/smart-monitor-publish.netrc с правами 600; (d) загрузить файлы; (e) «да» на steps/step70-publish-deploy.sh; (f) сменить пароли; (g) пополнить хостинг до 18.10.
- Позже: мост QA→исполнитель (#6b), rates.py, контроллер #7, smart-quality30 start-limit-hit, Git для конфигов.

## Правила (кратко, полностью в CLAUDE.md)
Этап 0 только чтение; любое изменение на сервере только после «да» владельца и с откатом. Значения секретов нигде не выводить, писать [REDACTED]. ПДн клиентов в отчёты не переносить. journalctl только узкими окнами с `| tail -n N`.
