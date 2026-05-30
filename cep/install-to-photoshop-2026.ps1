$ErrorActionPreference = "Stop"

$photoshopRoot = "C:\Users\ccdragon\sys_tools\PS\Adobe Photoshop 2026"
$extensionName = "com.ccd.colorpalette.cep"
$source = Join-Path $PSScriptRoot $extensionName
$targetRoot = Join-Path $env:APPDATA "Adobe\CEP\extensions"
$target = Join-Path $targetRoot $extensionName
$requiredRoot = Join-Path $photoshopRoot "Required\CEP\extensions"
$requiredTarget = Join-Path $requiredRoot $extensionName

if (-not (Test-Path -LiteralPath $source)) {
    throw "CEP extension source folder not found: $source"
}

New-Item -ItemType Directory -Force -Path $targetRoot | Out-Null

if (Test-Path -LiteralPath $target) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backup = "$target.backup-$stamp"
    Move-Item -LiteralPath $target -Destination $backup
    Write-Host "Backed up previous version to: $backup"
}

Copy-Item -LiteralPath $source -Destination $targetRoot -Recurse -Force

if (Test-Path -LiteralPath $requiredTarget) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backup = "$requiredTarget.disabled-$stamp"
    Move-Item -LiteralPath $requiredTarget -Destination $backup
    Write-Host "Disabled install-dir copy by moving it to: $backup"
}

foreach ($version in 4..20) {
    $key = "HKCU:\Software\Adobe\CSXS.$version"
    New-Item -Path $key -Force | Out-Null
    New-ItemProperty -Path $key -Name "PlayerDebugMode" -Value "1" -PropertyType String -Force | Out-Null
}

Write-Host "Installed CEP extension to: $target"
Write-Host "Restart Photoshop, then open Window > Extensions (Legacy) > Color Palette."
