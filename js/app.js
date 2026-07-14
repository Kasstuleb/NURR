// app.js — NURR v4.
// Active modes: gradient | abstract | geometric | nature/photo. Dormant legacy modes are intentionally not loaded in public build.
// Panel: Create / Library + restored Export panel with Still / Motion / Web / Recipe.
// Layer capture: every save stores type, module, hasAlpha, alphaPreview, tweaks snapshot.

const { useEffect, useRef, useState, useCallback } = React;

const MODULE_LAYER_TYPE = {
  gradient: 'background', abstract: 'background',
  nature: 'background', geometric: 'background',
};
const MODULE_HAS_ALPHA = { geometric: true };
const MODULE_DISPLAY = { gradient:'gradient', abstract:'abstract', geometric:'flow', nature:'photo' };
const moduleDisplay = (id) => MODULE_DISPLAY[id] || id;

const EXPORT_SIZES = {
  square:   { label: '1×1',   w: 1080, h: 1080, ratio: '1:1' },
  wide:     { label: '16:9',  w: 1920, h: 1080, ratio: '16:9' },
  story:    { label: '9:16',  w: 1080, h: 1920, ratio: '9:16' },
  portrait: { label: '4:5',   w: 1600, h: 2000, ratio: '4:5' },
  qhd:      { label: '2K',    w: 2560, h: 1440, ratio: '16:9' },
};

const EXPORT_PANEL_KEYS = ['square', 'wide', 'story', 'portrait', 'qhd'];
const EXPORT_FORMATS = {
  png:  { label: 'PNG',  mime: 'image/png',  ext: 'png' },
  jpg:  { label: 'JPG',  mime: 'image/jpeg', ext: 'jpg' },
  webp: { label: 'WEBP', mime: 'image/webp', ext: 'webp' },
  pdf:  { label: 'PDF',  mime: 'application/pdf', ext: 'pdf' },
};

// Motion / video export lives entirely in js/motion-export.js (window.MotionExportControls).


// ─── LibraryTab ──────────────────────────────────────────────────────────────
function LibraryTab({ library, onDelete, onPreview, onClear, onDownloadAll, onOpenExport }) {
  if (!library.length) {
    return (
      <div className="lib-empty">
        <div className="lib-empty-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M21 19V8a2 2 0 0 0-2-2h-3.17l-1.84-2H10l-1.84 2H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2Z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
        </div>
        <p>Library empty</p>
        <p className="lib-empty-hint">Press <kbd>S</kbd> or the camera icon to save the current view.</p>
      </div>
    );
  }

  const objects     = library.filter(l => l.type === 'object');
  const backgrounds = library.filter(l => l.type === 'background');

  const renderSection = (items, title, hint) => (
    <div className="lib-section" key={title}>
      <div className="lib-sect-label">
        {title}
        {hint && <span className="lib-sect-hint">{hint}</span>}
      </div>
      <div className="lib-grid">
        {items.map(item => (
          <div className="lib-tile" key={item.id}>
            <div className="lib-thumb" onClick={() => onPreview(item.preview)}>
              <img src={item.preview} alt="" />
              <span className={'lib-type-badge lib-type-' + item.type}>
                {item.type === 'object' ? 'OBJ' : 'BG'}
              </span>
              <span className="lib-mod-badge">{moduleDisplay(item.module).slice(0, 3).toUpperCase()}</span>
              {item.hasAlpha && <span className="lib-alpha-badge" title="Has transparent layer">α</span>}
              <button className="lib-delete" onClick={(e) => { e.stopPropagation(); onDelete(item.id); }} title="Remove">×</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="library-tab">
      {objects.length     > 0 && renderSection(objects,     `Objects · ${objects.length}`,     '— α = has transparency')}
      {backgrounds.length > 0 && renderSection(backgrounds, `Backgrounds · ${backgrounds.length}`, null)}
      <div className="lib-footer">
        <button className="btn btn-italic" onClick={onOpenExport}>Export panel</button>
        <button className="btn btn-italic" onClick={onDownloadAll}>Download ZIP</button>
        <button className="btn" onClick={onClear}>Clear</button>
      </div>
    </div>
  );
}

// ─── NymphLanding ───────────────────────────────────────────────────────────
function NymphLanding({ onEnter }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !window.NYMPHLanding || !window.NYMPHLanding.mount) return undefined;
    return window.NYMPHLanding.mount(canvasRef.current);
  }, []);

  return (
    <section className="nymph-landing" aria-label="NYMPH landing page">
      <canvas ref={canvasRef} className="nymph-landing-canvas" />
      <div className="nymph-landing-grain" aria-hidden="true" />
      <main className="nymph-landing-content">
        <button type="button" className="nymph-landing-logo" onClick={onEnter} aria-label="Enter NYMPH">
          <img src="assets/logos/nymph-logo-full.svg" alt="NYMPH" className="nymph-landing-full-logo" />
        </button>
        <button type="button" className="nymph-enter" onClick={onEnter} aria-label="Enter NYMPH">
          <span aria-hidden="true">→</span>
        </button>
      </main>
    </section>
  );
}


// ─── App ─────────────────────────────────────────────────────────────────────
function App() {
  const [mode, setMode]           = useState('gradient');
  const [page, setPage]           = useState('main');
  const [showLanding, setShowLanding] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState('create');
  const [panelTone, setPanelTone] = useState('dark');
  const panelToneRef = useRef('dark');
  const panelToneSwitchRef = useRef(0);

  useEffect(() => {
    document.body.classList.toggle('nymph-landing-active', showLanding);
    return () => document.body.classList.remove('nymph-landing-active');
  }, [showLanding]);

  const [gradientTweaks,  setGradientTweaks]  = useState(window.GRADIENT_DEFAULTS);
  const [geometricTweaks, setGeometricTweaks] = useState(window.GEOMETRIC_DEFAULTS);
  const [natureTweaks,    setNatureTweaks]    = useState(window.NATURE_DEFAULTS);
  const [abstractTweaks,  setAbstractTweaks]  = useState(window.ABSTRACT_DEFAULTS);

  const [natureImages, setNatureImages] = useState([]);
  const [currentImg,   setCurrentImg]   = useState(null);
  useEffect(() => {
    window.discoverNatureImages().then(imgs => { if (imgs.length) { setNatureImages(imgs); setCurrentImg(imgs[0]); } });
  }, []);
  const onFiles = (files) => {
    const urls = files.map(f => URL.createObjectURL(f));
    setNatureImages(prev => [...prev, ...urls]);
    if (urls.length) setCurrentImg(urls[0]);
  };

  // History
  const [history, setHistory] = useState([]);
  const suppressHistory = useRef(false);
  const currentState = () => ({ mode, gradientTweaks, geometricTweaks, natureTweaks, abstractTweaks, currentImg });
  const pushHistory = () => { if (suppressHistory.current) return; setHistory(h => [...h.slice(-11), currentState()]); };

  const changeMode = (next) => {
    if (next !== mode) { pushHistory(); setMode(next); }
  };

  const patchGradient  = (p) => { pushHistory(); setGradientTweaks(s  => ({ ...s, ...p })); };
  const patchGeometric = (p) => { pushHistory(); setGeometricTweaks(s => ({ ...s, ...p })); };
  const patchNature    = (p) => { pushHistory(); setNatureTweaks(s    => ({ ...s, ...p })); };
  const patchAbstract  = (p) => { pushHistory(); setAbstractTweaks(s  => ({ ...s, ...p })); };

  const undo = () => {
    setHistory(h => {
      const prev = h[h.length - 1]; if (!prev) return h;
      suppressHistory.current = true;
      setMode(prev.mode);
      setGradientTweaks(prev.gradientTweaks);
      setGeometricTweaks(prev.geometricTweaks);
      setNatureTweaks(prev.natureTweaks);
      setAbstractTweaks(prev.abstractTweaks);
      if (prev.currentImg != null) setCurrentImg(prev.currentImg);
      setTimeout(() => { suppressHistory.current = false; }, 0);
      return h.slice(0, -1);
    });
  };

  // Snapshot / library
  const snapshotRef       = useRef(null);
  const registerSnapshot  = useCallback((fn) => { snapshotRef.current = fn; }, []);

  const [library, setLibrary]           = useState([]);
  const [toast, setToast]               = useState({ show: false, text: '' });
  const [previewImage, setPreviewImage] = useState(null);
  const [exportChecks, setExportChecks] = useState({});
  const [exportTab, setExportTab] = useState('still');
  const [exportFormats, setExportFormats] = useState({ png: true, jpg: false, webp: false, pdf: false });
  const [exportStatus, setExportStatus] = useState({ busy: false, text: '' });

  const showToast = (text = '✓ Saved') => {
    setToast({ show: true, text });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 1800);
  };

  const doSnapshot = async (sizeKey = 'qhd') => {
    const ref = snapshotRef;
    if (!ref.current) { showToast('⚠ Not ready yet'); return; }
    const size = EXPORT_SIZES[sizeKey] || EXPORT_SIZES.qhd;
    const result = ref.current({ width: size.w, height: size.h, returnDataUrl: true });
    const source = typeof result === 'string' ? result : (result && result.dataUrl);
    if (!source) { showToast('⚠ Export failed'); return; }
    try {
      const img = await dataUrlToImage(source);
      const canvas = document.createElement('canvas');
      canvas.width = size.w; canvas.height = size.h;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, size.w, size.h);
      ctx.drawImage(img, 0, 0, size.w, size.h);
      // Grain is produced once, in-shader, at render resolution. No second
      // canvas grain pass here — that was the source of the dirty/blocky look.
      const blob = await canvasToBlob(canvas, 'image/png');
      downloadBlob(blob, `nymph-${mode}-${size.label}-${Date.now()}.png`);
    } catch (err) {
      console.error('Snapshot export failed', err);
      const a = document.createElement('a');
      a.href = source; a.download = `nymph-${mode}-${size.label}-${Date.now()}.png`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
  };

  const doTransparentSnapshot = (sizeKey = 'wide') => {
    if (!snapshotRef.current) return;
    const size = EXPORT_SIZES[sizeKey] || EXPORT_SIZES.wide;
    snapshotRef.current({ width: size.w, height: size.h, transparent: true, fitObject: true, filename: `nurr-${mode}-layer-${size.label}-${Date.now()}.png` });
  };

  // Mobile export: render at the exact requested size and hand back a PNG data
  // URL so the mobile UI can offer Download + Open-image (iOS long-press save).
  const mobileGetImage = async (sizeKey = 'wide') => {
    if (!snapshotRef.current) return null;
    const size = EXPORT_SIZES[sizeKey] || EXPORT_SIZES.wide;
    const r = snapshotRef.current({ width: size.w, height: size.h, returnDataUrl: true });
    const source = typeof r === 'string' ? r : (r && r.dataUrl) || null;
    if (!source) return null;
    try {
      const img = await dataUrlToImage(source);
      const canvas = document.createElement('canvas');
      canvas.width = size.w; canvas.height = size.h;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, size.w, size.h);
      ctx.drawImage(img, 0, 0, size.w, size.h);
      // Grain comes from the shader render, applied once. No second pass.
      return canvas.toDataURL('image/png');
    } catch (err) {
      console.error('Mobile export grain pass failed', err);
      return source;
    }
  };

  const captureCurrent = () => {
    const run = () => {
      const ref = snapshotRef;
      if (!ref.current) return false;
      const id       = Date.now();
      const type     = MODULE_LAYER_TYPE[mode] || 'background';
      const hasAlpha = MODULE_HAS_ALPHA[mode]  || false;
      // captureRenderState asks gradient/abstract to freeze the exact interaction
      // state (time, mouse, click pulse) behind this save. We also keep a larger
      // master image rendered from that SAME frozen state and the same visible
      // stage aspect. Export uses this master as the visual source of truth, so
      // files match the snap instead of recomputing a different field later.
      const stageRect = document.querySelector('canvas.stage')?.getBoundingClientRect();
      const viewRatio = stageRect && stageRect.width > 0 && stageRect.height > 0 ? stageRect.width / stageRect.height : (16 / 9);
      const previewW = viewRatio >= 1 ? 960 : Math.max(360, Math.round(960 * viewRatio));
      const previewH = viewRatio >= 1 ? Math.max(360, Math.round(960 / viewRatio)) : 960;
      const masterW = viewRatio >= 1 ? 2560 : Math.max(720, Math.round(2560 * viewRatio));
      const masterH = viewRatio >= 1 ? Math.max(720, Math.round(2560 / viewRatio)) : 2560;
      const captured = ref.current({ width: previewW, height: previewH, returnDataUrl: true, captureRenderState: true });
      if (!captured) return false;
      const preview     = typeof captured === 'string' ? captured : captured.dataUrl;
      const renderState = (captured && typeof captured === 'object') ? captured.renderState : null;
      // Module snapshot functions return the exact controls they rendered with.
      // Use this, not App's possibly one-event-late state, so Flip / Flow material
      // / Photo effect changes cannot be lost between preview and export.
      const capturedTweaks = (captured && typeof captured === 'object' && captured.tweaks)
        ? clonePlain(captured.tweaks)
        : null;
      if (!preview) return false;
      let exportSource = preview;
      let sourceW = previewW, sourceH = previewH;
      // Keep a large master at the exact snapped stage aspect when the module
      // benefits from a frozen visual fallback. Photo exports now render
      // natively during final export, because resizing the live WebGL canvas in
      // Safari can produce striped captures. FLOW still stores a large master,
      // especially for particle mode where the exact live simulation must be
      // preserved.
      if (renderState && mode !== 'nature') {
        const master = ref.current({
          width: masterW,
          height: masterH,
          returnDataUrl: true,
          renderStateOverride: renderState,
          tweaksOverride: capturedTweaks || undefined,
          exportQuality: true
        });
        if (typeof master === 'string') { exportSource = master; sourceW = masterW; sourceH = masterH; }
        else if (master && master.dataUrl) { exportSource = master.dataUrl; sourceW = masterW; sourceH = masterH; }
      }
      // FLOW can be heavy in particle mode. Store the frozen render state and
      // render the transparent layer only when requested; this makes snapshots
      // immediate instead of blocking for several minutes.
      let alphaPreview = null;
      if (hasAlpha && mode !== 'geometric' && snapshotRef.current) {
        alphaPreview = snapshotRef.current({ width: previewW, height: previewH, returnDataUrl: true, transparent: true, fitObject: true, renderStateOverride: renderState, tweaksOverride: capturedTweaks || undefined });
      }
      const tweaksSnap = clonePlain({ gradient: gradientTweaks, geometric: geometricTweaks, nature: natureTweaks, abstract: abstractTweaks });
      if (capturedTweaks) tweaksSnap[mode] = capturedTweaks;
      const forceVisualExport = (mode === 'geometric' && capturedTweaks && capturedTweaks.material === 'particles');
      setLibrary(items => [...items, {
        id, type, module: mode, hasAlpha,
        preview, exportSource, sourceW, sourceH, alphaPreview, renderState,
        tweaks: tweaksSnap,
        currentImg: mode === 'nature' ? currentImg : null,
        forceVisualExport,
        exportFit: forceVisualExport ? 'contain-soft' : 'contain',
        label: null, capturedAt: id,
      }].slice(-32));
      // Keep the current Create/Library tab unchanged when taking snapshots; only the badge count updates.
      showToast(hasAlpha ? '✓ Saved — includes transparent layer' : '✓ Saved to library');
      return true;
    };
    if (!run()) requestAnimationFrame(() => { if (!run()) setTimeout(run, 60); });
  };

  // Export matrix helpers
  const toggleCheck   = (itemId, sizeKey) => setExportChecks(prev => { const k = itemId + ':' + sizeKey; return { ...prev, [k]: !prev[k] }; });
  const setExportAll  = (val) => { const next = {}; library.forEach(item => EXPORT_PANEL_KEYS.forEach(sk => { next[item.id + ':' + sk] = val; })); setExportChecks(next); };
  const setExportRow  = (itemId, val) => setExportChecks(prev => { const next = { ...prev }; EXPORT_PANEL_KEYS.forEach(sk => { next[itemId + ':' + sk] = val; }); return next; });
  const setExportCol  = (sizeKey, val) => setExportChecks(prev => { const next = { ...prev }; library.forEach(item => { next[item.id + ':' + sizeKey] = val; }); return next; });
  const colAllChecked = (sizeKey) => !!library.length && library.every(item => !!exportChecks[item.id + ':' + sizeKey]);
  const rowAllChecked = (itemId) => EXPORT_PANEL_KEYS.every(sk => !!exportChecks[itemId + ':' + sk]);
  const selectedCount = library.reduce((n, item) => n + EXPORT_PANEL_KEYS.filter(sk => exportChecks[item.id + ':' + sk]).length, 0);

  const activeExportFormats = Object.keys(exportFormats).filter(k => exportFormats[k]);
  const selectedFileCount = selectedCount * Math.max(1, activeExportFormats.length);

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const dataUrlToImage = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

  const drawImageFitted = (ctx, img, w, h, fit = 'cover') => {
    const iw = img.naturalWidth || img.width || w;
    const ih = img.naturalHeight || img.height || h;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Preserve the snapped image when exporting to a different aspect ratio.
    // A soft cover-fill avoids dead black/transparent bars; the sharp contained
    // image on top is never cropped.
    if (fit === 'contain-soft') {
      const coverScale = Math.max(w / Math.max(1, iw), h / Math.max(1, ih));
      const coverW = iw * coverScale, coverH = ih * coverScale;
      const coverX = (w - coverW) * 0.5, coverY = (h - coverH) * 0.5;
      ctx.save();
      ctx.globalAlpha = 0.34;
      ctx.filter = 'blur(18px) saturate(1.03)';
      ctx.drawImage(img, coverX, coverY, coverW, coverH);
      ctx.restore();
      fit = 'contain';
    }

    const scaleFn = fit === 'contain' ? Math.min : Math.max;
    const scale = scaleFn(w / Math.max(1, iw), h / Math.max(1, ih));
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (w - dw) * 0.5;
    const dy = (h - dh) * 0.5;
    ctx.drawImage(img, dx, dy, dw, dh);
  };

  const clonePlain = (value) => {
    try { return JSON.parse(JSON.stringify(value)); }
    catch (err) { return value; }
  };


  // NOTE: The old canvas-side export grain pass (applyExportGrain) was removed.
  // Grain is now produced exactly once, in each module's shader, normalized to
  // a resolution-independent cell size — so it stays consistent across every
  // export size and aspect ratio and never doubles up into digital "dirt".

  const canvasToBlob = (canvas, mime, quality = 0.94) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else if (mime !== 'image/png') canvas.toBlob((fallback) => fallback ? resolve(fallback) : reject(new Error('Canvas export failed.')), 'image/png');
      else reject(new Error('Canvas export failed.'));
    }, mime, quality);
  });

  const jpegBlobToPdf = async (jpegBlob, w, h) => {
    const bytes = new Uint8Array(await jpegBlob.arrayBuffer());
    const pageW = Math.round(w * 0.75);
    const pageH = Math.round(h * 0.75);
    const enc = new TextEncoder();
    const chunks = [];
    let pos = 0;
    const add = (part) => {
      const data = typeof part === 'string' ? enc.encode(part) : part;
      chunks.push(data); pos += data.length;
    };
    const offsets = [0];
    const obj = (n, bodyParts) => {
      offsets[n] = pos;
      add(`${n} 0 obj\n`);
      bodyParts.forEach(add);
      add(`\nendobj\n`);
    };
    add('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    obj(1, [`<< /Type /Catalog /Pages 2 0 R >>`]);
    obj(2, [`<< /Type /Pages /Kids [3 0 R] /Count 1 >>`]);
    obj(3, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`]);
    obj(4, [`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`, bytes, `\nendstream`]);
    const content = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im0 Do\nQ\n`;
    obj(5, [`<< /Length ${content.length} >>\nstream\n${content}endstream`]);
    const xref = pos;
    add(`xref\n0 6\n0000000000 65535 f \n`);
    for (let i = 1; i <= 5; i++) add(String(offsets[i]).padStart(10, '0') + ' 00000 n \n');
    add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    return new Blob(chunks, { type: 'application/pdf' });
  };

  // ── Single source of truth for every export ────────────────────────────────
  // The Library only stores a cheap preview for the list UI. The actual file
  // is ALWAYS re-rendered natively at the exact export width×height from the
  // saved tweaks + frozen renderState, through the same offscreen renderer for
  // every module (gradient / abstract / flow / photo). Because it renders at
  // the real export resolution and aspect, nothing is upscaled and nothing is
  // cropped — each aspect ratio is a true render, grain stays crisp, and the
  // file matches the Library preview. Only pre-fix / old-session items that
  // have no renderState fall back to the stored preview bitmap.
  const highResExportSource = async (item, size, transparent = false) => {
    const moduleTweaks = item.tweaks ? item.tweaks[item.module] : null;
    if (!moduleTweaks) return null;
    if (item.forceVisualExport) return null;

    if (!transparent && item.module === 'gradient' && item.renderState && typeof window.NurrGradientRenderToDataURL === 'function') {
      return window.NurrGradientRenderToDataURL(moduleTweaks, item.renderState, size.w, size.h);
    }
    if (!transparent && item.module === 'abstract' && item.renderState && typeof window.NurrAbstractRenderToDataURL === 'function') {
      return window.NurrAbstractRenderToDataURL(moduleTweaks, item.renderState, size.w, size.h);
    }
    if (item.module === 'geometric') {
      const extra = { transparent, fitObject: transparent, exportQuality: true };
      // Prefer the standalone static renderer — it works even when FLOW is not
      // the mounted module. It returns null for particle mode (which needs the
      // live simulation), so fall through to the live-canvas renderer there.
      if (typeof window.NurrGeometricRenderStaticToDataURL === 'function') {
        const staticOut = window.NurrGeometricRenderStaticToDataURL(moduleTweaks, item.renderState || {}, size.w, size.h, extra);
        if (staticOut) return staticOut;
      }
      if (typeof window.NurrGeometricRenderToDataURL === 'function') {
        return window.NurrGeometricRenderToDataURL(moduleTweaks, item.renderState || {}, size.w, size.h, extra);
      }
    }
    if (!transparent && item.module === 'nature' && item.currentImg && typeof window.NurrNatureRenderToDataURL === 'function') {
      // Async (image decode) — awaited by the caller.
      return await window.NurrNatureRenderToDataURL(moduleTweaks, item.renderState || {}, size.w, size.h, { currentImg: item.currentImg });
    }
    return null;
  };

  const renderExportBlob = async (item, size, formatKey) => {
    const native = await highResExportSource(item, size, false);
    const source = native || item.exportSource || item.preview;
    const img = await dataUrlToImage(source);
    const canvas = document.createElement('canvas');
    canvas.width = size.w; canvas.height = size.h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size.w, size.h);
    if (native) {
      // Native render is already exactly size.w×size.h and aspect-correct —
      // draw it 1:1. No fit, no cover-crop.
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, size.w, size.h);
    } else {
      // Fallback for old items with only a stored preview bitmap.
      drawImageFitted(ctx, img, size.w, size.h, item.exportFit || ((item.type === 'object' && item.module !== 'geometric') ? 'contain' : 'contain'));
    }
    // No canvas grain pass — grain is baked into the shader render.
    if (formatKey === 'pdf') {
      const jpg = await canvasToBlob(canvas, 'image/jpeg', 0.98);
      return jpegBlobToPdf(jpg, size.w, size.h);
    }
    const meta = EXPORT_FORMATS[formatKey] || EXPORT_FORMATS.png;
    return canvasToBlob(canvas, meta.mime, formatKey === 'png' ? undefined : 0.98);
  };

  const buildExportJobs = () => {
    const formats = activeExportFormats.length ? activeExportFormats : ['png'];
    const jobs = [];
    library.forEach((item, idx) => {
      EXPORT_PANEL_KEYS.forEach(sizeKey => {
        if (exportChecks[item.id + ':' + sizeKey]) {
          formats.forEach(formatKey => jobs.push({ item, idx, sizeKey, size: EXPORT_SIZES[sizeKey], formatKey }));
        }
      });
    });
    return jobs;
  };

  const exportSelected = async (delivery = 'zip') => {
    if (exportStatus.busy) return;
    const jobs = buildExportJobs();
    if (!jobs.length) return;
    if (delivery === 'zip' && !window.JSZip) { showToast('⚠ ZIP library missing — use Download files'); return; }

    setExportStatus({ busy: true, text: `Preparing ${jobs.length} file${jobs.length === 1 ? '' : 's'}…` });
    showToast('Preparing export — download will start shortly');

    try {
      if (delivery === 'zip' && window.JSZip) {
        const zip = new JSZip();
        for (let i = 0; i < jobs.length; i++) {
          const job = jobs[i];
          const meta = EXPORT_FORMATS[job.formatKey] || EXPORT_FORMATS.png;
          setExportStatus({ busy: true, text: `Rendering ${i + 1}/${jobs.length}…` });
          const blob = await renderExportBlob(job.item, job.size, job.formatKey);
          zip.file(`nymph-${String(job.idx + 1).padStart(2, '0')}-${moduleDisplay(job.item.module)}-${job.size.label.replace(':', 'x')}-${job.size.w}x${job.size.h}.${meta.ext}`, blob);
        }
        setExportStatus({ busy: true, text: 'Compressing ZIP…' });
        const blob = await zip.generateAsync({ type: 'blob' }, (meta) => {
          setExportStatus({ busy: true, text: `Compressing ZIP — ${Math.round(meta.percent || 0)}%` });
        });
        downloadBlob(blob, 'nymph-export.zip');
        showToast('Download started');
        setExportStatus({ busy: false, text: 'Download started' });
        setTimeout(() => setExportStatus(s => s.text === 'Download started' ? { busy: false, text: '' } : s), 2200);
        return;
      }

      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        const meta = EXPORT_FORMATS[job.formatKey] || EXPORT_FORMATS.png;
        setExportStatus({ busy: true, text: `Downloading ${i + 1}/${jobs.length}…` });
        const blob = await renderExportBlob(job.item, job.size, job.formatKey);
        downloadBlob(blob, `nymph-${String(job.idx + 1).padStart(2, '0')}-${moduleDisplay(job.item.module)}-${job.size.label.replace(':', 'x')}-${job.size.w}x${job.size.h}.${meta.ext}`);
        await new Promise(resolve => setTimeout(resolve, 120));
      }
      showToast('Downloads started');
      setExportStatus({ busy: false, text: 'Downloads started' });
      setTimeout(() => setExportStatus(s => s.text === 'Downloads started' ? { busy: false, text: '' } : s), 2200);
    } catch (err) {
      console.error('Export failed', err);
      showToast('⚠ Export failed');
      setExportStatus({ busy: false, text: 'Export failed' });
      setTimeout(() => setExportStatus(s => s.text === 'Export failed' ? { busy: false, text: '' } : s), 2600);
    }
  };

  const downloadAlphaLayer = async (item) => {
    if (!item.alphaPreview && item.module !== 'geometric') return;
    let src = item.alphaPreview;
    if (item.module === 'geometric') {
      const aspect = Math.max(0.1, (item.sourceW || 16) / Math.max(1, item.sourceH || 9));
      const longEdge = 2560;
      const size = aspect >= 1
        ? { w: longEdge, h: Math.round(longEdge / aspect) }
        : { w: Math.round(longEdge * aspect), h: longEdge };
      src = await highResExportSource(item, size, true) || src;
    }
    if (!src) return;
    const a = document.createElement('a');
    a.href = src; a.download = `nurr-${moduleDisplay(item.module)}-layer-${item.id}.png`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const downloadAll = async () => {
    if (!library.length) return;
    if (window.JSZip) {
      const zip = new JSZip();
      library.forEach((item, i) => {
        const name = `nurr-${String(i + 1).padStart(2, '0')}-${moduleDisplay(item.module)}-${item.type}`;
        zip.file(name + '.png', (item.exportSource || item.preview).split(',')[1], { base64: true });
        if (item.alphaPreview) zip.file(name + '-layer.png', item.alphaPreview.split(',')[1], { base64: true });
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a'); a.href = url; a.download = 'nurr-library.zip';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } else {
      library.forEach((item, i) => setTimeout(() => {
        const a = document.createElement('a'); a.href = item.exportSource || item.preview; a.download = `nurr-${i + 1}-${moduleDisplay(item.module)}.png`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      }, i * 80));
    }
  };

  // Generate new (randomise)
  const pickPalette = (count = 4) => {
    const presets = (window.WP && Array.isArray(WP.PALETTE_PRESETS)) ? WP.PALETTE_PRESETS : [];
    const source  = presets.length ? presets[Math.floor(Math.random() * presets.length)] : ['#08015F','#FC6C3D','#F4C4D7'];
    const unique  = [];
    source.forEach(c => { const h = String(c || '').trim().toUpperCase(); if (/^#[0-9A-F]{6}$/.test(h) && !unique.includes(h)) unique.push(h); });
    return unique.slice(0, count);
  };

  const generateNew = () => {
    pushHistory();
    if (mode === 'gradient') {
      const formula = window.NURR_NYMPH_GRADIENT_ENGINE && window.NURR_NYMPH_GRADIENT_ENGINE.shuffle
        ? window.NURR_NYMPH_GRADIENT_ENGINE.shuffle()
        : null;
      const colors = formula && formula.colors ? formula.colors : pickPalette(4);
      setGradientTweaks(s => ({
        ...s,
        colors: colors.length >= 2 ? colors.slice(0, 4) : s.colors,
        // Header/mobile Shuffle was accidentally preserving manualPalette:true
        // after a user edit or preset pick. That forced the manual/equal role
        // weights and made strong shuffle palettes render as flat averages.
        manualPalette: false,
        spread: formula && formula.spread != null ? formula.spread : (colors.length >= 3 ? Math.max(s.spread ?? 0.62, 0.62) : 0.48),
        colorDistance: formula && formula.distance != null ? formula.distance : (s.colorDistance ?? 0.56),
        blend: formula && formula.blend != null ? formula.blend : (s.blend ?? 0.56),
        pigment: formula && formula.pigment != null ? formula.pigment : (s.pigment ?? 0.5),
        saturation: formula && formula.saturation != null ? formula.saturation : (s.saturation ?? 0.5),
        temperature: 0,
        formula: formula ? formula.formula : s.formula,
        formulaLabel: formula ? formula.label : s.formulaLabel,
        formulaWeights: formula && formula.formulaWeights ? formula.formulaWeights : s.formulaWeights,
        grain: formula && formula.grain != null ? formula.grain : Math.min(0.045, s.grain ?? 0.025),
        // Shuffle should never inherit a stale Pixelate/Chroma surface. Those
        // remain explicit Surface choices after the new gradient is generated.
        texturePreset: 'clean',
        textureAmount: 0,
        textureScale: 0.45,
        textureSeed: Math.random()
      }));
      return;
    }
    if (mode === 'geometric') { setGeometricTweaks(s => ({ ...s,
      compositionIdx: Math.floor(Math.random() * (window.GEOMETRIC_COMPOSITIONS_LEN || 12)),
      colors: pickPalette(4).slice(0, 4),
      grain: Math.min(0.22, Math.max(0.015, (s.grain ?? 0.08) + (Math.random() - 0.5) * 0.045))
    })); return; }
    if (mode === 'nature') { const effects = ['warp','blur','split','melt','nodes']; setNatureTweaks(s => ({ ...s, effect: effects[Math.floor(Math.random() * effects.length)], warp: 0.28 + Math.random() * 0.52, blur: 0.22 + Math.random() * 0.58, split: 0.24 + Math.random() * 0.62, hue: (Math.random() - 0.5) * 0.22, sat: 0.78 + Math.random() * 0.72, contrast: 0.78 + Math.random() * 0.62, grain: Math.random() * 0.18, vignette: 0.08 + Math.random() * 0.38 })); if (natureImages.length) setCurrentImg(natureImages[Math.floor(Math.random() * natureImages.length)]); return; }
    if (mode === 'abstract') { setAbstractTweaks(s => ({ ...s, colors: pickPalette(4), seed: Math.random(), variant: Math.floor(Math.random() * 8), gradientSource: Math.random() > 0.5 ? 'blob' : 'smooth' })); return; }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 's' || e.key === 'S') captureCurrent();
      if (e.key === '1') changeMode('gradient');
      if (e.key === '2') changeMode('abstract');
      if (e.key === '3') changeMode('geometric');
      if (e.key === '4') changeMode('nature');
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
      if (e.key === 'h' || e.key === 'H') setCollapsed(c => !c);
      if (e.key === 'Escape') { setPage('main'); setPreviewImage(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, library]);


  // Adaptive panel tone: sample the active visual under the side panel and
  // switch control text for dark/light backgrounds. Keeps the glass material
  // transparent without forcing one text color across all modules.
  useEffect(() => {
    let raf = 0;
    const temp = document.createElement('canvas');
    temp.width = 10; temp.height = 10;
    const ctx = temp.getContext('2d', { willReadFrequently: true });
    const sample = () => {
      const panel = panelRef.current;
      const stage = document.querySelector('canvas.stage');
      if (!panel || !stage || !ctx) { raf = requestAnimationFrame(sample); return; }
      try {
        const pr = panel.getBoundingClientRect();
        const sr = stage.getBoundingClientRect();
        const x = Math.max(sr.left, Math.min(sr.right - 1, pr.left + pr.width * 0.52));
        const y = Math.max(sr.top,  Math.min(sr.bottom - 1, pr.top  + pr.height * 0.42));
        const sx = (x - sr.left) / Math.max(1, sr.width)  * stage.width;
        const sy = (y - sr.top)  / Math.max(1, sr.height) * stage.height;
        const sw = Math.max(1, stage.width * 0.12);
        const sh = Math.max(1, stage.height * 0.12);
        ctx.clearRect(0,0,10,10);
        ctx.drawImage(stage, Math.max(0, sx - sw/2), Math.max(0, sy - sh/2), sw, sh, 0, 0, 10, 10);
        const data = ctx.getImageData(0,0,10,10).data;
        let l = 0, n = 0;
        for (let i=0; i<data.length; i+=4) {
          const a = data[i+3] / 255;
          if (a < 0.08) continue;
          const r = data[i] / 255, g = data[i+1] / 255, b = data[i+2] / 255;
          l += (0.2126*r + 0.7152*g + 0.0722*b) * a;
          n += a;
        }
        if (n > 0) {
          const lum = l / n;
          const currentTone = panelToneRef.current || 'dark';
          let nextTone = currentTone;
          // Hysteresis prevents black/white flicker on high-contrast abstract visuals.
          if (currentTone === 'dark' && lum > 0.74) nextTone = 'light';
          if (currentTone === 'light' && lum < 0.30) nextTone = 'dark';
          const nowMs = performance.now();
          if (nextTone !== currentTone && nowMs - (panelToneSwitchRef.current || 0) > 900) {
            panelToneRef.current = nextTone;
            panelToneSwitchRef.current = nowMs;
            setPanelTone(nextTone);
          }
        }
      } catch(err) {
        const fallbackTone = (mode === 'geometric' || mode === 'nature') ? 'light' : 'dark';
        panelToneRef.current = fallbackTone;
        setPanelTone(fallbackTone);
      }
      raf = requestAnimationFrame(sample);
    };
    raf = requestAnimationFrame(sample);
    return () => cancelAnimationFrame(raf);
  }, [mode, collapsed]);

  const mouseRef = WP.useMouse();

  // Panel drag
  const panelRef  = useRef(null);
  const [panelPos, setPanelPos] = useState(null);
  const dragState = useRef(null);

  const getSafePanelPos = useCallback((x, y, w = 392, h = 560) => {
    const railRect = document.querySelector('.rail')?.getBoundingClientRect();
    const footerRect = document.querySelector('.nurr-support-strip')?.getBoundingClientRect();
    const topMin = Math.max(14, (railRect?.bottom || 72) + 18);
    const bottomMax = (footerRect?.top || window.innerHeight) - 18;
    const leftMin = 8;
    const rightMax = window.innerWidth - w - 8;
    return {
      x: Math.max(leftMin, Math.min(Math.max(leftMin, rightMax), x)),
      y: Math.max(topMin, Math.min(Math.max(topMin, bottomMax - h), y))
    };
  }, []);

  useEffect(() => {
    if (!panelPos || collapsed) return undefined;
    const raf = requestAnimationFrame(() => {
      const el = panelRef.current;
      if (!el) return;
      const safe = getSafePanelPos(panelPos.x, panelPos.y, el.offsetWidth || 392, el.offsetHeight || 560);
      if (Math.abs(safe.x - panelPos.x) > 0.5 || Math.abs(safe.y - panelPos.y) > 0.5) {
        setPanelPos(safe);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [mode, collapsed, panelPos, getSafePanelPos]);
  const onHeaderDown = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('button,input,select,textarea,label,a,.icon-btn,.panel-tabs,.swatch,.layout-card,.palette-card,.surface-card,.object-card,.material-card,.slider-row,.range-wrap,.presets-grid,.nature-thumb,.abstract-form-btn,.color-wheel-card,.eyedropper-follow')) return;
    const panel = panelRef.current;
    const rect = panel?.getBoundingClientRect();
    if (!rect) return;
    // Convert the CSS-positioned panel into a real fixed-position drag target.
    // This avoids the old "rail" feeling where competing right/top CSS could lock one axis.
    setPanelPos({ x: rect.left, y: rect.top });
    dragState.current = { offX: e.clientX - rect.left, offY: e.clientY - rect.top, raf: null };
    document.body.classList.add('nurr-no-select');
    e.preventDefault();
  };
  useEffect(() => {
    const onMove = (e) => {
      const st = dragState.current; if (!st) return;
      const el = panelRef.current;
      const w = el?.offsetWidth || 332;
      const h = el?.offsetHeight || 560;
      const next = getSafePanelPos(e.clientX - st.offX, e.clientY - st.offY, w, h);
      if (st.raf) cancelAnimationFrame(st.raf);
      st.raf = requestAnimationFrame(() => setPanelPos(next));
    };
    const onUp = () => {
      if (dragState.current?.raf) cancelAnimationFrame(dragState.current.raf);
      dragState.current = null;
      document.body.classList.remove('nurr-no-select');
    };
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [getSafePanelPos]);

  // Export panel drag + resize
  const exportPanelRef  = useRef(null);
  const exportDragRef   = useRef(null);
  const exportResizeRef = useRef(null);

  useEffect(() => {
    if (page !== 'export') return;
    const id = requestAnimationFrame(() => {
      const win = exportPanelRef.current;
      if (!win) return;
      win.classList.remove('is-dragging');
      win.style.setProperty('left', '50%', 'important');
      win.style.setProperty('top', '50%', 'important');
      win.style.setProperty('right', 'auto', 'important');
      win.style.setProperty('bottom', 'auto', 'important');
      win.style.setProperty('transform', 'translate(-50%, -50%)', 'important');
      win.style.removeProperty('width');
      win.style.removeProperty('height');
    });
    return () => cancelAnimationFrame(id);
  }, [page]);

  const onExportHeaderDown = (e) => {
    if (e.target.closest('button,input,label')) return;
    const win = exportPanelRef.current; const rect = win?.getBoundingClientRect(); if (!rect || !win) return;
    exportDragRef.current = { offX: e.clientX - rect.left, offY: e.clientY - rect.top, raf: null };
    win.classList.add('is-dragging');
    win.style.setProperty('left', rect.left + 'px', 'important'); win.style.setProperty('top', rect.top + 'px', 'important'); win.style.setProperty('right', 'auto', 'important'); win.style.setProperty('bottom', 'auto', 'important'); win.style.setProperty('transform', 'none', 'important');
    document.body.classList.add('nurr-no-select'); e.preventDefault();
  };
  const onExportResizeDown = (e) => {
    const win = exportPanelRef.current; if (!win) return;
    const rect = win.getBoundingClientRect();
    win.style.setProperty('left', rect.left + 'px', 'important'); win.style.setProperty('top', rect.top + 'px', 'important'); win.style.setProperty('right', 'auto', 'important'); win.style.setProperty('bottom', 'auto', 'important'); win.style.setProperty('transform', 'none', 'important');
    win.classList.add('is-dragging');
    exportResizeRef.current = { startX: e.clientX, startY: e.clientY, startW: rect.width, startH: rect.height, left: rect.left, top: rect.top, raf: null };
    document.body.classList.add('nurr-no-select'); e.preventDefault(); e.stopPropagation();
  };
  useEffect(() => {
    const onMove = (e) => {
      if (exportDragRef.current) {
        const st = exportDragRef.current; const win = exportPanelRef.current; if (!win) return;
        const w = win.offsetWidth || 820; const h = win.offsetHeight || 560;
        const x = Math.max(8, Math.min(window.innerWidth - w - 8, e.clientX - st.offX));
        const y = Math.max(8, Math.min(window.innerHeight - h - 8, e.clientY - st.offY));
        if (st.raf) cancelAnimationFrame(st.raf);
        st.raf = requestAnimationFrame(() => { win.style.setProperty('left', x + 'px', 'important'); win.style.setProperty('top', y + 'px', 'important'); win.style.setProperty('right', 'auto', 'important'); win.style.setProperty('bottom', 'auto', 'important'); win.style.setProperty('transform', 'none', 'important'); });
      }
      if (exportResizeRef.current) {
        const st = exportResizeRef.current; const win = exportPanelRef.current; if (!win) return;
        const w = Math.max(520, Math.min(Math.max(520, window.innerWidth - st.left - 16), st.startW + (e.clientX - st.startX)));
        const h = Math.max(300, Math.min(Math.max(300, window.innerHeight - st.top - 16), st.startH + (e.clientY - st.startY)));
        if (st.raf) cancelAnimationFrame(st.raf);
        st.raf = requestAnimationFrame(() => { win.style.setProperty('width', w + 'px', 'important'); win.style.setProperty('height', h + 'px', 'important'); });
      }
    };
    const onUp = () => {
      if (exportDragRef.current)  { if (exportDragRef.current.raf)  cancelAnimationFrame(exportDragRef.current.raf);  exportDragRef.current  = null; exportPanelRef.current?.classList.remove('is-dragging'); document.body.classList.remove('nurr-no-select'); }
      if (exportResizeRef.current) { if (exportResizeRef.current.raf) cancelAnimationFrame(exportResizeRef.current.raf); exportResizeRef.current = null; exportPanelRef.current?.classList.remove('is-dragging'); document.body.classList.remove('nurr-no-select'); }
    };
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const panelStyle   = panelPos ? { '--panel-x':panelPos.x + 'px', '--panel-y':panelPos.y + 'px', position:'fixed', left:panelPos.x + 'px', top:panelPos.y + 'px', right:'auto', bottom:'auto' } : {}; // free XY drag
  const hasAlphaMode = MODULE_HAS_ALPHA[mode] || false;
  const MotionPanel = window.MotionExportControls;
  const MobileUIComp = window.NymphMobileUI;

  const modes = [
    { id: 'gradient',  label: 'Gradient',   num: 'i.'   },
    { id: 'abstract',  label: 'Abstract',   num: 'ii.'  },
    { id: 'geometric', label: 'Flow',       num: 'iii.' },
    { id: 'nature',    label: 'Photo',      num: 'iv.'  },
  ];

  return (
    <>
      {showLanding && <NymphLanding onEnter={() => setShowLanding(false)} />}
      {mode === 'gradient'  && <GradientMode  tweaks={gradientTweaks}  registerSnapshot={registerSnapshot}  mouseRef={mouseRef} />}
      {mode === 'geometric' && <GeometricMode tweaks={geometricTweaks} registerSnapshot={registerSnapshot}  mouseRef={mouseRef} />}
      {mode === 'nature' && (<>
        <NatureMode tweaks={natureTweaks} registerSnapshot={registerSnapshot} mouseRef={mouseRef} currentImg={currentImg} />
        {!currentImg && <NaturePlaceholder onFiles={onFiles} />}
      </>)}
      {mode === 'abstract' && <AbstractMode  tweaks={abstractTweaks}  registerSnapshot={registerSnapshot}  mouseRef={mouseRef} />}

      <button className="nurr-brand nurr-brand-button" onClick={() => setShowLanding(true)} aria-label="Return to NYMPH landing">
        <img src="assets/logos/nymph-logo-full.svg" alt="NYMPH" />
      </button>

      <div className="rail">
        <div className="rail-group">
          {modes.map(m => (
            <button key={m.id} className={'rail-item' + (mode === m.id ? ' active' : '')} onClick={() => changeMode(m.id)}>
              <span className="num">{m.num}</span>{m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="corner-mark">
        <div className="big">vol. <em>i</em></div>
        <div className="small">№ 01 — 26</div>
      </div>

      {/* Main panel */}
      <div ref={panelRef} className={'panel mode-' + mode + ' tone-' + panelTone + (collapsed ? ' collapsed' : '') + (panelPos ? ' is-dragged' : '')} style={panelStyle} onMouseDown={onHeaderDown}>
        <div className="panel-header" onMouseDown={onHeaderDown}>
          <div>
            <div className="panel-title panel-title-nymph"><img src={collapsed ? "assets/logos/nymph-logomark.svg" : "assets/logos/nymph-wordmark.svg"} alt="NYMPH" /></div>
          </div>
          <div className="header-actions">
            <button className="icon-btn" onClick={generateNew} title="Generate new">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>
            </button>
            <button className="icon-btn" onClick={undo} disabled={!history.length} title="Undo (⌘Z)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 1 1 0 12h-2"/></svg>
            </button>
            <button className="icon-btn" onClick={captureCurrent} title="Save to library (S)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 19V8a2 2 0 0 0-2-2h-3.17l-1.84-2H10l-1.84 2H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2Z"/><circle cx="12" cy="13" r="4"/></svg>
            </button>
            <button className="icon-btn" onClick={() => setCollapsed(c => !c)} title="Collapse (H)">
              {collapsed ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg> : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 15l-6-6-6 6"/></svg>}
            </button>
          </div>
        </div>

        {!collapsed && (<>
          <div className="panel-tabs">
            <button className={'panel-tab' + (activeTab === 'create'  ? ' active' : '')} onClick={() => setActiveTab('create')}>Create</button>
            <button className={'panel-tab' + (activeTab === 'library' ? ' active' : '')} onClick={() => setActiveTab('library')}>
              Library{library.length > 0 ? <span className="tab-count">{library.length}</span> : null}
            </button>
          </div>

          {activeTab === 'create' && (
            <div className="panel-body">
              {mode === 'gradient'  && <GradientControls  tweaks={gradientTweaks}  setTweaks={patchGradient}  />}
              {mode === 'geometric' && <GeometricControls tweaks={geometricTweaks} setTweaks={patchGeometric} />}
              {mode === 'nature'    && <NatureControls tweaks={natureTweaks} setTweaks={patchNature} natureImages={natureImages} currentImg={currentImg} setCurrentImg={(img) => { pushHistory(); setCurrentImg(img); }} onFiles={onFiles} />}
              {mode === 'abstract'  && <AbstractControls  tweaks={abstractTweaks}  setTweaks={patchAbstract}  />}
              <>
                <div className="create-dl-row create-size-row">
                  <button className="btn btn-italic" onClick={() => doSnapshot('square')} title="1080×1080">1×1 ↓</button>
                  <button className="btn primary btn-italic" onClick={() => doSnapshot('wide')}  title="1920×1080">HD ↓</button>
                  <button className="btn btn-italic"         onClick={() => doSnapshot('portrait')} title="1600×2000">4:5 ↓</button>
                  <button className="btn primary btn-italic" onClick={() => doSnapshot('qhd')} title="2560×1440">2K ↓</button>
                </div>
                {hasAlphaMode && (
                  <div className="create-dl-row create-layer-row">
                    <button className="btn create-alpha-btn" onClick={() => doTransparentSnapshot('square')} title="1×1 square transparent PNG">1×1 layer ↗</button>
                    <button className="btn create-alpha-btn" onClick={() => doTransparentSnapshot('wide')}  title="16:9 transparent PNG">HD layer ↗</button>
                    <button className="btn create-alpha-btn" onClick={() => doTransparentSnapshot('portrait')} title="4:5 transparent PNG">4:5 layer ↗</button>
                    <button className="btn create-alpha-btn" onClick={() => doTransparentSnapshot('qhd')} title="2K transparent PNG">2K layer ↗</button>
                  </div>
                )}
                <div className="create-secondary-row">
                  <button className="btn btn-italic" onClick={() => setPage('export')}>
                    Export panel{library.length > 0 ? ` · ${library.length}` : ''}
                  </button>
                </div>
              </>
            </div>
          )}

          {activeTab === 'library' && (
            <div className="panel-body panel-body-lib">
              <LibraryTab library={library}
                onDelete={(id) => setLibrary(items => items.filter(x => x.id !== id))}
                onPreview={setPreviewImage}
                onClear={() => setLibrary([])}
                onDownloadAll={downloadAll}
                onOpenExport={() => setPage('export')} />
            </div>
          )}
        </>)}
      </div>

      {/* Preview lightbox */}
      {previewImage && (
        <div className="preview-backdrop" onClick={() => setPreviewImage(null)}>
          <div className="preview-window" onClick={(e) => e.stopPropagation()}>
            <button className="preview-close" onClick={() => setPreviewImage(null)}>×</button>
            <img src={previewImage} alt="Preview" />
          </div>
        </div>
      )}

      <div className={'snapshot-toast' + (toast.show ? ' show' : '')}>{toast.text}</div>

      {/* Separate mobile UI — its own component + stylesheet. Always mounted;
          shown only under the mobile breakpoint (CSS), where the desktop panel
          and rail are hidden. Shares state + renderers, never desktop markup. */}
      {MobileUIComp && (
        <MobileUIComp
          mode={mode}
          modules={modes}
          onMode={changeMode}
          onHome={() => setShowLanding(true)}
          gradientTweaks={gradientTweaks}   patchGradient={patchGradient}
          geometricTweaks={geometricTweaks} patchGeometric={patchGeometric}
          natureTweaks={natureTweaks}       patchNature={patchNature}
          abstractTweaks={abstractTweaks}   patchAbstract={patchAbstract}
          onShuffle={generateNew}
          onUndo={undo} canUndo={history.length > 0}
          onSnap={captureCurrent}
          getImage={mobileGetImage}
          natureImages={natureImages}
          currentImg={currentImg}
          onPickImage={(img) => { pushHistory(); setCurrentImg(img); }}
          onFiles={onFiles}
          libraryCount={library.length}
        />
      )}

      {/* Export overlay — restored matrix: snapshots × sizes + Layer column */}
      {page === 'export' && (
        <div className="export-overlay">
          <div className="export-overlay-backdrop" onClick={() => setPage('main')} />
          <div ref={exportPanelRef} className="export-window">
            <div className="export-window-header" onMouseDown={onExportHeaderDown}>
              <div>
                <div className="panel-eyebrow">Export Panel</div>
                <div className="export-window-title">Still / Motion / Web / Recipe</div>
              </div>
              <button className="icon-btn" onClick={() => setPage('main')} title="Close">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <div className="export-tabs">
              <button className={'export-tab' + (exportTab === 'still' ? ' active' : '')} onClick={() => setExportTab('still')}>Still</button>
              <button className={'export-tab' + (exportTab === 'motion' ? ' active' : '')} onClick={() => setExportTab('motion')}>Motion / Web / Recipe</button>
            </div>

            <div className="export-window-body">
              {exportTab === 'still' && (!library.length ? (
                <div className="export-empty">
                  No snapshots yet — press <kbd>S</kbd> on any module to save.
                </div>
              ) : (<>
                <div className="export-control-panel">
                  <div className="export-control-block">
                    <div className="export-control-title">Selection</div>
                    <div className="export-inline-actions">
                      <button className="btn" onClick={() => setExportAll(true)}>Check all</button>
                      <button className="btn" onClick={() => setExportAll(false)}>Clear all</button>
                    </div>
                  </div>
                  <div className="export-control-block export-format-block">
                    <div className="export-control-title">File format</div>
                    <div className="export-format-grid">
                      {Object.keys(EXPORT_FORMATS).map(fk => (
                        <label className={'export-format-chip' + (exportFormats[fk] ? ' active' : '')} key={fk}>
                          <input type="checkbox" checked={!!exportFormats[fk]} onChange={(e) => setExportFormats(prev => ({ ...prev, [fk]: e.target.checked }))} />
                          <span>{EXPORT_FORMATS[fk].label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="export-control-count">{selectedFileCount} file{selectedFileCount === 1 ? '' : 's'}</div>
                </div>

                <div className="export-matrix-shell">
                  <div className="export-grid-head">
                    <span>Snapshot</span>
                    {EXPORT_PANEL_KEYS.map(sk => { const sz = EXPORT_SIZES[sk]; return (
                      <label className="export-col-select" key={sk} title={'All ' + sz.label}>
                        <input type="checkbox" checked={colAllChecked(sk)} onChange={(e) => setExportCol(sk, e.target.checked)} />
                        <span>{sz.label}<small>{sz.w}×{sz.h}</small></span>
                      </label>
                    ); })}
                  </div>

                  <div className="export-list">
                    {library.map((item, i) => (
                      <div className="export-row" key={item.id}>
                        <div className="export-thumb">
                          <label className="export-row-select">
                            <input type="checkbox" checked={rowAllChecked(item.id)} onChange={(e) => setExportRow(item.id, e.target.checked)} />
                            <span></span>
                          </label>
                          <img src={item.preview} alt="" />
                          <div className="export-thumb-meta">
                            <strong>{String(i + 1).padStart(2, '0')}</strong>
                            <small>{moduleDisplay(item.module)}{item.hasAlpha ? ' · α' : ''}</small>
                            {(item.alphaPreview || item.module === 'geometric') ? (
                              <button type="button" className="export-alpha-inline" onClick={() => downloadAlphaLayer(item)} title="Download transparent layer PNG">Layer PNG</button>
                            ) : null}
                          </div>
                        </div>
                        {EXPORT_PANEL_KEYS.map(sk => (
                          <label className="export-check" key={sk} title={EXPORT_SIZES[sk].label + ' export'}>
                            <input type="checkbox" checked={!!exportChecks[item.id + ':' + sk]} onChange={() => toggleCheck(item.id, sk)} />
                            <span></span>
                          </label>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="export-actions">
                  <button className="btn primary btn-italic" onClick={() => exportSelected('zip')} disabled={!selectedCount || exportStatus.busy}>
                    {exportStatus.busy ? 'Preparing…' : 'Download ZIP ↓'}
                  </button>
                  <button className="btn btn-italic" onClick={() => exportSelected('files')} disabled={!selectedCount || exportStatus.busy}>
                    {exportStatus.busy ? 'Please wait…' : 'Download files ↓'}
                  </button>
                  <span>{exportStatus.text || `${selectedCount} export slot${selectedCount === 1 ? '' : 's'} selected`}</span>
                </div>
              </>))}
              {exportTab === 'motion' && MotionPanel && <MotionPanel library={library} currentMode={mode} />}
            </div>

            <div className="export-resize-grip" onMouseDown={onExportResizeDown} title="Resize panel" />
          </div>
        </div>
      )}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
