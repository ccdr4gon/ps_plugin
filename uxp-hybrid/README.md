# 调色盘 Hybrid — Photoshop UXP 插件

一个深色质感的 Photoshop 调色盘面板：**色环 + 方形 SV 取色区 + RGB/HSV 滑块**，并通过进程内 C++ addon 实现**画布实时吸色**（三击 Alt 激活，按住划过画布即可连续看一片区域的颜色分布）。

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
**三击 Alt（快速连点三下）→ 第三下按住 → 在画布上划过** = 连续实时显示光标处颜色（合并色）。松开 Alt 退出，并把最后取到的颜色写入前景色。

- 单/双击 Alt（<3 击）只读取 PS 前景色；**三击**才激活屏幕取色。
- 为什么要"三击"激活：防止单击 / 双击 Alt、Alt+Tab 等误触。
- 触发期间：PS 不在最前、按了左键/Ctrl/Shift/Tab/Esc 都会暂停吸色。

### 🎨 OKLCH 取色（原型，独立并存）
`prototype/plugin/` 是一个**独立 id**（`com.ccd.colorpalette.oklch`，标签「调色盘 OKLCH 原型」）的并存版本，在色环视图之外新增 **OKLCH** 标签页，便于与正式版对比。OKLCH 是感知均匀色彩空间，改 L/C/H 时色相/明度更稳定，适合配色。

- 顶部两个标签页：**RGB**（色环+方形+RGB/HSV 滑块）/ **OKLCH**。
- 三张卡片 **Lightness / Chroma / Hue**：各含数字框、**2D 色域切片图**、渐变滑块（菱形游标）。
- 切片图轴向：L 卡 x=L·y=C（固定 H）；C 卡 x=H·y=C（固定 L）；H 卡 x=H·y=L（固定 C）。点/拖图或滑块即改色，十字+圆点标当前色。
- **色域锁（默认开启，右上角「锁」）**：开启时拖图/滑块的点会**贴着色域边界曲线滑、选不出界**（图按"该列最近在域边界"钳、滑块停在当前在域弧）；关闭则可选超 sRGB（输出到前景色时降彩度到边界）。sRGB / P3 可切。
- RGB 仍是唯一真源，OKLCH 像 HSV 一样作为派生视图；色环取色 / PS 吸管都会实时同步到 OKLCH。

> 切片图/滑块/色环的逐像素渲染都走 **UXP Imaging API**（见下方限制表）——这是 UXP 里把"JS 生成的任意像素"画进面板的官方正路。性能要点：色域图始终高清 640×240（下采样抗锯齿）、拖动 70ms 节流；**游标用 `transform` 走 GPU 合成层**（不重栅格化大图，根治拖动抖动/卡顿）。

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
| 色环渐变 | `conic-gradient` 不支持；`canvas` 能渲染但**闪烁卡顿** | 正式版用**高清 PNG 降采样**；OKLCH 原型改为 **JS 逐像素 + Imaging API 程序化生成**（无 PNG 资源，几何与游标精确对齐）。PNG 留作兜底 |
| 拖动时游标牵连大图重栅格化（抖动/卡顿） | 游标用 `left/top`(布局属性)移动 → 每帧重绘整块、重栅格化色环/色域图 | 游标改 **`transform: translate` + `will-change`（独立 GPU 合成层）** → 移动游标=纯 GPU 重合成，不重绘大图 |
| 滑块三角游标 | CSS `border` 拼三角不渲染 | 用 ▲ 字形（`&#9650;`） |
| 步进器 −/+ 按钮 | 原生 `<button>` 带默认圆形焦点环、裁切内容 | 改用 `<div>` 做按钮 |
| 透明棋盘格 | 多层 `linear-gradient` 棋盘错乱 | 平铺 PNG（`assets/checker.png`） |
| 数字输入框 | `<input>` 不认 `var()`/`transparent` 背景，会露黑底 | 用字面色值，边框/背景做在 input 自身 |
| 数字显示 | `el.textContent = 0`（数字 0，falsy）会"0/空"闪 | 一律 `String()` 包裹再写，且只在值真变时写 |
| 2D 色域图（OKLCH 切片） | 无 WebGL；`canvas` 2D 实时重绘闪烁；`createLinearGradient/clearRect` 在 Win 坏 | **JS 逐像素算 RGBA → `imaging.createImageDataFromBuffer` → `new ImageBlob(buf,imageData)` + `URL.createObjectURL` → `<img src>`**（无损静态图，无闪烁）；base64-jpeg 走 `imaging.encodeImageData` 兜底。只在依赖分量变化时重画；逐像素渲染用「每列预算 cos/sin + OKLab→sRGB 查表」优化（~8× 提速），全程高分辨率下采样＝抗锯齿。`require("photoshop").imaging` |

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
├── plugin/                       # UXP 插件本体（正式版 = 打包进 .ccx 的内容）
│   ├── manifest.json             # 清单（addon.name 指向当前 SamplerN）
│   ├── index.html / styles.css / main.js
│   ├── assets/                   # hue-ring.png（色环）、checker.png（棋盘）
│   └── win/x64/                  # ColorPaletteSampler9.uxpaddon（原生模块）
├── prototype/plugin/             # OKLCH 原型（独立 id，可与正式版并存对比；复用同一 addon）
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

`.ccx` 本质是 `plugin/` 目录的 zip 改后缀。
- 正式版：`pack-ccx.ps1` → `dist/ColorPaletteHybrid.ccx`。
- OKLCH 原型：`pack-ccx-oklch.ps1` → `dist/ColorPaletteHybrid-OKLCH.ccx`（打包 `prototype/plugin/`，独立 id，可与正式版同时安装对比）。
