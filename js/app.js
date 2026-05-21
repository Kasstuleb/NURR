// app.js — App shell. Wires modes, panel, history, collection, keyboard shortcuts.
// Nature fix: natureImages initialises empty; currentImg starts null → placeholder shown
// until user either drops their own photos OR discover finds real files.

const { useEffect, useRef, useState, useCallback } = React;

// ─── NaturePlaceholder ────────────────────────────────────────────────────────
function NaturePlaceholder({ onFiles }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length) onFiles(files);
  };
  return (
    <div className="placeholder-overlay">
      <div className="placeholder-card"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        style={{ borderColor: dragOver ? 'var(--accent)' : undefined }}>
        <h2>Photo mode needs images.</h2>
        <p style={{ marginTop: 14 }}>
          Drop images here to start instantly — no server needed.<br />
          Or place files in <code>./nature/</code> and list them in <code>nature/manifest.json</code>:<br />
          <code style={{ marginTop: 6, display: 'block' }}>["01.jpg", "02.jpg", "03.webp"]</code>
        </p>
        <div className="btn-row" style={{ marginTop: 20 }}>
          <button className="btn primary btn-italic" onClick={() => inputRef.current?.click()}>
            Choose images
          </button>
        </div>
        <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={(e) => { onFiles(Array.from(e.target.files)); e.target.value = ''; }} />
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
function App() {
  const [mode, setMode]         = useState('gradient');
  const [page, setPage]         = useState('studio');
  const [collapsed, setCollapsed] = useState(false);

  // Per-mode tweaks
  const [gradientTweaks,  setGradientTweaks]  = useState(window.GRADIENT_DEFAULTS);
  const [geometricTweaks, setGeometricTweaks] = useState(window.GEOMETRIC_DEFAULTS);
  const [glass3dTweaks,   setGlass3dTweaks]   = useState(window.GLASS3D_DEFAULTS);
  const [natureTweaks,    setNatureTweaks]    = useState(window.NATURE_DEFAULTS);
  const [abstractTweaks,  setAbstractTweaks]  = useState(window.ABSTRACT_DEFAULTS);
  const [paletteTweaks,   setPaletteTweaks]   = useState(window.PALETTE_DEFAULTS);

  // ── Nature / photo state ──
  // Start empty — no phantom './nature/01.jpg' path.
  // Placeholder shows until real images appear (via discovery or drag-drop).
  const [natureImages, setNatureImages] = useState([]);
  const [currentImg,   setCurrentImg]   = useState(null);

  useEffect(() => {
    window.discoverNatureImages().then(imgs => {
      if (imgs.length) {
        setNatureImages(imgs);
        setCurrentImg(imgs[0]);
      }
      // else: stays empty → placeholder stays visible
    });
  }, []);

  const onFiles = (files) => {
    const urls = files.map(f => URL.createObjectURL(f));
    setNatureImages(prev => [...prev, ...urls]);
    if (urls.length) setCurrentImg(urls[0]);
  };

  // ── History (undo, max 10) ──
  const [history, setHistory] = useState([]);
  const suppressHistory = useRef(false);

  const currentState = () => ({ mode, gradientTweaks, geometricTweaks, glass3dTweaks, natureTweaks, abstractTweaks, paletteTweaks, currentImg });
  const pushHistory = () => {
    if (suppressHistory.current) return;
    setHistory(h => [...h.slice(-9), currentState()]);
  };

  const changeMode = (next) => { if (next !== mode) { pushHistory(); setMode(next); } };
  const patchGradient  = (p) => { pushHistory(); setGradientTweaks(s  => ({ ...s, ...p })); };
  const patchGeometric = (p) => { pushHistory(); setGeometricTweaks(s => ({ ...s, ...p })); };
  const patchGlass3D   = (p) => { pushHistory(); setGlass3dTweaks(s   => ({ ...s, ...p })); };
  const patchNature    = (p) => { pushHistory(); setNatureTweaks(s    => ({ ...s, ...p })); };
  const patchAbstract  = (p) => { pushHistory(); setAbstractTweaks(s  => ({ ...s, ...p })); };
  const patchPalette   = (p) => { pushHistory(); setPaletteTweaks(s   => ({ ...s, ...p })); };

  const undo = () => {
    setHistory(h => {
      const prev = h[h.length - 1];
      if (!prev) return h;
      suppressHistory.current = true;
      setMode(prev.mode);
      setGradientTweaks(prev.gradientTweaks);
      setGeometricTweaks(prev.geometricTweaks);
      if (prev.glass3dTweaks) setGlass3dTweaks(prev.glass3dTweaks);
      setNatureTweaks(prev.natureTweaks);
      setAbstractTweaks(prev.abstractTweaks);
      if (prev.paletteTweaks) setPaletteTweaks(prev.paletteTweaks);
      if (prev.currentImg != null) setCurrentImg(prev.currentImg);
      setTimeout(() => { suppressHistory.current = false; }, 0);
      return h.slice(0, -1);
    });
  };

  // ── Snapshot / collection ──
  const snapshotRef = useRef(null);
  const registerSnapshot = useCallback((fn) => { snapshotRef.current = fn; }, []);
  const [toast, setToast] = useState(false);
  const [collection, setCollection] = useState([]);
  const [exportChecks, setExportChecks] = useState({});
  const collectionRef = useRef(null);
  const [collectionCollapsed, setCollectionCollapsed] = useState(false);
  const [collectionPos, setCollectionPos] = useState({ x: 88, y: 128 });
  const collectionDragRef = useRef(null);
  const collectionResizeRef = useRef(null);
  const exportResizeRef = useRef(null);
  const [previewImage, setPreviewImage] = useState(null);

  const showToast = () => { setToast(true); setTimeout(() => setToast(false), 1600); };

  const exportSizes = {
    uhd:    { label: '4K',        w: 3840, h: 2160 },
    qhd:    { label: '2K',        w: 2560, h: 1440 },
    hd:     { label: 'HD',        w: 1920, h: 1080 },
    cover:  { label: '1.91:1',    w: 1920, h: 1005 },
    insta:  { label: '4:5',       w: 1080, h: 1350 },
    mobile: { label: '9:16',      w: 1080, h: 1920 },
  };

  const captureCurrent = () => {
    const run = () => {
      if (!snapshotRef.current) return false;

      // Keep the first click fast: save a lightweight preview immediately.
      // Large export variants are rendered lazily, one per frame, so the UI does not freeze.
      const id = Date.now();
      const preview = snapshotRef.current({ width: 960, height: 540, returnDataUrl: true });
      if (!preview) return false;

      setCollection(items => [...items, { id, mode, dataUrl: preview, variants: {} }].slice(-24));
      setCollectionCollapsed(false);
      showToast();

      const keys = Object.keys(exportSizes);
      const renderNext = (idx = 0) => {
        if (!snapshotRef.current || idx >= keys.length) return;
        const sizeKey = keys[idx];
        const size = exportSizes[sizeKey];
        const dataUrl = snapshotRef.current({ width: size.w, height: size.h, returnDataUrl: true });
        if (dataUrl) {
          setCollection(items => items.map(item => item.id === id
            ? { ...item, variants: { ...(item.variants || {}), [sizeKey]: dataUrl } }
            : item
          ));
        }
        requestAnimationFrame(() => renderNext(idx + 1));
      };
      setTimeout(() => renderNext(0), 160);

      return true;
    };
    // Some modules register their export renderer one frame after a mode/state change.
    // Retry once so the first camera click is not silently lost.
    if (!run()) requestAnimationFrame(() => { if (!run()) setTimeout(run, 60); });
  };

  const doSnapshot = (sizeKey = 'qhd') => {
    if (!snapshotRef.current) return;
    const size = exportSizes[sizeKey] || exportSizes.qhd;
    snapshotRef.current({ width: size.w, height: size.h, filename: `nurr-${mode}-${size.label.replace(':','x')}-${Date.now()}.png` });
  };

  const toggleExportCheck = (itemId, sizeKey) => {
    const key = itemId + ':' + sizeKey;
    setExportChecks(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const setExportCell = (itemId, sizeKey, value) => {
    const key = itemId + ':' + sizeKey;
    setExportChecks(prev => ({ ...prev, [key]: value }));
  };

  const setExportAll = (value) => {
    const next = {};
    collection.forEach(item => Object.keys(exportSizes).forEach(sizeKey => { next[item.id + ':' + sizeKey] = value; }));
    setExportChecks(next);
  };

  const setExportRow = (itemId, value) => {
    setExportChecks(prev => {
      const next = { ...prev };
      Object.keys(exportSizes).forEach(sizeKey => { next[itemId + ':' + sizeKey] = value; });
      return next;
    });
  };

  const setExportColumn = (sizeKey, value) => {
    setExportChecks(prev => {
      const next = { ...prev };
      collection.forEach(item => { next[item.id + ':' + sizeKey] = value; });
      return next;
    });
  };

  const exportColumnChecked = (sizeKey) => {
    return !!collection.length && collection.every(item => !!exportChecks[item.id + ':' + sizeKey]);
  };

  const exportRowChecked = (itemId) => {
    return Object.keys(exportSizes).every(sizeKey => !!exportChecks[itemId + ':' + sizeKey]);
  };

  const exportSelected = async () => {
    const jobs = [];
    collection.forEach((item, index) => {
      Object.keys(exportSizes).forEach(sizeKey => {
        if (exportChecks[item.id + ':' + sizeKey]) jobs.push({ item, index, sizeKey, size: exportSizes[sizeKey] });
      });
    });
    if (!jobs.length) return;
    if (window.JSZip) {
      const zip = new JSZip();
      for (const job of jobs) {
        const dataUrl = (job.item.variants && job.item.variants[job.sizeKey]) || job.item.dataUrl;
        zip.file(`nurr-${String(job.index + 1).padStart(2,'0')}-${job.item.mode}-${job.size.label.replace(':','x')}.png`, dataUrl.split(',')[1], { base64: true });
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href=url; a.download='nurr-export-panel.zip';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } else {
      jobs.forEach(job => {
        const dataUrl = (job.item.variants && job.item.variants[job.sizeKey]) || job.item.dataUrl;
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `nurr-${job.item.mode}-${job.size.label.replace(':','x')}.png`;
        document.body.appendChild(a); a.click(); a.remove();
      });
    }
  };

  const downloadCollection = async () => {
    if (!collection.length) return;
    if (window.JSZip) {
      const zip = new JSZip();
      collection.forEach((item, i) => {
        zip.file(`nurr-${String(i+1).padStart(2,'0')}-${item.mode}.png`, item.dataUrl.split(',')[1], { base64: true });
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href=url; a.download='nurr-collection.zip';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } else {
      collection.forEach((item, i) => {
        const a = document.createElement('a'); a.href=item.dataUrl; a.download=`nurr-${i+1}-${item.mode}.png`;
        document.body.appendChild(a); a.click(); a.remove();
      });
    }
  };

  // Geometric canvas clicks are handled inside geometric.js.
  // Click now freezes/unfreezes the composition before saving.
  // Composition changes should happen from the panel cards or generate-new action.

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 's' || e.key === 'S') doSnapshot();
      if (e.key === '1') changeMode('gradient');
      if (e.key === '2') changeMode('geometric');
      if (e.key === '3') changeMode('glass3d');
      if (e.key === '4') changeMode('nature');
      if (e.key === '5') changeMode('abstract');
      if (e.key === '6') changeMode('palette');
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
      if (e.key === 'h' || e.key === 'H') setCollapsed(c => !c);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  const mouseRef = WP.useMouse();

  const onCollectionHeadDown = (e) => {
    if (e.target.closest('button')) return;
    const el = collectionRef.current;
    const rect = el?.getBoundingClientRect();
    if (!rect) return;
    collectionDragRef.current = {
      offX: e.clientX - rect.left,
      offY: e.clientY - rect.top,
      x: rect.left,
      y: rect.top
    };
    document.body.classList.add('nurr-no-select');
    e.preventDefault();
  };


  const onCollectionResizeDown = (e) => {
    const el = collectionRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    collectionResizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startW: rect.width,
      startH: rect.height
    };
    document.body.classList.add('nurr-no-select');
    e.preventDefault();
    e.stopPropagation();
  };

  const onExportResizeDown = (e) => {
    const win = exportPanelRef.current;
    if (!win) return;
    const rect = win.getBoundingClientRect();
    win.style.left = rect.left + 'px';
    win.style.top = rect.top + 'px';
    win.style.transform = 'none';
    exportResizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startW: rect.width,
      startH: rect.height,
      left: rect.left,
      top: rect.top,
      raf: null
    };
    document.body.classList.add('nurr-no-select');
    e.preventDefault();
    e.stopPropagation();
  };

  useEffect(() => {
    let raf = 0;
    const onMove = (e) => {
      const drag = collectionDragRef.current;
      const resize = collectionResizeRef.current;
      const el = collectionRef.current;
      if ((!drag && !resize) || !el) return;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (resize) {
          const w = Math.max(320, Math.min(window.innerWidth - 40, resize.startW + (e.clientX - resize.startX)));
          const h = Math.max(220, Math.min(window.innerHeight - 40, resize.startH + (e.clientY - resize.startY)));
          el.style.setProperty('width', w + 'px', 'important');
          el.style.setProperty('height', h + 'px', 'important');
          return;
        }
        const w = el.offsetWidth || 320;
        const h = el.offsetHeight || 110;
        const x = Math.max(8, Math.min(window.innerWidth - w - 8, e.clientX - drag.offX));
        const y = Math.max(8, Math.min(window.innerHeight - h - 8, e.clientY - drag.offY));
        drag.x = x; drag.y = y;
        el.style.setProperty('--collection-x', x + 'px');
        el.style.setProperty('--collection-y', y + 'px');
      });
    };
    const onUp = () => {
      const drag = collectionDragRef.current;
      const resize = collectionResizeRef.current;
      if (!drag && !resize) return;
      if (raf) cancelAnimationFrame(raf);
      if (drag) setCollectionPos({ x: drag.x, y: drag.y });
      collectionDragRef.current = null;
      collectionResizeRef.current = null;
      document.body.classList.remove('nurr-no-select');
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); if (raf) cancelAnimationFrame(raf); };
  }, []);

  // ── Draggable panel ──
  const panelRef  = useRef(null);
  const [panelPos, setPanelPos] = useState(null);
  const dragState = useRef(null);

  // Export floating window drag
  const exportPanelRef = useRef(null);
  const exportDragRef  = useRef(null);
  const [exportPos, setExportPos] = useState(null); // null = CSS-centered

  const onHeaderDown = (e) => {
    if (e.target.closest('.icon-btn')) return;
    const rect = panelRef.current.getBoundingClientRect();
    dragState.current = { offX: e.clientX - rect.left, offY: e.clientY - rect.top };
    e.preventDefault(); e.stopPropagation();
  };

  const onExportHeaderDown = (e) => {
    if (e.target.closest('button')) return;
    const win = exportPanelRef.current;
    const rect = win?.getBoundingClientRect();
    if (!rect || !win) return;
    exportDragRef.current = {
      offX: e.clientX - rect.left,
      offY: e.clientY - rect.top,
      raf: null
    };
    win.classList.add('is-dragging');
    // Break out of the initial centred CSS position before dragging.
    win.style.left = rect.left + 'px';
    win.style.top = rect.top + 'px';
    win.style.transform = 'none';
    document.body.classList.add('nurr-no-select');
    e.preventDefault();
  };

  useEffect(() => {
    const onMove = (e) => {
      if (dragState.current) {
        const { offX, offY } = dragState.current;
        const x = Math.max(8, Math.min(window.innerWidth  - 80, e.clientX - offX));
        const y = Math.max(8, Math.min(window.innerHeight - 80, e.clientY - offY));
        setPanelPos({ x, y });
      }
      if (exportDragRef.current) {
        const st = exportDragRef.current;
        const win = exportPanelRef.current;
        if (!win) return;
        const w = win.offsetWidth  || 820;
        const h = win.offsetHeight || 560;
        const x = Math.max(8, Math.min(window.innerWidth  - w - 8, e.clientX - st.offX));
        const y = Math.max(8, Math.min(window.innerHeight - h - 8, e.clientY - st.offY));
        if (st.raf) cancelAnimationFrame(st.raf);
        st.raf = requestAnimationFrame(() => {
          win.style.left = x + 'px';
          win.style.top = y + 'px';
          win.style.transform = 'none';
        });
      }
      if (exportResizeRef.current) {
        const st = exportResizeRef.current;
        const win = exportPanelRef.current;
        if (!win) return;
        const maxW = Math.max(520, window.innerWidth - st.left - 16);
        const maxH = Math.max(260, window.innerHeight - st.top - 16);
        const w = Math.max(520, Math.min(maxW, st.startW + (e.clientX - st.startX)));
        const h = Math.max(300, Math.min(maxH, st.startH + (e.clientY - st.startY)));
        if (st.raf) cancelAnimationFrame(st.raf);
        st.raf = requestAnimationFrame(() => {
          win.style.setProperty('width', w + 'px', 'important');
          win.style.setProperty('height', h + 'px', 'important');
        });
      }
    };
    const onUp = () => {
      dragState.current = null;
      if (exportDragRef.current) {
        if (exportDragRef.current.raf) cancelAnimationFrame(exportDragRef.current.raf);
        exportDragRef.current = null;
        exportPanelRef.current?.classList.remove('is-dragging');
        document.body.classList.remove('nurr-no-select');
      }
      if (exportResizeRef.current) {
        if (exportResizeRef.current.raf) cancelAnimationFrame(exportResizeRef.current.raf);
        exportResizeRef.current = null;
        document.body.classList.remove('nurr-no-select');
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const panelStyle = panelPos ? { left: panelPos.x, top: panelPos.y, right: 'auto' } : {};


  const pickPalette = (count = 4) => {
    const presets = (window.WP && Array.isArray(WP.PALETTE_PRESETS)) ? WP.PALETTE_PRESETS : [];
    const source = presets.length ? presets[Math.floor(Math.random() * presets.length)] : ['#08015F', '#FC6C3D', '#F4C4D7'];
    const unique = [];
    source.forEach(c => {
      const hex = String(c || '').trim().toUpperCase();
      if (/^#[0-9A-F]{6}$/.test(hex) && unique.indexOf(hex) === -1) unique.push(hex);
    });
    return unique.slice(0, count);
  };

  const generateNew = () => {
    pushHistory();
    if (mode === 'gradient') {
      const colors = pickPalette(4);
      setGradientTweaks(s => ({
        ...s,
        colors: colors.length >= 2 ? colors : s.colors,
        spread: colors.length >= 3 ? Math.max(s.spread ?? 0.62, 0.62) : 0.48
      }));
      return;
    }
    if (mode === 'geometric') {
      setGeometricTweaks(s => ({
        ...s,
        compositionIdx: Math.floor(Math.random() * window.GEOMETRIC_COMPOSITIONS_LEN),
        colors: pickPalette(3).slice(0, 3),
        grain: Math.min(0.32, Math.max(0.04, (s.grain ?? 0.1) + (Math.random() - 0.5) * 0.08))
      }));
      return;
    }
    if (mode === 'glass3d') {
      // 3D module v8: regenerate within the new one-object/material-aware system only.
      const objects = ['sphere','cube','soap','pebble','tablet','capsule','torus'];
      const materialTones = {
        glass: ['clear','smoke'],
        opal: ['milk','dusk'],
        water: ['aqua','deep'],
        metal: ['silver','gold','titanium','blackChrome'],
        holo: ['pearl','night'],
        crystal: ['ice','violet']
      };
      const materials = Object.keys(materialTones);
      const material = materials[Math.floor(Math.random() * materials.length)];
      const tones = materialTones[material];
      setGlass3dTweaks(s => ({
        ...s,
        object: objects[Math.floor(Math.random() * objects.length)],
        material,
        tone: tones[Math.floor(Math.random() * tones.length)],
        customTone: false,
        bgMode: 'gradient',
        bgSeed: Math.random(),
        scale: 0.82 + Math.random() * 0.50,
        translucency: material === 'metal' ? 0 : 0.48 + Math.random() * 0.42,
        depth: 0.72 + Math.random() * 0.85,
        edge: material === 'crystal' ? 0.62 + Math.random() * 0.35 : Math.random() * 0.72,
        surface: Math.random() * 0.34,
        light: 0.58 + Math.random() * 0.36,
        motion: 0.10 + Math.random() * 0.28,
        rotationSpeed: 0.02 + Math.random() * 0.22,
        turnY: Math.round(-55 + Math.random() * 110),
        tiltX: Math.round(-45 + Math.random() * 60),
        grain: Math.min(0.18, Math.max(0.025, (s.grain ?? 0.055) + (Math.random() - 0.5) * 0.05)),
        seed: Math.random()
      }));
      return;
    }
    if (mode === 'nature') {
      const effects = ['warp', 'blur', 'split', 'melt', 'nodes'];
      setNatureTweaks(s => ({
        ...s,
        effect: effects[Math.floor(Math.random() * effects.length)],
        warp: 0.28 + Math.random() * 0.52,
        blur: 0.22 + Math.random() * 0.58,
        split: 0.24 + Math.random() * 0.62,
        hue: (Math.random() - 0.5) * 0.22,
        sat: 0.78 + Math.random() * 0.72,
        contrast: 0.78 + Math.random() * 0.62,
        grain: Math.random() * 0.18,
        vignette: 0.08 + Math.random() * 0.38
      }));
      if (natureImages.length) setCurrentImg(natureImages[Math.floor(Math.random() * natureImages.length)]);
      return;
    }
    if (mode === 'abstract') {
      setAbstractTweaks(s => ({
        ...s,
        colors: pickPalette(4),
        seed: Math.random(),
        variant: Math.floor(Math.random() * 8),
        gradientSource: Math.random() > 0.5 ? 'blob' : 'smooth'
      }));
      return;
    }
    if (mode === 'palette') {
      const engine = window.NURR_PALETTE_ENGINE;
      if (engine && engine.generatePalette && engine.gradientFromPalette) {
        setPaletteTweaks(s => {
          const next = { ...s, temperature: (Math.random() - 0.5) * 0.7, intensity: 0.35 + Math.random() * 0.5, contrast: 0.35 + Math.random() * 0.5 };
          next.palette = engine.generatePalette(next);
          next.gradientColors = engine.gradientFromPalette(next.palette);
          return next;
        });
      }
    }
  };

  // ── Mode list ──
  const modes = [
    { id: 'gradient',  label: 'Gradient',  num: 'i.'   },
    { id: 'geometric', label: 'Geometric', num: 'ii.'  },
    { id: 'glass3d',   label: '3D Objects', num: 'iii.' },
    { id: 'nature',    label: 'Photo',     num: 'iv.'  },
    { id: 'abstract',  label: 'Abstract',  num: 'v.'   },
    { id: 'palette',   label: 'Palette',   num: 'vi.'  },
  ];

  if (false) { /* export page now rendered as floating overlay below */ }

  return (
    <>
      {/* ── Stage canvases ── */}
      {mode === 'gradient' && (
        <GradientMode tweaks={gradientTweaks} registerSnapshot={registerSnapshot} mouseRef={mouseRef} />
      )}
      {mode === 'geometric' && (
        <GeometricMode tweaks={geometricTweaks} registerSnapshot={registerSnapshot} mouseRef={mouseRef} />
      )}
      {mode === 'glass3d' && (
        <Glass3DMode tweaks={glass3dTweaks} registerSnapshot={registerSnapshot} mouseRef={mouseRef} />
      )}
      {mode === 'nature' && (
        <>
          <NatureMode tweaks={natureTweaks} registerSnapshot={registerSnapshot} mouseRef={mouseRef} currentImg={currentImg} />
          {/* Show placeholder whenever no image is loaded yet */}
          {!currentImg && <NaturePlaceholder onFiles={onFiles} />}
        </>
      )}
      {mode === 'abstract' && (
        <AbstractMode tweaks={abstractTweaks} registerSnapshot={registerSnapshot} mouseRef={mouseRef} />
      )}
      {mode === 'palette' && (
        <PaletteMode tweaks={paletteTweaks} registerSnapshot={registerSnapshot} mouseRef={mouseRef} />
      )}

      {/* ── Brand ── */}
      <button className="nurr-brand nurr-brand-button" onClick={() => setPage('studio')}>NURR</button>

      {/* ── Vertical rail ── */}
      <div className="rail">
        <div className="rail-group">
          {modes.map(m => (
            <button key={m.id} className={'rail-item' + (mode === m.id ? ' active' : '')} onClick={() => changeMode(m.id)}>
              <span className="num">{m.num}</span>{m.label}
            </button>
          ))}
        </div>
        <div className="rail-foot">Palette-led background systems</div>
      </div>

      {/* ── Corner mark ── */}
      <div className="corner-mark">
        <div className="big">vol. <em>i</em></div>
        <div className="small">№ 01 — 26</div>
      </div>

      {/* ── Panel ── */}
      <div ref={panelRef} className={'panel mode-' + mode + (collapsed ? ' collapsed' : '')} style={panelStyle}>
        <div className="panel-header" onMouseDown={onHeaderDown}>
          <div>
            <div className="panel-eyebrow">NURR</div>
            <div className="panel-title">Palette-led<br/>background systems</div>
          </div>
          <div className="header-actions">
            <button className="icon-btn" onClick={generateNew} title="Generate new">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-2.64-6.36"/>
                <path d="M21 3v6h-6"/>
              </svg>
            </button>
            <button className="icon-btn" onClick={undo} disabled={!history.length} title="Undo (⌘Z)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 1 1 0 12h-2"/>
              </svg>
            </button>
            <button className="icon-btn" onClick={captureCurrent} title="Snapshot to collection">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 19V8a2 2 0 0 0-2-2h-3.17l-1.84-2H10l-1.84 2H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2Z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
            </button>
            <button className="icon-btn" onClick={() => setCollapsed(c => !c)} title="Collapse (H)">
              {collapsed
                ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
                : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 15l-6-6-6 6"/></svg>
              }
            </button>
          </div>
        </div>

        {!collapsed && (
          <div className="panel-body">
            {mode === 'gradient'  && <GradientControls  tweaks={gradientTweaks}  setTweaks={patchGradient}  />}
            {mode === 'geometric' && <GeometricControls tweaks={geometricTweaks} setTweaks={patchGeometric} />}
            {mode === 'glass3d'   && <Glass3DControls tweaks={glass3dTweaks} setTweaks={patchGlass3D} />}
            {mode === 'nature'    && (
              <NatureControls tweaks={natureTweaks} setTweaks={patchNature}
                natureImages={natureImages} currentImg={currentImg}
                setCurrentImg={(img) => { pushHistory(); setCurrentImg(img); }}
                onFiles={onFiles} />
            )}
            {mode === 'abstract'  && <AbstractControls  tweaks={abstractTweaks}  setTweaks={patchAbstract}  />}
            {mode === 'palette'   && <PaletteControls   tweaks={paletteTweaks}   setTweaks={patchPalette}   />}

            <div className="btn-row" style={{ marginTop: 18 }}>
              <button className="btn primary btn-italic" onClick={() => doSnapshot('hd')} title="Download 1920×1080 PNG">HD ↓</button>
              <button className="btn primary btn-italic" onClick={() => doSnapshot('qhd')} title="Download 2560×1440 PNG">2K ↓</button>
              <button className="btn btn-italic" onClick={() => setPage('export')}>Export panel</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Collection drawer ── */}
      {collection.length > 0 && (
        <div
          ref={collectionRef}
          className={'collection-drawer' + (collectionCollapsed ? ' is-collapsed' : '')}
          style={collectionPos.y == null ? undefined : { '--collection-x': collectionPos.x + 'px', '--collection-y': collectionPos.y + 'px' }}
        >
          <div className="collection-head" onMouseDown={onCollectionHeadDown}>
            <span>Snapshots · {collection.length}</span>
            <div className="collection-head-actions">
              <button className="icon-btn" onClick={() => setCollectionCollapsed(v => !v)} title={collectionCollapsed ? 'Expand' : 'Minimize'}>
                {collectionCollapsed ? '+' : '−'}
              </button>
              <button className="icon-btn" onClick={downloadCollection} title="Download all">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>
                </svg>
              </button>
            </div>
          </div>
          {!collectionCollapsed && (
            <>
              <div className="collection-grid">
                {collection.map((item, i) => (
                  <div className="collection-tile" key={item.id}>
                    <button className="collection-item" type="button" onClick={() => setPreviewImage(item.dataUrl)} title="Preview snapshot">
                      <img src={item.dataUrl} alt="" />
                    </button>
                    <button className="collection-delete" title="Remove"
                      onClick={() => setCollection(items => items.filter(x => x.id !== item.id))}>×</button>
                  </div>
                ))}
              </div>
              <div className="collection-actions">
                <button className="btn btn-italic" onClick={() => setPage('export')}>Export panel</button>
                <button className="btn btn-italic" onClick={downloadCollection}>Download all</button>
                <button className="btn" onClick={() => setCollection([])}>Clear</button>
              </div>
            </>
          )}
          {!collectionCollapsed && <div className="collection-resize-handle" onMouseDown={onCollectionResizeDown} title="Resize snapshots" />}
        </div>
      )}

      {previewImage && (
        <div className="snapshot-preview-backdrop" onClick={() => setPreviewImage(null)}>
          <div className="snapshot-preview-window" onClick={(e) => e.stopPropagation()}>
            <button className="snapshot-preview-close" onClick={() => setPreviewImage(null)} title="Close">×</button>
            <img src={previewImage} alt="Snapshot preview" />
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      <div className={'snapshot-toast' + (toast ? ' show' : '')}>✓ saved</div>

      {/* ── Export floating window overlay ── */}
      {page === 'export' && (() => {
        const selectedCount = Object.values(exportChecks).filter(Boolean).length;
        return (
          <div className="export-overlay">
            <div className="export-overlay-backdrop" onClick={() => setPage('studio')} />
            <div ref={exportPanelRef} className="export-window">
              <div className="export-window-header" onMouseDown={onExportHeaderDown}>
                <div>
                  <div className="panel-eyebrow">EXPORT PANEL</div>
                  <div className="export-window-title">Select &amp; download</div>
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <button className="icon-btn" onClick={() => setPage('studio')} title="Close">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
                  </button>
                </div>
              </div>
              <div className="export-window-body">
                {!collection.length && (
                  <div className="export-empty">No snapshots yet — use the camera icon in the panel to capture, then return here.</div>
                )}
                {!!collection.length && (
                  <>
                    <div className="export-bulk">
                      <button className="btn" onClick={() => setExportAll(true)}>Check all</button>
                      <button className="btn" onClick={() => setExportAll(false)}>Clear all</button>
                      <span className="export-count">{selectedCount} selected</span>
                    </div>
                    <div className="export-grid-head">
                      <span>Snapshot</span>
                      {Object.entries(exportSizes).map(([sizeKey, size]) => (
                        <label className="export-col-select" key={sizeKey} title="Select column">
                          <input type="checkbox" checked={exportColumnChecked(sizeKey)} onChange={(e) => setExportColumn(sizeKey, e.target.checked)} />
                          <span>{size.label}<small>{size.w}×{size.h}</small></span>
                        </label>
                      ))}
                    </div>
                    <div className="export-list">
                      {collection.map((item, i) => (
                        <div className="export-row" key={item.id}>
                          <div className="export-thumb">
                            <label className="export-row-select" title="Select row">
                              <input type="checkbox" checked={exportRowChecked(item.id)} onChange={(e) => setExportRow(item.id, e.target.checked)} />
                              <span></span>
                            </label>
                            <img src={item.dataUrl} alt="" />
                            <div><strong>{String(i+1).padStart(2,'0')}</strong><small>{item.mode}</small></div>
                          </div>
                          {Object.keys(exportSizes).map(sizeKey => (
                            <label className="export-check" key={sizeKey}>
                              <input type="checkbox" checked={!!exportChecks[item.id + ':' + sizeKey]} onChange={(e) => setExportCell(item.id, sizeKey, e.target.checked)} />
                              <span></span>
                            </label>
                          ))}
                        </div>
                      ))}
                    </div>
                    <div className="export-actions">
                      <button className="btn primary btn-italic" onClick={exportSelected} disabled={!selectedCount}>Export selected ZIP ↓</button>
                      <span>{selectedCount} asset{selectedCount === 1 ? '' : 's'} selected</span>
                    </div>
                  </>
                )}
              </div>
              <div className="export-resize-grip" onMouseDown={onExportResizeDown} title="Resize export panel"></div>
            </div>
          </div>
        );
      })()}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
