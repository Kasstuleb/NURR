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

  // Correct HSL <-> hex conversions used by the dark/light lightness slider.
  // (HSL is the right model for a "dark ← → light" control: it changes lightness
  // while leaving hue and saturation intact, so a muted colour stays muted.)
  function hexToHsl(hex) {
    const { r, g, b } = hexToRgb(hex);
    const rr = r / 255, gg = g / 255, bb = b / 255;
    const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) * 60;
      else if (max === gg) h = ((bb - rr) / d + 2) * 60;
      else h = ((rr - gg) / d + 4) * 60;
    }
    return { h, s, l };
  }

  function hslToHex(h, s, l) {
    h = ((Number(h) % 360) + 360) % 360;
    s = clamp(s, 0, 1);
    l = clamp(l, 0, 1);
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
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

  const RECENT_KEY = 'nymphRecentColorsUserOnlyV2';

  function uniqueRecentColors(list) {
    const out = [];
    (Array.isArray(list) ? list : []).forEach((x) => {
      const c = normalizeHex(x, '');
      if (c && out.indexOf(c) === -1) out.push(c);
    });
    return out.slice(0, 5);
  }

  function getStoredRecent() {
    try {
      // Intentional clean key with no legacy migration. Older builds saved
      // generated/test colours into Recent, which made the row appear full
      // before the user had chosen anything. This row now starts empty on
      // existing installs and only fills from explicit picker commits.
      return uniqueRecentColors(JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'));
    } catch (_) {}
    return [];
  }

  function storeRecent(list) {
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(uniqueRecentColors(list))); } catch (_) {}
  }



  // NURR gradient-intelligence shuffle.
  // Based on the v10 rating data: deep-shadow, equal-stress, dominant-heavy
  // and mist-heavy structures performed best; flat balanced palettes failed more often.
  function smartRand(min, max) { return min + Math.random() * (max - min); }
  function smartPick(list) { return list[Math.floor(Math.random() * list.length)]; }
  function smartChance(p) { return Math.random() < p; }
  function wrapHue(h) { return ((h % 360) + 360) % 360; }
  function smartHslToHex(h, s, l) {
    if (window.WP && typeof WP.hslToHex === 'function') return WP.hslToHex(wrapHue(h), clamp(s, 0, 1), clamp(l, 0, 1)).toUpperCase();
    // Fallback: close enough for legacy loading order.
    return hsvToHex(wrapHue(h), clamp(s, 0, 1), clamp(l + s * 0.18, 0, 1));
  }
  function smartHexToHsl(hex) {
    if (window.WP && typeof WP.hexToHSL === 'function') {
      const [h, s, l] = WP.hexToHSL(hex);
      return { h, s, l };
    }
    const { r, g, b } = hexToRgb(hex);
    let rr = r / 255, gg = g / 255, bb = b / 255;
    const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) * 60;
      else if (max === gg) h = ((bb - rr) / d + 2) * 60;
      else h = ((rr - gg) / d + 4) * 60;
    }
    return { h, s, l };
  }
  function smartNudgeHex(hex, hueShift, satMul, lightShift) {
    const hsl = smartHexToHsl(hex);
    return smartHslToHex(hsl.h + hueShift, hsl.s * satMul, hsl.l + lightShift);
  }
  function smartPaletteFromPreset(count) {
    const presets = (window.WP && Array.isArray(WP.PALETTE_PRESETS)) ? WP.PALETTE_PRESETS : [];
    if (!presets.length) return null;
    const base = smartPick(presets).map(c => normalizeHex(c, '')).filter(Boolean);
    if (base.length < 2) return null;
    const hsls = base.map(smartHexToHsl).sort((a, b) => a.l - b.l);
    const dark = hsls[0];
    const light = hsls[hsls.length - 1];
    const vivid = hsls.slice().sort((a, b) => b.s - a.s)[0];
    const accentHue = vivid.h + smartPick([120, 150, 180, 210, -120, -150]);
    const built = [
      smartHslToHex(dark.h + smartRand(-8, 8), Math.max(0.45, dark.s * smartRand(0.92, 1.18)), clamp(dark.l + smartRand(-0.04, 0.03), 0.045, 0.24)),
      smartHslToHex(vivid.h + smartRand(-12, 12), clamp(vivid.s * smartRand(0.9, 1.2), 0.52, 0.98), clamp(vivid.l + smartRand(-0.08, 0.06), 0.38, 0.64)),
      smartHslToHex(light.h + smartRand(-10, 10), clamp(light.s * smartRand(0.55, 1.0), 0.18, 0.7), clamp(light.l + smartRand(-0.04, 0.04), 0.72, 0.94)),
      smartHslToHex(accentHue, smartRand(0.55, 0.92), smartRand(0.34, 0.62))
    ];
    return built.slice(0, count);
  }
  function buildSmartNurrPalette(count) {
    count = Math.max(2, Math.min(4, Number(count || 3)));
    if (smartChance(0.22)) {
      const preset = smartPaletteFromPreset(count);
      if (preset) return preset;
    }

    const formula = smartPick([
      'deep-shadow','deep-shadow','deep-shadow','deep-shadow',
      'equal-stress','equal-stress','equal-stress',
      'dominant-heavy','dominant-heavy','dominant-heavy',
      'mist-heavy','mist-heavy',
      'accent-pin'
    ]);
    const base = smartRand(0, 360);
    const scheme = smartPick([
      [0, 24, 178, 312],
      [0, -28, 145, 205],
      [0, 42, 184, 252],
      [0, 68, 156, 292],
      [0, -46, 112, 188],
      [0, 18, 214, 336]
    ]).map(x => base + x + smartRand(-8, 8));

    let colors;
    if (formula === 'deep-shadow') {
      colors = [
        smartHslToHex(scheme[0], smartRand(0.58, 0.92), smartRand(0.055, 0.16)),
        smartHslToHex(scheme[1], smartRand(0.62, 0.96), smartRand(0.42, 0.58)),
        smartHslToHex(scheme[2], smartRand(0.22, 0.62), smartRand(0.74, 0.92)),
        smartHslToHex(scheme[3], smartRand(0.55, 0.92), smartRand(0.28, 0.48))
      ];
    } else if (formula === 'equal-stress') {
      colors = [
        smartHslToHex(scheme[0], smartRand(0.68, 0.98), smartRand(0.09, 0.20)),
        smartHslToHex(scheme[1], smartRand(0.70, 0.98), smartRand(0.42, 0.58)),
        smartHslToHex(scheme[2], smartRand(0.34, 0.76), smartRand(0.68, 0.86)),
        smartHslToHex(scheme[3], smartRand(0.62, 0.96), smartRand(0.46, 0.66))
      ];
    } else if (formula === 'mist-heavy') {
      colors = [
        smartHslToHex(scheme[2], smartRand(0.18, 0.54), smartRand(0.80, 0.95)),
        smartHslToHex(scheme[0], smartRand(0.56, 0.9), smartRand(0.36, 0.54)),
        smartHslToHex(scheme[1], smartRand(0.48, 0.88), smartRand(0.08, 0.18)),
        smartHslToHex(scheme[3], smartRand(0.36, 0.78), smartRand(0.62, 0.80))
      ];
    } else if (formula === 'accent-pin') {
      colors = [
        smartHslToHex(scheme[0], smartRand(0.28, 0.62), smartRand(0.12, 0.24)),
        smartHslToHex(scheme[1], smartRand(0.22, 0.56), smartRand(0.72, 0.90)),
        smartHslToHex(scheme[2], smartRand(0.70, 1.0), smartRand(0.44, 0.62)),
        smartHslToHex(scheme[3], smartRand(0.82, 1.0), smartRand(0.48, 0.64))
      ];
    } else {
      colors = [
        smartHslToHex(scheme[0], smartRand(0.52, 0.88), smartRand(0.18, 0.34)),
        smartHslToHex(scheme[1], smartRand(0.48, 0.82), smartRand(0.50, 0.66)),
        smartHslToHex(scheme[2], smartRand(0.20, 0.60), smartRand(0.74, 0.92)),
        smartHslToHex(scheme[3], smartRand(0.64, 0.96), smartRand(0.38, 0.56))
      ];
    }

    // Safety guard learned from the tests: avoid too-equal / too-flat palettes.
    const hsls = colors.map(smartHexToHsl);
    const minL = Math.min(...hsls.map(c => c.l));
    const maxL = Math.max(...hsls.map(c => c.l));
    if (maxL - minL < 0.42) {
      colors[0] = smartNudgeHex(colors[0], 0, 1.05, -0.18);
      colors[2] = smartNudgeHex(colors[2], 0, 0.82, 0.16);
    }

    // For 2–3 colour modes, keep the essential dark / colour / light hierarchy.
    if (count === 2) return [colors[0], colors[2]];
    if (count === 3) return [colors[0], colors[1], colors[2]];
    return colors.slice(0, count);
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
        // A transparent pixel is stored as (0,0,0,0). Reading it as an opaque
        // colour would hand back pure black, so treat anything effectively
        // transparent as "no colour here" instead of sampling a false #000000.
        if (px[3] < 8) return null;
        return rgbToHex({ r: px[0], g: px[1], b: px[2] });
      }
    } catch (_) {}
    try {
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const px = new Uint8Array(4);
        gl.readPixels(x, Math.max(0, Math.min(canvas.height - 1, canvas.height - 1 - yTop)), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        if (px[3] < 8) return null;
        return rgbToHex({ r: px[0], g: px[1], b: px[2] });
      }
    } catch (_) {}
    return null;
  }

  function NurrPaletteEditor({ colors, swatchColors = null, setColors, countLabel, allowAdd = true, minColors = 2, maxColors = 4, compact = false, extraActions = null }) {
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
    const lightBaseRef = useRef(null);
    // Remembered HSL hue+saturation of the last colour that actually had chroma.
    // Driving lightness to pure white or black erases hue/saturation from the hex
    // itself, so without this the colour could never be brought back — it would
    // return as grey (or, once hue defaulted to 0, as red).
    const toneRef = useRef(null);
    const rememberTone = (hex) => {
      const hsl = hexToHsl(normalizeHex(hex, '#000000'));
      if (hsl.s > 0.001 && hsl.l > 0.001 && hsl.l < 0.999) toneRef.current = { h: hsl.h, s: hsl.s };
    };
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
    // Recent colours are finished colours only.
    // Do not fill this row with the active colour or the whole palette while the user is still editing.
    const visibleRecentColors = (recentColors || [])
      .map(c => normalizeHex(c, ''))
      .filter(Boolean)
      .filter((c, i, a) => a.indexOf(c) === i)
      .slice(0, 5);

    const svBackground = useMemo(() => {
      const hueHex = hsvToHex(activeHsv.h, 1, 1);
      return `linear-gradient(to bottom, rgba(255,255,255,0), #000), linear-gradient(to right, #fff, ${hueHex})`;
    }, [activeHsv.h]);

    const pushRecent = (hex) => {
      const clean = normalizeHex(hex, '');
      if (!clean) return;
      const base = getStoredRecent();
      const next = uniqueRecentColors([clean, ...base.filter(c => c !== clean)]);
      setRecentColors(next);
      storeRecent(next);
    };

    const updateColor = (hex, commit = true) => {
      const current = pickerRef.current;
      if (!current) return;
      const clean = normalizeHex(hex, current.color || '#000000');
      // White and black carry no hue, so hexToHsv() reports h = 0 (red) for them.
      // Taking that at face value throws away the colour's identity: the SV field
      // would flip to red the moment lightness was driven to either end, and the
      // next edit would produce red instead of the colour the user was working on.
      // Keep the previous hue (and saturation, once value collapses) whenever the
      // new colour is achromatic — the swatch is still a true white/black, but the
      // picker remembers what it was made from.
      const raw = hexToHsv(clean);
      const prev = current.hsv;
      const achromatic = raw.s <= 0.001 || raw.v <= 0.001;
      const hsv = (prev && achromatic)
        ? { h: prev.h, s: raw.v <= 0.001 ? prev.s : raw.s, v: raw.v }
        : raw;
      rememberTone(clean);
      const nextPicker = { ...current, color: clean, hsv, dirty: current.dirty || clean !== normalizeHex(current.openedColor || '', '') };
      pickerRef.current = nextPicker;
      setPicker(nextPicker);
      if (commit) {
        const next = [...colorsRef.current];
        next[current.idx] = clean;
        setColors(next);
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
      rememberTone(color);
      const nextPicker = { ...current, hsv, color, dirty: current.dirty || color !== normalizeHex(current.openedColor || '', '') };
      pickerRef.current = nextPicker;
      setPicker(nextPicker);
      if (commit) {
        const next = [...colorsRef.current];
        next[current.idx] = color;
        setColors(next);
      }
      setHexDraft(null); setRgbDraft(null); setCmykDraft(null);
    };

    const commitPicker = () => {
      const current = pickerRef.current;
      if (!current) return;
      const clean = normalizeHex(current.color, '');
      const opened = normalizeHex(current.openedColor || '', '');
      // Only finished picker sessions become Recent colours. This prevents every
      // hue/SV/lightness click from creating a new recent swatch. A colour is
      // considered finished when the picker closes or a different palette swatch
      // is opened, and only if it actually changed.
      if (current.dirty && clean && clean !== opened) pushRecent(clean);
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
      // Do not pollute Recent with auto-generated colours.
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
      const targetCount = Math.max(Number(minColors || 2), Math.min(Number(maxColors || 4), Number(colorsRef.current.length || colors.length || 3)));
      const generated = buildSmartNurrPalette(targetCount);
      setPicker(null);
      setColors(generated);
      // Do not pollute Recent with randomised palettes.
    };

    const openPicker = (i, e) => {
      e.preventDefault();
      e.stopPropagation();
      if (dragMoved) return;

      if (picker && picker.idx === i) {
        commitPicker();
        setPicker(null);
        setDrop(d => ({ ...d, visible: false }));
        return;
      }

      if (pickerRef.current && pickerRef.current.idx !== i) {
        commitPicker();
      }

      const rect = e.currentTarget.getBoundingClientRect();
      const cardW = 318;
      const cardH = 510;
      const gap = 16;
      let left = rect.left - cardW - gap;
      if (left < 16) left = rect.right + gap;
      if (left + cardW > window.innerWidth - 16) left = window.innerWidth - cardW - 16;
      left = Math.max(16, left);
      let top = rect.top - 210;
      if (top + cardH > window.innerHeight - 16) top = window.innerHeight - cardH - 16;
      top = Math.max(16, top);
      setPickerPos({ left, top });

      // Open the colour the interface is actually showing.
      // If a module passes display swatches, this bakes the visible/rendered colour
      // into the next manual edit instead of exposing hidden raw formula colours.
      const color = normalizeHex((swatchColors && swatchColors[i]) || colors[i], '#000000');
      setHexDraft(null); setRgbDraft(null); setCmykDraft(null);
      setRecentColors(getStoredRecent());
      setPickerMinimized(false);
      setPicker({ idx: i, color, hsv: hexToHsv(color), openedColor: color, dirty: false });
      setDrop({ visible: false, x: e.clientX, y: e.clientY, color });
    };

    const beginControlDrag = (kind, e) => {
      if (!pickerRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      activeDragRef.current = kind;
      // Freeze the hue + saturation at the start of a lightness drag so the whole
      // gesture only slides lightness. Re-reading the colour each move would let it
      // desaturate to grey once it passes through pure black/white.
      if (kind === 'light') {
        const hsl = hexToHsl(pickerRef.current.color);
        // If the colour is currently pure white/black it has no hue of its own to
        // read, so fall back to the remembered tone. Otherwise starting a drag from
        // white would slide through greys instead of back into the user's colour.
        const chromatic = hsl.s > 0.001 && hsl.l > 0.001 && hsl.l < 0.999;
        lightBaseRef.current = chromatic
          ? { h: hsl.h, s: hsl.s }
          : (toneRef.current || { h: hsl.h, s: hsl.s });
      }
      document.body.classList.add('is-picking-color');
      moveControlDrag(e);
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    };

    const pointInCircle = (e, rect) => {
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const rx = (e.clientX - cx) / (rect.width / 2);
      const ry = (e.clientY - cy) / (rect.height / 2);
      const len = Math.sqrt(rx * rx + ry * ry);
      if (len <= 1) return { x: e.clientX, y: e.clientY, rx, ry, len };
      // Project to the visible circle edge so the control never selects a colour
      // from the invisible square corners behind the circular mask.
      return {
        x: cx + (rx / len) * (rect.width / 2),
        y: cy + (ry / len) * (rect.height / 2),
        rx: rx / len,
        ry: ry / len,
        len: 1
      };
    };

    const moveControlDrag = (e) => {
      const kind = activeDragRef.current;
      if (!kind || !pickerRef.current) return;
      const card = cardRef.current;
      const target = card ? card.querySelector(kind === 'hue' ? '.nurr-hue-wheel' : kind === 'sv' ? '.nurr-sv-disc' : '.nurr-lightness-line') : null;
      if (!target) return;

      const rect = target.getBoundingClientRect();

      // The lightness control is a 1-D slider. Dragging past either end must clamp
      // to the track (the universal slider behaviour) and never fall through to the
      // page eyedropper — otherwise "maxing out" the slider grabs a stray colour
      // (often #000000 over a transparent part of the backdrop) instead of the
      // brightest/darkest version of the current colour.
      if (kind === 'light') {
        const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
        // Dark ← → light on a true HSL lightness axis. Hue and saturation are
        // taken from the baseline captured at drag start, so a muted colour keeps
        // its character instead of snapping to a fully-saturated bright version.
        const base = lightBaseRef.current || hexToHsl(pickerRef.current.color);
        updateColor(hslToHex(base.h, base.s, x), true);
        setDrop(d => ({ ...d, visible: false }));
        return;
      }

      // Hue ring + SV disc keep the "drag out onto the artwork to eyedrop" gesture:
      // leaving the card while dragging one of the wheel controls samples the page.
      const inCard = card ? card.contains(document.elementFromPoint(e.clientX, e.clientY)) : true;
      if (!inCard) {
        const sampled = samplePageAt(e.clientX, e.clientY);
        if (sampled) updateColor(sampled, true);
        setDrop({ visible: true, x: e.clientX, y: e.clientY, color: sampled || pickerRef.current?.color || activeColor });
        return;
      }

      if (kind === 'hue') {
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const angle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
        const prev = pickerRef.current?.hsv || {s:1, v:1};
        // The hue ring is now an honest hue selector: choosing yellow on the ring
        // produces a clear yellow swatch instead of preserving a muddy/greenish
        // saturation-value state from the previous colour. Fine tone edits still
        // happen in the inner SV field and the lightness line.
        updateHsv({
          h: (angle + 360) % 360,
          s: 1.0,
          v: 1.0
        });
      }

      if (kind === 'sv') {
        const pt = pointInCircle(e, rect);
        const x = clamp((pt.x - rect.left) / rect.width, 0, 1);
        const y = clamp((pt.y - rect.top) / rect.height, 0, 1);
        updateHsv({ s: x, v: 1 - y });
      }

      setDrop(d => ({ ...d, visible: false }));
    };

    const endControlDrag = () => {
      if (!activeDragRef.current) return;
      activeDragRef.current = null;
      lightBaseRef.current = null;
      document.body.classList.remove('is-picking-color');
      setDrop(d => ({ ...d, visible: false }));
      // Recent colours are committed only when the picker session is closed or
      // when the user switches to another swatch. Drag/click gestures inside
      // the wheel should update the active swatch, not spam Recent.
    };

    useEffect(() => {
      const onMove = (e) => { moveControlDrag(e); movePanelDrag(e); };
      const onUp = () => { endControlDrag(); endPanelDrag(); };
      const onKey = (e) => {
        if (e.key === 'Escape') {
          commitPicker();
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
        // Closing the picker by clicking the artwork should not sample the canvas
        // or create a Recent colour. Recent is only for explicit user colour choices
        // made inside the picker or typed into the value fields.
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
            if (parsed) { updateColor(parsed, true); }
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
              if (parsed) { updateColor(parsed, true); }
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
    const hueThumb = { left: `${50 + Math.cos(hueAngle * Math.PI / 180) * 39.5}%`, top: `${50 + Math.sin(hueAngle * Math.PI / 180) * 39.5}%` };
    const svX = activeHsv.s;
    const svY = 1 - activeHsv.v;
    // The visible SV control is circular. Clamp the thumb to that circle so it
    // cannot appear/select from the hidden square corners.
    const svDx = svX - 0.5;
    const svDy = svY - 0.5;
    const svLen = Math.sqrt(svDx * svDx + svDy * svDy);
    const svClamped = svLen > 0.5 ? { x: 0.5 + svDx / svLen * 0.5, y: 0.5 + svDy / svLen * 0.5 } : { x: svX, y: svY };
    const svThumb = { left: `${svClamped.x * 100}%`, top: `${svClamped.y * 100}%` };
    // Thumb sits at the colour's actual HSL lightness (0 = black, .5 = pure hue, 1 = white).
    const lightThumb = { '--light-pos': clamp(hexToHsl(activeColor).l, 0, 1) };

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
                  style={{ background: normalizeHex((swatchColors && swatchColors[i]) || c) }}
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
            {extraActions}
          </div>
        </div>

        {picker && ReactDOM.createPortal((
          <>
            <div
              ref={cardRef}
              className={'color-wheel-card nurr-picker-portal nurr-wheel-v2' + (pickerMinimized ? ' is-minimized' : '')}
              style={{ '--picker-left': pickerPos.left + 'px', '--picker-top': pickerPos.top + 'px', '--active-color': activeColor, '--active-hue': hsvToHex(activeHsv.h, 1, 1), '--sv-bg': svBackground }}
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

                <div className="nurr-sv-disc" onPointerDown={(e) => beginControlDrag('sv', e)}>
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
                    const c = visibleRecentColors[i];
                    return c ? (
                      <button key={`${c}-${i}`} type="button" className="nurr-recent-chip" style={{ '--recent-color': c, backgroundColor: c }} title={c} onClick={(e) => { e.preventDefault(); e.stopPropagation(); updateColor(c, true); const cur = pickerRef.current; if (cur) { pickerRef.current = { ...cur, openedColor: c }; setPicker(pickerRef.current); } }} />
                    ) : (
                      <button key={`empty-${i}`} type="button" className="nurr-recent-chip is-empty" title="Empty recent colour" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} />
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
