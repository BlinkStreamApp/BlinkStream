Get-ChildItem "C:\Users\alber\Backups\BlinkStream" -Directory -ErrorAction SilentlyContinue | Sort-Object CreationTime -Descending | ForEach-Object {
    $size = (Get-ChildItem $_.FullName -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB
    Write-Host "$($_.Name)  ($([math]::Round($size, 2)) MB)"
}
