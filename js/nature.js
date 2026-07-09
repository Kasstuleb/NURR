// nature.js — Mode 3: Photo mode. WebGL rewrite.
// Replaces the old Canvas 2D photo renderer. Exposes: window.NatureMode, window.NatureControls, window.NATURE_DEFAULTS

const { useEffect: nmUE, useRef: nmUR, useState: nmUS } = React;

const NATURE_FS = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2  u_resolution;
uniform vec2  u_imgSize;
uniform vec2  u_mouse;
uniform vec2  u_mouseRaw;
uniform float u_time;
uniform float u_strength;
uniform float u_blur;
uniform float u_split;
uniform float u_clickPulse;
uniform float u_hue;
uniform float u_sat;
uniform float u_contrast;
uniform float u_grain;
uniform float u_vignette;
uniform int   u_effect;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float hash21(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float nymphFilmGrain(vec2 fragCoord, float seed, float amount, float lum){
  float amt = clamp(amount, 0.0, 1.0);
  if (amt <= 0.0001) return 0.0;

  // Non-linear response: the low end stays polite, the upper end finally has bite.
  float strength = pow(amt, 0.72);

  // Resolution-independent grain. Lock the grain cell to a fixed count across
  // the SHORT edge, so the tooth reads identically in the live preview and in
  // every export size / aspect ratio. Previously grain was floor(fragCoord) —
  // one cell per device pixel — which made it vanish at 2K and change size
  // between aspect ratios.
  float grainPx = 900.0 / max(min(u_resolution.x, u_resolution.y), 1.0);
  vec2 px = floor(fragCoord * grainPx);

  // Two independent fine layers.
  float a = hash21(px + vec2(seed * 197.13 + 11.7, seed * 43.73 + 5.1));
  float b = hash21(px * 1.37 + vec2(71.0 + seed * 51.7, 613.3 + seed * 23.1));
  float fine = a + b - 1.0;
  fine = sign(fine) * pow(abs(fine), 0.82);

  // Sparse salt / pepper gives the surface grit instead of smooth digital haze.
  float saltR   = hash21(px * 2.11 + vec2(seed * 911.7 + 17.0, 29.0));
  float pepperR = hash21(px * 0.73 + vec2(seed * 421.9 + 109.0, 349.0));
  float salt    = step(0.992 - strength * 0.045, saltR);
  float pepper  = step(0.994 - strength * 0.038, pepperR);
  float speck   = salt * 0.85 - pepper * 0.75;

  // Protect highlights from dirty grey while letting mids/darks carry texture.
  float tonal = mix(0.78, 1.12, smoothstep(0.04, 0.62, lum));
  tonal *= mix(1.0, 0.58, smoothstep(0.82, 1.0, lum));

  return (fine * 0.115 + speck * 0.105) * strength * tonal;
}


vec2 coverUV(vec2 uv){
  float vAR = u_resolution.x / u_resolution.y;
  float iAR = u_imgSize.x / u_imgSize.y;
  vec2 scale = vAR > iAR ? vec2(1.0, iAR/vAR) : vec2(vAR/iAR, 1.0);
  return (uv - 0.5) * scale + 0.5;
}

vec3 applyColor(vec3 c){
  float a = u_hue * 6.28318;
  float ca = cos(a), sa = sin(a);
  vec3 lumAxis = normalize(vec3(0.299, 0.587, 0.114));
  vec3 col = c * ca + cross(lumAxis, c) * sa + lumAxis * dot(lumAxis, c) * (1.0 - ca);
  vec3 gray = vec3(dot(col, vec3(0.299,0.587,0.114)));
  col = mix(gray, col, u_sat);
  col = (col - 0.5) * u_contrast + 0.5;
  return col;
}

vec3 sampleImage(vec2 uv){
  return texture2D(u_tex, coverUV(clamp(uv, 0.001, 0.999))).rgb;
}

void main(){
  vec2 uv = v_uv;
  vec2 toM = uv - u_mouseRaw;
  float dm = length(toM);
  float wide = exp(-dm * dm * 4.2);
  float pulse = u_clickPulse * exp(-dm * dm * 2.8);
  vec3 col;

  if (u_effect == 0) {
    float swirl = (u_strength * 2.8 + pulse * 1.4) * wide;
    float ang = swirl * 2.2;
    mat2 R = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
    vec2 d = R * toM - toM;
    float push = (u_strength * 0.12 + pulse * 0.06) * wide;
    vec2 disp = d * 0.65 + normalize(toM + 0.0001) * (-push);
    col = sampleImage(uv + disp);

  } else if (u_effect == 1) {
    float radius = (u_blur * 0.55 + pulse * 0.35) * wide * 0.065 + u_blur * 0.007;
    vec3 acc = vec3(0.0); float tw = 0.0;
    for(int i=-4;i<=4;i++){
      for(int j=-4;j<=4;j++){
        vec2 off = vec2(float(i),float(j)) * radius * 0.46;
        float k = exp(-float(i*i+j*j) * 0.38);
        acc += sampleImage(uv + off) * k;
        tw += k;
      }
    }
    col = acc / tw;

  } else if (u_effect == 2) {
    float amt = (u_split * 0.85 + pulse * 0.55) * wide * 0.046 + 0.0008;
    vec2 dir = normalize(toM + 0.0001);
    col.r = sampleImage(uv - dir * amt * 1.0).r;
    col.g = sampleImage(uv + dir * amt * 0.1).g;
    col.b = sampleImage(uv + dir * amt * 1.0).b;

  } else if (u_effect == 3) {
    float n = sin(uv.x * 16.0 + u_time * 0.65) * 0.42 + 0.5;
    float warp = (u_strength * 1.6 + pulse) * wide * 0.26 * n;
    float sway = (u_mouse.x - 0.5) * u_strength * 0.04 * wide;
    col = sampleImage(uv + vec2(sway, warp));

  } else {
    col = sampleImage(uv);
    vec2 cell = uv * u_resolution / max(u_resolution.x,u_resolution.y) * (12.0 + u_strength * 14.0);
    vec2 fr = fract(cell) - 0.5;
    float ring = 1.0 - smoothstep(0.18, 0.5, length(fr));
    float h2 = hash(floor(cell));
    float glow = (u_strength * 0.55 + pulse * 0.5) * ring * max(0.0, 1.0 - dm * 3.0) * h2;
    col += glow * vec3(0.95, 0.88, 0.72);
    col = mix(col, col * 1.06, wide * u_strength * 0.5);
  }

  col = applyColor(col);

  if (u_grain > 0.0) {
    float lumG = dot(col, vec3(0.299,0.587,0.114));
    col += vec3(nymphFilmGrain(gl_FragCoord.xy, 0.731, u_grain, lumG));
  }

  float vg = smoothstep(1.35, 0.12, length(uv - 0.5));
  col *= mix(1.0 - u_vignette * 0.68, 1.0, vg);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

function imgToTexture(gl, img) {
  const tc = document.createElement('canvas');
  const scale = Math.min(1, 4096 / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  tc.width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
  tc.height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
  const ctx = tc.getContext('2d', { willReadFrequently:false });
  ctx.drawImage(img, 0, 0, tc.width, tc.height);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tc);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return { tex, w: tc.width, h: tc.height };
}

// ── Offscreen high-res Photo export renderer ────────────────────────────────
// Renders Photo mode natively at the exact requested export resolution on a
// throwaway canvas/WebGL context, independent of whatever module is currently
// mounted. Loads the saved source image at full resolution and re-applies the
// exact saved effect / colour / grain from the frozen renderState, so the
// Export panel produces a sharp full-res file instead of upscaling the small
// Library preview (the old cause of soft / low-res Photo exports). Returns a
// Promise so app.js can await the image decode.
const _natureImgCache = {};
function loadNatureImage(src) {
  if (_natureImgCache[src]) return Promise.resolve(_natureImgCache[src]);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { _natureImgCache[src] = img; resolve(img); };
    img.onerror = reject;
    if (/^https?:\/\//i.test(src)) img.crossOrigin = 'anonymous';
    img.src = src;
  });
}
function renderNatureOffscreen(tweaks, renderState, width, height, extra = {}) {
  const src = extra.currentImg;
  if (!src) return Promise.resolve(null);
  const w = Math.max(1, Math.round(width) || 1920);
  const h = Math.max(1, Math.round(height) || 1080);
  const T = tweaks || {};
  const rs = renderState || {};
  return loadNatureImage(src).then((img) => {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false });
    if (!gl) return null;
    const prog = WP.compileProgram(gl, WP.VS_FULLSCREEN, NATURE_FS);
    if (!prog) return null;
    gl.useProgram(prog);
    WP.createQuadGeometry(gl, prog);
    const names = ['u_tex','u_resolution','u_imgSize','u_mouse','u_mouseRaw','u_time','u_strength','u_blur','u_split','u_clickPulse','u_hue','u_sat','u_contrast','u_grain','u_vignette','u_effect'];
    const u = {}; names.forEach(n => { u[n] = gl.getUniformLocation(prog, n); });
    const upload = imgToTexture(gl, img);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, upload.tex);

    const m = rs.mouse || { x:0.5, y:0.5, chaosX:0.5, chaosY:0.5 };
    const time = Number.isFinite(rs.time) ? rs.time : 0;
    const pulse = Number.isFinite(rs.pulse) ? rs.pulse : 0;
    const effectMap = { warp:0, blur:1, split:2, melt:3, nodes:4 };
    const effectIdx = effectMap[T.effect] ?? 0;
    const strength = T.effect === 'blur' ? T.blur : T.effect === 'split' ? T.split : T.warp;

    gl.viewport(0, 0, w, h);
    gl.uniform1i(u.u_tex, 0);
    gl.uniform2f(u.u_resolution, w, h);
    gl.uniform2f(u.u_imgSize, upload.w, upload.h);
    gl.uniform2f(u.u_mouse, (m.chaosX ?? m.x ?? 0.5), 1 - (m.chaosY ?? m.y ?? 0.5));
    gl.uniform2f(u.u_mouseRaw, (m.x ?? 0.5), 1 - (m.y ?? 0.5));
    gl.uniform1f(u.u_time, time);
    gl.uniform1f(u.u_strength, strength ?? 0.45);
    gl.uniform1f(u.u_blur, T.blur ?? 0.5);
    gl.uniform1f(u.u_split, T.split ?? 0.55);
    gl.uniform1f(u.u_clickPulse, pulse);
    gl.uniform1f(u.u_hue, T.hue ?? 0);
    gl.uniform1f(u.u_sat, T.sat ?? 1.0);
    gl.uniform1f(u.u_contrast, T.contrast ?? 1.0);
    gl.uniform1f(u.u_grain, T.grain ?? 0.04);
    gl.uniform1f(u.u_vignette, T.vignette ?? 0.22);
    gl.uniform1i(u.u_effect, effectIdx);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    const dataUrl = canvas.toDataURL('image/png');
    gl.deleteTexture(upload.tex);
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return dataUrl;
  }).catch(() => null);
}
window.NurrNatureRenderToDataURL = renderNatureOffscreen;

function NatureMode({ tweaks, registerSnapshot, mouseRef, currentImg }) {
  const canvasRef = nmUR(null);
  const glRef = nmUR(null);
  const progRef = nmUR(null);
  const uniRef = nmUR({});
  const texRef = nmUR(null);
  const imgDimRef = nmUR({ w:1, h:1 });
  const stateRef = nmUR({ pulse:0, frozen:false, frozenMouse:null, frozenTime:null, mouseLocked:false, lockedMouse:null, clickTimer:null, t:0 });
  const [loaded, setLoaded] = nmUS(false);

  WP.useStageSize(canvasRef);

  nmUE(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer:true, antialias:false });
    if (!gl) { console.error('WebGL not available'); return; }
    glRef.current = gl;
    const prog = WP.compileProgram(gl, WP.VS_FULLSCREEN, NATURE_FS);
    if (!prog) return;
    progRef.current = prog;
    gl.useProgram(prog);
    WP.createQuadGeometry(gl, prog);
    const names = ['u_tex','u_resolution','u_imgSize','u_mouse','u_mouseRaw','u_time','u_strength','u_blur','u_split','u_clickPulse','u_hue','u_sat','u_contrast','u_grain','u_vignette','u_effect'];
    const u = {};
    names.forEach(n => { u[n] = gl.getUniformLocation(prog, n); });
    uniRef.current = u;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([8,1,95,255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    texRef.current = tex;
  }, []);

  nmUE(() => {
    const gl = glRef.current;
    if (!currentImg) { setLoaded(false); return; }
    if (!gl) return;
    setLoaded(false);
    const img = new Image();
    img.onload = () => {
      const activeGl = glRef.current;
      if (!activeGl) return;
      try {
        const result = imgToTexture(activeGl, img);
        if (texRef.current) activeGl.deleteTexture(texRef.current);
        texRef.current = result.tex;
        imgDimRef.current = { w: result.w, h: result.h };
        setLoaded(true);
      } catch (err) {
        console.error('Texture upload failed:', err);
        setLoaded(false);
      }
    };
    img.onerror = () => { console.warn('Failed to load:', currentImg); setLoaded(false); };
    // Do not set crossOrigin for local relative images. It can break file:// testing in Safari.
    if (/^https?:\/\//i.test(currentImg)) img.crossOrigin = 'anonymous';
    img.src = currentImg;
  }, [currentImg, glRef.current]);

  nmUE(() => {
    const isInterfaceEvent = (e) => !!(e.target && e.target.closest && e.target.closest('.panel,.icon-btn,.rail,.layout-card,.palette-card,.nature-thumb,.swatch,.color-wheel-card,.eyedropper-follow,.abstract-form-btn,button,input,select,textarea,label,.drop-zone,.nymph-landing'));
    const mouseNow = () => {
      const live = mouseRef?.current || { x:.5, y:.5, chaosX:.5, chaosY:.5 };
      return { x: live.x ?? .5, y: live.y ?? .5, chaosX: live.chaosX ?? live.x ?? .5, chaosY: live.chaosY ?? live.y ?? .5 };
    };
    const onClick = (e) => {
      if (isInterfaceEvent(e)) return;
      const st = stateRef.current;
      if (st.clickTimer) clearTimeout(st.clickTimer);
      st.clickTimer = setTimeout(() => {
        st.pulse = 1.0;
        st.frozen = !st.frozen;
        if (st.frozen) { st.frozenMouse = mouseNow(); st.frozenTime = performance.now() / 1000; }
        else { st.frozenMouse = null; st.frozenTime = null; }
        st.clickTimer = null;
      }, 210);
    };
    const onDoubleClick = (e) => {
      if (isInterfaceEvent(e)) return;
      const st = stateRef.current;
      if (st.clickTimer) { clearTimeout(st.clickTimer); st.clickTimer = null; }
      st.mouseLocked = !st.mouseLocked;
      st.lockedMouse = st.mouseLocked ? mouseNow() : null;
      // Double click only locks/unlocks cursor tracking; it returns the photo effect to live motion.
      st.frozen = false;
      st.frozenMouse = null;
      st.frozenTime = null;
      st.pulse = 0;
      e.preventDefault();
    };
    window.addEventListener('click', onClick);
    window.addEventListener('dblclick', onDoubleClick);
    return () => {
      window.removeEventListener('click', onClick);
      window.removeEventListener('dblclick', onDoubleClick);
      if (stateRef.current.clickTimer) clearTimeout(stateRef.current.clickTimer);
    };
  }, []);

  const readRenderState = (override) => {
    if (override) return override;
    const st = stateRef.current;
    const mNow = st.frozen && st.frozenMouse
      ? st.frozenMouse
      : (st.mouseLocked && st.lockedMouse ? st.lockedMouse : (mouseRef?.current || { x:.5, y:.5, chaosX:.5, chaosY:.5 }));
    const tNow = st.frozen && st.frozenTime != null ? st.frozenTime : (window.__NURR_T ?? performance.now() / 1000);
    return { mouse: { x:mNow.x, y:mNow.y, chaosX:mNow.chaosX ?? mNow.x, chaosY:mNow.chaosY ?? mNow.y }, time:tNow, pulse: st.pulse || 0 };
  };

  const drawAt = (targetW, targetH, opts = {}) => {
    const gl = glRef.current;
    const prog = progRef.current;
    const u = uniRef.current;
    if (!gl || !prog || !texRef.current) return;
    gl.viewport(0, 0, targetW, targetH);
    gl.useProgram(prog);
    const T = opts.tweaksOverride || tweaks;
    const rs = readRenderState(opts.renderStateOverride || opts.renderState || null);
    const m = rs.mouse || { x:.5, y:.5, chaosX:.5, chaosY:.5 };
    const t = Number.isFinite(rs.time) ? rs.time : 0;
    const effectMap = { warp:0, blur:1, split:2, melt:3, nodes:4 };
    const effectIdx = effectMap[T.effect] ?? 0;
    const strength = T.effect === 'blur' ? T.blur : T.effect === 'split' ? T.split : T.warp;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texRef.current);
    gl.uniform1i(u.u_tex, 0);
    gl.uniform2f(u.u_resolution, targetW, targetH);
    gl.uniform2f(u.u_imgSize, imgDimRef.current.w, imgDimRef.current.h);
    gl.uniform2f(u.u_mouse, (m.chaosX ?? m.x ?? .5), 1 - (m.chaosY ?? m.y ?? .5));
    gl.uniform2f(u.u_mouseRaw, (m.x ?? .5), 1 - (m.y ?? .5));
    gl.uniform1f(u.u_time, t);
    gl.uniform1f(u.u_strength, strength ?? 0.45);
    gl.uniform1f(u.u_blur, T.blur ?? 0.5);
    gl.uniform1f(u.u_split, T.split ?? 0.55);
    gl.uniform1f(u.u_clickPulse, rs.pulse || 0);
    gl.uniform1f(u.u_hue, T.hue ?? 0);
    gl.uniform1f(u.u_sat, T.sat ?? 1.0);
    gl.uniform1f(u.u_contrast, T.contrast ?? 1.0);
    gl.uniform1f(u.u_grain, T.grain ?? 0.04);
    gl.uniform1f(u.u_vignette, T.vignette ?? 0.22);
    gl.uniform1i(u.u_effect, effectIdx);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  WP.useAnimationLoop((t, dt) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    stateRef.current.t += dt;
    stateRef.current.pulse *= Math.exp(-dt * 1.55);
    drawAt(canvas.width, canvas.height);
  });

  nmUE(() => {
    registerSnapshot((opts = {}) => {
      const canvas = canvasRef.current;
      if (!canvas || !loaded) return null;
      const w = Math.max(1, Math.round(opts.width || canvas.width || 3840));
      const h = Math.max(1, Math.round(opts.height || canvas.height || 2160));
      const renderState = readRenderState(opts.renderStateOverride || opts.renderState || null);

      // Safari was producing striped / repeated exports when we temporarily
      // resized the live WebGL canvas for snapshot capture. Keep the on-screen
      // canvas untouched: render one fresh live frame at its current size,
      // then resample that bitmap into a separate 2D canvas for the Library
      // preview. Final Export panel files are rendered natively through the
      // dedicated offscreen renderer in app.js.
      drawAt(canvas.width, canvas.height, { renderStateOverride: renderState, tweaksOverride: opts.tweaksOverride });
      const out = document.createElement('canvas');
      out.width = w; out.height = h;
      const ctx = out.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(canvas, 0, 0, w, h);
      const dataUrl = out.toDataURL('image/png');
      if (!opts.returnDataUrl) WP.downloadCanvas(out, opts.filename || `photo-${w}x${h}-${Date.now()}.png`);
      // Freeze the exact interaction + exact current controls behind this save.
      if (opts.captureRenderState) {
        return { dataUrl, renderState, tweaks: JSON.parse(JSON.stringify(opts.tweaksOverride || tweaks)) };
      }
      return dataUrl;
    });
  }, [tweaks, registerSnapshot, loaded]);

  return <canvas ref={canvasRef} className="stage nature-stage" style={{ opacity: loaded ? 1 : 0.35, transition:'opacity 0.35s ease' }} />;
}

function NatureControls({ tweaks, setTweaks, natureImages, currentImg, setCurrentImg, onFiles }) {
  const inputRef = nmUR(null);
  const [dragOver, setDragOver] = nmUS(false);
  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length) onFiles(files);
  };
  const strengthKey = tweaks.effect === 'blur' ? 'blur' : tweaks.effect === 'split' ? 'split' : 'warp';
  return (
    <>
      <div className="section">
        <div className="section-label"><span className="name">Effect</span><span className="value">mouse-driven</span></div>
        <div className="seg">
          {['warp','blur','split','melt','nodes'].map(e => (
            <button key={e} className={'seg-opt' + (tweaks.effect === e ? ' active' : '')} onClick={() => setTweaks({ effect:e })}>{e}</button>
          ))}
        </div>
      </div>
      <div className="section">
        <div className="section-label"><span className="name">Strength</span><span className="value">{Math.round(tweaks[strengthKey] * 100)}</span></div>
        <input className="slider" type="range" min="0" max="1" step="0.01" value={tweaks[strengthKey]} onChange={e => setTweaks({ [strengthKey]:parseFloat(e.target.value) })} />
      </div>
      {[
        ['hue','Hue',-0.5,0.5,v => Math.round(v*360)+'°'],
        ['sat','Saturation',0,2.2,v => v.toFixed(2)],
        ['contrast','Contrast',0.4,1.9,v => v.toFixed(2)],
        ['grain','Grain',0,1,v => Math.round(v*100)],
        ['vignette','Vignette',0,1,v => Math.round(v*100)],
      ].map(([k,label,min,max,fmt]) => (
        <div className="section" key={k}>
          <div className="section-label"><span className="name">{label}</span><span className="value">{fmt(tweaks[k])}</span></div>
          <input className="slider" type="range" min={min} max={max} step="0.01" value={tweaks[k]} onChange={e => setTweaks({ [k]:parseFloat(e.target.value) })} />
        </div>
      ))}
      <div className="section">
        <div className="section-label"><span className="name">Images</span><span className="value">{natureImages.length > 0 ? `${natureImages.length} loaded` : 'none yet'}</span></div>
        {natureImages.length > 0 && (
          <div className="nature-grid">
            {natureImages.map((url, i) => (
              <button key={i} className={'nature-thumb' + (url === currentImg ? ' active' : '')} onClick={() => setCurrentImg(url)}>
                <img src={url} alt="" />
              </button>
            ))}
          </div>
        )}
        <div className={'drop-zone' + (dragOver ? ' dragover' : '')} onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={onDrop} onClick={() => inputRef.current?.click()}>
          <strong>Add photos</strong><br />Drag here or click — works immediately.
          <input ref={inputRef} type="file" accept="image/*" multiple style={{ display:'none' }} onChange={e => { onFiles(Array.from(e.target.files)); e.target.value = ''; }} />
        </div>
        <div className="folder-widget">
          <div className="folder-title">Permanent library</div>
          <p>Drop files in <code>nature/</code> + add to <code>nature/manifest.json</code>:</p>
          <code>["01.jpg", "02.jpg"]</code>
        </div>
      </div>
      <div className="help">Move cursor over image — all effects respond live. Click for a pulse.</div>
    </>
  );
}

window.NatureMode = NatureMode;
window.NatureControls = NatureControls;
window.NATURE_DEFAULTS = {
  effect:'warp', warp:0.45, blur:0.50, split:0.55,
  hue:0, sat:1.0, contrast:1.0, grain:0.04, vignette:0.22,
};
