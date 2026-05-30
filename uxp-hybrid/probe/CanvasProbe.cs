// 验证能否读到 Photoshop 的 GPU 画布像素，并对比 PrintWindow vs GDI 屏幕 GetPixel（均 DPI 感知）。
using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

class CanvasProbe {
    [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr hwnd, IntPtr hdcBlt, uint nFlags);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd, out RECT r);
    [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr h);
    [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr h, IntPtr dc);
    [DllImport("gdi32.dll")] static extern uint GetPixel(IntPtr hdc, int x, int y);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] static extern uint GetDpiForSystem();

    [StructLayout(LayoutKind.Sequential)] struct RECT { public int left, top, right, bottom; }
    [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }
    const uint PW_RENDERFULLCONTENT = 2;

    static string RGB(uint p) { return (p & 0xFF) + "," + ((p >> 8) & 0xFF) + "," + ((p >> 16) & 0xFF); }

    static void Main() {
        SetProcessDPIAware();
        try { Console.WriteLine("系统 DPI 缩放: " + (GetDpiForSystem() / 96.0 * 100) + "%"); } catch { Console.WriteLine("DPI: (GetDpiForSystem 不可用)"); }

        var procs = Process.GetProcessesByName("Photoshop");
        if (procs.Length == 0) { Console.WriteLine("ERR: 未找到 Photoshop"); return; }
        IntPtr hwnd = IntPtr.Zero;
        foreach (var p in procs) { if (p.MainWindowHandle != IntPtr.Zero) { hwnd = p.MainWindowHandle; break; } }
        if (hwnd == IntPtr.Zero) { Console.WriteLine("ERR: PS 主窗口句柄为空"); return; }

        RECT r; GetWindowRect(hwnd, out r);
        int w = r.right - r.left, h = r.bottom - r.top;
        Console.WriteLine("PS 窗口: " + w + "x" + h + " @ (" + r.left + "," + r.top + ")");

        var bmp = new Bitmap(w, h, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(bmp)) {
            IntPtr hdc = g.GetHdc();
            bool ok = PrintWindow(hwnd, hdc, PW_RENDERFULLCONTENT);
            g.ReleaseHdc(hdc);
            Console.WriteLine("PrintWindow ok=" + ok);
        }
        string outPng = AppDomain.CurrentDomain.BaseDirectory + "ps_capture.png";
        bmp.Save(outPng, ImageFormat.Png);
        Console.WriteLine("截图: " + outPng + "\n");

        // 同点对比 PrintWindow(窗口相对) vs GDI 屏幕(绝对)
        int[][] pts = new int[][] {
            new int[]{ w/2, h/2 }, new int[]{ w/2, h/3 }, new int[]{ w*2/5, h/2 },
            new int[]{ w*3/5, h/2 }, new int[]{ w/2, h*3/5 }
        };
        IntPtr sdc = GetDC(IntPtr.Zero);
        Console.WriteLine("窗口相对点 :  PrintWindow   |  GDI屏幕GetPixel   (匹配则说明 GDI 也能读)");
        foreach (var pt in pts) {
            var c = bmp.GetPixel(pt[0], pt[1]);
            uint sp = GetPixel(sdc, r.left + pt[0], r.top + pt[1]);
            string pw = c.R + "," + c.G + "," + c.B;
            string match = (pw == RGB(sp)) ? "  [一致]" : "  [不同]";
            Console.WriteLine("(" + pt[0] + "," + pt[1] + ") :  " + pw.PadRight(13) + " | " + RGB(sp).PadRight(13) + match);
        }
        // 光标处
        POINT cur; GetCursorPos(out cur);
        uint scur = GetPixel(sdc, cur.X, cur.Y);
        int cx = cur.X - r.left, cy = cur.Y - r.top;
        string pwc = (cx >= 0 && cy >= 0 && cx < w && cy < h) ? (bmp.GetPixel(cx, cy).R + "," + bmp.GetPixel(cx, cy).G + "," + bmp.GetPixel(cx, cy).B) : "(窗口外)";
        Console.WriteLine("光标(" + cur.X + "," + cur.Y + ") :  PrintWindow=" + pwc + "  GDI屏幕=" + RGB(scur));
        ReleaseDC(IntPtr.Zero, sdc);
        bmp.Dispose();
    }
}
