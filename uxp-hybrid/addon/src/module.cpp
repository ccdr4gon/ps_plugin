/************************************************************************
 * ColorPalette UXP Hybrid addon — 屏幕实时取色采样器
 *   后台线程 SamplerLoop() : ~120Hz 读光标处屏幕像素 + 各修饰键 + PS 是否前台，写 mutex 快照。
 *   getLatest() : 脚本线程调用，只 lock+copy 最新快照（不读屏）→ 脚本线程不再被 GPU 回读阻塞。
 *   breakMenu() : 注入无害保留键，打破 Windows 的 Alt 菜单激活（防 menu mode 卡顿），留在脚本线程。
 *************************************************************************/
#include <windows.h>

#include <cstdio>
#include <string>
#include <cctype>
#include <thread>
#include <mutex>
#include <atomic>
#include <chrono>

#include "UxpAddon.h"

namespace {

// ---- 后台采样线程：把慢的读屏(GetPixel) + 进程查询移出 UXP 脚本线程 ----
// worker 纯 Win32，绝不碰任何 UXP/JS API（addon_*/env/value/Task）；只把最新快照写进 mutex 保护的 g_snap。
struct Snapshot { int x, y, r, g, b, down, alt, shift, esc, ctrl, tab, psActive, valid; };
static std::mutex        g_mtx;             // 仅保护 g_snap
static Snapshot          g_snap{};           // 已发布的最新快照（默认全 0、valid=0）
static std::atomic<bool> g_stop{false};     // worker 停止标志
static std::thread       g_worker;          // 常驻采样线程

// 采样循环：~120Hz。所有慢活算进本地变量，仅最后加锁拷贝一次发布 → getLatest 永不被慢活阻塞。
static void SamplerLoop() {
    int lastR = 0, lastG = 0, lastB = 0;     // last-valid 颜色缓存（worker 私有，跨循环保留）
    int psActive = 0, psTick = 0;             // PS 前台缓存（worker 私有）
    while (!g_stop.load(std::memory_order_relaxed)) {
        POINT p;
        if (!GetCursorPos(&p)) { p.x = 0; p.y = 0; }
        // 多屏 / 越界守卫：校验光标在虚拟屏范围内（副屏可为负坐标），范围外不取像素。
        int vx = GetSystemMetrics(SM_XVIRTUALSCREEN);
        int vy = GetSystemMetrics(SM_YVIRTUALSCREEN);
        int vw = GetSystemMetrics(SM_CXVIRTUALSCREEN);
        int vh = GetSystemMetrics(SM_CYVIRTUALSCREEN);
        bool inBounds = (p.x >= vx && p.x < vx + vw && p.y >= vy && p.y < vy + vh);
        HDC screen = GetDC(NULL);
        COLORREF c = (screen && inBounds) ? GetPixel(screen, p.x, p.y) : CLR_INVALID;
        if (screen) ReleaseDC(NULL, screen);
        // last-valid 缓存：无效(越界 / GetPixel 失败=CLR_INVALID)则复用上次有效色，
        // 绝不把白(255,255,255)当颜色吐出（CLR_INVALID=0xFFFFFFFF 的 R/G/B 恰好都是 255）。
        bool ok = (c != CLR_INVALID);
        int r, g, b;
        if (ok) { r = GetRValue(c); g = GetGValue(c); b = GetBValue(c); lastR = r; lastG = g; lastB = b; }
        else    { r = lastR; g = lastG; b = lastB; }
        int down  = (GetAsyncKeyState(VK_LBUTTON) & 0x8000) ? 1 : 0;
        int alt   = (GetAsyncKeyState(VK_MENU)    & 0x8000) ? 1 : 0;
        int shift = (GetAsyncKeyState(VK_SHIFT)   & 0x8000) ? 1 : 0;
        int ctrl  = (GetAsyncKeyState(VK_CONTROL) & 0x8000) ? 1 : 0;
        int esc   = (GetAsyncKeyState(VK_ESCAPE)  & 0x8000) ? 1 : 0;
        int tab   = (GetAsyncKeyState(VK_TAB)     & 0x8000) ? 1 : 0;
        // PS 是否在最前：进程查询(OpenProcess+QueryFullProcessImageName)单次约 4ms，
        // 故每 15 次循环才真查一次，其余用缓存（在后台线程，不影响脚本线程）。
        if ((psTick++ % 15) == 0) {
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
            psActive = v;
        }
        Snapshot s{ p.x, p.y, r, g, b, down, alt, shift, esc, ctrl, tab, psActive, ok ? 1 : 0 };
        { std::lock_guard<std::mutex> lk(g_mtx); g_snap = s; }   // 发布：持锁仅一次结构体拷贝
        std::this_thread::sleep_for(std::chrono::milliseconds(8));   // ~120Hz；够细，覆盖任意 JS 读取节奏
    }
}

// getLatest()：脚本线程调用 → 只读最新快照，不做任何读屏/系统调用（lock+copy+sprintf）。
// 返回 "x,y,r,g,b,down,alt,shift,esc,ctrl,tab,psActive,valid"（valid=0：越界/取像素失败，颜色为上次有效值）
addon_value GetLatest(addon_env env, addon_callback_info info) {
    try {
        Snapshot s;
        { std::lock_guard<std::mutex> lk(g_mtx); s = g_snap; }
        char buf[192];
        int len = sprintf_s(buf, "%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d",
                            s.x, s.y, s.r, s.g, s.b, s.down, s.alt, s.shift, s.esc, s.ctrl, s.tab, s.psActive, s.valid);
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
    // DPI 感知（仅一次）：让 GetCursorPos / GetPixel 在 >100% 缩放、混合 DPI 下按物理像素对齐。
    // addon 与 PS 同进程：现代 PS（≥24.2）自带 manifest 已声明 PMv2，此调用多半返回 FALSE —— 这是良性的，
    // 说明进程已是 PMv2、采样本就对齐。动态解析以兼容无此 API 的旧系统；失败一律忽略，绝不影响加载。
    {
        typedef BOOL (WINAPI *SetCtxFn)(HANDLE);   // SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT)
        HMODULE u32 = GetModuleHandleW(L"user32.dll");
        SetCtxFn setCtx = u32 ? (SetCtxFn)GetProcAddress(u32, "SetProcessDpiAwarenessContext") : nullptr;
        if (setCtx) setCtx(reinterpret_cast<HANDLE>(static_cast<LONG_PTR>(-4)));   // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = (HANDLE)-4
    }

    addon_value fn = nullptr;
    api.uxp_addon_create_function(env, NULL, 0, Noop, NULL, &fn);
    api.uxp_addon_set_named_property(env, exports, "start", fn);
    api.uxp_addon_create_function(env, NULL, 0, Noop, NULL, &fn);
    api.uxp_addon_set_named_property(env, exports, "stop", fn);
    api.uxp_addon_create_function(env, NULL, 0, GetLatest, NULL, &fn);
    api.uxp_addon_set_named_property(env, exports, "getLatest", fn);
    api.uxp_addon_create_function(env, NULL, 0, BreakMenu, NULL, &fn);
    api.uxp_addon_set_named_property(env, exports, "breakMenu", fn);

    // 复位快照（重载后 file-scope 全局可能残留旧值，先给一帧干净的 valid=0）+ 启动后台采样线程。
    { std::lock_guard<std::mutex> lk(g_mtx); g_snap = Snapshot{}; }
    g_stop.store(false, std::memory_order_relaxed);
    if (!g_worker.joinable()) g_worker = std::thread(SamplerLoop);   // 幂等：避免重复 spawn
    return exports;
}

}  // namespace

UXP_ADDON_INIT(Init)

// 卸载/重载前停止并 join 后台线程（绝不 detach）——否则 worker 在 DLL 卸载后执行已释放代码 → use-after-unload 崩溃。
// terminate 在脚本线程、loader-lock 之外被调用，join 安全（worker 最长阻塞点仅 8ms sleep，<~20ms 即退出）。
void terminate(addon_env env) {
    g_stop.store(true, std::memory_order_relaxed);
    if (g_worker.joinable()) g_worker.join();
}
UXP_ADDON_TERMINATE(terminate)
