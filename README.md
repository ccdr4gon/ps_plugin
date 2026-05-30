# 调色盘 Color Palette — Photoshop 插件

一个仿 PS / Krita 风格的取色面板，包含：

- **方形取色器**（饱和度 S × 明度 V）
- **色环**（色相 H）
- **RGB 滑块**（带实时渐变）
- **HSV(HSB) 滑块**（带实时渐变）
- 前景/背景色块、当前色 / 白 / 透明 色板
- 拾取的颜色会**实时写入 Photoshop 前景色**

四组控件完全联动，修改任意一个，其余全部同步更新。

![panel](preview.png)

---

## CEP 版本（本次移植）

CEP 版已经放在：

```text
cep/com.ccd.colorpalette.cep/
```

建议安装到用户级 CEP 扫描目录：

```text
C:\Users\ccdragon\AppData\Roaming\Adobe\CEP\extensions
```

把 `com.ccd.colorpalette.cep` 整个文件夹拖进上面的 `extensions` 目录，重启 Photoshop 后在
`窗口 > 扩展（旧版） > 调色盘` 打开。普通 `Plug-ins` 根目录只扫描原生/Generator 插件，不会直接加载 CEP 面板。

也可以运行：

```text
cep/install-to-photoshop-2026.ps1
```

它会复制 CEP 扩展到正确目录，并开启常见 CSXS 版本的 `PlayerDebugMode` 以加载未签名扩展。

---

## 目录结构

```
ps_plugin/
├── manifest.json      插件清单
├── index.html         面板结构
├── styles.css         深色主题样式
├── main.js            取色逻辑（颜色转换 / Canvas / 滑块 / PS 同步）
├── cep/               CEP 版扩展包与安装脚本
└── .claude/           仅用于浏览器预览，打包时无需包含
```

---

## 在 Photoshop 中加载（开发模式）

需要 **Photoshop 2022 (23.0)** 或更新版本。

1. 安装 Adobe 的 **UXP Developer Tool (UDT)**
   （Creative Cloud 桌面端 → 「更多操作」→「管理插件」里可下载，或从 Adobe 开发者站点获取）。
2. 打开 Photoshop。
3. 打开 UXP Developer Tool → **Add Plugin** → 选择本目录下的 `manifest.json`。
4. 在列表里点该插件的 **Load**（或 Actions → Load）。
5. Photoshop 中即出现「调色盘」面板（也可在 `增效工具 / Plugins` 菜单里找到）。

> 修改代码后，在 UDT 里点 **Reload** 即可热更新，无需重启 PS。

### 打包成 .ccx 安装包（可选）

在 UDT 里对该插件选择 **Package**，生成 `.ccx` 文件，双击即可通过
Creative Cloud 正式安装（无需开发者模式）。打包时不需要 `.claude/` 文件夹。

---

## 在浏览器中预览（无需 Photoshop）

`main.js` 对 `require("photoshop")` 做了降级处理，因此可直接在浏览器里预览 UI 与取色逻辑
（仅「写入前景色」功能会跳过）：

```bash
node .claude/preview-server.js
# 浏览器打开 http://localhost:5599
```

---

## 使用说明

- **色环**：点击 / 拖动外圈改变色相 H。
- **方形**：点击 / 拖动改变饱和度 S（左右）与明度 V（上下）。
- **滑块**：拖动轨道、点击轨道、编辑数字框、或点上下微调按钮。
- **▶ 按钮 / 前景色块 / 当前色块**：再次把当前颜色应用到前景色。
- **白色块**：快速设为白色。

颜色在松开鼠标 / 提交数字时写入 PS 前景色。

---

## 自定义

- **色环方向**：`main.js` 中 `buildRing()` 用 `i - 90` 把红色(H0)放在正上方、顺时针递增。
  想换方向只需同步修改 `buildRing()`、`handleRing()`、`drawMarkers()` 里的 `±90` 偏移即可。
- **尺寸**：`main.js` 顶部的 `SIZE / rOuter / rInner / sqSize` 控制色环与方形大小。
- **主题颜色**：见 `styles.css`。
