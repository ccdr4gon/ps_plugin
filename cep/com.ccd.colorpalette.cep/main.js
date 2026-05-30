(function () {
  "use strict";

  var csInterface = new CSInterface();
  var hasCepBridge = !!(window.__adobe_cep__ && window.__adobe_cep__.evalScript);
  var FOREGROUND_CHANGED_EVENT = "com.ccd.colorpalette.foregroundChanged";

  function evalScript(script) {
    return new Promise(function (resolve) {
      if (!hasCepBridge) {
        resolve("");
        return;
      }
      csInterface.evalScript(script, resolve);
    });
  }

  function hsvToRgb(h, s, v) {
    s /= 100;
    v /= 100;
    var c = v * s;
    var hp = (h % 360) / 60;
    var x = c * (1 - Math.abs((hp % 2) - 1));
    var r = 0;
    var g = 0;
    var b = 0;

    if (hp >= 0 && hp < 1) {
      r = c;
      g = x;
    } else if (hp < 2) {
      r = x;
      g = c;
    } else if (hp < 3) {
      g = c;
      b = x;
    } else if (hp < 4) {
      g = x;
      b = c;
    } else if (hp < 5) {
      r = x;
      b = c;
    } else {
      r = c;
      b = x;
    }

    var m = v - c;
    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255)
    };
  }

  function rgbToHsv(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var d = max - min;
    var h = 0;

    if (d !== 0) {
      if (max === r) {
        h = ((g - b) / d) % 6;
      } else if (max === g) {
        h = (b - r) / d + 2;
      } else {
        h = (r - g) / d + 4;
      }
      h *= 60;
      if (h < 0) {
        h += 360;
      }
    }

    var s = max === 0 ? 0 : d / max;
    return { h: Math.round(h), s: Math.round(s * 100), v: Math.round(max * 100) };
  }

  function clamp(x, lo, hi) {
    return Math.min(hi, Math.max(lo, x));
  }

  function rgbStr(r, g, b) {
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function rgbKey(r, g, b) {
    return [r, g, b].join(",");
  }

  function quoteForJsx(value) {
    return '"' + String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  }

  // 把 CEP getSystemPath 返回的 file: URI 规整成 Windows 真实路径(供 child_process.spawn 用)
  function toOsPath(p) {
    if (!p) { return p; }
    p = String(p).replace(/^file:\/{0,3}/i, "");
    try { p = decodeURIComponent(p); } catch (e) {}
    p = p.replace(/\//g, "\\");
    p = p.replace(/^\\+([A-Za-z]:)/, "$1");
    return p;
  }

  var state = { h: 65, s: 50, v: 51, r: 0, g: 0, b: 0 };

  function syncRgbFromHsv() {
    var c = hsvToRgb(state.h, state.s, state.v);
    state.r = c.r;
    state.g = c.g;
    state.b = c.b;
  }

  function syncHsvFromRgb() {
    var c = rgbToHsv(state.r, state.g, state.b);
    if (c.s === 0) {
      c.h = state.h;
    }
    if (c.v === 0) {
      c.h = state.h;
      c.s = state.s;
    }
    state.h = c.h;
    state.s = c.s;
    state.v = c.v;
  }

  var CHANNELS = {
    r: { type: "rgb", min: 0, max: 255, label: "R", unit: "" },
    g: { type: "rgb", min: 0, max: 255, label: "G", unit: "" },
    b: { type: "rgb", min: 0, max: 255, label: "B", unit: "" },
    h: { type: "hsv", min: 0, max: 360, label: "H", unit: "" },
    s: { type: "hsv", min: 0, max: 100, label: "S", unit: "%" },
    v: { type: "hsv", min: 0, max: 100, label: "V", unit: "%" }
  };

  function setChannel(ch, val) {
    var m = CHANNELS[ch];
    val = clamp(Math.round(val), m.min, m.max);
    if (m.type === "rgb") {
      state[ch] = val;
      syncHsvFromRgb();
    } else {
      state[ch] = val;
      syncRgbFromHsv();
    }
    render();
  }

  function updateHsv(partial) {
    for (var key in partial) {
      if (Object.prototype.hasOwnProperty.call(partial, key)) {
        state[key] = partial[key];
      }
    }
    syncRgbFromHsv();
    render();
  }

  var SIZE = 220;
  var DPR = window.devicePixelRatio || 1;
  var cx = SIZE / 2;
  var cy = SIZE / 2;
  var rOuter = 104;
  var rInner = 87;
  var sqSize = 120;
  var sqLeft = cx - sqSize / 2;
  var sqTop = cy - sqSize / 2;

  var canvas = document.getElementById("wheel");
  canvas.width = SIZE * DPR;
  canvas.height = SIZE * DPR;
  canvas.style.width = SIZE + "px";
  canvas.style.height = SIZE + "px";
  var ctx = canvas.getContext("2d");
  ctx.scale(DPR, DPR);

  var ringCanvas = null;

  function buildRing() {
    ringCanvas = document.createElement("canvas");
    ringCanvas.width = SIZE * DPR;
    ringCanvas.height = SIZE * DPR;
    var rc = ringCanvas.getContext("2d");
    rc.scale(DPR, DPR);

    for (var i = 0; i < 360; i += 1) {
      var a0 = (i - 90 - 0.7) * Math.PI / 180;
      var a1 = (i - 90 + 0.7) * Math.PI / 180;
      rc.beginPath();
      rc.arc(cx, cy, rOuter, a0, a1);
      rc.arc(cx, cy, rInner, a1, a0, true);
      rc.closePath();
      var c = hsvToRgb(i, 100, 100);
      rc.fillStyle = rgbStr(c.r, c.g, c.b);
      rc.fill();
    }
  }

  function drawSquare() {
    var pure = hsvToRgb(state.h, 100, 100);
    ctx.fillStyle = rgbStr(pure.r, pure.g, pure.b);
    ctx.fillRect(sqLeft, sqTop, sqSize, sqSize);

    var gx = ctx.createLinearGradient(sqLeft, 0, sqLeft + sqSize, 0);
    gx.addColorStop(0, "rgba(255,255,255,1)");
    gx.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gx;
    ctx.fillRect(sqLeft, sqTop, sqSize, sqSize);

    var gy = ctx.createLinearGradient(0, sqTop, 0, sqTop + sqSize);
    gy.addColorStop(0, "rgba(0,0,0,0)");
    gy.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = gy;
    ctx.fillRect(sqLeft, sqTop, sqSize, sqSize);
  }

  function ring2(x, y, rad, outer, inner) {
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, 2 * Math.PI);
    ctx.lineWidth = outer;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, rad, 0, 2 * Math.PI);
    ctx.lineWidth = inner;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
  }

  function drawMarkers() {
    var rMid = (rInner + rOuter) / 2;
    var a = (state.h - 90) * Math.PI / 180;
    ring2(cx + rMid * Math.cos(a), cy + rMid * Math.sin(a), 6, 3, 1.5);

    var mx = sqLeft + state.s / 100 * sqSize;
    var my = sqTop + (1 - state.v / 100) * sqSize;
    ring2(mx, my, 5, 3, 1.5);
  }

  function drawWheel() {
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(ringCanvas, 0, 0, SIZE, SIZE);
    drawSquare();
    drawMarkers();
  }

  function getPos(e) {
    var r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function handleRing(x, y) {
    var ang = Math.atan2(y - cy, x - cx) * 180 / Math.PI;
    updateHsv({ h: Math.round((ang + 90 + 360) % 360) });
  }

  function handleSquare(x, y) {
    var s = clamp((x - sqLeft) / sqSize * 100, 0, 100);
    var v = clamp((1 - (y - sqTop) / sqSize) * 100, 0, 100);
    updateHsv({ s: Math.round(s), v: Math.round(v) });
  }

  var els = {};
  var drag = null;
  var dragMoves = 0; // 诊断:统计一次拖拽期间 mousemove 触发次数
  // 诊断发现:本机 CEF 下 mouse 事件根本不派发,但 pointer 事件可用;
  // 而 pointer 事件在"按住拖动"时 pointermove 会中断 —— 解法是 setPointerCapture(见 listenStart)。
  var startEvent = "pointerdown";
  var moveEvent = "pointermove";
  var endEvent = "pointerup";
  var capturedEl = null;
  var capturedPointerId = null;

  function listenStart(el, handler) {
    el.addEventListener(startEvent, function (e) {
      if (e.button !== undefined && e.button !== 0) {
        return;
      }
      e.preventDefault();
      // 关键:指针捕获,保证按住拖动期间 pointermove 持续派发(CEF 下不捕获就会断流)
      try {
        if (el.setPointerCapture && e.pointerId !== undefined) {
          el.setPointerCapture(e.pointerId);
          capturedEl = el;
          capturedPointerId = e.pointerId;
        }
      } catch (err) {}
      handler(e);
    });
  }

  function buildRows(containerId, channels) {
    var box = document.getElementById(containerId);
    channels.forEach(function (ch) {
      var m = CHANNELS[ch];
      var row = document.createElement("div");
      row.className = "slider-row";
      row.innerHTML =
        '<span class="slider-label">' + m.label + "</span>" +
        '<div class="slider-track"><div class="slider-thumb"></div></div>' +
        '<div class="value-box">' +
          '<input class="slider-input" type="number" min="' + m.min + '" max="' + m.max + '" step="1" />' +
          '<span class="unit">' + m.unit + "</span>" +
          '<span class="spin"><button class="spin-up">&#9650;</button><button class="spin-down">&#9660;</button></span>' +
        "</div>";
      box.appendChild(row);

      var track = row.querySelector(".slider-track");
      var thumb = row.querySelector(".slider-thumb");
      var input = row.querySelector(".slider-input");
      els[ch] = { track: track, thumb: thumb, input: input };

      listenStart(track, function (e) {
        drag = { kind: "slider", channel: ch };
        sliderFromX(ch, e.clientX);
      });

      input.addEventListener("input", function () {
        var v = parseInt(input.value, 10);
        if (!isNaN(v)) {
          setChannel(ch, v);
        }
      });

      input.addEventListener("change", function () {
        var v = parseInt(input.value, 10);
        setChannel(ch, isNaN(v) ? m.min : v);
        input.value = state[ch];
        pushColor();
      });

      row.querySelector(".spin-up").addEventListener("click", function () {
        setChannel(ch, state[ch] + 1);
        pushColor();
      });

      row.querySelector(".spin-down").addEventListener("click", function () {
        setChannel(ch, state[ch] - 1);
        pushColor();
      });
    });
  }

  function sliderFromX(ch, clientX) {
    var m = CHANNELS[ch];
    var r = els[ch].track.getBoundingClientRect();
    var t = clamp((clientX - r.left) / r.width, 0, 1);
    setChannel(ch, m.min + t * (m.max - m.min));
  }

  function updateSliders() {
    var r = state.r;
    var g = state.g;
    var b = state.b;
    var h = state.h;
    var s = state.s;
    var v = state.v;

    els.r.track.style.background = "linear-gradient(to right, " + rgbStr(0, g, b) + ", " + rgbStr(255, g, b) + ")";
    els.g.track.style.background = "linear-gradient(to right, " + rgbStr(r, 0, b) + ", " + rgbStr(r, 255, b) + ")";
    els.b.track.style.background = "linear-gradient(to right, " + rgbStr(r, g, 0) + ", " + rgbStr(r, g, 255) + ")";
    els.h.track.style.background =
      "linear-gradient(to right,#f00 0%,#ff0 16.66%,#0f0 33.33%,#0ff 50%,#00f 66.66%,#f0f 83.33%,#f00 100%)";

    var s0 = hsvToRgb(h, 0, v);
    var s1 = hsvToRgb(h, 100, v);
    var v1 = hsvToRgb(h, s, 100);
    els.s.track.style.background = "linear-gradient(to right, " + rgbStr(s0.r, s0.g, s0.b) + ", " + rgbStr(s1.r, s1.g, s1.b) + ")";
    els.v.track.style.background = "linear-gradient(to right, #000, " + rgbStr(v1.r, v1.g, v1.b) + ")";

    for (var ch in els) {
      if (Object.prototype.hasOwnProperty.call(els, ch)) {
        var m = CHANNELS[ch];
        els[ch].thumb.style.left = ((state[ch] - m.min) / (m.max - m.min) * 100) + "%";
        if (document.activeElement !== els[ch].input) {
          els[ch].input.value = state[ch];
        }
      }
    }
  }

  function updateSwatches() {
    var col = rgbStr(state.r, state.g, state.b);
    document.getElementById("swFg").style.background = col;
    document.getElementById("bswCurrent").style.background = col;
    document.getElementById("readout").textContent = "H " + state.h + " S " + state.s + " V " + state.v;
  }

  function render() {
    drawWheel();
    updateSliders();
    updateSwatches();
  }

  function applyExternalRgb(r, g, b, force) {
    if (!force && (drag || applying || isEditingNumber())) {
      return false;
    }

    r = clamp(Math.round(r), 0, 255);
    g = clamp(Math.round(g), 0, 255);
    b = clamp(Math.round(b), 0, 255);

    var key = rgbKey(r, g, b);
    if (key === rgbKey(state.r, state.g, state.b)) {
      lastForegroundKey = key;
      return true;
    }

    state.r = r;
    state.g = g;
    state.b = b;
    syncHsvFromRgb();
    render();
    lastForegroundKey = key;
    return true;
  }

  listenStart(canvas, function (e) {
    var p = getPos(e);
    var dist = Math.hypot(p.x - cx, p.y - cy);
    dragMoves = 0;
    if (dist >= rInner && dist <= rOuter + 6) {
      drag = { kind: "ring" };
      handleRing(p.x, p.y);
    } else {
      drag = { kind: "square" };
      handleSquare(p.x, p.y);
    }
    debugLog("DRAG-DIAG start kind=" + drag.kind + " btn=" + e.button + " evt=" + e.type);
  });

  window.addEventListener(moveEvent, function (e) {
    if (!drag) {
      return;
    }
    dragMoves += 1;
    if (drag.kind === "ring") {
      var rp = getPos(e);
      handleRing(rp.x, rp.y);
    } else if (drag.kind === "square") {
      var sp = getPos(e);
      handleSquare(sp.x, sp.y);
    } else if (drag.kind === "slider") {
      sliderFromX(drag.channel, e.clientX);
    }
  });

  window.addEventListener(endEvent, function (e) {
    if (drag) {
      debugLog("DRAG-DIAG end kind=" + drag.kind + " moves=" + dragMoves + " evt=" + (e && e.type));
      drag = null;
      if (capturedEl && capturedPointerId !== null) {
        try { capturedEl.releasePointerCapture(capturedPointerId); } catch (err) {}
        capturedEl = null;
        capturedPointerId = null;
      }
      pushColor();
    }
  });

  var applying = false;
  var pending = false;
  var readingForeground = false;
  var lastForegroundKey = "";
  var currentToolId = "";
  var screenSamplerProcess = null;
  var debugWriter = null;
  var lastSamplerDebugAt = 0;
  // 采样结果先暂存,由浏览器定时器统一刷新(node IO 回调直接改 DOM 在 CEF 下常常不重绘)
  var pendingSample = null;
  var lastSampleAt = 0;
  var sampleFlushStarted = false;
  var lastFlushLogAt = 0;

  function startSampleFlushLoop() {
    if (sampleFlushStarted) { return; }
    sampleFlushStarted = true;
    window.setInterval(function () {
      if (!pendingSample) { return; }
      var c = pendingSample;
      pendingSample = null;
      applyExternalRgb(c.r, c.g, c.b, true);
      var now = Date.now();
      if (now - lastFlushLogAt > 1000) {
        debugLog("flush applied " + c.r + "," + c.g + "," + c.b + " -> state " + state.r + "," + state.g + "," + state.b);
        lastFlushLogAt = now;
      }
    }, 33);
  }

  function debugLog(message) {
    try {
      if (!debugWriter && typeof require === "function") {
        var fs = require("fs");
        var os = require("os");
        var path = require("path");
        debugWriter = {
          fs: fs,
          file: path.join(os.tmpdir(), "colorpalette-cep-debug.log")
        };
      }

      if (debugWriter) {
        debugWriter.fs.appendFileSync(debugWriter.file, new Date().toISOString() + " " + message + "\n");
      }
    } catch (error) {
      debugWriter = null;
    }

    if (window.console && console.log) {
      console.log("[ColorPalette] " + message);
    }
  }

  function isEditingNumber() {
    return document.activeElement && document.activeElement.classList.contains("slider-input");
  }

  async function pushColor() {
    if (!hasCepBridge) {
      return;
    }
    if (applying) {
      pending = true;
      return;
    }
    applying = true;
    try {
      var result = await evalScript("colorPaletteSetForeground(" + state.r + "," + state.g + "," + state.b + ")");
      if (result && result.indexOf("ERR:") === 0) {
        console.error("Set foreground failed:", result);
      } else {
        lastForegroundKey = rgbKey(state.r, state.g, state.b);
      }
    } catch (error) {
      console.error("Set foreground failed:", error);
    }
    applying = false;
    if (pending) {
      pending = false;
      pushColor();
    }
  }

  async function readForegroundFromPS(force) {
    if (!hasCepBridge) {
      return false;
    }
    if (readingForeground || (!force && (drag || applying || isEditingNumber() || (Date.now() - lastSampleAt < 800)))) {
      return false;
    }
    readingForeground = true;
    try {
      var result = await evalScript("colorPaletteGetForeground()");
      var match = /^(\d+),(\d+),(\d+)$/.exec(result || "");
      if (!match) {
        return false;
      }
      var r = parseInt(match[1], 10);
      var g = parseInt(match[2], 10);
      var b = parseInt(match[3], 10);
      var key = rgbKey(r, g, b);
      if (!force && key === rgbKey(state.r, state.g, state.b)) {
        lastForegroundKey = key;
        return true;
      }
      return applyExternalRgb(r, g, b, force);
    } catch (error) {
      console.error("Read foreground failed:", error);
      return false;
    } finally {
      readingForeground = false;
    }
  }

  function startForegroundSync() {
    if (!hasCepBridge) {
      return;
    }

    debugLog("startForegroundSync version=1.4.0-rafflush node=" + (typeof require === "function"));

    if (csInterface.addEventListener) {
      csInterface.addEventListener(FOREGROUND_CHANGED_EVENT, function (event) {
        var match = /^(\d+),(\d+),(\d+)$/.exec((event && event.data) || "");
        if (match) {
          applyExternalRgb(
            parseInt(match[1], 10),
            parseInt(match[2], 10),
            parseInt(match[3], 10),
            true
          );
        }
      });
    }

    var extensionPath = csInterface.getSystemPath(SystemPath.EXTENSION);
    if (extensionPath) {
      var notifierPath = extensionPath.replace(/\\/g, "/") + "/jsx/foregroundChanged.jsx";
      evalScript("colorPaletteInstallForegroundNotifier(" + quoteForJsx(notifierPath) + ")")
        .then(function (result) {
          debugLog("foreground notifier: " + result);
          if (result && result.indexOf("ERR:") === 0) {
            console.error("Install foreground notifier failed:", result);
          }
        });
    }

    window.setInterval(function () {
      readForegroundFromPS(false);
    }, 1200);

    refreshCurrentTool();
    window.setInterval(refreshCurrentTool, 800);

    startScreenSampler();

    window.addEventListener("focus", function () {
      readForegroundFromPS(true);
      refreshCurrentTool();
    });

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) {
        readForegroundFromPS(true);
        refreshCurrentTool();
      }
    });
  }

  async function refreshCurrentTool() {
    if (!hasCepBridge || applying || readingForeground || drag) {
      return;
    }

    try {
      var result = await evalScript("colorPaletteGetCurrentTool()");
      if (result && result.indexOf("ERR:") !== 0) {
        currentToolId = String(result);
      }
    } catch (error) {
    }
  }

  function toolLooksLikeEyedropper(toolId) {
    var tool = String(toolId || "").toLowerCase();
    return tool.indexOf("eyedropper") !== -1 ||
      tool.indexOf("eye dropper") !== -1 ||
      tool.indexOf("eyed") !== -1 ||
      tool === "eyedroppertool";
  }

  function isEyedropperPreview(activeAlt, activeI) {
    return toolLooksLikeEyedropper(currentToolId) || activeAlt || activeI || !currentToolId;
  }

  function startScreenSampler() {
    if (!hasCepBridge || typeof require !== "function" || screenSamplerProcess) {
      return;
    }

    try {
      var childProcess = require("child_process");
      var path = require("path");
      var nodeFs = require("fs");
      var rawExtPath = csInterface.getSystemPath(SystemPath.EXTENSION);
      var extensionPath = toOsPath(rawExtPath);
      var samplerPath = path.join(extensionPath, "bin", "screenSampler.ps1");
      debugLog("sampler path raw=" + rawExtPath + " | norm=" + samplerPath + " | exists=" + nodeFs.existsSync(samplerPath));
      var buffer = "";

      screenSamplerProcess = childProcess.spawn(
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", samplerPath],
        { windowsHide: true }
      );

      debugLog("screen sampler started pid=" + screenSamplerProcess.pid + " path=" + samplerPath);
      startSampleFlushLoop();

      screenSamplerProcess.stdout.on("data", function (chunk) {
        buffer += chunk.toString();
        var lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";

        lines.forEach(function (line) {
          var match = /^(\d+),(\d+),(\d+),([01]),([01]),(-?\d+),(-?\d+)$/.exec(line);
          if (!match) {
            return;
          }

          var altDown = match[4] === "1";
          var iDown = match[5] === "1";
          if (!isEyedropperPreview(altDown, iDown)) {
            var rejectedAt = Date.now();
            if (rejectedAt - lastSamplerDebugAt > 1000) {
              debugLog("sample rejected tool=" + currentToolId + " line=" + line);
              lastSamplerDebugAt = rejectedAt;
            }
            return;
          }

          var acceptedAt = Date.now();
          if (acceptedAt - lastSamplerDebugAt > 1000) {
            debugLog("sample accepted tool=" + currentToolId + " line=" + line);
            lastSamplerDebugAt = acceptedAt;
          }

          // 不在 node 回调里直接 render,改为暂存,交给浏览器定时器刷新(见 startSampleFlushLoop)
          lastSampleAt = acceptedAt;
          pendingSample = {
            r: parseInt(match[1], 10),
            g: parseInt(match[2], 10),
            b: parseInt(match[3], 10)
          };
        });
      });

      screenSamplerProcess.on("exit", function () {
        debugLog("screen sampler exited");
        screenSamplerProcess = null;
      });

      window.addEventListener("beforeunload", function () {
        if (screenSamplerProcess) {
          screenSamplerProcess.kill();
          screenSamplerProcess = null;
        }
      });
    } catch (error) {
      debugLog("screen sampler error: " + error);
      console.error("Start screen sampler failed:", error);
    }
  }

  function wireSwatches() {
    document.getElementById("applyBtn").addEventListener("click", pushColor);
    document.getElementById("swFg").addEventListener("click", pushColor);
    document.getElementById("bswCurrent").addEventListener("click", pushColor);

    function setWhite() {
      state.r = 255;
      state.g = 255;
      state.b = 255;
      syncHsvFromRgb();
      render();
      pushColor();
    }

    document.getElementById("swBg").addEventListener("click", setWhite);
    document.getElementById("bswWhite").addEventListener("click", setWhite);
  }

  function init() {
    buildRows("rowsRgb", ["r", "g", "b"]);
    buildRows("rowsHsv", ["h", "s", "v"]);
    wireSwatches();
    buildRing();
    syncRgbFromHsv();
    render();
    readForegroundFromPS(true);
    startForegroundSync();
  }

  init();
}());
