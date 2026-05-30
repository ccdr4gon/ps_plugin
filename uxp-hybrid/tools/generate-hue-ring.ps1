$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$scale = 2
$size = 220
$outerRadius = 104
$innerRadius = 87
$output = Join-Path $PSScriptRoot "..\plugin\assets\hue-ring.png"
$outputDir = Split-Path -Parent $output

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

function Convert-HsvToRgb {
    param([double]$Hue)

    $sector = $Hue / 60.0
    $x = 1.0 - [Math]::Abs(($sector % 2.0) - 1.0)

    if ($sector -lt 1.0) { return @(1.0, $x, 0.0) }
    if ($sector -lt 2.0) { return @($x, 1.0, 0.0) }
    if ($sector -lt 3.0) { return @(0.0, 1.0, $x) }
    if ($sector -lt 4.0) { return @(0.0, $x, 1.0) }
    if ($sector -lt 5.0) { return @($x, 0.0, 1.0) }
    return @(1.0, 0.0, $x)
}

$pixelSize = $size * $scale
$center = $pixelSize / 2.0
$inner = $innerRadius * $scale
$outer = $outerRadius * $scale
$bitmap = New-Object System.Drawing.Bitmap $pixelSize, $pixelSize, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

try {
    for ($y = 0; $y -lt $pixelSize; $y++) {
        for ($x = 0; $x -lt $pixelSize; $x++) {
            $dx = ($x + 0.5) - $center
            $dy = ($y + 0.5) - $center
            $distance = [Math]::Sqrt(($dx * $dx) + ($dy * $dy))

            $innerAlpha = [Math]::Min(1.0, [Math]::Max(0.0, $distance - ($inner - 1.0)))
            $outerAlpha = [Math]::Min(1.0, [Math]::Max(0.0, ($outer + 1.0) - $distance))
            $alpha = [Math]::Min($innerAlpha, $outerAlpha)

            if ($alpha -le 0.0) {
                $bitmap.SetPixel($x, $y, [System.Drawing.Color]::Transparent)
                continue
            }

            $hue = ([Math]::Atan2($dy, $dx) * 180.0 / [Math]::PI) + 90.0
            if ($hue -lt 0.0) { $hue += 360.0 }
            $rgb = Convert-HsvToRgb $hue
            $color = [System.Drawing.Color]::FromArgb(
                [Math]::Round($alpha * 255.0),
                [Math]::Round($rgb[0] * 255.0),
                [Math]::Round($rgb[1] * 255.0),
                [Math]::Round($rgb[2] * 255.0)
            )
            $bitmap.SetPixel($x, $y, $color)
        }
    }

    $bitmap.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host "Generated hue ring: $output"
} finally {
    $bitmap.Dispose()
}
