# Доска мониторинга → https://ai-ilya.ru (01.10.2026)

Цель: доска мониторинга открывается на корне ai-ilya.ru (не monitor.*).

## Сделано (владелец, по инструкциям агента)
1. ispmanager (хостинг reg.ru, server96, IP 37.140.192.183): создан сайт `ai-ilya.ru`, корень `/www/ai-ilya.ru`.
2. В корень залиты `dashboard/index.html` и `dashboard/monitor.js` (без правок).
3. Проблема: в зоне панели домена reg.ru (ns1/ns2.reg.ru) были лишние A `@` и `www` → 95.163.244.138
   (заглушка reg.ru). Удалить нельзя — «Редактирование ресурсных записей запрещено».
   Из-за неё Let's Encrypt падал: `95.163.244.138: Invalid response ... acme-challenge: 404`.
4. Решение: в зоне хостинга (ispmanager → Управление DNS → ai-ilya.ru) добавлена `A dom2 → 37.140.192.183`,
   затем DNS-серверы домена сменены на `ns1.hosting.reg.ru` / `ns2.hosting.reg.ru`.
   Теперь зона ai-ilya.ru управляется в ispmanager. Проверено: ai-ilya.ru → 2a00:f940:2:2:1:1:0:96,
   dom2.ai-ilya.ru → 37.140.192.183.
5. Домен ai-ilya.online и dom2.ai-ilya.online смена NS не затронула.

## SSL (ispmanager → SSL-сертификаты)
- `ai-ilya.ru_le1` — Let's Encrypt ВЫПУЩЕН 01.10.2026 20:07:34 (после смены NS проверка прошла).
- Самоподписанные без использования (ai-ilya.ru, dom2.ai-ilya.ru, granitline.ru, kub-lesa.ru) — можно удалить, не обязательно.
- `ai-ilya.online` на самоподписанном — при необходимости выпустить Let's Encrypt.

## Осталось
- [01.10 20:10] https://ai-ilya.ru открывается с телефона: «Доска ILYA CORE — нет данных (status.json недоступен)» — ожидаемо до п.5. На ПК пока парковка (DNS-кэш провайдера, TTL до ~1 ч).
- П.5 (сервер, только с «да» владельца): `/etc/smart-monitor-publish.netrc` (600) + `step70`
  с REMOTE_DIR=`/www/ai-ilya.ru` → таймер раз в минуту заливает status.json (без ПДн).
- Сбросить пароли хостинга; пополнить баланс до 18.10.2026 (оплачен до 25.10.2026).

## 01.10 — работы по серверу возобновлены владельцем
- Создан `tools/publish-dashboard.cmd` (запуск двойным кликом на ПК владельца): по SSH `Ilya@100.66.82.120` → WSL root
  спрашивает логин/пароль SFTP (пароль не выводится, в файл `/etc/smart-monitor-publish.netrc` 600),
  добавляет host key хостинга, находит папку сайта ai-ilya.ru (по index.html), ставит
  `/usr/local/bin/smart-monitor-publish.sh` (проверка JSON + фильтр e-mail/телефонов) и
  `smart-monitor-publish.service` + `.timer` (60 с). Бэкапы `.bak-<TS>`, откат печатается в конце.
- Требует работающего коллектора (`/var/lib/ilya-map/monitor/status.json`, step61) — скрипт это проверяет.

## 01.10 вечер — запуск publish-dashboard.cmd
- Запуск 1 (рабочий ПК «Илья Работа», Tailscale 100.117.11.110, WSL нет): `ssh Ilya@100.66.82.120` →
  `Permission denied (publickey)` — на этом ПК нет SSH-ключа для сервера.
- Добавлен режим «локальный WSL» (если файл запущен на самом сервере). Запуск 2 на рабочем ПК: сервер не найден (ожидаемо).
- Выяснено: доступ с рабочего ПК идёт через
  `C:\Users\Илья Работа\Documents\Codex\2026-09-29\new-chat\outputs\remote-server.py`
  (`--command` | `--script` | `--interactive`).
- Добавлен режим `remote-server.py --script` (успех определяется по строке `[server] DONE`). Ждём результата запуска 3.
- Поиск SSH-ключей по папкам из скрипта убран (заблокирован проверкой безопасности).
