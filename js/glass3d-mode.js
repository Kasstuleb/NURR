// glass3d-mode.js — NURR 3D Objects module v10.
// Click to freeze · drag to reposition · B&W gradient · HiDPI canvas.

(function () {
  'use strict';

  const SHAPE_DEFAULTS = {
    sphere:  { scale: 1.05, translucency: 0.72, depth: 1.05, edge: 0.22, surface: 0.18, light: 0.76, motion: 0.28, rotation: 0.12, grain: 0.055 },
    cube:    { scale: 1.00, translucency: 0.65, depth: 1.20, edge: 0.00, surface: 0.10, light: 0.00, motion: 0.22, rotation: 0.18, grain: 0.055 },
    soap:    { scale: 1.08, translucency: 0.80, depth: 0.65, edge: 0.16, surface: 0.32, light: 0.70, motion: 0.32, rotation: 0.10, grain: 0.060 },
    pebble:  { scale: 1.12, translucency: 0.68, depth: 0.90, edge: 0.32, surface: 0.38, light: 0.74, motion: 0.26, rotation: 0.12, grain: 0.055 },
    tablet:  { scale: 1.00, translucency: 0.70, depth: 0.50, edge: 0.12, surface: 0.08, light: 0.80, motion: 0.18, rotation: 0.14, grain: 0.050 },
    capsule: { scale: 1.05, translucency: 0.75, depth: 1.05, edge: 0.18, surface: 0.14, light: 0.76, motion: 0.28, rotation: 0.20, grain: 0.055 },
    torus:   { scale: 1.00, translucency: 0.78, depth: 0.85, edge: 0.28, surface: 0.22, light: 0.78, motion: 0.35, rotation: 0.24, grain: 0.060 },
  };

  const MATERIAL_PRESETS = {
    glass:   [
      { id: 'clear',    label: 'Clear',    main: '#cce8ff', accent: '#f0f8ff' },
      { id: 'smoke',    label: 'Smoke',    main: '#b8c8d4', accent: '#dce8f0' },
      { id: 'blush',    label: 'Blush',    main: '#ffd4e8', accent: '#ffecf6' },
      { id: 'sage',     label: 'Sage',     main: '#c8e0d8', accent: '#eaf5f0' },
    ],
    opal:    [
      { id: 'pearl',    label: 'Pearl',    main: '#f5efea', accent: '#dfc8f8' },
      { id: 'aurora',   label: 'Aurora',   main: '#e8d4f8', accent: '#d4f8e8' },
      { id: 'blush',    label: 'Blush',    main: '#ffd8e8', accent: '#d8f0ff' },
      { id: 'cream',    label: 'Cream',    main: '#f8f0e0', accent: '#e0f0f8' },
    ],
    water:   [
      { id: 'aqua',     label: 'Aqua',     main: '#88d8e8', accent: '#d8f5ff' },
      { id: 'deep',     label: 'Deep',     main: '#0b6074', accent: '#1a9ab0' },
      { id: 'lagoon',   label: 'Lagoon',   main: '#4cc8d8', accent: '#d8f8ff' },
      { id: 'reef',     label: 'Reef',     main: '#28a878', accent: '#a8f0d8' },
    ],
    metal:   [
      { id: 'silver',   label: 'Silver',   main: '#d2d2ce', accent: '#f0f0ee' },
      { id: 'gold',     label: 'Gold',     main: '#d8aa50', accent: '#f0d898' },
      { id: 'rose',     label: 'Rose',     main: '#c89880', accent: '#f0c8b4' },
      { id: 'black',    label: 'Black',    main: '#282830', accent: '#484858' },
    ],
    holo:    [
      { id: 'fire',     label: 'Fire',     main: '#ff6030', accent: '#ffcc00' },
      { id: 'spectrum', label: 'Spectrum', main: '#ff80e0', accent: '#80c8ff' },
      { id: 'ice',      label: 'Ice',      main: '#80d8ff', accent: '#e0b8ff' },
      { id: 'toxic',    label: 'Toxic',    main: '#80ff80', accent: '#ff80c0' },
    ],
    crystal: [
      { id: 'ice',      label: 'Ice',      main: '#e8f5ff', accent: '#ffffff' },
      { id: 'violet',   label: 'Violet',   main: '#d0b8ff', accent: '#f0e8ff' },
      { id: 'rose',     label: 'Rose',     main: '#ffc8e0', accent: '#fff0f8' },
      { id: 'citrine',  label: 'Citrine',  main: '#ffe0a0', accent: '#fff8e8' },
    ],
  };

  const GLASS3D_DEFAULTS = {
    // First view: sharp dark metal cube — edge 0 = sharp corners
    object: 'cube', material: 'metal',
    colorPreset: 'black', mainColor: '#282830', accentColor: '#484858', customHue: '',
    bgMode: 'gradient', bgColor: '#f4f3ef', bgSeed: 0.42,
    // Cube shape defaults: edge=0 (sharp), highlights at 0
    scale: 1.00, translucency: 0.65, depth: 1.20, edge: 0.00,
    surface: 0.10, light: 0.00, motion: 0.22, rotation: 0.18, grain: 0.055,
  };

  const validHex = (v) => /^#[0-9a-f]{6}$/i.test(v);

  // ── Canvas component ─────────────────────────────────────────────────────
  function Glass3DMode({ tweaks, registerSnapshot, mouseRef }) {
    const canvasRef   = React.useRef(null);
    const frameRef    = React.useRef(null);
    const tweaksRef   = React.useRef(tweaks);
    const seedRef     = React.useRef(tweaks.seed || Math.random());
    tweaksRef.current = tweaks;

    // Interaction state: freeze/drag
    const interRef = React.useRef({
      state:    'free',   // 'free' | 'frozen' | 'dragging'
      objX:     0.5,
      objY:     0.5,
      ptrDown:  false,
      ptrDownTime: 0,
      ptrStartX:   0,
      ptrStartY:   0,
      ptrHasMoved: false,
    });

    const draw = React.useCallback((cssW, cssH, time, noHiDPI) => {
      const canvas = canvasRef.current; if (!canvas) return;
      let physW, physH;
      if (noHiDPI) { physW = cssW; physH = cssH; }
      else {
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        physW = Math.round(cssW * dpr); physH = Math.round(cssH * dpr);
      }
      if (canvas.width !== physW || canvas.height !== physH) {
        canvas.width = physW; canvas.height = physH;
      }
      canvas.style.width  = cssW + 'px';
      canvas.style.height = cssH + 'px';

      const t    = tweaksRef.current;
      const inter = interRef.current;
      const mouse = mouseRef?.current || { x: 0.5, y: 0.5 };

      const isFrozen   = inter.state === 'frozen';
      const isDragging = inter.state === 'dragging';

      const ok = window.NurrGlass3DRenderer && window.NurrGlass3DRenderer.renderToCanvas(canvas, {
        ...t,
        time: time != null ? time : performance.now() * 0.001,
        mouse,
        seed: seedRef.current,
        targetPosX: isFrozen || isDragging ? inter.objX : null,
        targetPosY: isFrozen || isDragging ? inter.objY : null,
        frozen:     isFrozen,
        fastLerp:   isDragging,
      });

      if (!ok) {
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = (t && t.bgColor) || '#f4f3ef';
        ctx.fillRect(0, 0, physW, physH);
        ctx.fillStyle = '#111';
        ctx.font = '18px Helvetica, Arial, sans-serif';
        ctx.fillText('3D Objects v10 needs Three.js / WebGL.', 48, 64);
      }
    }, [mouseRef]);

    React.useEffect(() => {
      let alive = true;
      const loop = () => {
        if (!alive) return;
        draw(window.innerWidth, window.innerHeight, performance.now() * 0.001);
        frameRef.current = requestAnimationFrame(loop);
      };
      loop();
      const resize = () => draw(window.innerWidth, window.innerHeight, performance.now() * 0.001);
      window.addEventListener('resize', resize);
      return () => {
        alive = false;
        cancelAnimationFrame(frameRef.current);
        window.removeEventListener('resize', resize);
      };
    }, [draw]);

    React.useEffect(() => {
      registerSnapshot((opts = {}) => {
        const canvas = canvasRef.current; if (!canvas) return null;
        const w = opts.width || 3840;
        const h = opts.height || 2160;
        const ow = canvas.width, oh = canvas.height;
        const osw = canvas.style.width, osh = canvas.style.height;
        draw(w, h, performance.now() * 0.001, true);
        const dataUrl = canvas.toDataURL('image/png');
        if (!opts.returnDataUrl) WP.downloadCanvas(canvas, opts.filename || ('nurr-3d-object-' + w + 'x' + h + '-' + Date.now() + '.png'));
        const restore = () => {
          canvas.width = ow; canvas.height = oh;
          canvas.style.width = osw; canvas.style.height = osh;
          const dpr = window.devicePixelRatio || 1;
          draw(ow / dpr, oh / dpr, performance.now() * 0.001);
        };
        if (opts.returnDataUrl) restore(); else requestAnimationFrame(restore);
        return dataUrl;
      });
    }, [draw, registerSnapshot]);

    // ── Pointer handlers ──────────────────────────────────────────────────
    const onPointerDown = React.useCallback((e) => {
      const inter  = interRef.current;
      const canvas = canvasRef.current; if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const nx = (e.clientX - rect.left)  / rect.width;
      const ny = (e.clientY - rect.top)   / rect.height;

      inter.ptrDown     = true;
      inter.ptrDownTime = Date.now();
      inter.ptrStartX   = e.clientX;
      inter.ptrStartY   = e.clientY;
      inter.ptrHasMoved = false;
      inter.ptrNX = nx; inter.ptrNY = ny;

      // Grab mouse pointer for reliable tracking during drag
      try { canvas.setPointerCapture(e.pointerId); } catch(err) {}

      // Reseed surface on every new click
      seedRef.current = Math.random();
    }, []);

    const onPointerMove = React.useCallback((e) => {
      const inter  = interRef.current;
      const canvas = canvasRef.current; if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const nx = (e.clientX - rect.left)  / rect.width;
      const ny = (e.clientY - rect.top)   / rect.height;
      inter.ptrNX = nx; inter.ptrNY = ny;

      if (!inter.ptrDown) return;
      const dx = e.clientX - inter.ptrStartX, dy = e.clientY - inter.ptrStartY;
      if (!inter.ptrHasMoved && Math.hypot(dx, dy) > 7) {
        inter.ptrHasMoved = true;
        inter.state = 'dragging';
      }
      if (inter.state === 'dragging') {
        inter.objX = Math.max(0, Math.min(1, nx));
        inter.objY = Math.max(0, Math.min(1, ny));
      }
    }, []);

    const onPointerUp = React.useCallback(() => {
      const inter   = interRef.current;
      const elapsed = Date.now() - inter.ptrDownTime;

      if (!inter.ptrHasMoved && elapsed < 300) {
        // Short click: toggle free ↔ frozen
        if (inter.state === 'free') {
          inter.state = 'frozen';
          inter.objX  = inter.ptrNX != null ? inter.ptrNX : 0.5;
          inter.objY  = inter.ptrNY != null ? inter.ptrNY : 0.5;
        } else if (inter.state === 'frozen') {
          inter.state = 'free';
        }
        // If dragging with no movement, stay frozen (shouldn't normally reach here)
      } else if (inter.state === 'dragging') {
        // End drag → freeze at dropped position (allow soft float)
        inter.state = 'frozen';
      }
      inter.ptrDown = false;
    }, []);

    return React.createElement('canvas', {
      ref:           canvasRef,
      className:     'stage',
      onPointerDown: onPointerDown,
      onPointerMove: onPointerMove,
      onPointerUp:   onPointerUp,
    });
  }

  // ── Icon components ───────────────────────────────────────────────────────
  function GlassIcon({ type }) {
    return React.createElement('span', { className: 'glass3d-shape-icon shape-' + type, 'aria-hidden': 'true' },
      React.createElement('i', null));
  }
  function MaterialChip({ id }) {
    return React.createElement('span', { className: 'glass3d-material-chip material-' + id, 'aria-hidden': 'true' });
  }

  // ── Controls component ────────────────────────────────────────────────────
  function Glass3DControls({ tweaks, setTweaks }) {
    const shapes = [
      ['sphere','Sphere'],['cube','Cube'],['soap','Soap'],
      ['pebble','Pebble'],['tablet','Tablet'],['capsule','Capsule'],['torus','Donut'],
    ];
    const materials = [
      ['glass','Clear glass'],['opal','Opal'],['water','Water'],
      ['metal','Metal'],['holo','Holographic'],['crystal','Crystal'],
    ];
    const bgOptions = [
      ['gradient','Gradient'],['bw','B&W'],['light','Light grey'],
      ['white','White'],['black','Black'],['custom','Custom'],
    ];
    const sliderDefs = [
      ['scale',        'Size',         0.45, 1.85],
      ['translucency', 'Translucency', 0,    1   ],
      ['depth',        'Thickness',    0.25, 2.40],
      ['edge',         'Edge',         0,    1   ],
      ['surface',      'Surface',      0,    1   ],
      ['light',        'Highlights',   0,    1   ],
      ['motion',       'Motion',       0,    1   ],
      ['rotation',     'Rotation',     0,    1   ],
      ['grain',        'Grain',        0,    1   ],
    ];

    const material    = tweaks.material    || 'glass';
    const bgMode      = tweaks.bgMode      || 'gradient';
    const colorPreset = tweaks.colorPreset || '';
    const mainColor   = validHex(tweaks.mainColor)   ? tweaks.mainColor   : '#cce8ff';
    const accentColor = validHex(tweaks.accentColor) ? tweaks.accentColor : '#f0f8ff';
    const customHue   = validHex(tweaks.customHue)   ? tweaks.customHue   : '';
    const safeBg      = validHex(tweaks.bgColor || '') ? tweaks.bgColor   : '#f4f3ef';

    const shapeLabel    = (shapes.find(o => o[0] === tweaks.object)   || shapes[0])[1];
    const materialLabel = (materials.find(m => m[0] === material)     || materials[0])[1];
    const presets       = MATERIAL_PRESETS[material] || MATERIAL_PRESETS.glass;

    const switchShape = (id) => setTweaks({ object: id, ...(SHAPE_DEFAULTS[id] || SHAPE_DEFAULTS.sphere) });

    const switchMaterial = (next) => {
      const first = (MATERIAL_PRESETS[next] || MATERIAL_PRESETS.glass)[0];
      setTweaks({ material: next, colorPreset: first.id, mainColor: first.main, accentColor: first.accent, customHue: '' });
    };
    const applyPreset = (p) => setTweaks({ colorPreset: p.id, mainColor: p.main, accentColor: p.accent, customHue: '' });

    const regenerateGradient = () => setTweaks({ bgMode: 'gradient', bgSeed: Math.random() });
    const regenerateBW       = () => setTweaks({ bgMode: 'bw',       bgSeed: Math.random() });
    const setBackground = (id) => {
      if (id === 'gradient') { regenerateGradient(); return; }
      if (id === 'bw')       { regenerateBW();       return; }
      if (id === 'custom')   { setTweaks({ bgMode: 'custom' }); return; }
      const colors = { light: '#d9d9d6', white: '#ffffff', black: '#050505' };
      setTweaks({ bgMode: id, bgColor: colors[id] });
    };

    const e = React.createElement;

    return e(React.Fragment, null,

      // ── Shape
      e('div', { className: 'section glass3d-section' },
        e('div', { className: 'section-label' },
          e('span', { className: 'name' }, 'Object'),
          e('span', { className: 'value' }, shapeLabel)
        ),
        e('div', { className: 'glass3d-icon-grid shape-grid' },
          shapes.map(([id, label]) =>
            e('button', {
              key: id, title: label,
              className: 'glass3d-icon-btn' + (tweaks.object === id ? ' active' : ''),
              onClick: () => switchShape(id),
            }, e(GlassIcon, { type: id }), e('span', null, label))
          )
        )
      ),

      // ── Material
      e('div', { className: 'section glass3d-section' },
        e('div', { className: 'section-label' },
          e('span', { className: 'name' }, 'Material'),
          e('span', { className: 'value' }, materialLabel)
        ),
        e('div', { className: 'glass3d-icon-grid material-grid' },
          materials.map(([id, label]) =>
            e('button', {
              key: id,
              className: 'glass3d-material-btn' + (material === id ? ' active' : ''),
              onClick: () => switchMaterial(id),
            }, e(MaterialChip, { id }), e('span', null, label))
          )
        )
      ),

      // ── Colour
      e('div', { className: 'section glass3d-section' },
        e('div', { className: 'section-label' },
          e('span', { className: 'name' }, 'Colour'),
          e('span', { className: 'value' }, (presets.find(p => p.id === colorPreset) || {}).label || 'Custom')
        ),
        e('div', { className: 'glass3d-preset-row' },
          presets.map(p =>
            e('button', {
              key: p.id, title: p.label,
              className: 'glass3d-preset-pill' + (colorPreset === p.id && !customHue ? ' active' : ''),
              style: { background: 'linear-gradient(135deg, ' + p.main + ' 0%, ' + p.accent + ' 100%)' },
              onClick: () => applyPreset(p),
            })
          )
        ),
        e('div', { className: 'glass3d-picker-pair' },
          e('label', { className: 'glass3d-picker-btn' },
            e('span', { className: 'glass3d-picker-swatch', style: { background: mainColor } }),
            e('span', { className: 'glass3d-picker-label' }, 'Main'),
            e('input', { type: 'color', value: mainColor,
              onChange: (ev) => setTweaks({ mainColor: ev.target.value, colorPreset: '', customHue: '' }) })
          ),
          e('label', { className: 'glass3d-picker-btn' },
            e('span', { className: 'glass3d-picker-swatch', style: { background: accentColor } }),
            e('span', { className: 'glass3d-picker-label' }, 'Accent'),
            e('input', { type: 'color', value: accentColor,
              onChange: (ev) => setTweaks({ accentColor: ev.target.value, colorPreset: '', customHue: '' }) })
          )
        ),
        e('div', { className: 'glass3d-hue-row' },
          e('label', {
            className: 'glass3d-hue-swatch' + (customHue ? ' has-hue' : ''),
            title: 'Hue shift',
            style: customHue ? { background: customHue } : {},
          }, e('input', { type: 'color', value: customHue || '#f2b6dd',
            onChange: (ev) => setTweaks({ customHue: ev.target.value, colorPreset: '' }) })
          ),
          e('span', { className: 'glass3d-hue-label' }, 'Hue shift'),
          customHue ? e('button', {
            className: 'glass3d-hue-clear', title: 'Clear hue shift',
            onClick: () => setTweaks({ customHue: '' }),
          }, '×') : null
        )
      ),

      // ── Background
      e('div', { className: 'section glass3d-section' },
        e('div', { className: 'section-label' },
          e('span', { className: 'name' }, 'Background'),
          e('span', { className: 'value' }, (bgOptions.find(b => b[0] === bgMode) || bgOptions[0])[1])
        ),
        e('div', { className: 'glass3d-bg-row' },
          e('button', { title: 'Gradient',
            className: 'glass3d-bg-swatch bg-gradient' + (bgMode === 'gradient' ? ' active' : ''),
            onClick: regenerateGradient }),
          e('button', { title: 'B&W gradient',
            className: 'glass3d-bg-swatch bg-bw' + (bgMode === 'bw' ? ' active' : ''),
            onClick: regenerateBW }),
          e('button', { title: 'Light grey',
            className: 'glass3d-bg-swatch' + (bgMode === 'light' ? ' active' : ''),
            style: { background: '#d9d9d6' },
            onClick: () => setBackground('light') }),
          e('button', { title: 'White',
            className: 'glass3d-bg-swatch' + (bgMode === 'white' ? ' active' : ''),
            style: { background: '#ffffff' },
            onClick: () => setBackground('white') }),
          e('button', { title: 'Black',
            className: 'glass3d-bg-swatch' + (bgMode === 'black' ? ' active' : ''),
            style: { background: '#050505' },
            onClick: () => setBackground('black') }),
          e('label', {
            title: 'Custom colour',
            className: 'glass3d-bg-swatch bg-custom' + (bgMode === 'custom' ? ' active' : ''),
            style: { background: safeBg },
          }, e('span', null, '+'),
             e('input', { type: 'color', value: safeBg,
               onChange: (ev) => setTweaks({ bgMode: 'custom', bgColor: ev.target.value }) }))
        ),
        bgMode === 'custom'
          ? e('input', {
              className: 'glass3d-hex-input',
              value: tweaks.bgColor || '#f4f3ef',
              onChange: (ev) => setTweaks({ bgMode: 'custom', bgColor: ev.target.value }),
              placeholder: '#f4f3ef',
            })
          : null
      ),

      // ── Sliders
      sliderDefs.map(([k, label, min, max]) => {
        const value = tweaks[k] != null ? tweaks[k] : 0;
        return e('div', { className: 'section', key: k },
          e('div', { className: 'section-label' },
            e('span', { className: 'name' }, label),
            e('span', { className: 'value' }, Math.round(value * 100))
          ),
          e('input', {
            className: 'slider', type: 'range',
            min, max, step: '0.01', value,
            onChange: (ev) => setTweaks({ [k]: parseFloat(ev.target.value) }),
          })
        );
      }),

      e('div', { className: 'help compact-help' },
        'Click canvas to freeze · click again to release · drag to reposition. v10'
      )
    );
  }

  window.Glass3DMode     = Glass3DMode;
  window.Glass3DControls = Glass3DControls;
  window.GLASS3D_DEFAULTS = GLASS3D_DEFAULTS;

})();
