/* =========================================================
 *  调色盘 Hybrid - UXP 主逻辑
 *  色环 + 方形 + RGB/HSV 滑块  +  C++ addon 屏幕实时取色
 * ========================================================= */

let PS = null;
try { PS = require("photoshop"); } catch (e) { PS = null; }

/* C++ addon：屏幕实时采样器（require 一个 uxpaddon 返回 Promise，必须 await——见 startSampler） */
let sampler = null;
let addonErr = "";

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
  // 用父容器宽 × 0.92 算整数边长，并固定 #wheel 为整数尺寸（消除亚像素导致的 1px 抖动）
  const pw = (picker.parentElement || picker).getBoundingClientRect().width;
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

// 全局缩放：按面板实际宽度设置 --s，字号/控件随之动态缩放
let curScale = 1;
const appEl = document.getElementById("app");
function applyScale() {
  const w = appEl.getBoundingClientRect().width;
  if (!w) return;
  const s = clamp(w / 300, 0.85, 1.7);
  if (Math.abs(s - curScale) < 0.01) return;
  curScale = s;
  appEl.style.setProperty("--s", s.toFixed(3));
}

function renderPicker() {
  const pure = hsvToRgb(state.h, 100, 100);
  svSquare.style.backgroundColor = rgbStr(pure.r, pure.g, pure.b);

  const a = (state.h - 90) * Math.PI / 180;
  hueMarker.style.left = (G.cx + G.rMid * Math.cos(a)) + "px";
  hueMarker.style.top = (G.cy + G.rMid * Math.sin(a)) + "px";
  svMarker.style.left = (G.sqLeft + state.s / 100 * G.sqSize) + "px";
  svMarker.style.top = (G.sqTop + (1 - state.v / 100) * G.sqSize) + "px";
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
          `<button class="step step-down" title="-1">-</button>` +
          `<button class="step step-up" title="+1">+</button>` +
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
function updateSliderTracks() {   // 6 条渐变轨道（重：取色时低频更新）
  const { r, g, b, h, s, v } = state;
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
    els[ch].thumb.style.left = ((state[ch] - m.min) / (m.max - m.min) * 100) + "%";
    if (document.activeElement !== els[ch].input) {
      const nv = String(Number.isFinite(state[ch]) ? state[ch] : 0);
      if (els[ch].input.value !== nv) els[ch].input.value = nv;   // 仅文本真变化才写：UXP 文本控件频繁写(尤其写 0)会反复刷新→闪
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
  swEls = { fg: document.getElementById("swFg"), cur: document.getElementById("bswCurrent"), hex: document.getElementById("hexout"), h: rv[0], s: rv[1], v: rv[2] };
}
function updateSwatchColors() {   // 前景/当前色块（轻，跟手）
  ensureSwEls();
  const col = rgbStr(state.r, state.g, state.b);
  swEls.fg.style.background = col;
  swEls.cur.style.background = col;
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
function render() { renderN++; renderPicker(); updateSliders(); updateSwatches(); }
// 取色高频：跳过 6 条渐变轨道 + HSV 数字，只更新色环/方块/游标/色块（数字另行低频）
function renderFast() { renderFastN++; renderPicker(); updateSliderThumbs(); updateSwatchColors(); }

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

/* ---------------- 色板按钮 ---------------- */
function wireSwatches() {
  document.getElementById("applyBtn").addEventListener("click", pushColor);
  document.getElementById("swFg").addEventListener("click", pushColor);
  document.getElementById("bswCurrent").addEventListener("click", pushColor);
  const setWhite = () => { state.r = state.g = state.b = 255; syncHsvFromRgb(); render(); pushColor(); };
  document.getElementById("swBg").addEventListener("click", setWhite);
  document.getElementById("bswWhite").addEventListener("click", setWhite);
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

let picking = false;        // 正处于 Alt+左键 画布取色中
let pickFalse = 0;          // pickActive 连续为 false 的帧数（去抖：防 psActive 偶发误判触发"假结束"狂调 render）
let frame = 0;
let renderN = 0, renderFastN = 0, glSum = 0, glN = 0, glMax = 0;   // 临时诊断
setInterval(() => { console.log(`[perf] render/s=${renderN} fast/s=${renderFastN} getLatest(avg=${glN ? (glSum / glN).toFixed(1) : 0}ms max=${glMax}ms n=${glN}) hsv=${state.h}/${state.s}/${state.v}`); renderN = 0; renderFastN = 0; glSum = 0; glN = 0; glMax = 0; }, 1000);
let lastX = -1, lastY = -1;   // 上一帧光标位置（判断鼠标是否在移动）
let lastRenderFrame = -99;    // 上次取色渲染的帧（节流到 ~30fps 用）
let lastReadoutFrame = -99;   // 上次 HSV 数字更新的帧（更低频，防数字闪烁）

/* 每帧从 addon 读「光标处屏幕像素 + 按键状态」。
   Alt+左键 按住 = 连续实时取色（要求 down=1：Alt+Tab 时 down=0，绝不误触发）。 */
function sampleLoop() {
  if (applying) return;
  let s;
  const _gl0 = Date.now(); try { s = sampler.getLatest(); } catch (e) { return; } { const d = Date.now() - _gl0; glSum += d; glN++; if (d > glMax) glMax = d; }
  if (!s) return;
  try {
    const a = String(s).split(",");        // x,y,r,g,b,down,alt,shift,esc,ctrl,tab,psActive
    const x = +a[0], y = +a[1];
    const r = +a[2], g = +a[3], b = +a[4];
    // addon 偶发返回截断/坏数据 → 直接跳过，绝不让 NaN 进 state（会触发数字框校验提示音 + 闪烁）
    if (a.length < 12 || Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return;
    const down = a[5] === "1", alt = a[6] === "1", shift = a[7] === "1", esc = a[8] === "1";
    const ctrl = a[9] === "1", tab = a[10] === "1", psActive = a[11] === "1";
    const moved = (x !== lastX || y !== lastY);
    lastX = x; lastY = y;
    // 取色态：按住 Alt + PS 在最前(#1) + 没点左键 + 没按 Ctrl/Shift/Tab(#3) + 没按 Esc。
    // 关键：不含 moved —— 鼠标暂停≠结束取色（Alt 还按着就还是取色态），
    // 否则走走停停时 picking 反复复位、每次复位狂调全量 render（实测 38/s）→ 卡。
    const pickActive = alt && psActive && !down && !ctrl && !shift && !tab && !esc && !drag;

    if (pickActive) {               // 取色态：按住 Alt 划过画布（不点左键）
      picking = true; pickFalse = 0;
      if (moved && (r !== state.r || g !== state.g || b !== state.b)) {   // 仅「鼠标在动且颜色变」才更新
        state.r = r; state.g = g; state.b = b; syncHsvFromRgb();
        if (frame - lastRenderFrame >= 3) {        // ~30fps：色环/方块/游标/色块（跟手）
          renderFast(); setStatus("取色中 " + r + "," + g + "," + b, "active"); lastRenderFrame = frame;
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
        pushColor();                       // 取色结束 → 把最终取到的颜色写入 PS 前景色
        setStatus("就绪：按住 Alt 划过画布取色（别点左键）", "ready");
      }
      return;                              // 去抖期间保持 picking，绝不调 render（消除 38~58/s 暴增）
    }
    if (frame % 6 === 0) pollForeground();  // 非取色：镜像 PS 前景色（降频~16fps，避免每帧读 PS 卡顿）
  } catch (e) {
    if (frame % 20 === 0) console.log("[sample] ERROR: " + (e && e.message ? e.message : String(e)));
  }
}

function rafLoop() {
  frame++;
  // 面板尺寸变化 → 重算色环几何（UXP 可能不发 resize 事件，这里轮询兜底）
  if (frame % 10 === 0) {
    const pw = (picker.parentElement || picker).getBoundingClientRect().width;
    const w = Math.round(pw * 0.92);
    if (w > 80 && Math.abs(w - G.S) >= 2) { computeGeom(); render(); }   // ≥2 才重算，避免亚像素抖动
    applyScale();
  }
  if (sampler) sampleLoop();   // 有 addon：读屏实时取色
  else pollForeground();       // 无 addon：退回镜像前景色
}

async function startSampler() {
  // require 一个 .uxpaddon 返回 Promise，必须 await
  try {
    sampler = await require("ColorPaletteSampler4.uxpaddon");
    setStatus("就绪：按住 Alt 划过画布取色（别点左键）", "ready");
  } catch (e) {
    sampler = null; addonErr = String(e);
    setStatus("addon 未加载，退回镜像前景色：" + addonErr, "error");
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
  // 首帧宽度可能还没定，布局稳定后再算一次（UXP 无 requestAnimationFrame，用 setTimeout）
  setTimeout(() => { applyScale(); computeGeom(); render(); }, 120);
  // 布局轮询立即启动，不依赖 addon 加载（面板缩放/重算几何始终生效）
  setInterval(rafLoop, 16);    // ~62fps：降低 getLatest/psActive 等系统调用频率，减卡
  // 面板尺寸变化（浏览器/部分宿主会发 resize）→ 立即重算
  let resizeTimer = null;
  window.addEventListener("resize", () => { if (resizeTimer) return; resizeTimer = setTimeout(() => { resizeTimer = null; applyScale(); computeGeom(); render(); }, 100); });   // debounce 100ms：防 resize 抖动连环 render
  startSampler();
}
init();
