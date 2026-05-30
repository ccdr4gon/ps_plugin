// 实时读光标处屏幕像素（Per-Monitor-V2 DPI 感知），验证 GDI GetPixel 在 150% 缩放下准不准。
// 运行后约 10 秒内，把鼠标在 PS 图像里几个已知颜色上慢慢移动，看打印的 RGB 对不对。
using System;
using System.Runtime.InteropServices;
using System.Threading;

class LiveSample {
    [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr h);
    [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr h, IntPtr dc);
    [DllImport("gdi32.dll")] static extern uint GetPixel(IntPtr hdc, int x, int y);
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }

    static void Main() {
        // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = -4
        bool dpi = SetProcessDpiAwarenessContext((IntPtr)(-4));
        Console.WriteLine("Per-Monitor-V2 DPI 感知: " + dpi + "\n慢慢移动鼠标到已知颜色上，对照下面读数：\n");
        string last = "";
        for (int i = 0; i < 40; i++) {
            POINT p; GetCursorPos(out p);
            IntPtr dc = GetDC(IntPtr.Zero);
            uint px = GetPixel(dc, p.X, p.Y);
            ReleaseDC(IntPtr.Zero, dc);
            string line = "光标(" + p.X + "," + p.Y + ") = " + (px & 0xFF) + "," + ((px >> 8) & 0xFF) + "," + ((px >> 16) & 0xFF);
            if (line != last) { Console.WriteLine(line); last = line; }
            Thread.Sleep(250);
        }
        Console.WriteLine("\n完成。");
    }
}
