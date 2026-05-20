// palette.js — NurrPaletteEditor: swatches + clean scoped color sampler + editable HEX/RGB/CMYK.
// Exposes: window.NurrPaletteEditor
//
// Clean picker model:
// - Native cursor is never replaced.
// - Droplet is only a passive preview overlay.
// - Sampling happens only on .color-wheel-surface and canvas.stage.
// - Menu panel, inputs, buttons and swatches keep normal UI behavior.

(function () {
  const pUseEffect = React.useEffect;
  const pUseRef    = React.useRef;
  const pUseState  = React.useState;

  function NurrPaletteEditor({ colors, setColors, countLabel, allowAdd=true, minColors=2, maxColors=4, compact=false }) {
    const [picker, setPicker] = pUseState(null);
    const [pickerPos, setPickerPos] = pUseState({ left: 0, top: 0 });
    const [draggingIdx, setDraggingIdx] = pUseState(null);
    const [dragMoved, setDragMoved] = pUseState(false);
    const [livePos, setLivePos] = pUseState({ x:-100, y:-100 });
    const [liveColor, setLiveColor] = pUseState('#08015F');
    const [dropVisible, setDropVisibleState] = pUseState(false);

    const [hexDraft, setHexDraft] = pUseState(null);
    const [rgbDraft, setRgbDraft] = pUseState(null);
    const [cmykDraft, setCmykDraft] = pUseState(null);

    const pickerRef = pUseRef(null);
    const wheelRef = pUseRef(null);
    const colorsRef = pUseRef(colors);
    const rafRef = pUseRef(null);
    const liveRef = pUseRef({ x:-100, y:-100, color:'#08015F' });
    const inputFocusRef = pUseRef(false);
    const dropVisibleRef = pUseRef(false);
    const dragIndexRef = pUseRef(null);

    colorsRef.current = colors;

    // ── Basic color helpers ────────────────────────────────────────────────
    const normalizeHex = (value, fallback='#000000') => {
      if (value == null) return fallback;
      let h = String(value).trim();
      if (!h) return fallback;
      if (h[0] !== '#') h = '#' + h;
      if (/^#[0-9a-fA-F]{3}$/.test(h)) {
        h = '#' + h.slice(1).split('').map(c => c + c).join('');
      }
      return /^#[0-9a-fA-F]{6}$/.test(h) ? h.toUpperCase() : fallback;
    };

    const setDropletVisible = (next) => {
      if (dropVisibleRef.current === next) return;
      dropVisibleRef.current = next;
      setDropVisibleState(next);
    };

    const setColor = (i, hex) => {
      const next = [...colorsRef.current];
      next[i] = normalizeHex(hex, next[i] || '#000000');
      setColors(next);
    };

    const addColor = () => {
      if (!allowAdd || colors.length >= maxColors) return;
      setColors([...colors, WP.hslToHex(Math.random() * 360, 0.72, 0.56)]);
    };

    const removeColor = (i) => {
      const minimum = Math.max(1, Number(minColors || 1));
      if (!allowAdd || colorsRef.current.length <= minimum) return;
      const next = colorsRef.current.filter((_, idx) => idx !== i);
      setPicker(null);
      pickerRef.current = null;
      setDropletVisible(false);
      setColors(next);
    };

    const reorderColor = (from, to) => {
      const list = [...colorsRef.current];
      if (from == null || to == null || from === to || !list[from] || !list[to]) return;
      const [picked] = list.splice(from, 1);
      list.splice(to, 0, picked);
      setPicker(null);
      pickerRef.current = null;
      setDropletVisible(false);
      setColors(list);
    };

    const randomize = () => {
      const p = WP.PALETTE_PRESETS[Math.floor(Math.random() * WP.PALETTE_PRESETS.length)];
      setColors(p.slice(0, Math.max(minColors, Math.min(maxColors, colors.length))));
    };

    const hexToRgbObj = (hex) => {
      const c = normalizeHex(hex).replace('#', '');
      return {
        r: parseInt(c.slice(0, 2), 16),
        g: parseInt(c.slice(2, 4), 16),
        b: parseInt(c.slice(4, 6), 16)
      };
    };

    const rgbObjToHex = ({ r, g, b }) => '#' + [r, g, b]
      .map(v => Math.round(Math.max(0, Math.min(255, Number(v) || 0))).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();

    const rgbToCmyk = ({ r, g, b }) => {
      const rr = r / 255;
      const gg = g / 255;
      const bb = b / 255;
      const k = 1 - Math.max(rr, gg, bb);
      if (k >= 0.999) return { c:0, m:0, y:0, k:100 };
      return {
        c: Math.round(((1 - rr - k) / (1 - k)) * 100),
        m: Math.round(((1 - gg - k) / (1 - k)) * 100),
        y: Math.round(((1 - bb - k) / (1 - k)) * 100),
        k: Math.round(k * 100)
      };
    };

    const cmykToHex = (c, m, y, k) => {
      return rgbObjToHex({
        r: 255 * (1 - c / 100) * (1 - k / 100),
        g: 255 * (1 - m / 100) * (1 - k / 100),
        b: 255 * (1 - y / 100) * (1 - k / 100)
      });
    };

    const parseHex = (s) => {
      const v = normalizeHex(s, '');
      return v || null;
    };

    const parseRgb = (s) => {
      const nums = String(s || '').match(/\d+/g);
      if (!nums || nums.length < 3) return null;
      const [r, g, b] = nums.map(Number);
      if ([r, g, b].some(v => v < 0 || v > 255)) return null;
      return rgbObjToHex({ r, g, b });
    };

    const parseCmyk = (s) => {
      const nums = String(s || '').match(/\d+(\.\d+)?/g);
      if (!nums || nums.length < 4) return null;
      const [c, m, y, k] = nums.map(Number);
      if ([c, m, y, k].some(v => v < 0 || v > 100)) return null;
      return cmykToHex(c, m, y, k);
    };

    const activeColor = normalizeHex(liveColor || picker?.color || colors[picker?.idx || 0] || '#08015F');
    const rgbObj = hexToRgbObj(activeColor);
    const cmykObj = rgbToCmyk(rgbObj);

    const hexDisplay = hexDraft != null ? hexDraft : activeColor;
    const rgbDisplay = rgbDraft != null ? rgbDraft : `${rgbObj.r}, ${rgbObj.g}, ${rgbObj.b}`;
    const cmykDisplay = cmykDraft != null ? cmykDraft : `${cmykObj.c}, ${cmykObj.m}, ${cmykObj.y}, ${cmykObj.k}`;

    const applyParsed = (hex) => {
      if (!hex || !pickerRef.current) return;
      const clean = normalizeHex(hex, pickerRef.current.color || '#000000');
      liveRef.current = { ...liveRef.current, color: clean };
      setLiveColor(clean);
      setPicker(p => p ? { ...p, color: clean } : p);
      pickerRef.current = { ...pickerRef.current, color: clean };
    };

    const commitParsed = (hex) => {
      if (!hex || !pickerRef.current) return;
      applyParsed(hex);
      setColor(pickerRef.current.idx, hex);
    };

    // ── Sampling zones ─────────────────────────────────────────────────────
    const getPickerZone = (clientX, clientY) => {
      const el = document.elementFromPoint(clientX, clientY);
      if (!el || !el.closest) return null;

      const wheel = el.closest('.color-wheel-surface');
      if (wheel) return { type:'wheel', el: wheel };

      const canvas = el.closest('canvas.stage');
      if (canvas) return { type:'canvas', el: canvas };

      return null;
    };

    const colorFromWheelPoint = (clientX, clientY, wheelEl) => {
      const target = wheelEl || wheelRef.current;
      if (!target) return pickerRef.current?.color || '#000000';
      const rect = target.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      // Broad picker: horizontal = full hue, vertical = light to dark.
      // Kept in HSL so the visual white/black overlay and sampled value agree closely.
      const hue = x * 360;
      // Broad shade picker: full hue horizontally, bright/pale at top, saturated mids, near-black at bottom.
      const light = Math.max(0.025, Math.min(0.96, 0.94 - y * 0.90));
      const sat = Math.max(0.12, Math.min(1, 0.96 - Math.max(0, 0.18 - y) * 1.65));
      return WP.hslToHex(hue, sat, light);
    };

    const sampleCanvasAt = (clientX, clientY, canvas) => {
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;

      const x = Math.max(0, Math.min(canvas.width - 1, Math.floor((clientX - rect.left) / rect.width * canvas.width)));
      const yTop = Math.max(0, Math.min(canvas.height - 1, Math.floor((clientY - rect.top) / rect.height * canvas.height)));

      try {
        const ctx = canvas.getContext('2d', { willReadFrequently:true });
        if (ctx) {
          const px = ctx.getImageData(x, yTop, 1, 1).data;
          return '#' + [px[0], px[1], px[2]].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
        }
      } catch (e) {}

      try {
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl) {
          const px = new Uint8Array(4);
          gl.readPixels(x, Math.max(0, Math.min(canvas.height - 1, canvas.height - 1 - yTop)), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          return '#' + [px[0], px[1], px[2]].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
        }
      } catch (e) {}

      return null;
    };

    const sampleZone = (zone, x, y) => {
      if (!zone) return null;
      if (zone.type === 'wheel') return colorFromWheelPoint(x, y, zone.el);
      if (zone.type === 'canvas') return sampleCanvasAt(x, y, zone.el);
      return null;
    };

    pUseEffect(() => { pickerRef.current = picker; }, [picker]);

    // ── Low-lag picker controller ─────────────────────────────────────────
    pUseEffect(() => {
      if (!picker) return;
      document.body.classList.add('is-picking-color');

      let lastCanvasSample = 0;
      const CANVAS_SAMPLE_MS = 140; // WebGL readPixels is expensive; throttle hard.

      const updateDropletDom = (x, y, color) => {
        const clean = normalizeHex(color, liveRef.current.color || pickerRef.current?.color || '#000000');
        liveRef.current = { x, y, color: clean };

        if (rafRef.current) return;
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          const state = liveRef.current;

          // Position/color are updated directly on the overlay DOM to avoid React
          // re-rendering the whole picker on every pointer move.
          const drop = document.querySelector('.eyedropper-follow');
          const chip = document.querySelector('.eyedropper-color');
          if (drop) {
            drop.style.left = state.x + 'px';
            drop.style.top = state.y + 'px';
          }
          if (chip) chip.style.background = normalizeHex(state.color, '#000000');
        });
      };

      const showDroplet = () => setDropletVisible(true);
      const hideDroplet = () => setDropletVisible(false);

      const previewAt = (e) => {
        if (inputFocusRef.current) {
          hideDroplet();
          return;
        }

        const zone = getPickerZone(e.clientX, e.clientY);
        if (!zone) {
          hideDroplet();
          return;
        }

        // Wheel preview is cheap and should feel immediate.
        if (zone.type === 'wheel') {
          const color = colorFromWheelPoint(e.clientX, e.clientY, zone.el);
          showDroplet();
          updateDropletDom(e.clientX, e.clientY, color);
          return;
        }

        // Canvas/WebGL readback is the lag source. Throttle preview sampling.
        // Click still samples accurately and immediately in applyAt().
        if (zone.type === 'canvas') {
          const now = performance.now();
          let color = liveRef.current.color || pickerRef.current?.color || '#000000';
          if (now - lastCanvasSample > CANVAS_SAMPLE_MS) {
            const sampled = sampleCanvasAt(e.clientX, e.clientY, zone.el);
            if (sampled) {
              color = sampled;
              lastCanvasSample = now;
            }
          }
          showDroplet();
          updateDropletDom(e.clientX, e.clientY, color);
        }
      };

      const applyAt = (e) => {
        const current = pickerRef.current;
        if (!current || inputFocusRef.current) return;

        const zone = getPickerZone(e.clientX, e.clientY);
        if (!zone) {
          hideDroplet();
          return;
        }

        const sampled = sampleZone(zone, e.clientX, e.clientY);
        if (!sampled) {
          hideDroplet();
          return;
        }

        const picked = normalizeHex(sampled, current.color);
        setColor(current.idx, picked);
        setLiveColor(picked);
        setLivePos({ x:e.clientX, y:e.clientY });
        setHexDraft(null);
        setRgbDraft(null);
        setCmykDraft(null);
        hideDroplet();
        setPicker(null);
        pickerRef.current = null;
        e.preventDefault();
        e.stopPropagation();
      };

      const closeOnEscape = (e) => {
        if (e.key !== 'Escape') return;
        hideDroplet();
        setPicker(null);
        pickerRef.current = null;
      };

      document.addEventListener('pointermove', previewAt, { capture:true, passive:true });
      document.addEventListener('pointerdown', applyAt, true);
      document.addEventListener('keydown', closeOnEscape, true);

      return () => {
        document.body.classList.remove('is-picking-color');
        document.removeEventListener('pointermove', previewAt, true);
        document.removeEventListener('pointerdown', applyAt, true);
        document.removeEventListener('keydown', closeOnEscape, true);
        hideDroplet();
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    }, [!!picker]); // eslint-disable-line react-hooks/exhaustive-deps

    const openPicker = (i, e) => {
      e.preventDefault();
      e.stopPropagation();
      if (dragMoved) return;

      const trigger = e.currentTarget;
      const rect = trigger && trigger.getBoundingClientRect ? trigger.getBoundingClientRect() : { left:e.clientX, right:e.clientX, top:e.clientY };
      const cardW = 318;
      const cardH = 286;
      const gap = 14;
      let left = rect.left - cardW - gap;
      if (left < 12) left = rect.right + gap;
      left = Math.max(12, Math.min(window.innerWidth - cardW - 12, left));
      let top = rect.top - 20;
      top = Math.max(12, Math.min(window.innerHeight - cardH - 12, top));
      setPickerPos({ left, top });

      if (picker && picker.idx === i) {
        setDropletVisible(false);
        setPicker(null);
        pickerRef.current = null;
        return;
      }

      const color = normalizeHex(colors[i], '#000000');
      liveRef.current = { x:e.clientX, y:e.clientY, color };
      setLivePos({ x:e.clientX, y:e.clientY });
      setLiveColor(color);
      setHexDraft(null);
      setRgbDraft(null);
      setCmykDraft(null);
      setDropletVisible(true);

      const next = { idx:i, color };
      pickerRef.current = next;
      setPicker(next);
    };

    const previewWheelInline = (e) => {
      if (!pickerRef.current || inputFocusRef.current) return;
      const color = colorFromWheelPoint(e.clientX, e.clientY, e.currentTarget);
      liveRef.current = { x:e.clientX, y:e.clientY, color };
      setLiveColor(color);
      setLivePos({ x:e.clientX, y:e.clientY });
      setDropletVisible(true);
    };

    const inputRow = (label, value, setter, parser) => (
      <div key={label}>
        <span>{label}</span>
        <input
          type="text"
          className="color-input"
          value={value}
          spellCheck={false}
          autoComplete="off"
          onFocus={() => {
            inputFocusRef.current = true;
            setDropletVisible(false);
          }}
          onBlur={(e) => {
            const parsed = parser(e.target.value);
            if (parsed) commitParsed(parsed);
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
              if (parsed) commitParsed(parsed);
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
                onDrop={(e) => {
                  e.preventDefault();
                  const from = dragIndexRef.current != null ? dragIndexRef.current : Number(e.dataTransfer.getData('text/plain'));
                  reorderColor(from, i);
                }}
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
                  style={{ background:c }}
                  onClick={(e) => openPicker(i, e)}
                  onContextMenu={(e) => { e.preventDefault(); removeColor(i); }}
                  title="Click to pick · drag to reorder"
                />
                {allowAdd && colors.length > Math.max(1, Number(minColors || 1)) && (
                  <button
                    type="button"
                    className="swatch-remove"
                    title="Remove color"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeColor(i); }}
                  >×</button>
                )}
              </div>
            ))}
            {allowAdd && colors.length < maxColors && (
              <button type="button" className="swatch add" onClick={addColor} title="Add color">+</button>
            )}
          </div>

          <div className="btn-row compact-row">
            <button className="btn btn-italic" onClick={randomize}>{compact ? 'Shuffle' : 'Shuffle palette'}</button>
          </div>
        </div>

        {picker && ReactDOM.createPortal((
          <>
            <div
              className="color-wheel-card nurr-picker-portal"
              style={{ '--picker-left': pickerPos.left + 'px', '--picker-top': pickerPos.top + 'px' }}
            >
              <div
                ref={wheelRef}
                className="color-wheel-surface"
                onPointerMove={previewWheelInline}
                onPointerEnter={previewWheelInline}
                onPointerLeave={() => setDropletVisible(false)}
                title="Move over the spectrum or artwork, then click to select"
              />

              <div className="color-readout">
                {inputRow('HEX', hexDisplay, setHexDraft, parseHex)}
                {inputRow('RGB', rgbDisplay, setRgbDraft, parseRgb)}
                {inputRow('CMYK', cmykDisplay, setCmykDraft, parseCmyk)}
              </div>

              <div className="color-readout-hint">Wheel / artwork picks color · fields accept typed values</div>
            </div>

            <div
              className={'eyedropper-follow' + (dropVisible ? '' : ' is-hidden')}
              style={{ left:livePos.x, top:livePos.y }}
              aria-hidden="true"
            >
              <div className="eyedropper-color" style={{ background:activeColor }} />
              <svg viewBox="0 0 64 64" aria-hidden="true">
                <path fill="currentColor" d="M44.7 6.6a7 7 0 0 1 9.9 9.9l-7.1 7.1 4.2 4.2-6.4 6.4-4.2-4.2-20 20c-1.1 1.1-2.5 1.8-4 2.1L6.8 54.4l2.3-10.3c.3-1.5 1-2.9 2.1-4l20-20-4.2-4.2 6.4-6.4 4.2 4.2 7.1-7.1Z"/>
              </svg>
            </div>
          </>
        ), document.body)}
      </>
    );
  }

  window.NurrPaletteEditor = NurrPaletteEditor;
}());
