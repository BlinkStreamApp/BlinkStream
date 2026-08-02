param(
    [Parameter(Mandatory=$true)]
    [string]$SnapshotName
)

$backupDir = "C:\Users\alber\Backups\BlinkStream\$SnapshotName"
$target = "C:\Users\alber\Desktop\IA Project\BlinkStream\blinkstream"

if (-not (Test-Path $backupDir)) {
    Write-Host "[restore] ERROR: No existe $backupDir" -ForegroundColor Red
    Get-ChildItem "C:\Users\alber\Backups\BlinkStream" -Directory -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "  $($_.Name)" }
    exit 1
}

Write-Host "[restore] Restaurando desde: $backupDir" -ForegroundColor Yellow
$confirm = Read-Host "Continuar? (s/n)"
if ($confirm -ne 's') { Write-Host "Cancelado"; exit 0 }

& "$PSScriptRoot\backup.ps1" -Description "pre-restore"
Get-ChildItem $target -Exclude '.git','scripts','node_modules' -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force

$excludeDirs = @('node_modules', 'target', 'dist', '.git')
robocopy $backupDir $target /MIR /XD $excludeDirs /XF "*.log" /R:0 /W:0 | Out-Null

Write-Host "[restore] OK. Ejecuta 'npm install' si es necesario." -ForegroundColor Green
