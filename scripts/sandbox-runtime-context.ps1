$ErrorActionPreference = 'Stop'
if ($env:USERNAME -ne 'WDAGUtilityAccount' -or -not (Test-Path 'C:\BlinkStreamInput\sandbox-only.marker')) { throw 'Guest only' }
$identity = Get-Content -Raw C:\BlinkStreamInput\identity.json | ConvertFrom-Json
$package = Get-AppxPackage -Name $identity.name
$runtime = Join-Path $package.InstallLocation 'runtime\streamlink\bin\streamlink.exe'
# Debug with the package identity; ordinary PowerShell lacks the WindowsApps token.
$arguments = '/d /s /c "set PYTHONDONTWRITEBYTECODE=1&& "' + $runtime + '" --version >C:\BlinkStreamReport\packaged-version.txt 2>&1"'
try {
    Invoke-CommandInDesktopPackage -PackageFamilyName $identity.packageFamilyName -AppId BlinkStream -Command C:\Windows\System32\cmd.exe -Args $arguments -PreventBreakaway
    $ffmpeg = Join-Path $package.InstallLocation 'runtime\streamlink\ffmpeg\ffmpeg.exe'
    $ffmpegArgs = '/d /s /c ""' + $ffmpeg + '" -nostdin -f lavfi -i color=c=purple:s=128x72:d=1 -c:v libx264 -pix_fmt yuv420p -y C:\BlinkStreamReport\ffmpeg-smoke.mp4 >C:\BlinkStreamReport\ffmpeg-smoke.log 2>&1"'
    Invoke-CommandInDesktopPackage -PackageFamilyName $identity.packageFamilyName -AppId BlinkStream -Command C:\Windows\System32\cmd.exe -Args $ffmpegArgs -PreventBreakaway
    Start-Sleep -Seconds 20
    @{fileExists=(Test-Path C:\BlinkStreamReport\packaged-version.txt); encodedVideoExists=(Test-Path C:\BlinkStreamReport\ffmpeg-smoke.mp4); processes=@(Get-Process cmd,streamlink,python -ErrorAction SilentlyContinue | Select-Object Name,Id)} | ConvertTo-Json -Depth 4 | Set-Content C:\BlinkStreamReport\context.json -Encoding UTF8
} catch { @{error=$_.Exception.Message}|ConvertTo-Json|Set-Content C:\BlinkStreamReport\context.json -Encoding UTF8 }
