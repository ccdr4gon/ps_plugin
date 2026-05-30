/* =========================================================
 *  调色盘 Color Palette - UXP 插件主逻辑
 *  方形取色器 + 色环 + RGB 滑块 + HSV 滑块
 * ========================================================= */

/* ---- Photoshop API（在浏览器中预览时自动降级为 null）---- */
let PS = null;
try { PS = require("photoshop"); } catch (e) { PS = null; }

/* =========================================================
 *  颜色转换工具
 * ========================================================= */

// HSV -> RGB   h:[0,360]  s,v:[0,100]  =>  {r,g,b}:[0,255]
function hsvToRgb(h, s, v) {
  s /= 100; v /= 100;
  const c = v * s;
  const hp = (h % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp >= 0 && hp < 1) { r = c; g = x; b = 0; }
  else if (hp < 2) { r = x; g = c; b = 0; }
  else if (hp < 3) { r = 0; g = c; b = x; }
  else if (hp < 4) { r = 0; g = x; b = c; }
  else if (hp < 5) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  const m = v - c;
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255)
  };
}

// RGB -> HSV   r,g,b:[0,255]  =>  {h,s,v} h:[0,360] s,v:[0,100]
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h: Math.round(h), s: Math.round(s * 100), v: Math.round(max * 100) };
}

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const rgbStr = (r, g, b) => `rgb(${r},${g},${b})`;

/* =========================================================
 *  颜色状态（HSV 与 RGB 同时保存，互相同步）
 * ========================================================= */
const state = { h: 65, s: 50, v: 51, r: 0, g: 0, b: 0 };

function syncRgbFromHsv() {
  const c = hsvToRgb(state.h, state.s, state.v);
  state.r = c.r; state.g = c.g; state.b = c.b;
}
function syncHsvFromRgb() {
  const c = rgbToHsv(state.r, state.g, state.b);
  // 灰阶时色相未定义、纯黑时饱和度未定义 —— 保留旧值，避免取色器跳位
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
  if (m.type === "rgb") { state[ch] = val; syncHsvFromRgb(); }
  else { state[ch] = val; syncRgbFromHsv(); }
  render();
}
function updateHsv(partial) { Object.assign(state, partial); syncRgbFromHsv(); render(); }

/* =========================================================
 *  色环 + 方形取色器（Canvas）
 * ========================================================= */
const SIZE = 220;
const DPR = window.devicePixelRatio || 1;
const cx = SIZE / 2, cy = SIZE / 2;
const rOuter = 104, rInner = 80;
const sqSize = 104;
const sqLeft = cx - sqSize / 2, sqTop = cy - sqSize / 2;

const canvas = document.getElementById("wheel");
canvas.width = SIZE * DPR;
canvas.height = SIZE * DPR;
canvas.style.width = SIZE + "px";
canvas.style.height = SIZE + "px";
const ctx = canvas.getContext("2d");
ctx.scale(DPR, DPR);

let ringCanvas = null;
function buildRing() {
  ringCanvas = document.createElement("canvas");
  ringCanvas.width = SIZE * DPR;
  ringCanvas.height = SIZE * DPR;
  const rc = ringCanvas.getContext("2d");
  rc.scale(DPR, DPR);
  for (let i = 0; i < 360; i++) {
    const a0 = (i - 90 - 0.7) * Math.PI / 180; // 色相 0(红) 在正上方，顺时针递增
    const a1 = (i - 90 + 0.7) * Math.PI / 180;
    rc.beginPath();
    rc.arc(cx, cy, rOuter, a0, a1);
    rc.arc(cx, cy, rInner, a1, a0, true);
    rc.closePath();
    const c = hsvToRgb(i, 100, 100);
    rc.fillStyle = rgbStr(c.r, c.g, c.b);
    rc.fill();
  }
}

function drawSquare() {
  const pure = hsvToRgb(state.h, 100, 100);
  ctx.fillStyle = rgbStr(pure.r, pure.g, pure.b);
  ctx.fillRect(sqLeft, sqTop, sqSize, sqSize);

  const gx = ctx.createLinearGradient(sqLeft, 0, sqLeft + sqSize, 0);
  gx.addColorStop(0, "rgba(255,255,255,1)");
  gx.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gx;
  ctx.fillRect(sqLeft, sqTop, sqSize, sqSize);

  const gy = ctx.createLinearGradient(0, sqTop, 0, sqTop + sqSize);
  gy.addColorStop(0, "rgba(0,0,0,0)");
  gy.addColorStop(1, "rgba(0,0,0,1)");
  ctx.fillStyle = gy;
  ctx.fillRect(sqLeft, sqTop, sqSize, sqSize);
}

function ring2(x, y, rad, outer, inner) {
  ctx.beginPath(); ctx.arc(x, y, rad, 0, 2 * Math.PI);
  ctx.lineWidth = outer; ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, rad, 0, 2 * Math.PI);
  ctx.lineWidth = inner; ctx.strokeStyle = "#ffffff"; ctx.stroke();
}

function drawMarkers() {
  // 色环上的色相游标
  const rMid = (rInner + rOuter) / 2;
  const a = (state.h - 90) * Math.PI / 180;
  ring2(cx + rMid * Math.cos(a), cy + rMid * Math.sin(a), 6, 3, 1.5);
  // 方形里的 S/V 游标
  const mx = sqLeft + state.s / 100 * sqSize;
  const my = sqTop + (1 - state.v / 100) * sqSize;
  ring2(mx, my, 5, 3, 1.5);
}

function drawWheel() {
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.drawImage(ringCanvas, 0, 0, SIZE, SIZE);
  drawSquare();
  drawMarkers();
}

/* ----- Canvas 交互 ----- */
function getPos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
function handleRing(x, y) {
  const ang = Math.atan2(y - cy, x - cx) * 180 / Math.PI;
  updateHsv({ h: Math.round((ang + 90 + 360) % 360) });
}
function handleSquare(x, y) {
  const s = clamp((x - sqLeft) / sqSize * 100, 0, 100);
  const v = clamp((1 - (y - sqTop) / sqSize) * 100, 0, 100);
  updateHsv({ s: Math.round(s), v: Math.round(v) });
}

/* =========================================================
 *  滑块行（动态生成）
 * ========================================================= */
const els = {}; // { r:{track,thumb,input,unit}, ... }

function buildRows(containerId, channels) {
  const box = document.getElementById(containerId);
  channels.forEach(ch => {
    const m = CHANNELS[ch];
    const row = document.createElement("div");
    row.className = "slider-row";
    row.innerHTML =
      `<span class="slider-label">${m.label}</span>` +
      `<div class="slider-track"><div class="slider-thumb"></div></div>` +
      `<div class="value-box">` +
        `<input class="slider-input" type="number" min="${m.min}" max="${m.max}" step="1" />` +
        `<span class="unit">${m.unit}</span>` +
        `<span class="spin"><button class="spin-up">&#9650;</button><button class="spin-down">&#9660;</button></span>` +
      `</div>`;
    box.appendChild(row);

    const track = row.querySelector(".slider-track");
    const thumb = row.querySelector(".slider-thumb");
    const input = row.querySelector(".slider-input");
    els[ch] = { track, thumb, input };

    // 拖动轨道
    track.addEventListener("pointerdown", e => {
      drag = { kind: "slider", channel: ch };
      sliderFromX(ch, e.clientX);
    });
    // 数字输入
    input.addEventListener("input", () => {
      const v = parseInt(input.value, 10);
      if (!isNaN(v)) setChannel(ch, v);
    });
    input.addEventListener("change", () => {
      const v = parseInt(input.value, 10);
      setChannel(ch, isNaN(v) ? m.min : v);
      input.value = state[ch];
      pushColor();
    });
    // 微调按钮
    row.querySelector(".spin-up").addEventListener("click", () => { setChannel(ch, state[ch] + 1); pushColor(); });
    row.querySelector(".spin-down").addEventListener("click", () => { setChannel(ch, state[ch] - 1); pushColor(); });
  });
}

function sliderFromX(ch, clientX) {
  const m = CHANNELS[ch];
  const r = els[ch].track.getBoundingClientRect();
  const t = clamp((clientX - r.left) / r.width, 0, 1);
  setChannel(ch, m.min + t * (m.max - m.min));
}

function updateSliders() {
  const { r, g, b, h, s, v } = state;
  // 轨道渐变
  els.r.track.style.background = `linear-gradient(to right, ${rgbStr(0, g, b)}, ${rgbStr(255, g, b)})`;
  els.g.track.style.background = `linear-gradient(to right, ${rgbStr(r, 0, b)}, ${rgbStr(r, 255, b)})`;
  els.b.track.style.background = `linear-gradient(to right, ${rgbStr(r, g, 0)}, ${rgbStr(r, g, 255)})`;
  els.h.track.style.background =
    "linear-gradient(to right,#f00 0%,#ff0 16.66%,#0f0 33.33%,#0ff 50%,#00f 66.66%,#f0f 83.33%,#f00 100%)";
  const s0 = hsvToRgb(h, 0, v), s1 = hsvToRgb(h, 100, v), v1 = hsvToRgb(h, s, 100);
  els.s.track.style.background = `linear-gradient(to right, ${rgbStr(s0.r, s0.g, s0.b)}, ${rgbStr(s1.r, s1.g, s1.b)})`;
  els.v.track.style.background = `linear-gradient(to right, #000, ${rgbStr(v1.r, v1.g, v1.b)})`;

  // 游标位置 + 数值
  for (const ch in els) {
    const m = CHANNELS[ch];
    els[ch].thumb.style.left = ((state[ch] - m.min) / (m.max - m.min) * 100) + "%";
    if (document.activeElement !== els[ch].input) els[ch].input.value = state[ch];
  }
}

/* =========================================================
 *  色板 / 读数
 * ========================================================= */
function updateSwatches() {
  const col = rgbStr(state.r, state.g, state.b);
  document.getElementById("swFg").style.background = col;
  document.getElementById("bswCurrent").style.background = col;
  document.getElementById("readout").textContent = `H ${state.h} S ${state.s} V ${state.v}`;
}

/* =========================================================
 *  统一渲染
 * ========================================================= */
function render() {
  drawWheel();
  updateSliders();
  updateSwatches();
}

/* =========================================================
 *  全局拖拽（色环 / 方形 / 滑块）
 * ========================================================= */
let drag = null;
canvas.addEventListener("pointerdown", e => {
  const p = getPos(e);
  const dist = Math.hypot(p.x - cx, p.y - cy);
  if (dist >= rInner && dist <= rOuter + 6) { drag = { kind: "ring" }; handleRing(p.x, p.y); }
  else { drag = { kind: "square" }; handleSquare(p.x, p.y); }
});
window.addEventListener("pointermove", e => {
  if (!drag) return;
  if (drag.kind === "ring") { const p = getPos(e); handleRing(p.x, p.y); }
  else if (drag.kind === "square") { const p = getPos(e); handleSquare(p.x, p.y); }
  else if (drag.kind === "slider") { sliderFromX(drag.channel, e.clientX); }
});
window.addEventListener("pointerup", () => { if (drag) { drag = null; pushColor(); } });

/* =========================================================
 *  与 Photoshop 同步前景色
 * ========================================================= */
let applying = false, pending = false;
async function pushColor() {
  if (!PS) return;                 // 浏览器预览时跳过
  if (applying) { pending = true; return; }
  applying = true;
  try {
    await PS.core.executeAsModal(async () => {
      await PS.action.batchPlay([{
        _obj: "set",
        _target: [{ _ref: "color", _property: "foregroundColor" }],
        to: { _obj: "RGBColor", red: state.r, grain: state.g, blue: state.b },
        source: "photoshopPicker",
        _options: { dialogOptions: "dontDisplay" }
      }], {});
    }, { commandName: "设置前景色" });
  } catch (e) { console.error("设置前景色失败:", e); }
  applying = false;
  if (pending) { pending = false; pushColor(); }
}

function readForegroundFromPS() {
  if (!PS) return false;
  try {
    const fg = PS.app.foregroundColor;
    state.r = Math.round(fg.rgb.red);
    state.g = Math.round(fg.rgb.green);
    state.b = Math.round(fg.rgb.blue);
    syncHsvFromRgb();
    return true;
  } catch (e) { return false; }
}

/* =========================================================
 *  额外色板按钮
 * ========================================================= */
function wireSwatches() {
  document.getElementById("applyBtn").addEventListener("click", pushColor);
  document.getElementById("swFg").addEventListener("click", pushColor);
  document.getElementById("bswCurrent").addEventListener("click", pushColor);
  const setWhite = () => { state.r = state.g = state.b = 255; syncHsvFromRgb(); render(); pushColor(); };
  document.getElementById("swBg").addEventListener("click", setWhite);
  document.getElementById("bswWhite").addEventListener("click", setWhite);
}

/* =========================================================
 *  初始化
 * ========================================================= */
function init() {
  buildRows("rowsRgb", ["r", "g", "b"]);
  buildRows("rowsHsv", ["h", "s", "v"]);
  wireSwatches();
  buildRing();
  if (!readForegroundFromPS()) syncRgbFromHsv(); // PS 不可用则用默认 HSV
  render();
}

init();
