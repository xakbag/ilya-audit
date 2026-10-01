@chcp 65001 >nul & powershell -NoProfile -ExecutionPolicy Bypass -Command "$f='%~f0'; iex ((Get-Content -LiteralPath $f -Raw -Encoding UTF8) -split '#{3}PS#{3}',2)[1]" & pause & exit /b
###PS###
# Доска мониторинга -> https://ai-ilya.ru
# Двойной клик: настраивает на сервере (WSL Ubuntu-24.04) выгрузку status.json
# на хостинг reg.ru раз в минуту. Повторный запуск безопасен (обновляет установку).
# Пароль хостинга вводится здесь, на сервер уходит только в файл /etc/smart-monitor-publish.netrc (права 600).

$ErrorActionPreference = 'Stop'
$Server  = 'Ilya@100.66.82.120'
$Distro  = 'Ubuntu-24.04'
$SshOpts = @('-o', 'ConnectTimeout=15', '-o', 'BatchMode=yes')
$Mode    = ''   # 'local' = этот ПК и есть сервер; 'ssh' = сервер по Tailscale; 'rs' = через remote-server.py
$RsPy    = Join-Path $env:USERPROFILE 'Documents\Codex\2026-09-29\new-chat\outputs\remote-server.py'

function Invoke-Rs([string[]]$rsArgs) {
    $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try { return @(& python $RsPy @rsArgs 2>&1 | ForEach-Object { "$_" }) }
    catch { return @() }
    finally { $ErrorActionPreference = $old }
}

function Test-Native([scriptblock]$sb) {
    $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try { & $sb 2>$null | Out-Null; return ($LASTEXITCODE -eq 0) }
    catch { return $false }
    finally { $ErrorActionPreference = $old }
}

function Invoke-Wsl([string[]]$cmd) {
    $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try {
        if ($Mode -eq 'local') { & wsl.exe -d $Distro -u root --exec @cmd 2>$null | Out-Null }
        else { & ssh @SshOpts $Server wsl.exe -d $Distro --exec @cmd 2>$null | Out-Null }
        return $LASTEXITCODE
    } finally { $ErrorActionPreference = $old }
}

Write-Host ''
Write-Host '=== Доска мониторинга -> ai-ilya.ru ===' -ForegroundColor Cyan
Write-Host 'Ищу сервер...'

# 1) этот компьютер сам сервер? (локальный WSL с /srv/smart-server)
if (Test-Native { wsl.exe -d $Distro -u root --exec test -d /srv/smart-server }) {
    $Mode = 'local'
    Write-Host 'Этот компьютер и есть сервер — работаю через локальный WSL.' -ForegroundColor Green
}
# 2) иначе по SSH через Tailscale
elseif (Test-Native { ssh @SshOpts $Server wsl.exe -d $Distro --exec true }) {
    $Mode = 'ssh'
    Write-Host 'Связь с сервером по SSH есть.' -ForegroundColor Green
}
# 3) иначе через remote-server.py (маршрут десктопного Claude)
elseif ((Test-Path -LiteralPath $RsPy) -and (@(@(Invoke-Rs @('--command', 'echo RS_OK; test -d /srv/smart-server && echo RS_SRV')) -match 'RS_SRV').Count -gt 0)) {
    $Mode = 'rs'
    Write-Host 'Связь с сервером через remote-server.py есть.' -ForegroundColor Green
}
else {
    Write-Host 'Сервер не найден: на этом ПК нет WSL сервера, по SSH не пустил, remote-server.py не ответил.' -ForegroundColor Red
    Write-Host 'Запустите этот файл на самом сервере (домашний ПК с WSL Ubuntu-24.04).' -ForegroundColor Yellow
    return
}

# --- реквизиты SFTP хостинга ---
$netrcB64 = ''
if ($Mode -eq 'rs') {
    $hasNetrc = @(@(Invoke-Rs @('--command', 'test -s /etc/smart-monitor-publish.netrc && echo HAS_NETRC')) -match 'HAS_NETRC').Count -gt 0
} else {
    $hasNetrc = (Invoke-Wsl @('test', '-s', '/etc/smart-monitor-publish.netrc')) -eq 0
}
$ask = $true
if ($hasNetrc) {
    $ans = Read-Host 'Пароль хостинга уже сохранён на сервере. Заменить? (д/Enter = оставить)'
    $ask = $ans -match '^(д|y|да|yes)$'
}
if ($ask) {
    $login = Read-Host 'Логин SFTP хостинга (Enter = u3660047)'
    if ([string]::IsNullOrWhiteSpace($login)) { $login = 'u3660047' }
    $sec = Read-Host 'Пароль SFTP хостинга (не отображается)' -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
    try { $pw = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    if ([string]::IsNullOrEmpty($pw)) { Write-Host 'Пароль пустой — отмена.' -ForegroundColor Red; return }
    $q = { param($s) '"' + ($s -replace '\\', '\\' -replace '"', '\"') + '"' }
    $netrc = "machine server96.hosting.reg.ru login $(& $q $login) password $(& $q $pw)`n"
    $netrcB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($netrc))
    $pw = $null; $netrc = $null
}

# --- установочный скрипт для сервера (выполняется от root в WSL) ---
$bash = @'
set -u
TS=$(date +%Y%m%d-%H%M%S)
HOST=server96.hosting.reg.ru
SRC=/var/lib/ilya-map/monitor/status.json
NETRC=/etc/smart-monitor-publish.netrc
CONF=/etc/smart-monitor-publish.conf
BIN=/usr/local/bin/smart-monitor-publish.sh
UNIT=/etc/systemd/system/smart-monitor-publish
NETRC_B64='__NETRC_B64__'

say(){ echo "[server] $*"; }
fail(){ echo "[server] ERROR: $*"; exit 1; }

[ "$(id -u)" = 0 ] || fail "need root inside WSL"
command -v curl >/dev/null || fail "curl not installed"
curl -V | grep -qw sftp || fail "curl has no sftp support"
[ -s "$SRC" ] || fail "$SRC not found: monitor collector (step61) is not running"
if systemctl is-active --quiet smart-monitor-collector.timer; then
  say "collector timer: active"
else
  say "WARN: smart-monitor-collector.timer is not active, status.json will not refresh"
fi

# 1. credentials (file 600, never printed)
if [ -n "$NETRC_B64" ]; then
  [ -f "$NETRC" ] && cp -p "$NETRC" "$NETRC.bak-$TS"
  ( umask 077; printf '%s' "$NETRC_B64" | base64 -d > "$NETRC" )
  chown root:root "$NETRC"; chmod 600 "$NETRC"
  say "credentials saved to $NETRC (600)"
fi
[ -s "$NETRC" ] || fail "$NETRC missing"

# 2. hosting host key for root (curl checks ~/.ssh/known_hosts)
mkdir -p /root/.ssh && chmod 700 /root/.ssh
touch /root/.ssh/known_hosts
if ! ssh-keygen -F "$HOST" -f /root/.ssh/known_hosts >/dev/null 2>&1; then
  ssh-keyscan -T 15 "$HOST" 2>/dev/null >> /root/.ssh/known_hosts
  ssh-keygen -F "$HOST" -f /root/.ssh/known_hosts >/dev/null 2>&1 || fail "cannot fetch host key of $HOST"
  say "host key of $HOST added to /root/.ssh/known_hosts"
fi

# 3. find the site folder on the hosting (must contain index.html)
LOGIN=$(awk '{for(i=1;i<NF;i++) if($i=="login"){v=$(i+1); gsub(/"/,"",v); print v; exit}}' "$NETRC")
REMOTE_URL=""
for d in "~/www/ai-ilya.ru/" "/var/www/$LOGIN/data/www/ai-ilya.ru/"; do
  url="sftp://$HOST/$d"
  if HOME=/root curl -sS --netrc-file "$NETRC" --connect-timeout 15 --max-time 40 -l "$url" 2>/tmp/smp-err.$$ | grep -qx 'index.html'; then
    REMOTE_URL="$url"; break
  fi
done
if [ -z "$REMOTE_URL" ]; then
  say "curl said: $(head -c 300 /tmp/smp-err.$$ 2>/dev/null)"; rm -f /tmp/smp-err.$$
  fail "site folder ai-ilya.ru with index.html not found on hosting (wrong login/password?)"
fi
rm -f /tmp/smp-err.$$
say "site folder: $REMOTE_URL"
[ -f "$CONF" ] && cp -p "$CONF" "$CONF.bak-$TS"
printf 'REMOTE_URL=%q\nSRC=%q\nNETRC=%q\n' "$REMOTE_URL" "$SRC" "$NETRC" > "$CONF"
chmod 644 "$CONF"

# 4. publisher script
[ -f "$BIN" ] && cp -p "$BIN" "$BIN.bak-$TS"
cat > "$BIN" <<'PUB'
#!/bin/bash
# Uploads monitor status.json (no personal data) to the ai-ilya.ru hosting.
set -euo pipefail
. /etc/smart-monitor-publish.conf
[ -s "$SRC" ] || { echo "no $SRC"; exit 1; }
python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$SRC" || { echo "status.json is not valid JSON"; exit 1; }
# safety net: refuse if anything looks like an e-mail or a Russian phone number
if grep -Eq '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\+7[ (-]?[0-9]{3}[ )-]?[0-9]{3}[ -]?[0-9]{2}[ -]?[0-9]{2}' "$SRC"; then
  echo "personal-data pattern found in status.json, upload refused"; exit 2
fi
TMP=$(mktemp); trap 'rm -f "$TMP"' EXIT
cp "$SRC" "$TMP"
curl -sS --fail --netrc-file "$NETRC" --connect-timeout 15 --max-time 60 -T "$TMP" "${REMOTE_URL}status.json"
echo "uploaded $(stat -c %s "$TMP") bytes"
PUB
chmod 755 "$BIN"

# 5. systemd service + timer (every 60 s)
for f in "$UNIT.service" "$UNIT.timer"; do [ -f "$f" ] && cp -p "$f" "$f.bak-$TS"; done
cat > "$UNIT.service" <<'SVC'
[Unit]
Description=Publish monitor status.json to ai-ilya.ru hosting
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
Environment=HOME=/root
ExecStart=/usr/local/bin/smart-monitor-publish.sh
Nice=10
TimeoutStartSec=120
SVC
cat > "$UNIT.timer" <<'TMR'
[Unit]
Description=Publish monitor status.json to ai-ilya.ru every minute

[Timer]
OnBootSec=2min
OnUnitActiveSec=60s
AccuracySec=5s
Unit=smart-monitor-publish.service

[Install]
WantedBy=timers.target
TMR
systemctl daemon-reload

# 6. first upload now, then enable timer
if systemctl start smart-monitor-publish.service; then
  say "first upload: OK"
else
  journalctl -u smart-monitor-publish.service -n 15 --no-pager
  fail "first upload failed (see log above); timer NOT enabled"
fi
systemctl enable --now smart-monitor-publish.timer >/dev/null 2>&1
systemctl is-active --quiet smart-monitor-publish.timer && say "timer: active (every 60 s)"
journalctl -u smart-monitor-publish.service -n 3 --no-pager -o cat
say "rollback: systemctl disable --now smart-monitor-publish.timer; rm -f $UNIT.service $UNIT.timer $BIN $CONF $NETRC; systemctl daemon-reload"
say "DONE"
'@

$bash = ($bash -replace "`r", '').Replace('__NETRC_B64__', $netrcB64)
$tmp = Join-Path $env:TEMP ("smp-" + [Guid]::NewGuid().ToString('N') + '.sh')
try {
    [IO.File]::WriteAllText($tmp, $bash, (New-Object Text.UTF8Encoding $false))
    $bash = $null; $netrcB64 = $null
    Write-Host 'Настраиваю сервер...'
    if ($Mode -eq 'rs') {
        $lines = Invoke-Rs @('--script', $tmp)
        $lines | ForEach-Object { Write-Host $_ }
        $code = if (@(@($lines) -match '\[server\] DONE').Count -gt 0) { 0 } else { 1 }
    }
    elseif ($Mode -eq 'local') {
        $p = Start-Process -FilePath 'wsl.exe' -ArgumentList @('-d', $Distro, '-u', 'root', '--exec', 'bash', '-s') -RedirectStandardInput $tmp -NoNewWindow -Wait -PassThru
    } else {
        $sshArgs = $SshOpts + @($Server, 'wsl.exe', '-d', $Distro, '--exec', 'bash', '-s')
        $p = Start-Process -FilePath 'ssh' -ArgumentList $sshArgs -RedirectStandardInput $tmp -NoNewWindow -Wait -PassThru
    }
    if ($Mode -ne 'rs') { $code = $p.ExitCode }
}
finally {
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
}

Write-Host ''
if ($code -eq 0) {
    Write-Host 'Готово. Через минуту откройте https://ai-ilya.ru — карточки должны ожить.' -ForegroundColor Green
} else {
    Write-Host "Не получилось (код $code). Пришлите Claude скриншот этого окна." -ForegroundColor Red
}
