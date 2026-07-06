// geometric.js — Mode 2: Brutalist geometric compositions on canvas 2D.
// Exposes: window.GeometricMode, window.GeometricControls, window.GEOMETRIC_DEFAULTS

const { useEffect: geomUE, useRef: geomUR, useState: geomUS } = React;

// ─── Composition definitions ──────────────────────────────────────────────────
const GEOMETRIC_COMPOSITIONS = [
  { name:'sun & block', bg:0, shapes:[
    {kind:'circle', x:0.50, y:0.46, r:0.30, colorIdx:1},
    {kind:'rect',   x:0.18, y:0.74, w:0.16, h:0.16, colorIdx:2},
  ]},
  { name:'horizon', bg:0, shapes:[
    {kind:'rect',   x:0.10, y:0.10, w:0.32, h:0.32, colorIdx:1},
    {kind:'circle', x:0.50, y:1.02, r:0.55, colorIdx:2},
  ]},
  { name:'three moons', bg:0, shapes:[
    {kind:'circle', x:0.28, y:0.50, r:0.14, colorIdx:1},
    {kind:'circle', x:0.50, y:0.50, r:0.18, colorIdx:2},
    {kind:'circle', x:0.72, y:0.50, r:0.14, colorIdx:1},
  ]},
  { name:'mass & wedge', bg:0, shapes:[
    {kind:'blob',   x:0.42, y:0.50, r:0.30, colorIdx:1, seed:7,  blobAmp:0.22},
    {kind:'rect',   x:0.62, y:0.20, w:0.22, h:0.40, colorIdx:2, rot:0.08},
  ]},
  { name:'dot grid', bg:0, shapes:(() => {
    const arr=[];
    for(let r=0;r<3;r++) for(let c=0;c<3;c++)
      arr.push({kind:'circle', x:0.22+c*0.28, y:0.22+r*0.28, r:0.07, colorIdx:((r+c)%2)+1});
    return arr;
  })() },
  { name:'block & disc', bg:0, shapes:[
    {kind:'rect',   x:0.10, y:0.10, w:0.55, h:0.80, colorIdx:1},
    {kind:'circle', x:0.72, y:0.30, r:0.18, colorIdx:2},
    {kind:'circle', x:0.78, y:0.72, r:0.08, colorIdx:2},
  ]},
  { name:'columns', bg:0, shapes:[
    {kind:'rect', x:0.12, y:0.18, w:0.12, h:0.64, colorIdx:1},
    {kind:'rect', x:0.30, y:0.18, w:0.12, h:0.64, colorIdx:2},
    {kind:'rect', x:0.48, y:0.18, w:0.12, h:0.64, colorIdx:1},
    {kind:'rect', x:0.66, y:0.18, w:0.12, h:0.64, colorIdx:2},
  ]},
  { name:'eclipse', bg:0, shapes:[
    {kind:'circle', x:0.44, y:0.50, r:0.28, colorIdx:1},
    {kind:'circle', x:0.60, y:0.50, r:0.28, colorIdx:2},
  ]},
  { name:'soft mass', bg:0, shapes:[
    {kind:'blob', x:0.30, y:0.62, r:0.22, colorIdx:1, seed:3,  blobAmp:0.18},
    {kind:'blob', x:0.68, y:0.38, r:0.18, colorIdx:2, seed:11, blobAmp:0.24},
  ]},
  { name:'aperture', bg:0, shapes:[
    {kind:'rect',   x:0.18, y:0.18, w:0.64, h:0.64, colorIdx:1},
    {kind:'circle', x:0.50, y:0.50, r:0.22, colorIdx:2},
  ]},
  { name:'tilt', bg:0, shapes:[
    {kind:'rect',   x:0.10, y:0.55, w:0.50, h:0.30, colorIdx:1, rot:-0.16},
    {kind:'circle', x:0.74, y:0.30, r:0.16, colorIdx:2},
  ]},
  { name:'monolith', bg:0, shapes:[
    {kind:'blob', x:0.50, y:0.50, r:0.36, colorIdx:1, seed:17, blobAmp:0.16},
  ]},
  { name:'four corners', bg:0, shapes:[
    {kind:'rect', x:0.08, y:0.08, w:0.22, h:0.22, colorIdx:1},
    {kind:'rect', x:0.70, y:0.08, w:0.22, h:0.22, colorIdx:2},
    {kind:'rect', x:0.08, y:0.70, w:0.22, h:0.22, colorIdx:2},
    {kind:'rect', x:0.70, y:0.70, w:0.22, h:0.22, colorIdx:1},
  ]},
  { name:'dawn', bg:0, shapes:[
    {kind:'circle', x:0.50, y:0.95, r:0.55, colorIdx:1},
    {kind:'circle', x:0.78, y:0.22, r:0.07, colorIdx:2},
  ]},
  { name:'shelves', bg:0, shapes:[
    {kind:'rect', x:0.16, y:0.22, w:0.68, h:0.10, colorIdx:1},
    {kind:'rect', x:0.16, y:0.42, w:0.50, h:0.10, colorIdx:2},
    {kind:'rect', x:0.16, y:0.62, w:0.68, h:0.10, colorIdx:1},
  ]},
  { name:'mass', bg:0, shapes:[
    {kind:'blob', x:0.36, y:0.50, r:0.26, colorIdx:1, seed:5,  blobAmp:0.20},
    {kind:'blob', x:0.66, y:0.50, r:0.22, colorIdx:2, seed:13, blobAmp:0.22},
  ]},
];
window.GEOMETRIC_COMPOSITIONS_LEN = GEOMETRIC_COMPOSITIONS.length;
// Exposed so the mobile UI can render the composition picker (count + selection).
window.NURR_GEOMETRIC_COMPOSITIONS = GEOMETRIC_COMPOSITIONS;

// ─── Tiny preview SVG ─────────────────────────────────────────────────────────
function CompositionPreview({ comp, palette }) {
  const bg = palette[comp.bg] || '#ffffff';
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
      <rect width="100" height="100" fill={bg} />
      {comp.shapes.map((s,i) => {
        const fill = palette[s.colorIdx] || '#000';
        if (s.kind==='rect') {
          const cx=s.x*100+s.w*50, cy=s.y*100+s.h*50, rot=(s.rot||0)*60;
          return <rect key={i} x={s.x*100} y={s.y*100} width={s.w*100} height={s.h*100} fill={fill}
            transform={rot ? `rotate(${rot} ${cx} ${cy})` : undefined} />;
        }
        if (s.kind==='circle') return <circle key={i} cx={s.x*100} cy={s.y*100} r={s.r*100} fill={fill} />;
        if (s.kind==='blob') {
          const pts=[]; const N=24;
          for(let k=0;k<N;k++){
            const a=(k/N)*Math.PI*2;
            const wob=1+Math.sin(a*3+(s.seed||0))*(s.blobAmp||0.15);
            pts.push(`${(s.x+Math.cos(a)*s.r*wob)*100},${(s.y+Math.sin(a)*s.r*wob)*100}`);
          }
          return <polygon key={i} points={pts.join(' ')} fill={fill} />;
        }
      })}
    </svg>
  );
}

// ─── Blob renderer ────────────────────────────────────────────────────────────
function drawBlob(ctx, x, y, r, seed, amp, rot) {
  const N = 64;
  ctx.beginPath();
  for (let i=0; i<=N; i++) {
    const a=(i/N)*Math.PI*2;
    const wob=1+Math.sin(a*3+seed)*amp+Math.cos(a*5-seed*0.7)*amp*0.5;
    const px=x+Math.cos(a+(rot||0))*r*wob;
    const py=y+Math.sin(a+(rot||0))*r*wob;
    if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
  }
  ctx.closePath(); ctx.fill();
}



// ─── Faceted glass material helpers ───────────────────────────────────────────
function hexToRgbGeom(hex) {
  const h = String(hex || '#ffffff').replace('#','').trim();
  const v = h.length === 3 ? h.split('').map(c=>c+c).join('') : h.padEnd(6,'f').slice(0,6);
  const n = parseInt(v,16);
  return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 };
}
function rgbaGeom(hex, a) {
  const c = hexToRgbGeom(hex);
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}
function geomBbox(g) {
  if (g.kind === 'rect') {
    const c=Math.abs(Math.cos(g.rot||0)), s=Math.abs(Math.sin(g.rot||0));
    const ex=c*g.w/2+s*g.h/2, ey=s*g.w/2+c*g.h/2;
    return {x:g.px-ex,y:g.py-ey,w:ex*2,h:ey*2,cx:g.px,cy:g.py,r:Math.max(ex,ey)};
  }
  const rr = g.r * (g.kind === 'blob' ? 1.24 : 1.04);
  return {x:g.px-rr,y:g.py-rr,w:rr*2,h:rr*2,cx:g.px,cy:g.py,r:rr};
}
function buildGlassMaskPath(ctx, g, seed=0) {
  // Glass mode keeps the composition position/motion, but the hard silhouettes are
  // softened into volumetric sculptural masks. This prevents glass rectangles.
  const N = 84;
  const bbox = geomBbox(g);
  let rx = bbox.w/2, ry = bbox.h/2;
  if (g.kind === 'rect') {
    rx *= 0.78; ry *= 0.82;
  }
  ctx.beginPath();
  for (let i=0; i<=N; i++) {
    const a = (i/N) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    let superness = g.kind === 'rect' ? 0.60 : 0.82;
    let x = Math.sign(ca) * Math.pow(Math.abs(ca), superness) * rx;
    let y = Math.sign(sa) * Math.pow(Math.abs(sa), superness) * ry;
    const wob = 1 + Math.sin(a*3.0 + seed*1.7) * 0.035 + Math.cos(a*5.0 - seed*0.9) * 0.024;
    x *= wob; y *= wob;
    const rot = g.kind === 'rect' ? (g.rot || 0) : Math.sin(seed)*0.06;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const X = g.px + x*cr - y*sr;
    const Y = g.py + x*sr + y*cr;
    if (i===0) ctx.moveTo(X,Y); else ctx.lineTo(X,Y);
  }
  ctx.closePath();
}
function strokeGlassMask(ctx, g, seed, dx, dy, width, color) {
  ctx.save();
  ctx.translate(dx,dy);
  buildGlassMaskPath(ctx,g,seed);
  ctx.lineJoin='round'; ctx.lineCap='round'; ctx.lineWidth=width; ctx.strokeStyle=color; ctx.stroke();
  ctx.restore();
}
function drawFacetedGlassShape(ctx, W, H, g, tint, seed, intensity=1) {
  const box = geomBbox(g);
  const cx = box.cx, cy = box.cy, R = Math.max(24, box.r);
  const drawMask = () => buildGlassMaskPath(ctx, g, seed);

  // Directional lighting model, closer to a polished 3D render / waterdrop:
  // base volume first, then broad Screen/Burn overlays, then restrained iridescent rim.
  // No internal stripe strokes. All highlights are soft gradient patches.

  // 1) Soft cast shadow under the object.
  ctx.save();
  drawMask();
  ctx.shadowColor = `rgba(10,12,20,${0.22 * intensity})`;
  ctx.shadowBlur = R * 0.26;
  ctx.shadowOffsetX = R * 0.055;
  ctx.shadowOffsetY = R * 0.13;
  ctx.fillStyle = 'rgba(0,0,0,0.001)';
  ctx.fill();
  ctx.restore();

  // 2) Main clipped volume.
  ctx.save();
  drawMask();
  ctx.clip();

  // Transparent 3D body: neutral, smooth, with a darker thick rim.
  const body = ctx.createRadialGradient(
    cx - R * 0.24, cy - R * 0.30, R * 0.03,
    cx + R * 0.10, cy + R * 0.12, R * 1.18
  );
  body.addColorStop(0.00, `rgba(255,255,255,${0.76 * intensity})`);
  body.addColorStop(0.18, `rgba(255,255,255,${0.44 * intensity})`);
  body.addColorStop(0.42, `rgba(230,235,246,${0.19 * intensity})`);
  body.addColorStop(0.68, `rgba(150,160,184,${0.14 * intensity})`);
  body.addColorStop(0.84, `rgba(48,56,78,${0.22 * intensity})`);
  body.addColorStop(1.00, `rgba(250,252,255,${0.38 * intensity})`);
  ctx.fillStyle = body;
  ctx.fillRect(box.x - R * 0.22, box.y - R * 0.22, box.w + R * 0.44, box.h + R * 0.44);

  // Subtle water/resin film. This is the only body iridescence; it should read as material,
  // not as rainbow graphics.
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.filter = `blur(${Math.max(12, R * 0.075)}px)`;
  const pearl = ctx.createLinearGradient(cx - R * 0.72, cy - R * 0.62, cx + R * 0.72, cy + R * 0.66);
  pearl.addColorStop(0.00, `rgba(90,220,255,${0.045 * intensity})`);
  pearl.addColorStop(0.28, `rgba(255,255,255,${0.040 * intensity})`);
  pearl.addColorStop(0.52, `rgba(255,190,235,${0.050 * intensity})`);
  pearl.addColorStop(0.76, `rgba(255,235,150,${0.035 * intensity})`);
  pearl.addColorStop(1.00, `rgba(120,170,255,${0.040 * intensity})`);
  ctx.fillStyle = pearl;
  ctx.fillRect(box.x - R * 0.32, box.y - R * 0.32, box.w + R * 0.64, box.h + R * 0.64);
  ctx.restore();

  // Burn / depth: lower-right volume, blurred and broad. No lines.
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.filter = `blur(${Math.max(14, R * 0.085)}px)`;
  const burn = ctx.createRadialGradient(
    cx + R * 0.34, cy + R * 0.40, R * 0.02,
    cx + R * 0.10, cy + R * 0.08, R * 0.88
  );
  burn.addColorStop(0.00, `rgba(25,30,48,${0.24 * intensity})`);
  burn.addColorStop(0.42, `rgba(55,64,88,${0.09 * intensity})`);
  burn.addColorStop(1.00, 'rgba(255,255,255,0)');
  ctx.fillStyle = burn;
  ctx.fillRect(box.x - R * 0.35, box.y - R * 0.35, box.w + R * 0.70, box.h + R * 0.70);
  ctx.restore();

  // Screen / light: top-left volume, large and soft.
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.filter = `blur(${Math.max(10, R * 0.062)}px)`;
  const screen = ctx.createRadialGradient(
    cx - R * 0.30, cy - R * 0.34, R * 0.01,
    cx - R * 0.10, cy - R * 0.16, R * 0.66
  );
  screen.addColorStop(0.00, `rgba(255,255,255,${0.66 * intensity})`);
  screen.addColorStop(0.32, `rgba(255,255,255,${0.24 * intensity})`);
  screen.addColorStop(0.75, `rgba(255,255,255,${0.060 * intensity})`);
  screen.addColorStop(1.00, 'rgba(255,255,255,0)');
  ctx.fillStyle = screen;
  ctx.fillRect(box.x - R * 0.30, box.y - R * 0.30, box.w + R * 0.60, box.h + R * 0.60);
  ctx.restore();

  // Secondary glass reflection: an offset soft oval, not a stripe.
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.filter = `blur(${Math.max(9, R * 0.052)}px)`;
  const oval = ctx.createRadialGradient(
    cx + R * 0.18, cy - R * 0.06, R * 0.02,
    cx + R * 0.18, cy - R * 0.06, R * 0.48
  );
  oval.addColorStop(0.00, `rgba(255,255,255,${0.24 * intensity})`);
  oval.addColorStop(0.42, `rgba(255,255,255,${0.075 * intensity})`);
  oval.addColorStop(1.00, 'rgba(255,255,255,0)');
  ctx.fillStyle = oval;
  ctx.fillRect(box.x - R * 0.20, box.y - R * 0.20, box.w + R * 0.40, box.h + R * 0.40);
  ctx.restore();

  // Inner thickness: soft rim darkening clipped inside the mask.
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  const rim = ctx.createRadialGradient(cx, cy, R * 0.54, cx, cy, R * 1.08);
  rim.addColorStop(0.00, 'rgba(255,255,255,0)');
  rim.addColorStop(0.66, 'rgba(185,195,218,0.030)');
  rim.addColorStop(0.84, `rgba(56,65,92,${0.16 * intensity})`);
  rim.addColorStop(1.00, `rgba(20,25,40,${0.28 * intensity})`);
  ctx.fillStyle = rim;
  ctx.fillRect(box.x - R * 0.18, box.y - R * 0.18, box.w + R * 0.36, box.h + R * 0.36);
  ctx.restore();

  ctx.restore();

  // 3) Rim system outside/inside: metallic/iridescent but restrained.
  // These are edge artifacts only, not surface stripes.
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const e = Math.max(0.7, R * 0.0038) * intensity;
  strokeGlassMask(ctx, g, seed, -e * 1.25, -e * 0.8, R * 0.0045, `rgba(90,235,255,${0.15 * intensity})`);
  strokeGlassMask(ctx, g, seed,  e * 1.10,  e * 0.85, R * 0.0045, `rgba(255,100,215,${0.12 * intensity})`);
  strokeGlassMask(ctx, g, seed, -e * 0.35,  e * 0.95, R * 0.0035, `rgba(255,235,135,${0.10 * intensity})`);
  strokeGlassMask(ctx, g, seed, 0, 0, R * 0.0060, `rgba(255,255,255,${0.22 * intensity})`);
  ctx.restore();

  // Inner bevel as soft offset strokes. Low opacity so it reads as thickness, not outline.
  ctx.save();
  drawMask();
  ctx.clip();
  strokeGlassMask(ctx, g, seed, -R * 0.010, -R * 0.013, R * 0.026, `rgba(255,255,255,${0.17 * intensity})`);
  strokeGlassMask(ctx, g, seed,  R * 0.014,  R * 0.017, R * 0.030, `rgba(28,34,52,${0.10 * intensity})`);
  ctx.restore();

  // 4) Specular glints: isolated soft highlights only. No connecting stripe.
  ctx.save();
  drawMask();
  ctx.clip();
  ctx.globalCompositeOperation = 'screen';

  const glints = [
    { x: cx - R * 0.26, y: cy - R * 0.24, r: R * 0.075, a: 0.52 },
    { x: cx - R * 0.10, y: cy - R * 0.34, r: R * 0.040, a: 0.30 },
    { x: cx + R * 0.22, y: cy + R * 0.18, r: R * 0.055, a: 0.18 },
  ];
  for (const p of glints) {
    const gg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
    gg.addColorStop(0.00, `rgba(255,255,255,${p.a * intensity})`);
    gg.addColorStop(0.45, `rgba(255,255,255,${p.a * 0.22 * intensity})`);
    gg.addColorStop(1.00, 'rgba(255,255,255,0)');
    ctx.fillStyle = gg;
    ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
  }

  // One tiny polished-corner spark, very short and blurred.
  ctx.save();
  ctx.filter = `blur(${Math.max(0.8, R * 0.0035)}px)`;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - R * 0.34, cy - R * 0.33);
  ctx.quadraticCurveTo(cx - R * 0.27, cy - R * 0.38, cx - R * 0.18, cy - R * 0.36);
  ctx.lineWidth = R * 0.0065;
  ctx.strokeStyle = `rgba(255,255,255,${0.28 * intensity})`;
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}
// ─── GeometricMode ────────────────────────────────────────────────────────────
function GeometricMode({ tweaks, registerSnapshot, mouseRef }) {
  const canvasRef = geomUR(null);
  WP.useStageSize(canvasRef);
  const stateRef = geomUR({ pulse:0, prevIdx:0, transition:0, frozen:false, frozenMouse:null, frozenTime:null, mouseLocked:false, lockedMouse:null, clickTimer:null });

  geomUE(() => {
    const isInterfaceEvent = (e) => !!(e.target && e.target.closest && e.target.closest('.panel,.icon-btn,.rail,.layout-card,.palette-card,.nature-thumb,.swatch,.color-wheel-card,.eyedropper-follow,button,input,select,textarea,label,.drop-zone,.nymph-landing'));
    const pointFromEvent = (e) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return null;
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      const live = mouseRef.current || { x, y, chaosX:x, chaosY:y };
      return { x, y, chaosX: live.chaosX ?? x, chaosY: live.chaosY ?? y };
    };
    const onClick = (e) => {
      if (isInterfaceEvent(e)) return;
      const pt = pointFromEvent(e); if (!pt) return;
      const st = stateRef.current;
      if (st.clickTimer) clearTimeout(st.clickTimer);
      st.clickTimer = setTimeout(() => {
        st.pulse = 1.0;
        st.frozen = !st.frozen;
        if (st.frozen) { st.frozenMouse = pt; st.frozenTime = performance.now() / 1000; }
        else { st.frozenMouse = null; st.frozenTime = null; }
        st.clickTimer = null;
      }, 210);
    };
    const onDoubleClick = (e) => {
      if (isInterfaceEvent(e)) return;
      const pt = pointFromEvent(e); if (!pt) return;
      const st = stateRef.current;
      if (st.clickTimer) { clearTimeout(st.clickTimer); st.clickTimer = null; }
      st.mouseLocked = !st.mouseLocked;
      st.lockedMouse = st.mouseLocked ? pt : null;
      st.pulse = 0;
      e.preventDefault();
    };
    window.addEventListener('click', onClick, true);
    window.addEventListener('dblclick', onDoubleClick, true);
    return () => {
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('dblclick', onDoubleClick, true);
      if (stateRef.current.clickTimer) clearTimeout(stateRef.current.clickTimer);
    };
  }, []);

  const drawAt = (W, H, transparent = false, altCanvas = null) => {
    const canvas = altCanvas || canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const palette = tweaks.colors;
    const comp = GEOMETRIC_COMPOSITIONS[tweaks.compositionIdx % GEOMETRIC_COMPOSITIONS.length];

    // Skip background fill for transparent (layer) export
    if (!transparent) {
      ctx.fillStyle = palette[comp.bg] || '#ffffff';
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.clearRect(0, 0, W, H);
    }

    const unit = Math.max(W, H);
    const offX = (W - unit) / 2, offY = (H - unit) / 2;
    const stInteract = stateRef.current;
    const m = stInteract.frozen && stInteract.frozenMouse
      ? stInteract.frozenMouse
      : (stInteract.mouseLocked && stInteract.lockedMouse
        ? stInteract.lockedMouse
        : (mouseRef.current || { x:0.5, y:0.5, chaosX:0.5, chaosY:0.5 }));
    const mvx = (m.chaosX - 0.5) * tweaks.mousePull * 2.0;
    const mvy = (m.chaosY - 0.5) * tweaks.mousePull * 2.0;
    const t = stateRef.current.frozen && stateRef.current.frozenTime
      ? stateRef.current.frozenTime
      : (window.__NURR_T ?? performance.now() / 1000);
    const pulse = stateRef.current.frozen ? 0 : stateRef.current.pulse;

    // Glass look is deliberately additive and fail-safe: Graphic mode keeps the
    // original renderer, Glass mode swaps only the visual material/silhouette.
    const useGlass = tweaks.look === 'glass' || tweaks.glass === true;
    if (useGlass && !transparent) {
      // Subtle studio-light background so the object has something to refract.
      const studio = ctx.createRadialGradient(W*0.18,H*0.12,0,W*0.18,H*0.12,Math.max(W,H)*0.95);
      studio.addColorStop(0,'rgba(255,255,255,0.26)');
      studio.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle = studio; ctx.fillRect(0,0,W,H);
    } else if (useGlass) {
      // transparent mode: no bg fill, shapes only
    }

    for (let i=0; i<comp.shapes.length; i++) {
      const s = comp.shapes[i];
      ctx.fillStyle = palette[s.colorIdx] || '#000';
      const baseSx = s.kind==='rect' ? s.x+s.w/2 : s.x;
      const baseSy = s.kind==='rect' ? s.y+s.h/2 : s.y;
      const vectorDistance = tweaks.vectorDistance ?? 1;
      const sx = 0.5 + (baseSx - 0.5) * vectorDistance;
      const sy = 0.5 + (baseSy - 0.5) * vectorDistance;
      const dx=m.chaosX-sx, dy=m.chaosY-sy;
      const d2=dx*dx+dy*dy;
      const fall=Math.exp(-d2*2.4);
      const pullX=mvx*(0.4+fall*1.6)*0.12, pullY=mvy*(0.4+fall*1.6)*0.12;
      const dist=Math.sqrt(d2)+0.001;
      const wave=pulse*Math.exp(-dist*3.0);
      const wx=(sx-m.chaosX)/dist*wave*0.18, wy=(sy-m.chaosY)/dist*wave*0.18;
      const driftX=Math.sin(t*(0.3+i*0.07)+i)*0.008;
      const driftY=Math.cos(t*(0.25+i*0.05)+i*1.3)*0.008;
      const px=(sx+pullX+wx+driftX)*unit+offX;
      const py=(sy+pullY+wy+driftY)*unit+offY;
      const scale = tweaks.vectorScale ?? 1;

      if (useGlass) {
        try {
          let geom = null;
          const glassScale = (tweaks.glassScale ?? 0.72);
          if (s.kind==='rect') {
            geom = {
              kind:'rect', px, py,
              w:s.w*unit*scale*glassScale,
              h:s.h*unit*scale*glassScale,
              rot:(s.rot||0)+fall*mvx*0.4+wave*0.3
            };
          } else if (s.kind==='circle') {
            geom = { kind:'circle', px, py, r:s.r*unit*scale*(1+wave*0.15+fall*0.06)*glassScale };
          } else if (s.kind==='blob') {
            geom = {
              kind:'blob', px, py,
              r:s.r*unit*scale*(1+wave*0.1)*glassScale,
              amp:(s.blobAmp||0.18)+fall*0.06+Math.sin(t*0.6+i)*0.02,
              seed:(s.seed||0)+t*0.3+fall*1.5
            };
          }
          if (geom) drawFacetedGlassShape(ctx, W, H, geom, palette[s.colorIdx] || '#ffffff', i*1.73 + t*0.08, tweaks.glassIntensity ?? 1);
          continue;
        } catch (err) {
          console.warn('[geometric] glass render failed for shape; falling back to graphic shape', err);
        }
      }

      if (s.kind==='rect') {
        const w=s.w*unit*scale, h=s.h*unit*scale;
        const rot=(s.rot||0)+fall*mvx*0.4+wave*0.3;
        ctx.save(); ctx.translate(px,py); ctx.rotate(rot); ctx.fillRect(-w/2,-h/2,w,h); ctx.restore();
      } else if (s.kind==='circle') {
        const r=s.r*unit*scale*(1+wave*0.15+fall*0.06);
        ctx.beginPath(); ctx.arc(px,py,r,0,Math.PI*2); ctx.fill();
      } else if (s.kind==='blob') {
        const r=s.r*unit*scale*(1+wave*0.1);
        const amp=(s.blobAmp||0.18)+fall*0.06+Math.sin(t*0.6+i)*0.02;
        const seed=(s.seed||0)+t*0.3+fall*1.5;
        ctx.save(); ctx.translate(px,py); drawBlob(ctx,0,0,r,seed,amp,0); ctx.restore();
      }
    }

    // Film grain — skip for transparent export (overlay on alpha is unreliable)
    if (tweaks.grain > 0 && !transparent) {
      const gCanvas=document.createElement('canvas'); const gctx=gCanvas.getContext('2d');
      const scale=Math.max(1,Math.round(5-tweaks.grain*3));
      gCanvas.width=Math.ceil(W/scale); gCanvas.height=Math.ceil(H/scale);
      const imgData=gctx.createImageData(gCanvas.width,gCanvas.height);
      for(let i=0;i<imgData.data.length;i+=4){
        const v=105+Math.random()*150;
        imgData.data[i]=v; imgData.data[i+1]=v; imgData.data[i+2]=v; imgData.data[i+3]=255;
      }
      gctx.putImageData(imgData,0,0);
      ctx.save();
      ctx.globalAlpha=0.025+tweaks.grain*0.11;
      ctx.globalCompositeOperation='overlay';
      ctx.imageSmoothingEnabled=false;
      ctx.drawImage(gCanvas,0,0,W,H);
      ctx.restore();
    }
  };

  WP.useAnimationLoop((t, dt) => {
    const canvas = canvasRef.current; if (!canvas) return;
    stateRef.current.pulse *= Math.exp(-dt*1.6);
    drawAt(canvas.width, canvas.height);
  });

  geomUE(() => {
    registerSnapshot((opts = {}) => {
      const canvas = canvasRef.current; if (!canvas) return null;
      const w = opts.width  || 3840;
      const h = opts.height || 2160;

      // Transparent layer export — render to an offscreen canvas without background.
      // Does NOT touch the live canvas, so the live animation continues undisturbed.
      if (opts.transparent) {
        const off = document.createElement('canvas');
        off.width = w; off.height = h;
        drawAt(w, h, true, off);
        const dataUrl = off.toDataURL('image/png');
        if (!opts.returnDataUrl) WP.downloadCanvas(off, opts.filename || `nurr-geo-layer-${w}x${h}-${Date.now()}.png`);
        return dataUrl;
      }

      // Normal composite snapshot (existing behaviour)
      const ow = canvas.width, oh = canvas.height, osw = canvas.style.width, osh = canvas.style.height;
      canvas.width = w; canvas.height = h; drawAt(w, h);
      const dataUrl = canvas.toDataURL('image/png');
      if (!opts.returnDataUrl) WP.downloadCanvas(canvas, opts.filename || `geometric-${w}x${h}-${Date.now()}.png`);
      if (opts.returnDataUrl) { canvas.width = ow; canvas.height = oh; canvas.style.width = osw; canvas.style.height = osh; }
      else requestAnimationFrame(() => { canvas.width = ow; canvas.height = oh; canvas.style.width = osw; canvas.style.height = osh; });
      return dataUrl;
    });
  }, [tweaks, registerSnapshot]);

  return <canvas ref={canvasRef} className="stage" />;
}

// ─── GeometricControls ────────────────────────────────────────────────────────
function GeometricControls({ tweaks, setTweaks }) {
  const [presetsOpen, setPresetsOpen] = React.useState(false);
  const setColors = (next) => setTweaks({ colors: next.slice(0, 6) });
  const PaletteEditor = window.NurrPaletteEditor;

  return (
    <>
      <div className="section">
        <div className="section-label">
          <span className="name">Composition</span>
          <span className="value">№ {tweaks.compositionIdx+1} / {GEOMETRIC_COMPOSITIONS.length}</span>
        </div>
        <div className="layout-grid">
          {GEOMETRIC_COMPOSITIONS.map((comp,i) => (
            <button key={i} className={'layout-card'+(i===tweaks.compositionIdx?' active':'')}
              onClick={()=>setTweaks({compositionIdx:i})} title={comp.name}>
              <CompositionPreview comp={comp} palette={tweaks.colors} />
            </button>
          ))}
        </div>
      </div>

      <PaletteEditor colors={tweaks.colors} setColors={setColors} countLabel={`${tweaks.colors.length} colors`} allowAdd={true} minColors={1} maxColors={6} compact={true} />

      <div className={'section presets-section collapsible-presets ' + (presetsOpen ? 'is-open' : 'is-collapsed')}>
        <button
          type="button"
          className="section-label presets-toggle"
          onClick={() => setPresetsOpen(!presetsOpen)}
          aria-expanded={presetsOpen}
        >
          <span className="name">Presets</span>
          <span className="value">{WP.PALETTE_PRESETS.length}</span>
          <span className="preset-arrow">{presetsOpen ? '⌃' : '⌄'}</span>
        </button>
        <div className="palette-grid">
          {WP.PALETTE_PRESETS.map((p,i) => (
            <button key={i} className="palette-card" onClick={()=>setTweaks({colors:p.slice(0,3)})} title={p.slice(0,3).join(' · ')}>
              {p.slice(0,3).map((c,j) => <span key={j} style={{background:c}} />)}
            </button>
          ))}
        </div>
      </div>

      {[
        ['vectorDistance','Vector distance',0.45,1.85],
        ['vectorScale','Vector size',0.35,1.9],
        ['mousePull','Mouse pull',0,2],
        ['grain','Grain',0,1],
      ].map(([k,label,min,max]) => (
        <div className="section" key={k}>
          <div className="section-label"><span className="name">{label}</span><span className="value">{Math.round((tweaks[k]??1)*100)}</span></div>
          <input className="slider" type="range" min={min} max={max} step="0.01"
            value={tweaks[k]??1} onChange={(e)=>setTweaks({[k]:parseFloat(e.target.value)})} />
        </div>
      ))}

      <div className="help compact-help">
        Click the artwork to freeze/unfreeze the geometric composition before saving.
      </div>
    </>
  );
}

window.GeometricMode      = GeometricMode;
window.GeometricControls  = GeometricControls;
window.GEOMETRIC_DEFAULTS = {
  compositionIdx: 0,
  colors: ['#f4ede0','#08015F','#FC6C3D'],
  mousePull: 0.85, vectorDistance: 1.0, vectorScale: 1.0, grain: 0.10,
};
