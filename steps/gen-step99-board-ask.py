#!/usr/bin/env python3
"""Генератор деплой-скриптов B25 (НЕ запускает их). python steps/gen-step99-board-ask.py
  steps/step99h-board-ask-hosting.sh — выкладка ask/ + вкладки на ai-ilya.ru (SFTP/FTP как step92, .old-, откат);
  steps/step99-board-ask-server.sh   — служба smart-board-ask на сервере (токен 600, юнит, .bak, откат).
Порядок: сначала hosting, затем server. Оба — только после «да» владельца.
"""
import base64
import subprocess
import sys
from pathlib import Path

R = Path(__file__).resolve().parents[1]
F = R / "dashboard/redesign/final"


def b64(p: Path, name: str) -> str:
    return f"base64 -d > '{name}' <<'B64'\n{base64.encodebytes(p.read_bytes()).decode()}B64\n"


HOST_FILES = [("index.html", F / "index.html"), ("arch.js", F / "arch.js"), ("arch.css", F / "arch.css"),
              ("ask.js", F / "ask.js"), ("ask.css", F / "ask.css"), ("api.php", F / "ask/api.php"),
              ("ask.htaccess", F / "ask/.htaccess")]

hosting = ["set -u", "main(){", ". /etc/smart-monitor-publish.conf",
           "U=https://ai-ilya.ru; R=www/ai-ilya.ru; TS=$(date +%Y%m%d-%H%M)",
           "T=$(mktemp -d); cd \"$T\"",
           'ls1(){ curl -s -o /dev/null -w "%{http_code}" -u 1:1 "$U/$1"; }',
           'echo "до: / $(ls1 "") ask/api.php $(ls1 ask/api.php)"']
hosting += [b64(p, n) for n, p in HOST_FILES]
hosting += [
    "# бэкап изменяемых файлов (.old-TS), новые ask.* до этого не существовали",
    'for f in index.html arch.js arch.css; do curl -sS --netrc-file "$NETRC" -Q "-rename $R/$f $R/${f%.*}.old-$TS.${f##*.}" "$REMOTE_URL" -o /dev/null && echo "бэкап $f"; done',
    "FAIL=0",
    'for f in index.html arch.js arch.css ask.js ask.css; do curl -sS --fail --netrc-file "$NETRC" -T "$f" "${REMOTE_URL}$f" || { echo "ОШИБКА $f"; FAIL=1; }; done',
    'curl -sS --fail --ftp-create-dirs --netrc-file "$NETRC" -T api.php "${REMOTE_URL}ask/api.php" || FAIL=1',
    'curl -sS --fail --netrc-file "$NETRC" -T ask.htaccess "${REMOTE_URL}ask/.htaccess" || FAIL=1',
    "sleep 3",
    "# без Basic: 401 = файл на месте и закрыт входом; 404 = не выложен",
    'for f in "" index.html ask.js ask.css ask/api.php; do c=$(ls1 "$f"); echo "$f $c"; [ "$c" = 200 ] || [ "$c" = 401 ] || FAIL=1; done',
    'if [ $FAIL = 0 ]; then echo "OK: вкладка «Спросить» выложена, бэкап .old-$TS"; else',
    '  echo "НЕ ОК -> откат"',
    '  for f in index.html arch.js arch.css; do curl -sS --netrc-file "$NETRC" -Q "-rename $R/${f%.*}.old-$TS.${f##*.} $R/$f" "$REMOTE_URL" -o /dev/null; done',
    '  curl -sS --netrc-file "$NETRC" -Q "-DELE $R/ask/api.php" "$REMOTE_URL" -o /dev/null',
    '  echo "после отката: / $(ls1 "")"',
    "fi",
    'cd /; rm -rf "$T"', "}", "main </dev/null; exit 0", ""]

digest = subprocess.run([sys.executable, str(R / "infra/board-ask/make-digest.py")],
                        capture_output=True, text=True, encoding="utf-8", check=True).stdout
dg = R / "infra/board-ask/digest.txt"
dg.write_text(digest, encoding="utf-8")

UNIT = """[Unit]
Description=ILYA CORE: ответы на вопросы с доски (pull с хостинга, B25)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=smart-board-ask
Group=smart-board-ask
ExecStart=/usr/bin/python3 /opt/smart-board-ask/smart-board-ask.py
Environment=PYTHONUNBUFFERED=1 SANITIZER_DIR=/opt/smart-board-ask
Environment=DIGEST_FILE=/opt/smart-board-ask/digest.txt
LoadCredential=board-ask-token:/etc/smart-board-ask/board-ask-token
LoadCredential=board-basic:/etc/smart-board-ask/board-basic
LoadCredential=freellm-key:/etc/smart-board-ask/freellm-key
StateDirectory=smart-board-ask
StateDirectoryMode=0700
Nice=10
Restart=on-failure
RestartSec=30
StartLimitIntervalSec=600
StartLimitBurst=5
MemoryMax=200M
CPUQuota=20%
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictSUIDSGID=yes
LockPersonality=yes
RestrictAddressFamilies=AF_INET AF_INET6
CapabilityBoundingSet=
ReadOnlyPaths=/var/lib/ilya-map/monitor

[Install]
WantedBy=multi-user.target
"""

server = ["set -u", "main(){", "TS=$(date +%Y%m%d-%H%M); U=/etc/systemd/system/smart-board-ask.service",
          "D=/opt/smart-board-ask; C=/etc/smart-board-ask",
          "[ \"$(id -u)\" = 0 ] || { echo 'нужен root'; return 1; }",
          ". /etc/smart-monitor-publish.conf",
          "# 0. предусловия: Basic-доступ доски (вводит владелец) и ключ FreeLLM — уже на месте, значения не печатаем",
          "[ -s $C/board-basic ] || { echo \"СТОП: нет $C/board-basic (user:pass входа доски, 600) — создаёт владелец\"; return 1; }",
          "[ -s $C/freellm-key ] || { echo \"СТОП: нет $C/freellm-key (600) — скопировать ключ FreeLLMAPI владельцем\"; return 1; }",
          'curl -s -o /dev/null -m 5 -w "freellm /v1/models %{http_code}\\n" http://127.0.0.1:31416/v1/models',
          "# 1. бэкап прежнего состояния",
          "[ -f $U ] && cp -a $U $U.bak-$TS && echo \"бэкап юнита $U.bak-$TS\"",
          "[ -d $D ] && cp -a $D $D.bak-$TS && echo \"бэкап $D.bak-$TS\"",
          "# 2. пользователь и файлы",
          "id smart-board-ask >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin smart-board-ask",
          "install -d -m 755 $D; install -d -m 700 $C",
          "T=$(mktemp -d); cd \"$T\"",
          b64(R / "infra/board-ask/smart-board-ask.py", "smart-board-ask.py"),
          b64(R / "infra/gateway-freellm/sanitizer.py", "sanitizer.py"),
          b64(dg, "digest.txt"),
          "install -m 644 smart-board-ask.py sanitizer.py digest.txt $D/",
          "python3 -c \"import ast,sys;[ast.parse(open(f).read()) for f in sys.argv[1:]]\" $D/smart-board-ask.py $D/sanitizer.py || { echo 'СИНТАКСИС'; return 1; }",
          "# 3. токен сервера: новый, если нет; 600 root; на хостинг в ~/ask-data/token.txt (вне веб-корня)",
          "[ -s $C/board-ask-token ] || { umask 077; python3 -c 'import secrets;print(secrets.token_urlsafe(36))' > $C/board-ask-token; }",
          "chmod 600 $C/*; chown root:root $C/*",
          'FTPROOT="${REMOTE_URL%www/ai-ilya.ru/}"',
          'curl -sS --fail --ftp-create-dirs --netrc-file "$NETRC" -T $C/board-ask-token "${FTPROOT}ask-data/token.txt" -o /dev/null && echo "токен на хостинге: ok" || { echo "СТОП: токен не залит"; return 1; }',
          'curl -sS --netrc-file "$NETRC" -Q "SITE CHMOD 600 ask-data/token.txt" -Q "SITE CHMOD 700 ask-data" "$FTPROOT" -o /dev/null || echo "chmod на хостинге не поддержан — проверить вручную"',
          "# 4. юнит",
          f"cat > $U <<'UNIT'\n{UNIT}UNIT",
          "systemd-analyze verify $U 2>&1 | tail -n 5",
          "systemctl daemon-reload && systemctl enable --now smart-board-ask",
          "sleep 40",
          "systemctl is-active smart-board-ask; journalctl -u smart-board-ask --since '-1min' --no-pager | tail -n 8",
          "cat /var/lib/smart-board-ask/state.json 2>/dev/null; echo",
          "if systemctl is-active -q smart-board-ask && grep -q '\"idle\\|\"answered' /var/lib/smart-board-ask/state.json 2>/dev/null; then",
          "  echo 'OK: smart-board-ask работает (pull к хостингу проходит)'",
          "else",
          "  echo 'НЕ ОК -> откат: служба остановлена и выключена'",
          "  systemctl disable --now smart-board-ask",
          "  [ -f $U.bak-$TS ] && cp -a $U.bak-$TS $U || rm -f $U",
          "  [ -d $D.bak-$TS ] && { rm -rf $D; mv $D.bak-$TS $D; }",
          "  systemctl daemon-reload",
          "fi",
          'cd /; rm -rf "$T"', "}", "main </dev/null; exit 0", ""]

(R / "steps/step99h-board-ask-hosting.sh").write_text("\n".join(hosting), encoding="utf-8", newline="\n")
(R / "steps/step99-board-ask-server.sh").write_text("\n".join(server), encoding="utf-8", newline="\n")
print("ok: step99h-board-ask-hosting.sh, step99-board-ask-server.sh")
