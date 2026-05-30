# 调色盘 Color Palette - CEP 版

这个目录是从原 UXP 插件移植出来的 CEP 面板版本。

## 产物

可拖拽的 CEP 扩展文件夹：

```text
cep/com.ccd.colorpalette.cep/
```

已签名安装包：

```text
cep/color-palette-signed.zxp
```

签名相关文件：

```text
tools/ZXPSignCMD/4.1.3/x64/ZXPSignCmd.exe    Adobe ZXP 签名工具
cep/signing/color-palette-dev.p12             本地开发用自签名证书
cep/color-palette-signed.zxp                  由上面的证书签出的安装包
```

目录里包含：

```text
com.ccd.colorpalette.cep/
├── CSXS/manifest.xml       CEP 扩展清单
├── index.html              面板结构
├── styles.css              面板样式
├── main.js                 取色器、滑块、CEP 通信
├── lib/CSInterface.js      CEP evalScript 最小桥接
└── jsx/colorPalette.jsx    Photoshop ExtendScript 前景色读写
```

## 安装到这台 Photoshop 2026

CEP 面板不会从普通 `Plug-ins` 根目录扫描。建议安装到用户级 CEP 目录：

```text
C:\Users\ccdragon\AppData\Roaming\Adobe\CEP\extensions
```

如果这版 Photoshop 强制要求签名，优先使用已签名包安装脚本：

```text
cep/install-signed-to-appdata.ps1
```

脚本会把 `color-palette-signed.zxp` 解包到用户级 `extensions` 目录。也可以手动把已签名 ZXP 解压到：

```text
C:\Users\ccdragon\AppData\Roaming\Adobe\CEP\extensions\com.ccd.colorpalette.cep
```

然后重启 Photoshop。
打开位置通常是：

```text
窗口 > 扩展（旧版） > 调色盘
```

未签名开发版也可以用脚本安装，右键用 PowerShell 运行：

```text
cep/install-to-photoshop-2026.ps1
```

脚本会复制扩展到用户级 `Adobe\CEP\extensions`，停用 Photoshop 安装目录 `Required\CEP\extensions` 里的同名副本，并给常见 CSXS 版本打开 `PlayerDebugMode`。如果 Photoshop 仍提示“无法加载，因为未经正确签署”，请改用上面的签名版安装脚本。

## 签名是怎么实现的

CEP 的签名不是 Windows 的 `.exe` 代码签名，也不是 UXP 的 `.ccx` 打包签名。这里用的是 Adobe CEP/ZXP 的签名格式：

1. 用 Adobe `ZXPSignCmd.exe` 生成一个本地开发用的 `.p12` 自签名证书。
2. 用这个 `.p12` 把 `com.ccd.colorpalette.cep` 扩展目录签成 `.zxp`。
3. `.zxp` 本质上是一个带签名元数据的压缩包，里面会多出 Adobe 用来校验的 `META-INF` 签名文件。
4. 安装时把这个已签名 `.zxp` 解包到用户级 CEP 扩展目录。

本项目已经生成好了开发证书：

```text
cep/signing/color-palette-dev.p12
```

如果需要从零重新生成证书，可以运行：

```powershell
.\tools\ZXPSignCMD\4.1.3\x64\ZXPSignCmd.exe -selfSignedCert CN Guangdong "CCD Color Palette" "CCD Color Palette Dev" "colorpalette-dev" .\cep\signing\color-palette-dev.p12 -locality Dev -orgUnit Guangzhou -email dev@example.local -validityDays 3650
```

当前签名包的生成命令是：

```powershell
.\tools\ZXPSignCMD\4.1.3\x64\ZXPSignCmd.exe -sign .\cep\com.ccd.colorpalette.cep .\cep\color-palette-signed.zxp .\cep\signing\color-palette-dev.p12 "colorpalette-dev"
```

签完后用下面的命令验证：

```powershell
.\tools\ZXPSignCMD\4.1.3\x64\ZXPSignCmd.exe -verify .\cep\color-palette-signed.zxp -certInfo -skipOnlineRevocationChecks
```

验证通过后，安装脚本会把签名包解压到：

```text
C:\Users\ccdragon\AppData\Roaming\Adobe\CEP\extensions\com.ccd.colorpalette.cep
```

也就是 Photoshop 实际扫描的用户级 CEP 扩展目录。现在不建议把这份面板放回：

```text
C:\Users\ccdragon\sys_tools\PS\Adobe Photoshop 2026\Required\CEP\extensions
```

`Required\CEP\extensions` 更适合 Photoshop 自带扩展。第三方 CEP 面板放在那里更容易遇到权限、缓存、签名校验和版本覆盖问题。当前方案是：源码保留在项目目录，签名包保留在 `cep/color-palette-signed.zxp`，实际运行副本放在 Roaming。

每次改完 CEP 代码后，需要重新签名并重新安装：

```powershell
.\tools\ZXPSignCMD\4.1.3\x64\ZXPSignCmd.exe -sign .\cep\com.ccd.colorpalette.cep .\cep\color-palette-signed.zxp .\cep\signing\color-palette-dev.p12 "colorpalette-dev"
.\tools\ZXPSignCMD\4.1.3\x64\ZXPSignCmd.exe -verify .\cep\color-palette-signed.zxp -certInfo -skipOnlineRevocationChecks
.\cep\install-signed-to-appdata.ps1
```

如果 Photoshop 仍旧加载旧界面，关掉 Photoshop 后清掉对应 CEP 缓存再打开：

```text
%TEMP%\cep_cache\PHXS_27.7.0_com.ccd.colorpalette.cep.panel
```

## 兼容说明

- 前端保留 UXP 版的色环、方形 HSV 取色器、RGB/HSV 滑块和色块操作。
- UXP 的 `require("photoshop")` / `batchPlay` 已替换为 CEP 的 `CSInterface.evalScript()`。
- Photoshop 侧由 `jsx/colorPalette.jsx` 使用 ExtendScript 的 `app.foregroundColor` 读取和写入前景色。
- 在浏览器里直接打开 `index.html` 可以预览界面；没有 CEP 桥接时只跳过写入 Photoshop 的动作。
