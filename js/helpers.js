// helpers.js — shared WebGL utilities, color math, React hooks, palette presets.
// No JSX — loads as a regular <script> tag before Babel modules.

// ─── WebGL ────────────────────────────────────────────────────────────────────
function compileShader(gl, type, source) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(sh), source);
    gl.deleteShader(sh); return null;
  }
  return sh;
}
function compileProgram(gl, vsSrc, fsSrc) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(prog)); return null;
  }
  return prog;
}
function createQuadGeometry(gl, program) {
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, 'a_pos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  return buf;
}
const VS_FULLSCREEN = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main(){ v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

// ─── Color utilities ──────────────────────────────────────────────────────────
function hexToRGB(hex) {
  const h = (hex || '#000000').replace('#', '');
  return [parseInt(h.substring(0,2),16)/255, parseInt(h.substring(2,4),16)/255, parseInt(h.substring(4,6),16)/255];
}
function rgbToHex(r, g, b) {
  const to = v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  return '#' + to(r) + to(g) + to(b);
}
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2*l - 1)) * s;
  const x = c * (1 - Math.abs(((h/60) % 2) - 1));
  const m = l - c/2; let r, g, b;
  if (h < 60)       [r,g,b] = [c,x,0];
  else if (h < 120) [r,g,b] = [x,c,0];
  else if (h < 180) [r,g,b] = [0,c,x];
  else if (h < 240) [r,g,b] = [0,x,c];
  else if (h < 300) [r,g,b] = [x,0,c];
  else              [r,g,b] = [c,0,x];
  return rgbToHex(r+m, g+m, b+m);
}
function hexToHSL(hex) {
  const [r,g,b] = hexToRGB(hex);
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  const l = (max+min)/2; let s=0, h=0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d/(2-max-min) : d/(max+min);
    if (max===r) h = ((g-b)/d + (g<b?6:0));
    else if (max===g) h = (b-r)/d + 2;
    else h = (r-g)/d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function randomHarmony(baseHue, count) {
  const results = [];
  for (let i = 0; i < count; i++) {
    const offset = (i / count) * 360 * 0.618;
    results.push(hslToHex(baseHue + offset, 0.65 + Math.random()*0.25, 0.4 + Math.random()*0.2));
  }
  return results;
}

// ─── Palette presets ──────────────────────────────────────────────────────────
const PALETTE_PRESETS = [
  ['#08015F','#FC6C3D','#F4C4D7'],
  ['#07015B','#962956','#EB754B'],
  ['#641249','#6CBA62','#93F0BC'],
  ['#07127D','#B66382','#F09972'],
  ['#BB2748','#E2A0B7','#1E1827'],
  ['#98F2F4','#457921','#1C2D07'],
  ['#EFD7E0','#74152D','#2A0410'],
  ['#EB4C74','#EF9166','#F4BE62'],
  ['#FAEBC6','#F2F4E3','#EBFCFD'],
  ['#98F2F4','#5E8966','#080804'],
  ['#FFFFFF','#986B93','#090309'],
  ['#3D8225','#1E410F','#0C1B04'],
  ['#7C1B14','#3E0B08','#180202'],
  ['#FFFFFF','#9F20A4','#39063C'],
  ['#57108A','#A32B99','#E38BB8'],
  ['#D33B8E','#E07DBB','#F2CAEA'],
  ['#98F2F4','#3C5564','#3A7F23'],
  ['#C3C8C8','#79160D','#D12F22'],
  ['#1E1827','#BF4D6B','#DBDDD8'],
  ['#B5A9F9','#D7C6FB','#F8E3FD'],
  ['#000000','#6B956D','#D2E4D3'],
  ['#08015F','#98F2F4','#FC6C3D'],
  ['#F4C4D7','#E07DBB','#57108A'],
  ['#FAEBC6','#EB4C74','#7C1B14'],
  ['#1C2D07','#457921','#98F2F4'],
  ['#08015F','#E38BB8','#FAEBC6'],
  ['#0C1B04','#3D8225','#F4BE62'],
  ['#180202','#7C1B14','#F09972'],
  ['#39063C','#9F20A4','#E38BB8'],
  ['#1E1827','#BB2748','#F4C4D7'],
];

// ─── React hooks ──────────────────────────────────────────────────────────────
// ─── Global animation speed ───────────────────────────────────────────────────
// Set window.__NURR_SPEED to a multiplier (e.g. 2.0 for 2× speed) before
// recording. Modules read window.__NURR_T as a drop-in for performance.now()/1000.
window.__NURR_SPEED = 1.0;
window.__NURR_T = null; // null = not yet seeded

function useAnimationLoop(cb, deps = []) {
  const cbRef = React.useRef(cb);
  cbRef.current = cb;
  React.useEffect(() => {
    let raf;
    let virtualTime = window.__NURR_T ?? 0;
    let lastReal = performance.now();
    const tick = (now) => {
      const dt = Math.min((now - lastReal) / 1000, 0.1); // clamp to avoid tab-hidden jump
      lastReal = now;
      const speed = window.__NURR_SPEED ?? 1.0;
      virtualTime += dt * speed;
      window.__NURR_T = virtualTime; // publish for all modules
      cbRef.current(virtualTime, dt * speed);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, deps);
}

function useMouse() {
  const ref = React.useRef({
    tx:0.5, ty:0.5, x:0.5, y:0.5,
    vx:0, vy:0, chaosX:0.5, chaosY:0.5, swingX:0, swingY:0,
    down:false, lastClick:0, clickCount:0,
  });
  React.useEffect(() => {
    const onMove = (e) => {
      const c = ref.current;
      const ntx = e.clientX / window.innerWidth;
      const nty = e.clientY / window.innerHeight;
      c.vx = (ntx - c.tx) * 60; c.vy = (nty - c.ty) * 60;
      c.tx = ntx; c.ty = nty;
    };
    const onDown = (e) => {
      if (e.target.closest('.panel,.icon-btn,.rail,.layout-card,.palette-card,.nature-thumb,.swatch,.color-wheel-card,.eyedropper-follow,.abstract-form-btn,button,input,.drop-zone,.nymph-landing')) return;
      const c = ref.current;
      c.down = true; c.lastClick = performance.now()/1000; c.clickCount += 1;
    };
    const onUp = () => { ref.current.down = false; };
    const onTouch = (e) => { const t = e.touches[0]; if (t) onMove(t); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onTouch, { passive:true });
    let raf;
    const tick = () => {
      const c = ref.current;
      c.x += (c.tx - c.x) * 0.18; c.y += (c.ty - c.y) * 0.18;
      c.swingX += (c.vx*0.012 - c.swingX*0.12);
      c.swingY += (c.vy*0.012 - c.swingY*0.12);
      const tNow = performance.now() / 1000;
      const nx = Math.sin(tNow*0.37)*0.5 + Math.sin(tNow*1.13+1.3)*0.25;
      const ny = Math.cos(tNow*0.41)*0.5 + Math.sin(tNow*0.97+0.7)*0.25;
      c.chaosX = c.x + c.swingX*1.4 + nx*0.08;
      c.chaosY = c.y + c.swingY*1.4 + ny*0.08;
      c.vx *= 0.92; c.vy *= 0.92;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onTouch);
      cancelAnimationFrame(raf);
    };
  }, []);
  return ref;
}

function useStageSize(canvasRef) {
  const sizeRef = React.useRef({ w:0, h:0, dpr:1 });
  React.useEffect(() => {
    const resize = () => {
      const c = canvasRef.current; if (!c) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth, h = window.innerHeight;
      c.width = Math.round(w*dpr); c.height = Math.round(h*dpr);
      c.style.width = w+'px'; c.style.height = h+'px';
      sizeRef.current = { w, h, dpr };
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  return sizeRef;
}

function downloadCanvas(canvas, filename='wallpaper.png') {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }, 'image/png');
}

// ─── Nature image discovery ───────────────────────────────────────────────────
async function discoverNatureImages() {
  // 1) Try manifest.json first (fastest, most reliable)
  try {
    const r = await fetch('./nature/manifest.json', { cache: 'no-cache' });
    if (r.ok) {
      const data = await r.json();
      if (Array.isArray(data) && data.length) {
        return data.map(name => `./nature/${name}`);
      }
    }
  } catch (e) {}
  // 2) Probe numbered files 01–40 with common extensions
  const exts = ['jpg','jpeg','png','webp'];
  const checks = [];
  for (let i = 1; i <= 40; i++) {
    const num = i < 10 ? '0'+i : ''+i;
    for (const ext of exts) {
      const url = `./nature/${num}.${ext}`;
      checks.push(new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve(url);
        img.onerror = () => resolve(null);
        img.src = url;
      }));
    }
  }
  const results = await Promise.all(checks);
  return results.filter(Boolean);
}

// ─── Expose ───────────────────────────────────────────────────────────────────
window.WP = {
  compileProgram, createQuadGeometry, VS_FULLSCREEN,
  hexToRGB, rgbToHex, hslToHex, hexToHSL, randomHarmony, PALETTE_PRESETS,
  useAnimationLoop, useMouse, useStageSize, downloadCanvas,
};
window.discoverNatureImages = discoverNatureImages;
