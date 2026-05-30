$ErrorActionPreference = "SilentlyContinue"
$logPath = Join-Path $env:TEMP "colorpalette-screenSampler.log"

function Write-SamplerLog($message) {
    Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) $message"
}

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class CcdScreenSamplerNative {
    [StructLayout(LayoutKind.Sequential)]
    public struct POINT {
        public int X;
        public int Y;
    }

    [DllImport("user32.dll")]
    public static extern bool GetCursorPos(out POINT lpPoint);

    [DllImport("user32.dll")]
    public static extern short GetAsyncKeyState(int vKey);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll")]
    public static extern IntPtr GetDC(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);

    [DllImport("gdi32.dll")]
    public static extern uint GetPixel(IntPtr hdc, int x, int y);
}
"@

$last = ""
$sampleCount = 0
$screen = [IntPtr]::Zero
$hdc = [CcdScreenSamplerNative]::GetDC($screen)
Write-SamplerLog "started pid=$PID"

try {
    while ($true) {
        $leftDown = ([CcdScreenSamplerNative]::GetAsyncKeyState(0x01) -band 0x8000) -ne 0

        if ($leftDown) {
            $foreground = [CcdScreenSamplerNative]::GetForegroundWindow()
            [uint32]$processId = 0
            [void][CcdScreenSamplerNative]::GetWindowThreadProcessId($foreground, [ref]$processId)
            $processName = ""

            if ($processId -gt 0) {
                $processName = (Get-Process -Id $processId -ErrorAction SilentlyContinue).ProcessName
            }

            if ($processName -eq "Photoshop") {
                $point = New-Object CcdScreenSamplerNative+POINT
                if ([CcdScreenSamplerNative]::GetCursorPos([ref]$point)) {
                    $pixel = [CcdScreenSamplerNative]::GetPixel($hdc, $point.X, $point.Y)

                    if ($pixel -ne 0xFFFFFFFF) {
                        $red = $pixel -band 0xFF
                        $green = ($pixel -shr 8) -band 0xFF
                        $blue = ($pixel -shr 16) -band 0xFF
                        $altDown = ([CcdScreenSamplerNative]::GetAsyncKeyState(0x12) -band 0x8000) -ne 0
                        $iDown = ([CcdScreenSamplerNative]::GetAsyncKeyState(0x49) -band 0x8000) -ne 0
                        $line = "$red,$green,$blue,$([int]$altDown),$([int]$iDown),$($point.X),$($point.Y)"

                        if ($line -ne $last) {
                            [Console]::Out.WriteLine($line)
                            [Console]::Out.Flush()
                            $last = $line
                            $sampleCount++
                            if ($sampleCount -le 5 -or ($sampleCount % 40) -eq 0) {
                                Write-SamplerLog "sample $line"
                            }
                        }
                    }
                }
            }
        } else {
            $last = ""
        }

        Start-Sleep -Milliseconds 25
    }
} finally {
    Write-SamplerLog "stopped pid=$PID"
    if ($hdc -ne [IntPtr]::Zero) {
        [void][CcdScreenSamplerNative]::ReleaseDC($screen, $hdc)
    }
}
