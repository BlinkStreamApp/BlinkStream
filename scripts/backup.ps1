param(
    [Parameter(Mandatory=$true)]
    [string]$Description
)

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "C:\Users\alber\Backups\BlinkStream\$timestamp-$Description"

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$excludeDirs = @('node_modules', 'target', 'dist', '.git', 'build')
$source = "C:\Users\alber\Desktop\IA Project\BlinkStream\blinkstream"

robocopy $source $backupDir /MIR /XD $excludeDirs /XF "*.log" /R:0 /W:0 | Out-Null

Write-Host "[backup] Snapshot guardado en: $backupDir" -ForegroundColor Green
