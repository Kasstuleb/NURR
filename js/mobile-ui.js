/* ─────────────────────────────────────────────────────────────────────────────
   mobile-ui.js — NYMPH mobile experience

   Structural changes vs. the previous pass:

     · CARD GRAMMAR. Every module now uses the same four-beat order —
       colour, then form, then structure, then finish — with shared tab names.
       Gradient collapsed 5 cards into 4 (Grain folded into Texture, Direction
       moved out of Palette and into Form where it belongs). Flow collapsed 6
       into 4 (Structure folded into Shape, Grain folded into Effects). Abstract
       went 6 → 5, Photo stayed at 4 but Grain/Vignette became "Finish".
       Nothing is buried two taps deep any more.

     · THE COLOUR PICKER IS AN HSL EDITOR. The old one was an HSV pad plus a
       hue strip crammed into a 210px sheet — unusable with a thumb. Now the
       sheet grows for it, and you get:
         – an HSL square (x = saturation, y = lightness)
         – three full-width tracks, each painted with a live gradient of its
           own outcome: hue, saturation, lightness
         – a hex field you can type or paste into, and a Copy button
         – recents, so a colour used on one swatch is one tap away on the next
       Saturation and lightness are first-class sliders, not just a corner of
       a pad, which is what "max freedom" actually needs.

     · Slider values still follow the thumb during scrub; the sheet grip is
       still drag-to-close.

   Exposes: window.NymphMobileUI  (a React component App renders once).
   All styling lives in css/mobile-ui.css.
   ───────────────────────────────────────────────────────────────────────────── */
(function () {
  const { useState, useRef, useEffect, useCallback } = React;

  /* ── colour helpers ──────────────────────────────────────────────────────
     HSL end to end. The square, all three tracks, and the hex field read and
     write the same model, so nothing drifts as you move between them. */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function normalizeHex(hex) {
    let h = String(hex || '').replace('#', '').trim();
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return ('#' + h).toUpperCase();
  }

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

  function rgbToHsl(r, g, b) {
    const rr = r / 255, gg = g / 255, bb = b / 255;
    const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
    const l = (max + min) / 2;
    let h = 0, s = 0;
    const d = max - min;
    if (d) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === rr) h = ((gg - bb) / d) % 6;
      else if (max === gg) h = (bb - rr) / d + 2;
      else h = (rr - gg) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h, s: s * 100, l: l * 100 };
  }

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = clamp(s, 0, 100) / 100;
    l = clamp(l, 0, 100) / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let rr = 0, gg = 0, bb = 0;
    if (h < 60) [rr, gg, bb] = [c, x, 0];
    else if (h < 120) [rr, gg, bb] = [x, c, 0];
    else if (h < 180) [rr, gg, bb] = [0, c, x];
    else if (h < 240) [rr, gg, bb] = [0, x, c];
    else if (h < 300) [rr, gg, bb] = [x, 0, c];
    else [rr, gg, bb] = [c, 0, x];
    return { r: (rr + m) * 255, g: (gg + m) * 255, b: (bb + m) * 255 };
  }

  function hexToHsl(hex) {
    const { r, g, b } = hexToRgb(hex);
    return rgbToHsl(r, g, b);
  }

  function hslToHex(h, s, l) {
    const { r, g, b } = hslToRgb(h, s, l);
    return rgbToHex(r, g, b);
  }

  const pct = v => Math.round((v || 0) * 100);

  /* Recents survive card and module switches for the life of the page. */
  const RECENTS = [];
  function pushRecent(hex) {
    const h = normalizeHex(hex);
    if (!h) return;
    const at = RECENTS.indexOf(h);
    if (at !== -1) RECENTS.splice(at, 1);
    RECENTS.unshift(h);
    if (RECENTS.length > 8) RECENTS.length = 8;
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) { /* fall through to the legacy path */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (_) {
      return false;
    }
  }

  /* ── icons ───────────────────────────────────────────────────────────────── */
  const Icon = ({ name, size = 20 }) => {
    const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' };
    if (name === 'shuffle') return <svg {...p}><path d="M16 3h5v5" /><path d="M4 20 21 3" /><path d="M21 16v5h-5" /><path d="m15 15 6 6" /><path d="M4 4l5 5" /></svg>;
    if (name === 'undo') return <svg {...p}><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></svg>;
    if (name === 'export') return <svg {...p}><path d="M12 15V3" /><path d="m7 8 5-5 5 5" /><path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" /></svg>;
    if (name === 'controls') return <svg {...p}><path d="M4 6h10" /><path d="M18 6h2" /><circle cx="16" cy="6" r="2" /><path d="M4 12h2" /><path d="M10 12h10" /><circle cx="8" cy="12" r="2" /><path d="M4 18h10" /><path d="M18 18h2" /><circle cx="16" cy="18" r="2" /></svg>;
    if (name === 'camera') return <svg {...p}><path d="M21 19V8a2 2 0 0 0-2-2h-3l-2-2h-4L8 6H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2Z" /><circle cx="12" cy="13" r="3.5" /></svg>;
    if (name === 'close') return <svg {...p} strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>;
    if (name === 'plus') return <svg {...p} strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>;
    if (name === 'image') return <svg {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="1.6" /><path d="m21 15-4.5-4.5L5 21" /></svg>;
    if (name === 'back') return <svg {...p}><path d="M15 6l-6 6 6 6" /></svg>;
    if (name === 'trash') return <svg {...p}><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" /></svg>;
    if (name === 'copy') return <svg {...p}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>;
    if (name === 'check') return <svg {...p} strokeWidth="2.2"><path d="M20 6 9 17l-5-5" /></svg>;
    return null;
  };

  /* ── slider row with live-value chip ─────────────────────────────────────
     The value chip normally sits in the row head. During touch/drag it moves
     to follow the thumb so the reading is always right next to the finger. */
  function Row({ label, value, min, max, step, val, on, hint }) {
    const [scrubbing, setScrubbing] = useState(false);
    const [thumbPct, setThumbPct] = useState(0);
    useEffect(() => {
      const range = (parseFloat(max) - parseFloat(min)) || 1;
      setThumbPct(clamp((parseFloat(val) - parseFloat(min)) / range, 0, 1));
    }, [val, min, max]);
    return (
      <div className={'nm-row' + (scrubbing ? ' is-scrub' : '')}>
        <div className="nm-row-head">
          <span className="nm-row-label">{label}</span>
          {!scrubbing && <span className="nm-row-val">{value}</span>}
        </div>
        <div className="nm-slider-wrap">
          <input className="nm-slider" type="range" min={min} max={max} step={step || 0.01}
            value={val}
            onChange={e => on(parseFloat(e.target.value))}
            onPointerDown={() => setScrubbing(true)}
            onPointerUp={() => setScrubbing(false)}
            onPointerCancel={() => setScrubbing(false)}
            onTouchStart={() => setScrubbing(true)}
            onTouchEnd={() => setScrubbing(false)} />
          {scrubbing && (
            <span className="nm-slider-chip" style={{ left: `calc(${thumbPct * 100}% - 20px + ${(0.5 - thumbPct) * 26}px)` }}>
              {value}
            </span>
          )}
        </div>
        {hint && <p className="nm-hint">{hint}</p>}
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

  /* ── ActionRow: card-scoped shortcuts (Shuffle / Undo at the top of Palette) */
  function ActionRow({ children }) {
    return <div className="nm-action-row">{children}</div>;
  }
  function ActionButton({ icon, label, onClick, disabled, primary }) {
    return (
      <button type="button" disabled={disabled}
        className={'nm-action' + (primary ? ' is-primary' : '')}
        onClick={onClick}>
        <Icon name={icon} size={16} /><span>{label}</span>
      </button>
    );
  }

  /* ── Palette swatches ────────────────────────────────────────────────────
     Tapping a swatch fires onEdit(i) — the parent hoists a full-sheet picker
     overlay. This keeps the swatch card compact and gives the picker real room. */
  function PaletteSwatches({ colors, displayColors, setColors, onEdit, maxColors }) {
    const shown = displayColors || colors;
    const add = () => {
      if (colors.length >= maxColors) return;
      const seed = RECENTS[0] || colors[colors.length - 1] || '#8898F0';
      const next = [...colors, seed];
      setColors(next);
      onEdit(next.length - 1);
    };
    return (
      <div className="nm-swatches">
        {shown.map((c, i) => (
          <button key={i} type="button"
            className="nm-swatch"
            style={{ background: c }}
            aria-label={'Edit colour ' + (i + 1)}
            onClick={() => onEdit(i)} />
        ))}
        {colors.length < maxColors && (
          <button type="button" className="nm-swatch nm-swatch-add" onClick={add} aria-label="Add colour">
            <Icon name="plus" size={16} />
          </button>
        )}
      </div>
    );
  }

  /* ── One painted HSL track ───────────────────────────────────────────────
     `track` is the CSS gradient that shows what the slider does. Putting the
     outcome inside the control is the whole point: you aim at the colour you
     want rather than at a number. */
  function ColorTrack({ label, value, display, min, max, step, track, on }) {
    return (
      <div className="nm-track-row">
        <div className="nm-track-head">
          <span className="nm-track-label">{label}</span>
          <span className="nm-track-val">{display}</span>
        </div>
        <input className="nm-cslider" type="range"
          min={min} max={max} step={step || 1}
          value={value}
          style={{ '--nm-track': track }}
          onChange={e => on(parseFloat(e.target.value))} />
      </div>
    );
  }

  /* ── Hex field with copy ─────────────────────────────────────────────────
     Typed and pasted values are accepted the moment they parse; anything else
     is held in the draft so a half-typed "#3f" doesn't blow the swatch away. */
  function HexField({ hex, onChange }) {
    const [draft, setDraft] = useState(hex);
    const [focused, setFocused] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => { if (!focused) setDraft(String(hex || '').toUpperCase()); }, [hex, focused]);
    useEffect(() => {
      if (!copied) return;
      const t = setTimeout(() => setCopied(false), 1400);
      return () => clearTimeout(t);
    }, [copied]);

    const commit = (raw) => {
      setDraft(raw);
      const norm = normalizeHex(raw);
      if (norm) onChange(norm);
    };

    const doCopy = async () => {
      const ok = await copyText(String(hex || '').toUpperCase());
      if (ok) setCopied(true);
    };

    return (
      <div className="nm-hexrow">
        <label className="nm-hexfield">
          <span className="nm-hexfield-label">Hex</span>
          <input className="nm-hexinput" type="text"
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck="false"
            maxLength={7}
            value={draft}
            onFocus={() => setFocused(true)}
            onBlur={() => { setFocused(false); setDraft(String(hex || '').toUpperCase()); }}
            onChange={e => commit(e.target.value)} />
        </label>
        <button type="button"
          className={'nm-hexcopy' + (copied ? ' is-done' : '')}
          onClick={doCopy}>
          <Icon name={copied ? 'check' : 'copy'} size={13} />
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
    );
  }

  /* ── Full-sheet colour picker overlay ────────────────────────────────────
     Replaces the sheet body when a swatch is being edited, and the sheet grows
     to `has-picker` height so nothing here has to be cramped. */
  function PickerOverlay({ hex, onChange, onDone, onRemove, canRemove, onBack }) {
    /* HSL loses hue at L=0 and L=100, and loses it again at S=0. Without a
       memory of the last meaningful hue/saturation, dragging Lightness down to
       black and back up would strand you on grey. Hold them. */
    const hsRef = useRef({ h: 0, s: 70 });
    const raw = hexToHsl(hex);
    const atExtreme = raw.l <= 0.4 || raw.l >= 99.6;
    const h = (!atExtreme && raw.s > 0.4) ? raw.h : hsRef.current.h;
    const s = atExtreme ? hsRef.current.s : raw.s;
    const l = raw.l;

    useEffect(() => {
      if (atExtreme) return;
      if (raw.s > 0.4) hsRef.current = { h: raw.h, s: raw.s };
      else hsRef.current = { h: hsRef.current.h, s: raw.s };
    }, [hex]);

    const padRef = useRef(null);
    const dragging = useRef(false);

    const applyPad = (clientX, clientY) => {
      const el = padRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const ns = clamp((clientX - r.left) / r.width, 0, 1) * 100;
      const nl = (1 - clamp((clientY - r.top) / r.height, 0, 1)) * 100;
      onChange(hslToHex(h, ns, nl));
    };
    const down = e => {
      dragging.current = true;
      try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch (_) { }
      applyPad(e.clientX, e.clientY);
    };
    const move = e => { if (dragging.current) applyPad(e.clientX, e.clientY); };
    const up = () => { dragging.current = false; };

    const hueTrack = 'linear-gradient(90deg, #FF0000 0%, #FFFF00 17%, #00FF00 33%, #00FFFF 50%, #0000FF 67%, #FF00FF 83%, #FF0000 100%)';
    const satTrack = `linear-gradient(90deg, hsl(${h} 0% ${l}%), hsl(${h} 100% ${l}%))`;
    const lumTrack = `linear-gradient(90deg, #000, hsl(${h} ${s}% 50%), #fff)`;

    const padBg =
      'linear-gradient(to bottom, #fff 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,0) 50%, #000 100%),' +
      `linear-gradient(to right, hsl(${h} 0% 50%), hsl(${h} 100% 50%))`;

    const recents = RECENTS.slice(0, 8);
    const empties = Math.max(0, 6 - recents.length);

    return (
      <div className="nm-picker-overlay">
        <div className="nm-picker-bar">
          <button type="button" className="nm-picker-back" onClick={onBack} aria-label="Back to palette">
            <Icon name="back" size={18} /><span>Palette</span>
          </button>
          <span className="nm-picker-chip" style={{ background: hex }} />
        </div>

        <HexField hex={hex} onChange={onChange} />

        <div ref={padRef} className="nm-picker-sv"
          style={{ background: padBg }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <span className="nm-picker-dot"
            style={{ left: `${s}%`, top: `${100 - l}%`, background: hex }} />
        </div>

        <div className="nm-tracks">
          <ColorTrack label="Hue" display={`${Math.round(h)}°`}
            min={0} max={360} step={1} value={Math.round(h)} track={hueTrack}
            on={v => onChange(hslToHex(v, s, l))} />
          <ColorTrack label="Saturation" display={`${Math.round(s)}%`}
            min={0} max={100} step={1} value={Math.round(s)} track={satTrack}
            on={v => onChange(hslToHex(h, v, l))} />
          <ColorTrack label="Lightness" display={`${Math.round(l)}%`}
            min={0} max={100} step={1} value={Math.round(l)} track={lumTrack}
            on={v => onChange(hslToHex(h, s, v))} />
        </div>

        <div className="nm-recents">
          <div className="nm-track-label">Recent</div>
          <div className="nm-recent-row">
            {recents.map((c, i) => (
              <button key={c + i} type="button" className="nm-recent"
                style={{ background: c }}
                aria-label={'Use ' + c}
                onClick={() => onChange(c)} />
            ))}
            {Array.from({ length: empties }).map((_, i) => (
              <span key={'e' + i} className="nm-recent is-empty" aria-hidden="true" />
            ))}
          </div>
        </div>

        <div className="nm-picker-actions">
          {canRemove && (
            <button type="button" className="nm-btn nm-btn-danger" onClick={onRemove}>
              <Icon name="trash" size={14} /><span>Remove</span>
            </button>
          )}
          <button type="button" className="nm-btn nm-btn-solid"
            onClick={() => { pushRecent(hex); onDone(); }}>Done</button>
        </div>
      </div>
    );
  }

  /* ── Presets: collapsed by default ───────────────────────────────────── */
  function SwatchPresets({ presets, onPick, cols }) {
    if (!presets || !presets.length) return null;
    return (
      <div className="nm-preset-grid" style={{ '--nm-cols': cols || 4 }}>
        {presets.map((p, i) => (
          <button key={i} type="button" className="nm-preset" onClick={() => onPick(p)}>
            {p.slice(0, 5).map((c, j) => <span key={j} style={{ background: c }} />)}
          </button>
        ))}
      </div>
    );
  }
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
            <SwatchPresets presets={presets} onPick={p => { onPick(p); setOpen(false); }} cols={cols} />
          </div>
        )}
      </div>
    );
  }

  /* ── card sets per module ────────────────────────────────────────────────
     One grammar everywhere: Palette (what colours) → Form / Shape (what it is)
     → Structure (how it is built) → Finish / Texture (how it is printed).
     Tab names are shared across modules so the bar teaches itself once. */
  function cardsForMode(mode) {
    if (mode === 'gradient') return [
      ['palette', 'Palette'],
      ['tone', 'Tone'],
      ['form', 'Form'],
      ['texture', 'Texture'],
    ];
    if (mode === 'abstract') return [
      ['palette', 'Palette'],
      ['form', 'Form'],
      ['structure', 'Structure'],
      ['finish', 'Finish'],
      ['motion', 'Motion'],
    ];
    if (mode === 'geometric') return [
      ['palette', 'Palette'],
      ['shape', 'Shape'],
      ['render', 'Render'],
      ['effects', 'Effects'],
    ];
    // nature / photo
    return [
      ['image', 'Image'],
      ['effect', 'Effect'],
      ['tone', 'Tone'],
      ['finish', 'Finish'],
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

  /* ── card body renderer ──────────────────────────────────────────────── */
  function renderCard(card, ctx) {
    const { mode } = ctx;
    if (mode === 'gradient') return gradientCard(card, ctx);
    if (mode === 'abstract') return abstractCard(card, ctx);
    if (mode === 'geometric') return geometricCard(card, ctx);
    return natureCard(card, ctx);
  }

  /* ── Gradient ─────────────────────────────────────────────────────────────
     Palette · Tone · Form · Texture
     Direction moved out of Palette (it describes form, not colour) and Grain
     merged into Texture (both are surface finish). */
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
      <ActionRow>
        <ActionButton icon="shuffle" label="Shuffle" onClick={ctx.onShuffle} primary />
        <ActionButton icon="undo" label="Undo" onClick={ctx.onUndo} disabled={!ctx.canUndo} />
      </ActionRow>
      <PaletteSwatches
        colors={t.colors || []}
        displayColors={displayColors}
        setColors={setColors}
        onEdit={i => ctx.setPicker({ i, module: 'gradient' })}
        maxColors={4} />
      <PresetsCollapsible presets={presets} cols={4} onPick={p => setColors(p.slice(0, 4))} />
    </>);

    if (card === 'tone') return (<>
      <Row label="Pigment"    value={pct(t.pigment ?? 0.5)}    min="0" max="1" val={t.pigment ?? 0.5} on={v => set({ pigment: v })} />
      <Row label="Saturation" value={pct(t.saturation ?? 0.5)} min="0" max="1" val={t.saturation ?? 0.5} on={v => set({ saturation: v })} />
      <Row label="Color temp" value={pct(t.temperature ?? 0)} min="-1" max="1" val={t.temperature ?? 0} on={v => set({ temperature: v })} />
      <Toggles items={[
        ['B&W', !!t.bw, () => set({ bw: !t.bw })],
        ['Invert', !!t.invert, () => set({ invert: !t.invert })],
      ]} />
    </>);

    if (card === 'form') return (<>
      <Seg label="Direction" value={t.direction || 'organic'} on={id => set({ direction: id })}
        options={[['organic', 'Organic'], ['horizontal', 'Horizontal'], ['vertical', 'Vertical']]} />
      <Row label="Color spread"   value={pct(t.spread ?? 0.62)}        min="0.18" max="1" val={t.spread ?? 0.62} on={v => set({ spread: v })} />
      <Row label="Color distance" value={pct(t.colorDistance ?? 0.56)} min="0"    max="1" val={t.colorDistance ?? 0.56} on={v => set({ colorDistance: v })} />
      <Row label="Blend"          value={pct(t.blend ?? 0.56)}         min="0"    max="1" val={t.blend ?? 0.56} on={v => set({ blend: v })} />
      <Row label="Flow"           value={pct((t.flow ?? 0.9) / 2.2)}   min="0"    max="2.2" val={t.flow ?? 0.9} on={v => set({ flow: v })} />
    </>);

    if (card === 'texture') return (<>
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
        <Row label={curSurface === 'print-noise' ? 'Pixel size' : 'Amount'}
          value={pct(t.textureAmount ?? 0)}
          min="0" max="1" val={t.textureAmount ?? 0} on={v => set({ textureAmount: v })} />
      )}
      <Row label="Film grain" value={pct(t.grain ?? 0)} min="0" max="1" val={t.grain ?? 0} on={v => set({ grain: v })}
        hint="Film-style dust across the whole canvas." />
    </>);

    return null;
  }

  /* ── Abstract ─────────────────────────────────────────────────────────────
     Palette · Form · Structure · Finish · Motion
     Contrast, B&W, Invert, Grain and Vignette are all finishing moves, so they
     now live in one card instead of two. */
  function abstractCard(card, ctx) {
    const t = ctx.abstractTweaks || {};
    const set = ctx.patchAbstract;
    const setColors = (next) => set({ colors: next.slice(0, 4) });
    const isRipple = t.formation === 'ripple';
    const selForm = isRipple ? 'ripple' : (t.glassType || 'clear');

    if (card === 'palette') return (<>
      <ActionRow>
        <ActionButton icon="shuffle" label="Shuffle" onClick={ctx.onShuffle} primary />
        <ActionButton icon="undo" label="Undo" onClick={ctx.onUndo} disabled={!ctx.canUndo} />
      </ActionRow>
      <PaletteSwatches
        colors={t.colors || []}
        setColors={setColors}
        onEdit={i => ctx.setPicker({ i, module: 'abstract' })}
        maxColors={4} />
      <PresetsCollapsible presets={ABSTRACT_PRESETS} cols={4}
        onPick={p => set({ colors: p.slice(0, 4), seed: Math.random() })} />
    </>);

    if (card === 'form') return (<>
      <Seg label="Form" value={selForm} on={id => {
        if (id === 'ripple') set({ formation: 'ripple', glassType: 'clear' });
        else set({ formation: 'glass', glassType: id });
      }} options={ABSTRACT_FORMS} />
      <Seg label="Gradient source" value={t.gradientSource || 'smooth'} on={id => set({ gradientSource: id })}
        options={[['smooth', 'Smooth'], ['blob', 'Blob']]} />
    </>);

    if (card === 'structure') return (<>
      <Row label={isRipple ? 'Ripple strength' : 'Refraction'}
        value={pct(t.rippleStrength ?? 0.5)} min="0" max="1"
        val={t.rippleStrength ?? 0.5} on={v => set({ rippleStrength: v })} />
      {!isRipple && (<>
        <Row label="Density"     value={pct(t.glassDensity ?? 0.5)} min="0" max="1" val={t.glassDensity ?? 0.5} on={v => set({ glassDensity: v })} />
        <Row label="Orientation" value={pct(t.glassAngle ?? 0)}     min="0" max="1" val={t.glassAngle ?? 0}     on={v => set({ glassAngle: v })} />
        <Row label="Highlights"  value={pct(t.specular ?? 0.5)}     min="0" max="1" val={t.specular ?? 0.5}     on={v => set({ specular: v })} />
      </>)}
      <Row label="Field spread" value={pct(t.vectorDistance ?? 0.5)} min="0" max="1" val={t.vectorDistance ?? 0.5} on={v => set({ vectorDistance: v })} />
      <Row label="Field scale"  value={pct(t.vectorSize ?? 0.5)}     min="0" max="1" val={t.vectorSize ?? 0.5}     on={v => set({ vectorSize: v })} />
    </>);

    if (card === 'finish') return (<>
      <Row label="Contrast" value={pct(t.contrast ?? 0.5)} min="0" max="1" val={t.contrast ?? 0.5} on={v => set({ contrast: v })} />
      <Toggles items={[
        ['B&W', !!t.bw, () => set({ bw: !t.bw })],
        ['Invert', !!t.invert, () => set({ invert: !t.invert })],
      ]} />
      <Row label="Grain"    value={pct(t.grain ?? 0)}    min="0" max="1" val={t.grain ?? 0}    on={v => set({ grain: v })} />
      <Row label="Vignette" value={pct(t.vignette ?? 0)} min="0" max="1" val={t.vignette ?? 0} on={v => set({ vignette: v })} />
    </>);

    if (card === 'motion') return (<>
      <Row label="Speed" value={pct((t.animSpeed ?? 1) / 2)} min="0" max="2" val={t.animSpeed ?? 1} on={v => set({ animSpeed: v })} />
      <Row label="Blur"  value={pct(t.blur ?? 0)}            min="0" max="1" val={t.blur ?? 0}      on={v => set({ blur: v })} />
    </>);

    return null;
  }

  /* ── Flow / Geometric ─────────────────────────────────────────────────────
     Palette · Shape · Render · Effects
     Shape absorbed the old Structure card — spacing, size and cursor pull are
     all descriptions of the same shape. Grain joined Effects. */
  function geometricCard(card, ctx) {
    const t = ctx.geometricTweaks || {};
    const set = ctx.patchGeometric;
    const setColors = (next) => set({ colors: next.slice(0, 6) });
    const presets = (window.WP && window.WP.PALETTE_PRESETS) || [];
    const comps = window.NURR_GEOMETRIC_COMPOSITIONS || [];
    const randomBackdrop = () => {
      const p = presets.length ? presets[Math.floor(Math.random() * presets.length)] : ['#F2F0E7', '#C9D7DA'];
      const a = p[0] || '#F2F0E7';
      const b = p[Math.min(p.length - 1, 1 + Math.floor(Math.random() * Math.max(1, p.length - 1)))] || '#C9D7DA';
      set({ backdropGradient: true, backdropA: a, backdropB: b });
    };

    if (card === 'palette') return (<>
      <ActionRow>
        <ActionButton icon="shuffle" label="Shuffle" onClick={ctx.onShuffle} primary />
        <ActionButton icon="undo" label="Undo" onClick={ctx.onUndo} disabled={!ctx.canUndo} />
      </ActionRow>
      <PaletteSwatches
        colors={t.colors || []}
        setColors={setColors}
        onEdit={i => ctx.setPicker({ i, module: 'geometric' })}
        maxColors={6} />
      <ActionRow>
        <ActionButton icon="controls" label="Freeflow" onClick={() => set({ freeflowResetToken: Date.now() })} />
        <ActionButton icon="controls" label="Backdrop" onClick={randomBackdrop} />
      </ActionRow>
      {t.backdropGradient && (
        <ActionRow>
          <ActionButton icon="controls" label="Flat backdrop" onClick={() => set({ backdropGradient: false })} />
        </ActionRow>
      )}
      <PresetsCollapsible presets={presets} cols={4} onPick={p => set({ colors: p.slice(0, 3) })} />
    </>);

    if (card === 'shape') return (<>
      <div className="nm-field">
        <div className="nm-field-label">Composition · {(t.compositionIdx ?? 0) + 1}/{comps.length || '—'}</div>
        <div className="nm-num-grid">
          {comps.map((c, i) => (
            <button key={i} type="button"
              className={'nm-num' + (i === t.compositionIdx ? ' is-on' : '')}
              onClick={() => set({ compositionIdx: i, ...(c.suggest || {}) })}>{String(i + 1).padStart(2, '0')}</button>
          ))}
        </div>
      </div>
      <Row label="Shape spacing" value={pct((t.vectorDistance ?? 1) / 1.85)} min="0.45" max="1.85" val={t.vectorDistance ?? 1} on={v => set({ vectorDistance: v })} />
      <Row label="Shape size"    value={(t.vectorScale ?? 1).toFixed(2)}     min="0.30" max="4"    val={t.vectorScale ?? 1}    on={v => set({ vectorScale: v })} />
      <Row label="Cursor pull"   value={pct((t.mousePull ?? 1) / 2)}         min="0"    max="2"    val={t.mousePull ?? 1}      on={v => set({ mousePull: v })} />
    </>);

    if (card === 'render') return (<>
      <Seg label="Material" value={t.material || 'gradient'} on={id => set({ material: id })}
        options={[["gradient", "Gradient"], ["mono", "Mono"], ["thermal", "Thermal"], ["particles", "Particles"]]} />
      <Seg label="Blend" value={t.blendMode || 'normal'} on={id => set({ blendMode: id })}
        options={[["normal", "Normal"], ["screen", "Screen"], ["multiply", "Multiply"], ["silhouette", "Silhouette"]]} />
      <Toggles items={[
        ['B&W', !!t.bw, () => set({ bw: !t.bw })],
        ['Invert', !!t.invert, () => set({ invert: !t.invert })],
      ]} />
      {(t.material || 'gradient') === 'thermal' && <p className="nm-hint">First swatch is flat background. Backdrop overrides it. The rest form the heat scale.</p>}
    </>);

    if (card === 'effects') {
      const material = t.material || 'gradient';
      if (material === 'particles') return (<>
        <Row label="Particle amount" value={(t.particles ?? 0.55).toFixed(2)} min="0.03" max="1.6" val={t.particles ?? 0.55} on={v => set({ particles: v })} />
        <Row label="Dot size" value={(t.particleSize ?? 0.70).toFixed(2)} min="0.35" max="3.2" val={t.particleSize ?? 0.70} on={v => set({ particleSize: v })} />
        <Row label="Looseness" value={pct((t.particleLoose ?? 0.12) / 1.25)} min="0" max="1.25" val={t.particleLoose ?? 0.12} on={v => set({ particleLoose: v })} />
        <Row label="Drift" value={pct(t.flow ?? 0.05)} min="0" max="1" val={t.flow ?? 0.05} on={v => set({ flow: v })} />
        <Row label="Scatter" value={pct(t.ripple ?? 0)} min="0" max="1" val={t.ripple ?? 0} on={v => set({ ripple: v })} />
        <Row label="Blur" value={pct(t.blur ?? 0)} min="0" max="1" val={t.blur ?? 0} on={v => set({ blur: v })} />
        <Row label="Film grain" value={pct(t.grain ?? 0.10)} min="0" max="1" val={t.grain ?? 0.10} on={v => set({ grain: v })} />
      </>);
      return (<>
        <Row label="Flow" value={pct(t.flow ?? 0.05)} min="0" max="1" val={t.flow ?? 0.05} on={v => set({ flow: v })} />
        <Row label={material === 'thermal' ? 'Bands' : 'Ripple'} value={pct(t.ripple ?? 0)} min="0" max="1" val={t.ripple ?? 0} on={v => set({ ripple: v })} />
        <Row label="Glow" value={pct(t.glow ?? 0.85)} min="0" max="1" val={t.glow ?? 0.85} on={v => set({ glow: v })} />
        <Row label="Blur" value={pct(t.blur ?? 0)} min="0" max="1" val={t.blur ?? 0} on={v => set({ blur: v })} />
        {material === 'thermal' && <Row label="Heat steps" value={(t.heatSteps ?? 0) < 2 ? 'smooth' : Math.round(t.heatSteps ?? 0)} min="0" max="12" step="1" val={t.heatSteps ?? 0} on={v => set({ heatSteps: v })} />}
        <Row label="Film grain" value={pct(t.grain ?? 0.10)} min="0" max="1" val={t.grain ?? 0.10} on={v => set({ grain: v })} />
      </>);
    }

    return null;
  }

  /* ── Photo / Nature ──────────────────────────────────────────────────────
     Image · Effect · Tone · Finish */
  function natureCard(card, ctx) {
    const t = ctx.natureTweaks || {};
    const set = ctx.patchNature;
    const strengthKey = t.effect === 'blur' ? 'blur' : t.effect === 'split' ? 'split' : 'warp';
    const fileRef = ctx.fileRef;

    if (card === 'image') return (<>
      <ActionRow>
        <ActionButton icon="undo" label="Undo" onClick={ctx.onUndo} disabled={!ctx.canUndo} />
      </ActionRow>
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
        <Icon name="image" size={16} /> Add photo
      </button>
      <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
        onChange={e => { ctx.onFiles(Array.from(e.target.files)); e.target.value = ''; }} />
    </>);

    if (card === 'effect') return (<>
      <Seg label="Effect" value={t.effect || 'warp'} on={id => set({ effect: id })}
        options={[['warp', 'Warp'], ['blur', 'Blur'], ['split', 'Split'], ['melt', 'Melt'], ['nodes', 'Nodes']]} />
      <Row label="Strength" value={pct(t[strengthKey] ?? 0)} min="0" max="1" val={t[strengthKey] ?? 0} on={v => set({ [strengthKey]: v })}
        hint="Move over the image to steer the effect." />
    </>);

    if (card === 'tone') return (<>
      <Row label="Hue"        value={Math.round((t.hue ?? 0) * 360) + '°'} min="-0.5" max="0.5" val={t.hue ?? 0}     on={v => set({ hue: v })} />
      <Row label="Saturation" value={(t.sat ?? 1).toFixed(2)}              min="0"    max="2.2" val={t.sat ?? 1}     on={v => set({ sat: v })} />
      <Row label="Contrast"   value={(t.contrast ?? 1).toFixed(2)}         min="0.4"  max="1.9" val={t.contrast ?? 1} on={v => set({ contrast: v })} />
    </>);

    if (card === 'finish') return (<>
      <Row label="Grain"    value={pct(t.grain ?? 0)}    min="0" max="1" val={t.grain ?? 0}    on={v => set({ grain: v })} />
      <Row label="Vignette" value={pct(t.vignette ?? 0)} min="0" max="1" val={t.vignette ?? 0} on={v => set({ vignette: v })} />
    </>);

    return null;
  }

  /* ── export sheet ────────────────────────────────────────────────────── */
  const EXPORT_CHOICES = [
    ['wide', 'HD', '1920×1080'],
    ['qhd', '2K', '2560×1440'],
    ['portrait', '4:5', '1600×2000'],
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

  function ExportSheet({ ctx, onClose, sheetRef }) {
    const [choice, setChoice] = useState(null);
    const [img, setImg] = useState(null);
    const [busy, setBusy] = useState(false);

    const generate = (key) => {
      const meta = EXPORT_CHOICES.find(c => c[0] === key);
      setChoice(key); setBusy(true); setImg(null);
      requestAnimationFrame(() => {
        Promise.resolve(ctx.getImage(key)).then((url) => {
          setBusy(false);
          if (!url) return;
          const blob = dataURLtoBlob(url);
          setImg({ url, blobUrl: blob ? URL.createObjectURL(blob) : url, label: meta[1], dims: meta[2] });
        }).catch((err) => {
          console.error('Mobile export failed', err);
          setBusy(false);
        });
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
      <div className="nm-sheet nm-sheet-export" ref={sheetRef}>
        <SheetGrip onClose={onClose} />
        <div className="nm-sheet-head">
          <div>
            <div className="nm-eyebrow">Export</div>
            <div className="nm-sheet-title">Save your artwork</div>
          </div>
          <button type="button" className="nm-x" onClick={onClose} aria-label="Close"><Icon name="close" size={12} /></button>
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

  /* ── sheet grip with drag-to-close ────────────────────────────────────────
     Downward swipe on the grip dismisses the sheet. Follows iOS convention. */
  function SheetGrip({ onClose }) {
    const startY = useRef(0);
    const dragging = useRef(false);
    const gripRef = useRef(null);

    const down = e => {
      dragging.current = true;
      startY.current = e.clientY ?? (e.touches && e.touches[0].clientY) ?? 0;
      try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch (_) { }
    };
    const move = e => {
      if (!dragging.current) return;
      const y = e.clientY ?? (e.touches && e.touches[0].clientY) ?? 0;
      const dy = y - startY.current;
      if (gripRef.current) {
        const sheet = gripRef.current.parentElement;
        if (sheet) sheet.style.transform = dy > 0 ? `translateY(${Math.min(dy, 120)}px)` : '';
      }
    };
    const up = e => {
      if (!dragging.current) return;
      dragging.current = false;
      const y = e.clientY ?? (e.changedTouches && e.changedTouches[0].clientY) ?? 0;
      const dy = y - startY.current;
      if (gripRef.current) {
        const sheet = gripRef.current.parentElement;
        if (sheet) sheet.style.transform = '';
      }
      if (dy > 60) onClose && onClose();
    };

    return (
      <div ref={gripRef} className="nm-sheet-grip"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onClick={() => onClose && onClose()} />
    );
  }

  /* ── controls sheet ──────────────────────────────────────────────────── */
  function ControlsSheet({ ctx, onClose, sheetRef }) {
    const cards = cardsForMode(ctx.mode);
    const [active, setActive] = useState(cards[0][0]);
    useEffect(() => {
      if (!cards.some(c => c[0] === active)) setActive(cards[0][0]);
    }, [ctx.mode]);

    // Picker overlay takes over the body area when a swatch is being edited.
    const picker = ctx.picker;
    const editingColor = picker && (
      picker.module === 'gradient' ? (ctx.gradientTweaks.colors || [])[picker.i] :
        picker.module === 'abstract' ? (ctx.abstractTweaks.colors || [])[picker.i] :
          picker.module === 'geometric' ? (ctx.geometricTweaks.colors || [])[picker.i] :
            null
    );

    const changeColor = (hex) => {
      if (!picker) return;
      if (picker.module === 'gradient') {
        const cs = (ctx.gradientTweaks.colors || []).slice();
        cs[picker.i] = hex;
        const patch = window.NURR_manualGradientPatch
          ? window.NURR_manualGradientPatch(cs, ctx.gradientTweaks)
          : { colors: cs.slice(0, 4), manualPalette: true };
        ctx.patchGradient(patch);
      } else if (picker.module === 'abstract') {
        const cs = (ctx.abstractTweaks.colors || []).slice();
        cs[picker.i] = hex;
        ctx.patchAbstract({ colors: cs.slice(0, 4) });
      } else if (picker.module === 'geometric') {
        const cs = (ctx.geometricTweaks.colors || []).slice();
        cs[picker.i] = hex;
        ctx.patchGeometric({ colors: cs.slice(0, 6) });
      }
    };
    const removeColor = () => {
      if (!picker) return;
      const setterName = picker.module === 'gradient' ? 'patchGradient' : picker.module === 'abstract' ? 'patchAbstract' : 'patchGeometric';
      const tweakName = picker.module === 'gradient' ? 'gradientTweaks' : picker.module === 'abstract' ? 'abstractTweaks' : 'geometricTweaks';
      const cs = (ctx[tweakName].colors || []).slice();
      if (cs.length <= 1) return;
      cs.splice(picker.i, 1);
      if (picker.module === 'gradient') {
        const patch = window.NURR_manualGradientPatch
          ? window.NURR_manualGradientPatch(cs, ctx.gradientTweaks)
          : { colors: cs.slice(0, 4), manualPalette: true };
        ctx.patchGradient(patch);
      } else {
        ctx[setterName]({ colors: cs });
      }
      ctx.setPicker(null);
    };
    const canRemove = picker && (() => {
      const tweakName = picker.module === 'gradient' ? 'gradientTweaks' : picker.module === 'abstract' ? 'abstractTweaks' : 'geometricTweaks';
      return (ctx[tweakName].colors || []).length > 1;
    })();

    return (
      <div className={'nm-sheet nm-sheet-controls' + (picker ? ' has-picker' : '')} ref={sheetRef}>
        <SheetGrip onClose={onClose} />
        {!picker && (
          <div className="nm-cardtabs">
            {cards.map(([id, label]) => (
              <button key={id} type="button"
                className={'nm-cardtab' + (active === id ? ' is-on' : '')}
                onClick={() => setActive(id)}>{label}</button>
            ))}
          </div>
        )}
        <div className="nm-sheet-body nm-card-body" key={ctx.mode + ':' + active + ':' + (picker ? 'p' : 'c')}>
          {picker && editingColor != null ? (
            <PickerOverlay
              hex={editingColor}
              onChange={changeColor}
              onDone={() => ctx.setPicker(null)}
              onRemove={removeColor}
              canRemove={canRemove}
              onBack={() => { pushRecent(editingColor); ctx.setPicker(null); }} />
          ) : (
            renderCard(active, ctx)
          )}
        </div>
      </div>
    );
  }

  /* ── root ──────────────────────────────────────────────────────────────── */
  function MobileUI(props) {
    const [sheet, setSheet] = useState(null); // null | 'controls' | 'export'
    const [picker, setPicker] = useState(null); // {i, module} | null
    const fileRef = useRef(null);
    const sheetRef = useRef(null);

    // Stable visible-viewport height → CSS var.
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

    // Close picker when the sheet closes or when the module changes so we don't
    // ever land in a mismatched palette-index state.
    useEffect(() => { if (!sheet) setPicker(null); }, [sheet]);
    useEffect(() => { setPicker(null); }, [props.mode]);

    const ctx = { ...props, fileRef, picker, setPicker };
    const toggle = (name) => setSheet(s => (s === name ? null : name));
    const closeSheet = () => { setSheet(null); setPicker(null); };

    return (
      <div className="nymph-m" data-mode={props.mode}>
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

        {sheet === 'controls' && <ControlsSheet ctx={ctx} onClose={closeSheet} sheetRef={sheetRef} />}
        {sheet === 'export'   && <ExportSheet   ctx={ctx} onClose={closeSheet} sheetRef={sheetRef} />}

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
