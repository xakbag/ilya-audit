@chcp 65001 >nul & set "WORKER_ARGS=%*" & powershell -NoProfile -ExecutionPolicy Bypass -Command "$f='%~f0'; iex ((Get-Content -LiteralPath $f -Raw -Encoding UTF8) -split '#{3}PS#{3}',2)[1]" & exit /b
###PS###
# Исполнитель ILYA CORE на API-ключе (не тратит подписку).
#   tools\claude-worker.cmd "текст задачи"
#   tools\claude-worker.cmd -f worker-tasks\задача.md
#   tools\claude-worker.cmd --set-key        (сохранить/сменить ключ)
# Настройки (переменные Windows, уровень пользователя):
#   ILYA_WORKER_API_KEY   — ключ Anthropic (спросит при первом запуске, в репозиторий не попадает)
#   ILYA_WORKER_BASE_URL  — необязательно: свой шлюз
#   ILYA_WORKER_MODEL     — по умолчанию claude-opus-5-5
#   ILYA_WORKER_BUDGET    — лимит $ на одну задачу, по умолчанию 5

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = New-Object Text.UTF8Encoding $false
$Root   = Split-Path -Parent (Split-Path -Parent $f)
$argStr = "$env:WORKER_ARGS".Trim()

function Get-UserVar($n) {
    $v = [Environment]::GetEnvironmentVariable($n, 'Process')
    if (-not $v) { $v = [Environment]::GetEnvironmentVariable($n, 'User') }
    return $v
}

# --- ключ ---
$key = Get-UserVar 'ILYA_WORKER_API_KEY'
if (-not $key -or $argStr -eq '--set-key') {
    $sec = Read-Host 'API-ключ Anthropic для исполнителя (не отображается)' -AsSecureString
    $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
    try { $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
    if (-not $key) { Write-Host 'Ключ пустой — отмена.' -ForegroundColor Red; exit 1 }
    [Environment]::SetEnvironmentVariable('ILYA_WORKER_API_KEY', $key, 'User')
    Write-Host 'Ключ сохранён в переменной Windows ILYA_WORKER_API_KEY.' -ForegroundColor Green
    if ($argStr -eq '--set-key') { exit 0 }
}

# --- задача ---
if ($argStr -match '^-f\s+(.+)$') {
    $path = $Matches[1].Trim('"', ' ')
    if (-not [IO.Path]::IsPathRooted($path)) { $path = Join-Path $Root $path }
    $task = Get-Content -LiteralPath $path -Raw -Encoding UTF8
} elseif ($argStr) {
    $task = $argStr.Trim('"')
} else {
    $task = Read-Host 'Задача для исполнителя'
}
if (-not $task.Trim()) { Write-Host 'Пустая задача.' -ForegroundColor Red; exit 1 }

$model  = Get-UserVar 'ILYA_WORKER_MODEL';  if (-not $model)  { $model = 'claude-opus-5-5' }
$budget = Get-UserVar 'ILYA_WORKER_BUDGET'; if (-not $budget) { $budget = '5' }
$base   = Get-UserVar 'ILYA_WORKER_BASE_URL'

# ключ только для этого процесса: подписка десктопа не затрагивается
$env:ANTHROPIC_API_KEY = $key
Remove-Item Env:CLAUDE_CODE_OAUTH_TOKEN -ErrorAction SilentlyContinue
if ($base) { $env:ANTHROPIC_BASE_URL = $base }
$key = $null

$allowed = @('Read', 'Edit', 'Write', 'Glob', 'Grep',
    'Bash(git *)', 'Bash(python *)', 'Bash(py *)', 'Bash(node *)', 'Bash(npm *)', 'Bash(npx *)',
    'Bash(ecc *)', 'Bash(ls *)', 'Bash(cat *)', 'Bash(head *)', 'Bash(tail *)', 'Bash(grep *)', 'Bash(curl *)')

$logDir = Join-Path $Root 'worker-logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$log   = Join-Path $logDir "$stamp.md"

Write-Host "Исполнитель: $model, лимит `$$budget, папка $Root" -ForegroundColor Cyan
Push-Location $Root
try {
    $raw = $task | & claude -p --output-format json --model $model --max-budget-usd $budget `
        --permission-mode acceptEdits --allowedTools @allowed `
        --append-system-prompt-file (Join-Path $Root 'tools\worker-prompt.md') 2>&1 | Out-String
    $code = $LASTEXITCODE
} finally {
    Pop-Location
    Remove-Item Env:ANTHROPIC_API_KEY -ErrorAction SilentlyContinue
}

$res = $null
try { $res = ($raw.Substring($raw.IndexOf('{'))) | ConvertFrom-Json } catch { }
if ($res) {
    $cost = '{0:N2}' -f [double]$res.total_cost_usd
    $text = "$($res.result)"
    $head = "# Исполнитель $stamp`n- модель: $model; шагов: $($res.num_turns); стоимость: `$$cost; ошибка: $($res.is_error); сессия: $($res.session_id)`n"
} else {
    $text = $raw
    $head = "# Исполнитель $stamp`n- не удалось разобрать ответ (код $code)`n"
}
[IO.File]::WriteAllText($log, "$head`n## Задача`n$task`n`n## Отчёт`n$text`n", (New-Object Text.UTF8Encoding $false))

Write-Host ''
Write-Host $head.Trim()
Write-Host ''
Write-Host $text
Write-Host ''
Write-Host "Журнал: $log" -ForegroundColor DarkGray
if ($res -and -not $res.is_error) { exit 0 } else { exit 1 }
