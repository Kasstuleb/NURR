// motion-export.js — NURR Motion / Web / Recipe export panel v4.
// Exports from a clean offscreen canvas using the current visible module. No source selector.

(function(){
  const { useState } = React;

  const MOTION_RATIOS = {
    landscape: { label: '16:9', w: 16, h: 9, hint: 'web / video' },
    portrait:  { label: '9:16', w: 9, h: 16, hint: 'story / reels' },
    square:    { label: '1:1', w: 1, h: 1, hint: 'feed' },
    vertical:  { label: '4:5', w: 4, h: 5, hint: 'poster crop' },
    cinema:    { label: '21:9', w: 21, h: 9, hint: 'wide backdrop' },
  };
  const MOTION_QUALITY = {
    preview:  { label: 'Preview', short: '960', long: 960, bitrate: 12000000 },
    standard: { label: 'Standard', short: 'HD', long: 1920, bitrate: 32000000 },
    high:     { label: 'High', short: '2K', long: 2560, bitrate: 55000000 },
    ultra:    { label: 'Ultra', short: '4K', long: 3840, bitrate: 95000000 },
  };
  const MOTION_STYLES = {
    drift:   { label: 'Slow drift', hint: 'gentle orbit' },
    breathe: { label: 'Breathe', hint: 'expand + shift' },
    current: { label: 'Current', hint: 'living, colour drift' },
    pulse:   { label: 'Pulse', hint: 'rhythmic energy' },
    vivid:   { label: 'Vivid', hint: 'bold colour morph' },
    still:   { label: 'Still', hint: 'near-still poster' },
  };
  const DURATIONS = [4, 8, 12, 20, 30];

  function getRecorderMime() {
    if (typeof MediaRecorder === 'undefined') return null;
    // VP9 first: in practice it is the most reliable high-quality MediaRecorder
    // path in Chrome/Edge (h264/mp4 recording is frequently unavailable or fails
    // silently at 2K/4K, producing empty files). mp4/h264 is kept as a fallback.
    const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/mp4;codecs=h264', 'video/mp4', 'video/webm'];
    const type = types.find(t => MediaRecorder.isTypeSupported(t));
    if (!type) return null;
    return { mime: type, ext: type.indexOf('mp4') !== -1 ? 'mp4' : 'webm' };
  }
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
  function canvasToBlob(canvas, type = 'image/png', quality = 0.95) {
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Canvas export failed.')), type, quality));
  }
  function getSize(ratioKey, qualityKey) {
    const r = MOTION_RATIOS[ratioKey] || MOTION_RATIOS.landscape;
    const q = MOTION_QUALITY[qualityKey] || MOTION_QUALITY.standard;
    let w, h;
    if (r.w >= r.h) { w = q.long; h = Math.round(q.long * r.h / r.w); }
    else { h = q.long; w = Math.round(q.long * r.w / r.h); }
    return { w, h, q, ratioLabel: r.label };
  }
  function currentStageDataURL() {
    const canvas = document.querySelector('canvas.stage');
    if (!canvas) return null;
    try { return canvas.toDataURL('image/png'); }
    catch (err) { return null; }
  }
  // ── Colour helpers (for palette morphing) ─────────────────────────────────
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  function hexToRgbA(hex) {
    hex = String(hex || '').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    return [parseInt(hex.slice(0, 2), 16) || 0, parseInt(hex.slice(2, 4), 16) || 0, parseInt(hex.slice(4, 6), 16) || 0];
  }
  const rgbToHexA = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  function lerpHex(a, b, t) { const A = hexToRgbA(a), B = hexToRgbA(b); return rgbToHexA(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)); }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    let h = 0, s = 0; const l = (mx + mn) / 2;
    if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)); else if (mx === g) h = ((b - r) / d + 2); else h = ((r - g) / d + 4); h *= 60; }
    return [h, s, l];
  }
  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x]; else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }
  function shiftHue(hex, deg, satMul) {
    const [r, g, b] = hexToRgbA(hex);
    const [h, s, l] = rgbToHsl(r, g, b);
    const [nr, ng, nb] = hslToRgb(h + deg, Math.min(1, s * (satMul || 1)), l);
    return rgbToHexA(nr, ng, nb);
  }

  // ── Motion Director ───────────────────────────────────────────────────────
  // Designed, deterministic camera+colour choreography. Each style is a genuinely
  // different recipe expressed as functions of loop phase p∈[0,1]: a focal-point
  // path (drives the gradient's anchor centres), an optional colour morph toward a
  // hue-shifted target palette (moves from one gradient to another and back), and
  // spread / blend / pulse modulation. The designed motion is periodic so it loops
  // seamlessly; the shader's own organic flow advances underneath at `timeRate`.
  const TAU = Math.PI * 2;
  const DIRECTOR = {
    still: {
      label: 'Still', timeRate: 0.05, morph: 0.0, hue: 34, dirAmp: 0.20,
      mouse: (ph, E) => ({ x: 0.5 + Math.cos(ph) * 0.012, y: 0.5 + Math.sin(ph) * 0.012 }),
    },
    drift: {
      label: 'Slow drift', timeRate: 0.32, morph: 0.0, hue: 34, dirAmp: 0.55,
      mouse: (ph, E) => ({ x: 0.5 + Math.cos(ph) * 0.10 * E, y: 0.5 + Math.sin(ph) * 0.09 * E }),
    },
    breathe: {
      label: 'Breathe', timeRate: 0.28, morph: 0.14, hue: 16, dirAmp: 0.65,
      mouse: (ph, E) => ({ x: 0.5 + Math.cos(ph) * 0.03 * E, y: 0.5 + Math.sin(ph) * 0.03 * E }),
      spread: (ph, E) => Math.sin(ph) * 0.16 * E,
      blend:  (ph, E) => Math.sin(ph + 1.0) * 0.10 * E,
    },
    current: {
      label: 'Current', timeRate: 0.6, morph: 0.38, hue: 30, dirAmp: 0.8,
      mouse: (ph, E) => ({ x: 0.5 + Math.cos(ph) * 0.22 * E + Math.cos(ph * 2.3) * 0.05 * E, y: 0.5 + Math.sin(ph) * 0.18 * E }),
      spread: (ph, E) => Math.sin(ph * 1.3) * 0.08 * E,
    },
    pulse: {
      label: 'Pulse', timeRate: 0.5, morph: 0.24, hue: 42, dirAmp: 0.9,
      mouse: (ph, E) => { const r = (0.10 + 0.09 * (0.5 + 0.5 * Math.sin(ph * 3))) * E; return { x: 0.5 + Math.cos(ph) * r, y: 0.5 + Math.sin(ph) * r }; },
      pulse: (ph, E) => Math.pow(0.5 + 0.5 * Math.sin(ph * 3), 2) * E,
      blend:  (ph, E) => Math.sin(ph * 3) * 0.08 * E,
    },
    vivid: {
      label: 'Vivid', timeRate: 1.05, morph: 0.92, hue: 70, sat: 1.08, dirAmp: 1.0,
      mouse: (ph, E) => ({ x: 0.5 + Math.sin(ph) * 0.30 * E, y: 0.5 + Math.sin(ph * 2 + 0.6) * 0.22 * E }),
      spread: (ph, E) => Math.sin(ph) * 0.12 * E,
      blend:  (ph, E) => Math.cos(ph * 1.5) * 0.10 * E,
    },
  };

  const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

  function directorFrame(base, target, recipe, E, p, durationSec, baseTime) {
    const ph = p * TAU;
    const curve = 0.5 - 0.5 * Math.cos(ph); // 0 → 1 → 0 (seamless)
    const dir = (base.tweaks && base.tweaks.direction) || 'organic';
    const directional = dir === 'horizontal' || dir === 'vertical';
    const A = recipe.dirAmp != null ? recipe.dirAmp : 0.6;

    const time = (baseTime || 0) + p * durationSec * recipe.timeRate;
    const m = recipe.mouse(ph, E);
    const mouse = { x: m.x, y: m.y, chaosX: m.x, chaosY: m.y };
    const pulse = recipe.pulse ? recipe.pulse(ph, E) : 0;

    const tw = Object.assign({}, base.tweaks);

    // Colour morph A→B→A. In horizontal/vertical the shader's animated anchor
    // system is inactive, so the ramp itself barely moves — palette morph +
    // spread sweep are what make those directions genuinely move, hence the floor.
    let k = (recipe.morph || 0) * E * curve;
    if (directional) k = Math.max(k, 0.5 * A * E * curve);
    if (k > 0.001 && target && Array.isArray(base.tweaks.colors)) {
      tw.colors = base.tweaks.colors.map((c, i) => lerpHex(c, target[i] || c, k));
    }

    let spreadMod = recipe.spread ? recipe.spread(ph, E) : 0;
    const blendMod = recipe.blend ? recipe.blend(ph, E) : 0;
    if (directional) {
      // Spread strongly repositions directional bands; sweeping mouseRaw along the
      // ramp's own axis slides the whole gradient. Together this reads as real flow.
      spreadMod += Math.sin(ph) * 0.26 * A * E;
      const sweep = 0.5 + Math.sin(ph) * 0.5;
      if (dir === 'horizontal') { mouse.x = sweep; mouse.chaosX = sweep; }
      else { mouse.y = sweep; mouse.chaosY = sweep; }
    }
    if (spreadMod) tw.spread = clamp01((base.tweaks.spread != null ? base.tweaks.spread : 0.62) + spreadMod);
    if (blendMod)  tw.blend  = clamp01((base.tweaks.blend  != null ? base.tweaks.blend  : 0.56) + blendMod);

    // Grain floor: a little of the shader's own pixel-scale film grain dithers the
    // 8-bit ramp so codec compression can't quantise it into visible stripes.
    tw.grain = Math.max(Number(base.tweaks.grain) || 0, 0.09);

    return { tweaks: tw, renderState: { time, mouse, pulse } };
  }

  // High-end path: render the module natively at export resolution on a
  // persistent GPU context, choreographed by the Motion Director. Crisp at any
  // quality and true designed motion — not a screen recording. If the browser's
  // encoder can't handle the requested resolution (common at 4K on software
  // encoders — it silently yields an empty file), it retries a step lower so the
  // user always gets a real video instead of a broken one.
  async function recordDirected({ engineFactory, state, ratio, quality, duration, style, energy, onProgress }) {
    const recorderType = getRecorderMime();
    if (!recorderType) throw new Error('Video recording is not supported in this browser. Try Chrome, Edge, or Chromium.');

    const recipe = DIRECTOR[style] || DIRECTOR.drift;
    const E = Math.max(0.15, Number(energy || 0.75));
    const durationSec = Math.max(1, duration);
    const baseTime = (state.renderState && state.renderState.time) || 0;
    const baseColors = (state.tweaks && Array.isArray(state.tweaks.colors)) ? state.tweaks.colors.slice() : [];
    // Always build a morph target: even the calm styles morph in horizontal /
    // vertical mode (where the ramp itself barely moves) via the directional floor.
    const target = baseColors.length ? baseColors.map(c => shiftHue(c, recipe.hue || 40, recipe.sat)) : null;

    const { w: reqW, h: reqH, q } = getSize(ratio, quality);
    const fps = 30;

    async function captureAt(w, h) {
      const eng = engineFactory(w, h);
      if (!eng || !eng.canvas) throw new Error('Could not start the render engine for this module.');
      const seed = directorFrame(state, target, recipe, E, 0, durationSec, baseTime);
      eng.draw(seed.tweaks, seed.renderState);

      const stream = eng.canvas.captureStream(fps);
      let recorder;
      try { recorder = new MediaRecorder(stream, { mimeType: recorderType.mime, videoBitsPerSecond: q.bitrate }); }
      catch (e) { recorder = new MediaRecorder(stream); }
      const chunks = [];
      let gotData = false;
      recorder.ondataavailable = ev => { if (ev.data && ev.data.size) { gotData = true; chunks.push(ev.data); } };
      const stopped = new Promise(resolve => { recorder.onstop = resolve; });

      try {
        for (let i = 0; i < 4; i++) { eng.draw(seed.tweaks, seed.renderState); await nextFrame(); }
        recorder.start(200); // emit a chunk every 200ms — lets us detect a dead encoder fast
        const started = performance.now();
        const durationMs = durationSec * 1000;
        for (;;) {
          const elapsed = performance.now() - started;
          const p = Math.min(1, elapsed / durationMs);
          const f = directorFrame(state, target, recipe, E, p, durationSec, baseTime);
          eng.draw(f.tweaks, f.renderState);
          if (onProgress) onProgress(Math.min(99, Math.round(p * 100)));
          // Fast-fail: if the encoder has produced nothing after ~1.3s, this
          // resolution is unsupported here — abort now and let the caller step
          // down, instead of making the user wait out the whole duration.
          if (elapsed > 1300 && !gotData) break;
          if (elapsed >= durationMs) break;
          await nextFrame();
        }
        if (recorder.state !== 'inactive') recorder.stop();
        // Safety net: a few software/headless encoders never fire onstop even
        // after stop() returns, which would otherwise leave the export pinned at
        // 99% forever. Prefer the natural stop, but never wait more than 8s —
        // start(200) has been flushing chunks every 200ms, so what we already
        // hold is playable. 8s is generous enough not to truncate a slow but
        // valid finalize on real hardware, where onstop normally fires in <1s.
        await Promise.race([stopped, new Promise(r => setTimeout(r, 8000))]);
      } finally {
        stream.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });
      }

      if (!chunks.length) { if (eng.dispose) eng.dispose(); return null; }
      const poster = await canvasToBlob(eng.canvas, 'image/png');
      if (eng.dispose) eng.dispose();
      return { blob: new Blob(chunks, { type: recorderType.mime.split(';')[0] }), poster, width: w, height: h };
    }

    // Try the requested resolution, then fall back down the ladder if the encoder
    // returns nothing. Preserves aspect ratio at each step; the last rungs are low
    // enough that even a software encoder yields a real file.
    const ladder = [1, 0.6667, 0.5, 0.3333, 0.25]
      .map(s => ({ w: Math.round(reqW * s / 2) * 2, h: Math.round(reqH * s / 2) * 2 }))
      .filter((v, i, a) => v.w >= 640 && a.findIndex(o => o.w === v.w) === i);
    let out = null, used = null;
    for (const s of ladder) {
      out = await captureAt(s.w, s.h);
      if (out) { used = s; break; }
    }
    if (!out) throw new Error('The browser returned an empty video at every resolution. Try another browser (Chrome or Edge recommended).');

    return {
      blob: out.blob, poster: out.poster, width: out.width, height: out.height,
      mime: recorderType.mime, ext: recorderType.ext,
      downscaled: !!(used && (used.w !== reqW))
    };
  }

  // Fallback path: modules without a native motion renderer are captured live
  // off the stage and composited to the chosen aspect + resolution.
  function coverFit(ctx, src, W, H) {
    const sw = src.width || src.naturalWidth || 0;
    const sh = src.height || src.naturalHeight || 0;
    if (!sw || !sh) { ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, W, H); return; }
    const scale = Math.max(W / sw, H / sh);
    const dw = sw * scale, dh = sh * scale;
    ctx.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }
  const STYLE_SPEED = { still: 0.30, drift: 0.62, breathe: 0.72, current: 1.0, pulse: 1.45, vivid: 1.9 };

  async function recordLive({ ratio, quality, duration, style, energy, onProgress }) {
    const recorderType = getRecorderMime();
    if (!recorderType) throw new Error('Video recording is not supported in this browser. Try Chrome, Edge, or Chromium.');
    const stage = document.querySelector('canvas.stage');
    if (!stage) throw new Error('No source found. Switch to a visual module first.');
    const { w, h, q } = getSize(ratio, quality);
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const ctx = out.getContext('2d', { alpha: false });
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    const paint = () => coverFit(ctx, stage, w, h);
    paint();
    const stream = out.captureStream(30);
    let recorder;
    try { recorder = new MediaRecorder(stream, { mimeType: recorderType.mime, videoBitsPerSecond: q.bitrate }); }
    catch (e) { recorder = new MediaRecorder(stream); }
    const chunks = [];
    recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise(resolve => { recorder.onstop = resolve; });
    const prevSpeed = (typeof window.__NURR_SPEED === 'number') ? window.__NURR_SPEED : 1.0;
    window.__NURR_SPEED = Math.max(0.15, (STYLE_SPEED[style] || 0.8) * (0.5 + Number(energy || 0.75)));
    try {
      for (let i = 0; i < 6; i++) { paint(); await nextFrame(); }
      recorder.start(200);
      const started = performance.now();
      const durationMs = Math.max(1000, duration * 1000);
      for (;;) {
        const elapsed = performance.now() - started;
        paint();
        if (onProgress) onProgress(Math.min(99, Math.round((elapsed / durationMs) * 100)));
        if (elapsed >= durationMs) break;
        await nextFrame();
      }
      if (recorder.state !== 'inactive') recorder.stop();
      await stopped;
    } finally {
      window.__NURR_SPEED = prevSpeed;
      stream.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });
    }
    if (!chunks.length) throw new Error('The browser returned an empty video. Try a lower quality or another browser.');
    paint();
    return { blob: new Blob(chunks, { type: recorderType.mime.split(';')[0] }), poster: await canvasToBlob(out, 'image/png'), width: w, height: h, mime: recorderType.mime, ext: recorderType.ext };
  }

  // Pick the best engine for the active module.
  function engineFor(mode) {
    if (mode === 'gradient' && typeof window.NurrGradientMotion === 'function' && typeof window.NurrGradientLiveState === 'function') {
      const state = window.NurrGradientLiveState();
      if (state && state.tweaks && Array.isArray(state.tweaks.colors)) {
        return { factory: window.NurrGradientMotion, state };
      }
    }
    return null;
  }

  async function record({ mode, ratio, quality, duration, style, energy, onProgress }) {
    const eng = engineFor(mode);
    if (eng) return recordDirected({ engineFactory: eng.factory, state: eng.state, ratio, quality, duration, style, energy, onProgress });
    return recordLive({ ratio, quality, duration, style, energy, onProgress });
  }

  async function webZip(result, recipe) {
    const zip = new JSZip();
    const videoName = 'nurr-loop.' + (result.ext || 'webm');
    zip.file(videoName, result.blob);
    zip.file('poster.png', result.poster);
    zip.file('recipe.json', JSON.stringify(recipe, null, 2));
    zip.file('nurr-backdrop.css', `html,body{margin:0;min-height:100%;background:#050505;}
#nurr-backdrop{position:fixed;inset:0;overflow:hidden;background:#050505 url(./poster.png) center/cover no-repeat;}
#nurr-backdrop video{width:100%;height:100%;object-fit:cover;display:block;}
@media (prefers-reduced-motion: reduce){#nurr-backdrop video{display:none;}}
`);
    zip.file('nurr-backdrop.js', `(() => {
  const root = document.getElementById('nurr-backdrop');
  if (!root) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const video = document.createElement('video');
  video.src = './${videoName}';
  video.poster = './poster.png';
  video.autoplay = true;
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  root.appendChild(video);
  document.addEventListener('visibilitychange', () => {
    document.hidden ? video.pause() : video.play().catch(() => {});
  });
})();
`);
    zip.file('index.html', `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>NURR backdrop</title><link rel="stylesheet" href="./nurr-backdrop.css"/></head>
<body><div id="nurr-backdrop"></div><script src="./nurr-backdrop.js"></script></body>
</html>
`);
    return zip.generateAsync({ type: 'blob' });
  }

  function MotionExportControls({ library = [], currentMode = 'current' }) {
    const [ratio, setRatio] = useState('landscape');
    const [quality, setQuality] = useState('standard');
    const [duration, setDuration] = useState(8);
    const [style, setStyle] = useState('drift');
    const [energy, setEnergy] = useState(0.75);
    const [progress, setProgress] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [done, setDone] = useState(null);

    const getSource = () => ({ data: currentStageDataURL(), label: currentMode });
    const makeRecipe = () => {
      const size = getSize(ratio, quality);
      return {
        nurrVersion: 'motion-export-mvp-04',
        source: `current:${currentMode}`,
        ratio: size.ratioLabel,
        width: size.w,
        height: size.h,
        quality: MOTION_QUALITY[quality].label,
        duration,
        motion: style,
        energy: Number(energy.toFixed(2)),
        createdAt: new Date().toISOString()
      };
    };
    const run = async (kind) => {
      setError(null); setDone(null); setBusy(true); setProgress(0);
      try {
        const src = getSource();
        if (!src.data) throw new Error('No source found. Save a snapshot or switch to a visual module.');
        const recipe = makeRecipe();
        if (kind === 'recipe') {
          downloadBlob(new Blob([JSON.stringify(recipe, null, 2)], { type: 'application/json' }), `nurr-recipe-${Date.now()}.json`);
          setDone('Recipe JSON downloaded.');
          return;
        }
        const result = await record({ mode: currentMode, ratio, quality, duration, style, energy, onProgress: setProgress });
        if (kind === 'web') {
          if (!window.JSZip) throw new Error('JSZip is missing, so the web package cannot be created.');
          const zip = await webZip(result, recipe);
          downloadBlob(zip, `nurr-web-backdrop-${recipe.ratio.replace(':','x')}-${Date.now()}.zip`);
          setDone('Web backdrop package downloaded.');
        } else {
          downloadBlob(result.blob, `nurr-motion-${recipe.ratio.replace(':','x')}-${duration}s-${style}-${result.width}x${result.height}-${Date.now()}.${result.ext || 'webm'}`);
          const dims = `${result.width}×${result.height}`;
          setDone(result.downscaled
            ? `${(result.ext || 'webm').toUpperCase()} loop downloaded at ${dims} (the browser couldn't encode the full 4K, so it stepped down).`
            : `${(result.ext || 'webm').toUpperCase()} loop downloaded at ${dims}.`);
        }
      } catch (err) { setError(err.message || String(err)); }
      finally { setBusy(false); setProgress(100); }
    };

    return (
      <div className="motion-export-tab">
        <div className="motion-export-brief"><strong>Motion assets</strong><span>Designed, high-resolution motion rendered offscreen from the active visual — a choreographed loop, not a screen recording.</span></div>
        <div className="motion-grid motion-ratios">{Object.entries(MOTION_RATIOS).map(([key,r])=><button key={key} className={'motion-chip'+(ratio===key?' active':'')} onClick={()=>setRatio(key)} disabled={busy}><strong>{r.label}</strong><span>{r.hint}</span></button>)}</div>
        <div className="motion-grid motion-styles">{Object.entries(MOTION_STYLES).map(([key,m])=><button key={key} className={'motion-chip'+(style===key?' active':'')} onClick={()=>setStyle(key)} disabled={busy}><strong>{m.label}</strong><span>{m.hint}</span></button>)}</div>
        <div className="motion-inline-controls"><div className="motion-field"><label>Duration</label><select value={duration} onChange={e=>setDuration(Number(e.target.value))} disabled={busy}>{DURATIONS.map(d=><option key={d} value={d}>{d}s</option>)}</select></div><div className="motion-field"><label>Quality</label><select value={quality} onChange={e=>setQuality(e.target.value)} disabled={busy}>{Object.entries(MOTION_QUALITY).map(([k,q])=><option key={k} value={k}>{q.label} · {q.short}</option>)}</select></div><div className="motion-field"><label>Energy <span>{Math.round(energy*100)}%</span></label><input type="range" min="0.15" max="1" step="0.01" value={energy} onChange={e=>setEnergy(Number(e.target.value))} disabled={busy}/></div></div>
        {busy && <div className="motion-progress"><div style={{width:progress+'%'}} /></div>}
        {error && <div className="vid-error">{error}</div>}
        {done && <div className="vid-done">✓ {done}</div>}
        <div className="vid-hint">Web package includes video, poster frame, CSS, JS, demo HTML and recipe JSON. Records the real animated visual straight off the render engine, composited to the chosen aspect and resolution.</div>
        <div className="motion-actions"><button className="btn primary btn-italic" onClick={()=>run('video')} disabled={busy}>Export video loop ↓</button><button className="btn btn-italic" onClick={()=>run('web')} disabled={busy}>Export web package ↓</button><button className="btn" onClick={()=>run('recipe')} disabled={busy}>Recipe JSON</button></div>
        <div className="vid-hint">Motion style and energy set the live animation speed while recording. Static modules export a still frame.</div>
      </div>
    );
  }

  window.MotionExportControls = MotionExportControls;
})();
