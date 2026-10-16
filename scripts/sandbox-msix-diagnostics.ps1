$ErrorActionPreference = 'Stop'
if ($env:USERNAME -ne 'WDAGUtilityAccount' -or -not (Test-Path 'C:\BlinkStreamInput\sandbox-only.marker')) { throw 'Guest only' }
$events = @(Get-WinEvent -FilterHashtable @{LogName='Application';StartTime=(Get-Date).AddMinutes(-20)} -MaxEvents 60 -ErrorAction SilentlyContinue | Where-Object { $_.Message -match 'appcert|App Certification|Microsoft.Windows.SoftwareLogo' } | Select-Object ProviderName,Id,Message)
$events | ConvertTo-Json -Depth 5 | Set-Content 'C:\BlinkStreamReport\wack-errors.json' -Encoding UTF8
