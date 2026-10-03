set -u
# B36: выкладка обработчика формы granitline.ru. БЕЗ --apply — только проверка (dry-run).
# Запуск: remote-server.py --script steps/step106-gl-form-deploy.sh   (dry-run)
#         с MODE=apply и SENDER=<ящик@granitline.ru> в первой строке — только после «да» Ильи.
# Что делает в apply:
#  1) бэкап на хостинг: ~/granitline-form-backup-<ts>/ (index.php, delivery-config.php, чанк 548)
#  2) заливает api/inquiries/index.php (из репозитория, передаётся base64 ниже)
#  3) пишет delivery-config.php: recipient — из текущего конфига (не меняется), enabled=true, transport=mail
#  4) правит чанк 548-*.js: L=!1 -> L=!0 (1 символ), проверка вхождения ровно одного
# Откат: залить файлы из бэкапа обратно (команды печатаются в конце).
MODE=${MODE:-dry}
SENDER=${SENDER:-}
main(){
. /etc/smart-monitor-publish.conf
R=sftp://server96.hosting.reg.ru/~
D=$R/www/granitline.ru
CH=_next/static/chunks/548-6fecbab50cc9cb43.js
TS=$(date +%Y%m%d-%H%M%S); T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
get(){ curl -sS --netrc-file "$NETRC" "$1" -o "$2"; }
put(){ curl -sS --netrc-file "$NETRC" --ftp-create-dirs -T "$1" "$2"; }
get "$D/api/inquiries/index.php" "$T/index.php.old" || { echo "нет доступа"; return 1; }
get "$D/api/inquiries/delivery-config.php" "$T/delivery-config.php.old"
get "$D/$CH" "$T/chunk.old.js"
n=$(grep -o '\.com",L=!1;' "$T/chunk.old.js" | wc -l); echo "флаг в чанке: $n (нужно 1)"
grep -q "'recipient' => '[^']\+@" "$T/delivery-config.php.old" && echo "recipient: задан [REDACTED]" || echo "recipient: НЕ задан"
echo "sha256 старых: $(sha256sum "$T"/*.old* | awk '{print substr($1,1,12)}' | tr '\n' ' ')"
[ "$MODE" = apply ] || { echo "DRY-RUN: ничего не изменено"; return 0; }
[ "$n" = 1 ] || { echo "СТОП: флаг не найден однозначно"; return 1; }
case "$SENDER" in *@granitline.ru) ;; *) echo "СТОП: SENDER не задан"; return 1;; esac
B=$R/granitline-form-backup-$TS
put "$T/index.php.old" "$B/index.php" && put "$T/delivery-config.php.old" "$B/delivery-config.php" && put "$T/chunk.old.js" "$B/548-6fecbab50cc9cb43.js" || { echo "СТОП: бэкап не записан"; return 1; }
echo "бэкап: ~/granitline-form-backup-$TS/"
echo "$INDEX_B64" | base64 -d > "$T/index.php"
REC=$(sed -n "s/.*'recipient' => '\([^']*\)'.*/\1/p" "$T/delivery-config.php.old")
SALT=$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')
cat > "$T/delivery-config.php" <<CFG
<?php
return [
    'enabled' => true,
    'transport' => 'mail',
    'recipient' => '$REC',
    'sender' => '$SENDER',
    'allowed_origins' => ['https://granitline.ru'],
    'ip_salt' => '$SALT',
    'ip_max' => 5,
    'ip_window_sec' => 3600,
    'day_max' => 100,
    'state_dir' => dirname(__DIR__, 4) . '/granitline-form-state',
];
CFG
sed 's/\.com",L=!1;/.com",L=!0;/' "$T/chunk.old.js" > "$T/chunk.js"
[ "$(cmp -l "$T/chunk.old.js" "$T/chunk.js" | wc -l)" = 1 ] || { echo "СТОП: патч чанка не 1 байт"; return 1; }
# порядок: сначала бэкенд и конфиг, потом фронт
put "$T/index.php" "$D/api/inquiries/index.php" && put "$T/delivery-config.php" "$D/api/inquiries/delivery-config.php" && put "$T/chunk.js" "$D/$CH" || echo "ОШИБКА выкладки — выполнить откат"
echo "== проверка без отправки заявки"
curl -s -o /dev/null -w "GET /api/inquiries/: %{http_code} (ждём 405)\n" https://granitline.ru/api/inquiries/
curl -s -X POST -H 'Origin: https://evil.example' -H 'Content-Type: application/json' -d '{}' -o /dev/null -w "чужой Origin: %{http_code} (ждём 403)\n" https://granitline.ru/api/inquiries/
curl -s "https://granitline.ru/$CH" | grep -c '\.com",L=!0;' | sed 's/^/флаг включён в чанке: /'
echo "ОТКАТ:"
echo "  curl --netrc-file \$NETRC $B/index.php -o i && curl --netrc-file \$NETRC -T i $D/api/inquiries/index.php"
echo "  то же для delivery-config.php и $CH (из $B/)"
}
INDEX_B64='__INDEX_PHP_BASE64__'
main </dev/null; exit 0
