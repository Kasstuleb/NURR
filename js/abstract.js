// ─────────────────────────────────────────────────────────────────────────────
// NURR — abstract.js   Glass-refraction abstract mode (WebGL)
// Browser only: React + Babel standalone. No imports / exports.
//
// Architecture:
//   • Creates a WebGL overlay canvas on #root (z-index 1, pointer-events none)
//   • All rendering happens in a single fullscreen fragment shader
//   • Overlay is created on mount and torn down on unmount — no conflict with
//     other modes that write to canvas.stage via 2D context
//   • React state → WebGL uniforms on every control change
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  const { useState, useEffect, useRef } = React;

  // ═══════════════════════════════════════════════════════════════════════════
  // GLSL — vertex shader (trivial fullscreen quad)
  // ═══════════════════════════════════════════════════════════════════════════
  const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

  // ═══════════════════════════════════════════════════════════════════════════
  // GLSL — fragment shader
  //
  // Rendering pipeline per pixel:
  //   1. Stretch UV 8% beyond viewport → gradient bleeds past all edges
  //   2. Compute displacement (cylindrical glass lens | circular wave interference)
  //   3. Sample the procedural gradient field at displaced UV → colour bends
  //   4. Add glass-edge depth (shadow + highlight from displacement derivative)
  //   5. Weighted 5-tap cross blur on the displaced field (0 cost at blur=0)
  //   6. Contrast → B&W → Invert → grain
  // ═══════════════════════════════════════════════════════════════════════════
  const FRAG = `
precision highp float;

uniform vec2  u_res;
uniform int   u_form;      // 0=glass  1=ripple
uniform int   u_gsrc;      // 0=smooth 1=blob
uniform int   u_variant;   // 0..7 random gradient composition variant
uniform vec3  u_pal[8];    // palette colours (always padded to 8)
uniform int   u_palN;      // active colour count 2–8
uniform float u_density;   // 0→1 maps to 2→14 glass panes
uniform float u_strength;  // refraction / ripple displacement
uniform float u_blur;
uniform float u_vdist;     // gradient field spread / wave source separation
uniform float u_vsize;     // gradient bloom scale
uniform float u_contrast;
uniform float u_grain;
uniform float u_bw;        // 0 or 1
uniform float u_invert;    // 0 or 1
uniform float u_seed;
uniform float u_time;
uniform vec2  u_mouse;
uniform vec2  u_mouseRaw;
uniform float u_clickPulse;
uniform float u_mouseActive;

// ── Hash ──────────────────────────────────────────────────────────────────────
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// ── Palette lookup ────────────────────────────────────────────────────────────
// Smoothstep interpolation. Uses only constant array indices so it compiles
// cleanly on all WebGL 1.0 / GLSL ES 1.0 implementations.
vec3 pal(float t) {
  t = clamp(t, 0.0, 1.0);
  // Clamp fi so i never reaches palN-1 (avoids the i==7, f==0 edge case)
  float fi = min(t * float(u_palN - 1), float(u_palN - 1) - 0.00012);
  int   i  = int(fi);
  float f  = fi - float(i);
  f = f * f * (3.0 - 2.0 * f); // smoothstep

  vec3 a, b;
  if      (i == 0) { a = u_pal[0]; b = u_pal[1]; }
  else if (i == 1) { a = u_pal[1]; b = u_pal[2]; }
  else if (i == 2) { a = u_pal[2]; b = u_pal[3]; }
  else if (i == 3) { a = u_pal[3]; b = u_pal[4]; }
  else if (i == 4) { a = u_pal[4]; b = u_pal[5]; }
  else if (i == 5) { a = u_pal[5]; b = u_pal[6]; }
  else             { a = u_pal[6]; b = u_pal[7]; }
  return mix(a, b, f);
}

// ── Gradient field ────────────────────────────────────────────────────────────
// Returns a 0–1 scalar for palette lookup.
// Randomization changes u_variant + u_seed, giving more than two visual outcomes.
float smoothField(vec2 uv) {
  float angle = u_seed * 6.28318 + float(u_variant) * 0.73 + u_time * 0.055;
  vec2  dir   = normalize(vec2(cos(angle), sin(angle)));
  vec2  dir2  = normalize(vec2(cos(angle + 1.5708), sin(angle + 1.5708)));
  float sp    = u_vdist * 1.65 + 0.42;
  float sz    = u_vsize * 0.90 + 0.45;

  float base = dot(uv - 0.5, dir) * sp * 0.82 + 0.5;

  // Variant-specific large atmospheric fields.
  float waveA = sin(dot(uv, dir)  * (2.2 + float(u_variant) * 0.27) * 3.14159 + u_seed * 2.1 + u_time * 0.16);
  float waveB = sin(dot(uv, dir2) * (1.4 + float(u_variant) * 0.19) * 3.14159 - u_seed * 1.4 - u_time * 0.11);
  base += waveA * (0.06 + 0.035 * float((u_variant + 1) / 3));
  base += waveB * (0.045 + 0.020 * float((u_variant + 2) / 4));

  vec2 c1 = vec2(0.15, 0.72) + 0.18 * vec2(cos(angle*0.7), sin(angle*1.1));
  vec2 c2 = vec2(0.82, 0.24) + 0.15 * vec2(sin(angle*0.8), cos(angle*1.3));
  vec2 c3 = vec2(0.50, 0.55) + 0.20 * vec2(cos(angle*1.7+2.0), sin(angle*1.2-1.0));

  float r1 = length((uv - c1) / (vec2(0.82, 0.44) * sz));
  float r2 = length((uv - c2) / (vec2(0.48, 0.80) * sz));
  float r3 = length((uv - c3) / (vec2(0.65, 0.56) * sz));

  float b1 = exp(-r1*r1 * 1.18);
  float b2 = exp(-r2*r2 * 1.42);
  float b3 = exp(-r3*r3 * 1.05);

  if (u_variant == 0) return base + b1*0.22 - b2*0.18 + b3*0.08;
  if (u_variant == 1) return 0.58 + (base-0.5)*0.55 + b1*0.34 - b3*0.24;
  if (u_variant == 2) return base + b2*0.30 - b1*0.16 + waveB*0.08;
  if (u_variant == 3) return 0.45 + (base-0.5)*1.15 + b3*0.28 + b1*0.12;
  if (u_variant == 4) return base + sin((uv.x*0.6 + uv.y*1.4) * 6.28318 + u_seed) * 0.08;
  if (u_variant == 5) return base - b3*0.28 + b2*0.20;
  if (u_variant == 6) return 0.5 + (b1 - b2) * 0.42 + (base-0.5)*0.38;
  return base + b1*0.15 + b2*0.15 - b3*0.18;
}

float blobField(vec2 uv) {
  float sp = u_vdist * 1.60 + 0.50;
  float sz = u_vsize * 1.20 + 0.52;
  float seed = u_seed * 6.28318 + float(u_variant) * 0.61 + u_time * 0.045;

  float val = 0.0;
  float wt = 0.0;

  int count = 5 + (u_variant - (u_variant / 4) * 4); // 5–8
  for (int k = 0; k < 8; k++) {
    if (k >= count) continue;
    float fk = float(k);
    float a = seed + fk * 6.28318 / float(count);
    vec2 c = vec2(0.5) + 0.44 * sp * vec2(cos(a), sin(a * (0.82 + 0.03*float(u_variant))));
    c += vec2(sin(seed + fk*2.17), cos(seed*0.77 + fk*1.41)) * 0.075;

    vec2 ell = vec2(0.32 + 0.22*sin(a*1.3), 0.30 + 0.20*cos(a*0.9)) * sz;
    float d = length((uv - c) / ell);
    float w = exp(-d*d * (1.25 + 0.22*float((k + u_variant) / 3)));

    float tone = mod(fk * 0.23 + float(u_variant) * 0.17, 1.0);
    val += w * tone;
    wt += w;
  }

  // Concentrated pulse / void anchor.
  vec2 anchor = vec2(0.5) + 0.24 * vec2(cos(seed*1.3), sin(seed*0.9));
  float dc = length((uv - anchor) / (vec2(0.20,0.26) * sz));
  float wc = exp(-dc*dc * (2.0 + float(u_variant)*0.12));
  val += wc * (u_variant == 2 || u_variant == 5 ? 0.12 : 0.62);
  wt += wc;

  float f = val / max(wt, 0.0001);
  if (u_variant == 1 || u_variant == 6) f = smoothstep(0.18, 0.88, f);
  if (u_variant == 3) f = 1.0 - f * 0.88;
  return clamp(f, 0.0, 1.0);
}

float field(vec2 uv) {
  return (u_gsrc == 0) ? smoothField(uv) : blobField(uv);
}

// ── Glass displacement ────────────────────────────────────────────────────────
// Cylindrical lens model.
// Each pane samples a laterally shifted strip of the gradient field.
// The UV jump at each boundary (Δu = strength × 0.36 / N) is the refraction
// cue: colours shift discontinuously at pane edges, not stripes appear on top.
vec2 glassDisp(vec2 uv) {
  float N  = floor(u_density * 20.0 + 5.0); // 5–25 panes
  float px = uv.x * N;
  float t  = fract(px);
  float pi = floor(px);

  // Cylindrical pane curve. This bends the sampled gradient inside each pane.
  float center = t - 0.5;
  float curve  = center * (1.0 - abs(center) * 1.18);

  // Pane phase and irregularity: avoids copy-paste repetition.
  float phase = pi * 2.39996 + u_seed * 6.28318 + u_time * 0.10;
  float rnd   = hash(vec2(pi, floor(u_seed * 997.0)));

  // Main horizontal refraction.
  float dx = curve * u_strength * (0.18 / N) * (0.75 + rnd * 0.75);

  // The missing glass behaviour:
  // vertical displacement changes inside each stripe, so the gradient rises/falls
  // through the pane pattern instead of only receiving a vertical line overlay.
  float paneWave = sin(center * 3.14159);
  float verticalDrift = sin(phase) * 0.020 * u_strength;
  float internalWave  = paneWave * cos(uv.y * 4.2 + phase) * 0.030 * u_strength;
  float slowColumnLag = sin((uv.y * 1.65 + rnd * 2.0 + u_seed) * 6.28318) * 0.012 * u_strength;

  float dy = verticalDrift + internalWave + slowColumnLag;

  return vec2(dx, dy);
}

// ── Glass edge depth ──────────────────────────────────────────────────────────
// Derived from the pane geometry — not an overlay layer.
// Bright sliver on the light-facing (left) face; shadow on the right.
float glassDepth(vec2 uv) {
  float N = floor(u_density * 20.0 + 5.0);
  float t = fract(uv.x * N);

  // Softer edge depth. It should read as refraction/light falloff, not a white line.
  float hi = exp(-t * t * 52.0) * 0.075;
  float sh = exp(-(1.0 - t) * (1.0 - t) * 42.0) * 0.075;
  return hi - sh;
}

// ── Ripple displacement ───────────────────────────────────────────────────────
// Three circular wave sources at 120° create interference ripples.
// Gradient is sampled at the displaced UV — it bends, no rings are drawn.
vec2 rippleDisp(vec2 uv) {
  float sp   = u_vdist * 0.52 + 0.20;
  float sz   = u_vsize * 0.72 + 0.42;
  float a0   = u_seed * 6.28318 + u_time * 0.18;
  float freq = 5.5 + 10.0 * sp;
  float amp  = u_strength * u_strength * 0.135; // visibly reacts to Ripple strength

  vec2 c1 = vec2(0.5 + 0.36 * sp * cos(a0),           0.5 + 0.36 * sp * sin(a0));
  vec2 c2 = vec2(0.5 + 0.36 * sp * cos(a0 + 2.09440), 0.5 + 0.36 * sp * sin(a0 + 2.09440));
  vec2 c3 = vec2(0.5 + 0.36 * sp * cos(a0 + 4.18879), 0.5 + 0.36 * sp * sin(a0 + 4.18879));

  float r1 = length((uv - c1) / vec2(1.0, 0.78));
  float r2 = length((uv - c2) / vec2(1.0, 0.82));
  float r3 = length((uv - c3) / vec2(1.0, 0.80));

  vec2 g1 = normalize(uv - c1 + vec2(0.00001));
  vec2 g2 = normalize(uv - c2 + vec2(0.00001));
  vec2 g3 = normalize(uv - c3 + vec2(0.00001));

  float e1 = exp(-r1 * (1.05 / sz));
  float e2 = exp(-r2 * (1.05 / sz));
  float e3 = exp(-r3 * (1.05 / sz));

  vec2 d = g1 * sin(r1 * freq * 6.28318)         * e1
         + g2 * sin(r2 * freq * 6.28318 + 1.047) * e2
         + g3 * sin(r3 * freq * 6.28318 + 2.094) * e3;

  // Add vertical glass-ripple drift so strength visibly shifts the gradient up/down.
  float vertical = sin((uv.x * (10.0 + sp * 20.0) + uv.y * 2.0 + u_seed) * 6.28318);
  d.y += vertical * 0.55;

  return d * amp;
}


// ── Mouse interaction ────────────────────────────────────────────────────────
// Soft magnetic distortion. It affects the sampled colour field, not the cursor.
// u_mouse uses the app's smoothed/chaos pointer when available; u_mouseRaw keeps
// the direct pointer for click ripples.
vec2 mouseWarp(vec2 uv) {
  if (u_mouseActive < 0.5) return vec2(0.0);
  vec2 aspect = vec2(u_res.x / u_res.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;
  vec2 m = (u_mouse - 0.5) * aspect;
  vec2 mr = (u_mouseRaw - 0.5) * aspect;

  vec2 toMouse = m - p;
  float d = length(toMouse) + 0.001;
  float pull = exp(-d * d * 1.05);

  vec2 dir = normalize(toMouse);
  vec2 swirl = vec2(-dir.y, dir.x);
  float pulse = sin(distance(p, mr) * 20.0 - u_clickPulse * 8.0) * exp(-distance(p, mr) * 2.35) * u_clickPulse;

  vec2 warp = dir * pull * (0.040 + u_strength * 0.060);
  warp += swirl * pull * sin(u_time * 0.8 + d * 7.2) * 0.020;
  warp += dir * pulse * 0.055;

  return warp / aspect;
}

// ── Main ──────────────────────────────────────────────────────────────────────
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;

  // Stretch 8% beyond viewport edges — gradient bleeds to all corners,
  // no visible rectangular boundary wherever the colour field starts/ends.
  vec2 sv = uv * 1.16 - 0.08;
  sv += mouseWarp(uv);

  vec2 disp = (u_form == 0) ? glassDisp(sv) : rippleDisp(sv);

  // ── Blur / softness ───────────────────────────────────────────────
  // Wider 9-tap sample: blur now visibly softens the underlying colour field.
  float br = u_blur * u_blur * 0.090;
  vec2  d  = sv + disp;
  vec3 col = vec3(0.0);
  col += pal(field(d)) * 0.24;
  col += pal(field(d + vec2( br,  0.0))) * 0.10;
  col += pal(field(d + vec2(-br,  0.0))) * 0.10;
  col += pal(field(d + vec2( 0.0,  br))) * 0.10;
  col += pal(field(d + vec2( 0.0, -br))) * 0.10;
  col += pal(field(d + vec2( br,  br) * 0.72)) * 0.09;
  col += pal(field(d + vec2(-br, -br) * 0.72)) * 0.09;
  col += pal(field(d + vec2( br, -br) * 0.72)) * 0.09;
  col += pal(field(d + vec2(-br,  br) * 0.72)) * 0.09;

  // Glass edge depth applied before contrast so it integrates with the field
  if (u_form == 0) col += vec3(glassDepth(sv)) * (0.65 + u_strength * 0.35);

  // ── Contrast: pivot at 0.5, range 0.20–1.80 ────────────────────────────
  float c = u_contrast * 1.60 + 0.20;
  col = (col - 0.5) * c + 0.5;

  // ── B&W ────────────────────────────────────────────────────────────────
  if (u_bw > 0.5) {
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = vec3(lum);
  }

  // ── Invert ─────────────────────────────────────────────────────────────
  if (u_invert > 0.5) col = 1.0 - col;

  // ── Grain: visible film texture, stable enough not to shimmer harshly ─
  float g    = u_grain * 0.145;
  vec2  gp   = gl_FragCoord.xy + floor(u_time * 12.0) * 3.17 + u_seed * 512.0;
  float fine = hash(floor(gp * 1.10)) - 0.5;
  float soft = hash(floor(gp * 0.32)) - 0.5;
  float grit = mix(fine, soft, 0.22);
  col += grit * g;
  col = mix(col, col + vec3(grit) * 0.055, u_grain);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

  // ═══════════════════════════════════════════════════════════════════════════
  // parsePalette
  // Accepts whatever app.js hands in: hex strings, [r,g,b] arrays, {hex} objs.
  // Always returns { flat: Float32Array(24), count: int, hexes: string[] }.
  // Padded to 8 entries so the shader uniform is always fully populated.
  // ═══════════════════════════════════════════════════════════════════════════
  function parsePalette(palette) {
    const src = Array.isArray(palette) && palette.length > 0
      ? palette
      : ['#1a1a3e', '#3a1060', '#0e3a7a', '#601040'];

    const flat  = [];
    const hexes = [];

    src.slice(0, 8).forEach(function (c) {
      let r = 0.5, g = 0.5, b = 0.5, hex = '#808080';

      if (typeof c === 'string' && c.length >= 4) {
        const h = c.replace('#', '');
        r   = parseInt(h.slice(0, 2), 16) / 255;
        g   = parseInt(h.slice(2, 4), 16) / 255;
        b   = parseInt(h.slice(4, 6), 16) / 255;
        hex = c;
      } else if (Array.isArray(c) && c.length >= 3) {
        r = c[0] / 255; g = c[1] / 255; b = c[2] / 255;
        hex = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
      } else if (c && typeof c === 'object' && c.hex) {
        const h = (c.hex || '').replace('#', '');
        r   = parseInt(h.slice(0, 2), 16) / 255;
        g   = parseInt(h.slice(2, 4), 16) / 255;
        b   = parseInt(h.slice(4, 6), 16) / 255;
        hex = c.hex;
      }

      if (isNaN(r)) r = 0.5;
      if (isNaN(g)) g = 0.5;
      if (isNaN(b)) b = 0.5;

      flat.push(r, g, b);
      hexes.push(hex);
    });

    // Pad to exactly 8 entries by repeating the last colour
    while (flat.length < 24) {
      flat.push(flat[flat.length - 3] || 0.5,
                flat[flat.length - 2] || 0.5,
                flat[flat.length - 1] || 0.5);
    }

    return {
      flat:  new Float32Array(flat),
      count: Math.max(2, Math.min(8, src.length)),
      hexes: hexes,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // drawPreview  — Canvas 2D formation thumbnail (keeps WebGL context count low)
  // ═══════════════════════════════════════════════════════════════════════════
  function drawPreview(canvas, formIdx, palette) {
    const W = canvas.width  = canvas.offsetWidth  || 80;
    const H = canvas.height = canvas.offsetHeight || 52;
    if (W < 4 || H < 4) return;

    const ctx    = canvas.getContext('2d');
    if (!ctx) return;

    const info   = parsePalette(palette);
    const hexes  = info.hexes;
    const nC     = Math.max(2, hexes.length);

    // Base left→right gradient
    const grd = ctx.createLinearGradient(0, 0, W, 0);
    hexes.forEach(function (c, i) { grd.addColorStop(i / (nC - 1), c); });
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    if (formIdx === 0) {
      // Glass — 5 panes each with a lateral colour shift
      const N = 5;
      for (let i = 0; i < N; i++) {
        const x0    = (i / N) * W;
        const pw    = W / N;
        const shift = (i - (N - 1) / 2) * pw * 0.55;
        const g2    = ctx.createLinearGradient(-shift, 0, W - shift, 0);
        hexes.forEach(function (c, j) { g2.addColorStop(j / (nC - 1), c); });
        ctx.save();
        ctx.beginPath(); ctx.rect(x0, 0, pw, H); ctx.clip();
        ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
        // Left-face highlight
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fillRect(x0, 0, 1, H);
        ctx.restore();
      }
    } else {
      // Ripple — sinusoidal column-shift of the base gradient
      try {
        const img = ctx.getImageData(0, 0, W, H);
        const src = new Uint8ClampedArray(img.data);
        for (let x = 0; x < W; x++) {
          const wave = Math.sin((x / W) * Math.PI * 5) * 0.14;
          const sx   = Math.min(Math.max(Math.round(x + wave * W * 0.15), 0), W - 1);
          for (let y = 0; y < H; y++) {
            const di = (y * W + x)  * 4;
            const si = (y * W + sx) * 4;
            img.data[di    ] = src[si    ];
            img.data[di + 1] = src[si + 1];
            img.data[di + 2] = src[si + 2];
            img.data[di + 3] = 255;
          }
        }
        ctx.putImageData(img, 0, 0);
      } catch (e) { /* cross-origin guard — preview just stays as flat gradient */ }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // initGL  — compile shaders, link program, create fullscreen quad buffer
  // ═══════════════════════════════════════════════════════════════════════════
  function initGL(canvas) {
    const gl = canvas.getContext('webgl',              { antialias: false, preserveDrawingBuffer: true })
            || canvas.getContext('experimental-webgl', { antialias: false, preserveDrawingBuffer: true });
    if (!gl) return null;

    function mkShader(src, type) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('[NURR abstract] shader compile:', gl.getShaderInfoLog(s));
        gl.deleteShader(s);
        return null;
      }
      return s;
    }

    const vs = mkShader(VERT, gl.VERTEX_SHADER);
    const fs = mkShader(FRAG, gl.FRAGMENT_SHADER);
    if (!vs || !fs) return null;

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[NURR abstract] program link:', gl.getProgramInfoLog(prog));
      return null;
    }

    // Fullscreen triangle-pair
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1,  1, -1,  -1, 1,  1, -1,  1, 1,  -1, 1]),
      gl.STATIC_DRAW
    );

    const uLoc = {};
    ['u_res','u_form','u_gsrc','u_variant','u_pal','u_palN','u_density','u_strength',
     'u_blur','u_vdist','u_vsize','u_contrast','u_grain','u_bw','u_invert','u_seed','u_time','u_mouse','u_mouseRaw','u_clickPulse','u_mouseActive']
      .forEach(function (n) { uLoc[n] = gl.getUniformLocation(prog, n); });

    return { gl, prog, buf, aPos: gl.getAttribLocation(prog, 'a_pos'), uLoc };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AbstractPanel — React component
  // Accepts palette as props.palette | props.colors | props.swatches
  // ═══════════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════════
  // NURR-compatible React components
  //
  // The original file exposed only window.AbstractPanel, but the NURR app shell
  // expects window.AbstractMode, window.AbstractControls and window.ABSTRACT_DEFAULTS.
  // This adapter keeps the shader/util functions above and changes only the
  // integration layer.
  // ═══════════════════════════════════════════════════════════════════════════

  function clamp01(v, fallback) {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.max(0, Math.min(1, n));
    return fallback;
  }

  function toFormationIndex(v) {
    return v === 'ripple' || v === 1 ? 1 : 0;
  }

  function toGradientSourceIndex(v) {
    return v === 'blob' || v === 1 ? 1 : 0;
  }

  function getAbstractState(tweaks) {
    const d = window.ABSTRACT_DEFAULTS || {};
    return {
      formation: tweaks && tweaks.formation !== undefined ? tweaks.formation : d.formation,
      gradientSource: tweaks && tweaks.gradientSource !== undefined ? tweaks.gradientSource : d.gradientSource,
      variant: tweaks && tweaks.variant !== undefined ? tweaks.variant : d.variant,
      colors: tweaks && Array.isArray(tweaks.colors) ? tweaks.colors : d.colors,
      glassDensity: clamp01(tweaks && tweaks.glassDensity, d.glassDensity),
      rippleStrength: clamp01(tweaks && tweaks.rippleStrength, d.rippleStrength),
      blur: clamp01(tweaks && tweaks.blur, d.blur),
      vectorDistance: clamp01(tweaks && tweaks.vectorDistance, d.vectorDistance),
      vectorSize: clamp01(tweaks && tweaks.vectorSize, d.vectorSize),
      contrast: clamp01(tweaks && tweaks.contrast, d.contrast),
      grain: clamp01(tweaks && tweaks.grain, d.grain),
      bw: !!(tweaks && tweaks.bw),
      invert: !!(tweaks && tweaks.invert),
      seed: tweaks && tweaks.seed !== undefined ? tweaks.seed : d.seed
    };
  }

  function AbstractMode(props) {
    const tweaks = props.tweaks || {};
    const registerSnapshot = props.registerSnapshot || function(){};
    const mouseRef = props.mouseRef || { current: { x:0.5, y:0.5, chaosX:0.5, chaosY:0.5 } };

    const canvasRef = useRef(null);
    const glRef = useRef(null);
    const stateRef = useRef(tweaks);
    const runtimeRef = useRef({ pulse: 0, neutral: false });

    function drawFrame() {
      const bundle = glRef.current;
      const canvas = canvasRef.current;
      if (!bundle || !canvas) return;

      const st = getAbstractState(stateRef.current || tweaks);
      const p = parsePalette(st.colors);
      const { gl, prog, buf, aPos, uLoc } = bundle;

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      gl.uniform2f(uLoc.u_res, canvas.width, canvas.height);
      gl.uniform1i(uLoc.u_form, toFormationIndex(st.formation));
      gl.uniform1i(uLoc.u_gsrc, toGradientSourceIndex(st.gradientSource));
      gl.uniform1i(uLoc.u_variant, st.variant || 0);
      gl.uniform3fv(uLoc.u_pal, p.flat);
      gl.uniform1i(uLoc.u_palN, p.count);

      gl.uniform1f(uLoc.u_density, st.glassDensity);
      gl.uniform1f(uLoc.u_strength, st.rippleStrength);
      gl.uniform1f(uLoc.u_blur, st.blur);
      gl.uniform1f(uLoc.u_vdist, st.vectorDistance);
      gl.uniform1f(uLoc.u_vsize, st.vectorSize);
      gl.uniform1f(uLoc.u_contrast, st.contrast);
      gl.uniform1f(uLoc.u_grain, st.grain);
      gl.uniform1f(uLoc.u_bw, st.bw ? 1.0 : 0.0);
      gl.uniform1f(uLoc.u_invert, st.invert ? 1.0 : 0.0);
      gl.uniform1f(uLoc.u_seed, Number(st.seed) || 0.12345);

      const now = performance.now() / 1000;
      const neutral = !!runtimeRef.current.neutral;
      const m = neutral
        ? { x:0.5, y:0.5, chaosX:0.5, chaosY:0.5 }
        : (mouseRef.current || { x:0.5, y:0.5, chaosX:0.5, chaosY:0.5 });
      gl.uniform1f(uLoc.u_time, now);
      gl.uniform2f(uLoc.u_mouse, Number(m.chaosX) || Number(m.x) || 0.5, 1.0 - (Number(m.chaosY) || Number(m.y) || 0.5));
      gl.uniform2f(uLoc.u_mouseRaw, Number(m.x) || 0.5, 1.0 - (Number(m.y) || 0.5));
      gl.uniform1f(uLoc.u_clickPulse, neutral ? 0 : (runtimeRef.current.pulse || 0));
      gl.uniform1f(uLoc.u_mouseActive, neutral ? 0.0 : 1.0);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    useEffect(function () {
      stateRef.current = tweaks;
      drawFrame();
    }, [tweaks]);

    useEffect(function () {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const glState = initGL(canvas);
      if (!glState) {
        console.error('[NURR abstract] WebGL unavailable or shader failed.');
        return;
      }

      glRef.current = glState;

      function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(window.innerWidth * dpr);
        canvas.height = Math.round(window.innerHeight * dpr);
        canvas.style.width = window.innerWidth + 'px';
        canvas.style.height = window.innerHeight + 'px';
        drawFrame();
      }

      resize();
      window.addEventListener('resize', resize);

      return function () {
        window.removeEventListener('resize', resize);
        const gs = glRef.current;
        if (gs) {
          try {
            gs.gl.deleteProgram(gs.prog);
            gs.gl.deleteBuffer(gs.buf);
          } catch (e) {}
        }
        glRef.current = null;
      };
    }, []);

    useEffect(function () {
      let raf;
      function tick() {
        runtimeRef.current.pulse *= 0.965;
        drawFrame();
        raf = requestAnimationFrame(tick);
      }
      raf = requestAnimationFrame(tick);
      return function () { cancelAnimationFrame(raf); };
    }, []);

    useEffect(function () {
      function isInterfaceEvent(e) {
        return !!(e.target && e.target.closest && e.target.closest('.panel,.icon-btn,.rail,.layout-card,.palette-card,.nature-thumb,.swatch,.color-wheel-card,.eyedropper-follow,button,input,.drop-zone'));
      }

      function onDown(e) {
        if (isInterfaceEvent(e)) return;
        if (runtimeRef.current.neutral) return;
        runtimeRef.current.pulse = 1.0;
      }

      function onDoubleClick(e) {
        if (isInterfaceEvent(e)) return;
        runtimeRef.current.neutral = !runtimeRef.current.neutral;
        runtimeRef.current.pulse = 0;
        drawFrame();
        e.preventDefault();
      }

      window.addEventListener('mousedown', onDown);
      window.addEventListener('dblclick', onDoubleClick);
      return function () {
        window.removeEventListener('mousedown', onDown);
        window.removeEventListener('dblclick', onDoubleClick);
      };
    }, []);

    useEffect(function () {
      registerSnapshot(function () {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ow = canvas.width;
        const oh = canvas.height;
        const osw = canvas.style.width;
        const osh = canvas.style.height;

        canvas.width = 3840;
        canvas.height = 2160;
        drawFrame();

        if (window.WP && WP.downloadCanvas) {
          WP.downloadCanvas(canvas, 'abstract-' + Date.now() + '.png');
        } else {
          const a = document.createElement('a');
          a.download = 'abstract-' + Date.now() + '.png';
          a.href = canvas.toDataURL('image/png');
          a.click();
        }

        requestAnimationFrame(function () {
          canvas.width = ow;
          canvas.height = oh;
          canvas.style.width = osw;
          canvas.style.height = osh;
          drawFrame();
        });
      });
    }, [registerSnapshot, tweaks]);

    return <canvas ref={canvasRef} className="stage abstract-stage" />;
  }

  function AbstractControls(props) {
    const tweaks = props.tweaks || {};
    const setTweaks = props.setTweaks || function(){};
    const st = getAbstractState(tweaks);
    const PaletteEditor = window.NurrPaletteEditor;

    const prevGlass = useRef(null);
    const prevRipple = useRef(null);

    useEffect(function () {
      if (prevGlass.current) drawPreview(prevGlass.current, 0, st.colors);
      if (prevRipple.current) drawPreview(prevRipple.current, 1, st.colors);
    }, [st.colors, st.gradientSource]);

    const pct = function (v) { return Math.round((v || 0) * 100); };
    const paneCount = Math.round(st.glassDensity * 12 + 2);

    function slider(key, label, valueLabel) {
      const value = st[key];
      return (
        <div className="section" key={key}>
          <div className="section-label">
            <span className="name">{label}</span>
            <span className="value">{valueLabel || pct(value)}</span>
          </div>
          <input
            type="range"
            className="slider"
            min="0"
            max="1"
            step="0.01"
            value={value}
            onChange={function (e) {
              const patch = {};
              patch[key] = parseFloat(e.target.value);
              setTweaks(patch);
            }}
          />
        </div>
      );
    }

    return (
      <React.Fragment>

        <div className="section">
          <div className="section-label">
            <span className="name">Formation</span>
            <span className="value">{st.formation}</span>
          </div>
          <div className="formation-grid" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
            <button
              className={'formation-card' + (st.formation === 'glass' ? ' active' : '')}
              onClick={function () { setTweaks({ formation: 'glass' }); }}
              title="Glass"
            >
              <canvas ref={prevGlass} className="formation-canvas" />
              <span className="formation-label">Glass</span>
            </button>
            <button
              className={'formation-card' + (st.formation === 'ripple' ? ' active' : '')}
              onClick={function () { setTweaks({ formation: 'ripple' }); }}
              title="Ripple"
            >
              <canvas ref={prevRipple} className="formation-canvas" />
              <span className="formation-label">Ripple</span>
            </button>
          </div>
        </div>

        <div className="section">
          <div className="section-label">
            <span className="name">Gradient source</span>
            <span className="value">{st.gradientSource}</span>
          </div>
          <div className="seg">
            <button
              className={'seg-opt' + (st.gradientSource === 'smooth' ? ' active' : '')}
              onClick={function () { setTweaks({ gradientSource: 'smooth' }); }}
            >Smooth</button>
            <button
              className={'seg-opt' + (st.gradientSource === 'blob' ? ' active' : '')}
              onClick={function () { setTweaks({ gradientSource: 'blob' }); }}
            >Blob</button>
          </div>
        </div>

        {PaletteEditor && (
          <PaletteEditor
            colors={st.colors}
            setColors={function (next) { setTweaks({ colors: next.slice(0, 8) }); }}
            minColors={2}
            maxColors={8}
            allowAdd={true}
            compact={true}
          />
        )}

        <div className="section">
          <div className="section-label">
            <span className="name">Gradient presets</span>
            <span className="value">8 styles</span>
          </div>
          <div className="palette-grid">
            {[
              ['#EAF0F2','#F04A2F','#2637D9','#2E2A4F','#F7FAFB'],
              ['#07104C','#FC6C3D','#98F2F4','#E38BB8','#05040A'],
              ['#F4EDE0','#BE1E2D','#1E33B8','#B9BCC9','#11121E'],
              ['#05040A','#08015F','#FC6C3D','#F4BE62','#98F2F4'],
              ['#0B0638','#FF2D72','#E38BB8','#98F2F4','#F2FDFF'],
              ['#05040A','#102B36','#77D7EA','#C9B7E8','#DDF7FA'],
              ['#08015F','#FC6C3D','#D9DC1B','#98F2F4','#F4EDE0'],
              ['#F4EDE0','#FC6C3D','#08015F','#98F2F4','#14142A']
            ].map(function(p,i) {
              return (
                <button
                  key={i}
                  className="palette-card"
                  title={'Gradient preset ' + (i + 1)}
                  onClick={function () { setTweaks({ colors: p, variant: i, seed: Math.random() }); }}
                >
                  {p.map(function(c,j){ return <span key={j} style={{background:c}} />; })}
                </button>
              );
            })}
          </div>
        </div>

        {slider('glassDensity', 'Glass density', paneCount + ' panes')}
        {slider('rippleStrength', 'Ripple strength')}
        {slider('blur', 'Blur')}
        {slider('vectorDistance', 'Background spread')}
        {slider('vectorSize', 'Background size')}
        {slider('contrast', 'Contrast')}
        {slider('grain', 'Grain')}

        <div className="section">
          <div className="toggle-row">
            <button
              className={'btn' + (st.bw ? ' active' : '')}
              onClick={function () { setTweaks({ bw: !st.bw }); }}
            >B&amp;W</button>
            <button
              className={'btn' + (st.invert ? ' active' : '')}
              onClick={function () { setTweaks({ invert: !st.invert }); }}
            >Invert</button>
          </div>
        </div>

        <div className="btn-row">
          <button
            className="btn btn-italic"
            onClick={function () { setTweaks({ seed: Math.random(), variant: Math.floor(Math.random() * 8), gradientSource: Math.random() > 0.5 ? 'blob' : 'smooth' }); }}
          >Randomize</button>
        </div>

      </React.Fragment>
    );
  }

  window.AbstractMode = AbstractMode;
  window.AbstractControls = AbstractControls;
  window.ABSTRACT_DEFAULTS = {
    formation: 'glass',
    gradientSource: 'blob',
    variant: 0,
    colors: ['#1a1a3e', '#3a1060', '#0e3a7a', '#601040', '#98F2F4'],
    glassDensity: 0.52,
    rippleStrength: 0.82,
    blur: 0.46,
    vectorDistance: 0.50,
    vectorSize: 0.50,
    contrast: 0.50,
    grain: 0.18,
    bw: false,
    invert: false,
    seed: Math.random()
  };

}());
