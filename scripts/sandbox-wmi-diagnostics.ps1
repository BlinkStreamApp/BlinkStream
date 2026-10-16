$ErrorActionPreference = 'Stop'
if (-not (Test-Path 'C:\BlinkStreamInput\sandbox-only.marker') -or -not (Test-Path 'C:\Users\WDAGUtilityAccount')) { throw 'Guest-only diagnostic' }
$report = @{user=$env:USERNAME; service=(Get-Service winmgmt).Status.ToString()}
try { $report.version=(Get-CimInstance Win32_OperatingSystem).Version; $report.status='passed' }
catch { $report.status='failed';$report.error=$_.Exception.Message }
$report | ConvertTo-Json | Set-Content ('C:\BlinkStreamReport\wmi-' + $env:USERNAME + '.json') -Encoding UTF8
