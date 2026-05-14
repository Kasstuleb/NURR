// abstract.js — Mode 4: Abstract poster generator. Rebuilt.
//
// Key changes from previous version:
//   • No `lighter` blend mode (caused neon blow-out). Uses source-over + screen carefully.
//   • Forms rendered on tiny offscreen canvas, then UPSCALED — creates rich natural blur.
//   • 6 curated formations, each with distinct compositional character.
//   • Formation previews rendered as small live canvases.
//   • B&W mode uses luminance-accurate desaturation + deeper grain.
//
// Exposes: window.AbstractMode, window.AbstractControls, window.ABSTRACT_DEFAULTS

const { useEffect: abUE, useRef: abUR, useState: abUS, useCallback: abUCB } = React;

// ─── Formation definitions ────────────────────────────────────────────────────
const FORMATIONS = [
  { id:'vapor',  label:'Vapor',  desc:'Atmospheric color clouds' },
  { id:'solar',  label:'Solar',  desc:'Central orb with satellite halos' },
  { id:'drift',  label:'Drift',  desc:'Diagonal editorial arrangement' },
  { id:'veil',   label:'Veil',   desc:'Horizontal gradient bands' },
  { id:'corona', label:'Corona', desc:'Concentric rings, geometric depth' },
  { id:'mass',   label:'Mass',   desc:'Dominant form + accents, Swiss poster' },
];

// ─── Color utilities ──────────────────────────────────────────────────────────
// hex → 'rgba(r,g,b,a)' string
function hexA(hex, a) {
  const [r,g,b] = WP.hexToRGB(hex);
  return `rgba(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)},${Math.min(1,Math.max(0,a))})`;
}
// hex → slightly darkened hex (for backgrounds)
function shade(hex, factor) {
  const [r,g,b] = WP.hexToRGB(hex);
  return WP.rgbToHex(r*factor, g*factor, b*factor);
}
// Luminance-accurate desaturation
function toGray(hex) {
  const [r,g,b] = WP.hexToRGB(hex);
  const lum = r*0.299 + g*0.587 + b*0.114;
  return WP.rgbToHex(lum, lum, lum);
}
// Seeded pseudo-random, stable per frame
function rand(seed, i) {
  const v = Math.sin(seed*1.618 + i*127.1) * 43758.5453;
  return v - Math.floor(v);
}

// ─── Core drawing ─────────────────────────────────────────────────────────────
// Draw a soft radial ellipse at (ex,ey) scaled by (rx,ry), with alpha gradient.
// Works in "unit" space before ctx transforms, or in pixel space if you prefer.
function drawEllipseGlow(g, ex, ey, rx, ry, color, alpha, rot=0) {
  if (rx<=0||ry<=0||alpha<=0) return;
  g.save();
  g.translate(ex, ey);
  if (rot) g.rotate(rot);
  // Scale so we can use a unit circle with a radial gradient
  g.scale(rx, ry);
  const grd = g.createRadialGradient(0,0,0, 0,0,1);
  grd.addColorStop(0,   hexA(color, alpha));
  grd.addColorStop(0.4, hexA(color, alpha * 0.58));
  grd.addColorStop(0.75,hexA(color, alpha * 0.18));
  grd.addColorStop(1,   hexA(color, 0));
  g.fillStyle = grd;
  g.beginPath(); g.arc(0, 0, 1, 0, Math.PI*2); g.fill();
  g.restore();
}

// Render a formation on context g at canvas size (sw×sh) in "small" coordinates.
// cx/cy: center in small coords. sW/sH: small canvas dims. seed, dist, size, density: tweaks.
// pal: array of hex colors (already B&W-converted if needed).
function renderFormation(g, sw, sh, formation, pal, seed, dist, size, density) {
  const maxD = Math.max(sw, sh);
  const cx = sw * 0.5, cy = sh * 0.5;
  const count = Math.max(4, Math.round(5 + density * 10));
  const S = Math.max(0.1, size), D = Math.max(0.1, dist);

  // Helper: get palette color, wrapping
  const col = (i) => pal[((i%pal.length)+pal.length)%pal.length] || '#888';

  switch (formation) {
    case 'vapor': {
      // Multiple overlapping translucent ellipses arranged in an orbit.
      // screen blend on top of each other = rich color mixing without blow-out.
      g.globalCompositeOperation = 'source-over';
      // Draw from outside-in so center forms appear on top
      for (let i=count-1; i>=0; i--) {
        const ang = (i/count)*Math.PI*2 + rand(seed,i+20)*0.9;
        const spreadX = sw * 0.30 * D;
        const spreadY = sh * 0.22 * D;
        const ex = cx + Math.cos(ang)*spreadX + (rand(seed,i+40)-0.5)*sw*0.08;
        const ey = cy + Math.sin(ang)*spreadY + (rand(seed,i+41)-0.5)*sh*0.06;
        const rx = maxD * S * (0.24 + rand(seed,i)*0.22);
        const ry = maxD * S * (0.16 + rand(seed,i+1)*0.15);
        const rot = rand(seed,i+3)*Math.PI;
        const alpha = 0.62 + rand(seed,i+6)*0.25;
        drawEllipseGlow(g, ex, ey, rx, ry, col(i), alpha, rot);
      }
      // Central brightening core
      drawEllipseGlow(g, cx, cy, maxD*S*0.18, maxD*S*0.16, col(0), 0.55, 0);
      break;
    }

    case 'solar': {
      // A single dominant orb system: outer atmosphere + mid ring + bright core + satellites.
      // Inspired by vinyl record label / sun halo photography.
      g.globalCompositeOperation = 'source-over';
      const R = maxD * S * 0.38;
      // Wide outer atmosphere
      drawEllipseGlow(g, cx, cy, R*1.9, R*1.7, col(0), 0.38, 0);
      // Mid halo
      drawEllipseGlow(g, cx, cy, R*1.2, R*1.1, col(1%pal.length), 0.60, 0);
      // Tight inner ring — different color for contrast
      drawEllipseGlow(g, cx, cy, R*0.72, R*0.68, col(2%pal.length), 0.72, 0);
      // Bright core
      drawEllipseGlow(g, cx, cy, R*0.28, R*0.26, col(0), 0.90, 0);
      // Satellites (3 small orbs on ring)
      for (let i=0; i<3; i++) {
        const a = (i/3)*Math.PI*2 + seed*0.0007 + 0.5;
        const sd = R * 1.65 * D;
        const sr = maxD * S * (0.028 + rand(seed,i+7)*0.030);
        drawEllipseGlow(g, cx+Math.cos(a)*sd, cy+Math.sin(a)*sd*0.78, sr, sr, col((i+1)%pal.length), 0.82, 0);
      }
      break;
    }

    case 'drift': {
      // Editorial: diagonal row of forms, sizes vary, slight height offset.
      // Like type set diagonally, or a composition of records on a shelf.
      g.globalCompositeOperation = 'source-over';
      const n = Math.min(6, count);
      for (let i=0; i<n; i++) {
        const f = (i-(n-1)/2) / Math.max(1,n-1);
        const ex = cx + f*sw*0.48*D;
        const ey = cy + f*sh*0.28*D + (rand(seed,i+4)-0.5)*sh*0.15;
        const rx = maxD*S*(0.15+rand(seed,i)*0.16);
        const ry = maxD*S*(0.11+rand(seed,i+1)*0.12);
        const rot = rand(seed,i+6)*1.1;
        const alpha = 0.68 + rand(seed,i+2)*0.22;
        drawEllipseGlow(g, ex, ey, rx, ry, col(i), alpha, rot);
      }
      break;
    }

    case 'veil': {
      // Stacked horizontal gradient bands — like atmospheric layers or geological strata.
      // Each band bleeds into adjacent ones. Serene, architectural.
      g.globalCompositeOperation = 'source-over';
      const layers = Math.max(3, pal.length + 1);
      // Slight angle for dynamism
      const angle = (rand(seed,90) - 0.5) * 0.25;
      g.save(); g.translate(cx,cy); g.rotate(angle); g.translate(-cx,-cy);
      for (let i=0; i<layers; i++) {
        const f = i/(layers-1);
        const y = sh * f;
        const bandH = sh * (0.50 + D*0.20);
        const grd = g.createLinearGradient(0, y-bandH/2, 0, y+bandH/2);
        grd.addColorStop(0,    hexA(col(i), 0));
        grd.addColorStop(0.38, hexA(col(i), 0.70 * S));
        grd.addColorStop(0.62, hexA(col((i+1)%pal.length), 0.65 * S));
        grd.addColorStop(1,    hexA(col((i+1)%pal.length), 0));
        g.fillStyle = grd;
        g.fillRect(-sw*0.2, y-bandH/2, sw*1.4, bandH);
      }
      g.restore();
      break;
    }

    case 'corona': {
      // Concentric ellipses emanating from a slightly off-center point.
      // Geometric, hypnotic — inspired by record grooves and topographic maps.
      g.globalCompositeOperation = 'source-over';
      const rings = Math.max(5, Math.round(6 + density*9));
      const ox = cx + (rand(seed,1)-0.5)*sw*0.12*D;
      const oy = cy + (rand(seed,2)-0.5)*sh*0.09*D;
      // Draw from outermost to innermost (innermost appears on top)
      for (let i=rings; i>=0; i--) {
        const progress = i/rings;
        const r = maxD*S*(0.04 + progress*0.48*D);
        const alpha = 0.08 + progress*0.62;
        // Alternate palette colors on rings for depth
        drawEllipseGlow(g, ox, oy, r*1.35, r, col(i), alpha, 0);
      }
      // Inner bright core
      drawEllipseGlow(g, ox, oy, maxD*S*0.045, maxD*S*0.04, col(0), 0.88, 0);
      break;
    }

    case 'mass': {
      // One dominant off-center form + 1-2 satellite accents.
      // Swiss-poster minimal: a big shape claims space, smaller ones create tension.
      g.globalCompositeOperation = 'source-over';
      const mainR = maxD*S*0.46;
      const offX = (rand(seed,1)-0.5)*sw*0.14;
      const offY = (rand(seed,2)-0.5)*sh*0.10;
      // Main mass — large, slightly elliptical
      drawEllipseGlow(g, cx+offX, cy+offY, mainR*1.45, mainR*1.25, col(0), 0.75, rand(seed,3)*0.5);
      // Secondary accent — different color, offset from main
      const aR = maxD*S*0.17;
      const aAng = rand(seed,5)*Math.PI*2;
      const aDist = mainR*1.6*D;
      const ax = cx+offX + Math.cos(aAng)*aDist;
      const ay = cy+offY + Math.sin(aAng)*aDist*0.8;
      drawEllipseGlow(g, ax, ay, aR, aR*0.88, col(1%pal.length), 0.88, rand(seed,7)*1.4);
      // Optional third accent if palette has 3+ colors
      if (pal.length > 2) {
        const a2R = maxD*S*0.09;
        const a2Ang = aAng + Math.PI*0.65;
        const a2x = cx+offX + Math.cos(a2Ang)*aDist*0.75;
        const a2y = cy+offY + Math.sin(a2Ang)*aDist*0.65;
        drawEllipseGlow(g, a2x, a2y, a2R, a2R*0.8, col(2), 0.80, 0);
      }
      break;
    }

    default: {
      // fallback: scattered blobs
      g.globalCompositeOperation = 'source-over';
      for(let i=0; i<count; i++) {
        const ex=cx+(rand(seed,i)-0.5)*sw*0.55*D;
        const ey=cy+(rand(seed,i+8)-0.5)*sh*0.40*D;
        const r=maxD*S*(0.09+rand(seed,i+2)*0.18);
        drawEllipseGlow(g,ex,ey,r*1.3,r,col(i),0.60,rand(seed,i+5)*Math.PI);
      }
    }
  }
}

// ─── Main draw function (called each frame) ────────────────────────────────────
function drawAbstract(ctx, w, h, tweaks, mouseRef, seedRef) {
  const rawPal = tweaks.colors || ['#08015F','#FC6C3D','#98F2F4'];

  // Build working palette
  let pal;
  if (tweaks.bw) {
    const grays = rawPal.map(toGray);
    pal = tweaks.invert ? grays.map(g => { const [r]= WP.hexToRGB(g); return WP.rgbToHex(1-r,1-r,1-r); }) : grays;
  } else {
    pal = tweaks.invert ? [...rawPal].reverse() : rawPal;
  }

  const mouse = mouseRef?.current || {x:.5,y:.5,chaosX:.5,chaosY:.5};
  const seed = seedRef.current;

  // ---- Background ----
  const bgColor = pal[0];
  const bg = ctx.createRadialGradient(w*0.38, h*0.44, 0, w*0.55, h*0.56, Math.max(w,h)*0.9);
  bg.addColorStop(0, bgColor);
  bg.addColorStop(0.5, bgColor);
  bg.addColorStop(1, shade(bgColor, tweaks.bw ? (tweaks.invert?1.15:0.72) : 0.78));
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

  // ---- Formation on tiny offscreen canvas ----
  // Rendering at 1/SCALE size then upscaling = free natural blur.
  // Blur intensity controlled by tweaks.blur (affects SCALE and also a second fine-blur pass).
  const blurAmt = Math.max(0, tweaks.blur || 0);
  // Base scale: 14 = very soft. As blur decreases, scale decreases = crisper forms.
  const SCALE = Math.max(6, Math.round(8 + blurAmt * 16));
  const sw = Math.max(12, Math.ceil(w/SCALE));
  const sh = Math.max(8, Math.ceil(h/SCALE));

  // Mouse influence on center position
  const mx = mouse.chaosX||0.5, my = mouse.chaosY||0.5;
  const dist = Math.max(0.1, tweaks.vectorDistance||1);
  const size = Math.max(0.1, tweaks.vectorSize||1);
  const density = Math.max(0, tweaks.glassDensity||0.5);
  const intensity = Math.max(0.1, tweaks.intensity||0.8);

  const off = document.createElement('canvas');
  off.width = sw; off.height = sh;
  const g = off.getContext('2d');

  // Shift center by mouse
  const origTranslate = { x: sw*(mx-0.5)*0.12, y: sh*(my-0.5)*0.08 };
  g.translate(origTranslate.x, origTranslate.y);

  renderFormation(g, sw, sh, tweaks.formation||'vapor', pal.slice(1), seed, dist, size*intensity, density);

  g.setTransform(1,0,0,1,0,0); // reset transform

  // ---- Blit offscreen to main (upscaling = soft natural blur) ----
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(off, 0, 0, w, h);
  ctx.restore();

  // ---- Fine blur pass: softens any remaining aliasing at the upscale border ----
  if (blurAmt > 0.08) {
    const finePx = Math.round(blurAmt * 18);
    ctx.save();
    ctx.filter = `blur(${finePx}px)`;
    ctx.globalAlpha = 0.18;
    // (self-draw removed — use snapshot for loopback);
    ctx.restore();
  }

  // ---- Grain ----
  if (tweaks.grain > 0) {
    const step = Math.max(2, Math.round(9 - tweaks.grain*6));
    const alpha = tweaks.bw
      ? 0.025 + tweaks.grain * 0.095   // heavier grain for B&W (film look)
      : 0.010 + tweaks.grain * 0.048;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'overlay';
    for (let y=0; y<h; y+=step) {
      for (let x=0; x<w; x+=step) {
        const v=(Math.random()*255)|0;
        ctx.fillStyle=`rgb(${v},${v},${v})`; ctx.fillRect(x,y,step,step);
      }
    }
    ctx.restore();
  }

  // ---- Vignette (always, subtle) ----
  const vStrength = 0.08 + (tweaks.bw ? 0.14 : 0);
  const vg = ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*0.12, w/2,h/2,Math.max(w,h)*0.80);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, `rgba(0,0,0,${vStrength})`);
  ctx.fillStyle=vg; ctx.fillRect(0,0,w,h);
}

// ─── Formation thumbnail component (tiny live canvas preview) ─────────────────
function FormationThumb({ id, label, active, colors, seed, onClick }) {
  const canvasRef = abUR(null);

  abUE(() => {
    const canvas = canvasRef.current; if(!canvas) return;
    const W=canvas.width, H=canvas.height;
    const ctx=canvas.getContext('2d');
    const pal = colors.slice(1); // skip bg for form color
    const off=document.createElement('canvas'); off.width=W; off.height=H;
    const g=off.getContext('2d');
    // Simple bg
    ctx.fillStyle=colors[0]||'#08015F'; ctx.fillRect(0,0,W,H);
    // Draw formation at thumb scale
    renderFormation(g, W, H, id, pal.length>0?pal:[colors[0]], seed, 0.85, 0.9, 0.5);
    ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
    ctx.drawImage(off,0,0);
  }, [id, colors, seed]);

  return (
    <button className={'formation-card'+(active?' active':'')} onClick={onClick} title={label}>
      <canvas ref={canvasRef} className="formation-canvas" width="80" height="60" />
      <span className="formation-label">{label}</span>
    </button>
  );
}

// ─── AbstractMode component ───────────────────────────────────────────────────
function AbstractMode({ tweaks, registerSnapshot, mouseRef }) {
  const canvasRef = abUR(null);
  const seedRef = abUR(Math.random()*10000);

  abUE(() => {
    if (tweaks.seed !== undefined) seedRef.current = tweaks.seed;
  }, [tweaks.seed]);

  const draw = abUCB((targetW, targetH) => {
    const canvas=canvasRef.current; if(!canvas) return;
    const ctx=canvas.getContext('2d');
    const w=targetW||canvas.width, h=targetH||canvas.height;
    // Clear to prevent stale pixels at very small blur settings
    ctx.clearRect(0,0,w,h);
    drawAbstract(ctx, w, h, tweaks, mouseRef, seedRef);
  }, [tweaks, mouseRef]);

  // Canvas resize
  abUE(() => {
    const resize=()=>{
      const c=canvasRef.current; if(!c) return;
      const d=Math.min(devicePixelRatio||1,2);
      c.width=Math.round(innerWidth*d); c.height=Math.round(innerHeight*d);
      c.style.width=innerWidth+'px'; c.style.height=innerHeight+'px';
      draw(c.width,c.height);
    };
    resize();
    addEventListener('resize',resize);
    return ()=>removeEventListener('resize',resize);
  }, [draw]);

  // Animation loop
  WP.useAnimationLoop(() => {
    const c=canvasRef.current; if(c) draw(c.width,c.height);
  }, [draw]);

  // Snapshot
  abUE(() => {
    registerSnapshot(() => {
      const c=canvasRef.current; if(!c) return;
      const ow=c.width,oh=c.height,osw=c.style.width,osh=c.style.height;
      c.width=3840; c.height=2160; draw(3840,2160);
      WP.downloadCanvas(c,`abstract-${Date.now()}.png`);
      requestAnimationFrame(()=>{ c.width=ow;c.height=oh;c.style.width=osw;c.style.height=osh; });
    });
  }, [draw, registerSnapshot]);

  return <canvas ref={canvasRef} className="stage" />;
}

// ─── AbstractControls ─────────────────────────────────────────────────────────
function AbstractControls({ tweaks, setTweaks }) {
  const setColors = (next) => setTweaks({ colors: next.slice(0,4) });
  const PaletteEditor = window.NurrPaletteEditor;
  const thumbSeed = abUR(tweaks.seed || Math.random()*10000);

  return (
    <>
      {/* Formation grid */}
      <div className="section">
        <div className="section-label">
          <span className="name">Formation</span>
          <span className="value">{tweaks.formation}</span>
        </div>
        <div className="formation-grid">
          {FORMATIONS.map(f => (
            <FormationThumb
              key={f.id} id={f.id} label={f.label}
              active={tweaks.formation===f.id}
              colors={tweaks.colors}
              seed={thumbSeed.current}
              onClick={()=>setTweaks({formation:f.id, seed:Math.random()*10000})}
            />
          ))}
        </div>
        <div className="btn-row" style={{marginTop:8}}>
          <button className="btn btn-italic"
            onClick={()=>setTweaks({formation:FORMATIONS[Math.floor(Math.random()*FORMATIONS.length)].id, seed:Math.random()*10000})}>
            Randomize
          </button>
        </div>
      </div>

      {/* Palette */}
      <PaletteEditor colors={tweaks.colors} setColors={setColors} minColors={2} maxColors={4} allowAdd={true} compact={true} />

      {/* Presets */}
      <div className="section">
        <div className="section-label">
          <span className="name">Presets</span>
          <span className="value">{WP.PALETTE_PRESETS.length}</span>
        </div>
        <div className="palette-grid">
          {WP.PALETTE_PRESETS.map((p,i) => (
            <button key={i} className="palette-card" onClick={()=>setTweaks({colors:p.slice(0,Math.max(2,Math.min(4,tweaks.colors.length)))})} title={p.join(' · ')}>
              {p.map((c,j)=><span key={j} style={{background:c}}/>)}
            </button>
          ))}
        </div>
      </div>

      {/* B&W / Invert toggles */}
      <div className="section">
        <div className="toggle-row">
          <button className={'btn'+(tweaks.bw?' active':'')} onClick={()=>setTweaks({bw:!tweaks.bw})}>B&amp;W</button>
          <button className={'btn'+(tweaks.invert?' active':'')} onClick={()=>setTweaks({invert:!tweaks.invert})}>Invert</button>
        </div>
      </div>

      {/* Sliders */}
      {[
        ['blur',           'Blur',            0,   1],
        ['vectorDistance', 'Spread',          0.3, 2.0],
        ['vectorSize',     'Scale',           0.2, 2.0],
        ['glassDensity',   'Density',         0,   1],
        ['intensity',      'Intensity',       0.1, 1.8],
        ['grain',          'Grain',           0,   1],
      ].map(([k,label,min,max]) => (
        <div className="section" key={k}>
          <div className="section-label">
            <span className="name">{label}</span>
            <span className="value">{Math.round((tweaks[k]||0)*100)}</span>
          </div>
          <input className="slider" type="range" min={min} max={max} step="0.01"
            value={tweaks[k]||0} onChange={e=>setTweaks({[k]:parseFloat(e.target.value)})} />
        </div>
      ))}
    </>
  );
}

window.AbstractMode     = AbstractMode;
window.AbstractControls = AbstractControls;
window.ABSTRACT_DEFAULTS = {
  formation:     'vapor',
  colors:        ['#08015F','#FC6C3D','#98F2F4','#E38BB8'],
  bw:            false,
  invert:        false,
  blur:          0.42,
  vectorDistance:1.0,
  vectorSize:    1.0,
  glassDensity:  0.48,
  intensity:     0.88,
  grain:         0.08,
  seed:          Math.random()*10000,
};
