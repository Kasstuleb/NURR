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
  const [collapsed, setCollapsed] = useState(false);

  // Per-mode tweaks
  const [gradientTweaks,  setGradientTweaks]  = useState(window.GRADIENT_DEFAULTS);
  const [geometricTweaks, setGeometricTweaks] = useState(window.GEOMETRIC_DEFAULTS);
  const [natureTweaks,    setNatureTweaks]    = useState(window.NATURE_DEFAULTS);
  const [abstractTweaks,  setAbstractTweaks]  = useState(window.ABSTRACT_DEFAULTS);
  const [paletteTweaks,   setPaletteTweaks]   = useState(window.PALETTE_DEFAULTS);

  // ── Nature / photo state ──
  const [natureImages, setNatureImages] = useState([]);
  const [currentImg,   setCurrentImg]   = useState(null);

  useEffect(() => {
    window.discoverNatureImages().then(imgs => {
      if (imgs.length) {
        setNatureImages(imgs);
        setCurrentImg(imgs[0]);
      }
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

  const currentState = () => ({ mode, gradientTweaks, geometricTweaks, natureTweaks, abstractTweaks, paletteTweaks, currentImg });
  const pushHistory = () => {
    if (suppressHistory.current) return;
    setHistory(h => [...h.slice(-9), currentState()]);
  };

  const changeMode = (next) => { if (next !== mode) { pushHistory(); setMode(next); } };
  const patchGradient  = (p) => { pushHistory(); setGradientTweaks(s  => ({ ...s, ...p })); };
  const patchGeometric = (p) => { pushHistory(); setGeometricTweaks(s => ({ ...s, ...p })); };
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

  const showToast = () => { setToast(true); setTimeout(() => setToast(false), 1600); };

  const captureCurrent = () => {
    const canvas = document.querySelector('canvas.stage'); if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    setCollection(items => [...items, { id: Date.now(), mode, dataUrl }].slice(-24));
    showToast();
  };

  const doSnapshot = () => {
    if (snapshotRef.current) { snapshotRef.current(); showToast(); }
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

  // ── Geometric: click-to-cycle compositions ──
  useEffect(() => {
    if (mode !== 'geometric') return;
    const onDown = (e) => {
      if (e.target.closest('.panel,.icon-btn,.rail,.layout-card,.palette-card,.nature-thumb,.swatch,.color-wheel-card,.eyedropper-follow,.formation-card,button,input,.drop-zone')) return;
      setGeometricTweaks(s => ({ ...s, compositionIdx: (s.compositionIdx + 1) % window.GEOMETRIC_COMPOSITIONS_LEN }));
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [mode]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 's' || e.key === 'S') doSnapshot();
      if (e.key === '1') changeMode('gradient');
      if (e.key === '2') changeMode('geometric');
      if (e.key === '3') changeMode('nature');
      if (e.key === '4') changeMode('abstract');
      if (e.key === '5') changeMode('palette');
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
      if (e.key === 'h' || e.key === 'H') setCollapsed(c => !c);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  const mouseRef = WP.useMouse();

  // ── Draggable panel ──
  const panelRef  = useRef(null);
  const [panelPos, setPanelPos] = useState(null);
  const dragState = useRef(null);

  const onHeaderDown = (e) => {
    if (e.target.closest('.icon-btn')) return;
    const rect = panelRef.current.getBoundingClientRect();
    dragState.current = { offX: e.clientX - rect.left, offY: e.clientY - rect.top };
    e.preventDefault(); e.stopPropagation();
  };

  useEffect(() => {
    const onMove = (e) => {
      if (!dragState.current) return;
      const { offX, offY } = dragState.current;
      const x = Math.max(8, Math.min(window.innerWidth  - 80, e.clientX - offX));
      const y = Math.max(8, Math.min(window.innerHeight - 80, e.clientY - offY));
      setPanelPos({ x, y });
    };
    const onUp = () => { dragState.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const panelStyle = panelPos ? { left: panelPos.x, top: panelPos.y, right: 'auto' } : {};

  // ── Mode list ──
  const modes = [
    { id: 'gradient',  label: 'Gradient',  num: 'i.'   },
    { id: 'geometric', label: 'Geometric', num: 'ii.'  },
    { id: 'nature',    label: 'Photo',     num: 'iii.' },
    { id: 'abstract',  label: 'Abstract',  num: 'iv.'  },
    { id: 'palette',   label: 'Palette',   num: 'v.'   },
  ];

  // ── Generate new — mode-aware randomisation ──────────────────────────────
  // Fires when the generate-new icon button in the panel header is clicked.
  const generateNew = () => {
    if (mode === 'gradient') {
      const presets = (window.WP && window.WP.PALETTE_PRESETS) || [];
      if (presets.length > 0) {
        const p = presets[Math.floor(Math.random() * presets.length)];
        patchGradient({ colors: p.slice(0, 4) });
      }
    } else if (mode === 'geometric') {
      patchGeometric({
        compositionIdx: (geometricTweaks.compositionIdx + 1) % (window.GEOMETRIC_COMPOSITIONS_LEN || 1)
      });
    } else if (mode === 'nature') {
      if (natureImages.length > 1) {
        const cur = natureImages.indexOf(currentImg);
        const next = natureImages[(cur + 1) % natureImages.length];
        pushHistory();
        setCurrentImg(next);
      }
    } else if (mode === 'abstract') {
      patchAbstract({ seed: Math.random() });
    } else if (mode === 'palette') {
      const engine = window.NURR_PALETTE_ENGINE;
      const seeds  = window.NURR_PALETTE_SEEDS || [];
      if (engine && seeds.length > 0) {
        const randFamily = seeds[Math.floor(Math.random() * seeds.length)].id;
        const newPalette = engine.generatePalette({ ...paletteTweaks, family: randFamily });
        patchPalette({
          family: randFamily,
          palette: newPalette,
          gradientColors: engine.gradientFromPalette(newPalette)
        });
      }
    }
  };

  return (
    <>
      {/* ── Stage canvases ── */}
      {mode === 'gradient' && (
        <GradientMode tweaks={gradientTweaks} registerSnapshot={registerSnapshot} mouseRef={mouseRef} />
      )}
      {mode === 'geometric' && (
        <GeometricMode tweaks={geometricTweaks} registerSnapshot={registerSnapshot} mouseRef={mouseRef} />
      )}
      {mode === 'nature' && (
        <>
          <NatureMode tweaks={natureTweaks} registerSnapshot={registerSnapshot} mouseRef={mouseRef} currentImg={currentImg} />
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
      <div className="nurr-brand">NURR</div>

      {/* ── Vertical rail ── */}
      <div className="rail">
        <div className="rail-group">
          {modes.map(m => (
            <button key={m.id} className={'rail-item' + (mode === m.id ? ' active' : '')} onClick={() => changeMode(m.id)}>
              <span className="num">{m.num}</span>{m.label}
            </button>
          ))}
        </div>
        <div className="rail-foot">— palette-led background systems —</div>
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
            <button className="icon-btn" onClick={undo} disabled={!history.length} title="Undo (⌘Z)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 1 1 0 12h-2"/>
              </svg>
            </button>
            {/* Generate new — picks a fresh result for the current mode */}
            <button className="icon-btn" onClick={generateNew} title="Generate new">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 4v6h-6"/>
                <path d="M1 20v-6h6"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
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
            {mode === 'nature'    && (
              <NatureControls tweaks={natureTweaks} setTweaks={patchNature}
                natureImages={natureImages} currentImg={currentImg}
                setCurrentImg={(img) => { pushHistory(); setCurrentImg(img); }}
                onFiles={onFiles} />
            )}
            {mode === 'abstract'  && <AbstractControls  tweaks={abstractTweaks}  setTweaks={patchAbstract}  />}
            {mode === 'palette'   && <PaletteControls   tweaks={paletteTweaks}   setTweaks={patchPalette}   />}

            <div className="btn-row" style={{ marginTop: 18 }}>
              <button className="btn primary btn-italic" onClick={doSnapshot} title="Download 3840×2160 PNG">
                Save 4K PNG ↓
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Collection drawer ── */}
      {collection.length > 0 && (
        <div className="collection-drawer">
          <div className="collection-head">
            <span>Snapshots · {collection.length}</span>
            <button className="icon-btn" onClick={downloadCollection} title="Download all">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>
              </svg>
            </button>
          </div>
          <div className="collection-grid">
            {collection.map((item, i) => (
              <div className="collection-tile" key={item.id}>
                <a className="collection-item" href={item.dataUrl} download={`nurr-${i+1}-${item.mode}.png`}>
                  <img src={item.dataUrl} alt="" />
                </a>
                <button className="collection-delete" title="Remove"
                  onClick={() => setCollection(items => items.filter(x => x.id !== item.id))}>×</button>
              </div>
            ))}
          </div>
          <div className="collection-actions">
            <button className="btn btn-italic" onClick={downloadCollection}>Download all</button>
            <button className="btn" onClick={() => setCollection([])}>Clear</button>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      <div className={'snapshot-toast' + (toast ? ' show' : '')}>✓ saved</div>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
