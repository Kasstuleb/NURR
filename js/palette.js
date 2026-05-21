// palette.js — NurrPaletteEditor
// Shared NURR colour picker: hue ring + saturation/value disc + lightness arch + editable values + recent colours.
// Exposes: window.NurrPaletteEditor

(function () {
  const { useEffect, useMemo, useRef, useState } = React;

  const clamp = (v, min, max) => Math.max(min, Math.min(max, Number(v)));

  function normalizeHex(value, fallback = '#000000') {
    if (value == null) return fallback;
    let h = String(value).trim();
    if (!h) return fallback;
    if (h[0] !== '#') h = '#' + h;
    if (/^#[0-9a-fA-F]{3}$/.test(h)) {
      h = '#' + h.slice(1).split('').map(c => c + c).join('');
    }
    return /^#[0-9a-fA-F]{6}$/.test(h) ? h.toUpperCase() : fallback;
  }

  function hexToRgb(hex) {
    const c = normalizeHex(hex).slice(1);
    return {
      r: parseInt(c.slice(0, 2), 16),
      g: parseInt(c.slice(2, 4), 16),
      b: parseInt(c.slice(4, 6), 16)
    };
  }

  function rgbToHex({ r, g, b }) {
    return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  function hexToHsv(hex) {
    const { r, g, b } = hexToRgb(hex);
    const rr = r / 255, gg = g / 255, bb = b / 255;
    const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
      if (max === rr) h = 60 * (((gg - bb) / d) % 6);
      else if (max === gg) h = 60 * (((bb - rr) / d) + 2);
      else h = 60 * (((rr - gg) / d) + 4);
    }
    if (h < 0) h += 360;
    return { h, s: max === 0 ? 0 : d / max, v: max };
  }

  function hsvToHex(h, s, v) {
    h = ((Number(h) % 360) + 360) % 360;
    s = clamp(s, 0, 1);
    v = clamp(v, 0, 1);
    const c = v * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return rgbToHex({ r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 });
  }

  function rgbToCmyk({ r, g, b }) {
    const rr = r / 255, gg = g / 255, bb = b / 255;
    const k = 1 - Math.max(rr, gg, bb);
    if (k >= 0.999) return { c: 0, m: 0, y: 0, k: 100 };
    return {
      c: Math.round(((1 - rr - k) / (1 - k)) * 100),
      m: Math.round(((1 - gg - k) / (1 - k)) * 100),
      y: Math.round(((1 - bb - k) / (1 - k)) * 100),
      k: Math.round(k * 100)
    };
  }

  function cmykToHex(c, m, y, k) {
    return rgbToHex({
      r: 255 * (1 - c / 100) * (1 - k / 100),
      g: 255 * (1 - m / 100) * (1 - k / 100),
      b: 255 * (1 - y / 100) * (1 - k / 100)
    });
  }

  function parseHex(value) {
    const clean = normalizeHex(value, '');
    return clean || null;
  }

  function parseRgb(value) {
    const nums = String(value || '').match(/\d+(?:\.\d+)?/g);
    if (!nums || nums.length < 3) return null;
    const [r, g, b] = nums.map(Number);
    if ([r, g, b].some(v => v < 0 || v > 255)) return null;
    return rgbToHex({ r, g, b });
  }

  function parseCmyk(value) {
    const nums = String(value || '').match(/\d+(?:\.\d+)?/g);
    if (!nums || nums.length < 4) return null;
    const [c, m, y, k] = nums.map(Number);
    if ([c, m, y, k].some(v => v < 0 || v > 100)) return null;
    return cmykToHex(c, m, y, k);
  }

  function getStoredRecent() {
    try {
      const raw = JSON.parse(localStorage.getItem('nurrRecentColors') || '[]');
      return raw.map(x => normalizeHex(x, '')).filter(Boolean).slice(0, 5);
    } catch (_) {
      return [];
    }
  }

  function storeRecent(list) {
    try { localStorage.setItem('nurrRecentColors', JSON.stringify(list.slice(0, 5))); } catch (_) {}
  }

  function sampleCanvasAt(clientX, clientY, canvas) {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
    const x = Math.max(0, Math.min(canvas.width - 1, Math.floor((clientX - rect.left) / rect.width * canvas.width)));
    const yTop = Math.max(0, Math.min(canvas.height - 1, Math.floor((clientY - rect.top) / rect.height * canvas.height)));
    try {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        const px = ctx.getImageData(x, yTop, 1, 1).data;
        return rgbToHex({ r: px[0], g: px[1], b: px[2] });
      }
    } catch (_) {}
    try {
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const px = new Uint8Array(4);
        gl.readPixels(x, Math.max(0, Math.min(canvas.height - 1, canvas.height - 1 - yTop)), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return rgbToHex({ r: px[0], g: px[1], b: px[2] });
      }
    } catch (_) {}
    return null;
  }

  function NurrPaletteEditor({ colors, setColors, countLabel, allowAdd = true, minColors = 2, maxColors = 4, compact = false }) {
    const [picker, setPicker] = useState(null);
    const [pickerPos, setPickerPos] = useState({ left: 24, top: 24 });
    const [pickerMinimized, setPickerMinimized] = useState(false);
    const [draggingIdx, setDraggingIdx] = useState(null);
    const [dragMoved, setDragMoved] = useState(false);
    const [recentColors, setRecentColors] = useState(getStoredRecent);
    const [hexDraft, setHexDraft] = useState(null);
    const [rgbDraft, setRgbDraft] = useState(null);
    const [cmykDraft, setCmykDraft] = useState(null);
    const [drop, setDrop] = useState({ visible: false, x: -100, y: -100, color: '#000000' });

    const cardRef = useRef(null);
    const pickerRef = useRef(null);
    const dragIndexRef = useRef(null);
    const activeDragRef = useRef(null);
    const panelDragRef = useRef(null);
    const colorsRef = useRef(colors);
    const inputFocusRef = useRef(false);
    colorsRef.current = colors;
    pickerRef.current = picker;

    const activeColor = normalizeHex(picker?.color || colors[picker?.idx || 0] || '#000000');
    const activeHsv = picker ? picker.hsv : hexToHsv(activeColor);
    const rgbObj = hexToRgb(activeColor);
    const cmykObj = rgbToCmyk(rgbObj);
    const rgbDisplay = rgbDraft != null ? rgbDraft : `${rgbObj.r}, ${rgbObj.g}, ${rgbObj.b}`;
    const cmykDisplay = cmykDraft != null ? cmykDraft : `${cmykObj.c}, ${cmykObj.m}, ${cmykObj.y}, ${cmykObj.k}`;
    const hexDisplay = hexDraft != null ? hexDraft : activeColor;

    const svBackground = useMemo(() => {
      const hueHex = hsvToHex(activeHsv.h, 1, 1);
      return `linear-gradient(to bottom, rgba(255,255,255,0), #000), linear-gradient(to right, #fff, ${hueHex})`;
    }, [activeHsv.h]);

    const pushRecent = (hex) => {
      const clean = normalizeHex(hex, '');
      if (!clean) return;
      const base = getStoredRecent();
      const next = [clean, ...base.filter(c => c !== clean)].slice(0, 5);
      setRecentColors(next);
      storeRecent(next);
    };

    const updateColor = (hex, commit = true) => {
      const current = pickerRef.current;
      if (!current) return;
      const clean = normalizeHex(hex, current.color || '#000000');
      const hsv = hexToHsv(clean);
      setPicker({ ...current, color: clean, hsv });
      if (commit) {
        const next = [...colorsRef.current];
        next[current.idx] = clean;
        setColors(next);
        pushRecent(clean);
      }
      setHexDraft(null); setRgbDraft(null); setCmykDraft(null);
    };

    const updateHsv = (patch, commit = true) => {
      const current = pickerRef.current;
      if (!current) return;
      const hsv = {
        h: patch.h != null ? ((patch.h % 360) + 360) % 360 : current.hsv.h,
        s: patch.s != null ? clamp(patch.s, 0, 1) : current.hsv.s,
        v: patch.v != null ? clamp(patch.v, 0, 1) : current.hsv.v
      };
      const color = hsvToHex(hsv.h, hsv.s, hsv.v);
      setPicker({ ...current, hsv, color });
      if (commit) {
        const next = [...colorsRef.current];
        next[current.idx] = color;
        setColors(next);
        pushRecent(color);
      }
      setHexDraft(null); setRgbDraft(null); setCmykDraft(null);
    };

    const commitPicker = () => {
      const current = pickerRef.current;
      if (!current) return;
      pushRecent(current.color);
    };

    const samplePageAt = (clientX, clientY) => {
      const hidden = cardRef.current;
      const previousPointer = hidden ? hidden.style.pointerEvents : '';
      if (hidden) hidden.style.pointerEvents = 'none';
      let el = null;
      try { el = document.elementFromPoint(clientX, clientY); } catch (_) {}
      if (hidden) hidden.style.pointerEvents = previousPointer;

      const canvas = el && el.closest && el.closest('canvas.stage, canvas');
      const sampledCanvas = canvas ? sampleCanvasAt(clientX, clientY, canvas) : null;
      if (sampledCanvas) return sampledCanvas;

      let node = el;
      while (node && node !== document.body && node !== document.documentElement) {
        try {
          const st = window.getComputedStyle(node);
          const bg = st.backgroundColor;
          const m = bg && bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
          if (m && (m[4] == null || Number(m[4]) > 0.05)) {
            return rgbToHex({ r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) });
          }
        } catch (_) {}
        node = node.parentElement;
      }
      return null;
    };

    const beginPanelDrag = (e) => {
      if (e.target.closest && e.target.closest('button,input,.nurr-picker-core,.nurr-lightness-line,.nurr-recent-chip')) return;
      e.preventDefault();
      panelDragRef.current = { x: e.clientX, y: e.clientY, left: pickerPos.left, top: pickerPos.top };
      document.body.classList.add('nurr-no-select');
    };

    const movePanelDrag = (e) => {
      const d = panelDragRef.current;
      if (!d) return;
      const card = cardRef.current;
      const w = card ? card.offsetWidth : 292;
      const h = card ? card.offsetHeight : 420;
      const left = clamp(d.left + e.clientX - d.x, 10, Math.max(10, window.innerWidth - w - 10));
      const top = clamp(d.top + e.clientY - d.y, 10, Math.max(10, window.innerHeight - h - 10));
      setPickerPos({ left, top });
    };

    const endPanelDrag = () => {
      if (!panelDragRef.current) return;
      panelDragRef.current = null;
      document.body.classList.remove('nurr-no-select');
    };

    const addColor = () => {
      if (!allowAdd || colors.length >= maxColors) return;
      const random = (window.WP && WP.hslToHex) ? WP.hslToHex(Math.random() * 360, 0.72, 0.56) : hsvToHex(Math.random() * 360, .72, .82);
      setColors([...colors, random]);
      pushRecent(random);
    };

    const removeColor = (i) => {
      const minimum = Math.max(1, Number(minColors || 1));
      if (!allowAdd || colorsRef.current.length <= minimum) return;
      setPicker(null);
      setColors(colorsRef.current.filter((_, idx) => idx !== i));
    };

    const reorderColor = (from, to) => {
      const list = [...colorsRef.current];
      if (from == null || to == null || from === to || !list[from] || !list[to]) return;
      const [picked] = list.splice(from, 1);
      list.splice(to, 0, picked);
      setPicker(null);
      setColors(list);
    };

    const randomize = () => {
      const presets = (window.WP && WP.PALETTE_PRESETS) ? WP.PALETTE_PRESETS : [];
      if (!presets.length) return;
      const p = presets[Math.floor(Math.random() * presets.length)];
      setPicker(null);
      setColors(p.slice(0, Math.max(minColors, Math.min(maxColors, colors.length))));
    };

    const openPicker = (i, e) => {
      e.preventDefault();
      e.stopPropagation();
      if (dragMoved) return;

      if (picker && picker.idx === i) {
        commitPicker();
        commitPicker();
        setPicker(null);
        setDrop(d => ({ ...d, visible: false }));
        return;
      }

      const rect = e.currentTarget.getBoundingClientRect();
      const cardW = 248;
      const cardH = 365;
      const gap = 16;
      let left = rect.left - cardW - gap;
      if (left < 16) left = rect.right + gap;
      if (left + cardW > window.innerWidth - 16) left = window.innerWidth - cardW - 16;
      left = Math.max(16, left);
      let top = rect.top - 210;
      if (top + cardH > window.innerHeight - 16) top = window.innerHeight - cardH - 16;
      top = Math.max(16, top);
      setPickerPos({ left, top });

      const color = normalizeHex(colors[i], '#000000');
      setHexDraft(null); setRgbDraft(null); setCmykDraft(null);
      setRecentColors(getStoredRecent());
      setPickerMinimized(false);
      setPicker({ idx: i, color, hsv: hexToHsv(color) });
      setDrop({ visible: false, x: e.clientX, y: e.clientY, color });
    };

    const beginControlDrag = (kind, e) => {
      if (!pickerRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      activeDragRef.current = kind;
      document.body.classList.add('is-picking-color');
      moveControlDrag(e);
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    };

    const moveControlDrag = (e) => {
      const kind = activeDragRef.current;
      if (!kind || !pickerRef.current) return;
      const card = cardRef.current;
      const target = card ? card.querySelector(kind === 'hue' ? '.nurr-hue-wheel' : kind === 'sv' ? '.nurr-sv-disc' : '.nurr-lightness-line') : null;
      if (!target) return;
      const inCard = card ? card.contains(document.elementFromPoint(e.clientX, e.clientY)) : true;

      if (!inCard) {
        const sampled = samplePageAt(e.clientX, e.clientY);
        if (sampled) updateColor(sampled, true);
        setDrop({ visible: true, x: e.clientX, y: e.clientY, color: sampled || pickerRef.current?.color || activeColor });
        return;
      }

      const rect = target.getBoundingClientRect();

      if (kind === 'hue') {
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const angle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
        updateHsv({ h: (angle + 360) % 360 });
      }

      if (kind === 'sv') {
        const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
        const y = clamp((e.clientY - rect.top) / rect.height, 0, 1);
        updateHsv({ s: x, v: 1 - y });
      }

      if (kind === 'light') {
        const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
        updateHsv({ v: x });
      }

      setDrop(d => ({ ...d, visible: false }));
    };

    const endControlDrag = () => {
      if (!activeDragRef.current) return;
      activeDragRef.current = null;
      document.body.classList.remove('is-picking-color');
      setDrop(d => ({ ...d, visible: false }));
      commitPicker();
    };

    useEffect(() => {
      const onMove = (e) => { moveControlDrag(e); movePanelDrag(e); };
      const onUp = () => { endControlDrag(); endPanelDrag(); };
      const onKey = (e) => {
        if (e.key === 'Escape') {
          setPicker(null);
          setDrop(d => ({ ...d, visible: false }));
        }
      };
      const onPointerDown = (e) => {
        if (!pickerRef.current || inputFocusRef.current) return;
        const card = cardRef.current;
        if (card && card.contains(e.target)) return;
        const swatch = e.target.closest && e.target.closest('.swatch, .swatch-wrap, .swatch-remove');
        if (swatch) return;
        const canvas = e.target.closest && e.target.closest('canvas.stage');
        if (canvas) {
          const sampled = sampleCanvasAt(e.clientX, e.clientY, canvas);
          if (sampled) {
            updateColor(sampled, true);
            pushRecent(sampled);
          }
        }
        commitPicker();
        setPicker(null);
        setDrop(d => ({ ...d, visible: false }));
      };
      document.addEventListener('pointermove', onMove, true);
      document.addEventListener('pointerup', onUp, true);
      document.addEventListener('keydown', onKey, true);
      document.addEventListener('pointerdown', onPointerDown, true);
      return () => {
        document.removeEventListener('pointermove', onMove, true);
        document.removeEventListener('pointerup', onUp, true);
        document.removeEventListener('keydown', onKey, true);
        document.removeEventListener('pointerdown', onPointerDown, true);
      };
    }, []);

    useEffect(() => {
      return () => document.body.classList.remove('is-picking-color');
    }, []);

    const inputRow = (label, value, setter, parser) => (
      <div className="nurr-value-row" key={label}>
        <span>{label}</span>
        <input
          type="text"
          className="color-input"
          value={value}
          spellCheck={false}
          autoComplete="off"
          onFocus={() => { inputFocusRef.current = true; setDrop(d => ({ ...d, visible: false })); }}
          onBlur={(e) => {
            const parsed = parser(e.target.value);
            if (parsed) { updateColor(parsed, true); pushRecent(parsed); }
            setter(null);
            inputFocusRef.current = false;
          }}
          onChange={(e) => setter(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              const parsed = parser(e.target.value);
              if (parsed) { updateColor(parsed, true); pushRecent(parsed); }
              setter(null);
              e.target.blur();
            }
            if (e.key === 'Escape') {
              setter(null);
              inputFocusRef.current = false;
              e.target.blur();
            }
          }}
        />
      </div>
    );

    const hueAngle = activeHsv.h;
    const hueThumb = { left: `${50 + Math.cos(hueAngle * Math.PI / 180) * 42}%`, top: `${50 + Math.sin(hueAngle * Math.PI / 180) * 42}%` };
    const svThumb = { left: `${activeHsv.s * 100}%`, top: `${(1 - activeHsv.v) * 100}%` };
    const lightThumb = { left: `${activeHsv.v * 100}%` };

    return (
      <>
        <div className="section palette-section">
          <div className="section-label">
            <span className="name">Palette</span>
            <span className="value">{countLabel || `${colors.length} of ${maxColors}`}</span>
          </div>

          <div className="swatches">
            {colors.map((c, i) => (
              <div
                key={i}
                className={'swatch-wrap' + (draggingIdx === i ? ' dragging' : '')}
                draggable={colors.length > 1}
                onDragStart={(e) => {
                  dragIndexRef.current = i;
                  setDraggingIdx(i);
                  setDragMoved(true);
                  document.body.classList.add('nurr-no-select');
                  try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); } catch (_) {}
                }}
                onDragOver={(e) => { e.preventDefault(); try { e.dataTransfer.dropEffect = 'move'; } catch (_) {} }}
                onDrop={(e) => { e.preventDefault(); reorderColor(dragIndexRef.current, i); }}
                onDragEnd={() => {
                  dragIndexRef.current = null;
                  setDraggingIdx(null);
                  document.body.classList.remove('nurr-no-select');
                  setTimeout(() => setDragMoved(false), 0);
                }}
              >
                <button
                  type="button"
                  className={'swatch remove-target' + (picker?.idx === i ? ' active' : '')}
                  style={{ background: normalizeHex(c) }}
                  onClick={(e) => openPicker(i, e)}
                  onContextMenu={(e) => { e.preventDefault(); removeColor(i); }}
                  title="Click to pick · drag to reorder"
                />
                {allowAdd && colors.length > Math.max(1, Number(minColors || 1)) && (
                  <button type="button" className="swatch-remove" title="Remove color" onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeColor(i); }}>×</button>
                )}
              </div>
            ))}
            {allowAdd && colors.length < maxColors && <button type="button" className="swatch add" onClick={addColor} title="Add color">+</button>}
          </div>

          <div className="btn-row compact-row">
            <button className="btn btn-italic" onClick={randomize}>{compact ? 'Shuffle' : 'Shuffle palette'}</button>
          </div>
        </div>

        {picker && ReactDOM.createPortal((
          <>
            <div
              ref={cardRef}
              className={'color-wheel-card nurr-picker-portal nurr-wheel-v2' + (pickerMinimized ? ' is-minimized' : '')}
              style={{ '--picker-left': pickerPos.left + 'px', '--picker-top': pickerPos.top + 'px', '--active-color': activeColor, '--active-hue': hsvToHex(activeHsv.h, 1, 1) }}
              onPointerMove={moveControlDrag}
              onPointerUp={endControlDrag}
            >
              <div className="nurr-picker-title-row" onPointerDown={beginPanelDrag}>
                <span>Colour</span>
                <div className="nurr-picker-actions">
                  <button type="button" className="nurr-picker-min" title={pickerMinimized ? 'Restore' : 'Minimize'} onClick={(e) => { e.stopPropagation(); setPickerMinimized(v => !v); }}>−</button>
                  <button type="button" className="nurr-picker-close" onClick={(e) => { e.stopPropagation(); commitPicker(); setPicker(null); }}>×</button>
                </div>
              </div>

              {pickerMinimized ? (
                <button type="button" className="nurr-picker-mini-chip" style={{ background: activeColor }} onClick={() => setPickerMinimized(false)} title="Restore colour picker" />
              ) : (<>
              <div className="nurr-picker-core">
                <div className="nurr-hue-wheel" onPointerDown={(e) => beginControlDrag('hue', e)}>
                  <div className="nurr-hue-cutout" />
                  <div className="nurr-hue-thumb" style={hueThumb} />
                </div>

                <div className="nurr-sv-disc" style={{ background: svBackground }} onPointerDown={(e) => beginControlDrag('sv', e)}>
                  <div className="nurr-sv-thumb" style={svThumb} />
                </div>
              </div>

              <div className="nurr-lightness-line" onPointerDown={(e) => beginControlDrag('light', e)}>
                <div className="nurr-lightness-track" />
                <div className="nurr-lightness-thumb" style={lightThumb} />
              </div>

              <div className="nurr-value-block">
                <div className="nurr-active-chip" style={{ background: activeColor }} />
                <div className="nurr-values">
                  {inputRow('HEX', hexDisplay, setHexDraft, parseHex)}
                  {inputRow('RGB', rgbDisplay, setRgbDraft, parseRgb)}
                  {inputRow('CMYK', cmykDisplay, setCmykDraft, parseCmyk)}
                </div>
              </div>

              <div className="nurr-recent-block">
                <div className="nurr-recent-label">Recent</div>
                <div className="nurr-recent-list">
                  {Array.from({ length: 5 }).map((_, i) => {
                    const c = recentColors[i];
                    return c ? (
                      <button key={`${c}-${i}`} type="button" className="nurr-recent-chip" style={{ background: c }} title={c} onClick={(e) => { e.preventDefault(); e.stopPropagation(); updateColor(c, true); pushRecent(c); }} />
                    ) : (
                      <span key={`empty-${i}`} className="nurr-recent-chip is-empty" />
                    );
                  })}
                </div>
              </div>
              </>)}
            </div>

            <div className={'eyedropper-follow' + (drop.visible ? '' : ' is-hidden')} style={{ left: drop.x, top: drop.y }} aria-hidden="true">
              <div className="eyedropper-color" style={{ background: drop.color }} />
            </div>
          </>
        ), document.body)}
      </>
    );
  }

  window.NurrPaletteEditor = NurrPaletteEditor;
}());
