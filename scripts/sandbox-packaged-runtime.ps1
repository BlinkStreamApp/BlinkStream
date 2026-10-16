$ErrorActionPreference = 'Stop'
if ($env:USERNAME -ne 'WDAGUtilityAccount' -or -not (Test-Path 'C:\BlinkStreamInput\sandbox-only.marker')) { throw 'Guest only' }
$identity = Get-Content -Raw C:\BlinkStreamInput\identity.json | ConvertFrom-Json
try {
    $started = Get-Date
    Invoke-CommandInDesktopPackage -PackageFamilyName $identity.packageFamilyName -AppId BlinkStream -Command 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -Args '-NoProfile -ExecutionPolicy Bypass -File C:\BlinkStreamInput\validate.ps1' -PreventBreakaway
    for ($attempt = 0; $attempt -lt 45; $attempt++) {
        Start-Sleep -Seconds 1
        $file = Get-Item C:\BlinkStreamReport\validation.json -ErrorAction SilentlyContinue
        if ($file -and $file.LastWriteTime -gt $started) {
            $state = Get-Content -Raw $file.FullName | ConvertFrom-Json
            if ($state.status -notin @('running', 'wack-running')) { break }
        }
    }
    @{status='debug process dispatched, inspect validation.json separately'} | ConvertTo-Json | Set-Content C:\BlinkStreamReport\dispatch.json
} catch { @{status='failed';error=$_.Exception.Message} | ConvertTo-Json | Set-Content C:\BlinkStreamReport\dispatch.json }
