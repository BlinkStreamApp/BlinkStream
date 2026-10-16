param(
  [Parameter(Mandatory = $true)][string]$Source,
  [Parameter(Mandatory = $true)][string]$Plan,
  [Parameter(Mandatory = $true)][string]$Destination
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$image = [Drawing.Image]::FromFile((Resolve-Path -LiteralPath $Source).Path)
try {
  if ($image.Width -ne $image.Height -or $image.Width -lt 600) { throw 'Expected square high-resolution approved logo' }
  foreach ($asset in (Get-Content -Raw -LiteralPath $Plan | ConvertFrom-Json)) {
    if ($asset.name -notmatch '^(Square44x44Logo|Square150x150Logo|StoreLogo)\.(targetsize-\d+(_altform-(lightunplated|unplated))?|scale-\d+)\.png$' -or $asset.size -lt 16 -or $asset.size -gt 600) { throw 'Invalid Store icon plan' }
    $bitmap = [Drawing.Bitmap]::new($asset.size, $asset.size, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $attributes = [Drawing.Imaging.ImageAttributes]::new()
    try {
      $graphics.Clear([Drawing.Color]::Transparent)
      $graphics.CompositingMode = [Drawing.Drawing2D.CompositingMode]::SourceCopy
      $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $attributes.SetWrapMode([Drawing.Drawing2D.WrapMode]::TileFlipXY)
      $graphics.DrawImage($image, [Drawing.Rectangle]::new(0, 0, $asset.size, $asset.size), 0, 0, $image.Width, $image.Height, [Drawing.GraphicsUnit]::Pixel, $attributes)
      if ($bitmap.GetPixel(0, 0).A -ne 0 -or $bitmap.GetPixel($asset.size - 1, 0).A -ne 0) { throw 'Store icon must retain transparent corners' }
      $bitmap.Save((Join-Path $Destination $asset.name), [Drawing.Imaging.ImageFormat]::Png)
    } finally { $attributes.Dispose(); $graphics.Dispose(); $bitmap.Dispose() }
  }
} finally { $image.Dispose() }
Write-Host 'Store icons generated from approved logo, with DPI/target-size and unplated light/dark variants.'
