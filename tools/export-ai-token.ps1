# Выгрузка актуального архива проекта в C:\AI token (без секретов).
# Запуск: powershell -ExecutionPolicy Bypass -File C:\Ilya-audit\tools\export-ai-token.ps1
$ErrorActionPreference = 'Stop'
$src  = 'C:\Ilya-audit'
$dst  = 'C:\AI token'
$mem  = Join-Path $env:USERPROFILE '.claude\projects\C--Ilya-audit\memory'
$tmp  = Join-Path $env:TEMP 'ai-token-export'

if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
New-Item -ItemType Directory -Force $tmp, $dst | Out-Null

$files = 'CLAUDE.md','HANDOFF.md','AUDIT-REPORT.md','README.md','SERVER-CONTEXT.md','SERVER-SNAPSHOT.json',
         'GATEWAY-RESUME.md','CONSTITUTION.md','AGENTS.md','CLAUDE-SERVER.md','AI_Server_Interactive_Map_Spec.md'
foreach ($f in $files) { if (Test-Path "$src\$f") { Copy-Item "$src\$f" $tmp } }

foreach ($dir in 'steps','evidence','dashboard','infra','src','tools') {
    if (Test-Path "$src\$dir") {
        robocopy "$src\$dir" "$tmp\$dir" /E /NFL /NDL /NJH /NJS /NP /XF *.bak *.bak-* known_hosts* *.netrc .env auth.json *.key *.pem /XD secrets .claude .agents | Out-Null
    }
}
if (Test-Path $mem) { robocopy $mem "$tmp\memory" /E /NFL /NDL /NJH /NJS /NP | Out-Null }

# Защита: не выгружать, если похоже на ключи/токены
$hits = Get-ChildItem $tmp -Recurse -File | Select-String -Pattern 'https?://[^/\s:@]+:[^/\s@]+@','(sk|ghp|gho|github_pat|xox[bp])[-_][A-Za-z0-9]{16,}','\b\d{9,10}:[A-Za-z0-9_-]{30,}' -AllMatches |
        Where-Object { $_.Line -notmatch '@[\w.-]*example(\.\w+)?[/\s"'']' } | Group-Object Path | % { $_.Group[0] }
if ($hits) { $hits | % { "SECRET? $($_.Path.Replace($tmp,'')):$($_.LineNumber)" }; throw 'Найдены похожие на секреты строки, выгрузка остановлена' }

$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
Compress-Archive -Path "$tmp\*" -DestinationPath "$dst\ilya-audit-latest.zip" -Force
Copy-Item "$src\HANDOFF.md","$src\GATEWAY-RESUME.md" $dst -Force
Set-Content -Encoding utf8 "$dst\ОБНОВЛЕНО.txt" "Последняя выгрузка: $(Get-Date -Format 'dd.MM.yyyy HH:mm')`r`nАрхив: ilya-audit-latest.zip (без secrets/, ключей, settings.json). Не пересылать: внутри серверный код с e-mail."
Remove-Item $tmp -Recurse -Force
"OK $stamp -> $dst\ilya-audit-latest.zip {0:N1} MB" -f ((Get-Item "$dst\ilya-audit-latest.zip").Length/1MB)
