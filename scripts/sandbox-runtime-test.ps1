$ErrorActionPreference = 'Stop'
if ($env:USERNAME -ne 'WDAGUtilityAccount' -or -not (Test-Path 'C:\BlinkStreamInput\sandbox-only.marker')) { throw 'Guest only' }
$env:PYTHONDONTWRITEBYTECODE = '1'
$result = @{status = 'running'; inputReadOnly = $true}
try {
    $result.streamlinkVersion = (& C:\BlinkStreamInput\runtime\bin\streamlink.exe --version 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Portable Streamlink failed' }
    $result.ffmpegVersion = (& C:\BlinkStreamInput\runtime\ffmpeg\ffmpeg.exe -version 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Portable FFmpeg failed' }
    $result.status = 'passed'
} catch { $result.status = 'failed'; $result.error = $_.Exception.Message }
$result | ConvertTo-Json -Depth 4 | Set-Content C:\BlinkStreamReport\runtime.json -Encoding UTF8
