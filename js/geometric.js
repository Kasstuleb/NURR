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

// ─── GeometricMode ────────────────────────────────────────────────────────────
function GeometricMode({ tweaks, registerSnapshot, mouseRef }) {
  const canvasRef = geomUR(null);
  WP.useStageSize(canvasRef);
  const stateRef = geomUR({ pulse:0, prevIdx:0, transition:0 });

  geomUE(() => {
    const onDown = (e) => {
      if (e.target.closest('.panel,.icon-btn,.rail,.layout-card,.palette-card,.nature-thumb,.swatch,.color-wheel-card,.eyedropper-follow,button,input,.drop-zone')) return;
      stateRef.current.pulse = 1.0;
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, []);

  const drawAt = (W, H) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const palette = tweaks.colors;
    const comp = GEOMETRIC_COMPOSITIONS[tweaks.compositionIdx % GEOMETRIC_COMPOSITIONS.length];

    ctx.fillStyle = palette[comp.bg] || '#ffffff';
    ctx.fillRect(0, 0, W, H);

    const unit = Math.max(W, H);
    const offX = (W - unit) / 2, offY = (H - unit) / 2;
    const m = mouseRef.current;
    const mvx = (m.chaosX - 0.5) * tweaks.mousePull * 2.0;
    const mvy = (m.chaosY - 0.5) * tweaks.mousePull * 2.0;
    const t = performance.now() / 1000;
    const pulse = stateRef.current.pulse;

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

      if (s.kind==='rect') {
        const w=s.w*unit*(tweaks.vectorScale??1), h=s.h*unit*(tweaks.vectorScale??1);
        const rot=(s.rot||0)+fall*mvx*0.4+wave*0.3;
        ctx.save(); ctx.translate(px,py); ctx.rotate(rot); ctx.fillRect(-w/2,-h/2,w,h); ctx.restore();
      } else if (s.kind==='circle') {
        const r=s.r*unit*(tweaks.vectorScale??1)*(1+wave*0.15+fall*0.06);
        ctx.beginPath(); ctx.arc(px,py,r,0,Math.PI*2); ctx.fill();
      } else if (s.kind==='blob') {
        const r=s.r*unit*(tweaks.vectorScale??1)*(1+wave*0.1);
        const amp=(s.blobAmp||0.18)+fall*0.06+Math.sin(t*0.6+i)*0.02;
        const seed=(s.seed||0)+t*0.3+fall*1.5;
        ctx.save(); ctx.translate(px,py); drawBlob(ctx,0,0,r,seed,amp,0); ctx.restore();
      }
    }

    // Film grain
    if (tweaks.grain > 0) {
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
    registerSnapshot(() => {
      const canvas=canvasRef.current; if(!canvas) return;
      const ow=canvas.width, oh=canvas.height, osw=canvas.style.width, osh=canvas.style.height;
      canvas.width=3840; canvas.height=2160; drawAt(3840,2160);
      WP.downloadCanvas(canvas,`geometric-${Date.now()}.png`);
      requestAnimationFrame(()=>{ canvas.width=ow; canvas.height=oh; canvas.style.width=osw; canvas.style.height=osh; });
    });
  }, [tweaks, registerSnapshot]);

  return <canvas ref={canvasRef} className="stage" />;
}

// ─── GeometricControls ────────────────────────────────────────────────────────
function GeometricControls({ tweaks, setTweaks }) {
  const setColors = (next) => setTweaks({ colors: next.slice(0, 3) });
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

      <PaletteEditor colors={tweaks.colors} setColors={setColors} countLabel="3 colors" allowAdd={false} minColors={3} maxColors={3} compact={true} />

      <div className="section presets-section">
        <div className="section-label">
          <span className="name">Presets</span>
          <span className="value">{WP.PALETTE_PRESETS.length}</span>
        </div>
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
        Click the canvas to cycle compositions. Mouse pulls shapes live.
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
