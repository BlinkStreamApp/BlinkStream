$ErrorActionPreference = 'Stop'
if ($env:USERNAME -ne 'WDAGUtilityAccount' -or -not (Test-Path 'C:\BlinkStreamInput\sandbox-only.marker')) { throw 'Guest only' }
$identity = Get-Content -Raw C:\BlinkStreamInput\identity.json | ConvertFrom-Json
$package = Get-AppxPackage -Name $identity.name
$report = @{installed=$package.PackageFullName; diagnostics=@()}
foreach ($log in @('Microsoft-Windows-CodeIntegrity/Operational', 'Microsoft-Windows-AppLocker/EXE and DLL', 'Application')) {
    $report.diagnostics += @(Get-WinEvent -FilterHashtable @{LogName=$log;StartTime=(Get-Date).AddMinutes(-8)} -MaxEvents 30 -ErrorAction SilentlyContinue | Select-Object ProviderName,Id,Message)
}
$report.acl = (& icacls.exe (Join-Path $package.InstallLocation 'runtime\streamlink\bin\streamlink.exe') | Out-String)
Start-Process explorer.exe -ArgumentList ('shell:AppsFolder\' + $package.PackageFamilyName + '!BlinkStream')
Start-Sleep -Seconds 20
$report.processes = @(Get-Process blinkstream,streamlink,python,ffmpeg -ErrorAction SilentlyContinue | Select-Object Name,Id,MainWindowHandle,Responding)
$report.logs = @()
foreach ($folder in @(($env:LOCALAPPDATA + '\com.blinkstream.desktop'), ($env:LOCALAPPDATA + '\Packages\' + $package.PackageFamilyName))) {
    $report.logs += @(Get-ChildItem $folder -Recurse -Filter '*.log' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName)
}
$report.logTail = @($report.logs | ForEach-Object { Get-Content -LiteralPath $_ -Tail 15 })
$report | ConvertTo-Json -Depth 5 | Set-Content C:\BlinkStreamReport\package-diagnostics.json -Encoding UTF8
