/* ─────────────────────────────────────────────────────────────────────────────
   mobile-ui.js — NYMPH mobile experience (separate from the desktop panel)

   This file builds a self-contained mobile UI: a top module strip beside the
   logo, a bottom action dock (Shuffle · Undo · Export · Controls), category
   control cards, and a dedicated export sheet. It reuses the app's real state
   and the shared WebGL renderers, but shares NO markup with the desktop panel.

   Exposes: window.NymphMobileUI  (a React component App renders once).
   All styling lives in css/mobile-ui.css (loaded last). Visibility is decided
   purely in CSS by breakpoint — this component is always mounted, and simply
   display:none above the mobile breakpoint.
   ───────────────────────────────────────────────────────────────────────────── */
(function () {
  const { useState, useRef, useEffect } = React;

  /* ── colour helpers (self-contained, HSV) ───────────────────────────────── */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function hexToRgb(hex) {
    let h = String(hex || '').replace('#', '').trim();
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(h)) h = '888888';
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }
  function rgbToHex(r, g, b) {
    const c = v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
    return ('#' + c(r) + c(g) + c(b)).toUpperCase();
  }
  function hexToHsv(hex) {
    const { r, g, b } = hexToRgb(hex);
    const rr = r / 255, gg = g / 255, bb = b / 255;
    const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb), d = max - min;
    let h = 0;
    if (d) {
      if (max === rr) h = ((gg - bb) / d) % 6;
      else if (max === gg) h = (bb - rr) / d + 2;
      else h = (rr - gg) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return { h, s: max ? d / max : 0, v: max };
  }
  function hsvToHex(h, s, v) {
    h = ((h % 360) + 360) % 360;
    const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
    let rr = 0, gg = 0, bb = 0;
    if (h < 60) [rr, gg, bb] = [c, x, 0];
    else if (h < 120) [rr, gg, bb] = [x, c, 0];
    else if (h < 180) [rr, gg, bb] = [0, c, x];
    else if (h < 240) [rr, gg, bb] = [0, x, c];
    else if (h < 300) [rr, gg, bb] = [x, 0, c];
    else [rr, gg, bb] = [c, 0, x];
    return rgbToHex((rr + m) * 255, (gg + m) * 255, (bb + m) * 255);
  }

  const pct = v => Math.round((v || 0) * 100);

  /* ── icons ───────────────────────────────────────────────────────────────── */
  const Icon = ({ name }) => {
    const p = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' };
    if (name === 'shuffle') return <svg {...p}><path d="M16 3h5v5" /><path d="M4 20 21 3" /><path d="M21 16v5h-5" /><path d="m15 15 6 6" /><path d="M4 4l5 5" /></svg>;
    if (name === 'undo') return <svg {...p}><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></svg>;
    if (name === 'export') return <svg {...p}><path d="M12 15V3" /><path d="m7 8 5-5 5 5" /><path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" /></svg>;
    if (name === 'controls') return <svg {...p}><path d="M4 6h10" /><path d="M18 6h2" /><circle cx="16" cy="6" r="2" /><path d="M4 12h2" /><path d="M10 12h10" /><circle cx="8" cy="12" r="2" /><path d="M4 18h10" /><path d="M18 18h2" /><circle cx="16" cy="18" r="2" /></svg>;
    if (name === 'camera') return <svg {...p}><path d="M21 19V8a2 2 0 0 0-2-2h-3l-2-2h-4L8 6H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2Z" /><circle cx="12" cy="13" r="3.5" /></svg>;
    if (name === 'close') return <svg {...p} strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>;
    if (name === 'plus') return <svg {...p} strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>;
    if (name === 'image') return <svg {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="1.6" /><path d="m21 15-4.5-4.5L5 21" /></svg>;
    return null;
  };

  /* ── primitive controls ──────────────────────────────────────────────────── */
  function Row({ label, value, min, max, step, val, on }) {
    return (
      <div className="nm-row">
        <div className="nm-row-head">
          <span className="nm-row-label">{label}</span>
          <span className="nm-row-val">{value}</span>
        </div>
        <input className="nm-slider" type="range" min={min} max={max} step={step || 0.01}
          value={val} onChange={e => on(parseFloat(e.target.value))} />
      </div>
    );
  }

  function Seg({ label, options, value, on }) {
    return (
      <div className="nm-field">
        {label && <div className="nm-field-label">{label}</div>}
        <div className="nm-seg" data-count={options.length}>
          {options.map(([id, lab]) => (
            <button key={id} type="button"
              className={'nm-seg-opt' + (value === id ? ' is-on' : '')}
              onClick={() => on(id)}>{lab}</button>
          ))}
        </div>
      </div>
    );
  }

  function Toggles({ items }) {
    return (
      <div className="nm-toggles">
        {items.map(([label, active, on]) => (
          <button key={label} type="button"
            className={'nm-toggle' + (active ? ' is-on' : '')}
            onClick={on}>{label}</button>
        ))}
      </div>
    );
  }

  /* ── colour picker (SV pad + hue strip) ──────────────────────────────────── */
  function ColorPicker({ hex, onChange }) {
    const { h, s, v } = hexToHsv(hex);
    const padRef = useRef(null);
    const dragging = useRef(false);

    const apply = (clientX, clientY) => {
      const el = padRef.current; if (!el) return;
      const r = el.getBoundingClientRect();
      const ns = clamp((clientX - r.left) / r.width, 0, 1);
      const nv = clamp(1 - (clientY - r.top) / r.height, 0, 1);
      onChange(hsvToHex(h, ns, nv));
    };
    const down = e => { dragging.current = true; el(e).setPointerCapture?.(e.pointerId); apply(e.clientX, e.clientY); };
    const move = e => { if (dragging.current) apply(e.clientX, e.clientY); };
    const up = () => { dragging.current = false; };
    const el = e => e.currentTarget;

    return (
      <div className="nm-cp">
        <div ref={padRef} className="nm-cp-sv"
          style={{ background: `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, ${hsvToHex(h, 1, 1)})` }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <span className="nm-cp-dot" style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%` }} />
        </div>
        <input className="nm-cp-hue" type="range" min="0" max="360" step="1"
          value={Math.round(h)}
          onChange={e => onChange(hsvToHex(parseFloat(e.target.value), s || 0.7, v || 0.9))} />
      </div>
    );
  }

  function PaletteCard({ colors, setColors, minColors, maxColors, displayColors, extra }) {
    const [edit, setEdit] = useState(null);
    const shown = displayColors || colors;
    const add = () => {
      if (colors.length >= maxColors) return;
      const seed = colors[colors.length - 1] || '#8898F0';
      const next = [...colors, seed];
      setColors(next); setEdit(next.length - 1);
    };
    const remove = (i) => {
      if (colors.length <= minColors) return;
      setColors(colors.filter((_, j) => j !== i)); setEdit(null);
    };
    const change = (i, hx) => { const n = colors.slice(); n[i] = hx; setColors(n); };

    return (
      <>
        <div className="nm-swatches">
          {shown.map((c, i) => (
            <button key={i} type="button"
              className={'nm-swatch' + (edit === i ? ' is-editing' : '')}
              style={{ background: c }}
              onClick={() => setEdit(edit === i ? null : i)} />
          ))}
          {colors.length < maxColors && (
            <button type="button" className="nm-swatch nm-swatch-add" onClick={add} aria-label="Add colour">
              <Icon name="plus" />
            </button>
          )}
        </div>

        {edit != null && colors[edit] != null && (
          <div className="nm-picker">
            <ColorPicker hex={colors[edit]} onChange={hx => change(edit, hx)} />
            <div className="nm-picker-foot">
              <span className="nm-hex">{String(colors[edit] || '').toUpperCase()}</span>
              <div className="nm-picker-btns">
                {colors.length > minColors && (
                  <button type="button" className="nm-mini" onClick={() => remove(edit)}>Remove</button>
                )}
                <button type="button" className="nm-mini nm-mini-solid" onClick={() => setEdit(null)}>Done</button>
              </div>
            </div>
          </div>
        )}

        {extra && <div className="nm-inline-actions">{extra}</div>}
      </>
    );
  }

  function SwatchGrid({ presets, onPick, cols }) {
    return (
      <div className="nm-preset-grid" style={{ '--nm-cols': cols || 3 }}>
        {presets.map((p, i) => (
          <button key={i} type="button" className="nm-preset" onClick={() => onPick(p)}>
            {p.slice(0, 5).map((c, j) => <span key={j} style={{ background: c }} />)}
          </button>
        ))}
      </div>
    );
  }

  // Presets are hidden by default: a slim toggle expands them on demand so the
  // preset grid doesn't dominate the palette card and steal canvas space.
  function PresetsCollapsible({ presets, onPick, cols, label }) {
    const [open, setOpen] = useState(false);
    if (!presets || !presets.length) return null;
    return (
      <div className={'nm-collapsible' + (open ? ' is-open' : '')}>
        <button type="button" className="nm-collapse-btn"
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}>
          <span>{label || 'Presets'}</span>
          <span className="nm-collapse-caret" aria-hidden="true">
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
              <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>
        {open && (
          <div className="nm-collapse-body">
            <SwatchGrid presets={presets} onPick={p => { onPick(p); setOpen(false); }} cols={cols} />
          </div>
        )}
      </div>
    );
  }

  /* ── card sets per module ────────────────────────────────────────────────── */
  function cardsForMode(mode) {
    if (mode === 'gradient') return [
      ['palette', 'Palette'], ['composition', 'Composition'], ['color', 'Color'], ['motion', 'Motion'],
    ];
    if (mode === 'abstract') return [
      ['palette', 'Palette'], ['composition', 'Composition'], ['structure', 'Structure'], ['color', 'Color'], ['motion', 'Motion'],
    ];
    if (mode === 'geometric') return [
      ['palette', 'Palette'], ['composition', 'Composition'], ['structure', 'Structure'], ['motion', 'Motion'],
    ];
    // nature / photo
    return [
      ['image', 'Image'], ['effect', 'Effect'], ['color', 'Color'], ['motion', 'Motion'],
    ];
  }

  const ABSTRACT_FORMS = [
    ['clear', 'Clear'], ['prism', 'Prism'], ['water', 'Reflected'], ['ripple', 'Ripple'],
  ];
  const ABSTRACT_PRESETS = [
    ['#EAF0F2', '#F04A2F', '#2637D9', '#2E2A4F', '#F7FAFB'],
    ['#07104C', '#FC6C3D', '#98F2F4', '#E38BB8', '#05040A'],
    ['#F4EDE0', '#BE1E2D', '#1E33B8', '#B9BCC9', '#11121E'],
    ['#05040A', '#08015F', '#FC6C3D', '#F4BE62', '#98F2F4'],
    ['#e8f4f8', '#b8d9e8', '#7ab8d4', '#3a85a8', '#0a3c5c'],
    ['#f5ede0', '#d4b896', '#a07850', '#6b4428', '#2c1508'],
    ['#0d0221', '#3a0e6f', '#7b2fbe', '#c77dff', '#e0aaff'],
    ['#f2f7ff', '#c8dcf8', '#8ab8f0', '#4a88d8', '#0a3c8c'],
  ];

  /* ── card body renderer ──────────────────────────────────────────────────── */
  function renderCard(card, ctx) {
    const { mode } = ctx;
    if (mode === 'gradient') return gradientCard(card, ctx);
    if (mode === 'abstract') return abstractCard(card, ctx);
    if (mode === 'geometric') return geometricCard(card, ctx);
    return natureCard(card, ctx);
  }

  function gradientCard(card, ctx) {
    const t = ctx.gradientTweaks || {};
    const set = ctx.patchGradient;
    const adjust = window.NURR_adjustGradientHex;
    const manualPatch = window.NURR_manualGradientPatch;
    const setColors = (next) => set(manualPatch ? manualPatch(next, t) : { colors: next.slice(0, 4), manualPalette: true });
    const displayColors = (t.colors || []).map(c => (adjust ? adjust(c, t) : c));
    const presets = (window.WP && window.WP.PALETTE_PRESETS) || [];
    const surfaces = (window.NurrTextureEngine && window.NurrTextureEngine.list && window.NurrTextureEngine.list()) || [];
    const curSurface = t.texturePreset || 'clean';

    if (card === 'palette') return (<>
      <PaletteCard colors={t.colors || []} setColors={setColors} minColors={1} maxColors={4}
        displayColors={displayColors}
        extra={<>
          <button type="button" className="nm-mini" onClick={() => set({ ...(manualPatch ? manualPatch((t.colors || []).slice().reverse(), t) : { colors: (t.colors || []).slice().reverse() }), textureSeed: Math.random() })}>Flip</button>
          <button type="button" className="nm-mini nm-mini-solid" onClick={ctx.onShuffle}>Randomize</button>
        </>} />
      <PresetsCollapsible presets={presets} cols={4} onPick={p => setColors(p.slice(0, 4))} />
    </>);
    if (card === 'composition') return (<>
      <Seg label="Direction" value={t.direction || 'organic'} on={id => set({ direction: id })}
        options={[['organic', 'Organic'], ['horizontal', 'Horizontal'], ['vertical', 'Vertical']]} />
      <Row label="Color spread" value={pct(t.spread ?? 0.62)} min="0.18" max="1" val={t.spread ?? 0.62} on={v => set({ spread: v })} />
      <Row label="Color distance" value={pct(t.colorDistance ?? 0.56)} min="0" max="1" val={t.colorDistance ?? 0.56} on={v => set({ colorDistance: v })} />
      <Row label="Blend" value={pct(t.blend ?? 0.56)} min="0" max="1" val={t.blend ?? 0.56} on={v => set({ blend: v })} />
    </>);
    if (card === 'color') return (<>
      <Row label="Pigment" value={pct(t.pigment ?? 0.5)} min="0" max="1" val={t.pigment ?? 0.5} on={v => set({ pigment: v })} />
      <Row label="Saturation" value={pct(t.saturation ?? 0.5)} min="0" max="1" val={t.saturation ?? 0.5} on={v => set({ saturation: v })} />
      <Row label="Color temp" value={pct(t.temperature ?? 0)} min="-1" max="1" val={t.temperature ?? 0} on={v => set({ temperature: v })} />
      <Toggles items={[
        ['B&W', !!t.bw, () => set({ bw: !t.bw })],
        ['Invert', !!t.invert, () => set({ invert: !t.invert })],
      ]} />
    </>);
    if (card === 'motion') return (<>
      <Row label="Flow" value={pct(t.flow / 2.2)} min="0" max="2.2" val={t.flow ?? 0.9} on={v => set({ flow: v })} />
      <Row label="Grain" value={pct(t.grain ?? 0)} min="0" max="1" val={t.grain ?? 0} on={v => set({ grain: v })} />
      <div className="nm-field">
        <div className="nm-field-label">Surface</div>
        <div className="nm-chip-row">
          {surfaces.map(s => (
            <button key={s.id} type="button"
              className={'nm-chip' + (curSurface === s.id ? ' is-on' : '')}
              onClick={() => set(window.NurrTextureEngine.applyPresetToTweaks(s, t))}>{s.name}</button>
          ))}
        </div>
      </div>
      {curSurface !== 'clean' && (
        <Row label={curSurface === 'print-noise' ? 'Pixel size' : 'Surface amount'} value={pct(t.textureAmount ?? 0)}
          min="0" max="1" val={t.textureAmount ?? 0} on={v => set({ textureAmount: v })} />
      )}
    </>);
    return null;
  }

  function abstractCard(card, ctx) {
    const t = ctx.abstractTweaks || {};
    const set = ctx.patchAbstract;
    const setColors = (next) => set({ colors: next.slice(0, 4) });
    const isRipple = t.formation === 'ripple';
    const selForm = isRipple ? 'ripple' : (t.glassType || 'clear');

    if (card === 'palette') return (
      <>
        <PaletteCard colors={t.colors || []} setColors={setColors} minColors={1} maxColors={4}
          extra={<>
            <button type="button" className="nm-mini nm-mini-solid" onClick={ctx.onShuffle}>Randomize</button>
            <button type="button" className={'nm-mini' + (t.bw ? ' is-on' : '')} onClick={() => set({ bw: !t.bw })}>B&amp;W</button>
            <button type="button" className={'nm-mini' + (t.invert ? ' is-on' : '')} onClick={() => set({ invert: !t.invert })}>Invert</button>
          </>} />
        <PresetsCollapsible presets={ABSTRACT_PRESETS} cols={4}
          onPick={p => set({ colors: p.slice(0, 4), seed: Math.random() })} />
      </>
    );
    if (card === 'composition') return (<>
      <Seg label="Form" value={selForm} on={id => {
        if (id === 'ripple') set({ formation: 'ripple', glassType: 'clear' });
        else set({ formation: 'glass', glassType: id });
      }} options={ABSTRACT_FORMS} />
      <Seg label="Gradient source" value={t.gradientSource || 'smooth'} on={id => set({ gradientSource: id })}
        options={[['smooth', 'Smooth'], ['blob', 'Blob']]} />
    </>);
    if (card === 'structure') return (<>
      <Row label={isRipple ? 'Ripple strength' : 'Refraction'} value={pct(t.rippleStrength ?? 0.5)} min="0" max="1" val={t.rippleStrength ?? 0.5} on={v => set({ rippleStrength: v })} />
      {!isRipple && <Row label="Density" value={pct(t.glassDensity ?? 0.5)} min="0" max="1" val={t.glassDensity ?? 0.5} on={v => set({ glassDensity: v })} />}
      {!isRipple && <Row label="Orientation" value={pct(t.glassAngle ?? 0)} min="0" max="1" val={t.glassAngle ?? 0} on={v => set({ glassAngle: v })} />}
      {!isRipple && <Row label="Highlights" value={pct(t.specular ?? 0.5)} min="0" max="1" val={t.specular ?? 0.5} on={v => set({ specular: v })} />}
      <Row label="Field spread" value={pct(t.vectorDistance ?? 0.5)} min="0" max="1" val={t.vectorDistance ?? 0.5} on={v => set({ vectorDistance: v })} />
      <Row label="Field scale" value={pct(t.vectorSize ?? 0.5)} min="0" max="1" val={t.vectorSize ?? 0.5} on={v => set({ vectorSize: v })} />
    </>);
    if (card === 'color') return (<>
      <Row label="Contrast" value={pct(t.contrast ?? 0.5)} min="0" max="1" val={t.contrast ?? 0.5} on={v => set({ contrast: v })} />
      <Toggles items={[
        ['B&W', !!t.bw, () => set({ bw: !t.bw })],
        ['Invert', !!t.invert, () => set({ invert: !t.invert })],
      ]} />
    </>);
    if (card === 'motion') return (<>
      <Row label="Speed" value={pct((t.animSpeed ?? 1) / 2)} min="0" max="2" val={t.animSpeed ?? 1} on={v => set({ animSpeed: v })} />
      <Row label="Blur" value={pct(t.blur ?? 0)} min="0" max="1" val={t.blur ?? 0} on={v => set({ blur: v })} />
      <Row label="Grain" value={pct(t.grain ?? 0)} min="0" max="1" val={t.grain ?? 0} on={v => set({ grain: v })} />
      <Row label="Vignette" value={pct(t.vignette ?? 0)} min="0" max="1" val={t.vignette ?? 0} on={v => set({ vignette: v })} />
    </>);
    return null;
  }

  function geometricCard(card, ctx) {
    const t = ctx.geometricTweaks || {};
    const set = ctx.patchGeometric;
    const setColors = (next) => set({ colors: next.slice(0, 6) });
    const presets = (window.WP && window.WP.PALETTE_PRESETS) || [];
    const comps = window.NURR_GEOMETRIC_COMPOSITIONS || [];

    if (card === 'palette') return (
      <>
        <PaletteCard colors={t.colors || []} setColors={setColors} minColors={1} maxColors={6}
          extra={<button type="button" className="nm-mini nm-mini-solid" onClick={ctx.onShuffle}>Randomize</button>} />
        <PresetsCollapsible presets={presets} cols={4} onPick={p => set({ colors: p.slice(0, 3) })} />
      </>
    );
    if (card === 'composition') return (
      <div className="nm-field">
        <div className="nm-field-label">Composition · {(t.compositionIdx ?? 0) + 1}/{comps.length || '—'}</div>
        <div className="nm-num-grid">
          {comps.map((c, i) => (
            <button key={i} type="button"
              className={'nm-num' + (i === t.compositionIdx ? ' is-on' : '')}
              onClick={() => set({ compositionIdx: i })}>{String(i + 1).padStart(2, '0')}</button>
          ))}
        </div>
      </div>
    );
    if (card === 'structure') return (<>
      <Row label="Vector distance" value={pct((t.vectorDistance ?? 1) / 1.85)} min="0.45" max="1.85" val={t.vectorDistance ?? 1} on={v => set({ vectorDistance: v })} />
      <Row label="Vector size" value={pct((t.vectorScale ?? 1) / 1.9)} min="0.35" max="1.9" val={t.vectorScale ?? 1} on={v => set({ vectorScale: v })} />
    </>);
    if (card === 'motion') return (<>
      <Row label="Mouse pull" value={pct((t.mousePull ?? 1) / 2)} min="0" max="2" val={t.mousePull ?? 1} on={v => set({ mousePull: v })} />
      <Row label="Grain" value={pct(t.grain ?? 0)} min="0" max="1" val={t.grain ?? 0} on={v => set({ grain: v })} />
    </>);
    return null;
  }

  function natureCard(card, ctx) {
    const t = ctx.natureTweaks || {};
    const set = ctx.patchNature;
    const strengthKey = t.effect === 'blur' ? 'blur' : t.effect === 'split' ? 'split' : 'warp';
    const fileRef = ctx.fileRef;

    if (card === 'image') return (<>
      <div className="nm-field">
        <div className="nm-field-label">Photos · {ctx.natureImages.length || 'none'}</div>
        {ctx.natureImages.length > 0 && (
          <div className="nm-thumb-row">
            {ctx.natureImages.map((url, i) => (
              <button key={i} type="button"
                className={'nm-thumb' + (url === ctx.currentImg ? ' is-on' : '')}
                onClick={() => ctx.onPickImage(url)}>
                <img src={url} alt="" />
              </button>
            ))}
          </div>
        )}
      </div>
      <button type="button" className="nm-upload" onClick={() => fileRef.current && fileRef.current.click()}>
        <Icon name="image" /> Add photo
      </button>
      <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
        onChange={e => { ctx.onFiles(Array.from(e.target.files)); e.target.value = ''; }} />
    </>);
    if (card === 'effect') return (<>
      <Seg label="Effect" value={t.effect || 'warp'} on={id => set({ effect: id })}
        options={[['warp', 'Warp'], ['blur', 'Blur'], ['split', 'Split'], ['melt', 'Melt'], ['nodes', 'Nodes']]} />
      <Row label="Strength" value={pct(t[strengthKey] ?? 0)} min="0" max="1" val={t[strengthKey] ?? 0} on={v => set({ [strengthKey]: v })} />
      <p className="nm-hint">Move over the image to steer the effect. Tap for a pulse.</p>
    </>);
    if (card === 'color') return (<>
      <Row label="Hue" value={Math.round((t.hue ?? 0) * 360) + '°'} min="-0.5" max="0.5" val={t.hue ?? 0} on={v => set({ hue: v })} />
      <Row label="Saturation" value={(t.sat ?? 1).toFixed(2)} min="0" max="2.2" val={t.sat ?? 1} on={v => set({ sat: v })} />
      <Row label="Contrast" value={(t.contrast ?? 1).toFixed(2)} min="0.4" max="1.9" val={t.contrast ?? 1} on={v => set({ contrast: v })} />
    </>);
    if (card === 'motion') return (<>
      <Row label="Grain" value={pct(t.grain ?? 0)} min="0" max="1" val={t.grain ?? 0} on={v => set({ grain: v })} />
      <Row label="Vignette" value={pct(t.vignette ?? 0)} min="0" max="1" val={t.vignette ?? 0} on={v => set({ vignette: v })} />
    </>);
    return null;
  }

  /* ── export sheet ────────────────────────────────────────────────────────── */
  const EXPORT_CHOICES = [
    ['wide', 'HD', '1920×1080'],
    ['qhd', '2K', '2560×1440'],
    ['uhd', '4K', '3840×2160'],
    ['story', '9:16', '1080×1920'],
  ];

  function dataURLtoBlob(dataURL) {
    try {
      const [head, body] = dataURL.split(',');
      const mime = (head.match(/:(.*?);/) || [])[1] || 'image/png';
      const bin = atob(body);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return new Blob([arr], { type: mime });
    } catch (e) { return null; }
  }

  function ExportSheet({ ctx, onClose }) {
    const [choice, setChoice] = useState(null);   // size key
    const [img, setImg] = useState(null);         // { url, blobUrl, label, dims }
    const [busy, setBusy] = useState(false);

    const generate = (key) => {
      const meta = EXPORT_CHOICES.find(c => c[0] === key);
      setChoice(key); setBusy(true); setImg(null);
      // let the sheet paint the busy state before the synchronous render
      requestAnimationFrame(() => {
        const url = ctx.getImage(key);
        setBusy(false);
        if (!url) return;
        const blob = dataURLtoBlob(url);
        setImg({ url, blobUrl: blob ? URL.createObjectURL(blob) : url, label: meta[1], dims: meta[2] });
      });
    };

    const download = () => {
      if (!img) return;
      const a = document.createElement('a');
      a.href = img.blobUrl; a.download = `nymph-${ctx.mode}-${img.label}-${Date.now()}.png`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };
    const openTab = () => { if (img) window.open(img.blobUrl, '_blank'); };

    return (
      <div className="nm-sheet nm-sheet-export">
        <div className="nm-sheet-grip" onClick={onClose} />
        <div className="nm-sheet-head">
          <div>
            <div className="nm-eyebrow">Export</div>
            <div className="nm-sheet-title">Save your artwork</div>
          </div>
          <button type="button" className="nm-x" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>

        <div className="nm-sheet-body">
          <div className="nm-export-sizes">
            {EXPORT_CHOICES.map(([key, label, dims]) => (
              <button key={key} type="button"
                className={'nm-size' + (choice === key ? ' is-on' : '')}
                onClick={() => generate(key)}>
                <strong>{label}</strong><small>{dims}</small>
              </button>
            ))}
          </div>

          {busy && <div className="nm-export-busy">Rendering at full resolution…</div>}

          {img && !busy && (
            <div className="nm-export-result">
              <div className="nm-export-preview">
                <img src={img.url} alt="Export preview" />
              </div>
              <div className="nm-export-meta">{img.label} · {img.dims} · PNG</div>
              <div className="nm-export-actions">
                <button type="button" className="nm-btn nm-btn-solid" onClick={download}>Download</button>
                <button type="button" className="nm-btn" onClick={openTab}>Open image</button>
              </div>
              <p className="nm-hint">On iPhone, press and hold the image above to save it to Photos.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── controls sheet ──────────────────────────────────────────────────────── */
  function ControlsSheet({ ctx, onClose }) {
    const cards = cardsForMode(ctx.mode);
    const [active, setActive] = useState(cards[0][0]);
    // keep active card valid when the module changes
    useEffect(() => {
      if (!cards.some(c => c[0] === active)) setActive(cards[0][0]);
    }, [ctx.mode]);

    return (
      <div className="nm-sheet nm-sheet-controls">
        <div className="nm-sheet-grip" onClick={onClose} />
        <div className="nm-cardtabs">
          {cards.map(([id, label]) => (
            <button key={id} type="button"
              className={'nm-cardtab' + (active === id ? ' is-on' : '')}
              onClick={() => setActive(id)}>{label}</button>
          ))}
        </div>
        <div className="nm-sheet-body nm-card-body" key={ctx.mode + ':' + active}>
          {renderCard(active, ctx)}
        </div>
      </div>
    );
  }

  /* ── root ────────────────────────────────────────────────────────────────── */
  function MobileUI(props) {
    const [sheet, setSheet] = useState(null); // null | 'controls' | 'export'
    const fileRef = useRef(null);

    // Stable visible-viewport height → CSS var. Guards against the iOS URL-bar
    // 100vh jump that stretched gradients and made sheets resize mid-drag.
    useEffect(() => {
      const setVH = () => {
        const vv = window.visualViewport;
        const h = vv ? vv.height : window.innerHeight;
        document.documentElement.style.setProperty('--nymph-vh', h + 'px');
      };
      setVH();
      window.addEventListener('resize', setVH, { passive: true });
      window.visualViewport && window.visualViewport.addEventListener('resize', setVH, { passive: true });
      return () => {
        window.removeEventListener('resize', setVH);
        window.visualViewport && window.visualViewport.removeEventListener('resize', setVH);
      };
    }, []);

    const ctx = { ...props, fileRef };
    const toggle = (name) => setSheet(s => (s === name ? null : name));

    return (
      <div className="nymph-m" data-mode={props.mode}>
        {/* top: logo + module strip */}
        <header className="nm-top">
          <button type="button" className="nm-logo" onClick={props.onHome} aria-label="NYMPH home">
            <img src="assets/logos/nymph-logomark.svg" alt="NYMPH" />
          </button>
          <nav className="nm-modes">
            {props.modules.map(m => (
              <button key={m.id} type="button"
                className={'nm-mode' + (props.mode === m.id ? ' is-on' : '')}
                onClick={() => props.onMode(m.id)}>
                <span className="nm-mode-num">{m.num}</span>{m.label}
              </button>
            ))}
          </nav>
        </header>

        {/* sheets — only one at a time, never stacked */}
        {sheet === 'controls' && <ControlsSheet ctx={ctx} onClose={() => setSheet(null)} />}
        {sheet === 'export' && <ExportSheet ctx={ctx} onClose={() => setSheet(null)} />}

        {/* bottom dock */}
        <nav className="nm-dock">
          <button type="button" className="nm-dock-btn" onClick={props.onShuffle}>
            <Icon name="shuffle" /><span>Shuffle</span>
          </button>
          <button type="button" className="nm-dock-btn" onClick={props.onUndo} disabled={!props.canUndo}>
            <Icon name="undo" /><span>Undo</span>
          </button>
          <button type="button" className="nm-dock-btn" onClick={props.onSnap}>
            <Icon name="camera" /><span>Snap</span>
          </button>
          <button type="button" className={'nm-dock-btn' + (sheet === 'export' ? ' is-on' : '')} onClick={() => toggle('export')}>
            <Icon name="export" /><span>Export</span>
          </button>
          <button type="button" className={'nm-dock-btn' + (sheet === 'controls' ? ' is-on' : '')} onClick={() => toggle('controls')}>
            <Icon name="controls" /><span>Controls</span>
          </button>
        </nav>
      </div>
    );
  }

  window.NymphMobileUI = MobileUI;
})();
