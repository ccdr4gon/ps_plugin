// 代码生成色环 PNG（1024x1024，透明底，细环带，抗锯齿）。
// 色相 0=红 在正上方、顺时针，与面板标记几何一致。用 LockBits 直接写字节，快。
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

class GenRing {
    static void Hsv(double h, out int R, out int G, out int B) {   // s=v=1
        double hp = (h % 360) / 60, x = 1 - Math.Abs(hp % 2 - 1);
        double r = 0, g = 0, b = 0;
        if (hp < 1) { r = 1; g = x; }
        else if (hp < 2) { r = x; g = 1; }
        else if (hp < 3) { g = 1; b = x; }
        else if (hp < 4) { g = x; b = 1; }
        else if (hp < 5) { r = x; b = 1; }
        else { r = 1; b = x; }
        R = (int)Math.Round(r * 255); G = (int)Math.Round(g * 255); B = (int)Math.Round(b * 255);
    }
    static double Clamp01(double v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

    static void Main() {
        int S = 2048;
        double c = S / 2.0, Ro = S * 0.475, Ri = S * 0.44;   // 环带：外径0.475 内径0.44
        double aa = 2.5;                                      // 边缘抗锯齿过渡宽度（像素，越大越柔）
        var bmp = new Bitmap(S, S, PixelFormat.Format32bppArgb);
        var data = bmp.LockBits(new Rectangle(0, 0, S, S), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
        int stride = data.Stride;
        byte[] buf = new byte[stride * S];
        for (int y = 0; y < S; y++) {
            for (int x = 0; x < S; x++) {
                double dx = x + 0.5 - c, dy = y + 0.5 - c, d = Math.Sqrt(dx * dx + dy * dy);
                double aOut = Clamp01((Ro - d) / aa + 0.5);
                double aIn = Clamp01((d - Ri) / aa + 0.5);
                double cover = aOut * aIn;
                int idx = y * stride + x * 4;
                if (cover > 0.003) {
                    double ang = Math.Atan2(dy, dx) * 180 / Math.PI;
                    double hue = (ang + 90 + 360) % 360;
                    int R, G, B; Hsv(hue, out R, out G, out B);
                    byte a = (byte)Math.Round(cover * 255);
                    buf[idx + 0] = (byte)B; buf[idx + 1] = (byte)G; buf[idx + 2] = (byte)R; buf[idx + 3] = a;
                } else {
                    buf[idx + 0] = 0; buf[idx + 1] = 0; buf[idx + 2] = 0; buf[idx + 3] = 0;
                }
            }
        }
        Marshal.Copy(buf, 0, data.Scan0, buf.Length);
        bmp.UnlockBits(data);
        string outp = @"C:\Users\ccdragon\_code\ps_plugin\uxp-hybrid\plugin\assets\hue-ring.png";
        bmp.Save(outp, ImageFormat.Png);
        Console.WriteLine("saved " + S + "px AA ring " + outp);
    }
}
