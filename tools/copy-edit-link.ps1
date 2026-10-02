# Копирует в буфер обмена ссылку для правок Дома 2 (код берётся из api.php, на экран не выводится).
$f = Join-Path $PSScriptRoot '..\house2\deploy\api.php'
$line = (Get-Content -LiteralPath $f -Encoding UTF8 | Select-Object -First 8) -join "`n"
if ($line -match "WRITE_KEY'?\s*,?\s*=?\s*>?\s*'([^']+)'") { $k = $Matches[1] } else { Write-Host 'Код не найден в api.php'; exit 1 }
Set-Clipboard -Value ("https://ai-ilya.online/?k=" + $k)
Write-Host 'Ссылка для правок скопирована в буфер обмена. Вставьте её в браузер на нужном устройстве один раз.'
