#Requires AutoHotkey v2.0
#SingleInstance Force
; =====================================================================
;  Photoshop 绘画键位改造 (AutoHotkey v2)
;  仅在 Photoshop 前台时生效，其他程序完全不受影响。
;
;  键位：
;    Q          画笔          (发 PS 的 B)
;    E          橡皮          (发 PS 的 E)
;    R          自由套索      (发 PS 的 L)
;    A          旋转视图工具  (发 PS 的 R；切过去后鼠标拖着转，转完按 Q 回画笔)
;    V          魔棒          (发 PS 的 W)
;    Z          直线/形状工具 (发 PS 的 U)
;    C          模糊工具      (发 PS 的 K —— 模糊工具无默认快捷键，需先在 PS 给它配为 K)
;    W          放大          (Ctrl +)
;    S          缩小          (Ctrl -)
;    T          水平翻转视图  (发 F2 —— 见下方一次性配置)
;    Ctrl+F     前景色填充选区(发 PS 的 Alt+Delete；无选区则填整层)
;    Ctrl+Alt+左键拖动  改笔刷大小 (翻译成 PS 硬编码的 Alt+右键拖)
;
;    F1         ★总开关：暂停/恢复本脚本（用文字工具打字前按一下暂停，画完再按恢复）
;
;  ★重要：Q/E/R/A/V/Z/C/W/S/T 是裸字母键，脚本启用时这些字母会被改成工具/缩放。
;    所以用【文字工具】打字、或在任何输入框输入含这些字母的内容前，
;    先按 F1 暂停脚本；打完再按 F1 恢复。Ctrl 组合键(Ctrl+S 等)不受影响。
;
;  —— T 键一次性配置（约 1 分钟，只做一次）——
;    1. PS 菜单 窗口 → 动作，新建动作，"功能键"选 F2，开始记录
;    2. 点 视图 → 水平翻转
;    3. 停止记录
;    之后 F2 = 翻转视图，本脚本的 T 转发 F2 即生效。
;    （为什么不直接点菜单：中文界面菜单助记键对不上、且会触发 Alt 菜单模式，不稳。）
;
;  前置：装 AutoHotkey v2.0；PS 进程名为 Photoshop.exe（若不同改下面 ahk_exe）；
;        A 键旋转视图需 PS 已开 首选项→性能→使用图形处理器。
; =====================================================================

; ---- F1 总开关：暂停/恢复（全局有效，与 PS 是否前台无关）----
F1::
{
    Suspend -1                                  ; 切换暂停状态
    if A_IsSuspended
        TrayTip "PS 键位：已暂停", "按 F1 恢复（可正常打字）", 1
    else
        TrayTip "PS 键位：已启用", "按 F1 暂停", 1
}

#HotIf WinActive("ahk_exe Photoshop.exe")

; —— 工具切换：裸键（不加 *，只在无修饰键时触发，绝不拦截 Ctrl+S/Ctrl+A 等组合键）——
q::Send "b"          ; 画笔 (B)
e::Send "e"          ; 橡皮 (E)
r::Send "l"          ; 自由套索 (L)
a::Send "r"          ; 旋转视图工具 (R)
v::Send "w"          ; 魔棒 (W)
z::Send "u"          ; 直线/形状工具 (U)
c::Send "k"          ; 模糊工具（PS 无默认快捷键，已在 PS 里手动给模糊工具配为 K，此处转发 K）

; —— 缩放 ——
w::Send "^{=}"       ; 放大  (Ctrl +)
s::Send "^{-}"       ; 缩小  (Ctrl -)

; —— 水平翻转视图：转发 F2（需先在 PS 录动作绑 F2，见顶部） ——
t::Send "{F2}"

; —— 前景色填充选区：Ctrl+F → Alt+Delete（PS 固定快捷键） ——
^f::Send "!{Delete}"

; —— 改笔刷大小：Ctrl+Alt+左键拖 → 转发为 PS 原生 Alt+右键拖（有实时轮廓）——
;    方向用 PS 原生：横向拖=大小（左小右大）、纵向拖=透明度/硬度。
;    （试过重映射方向、MouseMove 锁纵向、低层钩子改 lParam 锁纵向——都失败：
;      PS 在拖拽时用 GetCursorPos 实时查真实光标，绕过所有"改事件/MouseMove"手段，
;      唯一能锁的办法是 SetCursorPos 抢光标但会闪烁。故接受 PS 原生方向，最稳。）
;    踩坑：触发时 Ctrl/Alt 物理按着 → 必须 {Blind^!} 真松开，否则 PS 收到 Ctrl+Alt+右键=复制移动图层。
;          左键按下被热键消费 → 用临时热键抓 LButton Up 判松开（GetKeyState 失真）。
;      · 结束：松开左键 或 松开 Ctrl/Alt。
#HotIf WinActive("ahk_exe Photoshop.exe") and GetKeyState("Ctrl","P") and GetKeyState("Alt","P")
*LButton::
{
    global _brushLUp := false               ; 左键松开标志，由 BrushLUp 置位
    Hotkey "~*LButton Up", BrushLUp, "On"   ; 临时捕获左键抬起事件
    Send "{Blind}{LButton up}"              ; 取消透传下去的左键按下，避免画一笔
    Send "{Blind^!}{Ctrl up}{Alt up}"       ; 真松开物理 Ctrl+Alt，PS 只看到 Alt+右键
    Send "{Alt down}{RButton down}"         ; 进入 PS 原生 Alt+右键拖（有实时轮廓）
    while (!_brushLUp and (GetKeyState("Ctrl","P") or GetKeyState("Alt","P")))
        Sleep 10
    Send "{RButton up}{Alt up}"             ; 收尾
    Hotkey "~*LButton Up", "Off"            ; 注销临时热键
}
#HotIf   ; ===== Ctrl+Alt 条件作用域结束 =====

BrushLUp(*) {                               ; 左键抬起事件 → 置位（global 才能写入外部变量）
    global _brushLUp := true
}

TrayTip "PS 键位已加载", "PS 前台时生效 · F1 暂停/恢复", 1
