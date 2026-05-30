/************************************************************************
 * ColorPalette UXP Hybrid addon — 屏幕实时取色采样器（按需采样版）
 * getLatest() 每次被 JS 调用时当场读光标处屏幕像素 + 修饰键，
 * 由面板的 requestAnimationFrame 每帧调用 = 实时。无后台线程。
 *************************************************************************/
#include <windows.h>

#include <atomic>
#include <cstdio>
#include <fstream>
#include <string>
#include <cctype>

#include "UxpAddon.h"

namespace {

std::atomic<long long> g_calls{0};

void LogLine(const char* msg) {
    try {
        char tmp[MAX_PATH];
        DWORD n = GetTempPathA(MAX_PATH, tmp);
        std::string path = (n ? std::string(tmp) : std::string("")) + "colorpalette-uxp-addon.log";
        std::ofstream f(path, std::ios::app);
        if (f) {
            SYSTEMTIME st;
            GetLocalTime(&st);
            char ts[32];
            sprintf_s(ts, "%02d:%02d:%02d.%03d ", st.wHour, st.wMinute, st.wSecond, st.wMilliseconds);
            f << ts << msg << "\n";
        }
    } catch (...) {
    }
}

// 当场采样：光标坐标 + 该点屏幕像素 + 各按键状态 + PS 是否前台。
// 返回 "x,y,r,g,b,down,alt,shift,esc,ctrl,tab,psActive"
addon_value GetLatest(addon_env env, addon_callback_info info) {
    try {
        POINT p;
        if (!GetCursorPos(&p)) { p.x = 0; p.y = 0; }
        HDC screen = GetDC(NULL);
        COLORREF c = screen ? GetPixel(screen, p.x, p.y) : 0;
        if (screen) ReleaseDC(NULL, screen);
        int r = GetRValue(c), g = GetGValue(c), b = GetBValue(c);
        int down  = (GetAsyncKeyState(VK_LBUTTON) & 0x8000) ? 1 : 0;
        int alt   = (GetAsyncKeyState(VK_MENU)    & 0x8000) ? 1 : 0;
        int shift = (GetAsyncKeyState(VK_SHIFT)   & 0x8000) ? 1 : 0;
        int ctrl  = (GetAsyncKeyState(VK_CONTROL) & 0x8000) ? 1 : 0;
        int esc   = (GetAsyncKeyState(VK_ESCAPE)  & 0x8000) ? 1 : 0;
        int tab   = (GetAsyncKeyState(VK_TAB)     & 0x8000) ? 1 : 0;
        // PS 是否在最前：判断前台窗口所属进程可执行名是否为 Photoshop。
        // 进程查询(OpenProcess+QueryFullProcessImageName)单次约 4ms，48次/秒会拖卡取色循环，
        // 故「缓存」：每 15 次调用才真查一次，其余返回上次结果（前台窗口不会在 ~240ms 内变化）。
        static int s_psActive = 0;
        static int s_psTick = 0;
        if ((s_psTick++ % 15) == 0) {
            int v = 0;
            HWND fgw = GetForegroundWindow();
            DWORD fgpid = 0;
            if (fgw) GetWindowThreadProcessId(fgw, &fgpid);
            if (fgpid) {
                HANDLE hproc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, fgpid);
                if (hproc) {
                    char path[MAX_PATH]; DWORD sz = MAX_PATH;
                    if (QueryFullProcessImageNameA(hproc, 0, path, &sz)) {
                        std::string nm(path);
                        for (size_t i = 0; i < nm.size(); ++i) nm[i] = (char)tolower((unsigned char)nm[i]);
                        if (nm.find("photoshop") != std::string::npos) v = 1;
                    }
                    CloseHandle(hproc);
                }
            }
            s_psActive = v;
        }
        int psActive = s_psActive;

        char buf[160];
        int len = sprintf_s(buf, "%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d", p.x, p.y, r, g, b, down, alt, shift, esc, ctrl, tab, psActive);
        addon_value out = nullptr;
        Check(UxpAddonApis.uxp_addon_create_string_utf8(env, buf, (size_t)len, &out));
        return out;
    } catch (...) {
        return CreateErrorFromException(env);
    }
}

// 打破 Windows「Alt 菜单激活」：注入一个无害保留键(VK_NONAME 0xFC)的按下+松开。
// 原理：Alt 按下→松开之间只要夹有其他键事件，松开时就不会激活菜单栏 → 不进 menu mode → 不卡。
// VK_NONAME 不对应任何字符/快捷键，对 PS 完全无副作用。JS 在取色态(armed)每帧调一次。
addon_value BreakMenu(addon_env env, addon_callback_info info) {
    try {
        keybd_event(VK_NONAME, 0, 0, 0);                    // key down
        keybd_event(VK_NONAME, 0, KEYEVENTF_KEYUP, 0);      // key up
        addon_value out = nullptr;
        Check(UxpAddonApis.uxp_addon_create_string_utf8(env, "ok", 2, &out));
        return out;
    } catch (...) {
        return CreateErrorFromException(env);
    }
}

// start/stop 保留为空操作（兼容 JS 端调用）
addon_value Noop(addon_env env, addon_callback_info info) {
    try {
        addon_value out = nullptr;
        Check(UxpAddonApis.uxp_addon_create_string_utf8(env, "ok", 2, &out));
        return out;
    } catch (...) {
        return CreateErrorFromException(env);
    }
}

addon_value Init(addon_env env, addon_value exports, const addon_apis& api) {
    addon_value fn = nullptr;
    api.uxp_addon_create_function(env, NULL, 0, Noop, NULL, &fn);
    api.uxp_addon_set_named_property(env, exports, "start", fn);
    api.uxp_addon_create_function(env, NULL, 0, Noop, NULL, &fn);
    api.uxp_addon_set_named_property(env, exports, "stop", fn);
    api.uxp_addon_create_function(env, NULL, 0, GetLatest, NULL, &fn);
    api.uxp_addon_set_named_property(env, exports, "getLatest", fn);
    api.uxp_addon_create_function(env, NULL, 0, BreakMenu, NULL, &fn);
    api.uxp_addon_set_named_property(env, exports, "breakMenu", fn);
    LogLine("addon Init v3: registered start/stop/getLatest/breakMenu (psActive cached + anti Alt-menu)");
    return exports;
}

}  // namespace

UXP_ADDON_INIT(Init)

void terminate(addon_env env) {}
UXP_ADDON_TERMINATE(terminate)
