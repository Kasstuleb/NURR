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
    preview:  { label: 'Preview', short: '960', long: 960, bitrate: 5500000 },
    standard: { label: 'Standard', short: 'HD', long: 1920, bitrate: 12000000 },
    high:     { label: 'High', short: '2K', long: 2560, bitrate: 18000000 },
    ultra:    { label: 'Ultra', short: '4K', long: 3840, bitrate: 28000000 },
  };
  const MOTION_STYLES = {
    drift:   { label: 'Slow drift', hint: 'smooth default' },
    breathe: { label: 'Breathe', hint: 'soft expansion' },
    current: { label: 'Current', hint: 'living backdrop' },
    pulse:   { label: 'Pulse', hint: 'event energy' },
    vivid:   { label: 'Vivid', hint: 'strong movement' },
    still:   { label: 'Still', hint: 'video poster' },
  };
  const DURATIONS = [4, 8, 12, 20, 30];

  function getRecorderMime() {
    if (typeof MediaRecorder === 'undefined') return null;
    const types = ['video/mp4;codecs=h264','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
    const type = types.find(t => MediaRecorder.isTypeSupported(t));
    if (!type) return null;
    return { mime:type, ext:type.indexOf('mp4') !== -1 ? 'mp4' : 'webm' };
  }
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
  function imageFromDataURL(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
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
  function sampleColorFromImage(img) {
    try {
      const c = document.createElement('canvas');
      c.width = 12; c.height = 12;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(img, 0, 0, 12, 12);
      const d = x.getImageData(0,0,12,12).data;
      let r=0,g=0,b=0,n=0;
      for (let i=0;i<d.length;i+=16) { r+=d[i]; g+=d[i+1]; b+=d[i+2]; n++; }
      return { r: Math.round(r/n), g: Math.round(g/n), b: Math.round(b/n) };
    } catch(e) { return { r: 160, g: 120, b: 190 }; }
  }
  function drawFrame(ctx, img, W, H, t, style, energy, colorSeed) {
    const loop = Math.PI * 2 * t;
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const base = Math.max(W / iw, H / ih);
    const c = colorSeed || { r: 160, g: 120, b: 190 };

    // v4: the motion modes are deliberately distinct. Earlier versions moved the
    // captured source too subtly, so different choices looked almost identical.
    let scale = base * 1.20;
    let x = W / 2, y = H / 2, rot = 0, alpha = 1;
    let overlayA = 0.08 * energy;
    let contrastVeil = 0.04;

    if (style === 'still') {
      scale = base;
      overlayA = 0;
      contrastVeil = 0.015;
    } else if (style === 'drift') {
      scale = base * (1.18 + energy * 0.06);
      x += Math.sin(loop) * W * 0.095 * energy;
      y += Math.cos(loop) * H * 0.070 * energy;
      rot = Math.sin(loop) * 0.010 * energy;
    } else if (style === 'breathe') {
      scale = base * (1.08 + (0.22 * (0.5 + 0.5 * Math.sin(loop))) * energy);
      x += Math.cos(loop) * W * 0.018 * energy;
      y += Math.sin(loop) * H * 0.014 * energy;
      overlayA = 0.045 * energy;
    } else if (style === 'current') {
      scale = base * (1.26 + 0.04 * Math.sin(loop));
      x += Math.sin(loop) * W * 0.16 * energy;
      y += Math.sin(loop * 2.0) * H * 0.085 * energy;
      rot = Math.cos(loop) * 0.012 * energy;
      overlayA = 0.12 * energy;
    } else if (style === 'pulse') {
      scale = base * (1.12 + Math.pow(0.5 + 0.5 * Math.sin(loop * 2), 2) * 0.16 * energy);
      alpha = 0.88 + Math.pow(0.5 + 0.5 * Math.cos(loop * 2), 2) * 0.12;
      y += Math.sin(loop * 2) * H * 0.035 * energy;
      overlayA = 0.16 * energy;
      contrastVeil = 0.08 * energy;
    } else if (style === 'vivid') {
      scale = base * (1.28 + Math.cos(loop) * 0.10 * energy);
      x += Math.sin(loop * 1.2) * W * 0.22 * energy;
      y += Math.cos(loop * 1.7) * H * 0.16 * energy;
      rot = Math.sin(loop) * 0.055 * energy;
      overlayA = 0.20 * energy;
      contrastVeil = 0.10 * energy;
    }

    ctx.clearRect(0,0,W,H);

    // Backfill edges with a blurred/color field so large motion never exposes black.
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, `rgb(${Math.max(0,c.r-30)},${Math.max(0,c.g-24)},${Math.max(0,c.b-18)})`);
    bg.addColorStop(0.5, `rgb(${Math.min(255,c.r+32)},${Math.min(255,c.g+28)},${Math.min(255,c.b+42)})`);
    bg.addColorStop(1, `rgb(${Math.max(0,c.b-20)},${Math.max(0,c.r-38)},${Math.min(255,c.g+45)})`);
    ctx.fillStyle = bg;
    ctx.fillRect(0,0,W,H);

    ctx.save();
    ctx.translate(x,y); ctx.rotate(rot); ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, -iw * scale / 2, -ih * scale / 2, iw * scale, ih * scale);
    ctx.restore();

    if (style !== 'still') {
      const cx1 = W * (0.22 + 0.22 * Math.sin(loop * (style === 'pulse' ? 2.0 : 1.0)));
      const cy1 = H * (0.28 + 0.18 * Math.cos(loop * 0.95));
      const cx2 = W * (0.74 + 0.18 * Math.cos(loop * (style === 'vivid' ? 1.6 : 0.85)));
      const cy2 = H * (0.64 + 0.18 * Math.sin(loop * 1.12));

      const g1 = ctx.createRadialGradient(cx1, cy1, 0, cx1, cy1, Math.max(W,H) * 0.74);
      g1.addColorStop(0, `rgba(${Math.min(255,c.r+70)},${Math.min(255,c.g+40)},${Math.min(255,c.b+95)},${overlayA})`);
      g1.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g1; ctx.fillRect(0,0,W,H);

      const g2 = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, Math.max(W,H) * 0.70);
      g2.addColorStop(0, `rgba(${Math.max(0,c.b-15)},${Math.max(0,c.r-25)},${Math.min(255,c.g+90)},${overlayA * 0.82})`);
      g2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g2; ctx.fillRect(0,0,W,H);

      // Style-specific texture so exported choices are visually legible.
      if (style === 'current' || style === 'vivid') {
        ctx.save();
        ctx.globalAlpha = (style === 'vivid' ? 0.070 : 0.045) * energy;
        ctx.translate(Math.sin(loop) * W * .04, Math.cos(loop) * H * .035);
        for (let i = -3; i < 9; i++) {
          const gx = (i / 8) * W + Math.sin(loop + i) * W * .06;
          const line = ctx.createLinearGradient(gx - W*.16, 0, gx + W*.16, H);
          line.addColorStop(0, 'rgba(255,255,255,0)');
          line.addColorStop(0.5, 'rgba(255,255,255,1)');
          line.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = line;
          ctx.fillRect(gx - W*.08, 0, W*.16, H);
        }
        ctx.restore();
      }

      if (style === 'pulse') {
        ctx.save();
        ctx.globalAlpha = 0.10 * energy * (0.5 + 0.5 * Math.sin(loop * 2));
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0,0,W,H);
        ctx.restore();
      }
    }

    const veil = ctx.createRadialGradient(W*.5,H*.45,0,W*.5,H*.5,Math.max(W,H)*.78);
    veil.addColorStop(0,`rgba(255,255,255,${0.018 + contrastVeil * 0.22})`);
    veil.addColorStop(1,`rgba(0,0,0,${0.045 + contrastVeil})`);
    ctx.fillStyle = veil;
    ctx.fillRect(0,0,W,H);
  }
  async function record({ source, ratio, quality, duration, style, energy, onProgress }) {
    const recorderType = getRecorderMime();
    if (!recorderType) throw new Error('Video recording is not supported in this browser. Try Safari 17+, Chrome or Edge.');
    const mimeType = recorderType.mime;
    const img = await imageFromDataURL(source);
    const colorSeed = sampleColorFromImage(img);
    const { w, h, q } = getSize(ratio, quality);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { alpha: false });
    const fps = 30;

    // Draw once before capture so the stream starts with a real frame.
    drawFrame(ctx, img, w, h, 0, style, energy, colorSeed);

    let stream;
    try { stream = canvas.captureStream(0); }
    catch(e) { stream = canvas.captureStream(fps); }
    const track = stream.getVideoTracks && stream.getVideoTracks()[0];
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: q.bitrate });
    const chunks = [];
    recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise(resolve => recorder.onstop = resolve);
    recorder.start(100);

    const total = Math.max(2, Math.round(duration * fps));
    for (let frame = 0; frame < total; frame++) {
      const t = frame / total;
      drawFrame(ctx, img, w, h, t, style, energy, colorSeed);
      if (track && typeof track.requestFrame === 'function') track.requestFrame();
      if (frame % 3 === 0 && onProgress) onProgress(Math.round((frame / total) * 100));
      // Keep real time. Safari/WebKit can otherwise record repeated still frames.
      await new Promise(r => setTimeout(r, 1000 / fps));
    }
    if (recorder.state !== 'inactive') recorder.stop();
    await stopped;
    if (track && typeof track.stop === 'function') track.stop();
    drawFrame(ctx, img, w, h, 0, style, energy, colorSeed);
    if (!chunks.length) throw new Error('The browser returned an empty video. Try lower quality or another browser.');
    return {
      blob: new Blob(chunks, { type: mimeType.split(';')[0] }),
      poster: await canvasToBlob(canvas, 'image/png'),
      width: w,
      height: h,
      mime: mimeType,
      ext: recorderType.ext
    };
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
        const result = await record({ source: src.data, ratio, quality, duration, style, energy, onProgress: setProgress });
        if (kind === 'web') {
          if (!window.JSZip) throw new Error('JSZip is missing, so the web package cannot be created.');
          const zip = await webZip(result, recipe);
          downloadBlob(zip, `nurr-web-backdrop-${recipe.ratio.replace(':','x')}-${Date.now()}.zip`);
          setDone('Web backdrop package downloaded.');
        } else {
          downloadBlob(result.blob, `nurr-motion-${recipe.ratio.replace(':','x')}-${duration}s-${style}-${Date.now()}.${result.ext || 'webm'}`);
          setDone('WebM loop downloaded.');
        }
      } catch (err) { setError(err.message || String(err)); }
      finally { setBusy(false); setProgress(100); }
    };

    return (
      <div className="motion-export-tab">
        <div className="motion-export-brief"><strong>Motion assets</strong><span>Clean offscreen export from the active visual. No UI is recorded.</span></div>
        <div className="motion-grid motion-ratios">{Object.entries(MOTION_RATIOS).map(([key,r])=><button key={key} className={'motion-chip'+(ratio===key?' active':'')} onClick={()=>setRatio(key)} disabled={busy}><strong>{r.label}</strong><span>{r.hint}</span></button>)}</div>
        <div className="motion-grid motion-styles">{Object.entries(MOTION_STYLES).map(([key,m])=><button key={key} className={'motion-chip'+(style===key?' active':'')} onClick={()=>setStyle(key)} disabled={busy}><strong>{m.label}</strong><span>{m.hint}</span></button>)}</div>
        <div className="motion-inline-controls"><div className="motion-field"><label>Duration</label><select value={duration} onChange={e=>setDuration(Number(e.target.value))} disabled={busy}>{DURATIONS.map(d=><option key={d} value={d}>{d}s</option>)}</select></div><div className="motion-field"><label>Quality</label><select value={quality} onChange={e=>setQuality(e.target.value)} disabled={busy}>{Object.entries(MOTION_QUALITY).map(([k,q])=><option key={k} value={k}>{q.label} · {q.short}</option>)}</select></div><div className="motion-field"><label>Energy <span>{Math.round(energy*100)}%</span></label><input type="range" min="0.15" max="1" step="0.01" value={energy} onChange={e=>setEnergy(Number(e.target.value))} disabled={busy}/></div></div>
        {busy && <div className="motion-progress"><div style={{width:progress+'%'}} /></div>}
        {error && <div className="vid-error">{error}</div>}
        {done && <div className="vid-done">✓ {done}</div>}
        <div className="motion-actions"><button className="btn primary btn-italic" onClick={()=>run('video')} disabled={busy}>Export video loop ↓</button><button className="btn btn-italic" onClick={()=>run('web')} disabled={busy}>Export web package ↓</button><button className="btn" onClick={()=>run('recipe')} disabled={busy}>Recipe JSON</button></div>
        <div className="vid-hint">Web package includes video, poster frame, CSS, JS, demo HTML and recipe JSON. This version creates a real moving loop from the finished visual result. Module-native renderers can be added later.</div>
      </div>
    );
  }

  window.MotionExportControls = MotionExportControls;
})();
