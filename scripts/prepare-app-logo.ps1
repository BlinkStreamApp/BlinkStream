param(
  [Parameter(Mandatory = $true)][string]$Source,
  [Parameter(Mandatory = $true)][string]$Destination
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$image = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $Source).Path)
$canvas = $null
$graphics = $null
try {
  $side = [Math]::Max($image.Width, $image.Height)
  $canvas = [System.Drawing.Bitmap]::new($side, $side, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($canvas)
  $graphics.Clear([System.Drawing.Color]::Transparent)
  # Keep the supplied artwork pixel-for-pixel; only center it on a square canvas.
  $x = [int][Math]::Floor(($side - $image.Width) / 2)
  $y = [int][Math]::Floor(($side - $image.Height) / 2)
  $graphics.DrawImageUnscaled($image, $x, $y)
  $canvas.Save([System.IO.Path]::GetFullPath($Destination), [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  if ($graphics) { $graphics.Dispose() }
  if ($canvas) { $canvas.Dispose() }
  $image.Dispose()
}
