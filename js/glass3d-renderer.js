// glass3d-renderer.js — NURR 3D Objects renderer v11.
// SSAA 2x · Gaussian grain fade-in · animated grain · NURR palette gradients
// Diamond crystal · chromic metal · smoky opal · sphere-cube geometry
// Dithered backgrounds · accent colour impact · 3D-axis mouse reactivity
(function () {
  'use strict';

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp  = (a, b, t) => a + (b - a) * t;

  function hashSeed(seed) {
    let x = Math.floor((seed || 0.47) * 1000000) || 12345;
    return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967295; };
  }

  // ── Colour helpers ─────────────────────────────────────────────────────────
  function validHex(v) { return /^#[0-9a-f]{6}$/i.test(v || ''); }
  function hexToRgb(hex) {
    const h = (validHex(hex) ? hex : '#ffffff').replace('#', '');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function hexToRgba(hex, a) { const [r,g,b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }
  function hexToHSL(hex) {
    const [r, g, b] = hexToRgb(hex).map(v => v / 255);
    const mx = Math.max(r,g,b), mn = Math.min(r,g,b);
    let h = 0, s = 0; const l = (mx + mn) / 2;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (mx === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return [h, s, l];
  }
  function hslToHex(h, s, l) {
    function f(n) { const k=(n+h*12)%12, a=s*Math.min(l,1-l), v=l-a*Math.max(-1,Math.min(k-3,9-k,1)); return Math.round(255*v).toString(16).padStart(2,'0'); }
    return '#'+f(0)+f(8)+f(4);
  }
  function applyHueShift(baseHex, targetHex, strength) {
    if (!validHex(baseHex) || !validHex(targetHex)) return baseHex;
    strength = strength || 0.65;
    const bHSL = hexToHSL(baseHex), tHSL = hexToHSL(targetHex);
    const delta = ((tHSL[0] - bHSL[0] + 1.5) % 1) - 0.5;
    const newH = ((bHSL[0] + delta * strength) + 1) % 1;
    return hslToHex(newH, bHSL[1], bHSL[2]);
  }
  function blendHex(hexA, hexB, t) {
    const [ar,ag,ab] = hexToRgb(hexA), [br,bg,bb] = hexToRgb(hexB);
    return '#' +
      Math.round(ar+(br-ar)*t).toString(16).padStart(2,'0') +
      Math.round(ag+(bg-ag)*t).toString(16).padStart(2,'0') +
      Math.round(ab+(bb-ab)*t).toString(16).padStart(2,'0');
  }
  function hexLuminance(hex) { const [r,g,b]=hexToRgb(hex); return (0.299*r+0.587*g+0.114*b)/255; }

  // ── Material colour defaults ───────────────────────────────────────────────
  const MAT_DEFAULTS = {
    glass:   { main: '#c2ddf5', accent: '#e8f4ff' },
    opal:    { main: '#e8dde2', accent: '#c8b8e8' },
    water:   { main: '#72c8dc', accent: '#c4ecff' },
    metal:   { main: '#282830', accent: '#484858' },  // black chrome as default
    holo:    { main: '#e870d8', accent: '#60b8ff' },
    crystal: { main: '#d8eeff', accent: '#b0d0ff'  },
  };

  function resolveColors(opts) {
    const m = opts.material || 'glass';
    const def = MAT_DEFAULTS[m] || MAT_DEFAULTS.glass;
    let main   = validHex(opts.mainColor)   ? opts.mainColor   : def.main;
    let accent = validHex(opts.accentColor) ? opts.accentColor : def.accent;
    if (validHex(opts.customHue)) {
      main   = applyHueShift(main,   opts.customHue, 0.68);
      accent = applyHueShift(accent, opts.customHue, 0.42);
    }
    // Blend a touch of accent into main so accent is always slightly visible
    const blended = blendHex(main, accent, 0.14);
    return { main: blended, rawMain: main, accent };
  }

  // ── Persistent state ──────────────────────────────────────────────────────
  let _THREE = null, _renderer = null;
  const _geoCache = {};
  const _env  = { canvas: null, texture: null, key: '' };
  const _bg   = { canvas: null, texture: null, key: '' };
  const _bump = { texture: null };
  const _camMouse = { cx: 0.5, cy: 0.5 };
  const _objPos   = { x: 0.5, y: 0.5 };
  let   _frameCount = 0;  // for grain fade-in

  const SSAA = 2.0; // 2× supersample → sharp edges everywhere

  function ensureRenderer(W, H) {
    if (!_THREE) return null;
    if (!_renderer) {
      const oc = document.createElement('canvas');
      _renderer = new _THREE.WebGLRenderer({
        canvas: oc, antialias: true, alpha: false,
        preserveDrawingBuffer: true, powerPreference: 'high-performance',
      });
      _renderer.outputColorSpace    = _THREE.SRGBColorSpace;
      _renderer.toneMapping         = _THREE.ACESFilmicToneMapping;
      _renderer.toneMappingExposure = 1.06;
    }
    _renderer.setPixelRatio(1);
    _renderer.setSize(W, H, false);
    return _renderer;
  }

  function getBump() {
    if (_bump.texture) return _bump.texture;
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const ctx = c.getContext('2d'), img = ctx.createImageData(512, 512);
    const rnd = hashSeed(0.731);
    for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
      const i = (y*512+x)*4;
      const w = Math.sin(x*.058)*7 + Math.cos(y*.050)*7 + Math.sin((x+y)*.022)*9;
      const v = clamp(128+w+(rnd()-.5)*5, 0, 255);
      img.data[i]=img.data[i+1]=img.data[i+2]=v; img.data[i+3]=255;
    }
    ctx.putImageData(img, 0, 0);
    const tex = new _THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = _THREE.RepeatWrapping; tex.repeat.set(2.5, 2.5);
    _bump.texture = tex; return tex;
  }

  // ── Environment map ───────────────────────────────────────────────────────
  function buildEnvCanvas(material, dark, bgHex, bgSeed, colors) {
    const c = _env.canvas || document.createElement('canvas');
    c.width = 1536; c.height = 768; _env.canvas = c;
    const ctx = c.getContext('2d');
    const isMetal   = material === 'metal';
    const isHolo    = material === 'holo';
    const isCrystal = material === 'crystal';
    const main   = colors ? colors.rawMain : '#c0c0c0';
    const accent = colors ? colors.accent  : '#e0e0e0';
    // Is the material dark? Use luminance to decide env character
    const mainLum = hexLuminance(main);
    const isDarkMat = mainLum < 0.25;

    // ── Base sky gradient
    const g = ctx.createLinearGradient(0, 0, c.width, c.height);
    if (dark) {
      g.addColorStop(0, '#05050d'); g.addColorStop(.45, '#09091a'); g.addColorStop(1, '#030308');
    } else if (isMetal) {
      // Studio HDRI: graduated sky, not plain white
      const skyTop  = isDarkMat ? '#5a6070' : blendHex('#c8ccd2', main, 0.25);
      const skyMid  = isDarkMat ? '#3a4050' : blendHex('#dcd8d2', accent, 0.18);
      const skyBot  = isDarkMat ? '#18202a' : '#1a1e26';
      g.addColorStop(0, skyTop); g.addColorStop(.38, skyMid); g.addColorStop(1, skyBot);
    } else {
      g.addColorStop(0, '#fafafa'); g.addColorStop(.5, bgHex||'#f0f0ee'); g.addColorStop(1, '#ccd0d4');
    }
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);

    // ── Holo: full rainbow
    if (isHolo) {
      const rainbow = ctx.createLinearGradient(0, 0, c.width, 0);
      rainbow.addColorStop(0,   'rgba(255,48,140,.62)');
      rainbow.addColorStop(.17, 'rgba(255,128,28,.52)');
      rainbow.addColorStop(.33, 'rgba(238,218,28,.52)');
      rainbow.addColorStop(.50, 'rgba(48,200,88,.46)');
      rainbow.addColorStop(.67, 'rgba(32,172,240,.54)');
      rainbow.addColorStop(.83, 'rgba(108,64,240,.58)');
      rainbow.addColorStop(1,   'rgba(255,48,140,.62)');
      ctx.fillStyle = rainbow; ctx.fillRect(0, 0, c.width, c.height);
    }

    function glow(x, y, w, h, color, blur) {
      ctx.save(); ctx.filter = `blur(${blur}px)`;
      ctx.fillStyle = color; ctx.fillRect(x, y, w, h); ctx.restore();
    }

    if (dark) {
      // Dark: bright accents for reflectivity
      glow(10,  5,  480, 140, 'rgba(255,255,255,.85)', 46);
      glow(360, 8,  200,  52, 'rgba(255,255,255,.92)', 24);
      glow(900, 65, 380,  90, 'rgba(255,255,255,.65)', 52);
      glow(0,   400,200, 200, hexToRgba(accent, .55),  68);
      glow(160, 570,580,  90, hexToRgba(main,   .42),  62);
      glow(1100,360,300, 300, 'rgba(160,210,255,.28)', 58);

    } else if (isMetal) {
      // Metal studio: use main/accent for the key glows, avoid pure white dominance
      const keyCol   = isDarkMat ? hexToRgba('#8090a8', .88) : hexToRgba(blendHex('#ffffff', main, 0.30), .82);
      const fillCol  = hexToRgba(accent, .58);
      const rimCol   = hexToRgba(main,   .48);
      glow(20,  10, 400, 110, keyCol,   38);   // key highlight (tinted, not pure white)
      glow(350, 8,  160,  44, 'rgba(255,255,255,.72)', 18); // small hot spot
      glow(880, 55, 320,  75, fillCol,  44);   // accent fill
      glow(0,   570,360, 160, rimCol,   56);   // warm ground reflection
      glow(1100,350,280, 280, hexToRgba(accent, .35), 52);
      // Hard horizon strip → chrome gets its "ground dark" reflection band
      const horiz = ctx.createLinearGradient(0, c.height*.50, 0, c.height);
      horiz.addColorStop(0, 'rgba(0,0,0,0)');
      horiz.addColorStop(1, isDarkMat ? 'rgba(0,0,0,.70)' : 'rgba(8,12,20,.52)');
      ctx.fillStyle = horiz; ctx.fillRect(0, c.height*.50, c.width, c.height*.50);

    } else {
      // Non-metal light: moderate glows, accent-tinted
      glow(55,  52, 480, 130, 'rgba(255,255,255,.88)', 36);
      glow(940, 90, 340,  85, hexToRgba(accent, .65), 46);
      glow(160, 545,540,  88, hexToRgba(main,   .44), 54);
      glow(1170,380,250, 280, 'rgba(175,220,255,.38)', 52);
    }

    // Crystal: add prismatic light bands
    if (isCrystal) {
      const bands = [
        ['rgba(255,80,80,.28)',0.05],['rgba(255,180,50,.24)',0.25],
        ['rgba(80,255,120,.20)',0.48],['rgba(60,160,255,.26)',0.70],['rgba(180,60,255,.24)',0.90],
      ];
      bands.forEach(([col, pos]) => {
        const sx = pos * c.width;
        const sg = ctx.createLinearGradient(sx, 0, sx + c.width * .18, c.height);
        sg.addColorStop(0,'rgba(255,255,255,0)'); sg.addColorStop(.5,col); sg.addColorStop(1,'rgba(255,255,255,0)');
        ctx.fillStyle = sg; ctx.fillRect(0, 0, c.width, c.height);
      });
    }
  }

  function getEnvTexture(material, dark, bgHex, bgSeed, colors) {
    const mk = colors ? colors.rawMain + colors.accent : '';
    const key = material+'|'+(dark?'dk':'lt')+'|'+Math.round((bgSeed||0)*100)+'|'+mk;
    if (_env.key !== key) {
      _env.key = key;
      buildEnvCanvas(material, dark, bgHex, bgSeed, colors);
      if (_env.texture) { _env.texture.needsUpdate = true; }
      else {
        _env.texture = new _THREE.CanvasTexture(_env.canvas);
        _env.texture.mapping    = _THREE.EquirectangularReflectionMapping;
        _env.texture.colorSpace = _THREE.SRGBColorSpace;
      }
    }
    return _env.texture;
  }

  // ── Material config ───────────────────────────────────────────────────────
  function materialConfig(opts) {
    const mat    = opts.material || 'glass';
    const colors = resolveColors(opts);
    const main   = colors.main, accent = colors.accent;
    const tr     = clamp(opts.translucency != null ? opts.translucency : .72, 0, 1);
    const hi     = clamp(opts.light        != null ? opts.light        : .00, 0, 1);  // default baseline = 0
    const surf   = clamp(opts.surface      != null ? opts.surface      : .18, 0, 1);
    const edg    = clamp(opts.edge         != null ? opts.edge         : .22, 0, 1);
    const dep    = clamp(opts.depth        != null ? opts.depth        : 1.05, .25, 2.4);

    const cfg = {
      color: main, specularColor: accent,
      attenuationColor: accent,
      metalness: 0, roughness: .08,
      transmission: .80, opacity: .60, transparent: true, depthWrite: false,
      thickness: 1.2, ior: 1.45, attenuationDist: 2.5,
      iridescence: .10, iridescenceIOR: 1.35, iridRange: [120, 800],
      clearcoat: .80, clearcoatRough: .022, specular: 1.0,
      envInt: 1.45, bumpScale: 0,
    };

    if (mat === 'glass') {
      cfg.roughness        = lerp(.09, .005, hi) + surf * .22;  // surface = frosting
      cfg.transmission     = lerp(.52, .98,  tr);
      cfg.opacity          = lerp(.80, .22,  tr);
      cfg.thickness        = lerp(2.2, .50,  tr) * dep;
      cfg.ior              = 1.47;
      cfg.attenuationColor = accent;
      cfg.attenuationDist  = lerp(2.2, 0.75, tr);
      cfg.iridescence      = lerp(.05, .28,  edg);
      cfg.iridescenceIOR   = 1.40;
      cfg.iridRange        = [200, 720];
      cfg.clearcoat        = lerp(.58, 1.0,  hi);
      cfg.envInt           = lerp(1.10, 2.00, hi);
      cfg.bumpScale        = surf * .018;  // surface = visible surface texture
      cfg.depthWrite       = tr < .30;

    } else if (mat === 'opal') {
      // Pearl: smooth milky body, soft rainbow iridescence, pastel depth
      cfg.roughness        = lerp(.10, .018, hi);   // smooth glossy surface
      cfg.transmission     = lerp(.0,  .22,  tr);   // milky — slightly translucent only
      cfg.opacity          = lerp(.99, .92,  tr);
      cfg.thickness        = lerp(1.0, 2.8,  tr) * dep;
      cfg.ior              = 1.52;
      cfg.attenuationColor = blendHex(accent, '#f8e8f8', 0.35);  // pastel tint
      cfg.attenuationDist  = lerp(0.60, 2.20, tr);
      cfg.iridescence      = lerp(.90, 1.0,  hi);   // always strong — pearl lives by iridescence
      cfg.iridescenceIOR   = 1.52;  // close to opal IOR = broad, soft colour bands like MOP
      cfg.iridRange        = [220, 700];
      cfg.clearcoat        = lerp(.70, 1.0,  hi);
      cfg.clearcoatRough   = lerp(.035, .004, hi);
      cfg.envInt           = lerp(1.40, 2.30, hi);
      cfg.bumpScale        = surf * .016;  // surface adds visible pearlescent micro-texture
      cfg.depthWrite       = false;

    } else if (mat === 'water') {
      cfg.roughness        = lerp(.14, .006, hi) + surf * .18;
      cfg.transmission     = lerp(.48, .98,  tr);
      cfg.opacity          = lerp(.86, .20,  tr);
      cfg.thickness        = lerp(2.6, .65,  tr) * dep;
      cfg.ior              = 1.333;
      cfg.attenuationColor = accent;
      cfg.attenuationDist  = lerp(.55, 3.8,  tr);
      cfg.iridescence      = .018;
      cfg.bumpScale        = .008 + surf * .030;  // surface = visible ripples
      cfg.envInt           = lerp(.88, 1.62, hi);

    } else if (mat === 'metal') {
      cfg.metalness        = 0.95;
      cfg.roughness        = lerp(.18, .010, hi) + surf * .20;  // surface = brushed effect
      const metalTrans     = tr * 0.38;
      cfg.transmission     = 0;
      cfg.opacity          = clamp(1.0 - metalTrans * 0.28, 0.72, 1.0);
      cfg.transparent      = metalTrans > 0.08;
      cfg.depthWrite       = !cfg.transparent;
      cfg.thickness        = 0; cfg.attenuationDist = 0;
      cfg.ior              = 2.0;
      cfg.iridescence      = lerp(.0, .35, edg);
      cfg.iridescenceIOR   = 1.65;
      cfg.iridRange        = [120, 500];
      cfg.clearcoat        = lerp(.42, 1.0, hi);
      cfg.clearcoatRough   = lerp(.10, .004, hi) + surf * .08;
      cfg.bumpScale        = surf * .016;  // surface = metal grain
      cfg.envInt           = lerp(1.80, 4.20, hi);
      cfg.specular         = lerp(.90, 1.90, hi);

    } else if (mat === 'holo') {
      // Oil-slick/gas-on-ground: strongly metallic, multicoloured, gradient-glossy
      cfg.metalness        = lerp(.75, .92, hi);   // high metalness = reflective base
      cfg.roughness        = lerp(.025, .004, hi) + surf * .12;
      cfg.transmission     = lerp(0, .18, tr);     // moderate — stays metallic first
      cfg.opacity          = lerp(1.0, .82, tr);
      cfg.transparent      = tr > .10; cfg.depthWrite = !cfg.transparent;
      cfg.thickness        = lerp(.10, .55, tr); cfg.ior = 1.55;
      cfg.attenuationColor = accent;
      cfg.iridescence      = 1.0;
      cfg.iridescenceIOR   = 2.35;   // vivid multi-hue shifts (between v10 and v12)
      cfg.iridRange        = [55, 960];
      cfg.clearcoat        = lerp(.60, 1.0, hi);
      cfg.clearcoatRough   = lerp(.025, .002, hi) + surf * .06;
      cfg.envInt           = lerp(2.10, 3.40, hi);
      cfg.specular         = lerp(1.30, 2.20, hi);

    } else if (mat === 'crystal') {
      // Swarovski/diamond: bright white + prismatic fire, not gray void
      cfg.roughness        = lerp(.002, .0005, hi);
      cfg.transmission     = lerp(.80, .96,  tr);   // clear but not invisible
      cfg.opacity          = lerp(.55, .12,  tr);   // white surface presence
      cfg.thickness        = lerp(2.8, 0.80, tr) * dep;
      cfg.ior              = 2.45;
      cfg.attenuationColor = blendHex('#ffffff', accent, 0.28);
      cfg.attenuationDist  = lerp(4.5, 1.5, tr);
      cfg.iridescence      = lerp(.92, 1.0,  hi);
      cfg.iridescenceIOR   = 2.80;
      cfg.iridRange        = [280, 830];
      cfg.specularColor    = blendHex('#ffffff', accent, 0.18);  // near-white sparkle
      cfg.clearcoat        = 1.0;
      cfg.clearcoatRough   = lerp(.001, .0003, hi);
      cfg.specular         = lerp(2.80, 4.50, hi);  // explosive diamond fire
      cfg.envInt           = lerp(3.80, 6.50, hi);
      cfg.bumpScale        = surf * .012;  // surface = micro-facet texture
    }
    return cfg;
  }

  function makeMaterial(opts) {
    const cfg = materialConfig(opts);
    const isMetal = (opts.material || 'glass') === 'metal';
    return new _THREE.MeshPhysicalMaterial({
      color:              new _THREE.Color(cfg.color),
      metalness:          cfg.metalness,
      roughness:          cfg.roughness,
      transmission:       cfg.transmission,
      opacity:            cfg.opacity,
      transparent:        cfg.transparent,
      depthWrite:         cfg.depthWrite,
      thickness:          clamp(cfg.thickness, .01, 6),
      ior:                cfg.ior,
      attenuationColor:   new _THREE.Color(cfg.attenuationColor || cfg.color),
      attenuationDistance: cfg.attenuationDist,
      iridescence:        cfg.iridescence,
      iridescenceIOR:     cfg.iridescenceIOR,
      iridescenceThicknessRange: cfg.iridRange,
      clearcoat:          cfg.clearcoat,
      clearcoatRoughness: cfg.clearcoatRough,
      specularIntensity:  cfg.specular,
      specularColor:      new _THREE.Color(cfg.specularColor || '#ffffff'),
      reflectivity:       .95,
      envMapIntensity:    cfg.envInt,
      bumpMap:            cfg.bumpScale > 0 ? getBump() : null,
      bumpScale:          cfg.bumpScale,
      side:               isMetal ? _THREE.FrontSide : _THREE.DoubleSide,
    });
  }

  // ── Geometry ──────────────────────────────────────────────────────────────
  function deform(geo, amount, mode, seed) {
    const pos = geo.attributes.position;
    const rnd = hashSeed(seed || .37); const phase = rnd() * 10;
    for (let i = 0; i < pos.count; i++) {
      let x=pos.getX(i), y=pos.getY(i), z=pos.getZ(i);
      let n = Math.sin((x+y+z)*3+phase)*.4;
      if (mode==='soap')   n=Math.sin(y*3.3+phase)*.50+Math.cos(x*2.7-phase*.7)*.38+Math.sin((x+z)*4.1)*.20;
      if (mode==='pebble') n=Math.sin(x*2.8+phase)*.42+Math.cos(y*3.7)*.34+Math.sin(z*5.2)*.22;
      const f = 1 + amount * n;
      pos.setXYZ(i, x*f, y*f, z*f);
    }
    pos.needsUpdate = true; geo.computeVertexNormals();
  }
  function rrShape(w, h, r) {
    const x=-w/2, y=-h/2, s=new _THREE.Shape();
    s.moveTo(x+r,y); s.lineTo(x+w-r,y); s.quadraticCurveTo(x+w,y,x+w,y+r);
    s.lineTo(x+w,y+h-r); s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    s.lineTo(x+r,y+h); s.quadraticCurveTo(x,y+h,x,y+h-r);
    s.lineTo(x,y+r); s.quadraticCurveTo(x,y,x+r,y); return s;
  }
  function extBox(w, h, d, r, bevel, segs) {
    const geo = new _THREE.ExtrudeGeometry(rrShape(w, h, Math.max(.001, r)), {
      depth: d, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel,
      bevelSegments: segs, steps: 1, curveSegments: Math.max(8, segs * 4),
    });
    geo.center(); geo.computeVertexNormals(); return geo;
  }

  function buildGeometry(type, sc, surf, edg, seed, dep) {
    const s=sc||1, e=clamp(edg,0,1), d=clamp(dep,.25,2.4);
    let g;

    if (type === 'sphere') {
      // High edge slider → IcosahedronGeometry = faceted gem / crystal shape
      if (e > 0.34) {
        g = new _THREE.IcosahedronGeometry(1.05*s, e > 0.62 ? 2 : 4);
      } else {
        g = new _THREE.SphereGeometry(1.05*s, 192, 96);
      }
      deform(g, .002+surf*.010+e*.010, 'pebble', seed); return g;
    }

    if (type === 'cube') {
      // Edge flipped: e=0 → sharp corners, e=1 → pillow-rounded
      const bv  = lerp(.010, .18, e) * s;
      const seg = Math.round(lerp(3, 28, e));
      g = extBox(1.55*s, 1.55*s, 1.22*s*lerp(.82,1.12,d/2.4), bv, bv, seg);
      g.rotateX(Math.PI/2); return g;
    }

    if (type === 'soap') {
      const bv=lerp(.22,.045,e)*s, r=lerp(.38,.08,e)*s, seg=Math.round(lerp(28,5,e));
      g=extBox(2.18*s,1.30*s,.42*s*d,r,bv,seg); g.rotateX(Math.PI/2);
      deform(g, (.010+surf*.025)*(1-e*.55), 'soap', seed); return g;
    }
    if (type === 'pebble') {
      if (e > 0.45) {
        // Crystal / amethyst: elongated faceted gem (obelisk / mountain crystal)
        const blend = clamp((e - 0.45) / 0.55, 0, 1);
        // IcosahedronGeometry subdivision 1 → 80 faces, clearly faceted
        // subdivision 0 → 20 faces, very geometric (for high blend)
        const subDiv = blend > 0.65 ? 0 : 1;
        g = new _THREE.IcosahedronGeometry(0.72*s, subDiv);
        // Elongate strongly on Y (vertical crystal growth), narrow on XZ
        const elongY = lerp(1.0, 2.80, blend);
        const narrowXZ = lerp(1.28, 0.68, blend);
        g.scale(narrowXZ, elongY, narrowXZ * 0.82);
        return g;
      }
      // Default smooth pebble
      g = new _THREE.SphereGeometry(1.03*s, 192, 96);
      g.scale(1.28, .84, .58); deform(g, lerp(.052,.020,e)+surf*.040, 'pebble', seed); return g;
    }
    if (type === 'tablet') {
      const bv=lerp(.16,.035,e)*s, r=lerp(.76,.42,e)*s, seg=Math.round(lerp(36,8,e));
      g=extBox(1.64*s,1.64*s,.42*s*d,r,bv,seg); g.rotateX(Math.PI/2); return g;
    }
    if (type === 'capsule') {
      g = new _THREE.CapsuleGeometry(.44*s, 1.52*s*lerp(.88,1.12,d/2.4), 48, 96);
      g.rotateZ(Math.PI/2); g.scale(1, .82, .82);
      deform(g, (.006+surf*.018)*(1-e*.6), 'soap', seed); return g;
    }
    if (type === 'torus') {
      // Edge controls tube cross-section: 0=round circle, 1=square/diamond tube
      const crossSegs = Math.round(lerp(56, 4, e));   // 56=round, 4=square tube
      const tubeSegs  = Math.round(lerp(196, 80, e));
      const tubeR     = .24*s*lerp(.75,1.15,d/2.4) * lerp(1.0, 1.28, e);  // slightly fatter when angular
      g = new _THREE.TorusGeometry(.82*s, tubeR, crossSegs, tubeSegs);
      if (e < 0.28) deform(g, (.002+surf*.010)*(1-e*.4), 'soap', seed);
      return g;
    }
    return new _THREE.SphereGeometry(1.05*s, 128, 64);
  }

  function getGeometry(type, sc, surf, edg, seed, dep) {
    const key = type+'|'+(sc||1).toFixed(2)+'|'+(surf||0).toFixed(2)+'|'+(edg||0).toFixed(2)+'|'+(dep||1).toFixed(2)+'|'+(seed||0).toFixed(5);
    if (!_geoCache[key]) {
      Object.values(_geoCache).forEach(g => { try { g.dispose(); } catch(e) {} });
      Object.keys(_geoCache).forEach(k => delete _geoCache[k]);
      _geoCache[key] = buildGeometry(type, sc, surf, edg, seed, dep);
    }
    return _geoCache[key];
  }

  // ── Background ────────────────────────────────────────────────────────────
  // Subtle dither to eliminate gradient banding
  function dither(ctx, w, h, seed) {
    const S = 64;
    const tile = document.createElement('canvas'); tile.width = tile.height = S;
    const tx = tile.getContext('2d'), img = tx.createImageData(S, S);
    const rnd = hashSeed(seed || 0.391);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.floor(rnd() * 8);
      img.data[i] = img.data[i+1] = img.data[i+2] = v; img.data[i+3] = 255;
    }
    tx.putImageData(img, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.018;
    for (let y = 0; y < h; y += S) for (let x = 0; x < w; x += S) ctx.drawImage(tile, x, y);
    ctx.restore();
  }

  function buildBgCanvas(opts) {
    const c = document.createElement('canvas'); c.width = c.height = 2048;
    const ctx = c.getContext('2d');
    const mode = opts.bgMode || 'gradient';

    if (mode !== 'gradient' && mode !== 'bw') {
      const col = mode==='white'?'#ffffff':mode==='light'?'#d9d9d6':mode==='black'?'#050505':(opts.bgColor||'#f4f3ef');
      ctx.fillStyle = col; ctx.fillRect(0, 0, c.width, c.height);
      dither(ctx, c.width, c.height, 0.2);
      return c;
    }

    if (mode === 'bw') {
      const rnd = hashSeed((opts.bgSeed || 0.42) + 0.77);
      const dark = rnd() > 0.5;
      const ax = rnd() * c.width, ay = rnd() * c.height;
      const bx = rnd() * c.width, by = rnd() * c.height;
      const g = ctx.createLinearGradient(ax, ay, bx, by);
      if (dark) { g.addColorStop(0,'#0c0c0c'); g.addColorStop(.5,'#1e1e1e'); g.addColorStop(1,'#080808'); }
      else      { g.addColorStop(0,'#f2f2f2'); g.addColorStop(.42,'#e0e0de'); g.addColorStop(1,'#c8c8c6'); }
      ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
      const vg = ctx.createRadialGradient(c.width/2, c.height/2, c.width*.18, c.width/2, c.height/2, c.width*.75);
      if (dark) { vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,.52)'); }
      else      { vg.addColorStop(0,'rgba(255,255,255,.22)'); vg.addColorStop(1,'rgba(0,0,0,.18)'); }
      ctx.fillStyle = vg; ctx.fillRect(0, 0, c.width, c.height);
      dither(ctx, c.width, c.height, opts.bgSeed || 0.42);
      return c;
    }

    // Colour gradient — NURR palette engine
    const rnd = hashSeed(opts.bgSeed != null ? opts.bgSeed : 0.42);
    let palette;
    const engine = window.NURR_GRADIENT_PALETTE_ENGINE;
    if (engine && engine.visiblePresets && engine.visiblePresets.length > 0) {
      const presets = engine.visiblePresets;
      const seed    = opts.bgSeed != null ? opts.bgSeed : 0.42;
      const idx     = Math.floor(seed * presets.length) % presets.length;
      palette = presets[Math.max(0, Math.min(idx, presets.length - 1))];
    } else {
      const fallbacks = [
        ['#f7f4ef','#dfe7e4','#bfcbd2','#0c1114'],
        ['#f3f0f6','#cfd8e8','#efe1cd','#20222a'],
        ['#f8f6ef','#e2e2dc','#c9d1c9','#161616'],
      ];
      palette = fallbacks[Math.floor(rnd() * fallbacks.length)];
    }
    const c0=palette[0], c1=palette[1], c2=palette[2], c3=palette[3]||palette[2];
    const jitter = () => rnd() * .10 - .05;

    // Primary diagonal gradient
    const angle = rnd() * Math.PI * 2;
    const cx2 = c.width/2, cy2 = c.height/2, span = c.width * .65;
    const g = ctx.createLinearGradient(
      cx2 + Math.cos(angle)*span, cy2 + Math.sin(angle)*span,
      cx2 - Math.cos(angle)*span, cy2 - Math.sin(angle)*span
    );
    g.addColorStop(0,           c0);
    g.addColorStop(.38+jitter(),c1);
    g.addColorStop(.68+jitter(),c2);
    g.addColorStop(1,           c3);
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);

    // Radial accent blob
    const rx = 200 + rnd()*1200, ry = 200 + rnd()*1000;
    const rg = ctx.createRadialGradient(rx, ry, 60, rx, ry, 900+rnd()*600);
    rg.addColorStop(0,   hexToRgba(c2, .52));
    rg.addColorStop(.55, hexToRgba(c1, .12));
    rg.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, c.width, c.height);

    dither(ctx, c.width, c.height, opts.bgSeed || 0.42);
    return c;
  }

  function getBgTexture(opts) {
    const key = (opts.bgMode||'gradient')+'|'+(opts.bgColor||'')+'|'+((opts.bgSeed!=null?opts.bgSeed:.42)).toFixed(4);
    if (_bg.key !== key) {
      _bg.key = key;
      const nc = buildBgCanvas(opts);
      if (_bg.texture) { _bg.texture.image = nc; _bg.texture.needsUpdate = true; }
      else { _bg.texture = new _THREE.CanvasTexture(nc); _bg.texture.colorSpace = _THREE.SRGBColorSpace; }
      _bg.canvas = nc;
    }
    return _bg.texture;
  }

  // ── Gaussian grain — slow/stable, fades in after 1.5 s ───────────────────────
  function applyGrain(canvas, amount, time) {
    amount = clamp(amount || 0, 0, 1);
    // Fade in: no grain for first 1.5s, then smooth ramp over next 1.5s
    const fadeIn = clamp((time - 1.5) / 1.5, 0, 1);
    const effectiveAmount = amount * fadeIn;
    if (effectiveAmount < 0.004) return;

    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const S = 768;
    // Animate very slowly: change pattern at 1fps, so pixels sit calmly instead of buzzing.
    const timeSeed = Math.floor(time * 1) / 1;

    const gc  = document.createElement('canvas'); gc.width = gc.height = S;
    const gx  = gc.getContext('2d');
    const img = gx.createImageData(S, S);
    const rnd = hashSeed(timeSeed + 0.193);

    for (let i = 0; i < img.data.length; i += 4) {
      let u1 = rnd(); if (u1 < 0.0002) u1 = 0.0002;
      const u2 = rnd();
      const n = clamp(Math.sqrt(-2 * Math.log(u1)) * Math.cos(6.2832 * u2), -2, 2);
      const v = clamp(Math.round(128 + n * 35), 0, 255);
      img.data[i]=img.data[i+1]=img.data[i+2]=v; img.data[i+3]=255;
    }
    gx.putImageData(img, 0, 0);

    // Smooth the tile (upscale then drawImage scales it back = bilinear blur)
    const gc2 = document.createElement('canvas'); gc2.width = S*2; gc2.height = S*2;
    const gx2 = gc2.getContext('2d');
    gx2.imageSmoothingEnabled = true; gx2.imageSmoothingQuality = 'high';
    gx2.drawImage(gc, 0, 0, S*2, S*2);

    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.055 + effectiveAmount * 0.14;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    for (let ty = 0; ty < H; ty += S*2) for (let tx = 0; tx < W; tx += S*2) ctx.drawImage(gc2, tx, ty);
    ctx.restore();
  }

  // ── Main render ───────────────────────────────────────────────────────────
  function renderToCanvas(canvas, options) {
    if (!canvas || !window.THREE) return false;
    _THREE = window.THREE;
    _frameCount++;
    const W = canvas.width, H = canvas.height;
    const rW = Math.round(W * SSAA), rH = Math.round(H * SSAA);
    const renderer = ensureRenderer(rW, rH); if (!renderer) return false;

    const opts   = options || {};
    const mat    = opts.material || 'glass';
    const dark   = (opts.bgMode || '') === 'black';
    const motion = clamp(opts.motion != null ? opts.motion : .28, 0, 1);
    const hi     = clamp(opts.light  != null ? opts.light  : .00, 0, 1);
    const time   = opts.time || 0;
    const colors = resolveColors(opts);

    // Camera parallax mouse
    const raw = opts.mouse || { x: .5, y: .5 };
    _camMouse.cx += ((raw.x != null ? raw.x : .5) - _camMouse.cx) * 0.055;
    _camMouse.cy += ((raw.y != null ? raw.y : .5) - _camMouse.cy) * 0.055;
    const cmx = _camMouse.cx - 0.5, cmy = _camMouse.cy - 0.5;

    // Object position — freeze/drag support
    let targetX, targetY, objLerp;
    if (opts.targetPosX != null) {
      targetX = opts.targetPosX; targetY = opts.targetPosY;
      objLerp = opts.fastLerp ? 0.20 : 0.0;
    } else {
      targetX = raw.x != null ? raw.x : 0.5; targetY = raw.y != null ? raw.y : 0.5;
      objLerp = 0.040;
    }
    if (objLerp > 0) {
      _objPos.x += (targetX - _objPos.x) * objLerp;
      _objPos.y += (targetY - _objPos.y) * objLerp;
    }
    const ox = _objPos.x - 0.5, oy = _objPos.y - 0.5;

    // Rotation mouse (slightly faster response)
    const rmx = cmx * 0.72 + (raw.x - 0.5) * 0.28;
    const rmy = cmy * 0.72 + (raw.y - 0.5) * 0.28;

    const scene  = new _THREE.Scene();
    const aspect = W / H;
    const camera = new _THREE.PerspectiveCamera(26, aspect, .1, 100);
    camera.position.set(cmx * .20 * motion, -cmy * .14 * motion, 7.2);
    camera.lookAt(cmx * .06 * motion, -cmy * .04 * motion, 0);

    scene.environment = getEnvTexture(mat, dark, opts.bgColor||'#f0f0ee', opts.bgSeed, colors);

    // Background plane
    const bgPln = new _THREE.Mesh(
      new _THREE.PlaneGeometry(14 * aspect, 14),
      new _THREE.MeshBasicMaterial({ map: getBgTexture(opts) })
    );
    bgPln.position.z = -4.2; scene.add(bgPln);

    // ── Lights
    // Hemisphere: balanced ambient
    scene.add(new _THREE.HemisphereLight(0xffffff, 0x384050, lerp(.55, 1.35, hi)));

    // Key: upper-left-front
    const key = new _THREE.DirectionalLight(0xffffff, lerp(1.50, 3.80, hi));
    key.position.set(-2.8 + rmx * 1.6, 4.0 - rmy * 1.4, 5.0); scene.add(key);

    // Rim: right-low
    const rim = new _THREE.DirectionalLight(0xb8e2ff, lerp(.42, 2.10, hi));
    rim.position.set(4.0, -2.0, 3.0); scene.add(rim);

    // Bottom fill: lights the bottom face of cube, adds realism to all
    const bot = new _THREE.DirectionalLight(0x9090a8, lerp(.55, 1.20, hi));
    bot.position.set(0, -5, 2.5); scene.add(bot);

    // Warm back
    const warm = new _THREE.DirectionalLight(0xffd0a0, lerp(.14, .90, hi));
    warm.position.set(-3.8, -2.6, 3.5); scene.add(warm);

    // Accent-coloured fill — always present, visible accent impact
    const accentFill = new _THREE.DirectionalLight(new _THREE.Color(colors.accent), lerp(.28, 1.20, hi));
    accentFill.position.set(3.2, 1.0, 2.6); scene.add(accentFill);

    if (dark || mat === 'metal' || mat === 'holo' || mat === 'crystal') {
      const fill = new _THREE.DirectionalLight(0xffffff, lerp(.38, 1.25, hi) * (dark ? 2.0 : 1.0));
      fill.position.set(.5, -1.4, 4.0); scene.add(fill);
      const backRim = new _THREE.DirectionalLight(0xffe0d0, lerp(.20, .75, hi));
      backRim.position.set(1.4, 2.2, -3.8); scene.add(backRim);
      if (dark) {
        const dR = new _THREE.DirectionalLight(0xffffff, 1.20 * hi);
        dR.position.set(-2.2, 3.2, 1.8); scene.add(dR);
        const dF = new _THREE.DirectionalLight(0xc4d8ff, .55 * hi);
        dF.position.set(2.8, -1.0, 2.0); scene.add(dF);
      }
    }

    if (mat === 'metal') {
      // Coloured lights from main/accent directions → chrome tints toward the palette
      const mL = new _THREE.DirectionalLight(new _THREE.Color(colors.rawMain), lerp(.65, 1.90, hi));
      mL.position.set(-2.2, 2.0, 3.2); scene.add(mL);
      const aL = new _THREE.DirectionalLight(new _THREE.Color(colors.accent), lerp(.45, 1.50, hi));
      aL.position.set(3.0, -.8, 2.5); scene.add(aL);
      // Right-side fill so all cube faces get colour
      const rFill = new _THREE.DirectionalLight(new _THREE.Color(blendHex(colors.rawMain,'#8090a8',0.5)), lerp(.50, 1.10, hi));
      rFill.position.set(3.5, 1.5, 1.5); scene.add(rFill);
    }
    if (mat === 'holo') {
      const hL = new _THREE.DirectionalLight(new _THREE.Color(colors.rawMain), lerp(.7, 2.0, hi));
      hL.position.set(-3.0, 1.0, 3.0); scene.add(hL);
      const hR = new _THREE.DirectionalLight(new _THREE.Color(colors.accent), lerp(.5, 1.6, hi));
      hR.position.set(3.0, -1.0, 3.0); scene.add(hR);
    }

    // ── Mesh
    const sc   = clamp(opts.scale   != null ? opts.scale   : 1.05, .45, 1.85);
    const type = opts.object || 'sphere';
    const geo  = getGeometry(type, sc, opts.surface!=null?opts.surface:.18, opts.edge!=null?opts.edge:.22, opts.seed, opts.depth!=null?opts.depth:1.05);
    const mesh = new _THREE.Mesh(geo, makeMaterial(opts));

    const degToRad = (deg) => deg * Math.PI / 180;
    const manualTurn = degToRad(clamp(opts.viewTurn != null ? opts.viewTurn : 24, -180, 180));
    const manualTilt = degToRad(clamp(opts.viewTilt != null ? opts.viewTilt : -16, -70, 70));
    const autoY    = 0;
    const floatAmt = opts.frozen ? 0.4 : 1.0;
    const floatY   = Math.sin(time * .72 + (opts.seed||0) * 10) * .062 * motion * floatAmt;

    const worldRangeX = aspect * 2.8, worldRangeY = 2.0;
    mesh.position.set(ox * worldRangeX, -oy * worldRangeY + floatY, 0);

    const mInfl = opts.frozen ? 0.0 : motion;
    const breathingTilt = Math.sin(time*.32)*.026*motion;
    const breathingTurn = Math.cos(time*.27)*.030*motion;
    mesh.rotation.x = manualTilt + rmy * .22 * mInfl + breathingTilt;
    mesh.rotation.y = manualTurn + rmx * .25 * mInfl + breathingTurn;
    mesh.rotation.z = (type==='capsule'?.28:0) + rmx*rmy*.10*mInfl + Math.sin(time*.40)*.012*motion;
    if (type === 'torus')   mesh.rotation.z = Math.sin(time*.40)*.018*motion;
    if (type === 'capsule') mesh.rotation.z = .28 + Math.sin(time*.40)*.016*motion;

    scene.add(mesh);

    // Inner depth shell for refractive materials
    if (['glass','crystal','holo','opal'].includes(mat) && ['sphere','soap','pebble','torus'].includes(type)) {
      const io = Object.assign({}, opts, {
        translucency: clamp((opts.translucency!=null?opts.translucency:.72)+.15, 0, 1),
        surface: 0, depth: (opts.depth!=null?opts.depth:1)*.26,
      });
      const im = makeMaterial(io);
      im.opacity *= .08; im.depthWrite = false;
      const inner = new _THREE.Mesh(geo, im);
      inner.scale.setScalar(.962);
      inner.rotation.copy(mesh.rotation);
      inner.position.copy(mesh.position);
      scene.add(inner);
    }

    renderer.clear(true, true, true);
    renderer.render(scene, camera);
    renderer.getContext().finish && renderer.getContext().finish();

    const ctx2d = canvas.getContext('2d');
    ctx2d.imageSmoothingEnabled = true; ctx2d.imageSmoothingQuality = 'high';
    ctx2d.clearRect(0, 0, W, H);
    ctx2d.drawImage(renderer.domElement, 0, 0, W, H);

    applyGrain(canvas, opts.grain || 0, time);

    // Cleanup
    const cachedGeos = new Set(Object.values(_geoCache));
    scene.traverse(obj => {
      if (obj.geometry && !cachedGeos.has(obj.geometry)) obj.geometry.dispose && obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
      mats.forEach(m => {
        if (m.map && m.map !== _bg.texture && m.map !== _env.texture && m.map !== _bump.texture) m.map.dispose && m.map.dispose();
        if (m.bumpMap && m.bumpMap !== _bump.texture) m.bumpMap.dispose && m.bumpMap.dispose();
        m.dispose && m.dispose();
      });
    });
    return true;
  }

  window.NurrGlass3DRenderer = { renderToCanvas };
})();
