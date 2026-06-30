// glass3d-mode.js — NURR 3D Objects module v10.
// Click to freeze · drag to reposition · B&W gradient · HiDPI canvas.

(function () {
  'use strict';

  const SHAPE_DEFAULTS = {
    sphere:  { scale: 1.05, translucency: 0.72, depth: 1.05, edge: 0.22, surface: 0.18, light: 0.76, motion: 0.28, rotationSpeed: 0.12, turnY: 18, tiltX: -8, grain: 0.055 },
    cube:    { scale: 1.00, translucency: 0.65, depth: 1.20, edge: 0.00, surface: 0.10, light: 0.00, motion: 0.22, rotationSpeed: 0.10, turnY: 32, tiltX: -18, grain: 0.055 },
    soap:    { scale: 1.08, translucency: 0.80, depth: 0.65, edge: 0.16, surface: 0.32, light: 0.70, motion: 0.32, rotationSpeed: 0.08, turnY: -28, tiltX: -24, grain: 0.060 },
    pebble:  { scale: 1.12, translucency: 0.68, depth: 0.90, edge: 0.32, surface: 0.38, light: 0.74, motion: 0.26, rotationSpeed: 0.10, turnY: 24, tiltX: -16, grain: 0.055 },
    tablet:  { scale: 1.00, translucency: 0.70, depth: 0.50, edge: 0.12, surface: 0.08, light: 0.80, motion: 0.18, rotationSpeed: 0.06, turnY: 16, tiltX: -30, grain: 0.050 },
    capsule: { scale: 1.05, translucency: 0.75, depth: 1.05, edge: 0.18, surface: 0.14, light: 0.76, motion: 0.28, rotationSpeed: 0.12, turnY: 22, tiltX: -14, grain: 0.055 },
    torus:   { scale: 1.00, translucency: 0.78, depth: 0.85, edge: 0.28, surface: 0.22, light: 0.78, motion: 0.35, rotationSpeed: 0.14, turnY: 20, tiltX: -18, grain: 0.060 },
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
    surface: 0.10, light: 0.00, motion: 0.22, rotationSpeed: 0.10, turnY: 32, tiltX: -18, grain: 0.055,
  };

  const validHex = (v) => /^#[0-9a-f]{6}$/i.test(v);

  // ── Canvas component ─────────────────────────────────────────────────────
  function Glass3DMode({ tweaks, registerSnapshot, mouseRef }) {
    const canvasRef   = React.useRef(null);
    const frameRef    = React.useRef(null);
    const tweaksRef   = React.useRef(tweaks);
    const seedRef     = React.useRef(tweaks.seed || Math.random());
    const spinRef     = React.useRef({ angle: 0, lastTime: null });
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
      canDrag: false,
      mouseLocked: false,
      lockX: 0.5,
      lockY: 0.5,
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
      const liveMouse = mouseRef?.current || { x: 0.5, y: 0.5 };
      const mouse = inter.mouseLocked ? { x: inter.lockX, y: inter.lockY } : liveMouse;

      const isFrozen   = inter.state === 'frozen';
      const isDragging = inter.state === 'dragging';

      const now = time != null ? time : (window.__NURR_T ?? performance.now() * 0.001);
      const spin = spinRef.current;
      if (spin.lastTime == null) spin.lastTime = now;
      const dt = Math.max(0, Math.min(0.05, now - spin.lastTime));
      spin.lastTime = now;
      const spinSpeed = Math.max(0, Math.min(1, t.rotationSpeed != null ? t.rotationSpeed : 0));
      if (!isFrozen && !isDragging && spinSpeed > 0) {
        spin.angle += spinSpeed * dt * 4.2;
      }

      const ok = window.NurrGlass3DRenderer && window.NurrGlass3DRenderer.renderToCanvas(canvas, {
        ...t,
        time: now,
        spinAngle: spin.angle,
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
      let lastReal = null;
      const loop = () => {
        if (!alive) return;
        // Glass3D owns window.__NURR_T while it is the active module.
        // This makes the speed multiplier (window.__NURR_SPEED) work for video recording.
        const realNow = performance.now() * 0.001;
        if (lastReal === null) lastReal = realNow;
        const dt = Math.min(realNow - lastReal, 0.1);
        lastReal = realNow;
        const speed = window.__NURR_SPEED ?? 1.0;
        if (window.__NURR_T == null) window.__NURR_T = 0;
        window.__NURR_T += dt * speed;
        draw(window.innerWidth, window.innerHeight, window.__NURR_T);
        frameRef.current = requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      const resize = () => draw(window.innerWidth, window.innerHeight, window.__NURR_T ?? 0);
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
        const w = opts.width  || 3840;
        const h = opts.height || 2160;

        // Transparent layer export — render the 3D object without background
        // onto a dedicated offscreen canvas. The live screen canvas is untouched.
        if (opts.transparent) {
          const off = document.createElement('canvas');
          off.width = w; off.height = h;
          const t    = tweaksRef.current;
          const inter = interRef.current;
          const spin  = spinRef.current;
          const ok = window.NurrGlass3DRenderer && window.NurrGlass3DRenderer.renderToCanvas(off, {
            ...t,
            time:       window.__NURR_T ?? performance.now() * 0.001,
            spinAngle:  spin.angle,
            mouse:      { x: 0.5, y: 0.5 }, // neutral mouse for clean snapshot
            seed:       seedRef.current,
            targetPosX: inter.state === 'frozen' ? inter.objX : null,
            targetPosY: inter.state === 'frozen' ? inter.objY : null,
            frozen:     inter.state === 'frozen',
            transparent: true, // key: routes to alpha-enabled renderer, skips bgPln
          });
          if (!ok) return null;
          const dataUrl = off.toDataURL('image/png');
          if (!opts.returnDataUrl) WP.downloadCanvas(off, opts.filename || (`nurr-3d-layer-${w}x${h}-${Date.now()}.png`));
          return dataUrl;
        }

        // Normal composite snapshot (existing behaviour)
        const ow = canvas.width, oh = canvas.height;
        const osw = canvas.style.width, osh = canvas.style.height;
        draw(w, h, window.__NURR_T ?? performance.now() * 0.001, true);
        const dataUrl = canvas.toDataURL('image/png');
        if (!opts.returnDataUrl) WP.downloadCanvas(canvas, opts.filename || (`nurr-3d-object-${w}x${h}-${Date.now()}.png`));
        const restore = () => {
          canvas.width = ow; canvas.height = oh;
          canvas.style.width = osw; canvas.style.height = osh;
          const dpr = window.devicePixelRatio || 1;
          draw(ow / dpr, oh / dpr, window.__NURR_T ?? performance.now() * 0.001);
        };
        if (opts.returnDataUrl) restore(); else requestAnimationFrame(restore);
        return dataUrl;
      });
    }, [draw, registerSnapshot]);

    // ── Pointer handlers ──────────────────────────────────────────────────
    const getObjectHit = React.useCallback((clientX, clientY) => {
      const canvas = canvasRef.current; if (!canvas) return false;
      const rect = canvas.getBoundingClientRect();
      const nx = (clientX - rect.left) / rect.width;
      const ny = (clientY - rect.top) / rect.height;
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return false;

      const t = tweaksRef.current || {};
      const type = t.object || 'sphere';
      const scale = Math.max(0.45, Math.min(1.85, t.scale != null ? t.scale : 1));

      // Use the renderer's projected object bounds, but test them as a soft ellipse.
      // A rectangle made the cursor feel wrong: it could activate beside the object,
      // or only catch one edge after Turn/Tilt changed the projection.
      let bounds = null;
      try {
        bounds = window.NurrGlass3DRenderer && window.NurrGlass3DRenderer.getObjectBounds
          ? window.NurrGlass3DRenderer.getObjectBounds()
          : null;
      } catch (err) {
        bounds = null;
      }

      if (bounds && Number.isFinite(bounds.minX) && Number.isFinite(bounds.minY) &&
          Number.isFinite(bounds.maxX) && Number.isFinite(bounds.maxY)) {
        const isLong = ['soap','capsule','tablet','cube'].includes(type);
        const isRing = type === 'torus';

        // Screen-space projected object bounds.
        // This avoids the broken one-edge hover issue without using expensive per-frame raycasting.
        // It runs only on pointer movement.
        const mx = 0.010 + scale * 0.006 + (isLong ? 0.006 : 0) + (isRing ? 0.010 : 0);
        const my = 0.010 + scale * 0.006 + (isLong ? 0.006 : 0) + (isRing ? 0.010 : 0);

        return (
          nx >= bounds.minX - mx && nx <= bounds.maxX + mx &&
          ny >= bounds.minY - my && ny <= bounds.maxY + my
        );
      }

      // Fallback before the first renderer bounds exist.
      const inter = interRef.current;
      const locked = inter.state === 'frozen' || inter.state === 'dragging';
      const m = mouseRef?.current || { x: 0.5, y: 0.5 };
      const cx = locked ? inter.objX : (m.x != null ? m.x : 0.5);
      const cy = locked ? inter.objY : (m.y != null ? m.y : 0.52);
      const wide = ['cube','soap','capsule','tablet'].includes(type);
      const ring = type === 'torus';
      const rx = Math.min(0.42, (wide ? 0.24 : 0.18) * scale + (ring ? 0.045 : 0));
      const ry = Math.min(0.36, (wide ? 0.19 : 0.18) * scale + (ring ? 0.035 : 0));
      const dx = (nx - cx) / rx;
      const dy = (ny - cy) / ry;
      return (dx * dx + dy * dy) <= 1;
    }, [mouseRef]);

    const setStageCursor = React.useCallback((cursor) => {
      const canvas = canvasRef.current;
      if (canvas) canvas.style.cursor = cursor;
    }, []);

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
      inter.canDrag = getObjectHit(e.clientX, e.clientY);
      inter.ptrNX = nx; inter.ptrNY = ny;
      if (inter.canDrag) { e.preventDefault(); setStageCursor('grabbing'); }

      // Grab mouse pointer for reliable tracking during drag
      try { canvas.setPointerCapture(e.pointerId); } catch(err) {}

      // Reseed surface on every new click
      seedRef.current = Math.random();
    }, [getObjectHit, setStageCursor]);

    const onPointerMove = React.useCallback((e) => {
      const inter  = interRef.current;
      const canvas = canvasRef.current; if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const nx = (e.clientX - rect.left)  / rect.width;
      const ny = (e.clientY - rect.top)   / rect.height;
      inter.ptrNX = nx; inter.ptrNY = ny;

      if (!inter.ptrDown) {
        setStageCursor(getObjectHit(e.clientX, e.clientY) ? 'grab' : 'default');
        return;
      }
      const dx = e.clientX - inter.ptrStartX, dy = e.clientY - inter.ptrStartY;
      if (inter.canDrag && !inter.ptrHasMoved && Math.hypot(dx, dy) > 1) {
        inter.ptrHasMoved = true;
        inter.state = 'dragging';
      }
      if (inter.canDrag && inter.ptrHasMoved) {
        inter.state = 'dragging';
      }
      if (inter.state === 'dragging') {
        e.preventDefault();
        inter.objX = Math.max(0, Math.min(1, nx));
        inter.objY = Math.max(0, Math.min(1, ny));
      }
    }, [getObjectHit, setStageCursor]);

    const onPointerUp = React.useCallback((e) => {
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
      inter.canDrag = false;
      if (e) setStageCursor(getObjectHit(e.clientX, e.clientY) ? 'grab' : 'default');
    }, [getObjectHit, setStageCursor]);

    const onDoubleClick = React.useCallback((e) => {
      const inter = interRef.current;
      const canvas = canvasRef.current; if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      inter.mouseLocked = !inter.mouseLocked;
      inter.lockX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      inter.lockY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      e.preventDefault();
    }, []);

    return React.createElement('canvas', {
      ref:           canvasRef,
      className:     'stage',
      style:           { cursor: 'default', touchAction: 'none' },
      onPointerEnter:  (e) => setStageCursor(getObjectHit(e.clientX, e.clientY) ? 'grab' : 'default'),
      onPointerLeave:  () => setStageCursor('default'),
      onPointerCancel: () => { interRef.current.ptrDown = false; interRef.current.canDrag = false; setStageCursor('default'); },
      onPointerDown: onPointerDown,
      onPointerMove: onPointerMove,
      onPointerUp:   onPointerUp,
      onDoubleClick: onDoubleClick,
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
    const [presetsOpen, setPresetsOpen] = React.useState(true);
    const shapes = [
      ['sphere','Sphere'],['cube','Cube'],['soap','Soap'],
      ['pebble','Pebble'],['tablet','Tablet'],['capsule','Capsule'],['torus','Donut'],
    ];
    const materials = [
      ['glass','Clear glass'],['opal','Opal'],['water','Water'],
      ['metal','Metal'],['holo','Holographic'],
    ];
    const bgOptions = [
      ['gradient','Gradient'],['bw','B&W'],['light','Light grey'],
      ['white','White'],['black','Black'],['custom','Custom'],
    ];
    const sliderDefs = [
      ['scale',        'Size',         0.45, 1.85, 'percent'],
      ['translucency', 'Translucency', 0,    1,   'percent'],
      ['depth',        'Thickness',    0.25, 2.40, 'percent'],
      ['edge',         'Edge',         0,    1,   'percent'],
      ['surface',      'Surface',      0,    1,   'percent'],
      ['light',        'Highlights',   0,    1,   'percent'],
      ['motion',       'Motion',       0,    1,   'percent' ],
      ['rotationSpeed','Rotation speed',0,   1,   'percent' ],
      ['turnY',        'Turn Y',      -180, 180, 'deg'     ],
      ['tiltX',        'Tilt X',       -70,  70, 'deg'     ],
      ['grain',        'Grain',        0,    1,   'percent' ],
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
      e('div', { className: 'section glass3d-section presets-section collapsible-presets ' + (presetsOpen ? 'is-open' : 'is-collapsed') },
        e('button', {
          type: 'button',
          className: 'section-label presets-toggle',
          onClick: () => setPresetsOpen(!presetsOpen),
          'aria-expanded': presetsOpen
        },
          e('span', { className: 'name' }, 'Presets'),
          e('span', { className: 'value' }, (presets.find(p => p.id === colorPreset) || {}).label || 'Custom'),
          e('span', { className: 'preset-arrow' }, presetsOpen ? '⌃' : '⌄')
        ),
        e('div', { className: 'glass3d-preset-row palette-grid' },
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
      sliderDefs.map(([k, label, min, max, kind]) => {
        const fallback = k === 'turnY' ? 0 : (k === 'tiltX' ? 0 : (k === 'rotationSpeed' ? 0.10 : 0));
        const value = tweaks[k] != null ? tweaks[k] : fallback;
        const display = kind === 'deg' ? (Math.round(value) + '°') : Math.round(value * 100);
        return e('div', { className: 'section glass3d-slider-section', key: k },
          e('div', { className: 'section-label' },
            e('span', { className: 'name' }, label),
            e('span', { className: 'value' }, display)
          ),
          e('input', {
            className: 'slider', type: 'range',
            min, max, step: kind === 'deg' ? '1' : '0.01', value,
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
