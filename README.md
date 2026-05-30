# 调色盘 Color Palette — Photoshop 插件

仿 PS / Krita 风格的取色面板：**色环 + 方形 SV 取色区 + RGB/HSV 滑块**，并支持**画布实时吸色**（双击 Alt 激活，按住划过画布看一片区域的颜色分布）。

技术方案：**UXP Hybrid**（UXP 前端 + 进程内 C++ `.uxpaddon`）。要求 Photoshop 24.2+，仅 Windows x64。

## 项目位置

全部代码、文档、打包产物都在 **[`uxp-hybrid/`](uxp-hybrid/)**：

| | 路径 |
|---|---|
| 📖 开发 / 使用说明（含 UXP 踩坑、性能要点、构建打包） | [uxp-hybrid/README.md](uxp-hybrid/README.md) |
| 📦 安装包（双击安装） | `uxp-hybrid/dist/ColorPaletteHybrid.ccx` |
| 🔌 插件本体 | `uxp-hybrid/plugin/` |
| ⚙️ 原生模块源码 | `uxp-hybrid/addon/` |

> 早期的 CEP 版本、根目录旧 UXP 原型等已废弃并清理，主线只保留 `uxp-hybrid/`。
