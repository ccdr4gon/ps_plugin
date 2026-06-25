# Pack prototype/plugin/ (OKLCH 原型) into a .ccx (a .ccx is just a zip of the plugin folder, renamed).
# Output: uxp-hybrid\dist\ColorPaletteHybrid-OKLCH.ccx  (独立 id，可与正式版并存)
$ErrorActionPreference = "Stop"
$root   = "C:\Users\ccdragon\_code\ps_plugin\uxp-hybrid"
$plugin = Join-Path $root "prototype\plugin"
$dist   = Join-Path $root "dist"
$ccx    = Join-Path $dist "ColorPaletteHybrid-OKLCH.ccx"

# sanity: plugin must contain manifest + the addon it references
if (-not (Test-Path (Join-Path $plugin "manifest.json"))) { throw "manifest.json not found in prototype/plugin/" }
$addonName = (Get-Content (Join-Path $plugin "manifest.json") -Raw | ConvertFrom-Json).addon.name
$addonPath = Join-Path $plugin ("win\x64\" + $addonName)
if (-not (Test-Path $addonPath)) { throw ("addon referenced by manifest not found: " + $addonPath) }
Write-Host ("manifest addon -> " + $addonName + "  [OK]")

if (-not (Test-Path $dist)) { New-Item -ItemType Directory -Path $dist | Out-Null }
if (Test-Path $ccx) { Remove-Item $ccx -Force }

# Build the zip manually with .NET so entry paths use FORWARD slashes "/".
# (Compress-Archive on PS 5.1 writes backslashes, which Adobe's ccx loader may reject.)
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$fs  = [System.IO.File]::Open($ccx, [System.IO.FileMode]::Create)
$arc = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
$base = (Resolve-Path $plugin).Path.TrimEnd('\') + '\'
Get-ChildItem -Path $plugin -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($base.Length) -replace '\\','/'   # force forward slashes
    $entry = $arc.CreateEntry($rel, [System.IO.Compression.CompressionLevel]::Optimal)
    $es = $entry.Open()
    $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
    $es.Write($bytes, 0, $bytes.Length)
    $es.Close()
}
$arc.Dispose(); $fs.Close()

$sizeKB = [math]::Round((Get-Item $ccx).Length / 1KB, 1)
Write-Host ("OK: packed -> " + $ccx + "  (" + $sizeKB + " KB)")
