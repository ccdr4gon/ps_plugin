# 调色盘 Hybrid — Photoshop UXP 插件

一个深色质感的 Photoshop 调色盘面板：**色环 + 方形 SV 取色区 + RGB/HSV 滑块**，并通过进程内 C++ addon 实现**画布实时吸色**（双击 Alt 激活，按住划过画布即可连续看一片区域的颜色分布）。

技术栈：**UXP Hybrid**（UXP 前端 + `.uxpaddon` 原生 C++ 模块）。要求 Photoshop 24.2+ / UXP API v2。

---

## 一、使用方式

### 安装（终端用户）
1. 双击 `调色盘Hybrid.ccx` → Creative Cloud 会自动安装（或在 PS「增效工具」里启用）。
2. 在 Photoshop 菜单 **增效工具 → 调色盘 Hybrid** 打开面板。
3. ⚠️ 仅 **Windows x64**（addon 是 Win 原生模块）。

### 面板操作
| 操作 | 效果 |
|---|---|
| 拖动**色环** | 改色相 H |
| 拖动**方形区** | 改饱和度 S / 明度 V |
| 拖动**滑块** / 点 **−/+** / 输入数字 | 精确调 RGB 或 HSV |
| 点左上角**前景色块** / ▶ | 把当前颜色写入 PS 前景色 |
| 点**背景色块** | 设为白色 |
| 用 **PS 吸管**在画布取色 | 面板自动同步（镜像前景色） |

### ⭐ 画布实时吸色（核心功能）
**双击 Alt → 第二下按住 → 在画布上划过** = 连续实时显示光标处颜色（合并色）。松开 Alt 退出，并把最后取到的颜色写入前景色。

- 为什么要"双击"激活：防止单击 Alt / Alt+Tab 等误触。
- 触发期间：PS 不在最前、按了左键/Ctrl/Shift/Tab/Esc 都会暂停吸色。

---

## 二、开发注意事项（踩坑记录，务必先读）

### 加载 / 调试
- 用 **UXP Developer Tool (UDT)** 加载 `plugin/manifest.json`。
- **改 JS/HTML/CSS** → UDT 点 **Reload** 即可（热重载）。
- **改 addon(C++) 或 manifest** → 必须 **Remove + 重新 Add**（Reload **不**重载 addon/manifest）。这是最容易忘、最坑的一条。
- addon DLL 被 PS 锁定无法覆盖 → 每次改 addon **换一个新文件名**（如 SamplerN→N+1），同步改 `manifest.json` 的 `addon.name` 和 `main.js` 的 `require(...)`。

### 验证只能在 PS 里
**浏览器预览 ≠ UXP 实际渲染。** UXP 用的是受限自研引擎，很多 CSS 在浏览器好看、在 PS 里走样。务必在 PS 内 Reload 看真实效果，别信浏览器预览。

### UXP CSS / 渲染限制（已踩，别再试）
| 想做的 | UXP 不支持 / 表现 | 解法 |
|---|---|---|
| 色环渐变 | `conic-gradient` 不支持；`canvas` 能渲染但**闪烁卡顿** | **高清 PNG 降采样**（`assets/hue-ring.png`，代码生成见 `probe/GenRing.cs`） |
| 滑块三角游标 | CSS `border` 拼三角不渲染 | 用 ▲ 字形（`&#9650;`） |
| 步进器 −/+ 按钮 | 原生 `<button>` 带默认圆形焦点环、裁切内容 | 改用 `<div>` 做按钮 |
| 透明棋盘格 | 多层 `linear-gradient` 棋盘错乱 | 平铺 PNG（`assets/checker.png`） |
| 数字输入框 | `<input>` 不认 `var()`/`transparent` 背景，会露黑底 | 用字面色值，边框/背景做在 input 自身 |
| 数字显示 | `el.textContent = 0`（数字 0，falsy）会"0/空"闪 | 一律 `String()` 包裹再写，且只在值真变时写 |

### 性能（取色卡顿的真因与对策）
- **Alt 菜单模式（最隐蔽的真凶）**：Windows 中「按下并松开 Alt」会激活窗口菜单栏，进入模态 menu loop，节流 UXP 面板 → 取色卡。**对策**：取色期间 addon `breakMenu()` 注入无害保留键（VK_NONAME），打破"Alt 按松之间无其他键"的菜单激活条件。
- **写前景色 `pushColor`（executeAsModal）会阻塞主线程几十 ms** → 节流：取色中不写，结束后空闲时才写一次。
- **渲染节流**：取色高频路径 `renderFast()` 只更新色环/方块/游标/色块；6 条渐变轨道、HSV 数字各自更低频；SV 大方块底色只在 hue 真变时重绘（整块重绘最贵）。
- **psActive（前台进程检测）**单次 ~4ms → addon 内缓存，每 15 次调用才真查一次。
- 这些是逐项实测定位的，**改之前先看真实瓶颈，别凭感觉优化**。

---

## 三、目录结构

```
uxp-hybrid/
├── plugin/                       # UXP 插件本体（= 打包进 .ccx 的内容）
│   ├── manifest.json             # 清单（addon.name 指向当前 SamplerN）
│   ├── index.html / styles.css / main.js
│   ├── assets/                   # hue-ring.png（色环）、checker.png（棋盘）
│   └── win/x64/                  # ColorPaletteSampler9.uxpaddon（原生模块）
├── addon/
│   ├── src/module.cpp            # C++ 源：getLatest() / breakMenu()
│   └── build.bat                 # 编译脚本（cl.exe）
├── probe/                        # 开发探针 / 资源生成（GenRing.cs 生成色环 PNG 等）
├── tools/generate-hue-ring.ps1
└── install-addon.ps1             # 把编译产物复制进 plugin/win/x64
```

## 四、构建 addon

```bat
addon\build.bat
```
产物 `addon\ColorPaletteSampler.uxpaddon` → 复制进 `plugin\win\x64\` 并**改成新名**（见上方"改 addon 要换名"），再同步 manifest 与 main.js 的引用。

需要：VS Build Tools（cl.exe / MSVC）、Windows SDK。`build.bat` 已配 `/utf-8 /MT /std:c++17`，链接 `user32.lib gdi32.lib`。

## 五、打包 .ccx

`.ccx` 本质是 `plugin/` 目录的 zip 改后缀。见同目录 `pack-ccx.ps1`。
