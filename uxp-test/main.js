/* UXP 测试插件 —— 验证 .ccx 能安装、面板能加载、UXP 能与 PS 通信 */
let PS = null;
try { PS = require("photoshop"); } catch (e) { PS = null; }

const statusEl = document.getElementById("status");
const swatchEl = document.getElementById("swatch");

function setStatus(msg) { statusEl.textContent = msg; }

setStatus(PS ? "UXP + Photoshop 已就绪 ✓（版本 1.0.0）" : "面板已加载，但未检测到 Photoshop 桥接");

document.getElementById("btnRead").addEventListener("click", async () => {
  if (!PS) { setStatus("无 PS 桥接（不在 Photoshop 内？）"); return; }
  try {
    const fg = PS.app.foregroundColor;
    const r = Math.round(fg.rgb.red);
    const g = Math.round(fg.rgb.green);
    const b = Math.round(fg.rgb.blue);
    setStatus(`前景色 = ${r}, ${g}, ${b} ✓`);
    swatchEl.style.background = `rgb(${r},${g},${b})`;
  } catch (e) {
    setStatus("读取失败: " + e);
  }
});

document.getElementById("btnRed").addEventListener("click", async () => {
  if (!PS) { setStatus("无 PS 桥接（不在 Photoshop 内？）"); return; }
  try {
    await PS.core.executeAsModal(async () => {
      await PS.action.batchPlay([{
        _obj: "set",
        _target: [{ _ref: "color", _property: "foregroundColor" }],
        to: { _obj: "RGBColor", red: 255, grain: 0, blue: 0 },
        source: "photoshopPicker",
        _options: { dialogOptions: "dontDisplay" }
      }], {});
    }, { commandName: "设前景色为红" });
    setStatus("已设前景色 = 红 (255,0,0) ✓");
    swatchEl.style.background = "rgb(255,0,0)";
  } catch (e) {
    setStatus("设置失败: " + e);
  }
});
