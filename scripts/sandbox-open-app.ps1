$ErrorActionPreference = 'Stop'
if ($env:USERNAME -ne 'WDAGUtilityAccount' -or -not (Test-Path 'C:\BlinkStreamInput\sandbox-only.marker')) { throw 'Guest only' }
$identity = Get-Content -Raw C:\BlinkStreamInput\identity.json | ConvertFrom-Json
$package = Get-AppxPackage -Name $identity.name
if (-not $package -or $package.PackageFamilyName -ne $identity.packageFamilyName) { throw 'Expected guest package missing' }
$launch = 'shell:AppsFolder\' + $package.PackageFamilyName + '!BlinkStream'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Blink Stream.lnk'))
$shortcut.TargetPath = 'C:\Windows\explorer.exe'
$shortcut.Arguments = $launch
$shortcut.Save()
Start-Process C:\Windows\explorer.exe -ArgumentList $launch
Start-Sleep -Seconds 5
@{package=$package.PackageFullName; processes=@(Get-Process blinkstream -ErrorAction SilentlyContinue | Select-Object Id,MainWindowHandle,Responding); desktopShortcut=$true} | ConvertTo-Json -Depth 3 | Set-Content C:\BlinkStreamReport\opened-app.json -Encoding UTF8
