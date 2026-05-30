$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.IO.Compression.FileSystem

$extensionName = "com.ccd.colorpalette.cep"
$zxp = Join-Path $PSScriptRoot "color-palette-signed.zxp"
$targetRoot = Join-Path $env:APPDATA "Adobe\CEP\extensions"
$target = Join-Path $targetRoot $extensionName
$temp = Join-Path $env:TEMP "$extensionName.signed-extract"

if (-not (Test-Path -LiteralPath $zxp)) {
    throw "Signed ZXP not found: $zxp"
}

if (Test-Path -LiteralPath $temp) {
    Remove-Item -LiteralPath $temp -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $temp | Out-Null
[IO.Compression.ZipFile]::ExtractToDirectory($zxp, $temp)

New-Item -ItemType Directory -Force -Path $targetRoot | Out-Null

if (Test-Path -LiteralPath $target) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backup = "$target.backup-$stamp"
    Move-Item -LiteralPath $target -Destination $backup
    Write-Host "Backed up previous AppData copy to: $backup"
}

Move-Item -LiteralPath $temp -Destination $target

Write-Host "Installed signed CEP extension to: $target"
Write-Host "Restart Photoshop, then open Window > Extensions (Legacy) > Color Palette."
