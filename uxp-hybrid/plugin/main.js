/* =========================================================
 *  调色盘 Hybrid - UXP 主逻辑
 *  色环 + 方形 + RGB/HSV 滑块  +  C++ addon 屏幕实时取色
 * ========================================================= */

let PS = null;
try { PS = require("photoshop"); } catch (e) { PS = null; }

/* C++ addon：屏幕实时采样器（require 一个 uxpaddon 返回 Promise，必须 await——见 startSampler） */
let sampler = null;

/* ---------------- 颜色转换 ---------------- */
function hsvToRgb(h, s, v) {
  s /= 100; v /= 100;
  const c = v * s;
  const hp = (h % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp >= 0 && hp < 1) { r = c; g = x; }
  else if (hp < 2) { r = x; g = c; }
  else if (hp < 3) { g = c; b = x; }
  else if (hp < 4) { g = x; b = c; }
  else if (hp < 5) { r = x; b = c; }
  else { r = c; b = x; }
  const m = v - c;
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h: Math.round(h), s: Math.round(s * 100), v: Math.round(max * 100) };
}
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const rgbStr = (r, g, b) => `rgb(${r},${g},${b})`;

/* ---------------- 状态 ---------------- */
const state = { h: 65, s: 50, v: 51, r: 0, g: 0, b: 0 };
function syncRgbFromHsv() { const c = hsvToRgb(state.h, state.s, state.v); state.r = c.r; state.g = c.g; state.b = c.b; }
function syncHsvFromRgb() {
  const c = rgbToHsv(state.r, state.g, state.b);
  if (c.s === 0) c.h = state.h;
  if (c.v === 0) { c.h = state.h; c.s = state.s; }
  state.h = c.h; state.s = c.s; state.v = c.v;
}

const CHANNELS = {
  r: { type: "rgb", min: 0, max: 255, label: "R", unit: "" },
  g: { type: "rgb", min: 0, max: 255, label: "G", unit: "" },
  b: { type: "rgb", min: 0, max: 255, label: "B", unit: "" },
  h: { type: "hsv", min: 0, max: 360, label: "H", unit: "" },
  s: { type: "hsv", min: 0, max: 100, label: "S", unit: "%" },
  v: { type: "hsv", min: 0, max: 100, label: "V", unit: "%" }
};
function setChannel(ch, val) {
  const m = CHANNELS[ch];
  val = clamp(Math.round(val), m.min, m.max);
  if (state[ch] === val) return;   // 同值短路：避免无谓的 sync + 全量 render
  if (m.type === "rgb") { state[ch] = val; syncHsvFromRgb(); } else { state[ch] = val; syncRgbFromHsv(); }
  render();
}
function updateHsv(partial) { Object.assign(state, partial); syncRgbFromHsv(); render(); }

/* ---------------- 色环 + 方形（UXP DOM，尺寸随面板自适应） ---------------- */
const picker = document.getElementById("wheel");
const hueRing = document.getElementById("hueRing");   // PNG 色环图（CSS 铺满 #wheel）
const svSquare = document.getElementById("svSquare");
const hueMarker = document.getElementById("hueMarker");
const svMarker = document.getElementById("svMarker");

// 几何比例（相对色环直径 S）：环带 外径0.475 内径0.44；方形 0.62 使四角刚好贴住环内圈(~1px)
const FR = { rOuter: 0.475, rInner: 0.44, sqSize: 0.62 };
// G = 当前实际几何（像素），由 computeGeom() 按色环实际渲染尺寸算出
const G = { S: 220, cx: 110, cy: 110, rOuter: 104, rInner: 97, rMid: 100, sqSize: 120, sqLeft: 50, sqTop: 50 };

function computeGeom() {
  // 用「面板视口宽」(documentElement.clientWidth) × 0.92 算整数边长，固定 #wheel 为整数尺寸。
  // 关键：视口宽不随 .app 滚动条出现/消失而变 → 色环尺寸恒定，点 +/- 等不改变面板宽的操作不会重算 → 不震动。
  const pw = document.documentElement.clientWidth || (picker.parentElement || picker).getBoundingClientRect().width;
  let S = Math.round(pw * 0.92);
  if (!S || S < 80) S = 220;
  picker.style.width = S + "px";
  picker.style.height = S + "px";                            // 保持正方形
  G.S = S; G.cx = S / 2; G.cy = S / 2;
  G.rOuter = S * FR.rOuter; G.rInner = S * FR.rInner; G.rMid = (G.rInner + G.rOuter) / 2;
  G.sqSize = S * FR.sqSize; G.sqLeft = (S - G.sqSize) / 2; G.sqTop = G.sqLeft;

  svSquare.style.left = G.sqLeft + "px";
  svSquare.style.top = G.sqTop + "px";
  svSquare.style.width = G.sqSize + "px";
  svSquare.style.height = G.sqSize + "px";
}

// 色环改用 PNG（assets/hue-ring.png）：canvas 在 UXP 会闪烁卡顿，PNG 静态图最稳

// 全局缩放：按面板实际宽度设置根字号(rem 基准)，整套 UI 用 rem 等比缩放
// 不写死 px → 浏览器/UXP 各自按实测宽度自适应
let curScale = 1;
const appEl = document.getElementById("app");
function applyScale() {
  const w = appEl.getBoundingClientRect().width;
  if (!w) return;
  const s = clamp(w / 300, 0.85, 1.7);
  if (Math.abs(s - curScale) < 0.01) return;
  curScale = s;
  document.documentElement.style.fontSize = (16 * s).toFixed(2) + "px";
}

let lastHue = -1;   // 缓存：SV 方块底色只在 hue 真变时重绘（大方块整体重绘最贵）
function renderPicker() {
  if (state.h !== lastHue) {                 // 仅「方块底色」用 hue 缓存（重绘贵）；游标位置不能进这个分支
    lastHue = state.h;
    const pure = hsvToRgb(state.h, 100, 100);
    svSquare.style.backgroundColor = rgbStr(pure.r, pure.g, pure.b);
  }
  // 色环游标位置：依赖几何 G + hue，必须每次按当前 G 算（几何变了 hue 没变时也要重定位，否则首帧错位卡死）
  const a = (state.h - 90) * Math.PI / 180;
  const hml = (G.cx + G.rMid * Math.cos(a)) + "px";
  const hmt = (G.cy + G.rMid * Math.sin(a)) + "px";
  if (hueMarker._l !== hml) { hueMarker.style.left = hml; hueMarker._l = hml; }   // 没变不写，省开销
  if (hueMarker._t !== hmt) { hueMarker.style.top = hmt; hueMarker._t = hmt; }
  // 方块游标位置：同理依赖几何
  const svl = (G.sqLeft + state.s / 100 * G.sqSize) + "px";
  const svt = (G.sqTop + (1 - state.v / 100) * G.sqSize) + "px";
  if (svMarker._l !== svl) { svMarker.style.left = svl; svMarker._l = svl; }
  if (svMarker._t !== svt) { svMarker.style.top = svt; svMarker._t = svt; }
}

function getPos(e) { const r = picker.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
function handleRing(x, y) { const ang = Math.atan2(y - G.cy, x - G.cx) * 180 / Math.PI; updateHsv({ h: Math.round((ang + 90 + 360) % 360) }); }
function handleSquare(x, y) {
  const s = clamp((x - G.sqLeft) / G.sqSize * 100, 0, 100), v = clamp((1 - (y - G.sqTop) / G.sqSize) * 100, 0, 100);
  updateHsv({ s: Math.round(s), v: Math.round(v) });
}

/* ---------------- 滑块 ---------------- */
const els = {};
function buildRows(containerId, channels) {
  const box = document.getElementById(containerId);
  channels.forEach(ch => {
    const m = CHANNELS[ch];
    const row = document.createElement("div");
    row.className = "slider-row";
    row.innerHTML =
      `<span class="slider-label">${m.label}</span>` +
      `<div class="slider-track"><div class="slider-thumb">&#9650;</div></div>` +
      `<div class="value-box">` +
        `<div class="num-field"><input class="slider-input" type="text" inputmode="numeric" /></div>` +
        `<span class="unit">${m.unit || ""}</span>` +   // 单位移到数字框外，避免 % 抢走输入框宽度导致 "50"→".."
        `<div class="stepper">` +
          `<div class="step step-down" title="-1">&#8722;</div>` +
          `<div class="step step-up" title="+1">+</div>` +
        `</div>` +
      `</div>`;
    box.appendChild(row);
    const track = row.querySelector(".slider-track"), thumb = row.querySelector(".slider-thumb"), input = row.querySelector(".slider-input");
    els[ch] = { track, thumb, input };
    track.addEventListener("pointerdown", e => { drag = { kind: "slider", channel: ch }; sliderFromX(ch, e.clientX); });
    input.addEventListener("input", () => { const v = parseInt(input.value, 10); if (!isNaN(v) && v !== state[ch]) setChannel(ch, v); });   // 只有值真变了才处理：挡掉「程序回填 value → 触发 input 事件 → 死循环」
    input.addEventListener("change", () => { const v = parseInt(input.value, 10); setChannel(ch, isNaN(v) ? m.min : v); input.value = state[ch]; pushColor(); });
    row.querySelector(".step-up").addEventListener("click", () => { setChannel(ch, state[ch] + 1); pushColor(); });
    row.querySelector(".step-down").addEventListener("click", () => { setChannel(ch, state[ch] - 1); pushColor(); });
  });
}
function sliderFromX(ch, clientX) {
  const m = CHANNELS[ch], r = els[ch].track.getBoundingClientRect();
  const t = clamp((clientX - r.left) / r.width, 0, 1);
  setChannel(ch, m.min + t * (m.max - m.min));
}
let _trackKey = "";
function updateSliderTracks() {   // 6 条渐变轨道（重：6 个 linear-gradient + hsvToRgb 计算）
  const { r, g, b, h, s, v } = state;
  const key = r+","+g+","+b+","+h+","+s+","+v;
  if (key === _trackKey) return;   // RGB/HSV 全没变 → 整段跳过（最贵的渲染，强力防护）
  _trackKey = key;
  els.r.track.style.background = `linear-gradient(to right, ${rgbStr(0, g, b)}, ${rgbStr(255, g, b)})`;
  els.g.track.style.background = `linear-gradient(to right, ${rgbStr(r, 0, b)}, ${rgbStr(r, 255, b)})`;
  els.b.track.style.background = `linear-gradient(to right, ${rgbStr(r, g, 0)}, ${rgbStr(r, g, 255)})`;
  els.h.track.style.background = "linear-gradient(to right,#f00 0%,#ff0 16.66%,#0f0 33.33%,#0ff 50%,#00f 66.66%,#f0f 83.33%,#f00 100%)";
  const s0 = hsvToRgb(h, 0, v), s1 = hsvToRgb(h, 100, v), v1 = hsvToRgb(h, s, 100);
  els.s.track.style.background = `linear-gradient(to right, ${rgbStr(s0.r, s0.g, s0.b)}, ${rgbStr(s1.r, s1.g, s1.b)})`;
  els.v.track.style.background = `linear-gradient(to right, #000, ${rgbStr(v1.r, v1.g, v1.b)})`;
}
function updateSliderThumbs() {   // 游标位置 + 数值（轻：每帧可调）
  for (const ch in els) {
    const m = CHANNELS[ch];
    const lp = ((state[ch] - m.min) / (m.max - m.min) * 100) + "%";
    const E = els[ch];
    if (E.thumb._l !== lp) { E.thumb.style.left = lp; E.thumb._l = lp; }   // 没变不写
    if (document.activeElement !== E.input) {
      const nv = String(Number.isFinite(state[ch]) ? state[ch] : 0);
      if (E.input.value !== nv) E.input.value = nv;   // 仅文本真变化才写：UXP 文本控件频繁写(尤其写 0)会反复刷新→闪
    }
  }
}
function updateSliders() { updateSliderTracks(); updateSliderThumbs(); }

let swEls = null;
function ensureSwEls() {
  if (swEls) return;   // 首次建好 readout 结构并缓存引用，之后只改 textContent（不再重建 DOM）
  const ro = document.getElementById("readout");
  ro.innerHTML = '<span class="rk">H</span><span class="rv"></span><span class="rk">S</span><span class="rv"></span><span class="rk">V</span><span class="rv"></span>';
  const rv = ro.querySelectorAll(".rv");
  swEls = { fg: document.getElementById("swFg"), hex: document.getElementById("hexout"), h: rv[0], s: rv[1], v: rv[2] };
}
function updateSwatchColors() {   // 前景色块（轻，跟手）
  ensureSwEls();
  const col = rgbStr(state.r, state.g, state.b);
  if (swEls._fg !== col) { swEls.fg.style.background = col; swEls._fg = col; }   // 没变不写
}
function updateReadout() {        // HSV 数字 + HEX（UXP 下频繁改文本会闪 → 取色时单独低频）
  ensureSwEls();
  // 关键：转成字符串再写——textContent = number 0(falsy) 在 UXP 文本控件上会"0/空"闪；且只在真变化时写，减少刷新
  const sh = String(state.h), ss = String(state.s), sv = String(state.v);
  if (swEls.h.textContent !== sh) swEls.h.textContent = sh;
  if (swEls.s.textContent !== ss) swEls.s.textContent = ss;
  if (swEls.v.textContent !== sv) swEls.v.textContent = sv;
  const hex = "#" + [state.r, state.g, state.b].map(n => n.toString(16).padStart(2, "0").toUpperCase()).join("");
  if (swEls.hex.textContent !== hex) swEls.hex.textContent = hex;
}
function updateSwatches() { updateSwatchColors(); updateReadout(); }
function render() { renderPicker(); updateSliders(); updateSwatches(); }
// 取色高频：跳过 6 条渐变轨道 + HSV 数字，只更新色环/方块/游标/色块（数字另行低频）
function renderFast() { renderPicker(); updateSliderThumbs(); updateSwatchColors(); }

/* ---------------- 面板内拖拽（编辑色环/方形/滑块） ---------------- */
let drag = null;
picker.addEventListener("pointerdown", e => {
  const p = getPos(e);
  const inSquare = p.x >= G.sqLeft && p.x <= G.sqLeft + G.sqSize && p.y >= G.sqTop && p.y <= G.sqTop + G.sqSize;
  if (inSquare) { drag = { kind: "square" }; handleSquare(p.x, p.y); }
  else { drag = { kind: "ring" }; handleRing(p.x, p.y); }   // 方形外（含细环带）都按色相处理
});
window.addEventListener("pointermove", e => {
  if (!drag) return;
  if (drag.kind === "ring") { const p = getPos(e); handleRing(p.x, p.y); }
  else if (drag.kind === "square") { const p = getPos(e); handleSquare(p.x, p.y); }
  else if (drag.kind === "slider") { sliderFromX(drag.channel, e.clientX); }
});
window.addEventListener("pointerup", () => { if (drag) { drag = null; pushColor(); } });

/* ---------------- 写 / 读 PS 前景色 ---------------- */
let applying = false, pending = false;
async function pushColor() {
  if (!PS) return;
  if (applying) { pending = true; return; }
  applying = true;
  try {
    await PS.core.executeAsModal(async () => {
      await PS.action.batchPlay([{
        _obj: "set",
        _target: [{ _ref: "color", _property: "foregroundColor" }],
        to: { _obj: "RGBColor", red: state.r, grain: state.g, blue: state.b },
        source: "photoshopPicker", _options: { dialogOptions: "dontDisplay" }
      }], {});
    }, { commandName: "设置前景色" });
  } catch (e) { /* ignore */ }
  applying = false;
  if (pending) { pending = false; pushColor(); }
}
function readForegroundFromPS() {
  if (!PS) return false;
  try {
    const fg = PS.app.foregroundColor;
    state.r = Math.round(fg.rgb.red); state.g = Math.round(fg.rgb.green); state.b = Math.round(fg.rgb.blue);
    syncHsvFromRgb(); return true;
  } catch (e) { return false; }
}

/* PS 前景色变化（含用 PS 吸管取色）→ 同步到面板。
   取色中 / 面板内拖动 / 正在写 / 正在编辑数字时不打断。 */
let lastFgKey = "";
function pollForeground() {
  if (!PS || drag || applying) return;
  const ae = document.activeElement;
  if (ae && ae.classList && ae.classList.contains("slider-input")) return;
  try {
    const fg = PS.app.foregroundColor.rgb;
    const r = Math.round(fg.red), g = Math.round(fg.green), b = Math.round(fg.blue);
    const key = r + "," + g + "," + b;
    if (key === lastFgKey) return;
    lastFgKey = key;
    if (r !== state.r || g !== state.g || b !== state.b) {
      state.r = r; state.g = g; state.b = b; syncHsvFromRgb(); render();
    }
  } catch (e) { /* ignore */ }
}

/* 前景色变化「事件监听」——主路径，替代每帧轮询读 PS：
   注册一次 action.addNotificationListener(["set"])，PS 前景色被原生吸管 / 拾色器 / 脚本设置时触发。
   - 过滤自己 pushColor 的回声(source==="photoshopPicker")，并复用 lastFgKey 去重(set 事件常 2~4 次连发)。
   - Color 面板滑块拖动是事件盲区 → 保留 pollForeground 作低频(~1.5s)兜底。
   守卫与 pollForeground 一致(drag/applying/正在输入数字)，读前景色无需 executeAsModal。 */
let _fgListener = null;
function onFgSetEvent(eventName, descriptor) {
  if (!PS || drag || applying) return;
  if (descriptor && descriptor.source === "photoshopPicker") return;   // 自己写的回声，忽略
  const ae = document.activeElement;
  if (ae && ae.classList && ae.classList.contains("slider-input")) return;   // 用户正在输入数字
  try {
    const fg = PS.app.foregroundColor.rgb;
    const r = Math.round(fg.red), g = Math.round(fg.green), b = Math.round(fg.blue);
    const key = r + "," + g + "," + b;
    if (key === lastFgKey) return;                                     // 去重（set 多次连发 + 自回声）
    lastFgKey = key;
    if (r !== state.r || g !== state.g || b !== state.b) {
      state.r = r; state.g = g; state.b = b; syncHsvFromRgb(); render();
    }
  } catch (e) { /* ignore */ }
}
async function initFgListener() {
  if (!PS || _fgListener) return;
  _fgListener = onFgSetEvent;                                          // 存同一引用以便 remove
  try { await PS.action.addNotificationListener(["set"], _fgListener); }
  catch (e) { _fgListener = null; }                                   // 注册失败 → 仅靠 pollForeground 兜底
}

/* ---------------- 色板按钮 ---------------- */
function wireSwatches() {
  document.getElementById("applyBtn").addEventListener("click", pushColor);
  document.getElementById("swFg").addEventListener("click", pushColor);
  const setWhite = () => { state.r = state.g = state.b = 255; syncHsvFromRgb(); render(); pushColor(); };
  document.getElementById("swBg").addEventListener("click", setWhite);
}

/* =========================================================
 *  C++ addon 屏幕实时取色  +  状态显示
 * ========================================================= */
let statusEl = document.getElementById("samplerLight");
function setStatus(t, stateName) {
  if (!statusEl) return;
  statusEl.title = t;
  statusEl.className = "sampler-light " + (stateName || "ready");
}

let picking = false;        // 正处于画布取色中
let pickFalse = 0;          // pickActive 连续为 false 的帧数（去抖：防 psActive 偶发误判触发"假结束"狂调 render）
let armed = false;          // 是否已通过「三击 Alt」激活吸色（防单击/双击 Alt、Alt+Tab 误触）
let prevAlt = false;        // 上一帧 Alt 状态（检测按下上升沿）
let lastAltDownFrame = -999;// 上次 Alt 按下瞬间的帧号
let altFalse = 0;           // Alt 连续松开的帧数（去抖：防 GetAsyncKeyState 抖动一帧导致 armed 误清零）
const TAP_FRAMES = 11;      // 连击窗口（~176ms @16ms/帧）：相邻两次 Alt 按下间隔 ≤ 此值算连击；也决定单/双击后读前景色的延迟
let tapCount = 0;           // 当前连击链里的 Alt 上升沿数（满 3 → 激活屏幕取色）
let pendingRead = false;    // 已积累 1~2 击、待窗口过期确认 → 读 PS 前景色（<3 击都读前景色）
let frame = 0;
let needPush = false, lastPushFrame = -99;   // 待写前景色 + 上次写的帧（节流写 PS，防频繁 executeAsModal 阻塞）
let lastX = -1, lastY = -1;   // 上一帧光标位置（判断鼠标是否在移动）
let lastRenderFrame = -99;    // 上次取色渲染的帧（节流到 ~30fps 用）
let lastReadoutFrame = -99;   // 上次 HSV 数字更新的帧（更低频，防数字闪烁）
let lastPollFrame = -99;      // 上次低频兜底镜像前景色的帧（事件监听为主，此为 Color 面板滑块盲区兜底）
let _lastGeomW = -1;          // 上次几何轮询测得的色环目标宽（防抖：连续两帧一致才重算，挡瞬时重排/滚动条闪烁）

/* 每帧从 addon 读「光标处屏幕像素 + 按键状态」。
   交互：单/双击 Alt（<3 击）读 PS 前景色；三击 Alt 激活，第三下按住划过画布 = 连续实时取色；松开 Alt 退出。
   （三击激活防单击/双击/Alt+Tab 误触；addon breakMenu 防 Alt 菜单模式卡顿。） */
function sampleLoop() {
  if (applying) return;
  let s;
  try { s = sampler.getLatest(); } catch (e) { return; }
  if (!s) return;
  try {
    const a = String(s).split(",");        // x,y,r,g,b,down,alt,shift,esc,ctrl,tab,psActive,valid
    const x = +a[0], y = +a[1];
    const r = +a[2], g = +a[3], b = +a[4];
    // addon 偶发返回截断/坏数据 → 直接跳过，绝不让 NaN 进 state（会触发数字框校验提示音 + 闪烁）
    if (a.length < 12 || Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return;
    const down = a[5] === "1", alt = a[6] === "1", shift = a[7] === "1", esc = a[8] === "1";
    const ctrl = a[9] === "1", tab = a[10] === "1", psActive = a[11] === "1";
    // valid=0：越界/无效像素（多屏负坐标或 GetPixel 失败）。仅作用于屏幕取色的颜色更新（见下方 pickActive），
    // 不在此 return —— Alt 手势检测用按键状态(始终有效)，绝不能被无效像素跳过。字段缺失默认 true（兼容旧 addon）。
    const valid = a.length >= 13 ? a[12] === "1" : true;
    const moved = (x !== lastX || y !== lastY);
    lastX = x; lastY = y;

    // —— Alt 手势：<3 击读前景色；三击激活屏幕取色（防单击/双击/Alt+Tab 误触）——
    // (a) 上升沿计数：窗口内续链，满 3 击 → 激活取色态；未满则暂存待读前景色。
    //     armed 后忽略后续上升沿（连按抖动不再反复触发判定 → 不卡）。
    if (alt && !prevAlt) {                        // Alt 按下上升沿
      tapCount = (frame - lastAltDownFrame <= TAP_FRAMES) ? tapCount + 1 : 1;   // 在窗口内续链，否则开新链
      lastAltDownFrame = frame;
      if (tapCount >= 3 && !armed) { armed = true; tapCount = 0; pendingRead = false; }   // 满 3 击 → 屏幕取色（不读前景色）
      else pendingRead = true;                   // 1~2 击 → 暂存，待窗口过期读前景色
    }
    // (b) 窗口过期 → 读前景色：1 或 2 击、Alt 已松开、超过连击窗口 → 同步 PS 前景色一次。
    //     不依赖去抖复位，对采样节流(空闲每4帧)鲁棒；<3 击都走这里（镜像原生吸管的结果，不读屏）。
    if (pendingRead && !armed && !alt && tapCount >= 1 && tapCount < 3 && (frame - lastAltDownFrame > TAP_FRAMES)) {
      pendingRead = false; tapCount = 0;
      if (readForegroundFromPS()) render();
    }
    // (c) armed 只在 Alt「彻底松开」后解除（连续 ~10 次采样没按 Alt）；去抖避免瞬时抖动误清零。
    //     不在此清 tapCount（由 (a)/(b) 复位）——否则去抖会早于 (b) 清零导致前景色读不触发。
    if (alt) altFalse = 0;
    else if (++altFalse >= 10) { armed = false; lastAltDownFrame = -999; }
    prevAlt = alt;

    // —— 打破 Alt 菜单模式：手势全程（第 1 次 Alt 起）只要 Alt 按着、没点左键、PS 在前台，就每帧注入无害键 ——
    // 关键修复：以前只在 armed(三击完成)后才注入 → 等待第 2/3 次 Alt 的整段，每次松 Alt 都激活 Windows 菜单模式、
    //   节流面板 → 第一次取色卡；armed 后才流畅。现在从第一次 Alt 起就注入，菜单模式不再激活 → 等待期不再卡。
    // !down：避让 Alt+左键（PS 原生吸管），防注入键干扰其拖拽（鼠标点击本身也会取消菜单模式，无需注入）。
    if (alt && !down && psActive && sampler.breakMenu && (armed || picking || tapCount > 0 || pendingRead)) {
      try { sampler.breakMenu(); } catch (e) {}
    }

    // 取色态：已三击激活(armed) + 当前确实按住 Alt + PS 最前(#1) + 没点左键 + 没按 Ctrl/Shift/Tab(#3) + 没按 Esc。
    // 关键修复：直接查 alt —— 松开 Alt 当帧 pickActive 即 false → 立刻停止取色。
    //   （以前不查 alt、靠 armed 当代理，而 armed 有 10 帧≈160ms 释放去抖 → 松手后还取色零点几秒。）
    //   抖动安全：GetAsyncKeyState 偶发抖一帧 alt=false 不会误结束，picking 由下方 pickFalse>=12 去抖兜底。
    // 不含 moved —— 鼠标暂停≠结束取色（Alt 还按着就还是取色态），否则走走停停反复复位狂调 render → 卡。
    const pickActive = armed && alt && psActive && !down && !ctrl && !shift && !tab && !esc && !drag;

    if (pickActive) {               // 取色态：三击 Alt 激活后，按住第三下划过画布（不点左键）
      picking = true; pickFalse = 0;
      // breakMenu 已由上方「手势全程」统一注入（armed 时也覆盖），此处不再重复调用。
      if (valid && moved && (r !== state.r || g !== state.g || b !== state.b)) {   // 仅「像素有效 + 鼠标在动 + 颜色变」才更新（越界帧保持上次色，不闪白）
        state.r = r; state.g = g; state.b = b; syncHsvFromRgb();
        if (frame - lastRenderFrame >= 4) {        // 节流 paint：取色看色分布 ~15fps 足够，降 paint 量防 UXP 渲染层积压卡顿
          renderFast(); lastRenderFrame = frame;
        }
        if (frame - lastReadoutFrame >= 9) {       // ~11fps：HSV 数字（降频防闪）
          updateReadout(); lastReadoutFrame = frame;
        }
      }
      return;
    }
    if (picking) {                         // pickActive 抖一两帧(如 psActive 偶发误判)不算结束
      if (++pickFalse >= 12) {             // 连续 ~12 帧(>180ms) pickActive=false 才算真松开 Alt
        picking = false; pickFalse = 0;
        render();                          // 真结束才补一次全量渲染（含渐变轨道）
        needPush = true;                   // 标记「待写前景色」，不在此处直接写（见下方节流）——避免 armed 抖动反复触发 pushColor 阻塞主线程
        setStatus("就绪：单击 Alt 读前景色 / 三击 Alt 按住划过画布取色", "ready");
      }
      return;                              // 去抖期间保持 picking，绝不调 render（消除 38~58/s 暴增）
    }
    // 待写前景色：节流到「空闲且距上次写 ≥30 帧(~480ms)」才写一次，杜绝频繁 executeAsModal 阻塞 → 卡
    if (needPush && !applying && (frame - lastPushFrame >= 30)) {
      needPush = false; lastPushFrame = frame; pushColor();
    }
    // 非取色：前景色镜像主要靠事件监听(onFgSetEvent)；此处只做 ~1.5s 低频兜底(Color 面板滑块等事件盲区)。
    // 用帧差判定（非 frame%N），因 sampleLoop 空闲仅每 4 帧跑，取模易与采样节奏错开而漏触发。
    if (frame - lastPollFrame >= 90) { lastPollFrame = frame; pollForeground(); }
  } catch (e) { /* ignore */ }
}

function rafLoop() {
  frame++;
  // 面板尺寸变化 → 重算色环几何（UXP 可能不发 resize 事件，这里轮询兜底）
  if (frame % 10 === 0) {
    const pw = document.documentElement.clientWidth || (picker.parentElement || picker).getBoundingClientRect().width;
    const w = Math.round(pw * 0.92);
    // 防抖：宽度需「连续两次轮询一致」才重算/缩放。挡掉点击 +/- 触发 render 后立即量宽读到的
    // UXP 重排中途过渡值、以及滚动条临界翻转造成的瞬时宽——这些只持续一两帧、两次不一致 → 不触发 → 不闪。
    // 真正的面板缩放会持续多帧、宽度稳定 → 仍会通过（延迟一拍 ~160ms，无感），故不破坏响应式缩放。
    if (w === _lastGeomW) {
      if (w > 80 && Math.abs(w - G.S) >= 2) { computeGeom(); render(); }
      applyScale();
    }
    _lastGeomW = w;
  }
  // 手势全程(tapCount>0 / pendingRead / armed / picking)每帧跑采样；纯空闲每 4 帧。
  // getLatest 现在只 lock+copy(读屏在后台线程)，每帧跑也很便宜——这是关键：从第一次 Alt 起每帧跑，
  // 才能让上面「手势全程 breakMenu」即时注入、打破等待第2/3次 Alt 期间的菜单模式节流。
  if (sampler) { if (armed || picking || tapCount > 0 || pendingRead || (frame % 4 === 0)) sampleLoop(); }
  else pollForeground();       // 无 addon：退回镜像前景色
}

async function startSampler() {
  // require 一个 .uxpaddon 返回 Promise，必须 await
  try {
    sampler = await require("ColorPaletteSampler9.uxpaddon");
    setStatus("就绪：单击 Alt 读前景色 / 三击 Alt 按住划过画布取色", "ready");
  } catch (e) {
    sampler = null;
    setStatus("addon 未加载，退回镜像前景色：" + String(e), "error");
  }
}

/* ---------------- 初始化 ---------------- */
function init() {
  buildRows("rowsRgb", ["r", "g", "b"]);
  buildRows("rowsHsv", ["h", "s", "v"]);
  wireSwatches();
  if (!readForegroundFromPS()) syncRgbFromHsv();
  applyScale();
  computeGeom();
  render();
  // 首帧宽度/色环图片可能还没就绪 → 多档补算，确保游标落到色环上（UXP 无 rAF，用 setTimeout）
  const reflow = () => { applyScale(); computeGeom(); render(); };
  if (hueRing) hueRing.addEventListener("load", reflow);   // 色环 PNG 加载完触发布局 → 重算
  setTimeout(reflow, 60);
  setTimeout(reflow, 150);
  setTimeout(reflow, 400);    // 再兜底一次，覆盖 PNG 解码慢/面板初次布局抖动
  // 布局轮询立即启动，不依赖 addon 加载（面板缩放/重算几何始终生效）
  setInterval(rafLoop, 16);    // ~62fps：降低 getLatest/psActive 等系统调用频率，减卡
  // 面板尺寸变化（浏览器/部分宿主会发 resize）→ 立即重算
  let resizeTimer = null;
  window.addEventListener("resize", () => { if (resizeTimer) return; resizeTimer = setTimeout(() => { resizeTimer = null; applyScale(); computeGeom(); render(); }, 100); });   // debounce 100ms：防 resize 抖动连环 render
  initFgListener();            // 前景色变化事件监听（主路径，替代每帧轮询）
  startSampler();
}
init();
