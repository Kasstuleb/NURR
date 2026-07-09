// geometric.js — FLOW module. Poster-backdrop art fields.
//
// Rebuilt as a WebGL module (same architecture as gradient.js) after the
// canvas-sprite approach failed the quality bar. Everything the four
// references do is a *field* phenomenon, so it is all computed per-pixel:
//
//   · gradient — forms with saturated hue ramps that melt into the paper
//     through colour, never through grey; one huge soft under-glow gives the
//     "still orb" poster light.
//   · flow     — a domain-warp slider: 0 keeps forms crisp and geometric,
//     1 melts the whole field into liquid silk (full-bleed backdrops).
//   · ripple   — concentric interference rings with per-channel chromatic
//     offset (iridescent capsule reference).
//   · thermal  — the field mapped through a palette-driven LUT *in shader*:
//     resolution-independent, perfectly smooth, optional crisp FLIR bands.
//   · particles— an exclusive material: the form is built from thousands of
//     tiny round/spherical printed particles riding a curl-noise wind; every dot has
//     its own tempo, so cursor movement shears the cloud in layered parallax.
//
// Interactions kept from the previous module: cursor lean (Cursor pull),
// drag a form to re-place it, click = freeze/unfreeze, double-click =
// lock/unlock the cursor point.
//
// Public contract unchanged — js/app.js can keep calling the same module:
//   window.GeometricMode / GeometricControls / GEOMETRIC_DEFAULTS
//   window.GEOMETRIC_COMPOSITIONS_LEN / NURR_GEOMETRIC_COMPOSITIONS
//   kept keys: compositionIdx, colors, mousePull, vectorDistance,
//   vectorScale, grain   (new: material, flow, ripple, glow, particles,
//   heatSteps)

const { useEffect: geomUE, useRef: geomUR, useState: geomUS } = React;

/* ─── Arrangements ────────────────────────────────────────────────────────────
   Forms live in unit space (0..1 of the short axis square, centred).
   type: 1 orb · 2 vertical capsule · 3 horizontal band · 4 full-bleed veil
         5 diagonal capsule · 6 soft block · 7 loop/ring
   Shape and render are separate: the same form can become gradient ink, mono ink,
   thermal/heat bands, or a particle-built body. Suggestions never switch
   render mode, so object and material no longer fight each other. */
const GEOMETRIC_COMPOSITIONS = [
  { name:'orb',          forms:[{type:1, x:0.50, y:0.37, r:0.23, ci:1}],
    suggest:{ flow:0.05, ripple:0.0, glow:0.88 } },
  { name:'reflection',   forms:[{type:1, x:0.50, y:0.34, r:0.22, ci:1},
                                {type:1, x:0.50, y:0.64, r:0.28, ci:2, ghost:1}],
    suggest:{ flow:0.08, ripple:0.0, glow:0.70 } },
  { name:'capsule',      forms:[{type:2, x:0.50, y:0.48, r:0.28, ci:1}],
    suggest:{ flow:0.07, ripple:0.32, glow:0.48 } },
  { name:'loop',         forms:[{type:7, x:0.50, y:0.48, r:0.31, ci:1}],
    suggest:{ flow:0.08, ripple:0.20, glow:0.35 } },
  { name:'tilt',         forms:[{type:5, x:0.50, y:0.48, r:0.31, ci:1}],
    suggest:{ flow:0.14, ripple:0.14, glow:0.52 } },
  { name:'horizon',      forms:[{type:1, x:0.50, y:1.02, r:0.54, ci:1}],
    suggest:{ flow:0.18, ripple:0.0, glow:0.72 } },
  { name:'band',         forms:[{type:3, x:0.50, y:0.52, r:0.18, ci:1}],
    suggest:{ flow:0.36, ripple:0.0, glow:0.42 } },
  { name:'block',        forms:[{type:6, x:0.50, y:0.50, r:0.30, ci:1}],
    suggest:{ flow:0.10, ripple:0.0, glow:0.36 } },
  { name:'veil',         forms:[{type:4, x:0.50, y:0.50, r:0.90, ci:1}],
    suggest:{ flow:0.72, ripple:0.0, glow:0.22 } },
];
window.GEOMETRIC_COMPOSITIONS_LEN = GEOMETRIC_COMPOSITIONS.length;
window.NURR_GEOMETRIC_COMPOSITIONS = GEOMETRIC_COMPOSITIONS;

const GEO_MATERIALS = [
  ['gradient',  'Gradient'],
  ['mono',      'Mono'],
  ['thermal',   'Thermal'],
  ['particles', 'Particles'],
];

/* ─── colour utils ───────────────────────────────────────────────────────── */
function geoHexRgb01(hex) {
  const h = String(hex || '#ffffff').replace('#','').trim();
  const v = h.length === 3 ? h.split('').map(c=>c+c).join('') : h.padEnd(6,'f').slice(0,6);
  const n = parseInt(v,16);
  return [((n>>16)&255)/255, ((n>>8)&255)/255, (n&255)/255];
}
function geoLum(hex){ const c=geoHexRgb01(hex); return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]; }

/* ─── field fragment shader ──────────────────────────────────────────────── */
const FLOW_FS = `
precision highp float;
varying vec2 v_uv;
uniform vec2  u_resolution;
uniform float u_time;
uniform vec2  u_mouse;        // 0..1, top-left origin
uniform float u_pulse;
uniform float u_flow;
uniform float u_ripple;
uniform float u_glow;
uniform float u_grain;
uniform float u_blur;
uniform float u_pull;
uniform int   u_bw;
uniform int   u_invert;
uniform int   u_blendMode;     // 0 normal · 1 screen · 2 multiply · 3 silhouette
uniform float u_seed;
uniform int   u_material;     // 0 gradient · 1 mono · 2 thermal · 3 particles
uniform float u_heatSteps;
uniform int   u_transparent;
uniform vec4  u_form0;        // x, y, r, type (0 = off)
uniform vec4  u_form1;
uniform vec4  u_form2;
uniform int   u_formCi0;
uniform int   u_formCi1;
uniform int   u_formCi2;
uniform vec3  u_bg;
uniform vec3  u_bg2;
uniform int   u_bgGrad;
uniform int   u_inkCount;
uniform vec3  u_ink0;
uniform vec3  u_ink1;
uniform vec3  u_ink2;
uniform vec3  u_ink3;
uniform vec3  u_lut0;         // thermal stops, cold → hot
uniform vec3  u_lut1;
uniform vec3  u_lut2;
uniform vec3  u_lut3;
uniform vec3  u_lut4;

// fract-based hash — no sine, stable at high pixel coordinates on mobile GPUs
float hash21(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float nymphFilmGrain(vec2 fragCoord, float seed, float amount, float lum){
  float amt = clamp(amount, 0.0, 1.0);
  if (amt <= 0.0001) return 0.0;

  // Non-linear response: the low end stays polite, the upper end finally has bite.
  float strength = pow(amt, 0.72);

  // Resolution-independent grain. Lock the grain cell to a fixed count across
  // the SHORT edge, so the tooth reads identically in the live preview and in
  // every export size / aspect ratio. Previously grain was floor(fragCoord) —
  // one cell per device pixel — which made it vanish at 2K and change size
  // between aspect ratios.
  float grainPx = 900.0 / max(min(u_resolution.x, u_resolution.y), 1.0);
  vec2 px = floor(fragCoord * grainPx);

  // Two independent fine layers.
  float a = hash21(px + vec2(seed * 197.13 + 11.7, seed * 43.73 + 5.1));
  float b = hash21(px * 1.37 + vec2(71.0 + seed * 51.7, 613.3 + seed * 23.1));
  float fine = a + b - 1.0;
  fine = sign(fine) * pow(abs(fine), 0.82);

  // Sparse salt / pepper gives the surface grit instead of smooth digital haze.
  float saltR   = hash21(px * 2.11 + vec2(seed * 911.7 + 17.0, 29.0));
  float pepperR = hash21(px * 0.73 + vec2(seed * 421.9 + 109.0, 349.0));
  float salt    = step(0.992 - strength * 0.045, saltR);
  float pepper  = step(0.994 - strength * 0.038, pepperR);
  float speck   = salt * 0.85 - pepper * 0.75;

  // Protect highlights from dirty grey while letting mids/darks carry texture.
  float tonal = mix(0.78, 1.12, smoothstep(0.04, 0.62, lum));
  tonal *= mix(1.0, 0.58, smoothstep(0.82, 1.0, lum));

  return (fine * 0.115 + speck * 0.105) * strength * tonal;
}

float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  // Quintic fade removes the slow-field square lattice that looked like a boxy mesh.
  f = f*f*f*(f*(f*6.0-15.0)+10.0);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++){ v += vnoise(p) * a; p = rot * p * 2.03; a *= 0.52; }
  return v;
}
// lighter 3-octave variant for the domain warp (detail comes from layering)
float fbm3(vec2 p){
  float v = 0.0, a = 0.55;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 3; i++){ v += vnoise(p) * a; p = rot * p * 2.03; a *= 0.5; }
  return v;
}

vec3 inkAt(int i){
  if (i <= 0) return u_ink0;
  if (i == 1) return u_ink1;
  if (i == 2) return u_ink2;
  return u_ink3;
}
// smooth multi-stop palette ramp across the active inks
vec3 paletteRamp(float t){
  t = clamp(t, 0.0, 1.0);
  float n = float(u_inkCount) - 1.0;
  if (n < 0.5) return u_ink0;
  float f = t * n;
  float k = floor(min(f, n - 0.001));
  float u = smoothstep(0.0, 1.0, f - k);
  vec3 A = inkAt(int(k));
  vec3 B = inkAt(int(k) + 1);
  return mix(A, B, u);
}
vec3 thermalLUT(float v){
  v = clamp(v, 0.0, 1.0);
  if (u_heatSteps >= 2.0) v = floor(v * u_heatSteps) / (u_heatSteps - 1.0);
  v = clamp(v, 0.0, 1.0);
  float f = v * 4.0;
  if (f < 1.0) return mix(u_lut0, u_lut1, smoothstep(0.0, 1.0, f));
  if (f < 2.0) return mix(u_lut1, u_lut2, smoothstep(0.0, 1.0, f - 1.0));
  if (f < 3.0) return mix(u_lut2, u_lut3, smoothstep(0.0, 1.0, f - 2.0));
  return mix(u_lut3, u_lut4, smoothstep(0.0, 1.0, f - 3.0));
}
vec3 blendOverBg(vec3 bg, vec3 fg){
  if (u_blendMode == 1) return 1.0 - (1.0 - bg) * (1.0 - fg);         // Screen
  if (u_blendMode == 2) return bg * fg;                                // Multiply
  if (u_blendMode == 3) {                                              // Silhouette: crisp black/white body
    float ybg = dot(bg, vec3(0.2126, 0.7152, 0.0722));
    return ybg > 0.56 ? vec3(0.08) : vec3(0.96);
  }
  return fg;
}
vec3 flowFilters(vec3 col){
  if (u_invert == 1) col = vec3(1.0) - col;
  if (u_bw == 1){
    float y = dot(col, vec3(0.2126, 0.7152, 0.0722));
    y = clamp(0.5 + (y - 0.5) * 1.12, 0.0, 1.0);
    col = vec3(mix(0.08, 0.94, y));
  }
  return col;
}

// signed distance of one form (unit space, y down)
float capsuleSDF(vec2 c, vec2 b){
  vec2 q = abs(c) - b;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}
float softBoxSDF(vec2 c, vec2 b, float r){
  vec2 q = abs(c) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float formSD(vec4 F, vec2 p){
  float ty = F.w;
  vec2 c = p - F.xy;
  if (ty < 1.5) return length(c) - F.z;                       // orb / blob
  if (ty < 2.5) return capsuleSDF(c, vec2(F.z * 0.52, F.z * 0.85)); // vertical capsule
  if (ty < 3.5) return abs(c.y) - F.z * 0.5;                  // horizontal band
  if (ty < 4.5) return -0.35;                                 // full-bleed veil
  if (ty < 5.5) {                                             // diagonal capsule
    float a = -0.58;
    mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
    vec2 q = rot * c;
    return capsuleSDF(q, vec2(F.z * 0.95, F.z * 0.28));
  }
  if (ty < 6.5) return softBoxSDF(c, vec2(F.z * 0.82, F.z * 0.58), F.z * 0.18); // soft block

  // loop / ring: an elliptical torus with a real cut-out, not a filled blob.
  vec2 q = c / vec2(0.78, 1.08);
  return abs(length(q) - F.z * 0.92) - F.z * 0.17;
}

void main(){
  vec2 res = u_resolution;
  float minAxis = min(res.x, res.y);
  // portrait-fair: normalise by the SHORT axis so forms stay round anywhere
  vec2 p = (v_uv * res - 0.5 * res) / minAxis + 0.5;
  vec2 mp = (u_mouse * res - 0.5 * res) / minAxis + 0.5;

  float t = u_time;

  // ── liquid domain warp: flow melts the coordinate system itself ────────
  float fl = clamp(u_flow, 0.0, 1.0);
  vec2 q = vec2(
    fbm3(p * 1.9 + vec2(u_seed * 7.0,  t * 0.030)),
    fbm3(p * 1.9 + vec2(3.7 - u_seed,  -t * 0.024)));
  vec2 r2 = vec2(0.5);
  if (fl > 0.02) {
    r2 = vec2(
      fbm3(p * 2.6 + q * 2.2 + vec2(1.7, 9.2)),
      fbm3(p * 2.6 + q * 2.2 + vec2(8.3, 2.8)));
  }
  // cursor drags the silk locally
  vec2 toM = p - mp;
  float mFall = exp(-dot(toM, toM) * 5.5);
  vec2 warp = (q - 0.5) * (fl * 0.55) + (r2 - 0.5) * (fl * 0.45)
            - toM * mFall * (u_pull * 0.10 * fl);
  vec2 pw = p + warp;

  // ── forms → intensity field + hue coordinate ───────────────────────────
  float I = 0.0;        // 0..1+ energy
  float hueT = 0.0;     // palette coordinate accumulated by dominant form
  float wSum = 1e-4;
  float dMin = 10.0;
  // one shared silk sample feeds both hue perturbation and the sheen ridge
  float silk = fbm(pw * 2.2 + q * 1.6 + u_seed * 4.7);
  bool fullBleed = (u_form0.w > 3.5 && u_form0.w < 4.5);

  for (int i = 0; i < 3; i++){
    vec4 F = i == 0 ? u_form0 : (i == 1 ? u_form1 : u_form2);
    if (F.w < 0.5) continue;
    int ci = i == 0 ? u_formCi0 : (i == 1 ? u_formCi1 : u_formCi2);

    float d = formSD(F, pw);
    dMin = min(dMin, d);

    float edge = mix(0.010, 0.16, fl * 0.5 + 0.15) + u_blur * 0.22; // blur softens the geometry without using glow
    float body = 1.0 - smoothstep(-edge, edge, d);

    // interference ripples around the form (iridescent capsule)
    if (u_ripple > 0.003){
      float rings = 0.5 + 0.5 * cos(d * 110.0 - t * 1.1 + u_pulse * 6.0);
      float band = exp(-max(d, 0.0) * 9.0);                 // only near the edge
      body += u_ripple * rings * band * 0.85 * (1.0 - body);
    }

    // hue inside the form: colour ci at the top, melting toward the next ink
    // at the base, silk perturbation on top — predictable and paintable
    float ramp = clamp((F.y + F.z - pw.y) / max(F.z * 2.0, 0.001), 0.0, 1.0);
    float span = 1.0 / max(float(u_inkCount - 1), 1.0);
    float local = clamp(float(ci - 1) * span
                + (1.0 - ramp) * span * 1.15
                + (silk - 0.5) * (0.22 + fl * 0.55), 0.0, 1.0);

    float w = body + exp(-max(d, 0.0) * 5.0) * 0.25;
    hueT += local * w;
    wSum += w;
    I = max(I, body);

    // the big soft poster light: under-glow pooled below the form
    if (u_glow > 0.003){
      vec2 g = pw - (F.xy + vec2(0.0, F.z * 1.15));
      g.y *= 0.62;                                          // squashed ellipse
      float halo = exp(-dot(g, g) / (F.z * F.z * 1.9 + 0.02));
      I = max(I, halo * u_glow * 0.85);
      hueT += clamp(float(ci) * span + 0.18, 0.0, 1.0) * halo * u_glow;
      wSum += halo * u_glow;
    }
  }
  hueT /= wSum;

  // full-bleed fields draw their hue from the warp itself
  if (fullBleed){
    hueT = clamp(fbm(pw * 1.5 + r2 * 1.3 + u_seed * 3.0) * 1.9 - 0.45, 0.0, 1.0);
    I = max(I, 0.85);
  }

  // click pulse: one travelling ring from the cursor
  if (u_pulse > 0.01){
    float pd = length(p - mp);
    I += u_pulse * 0.35 * exp(-abs(pd - (1.0 - u_pulse) * 0.8) * 22.0);
  }

  // ── background: either flat swatch or shuffled poster gradient ────────
  float bgT = smoothstep(-0.18, 1.18, p.y + (fbm(p * 1.35 + u_seed * 3.1) - 0.5) * 0.22);
  bgT = mix(bgT, smoothstep(0.0, 1.0, length(p - vec2(0.50, 0.42)) * 1.35), 0.45);
  vec3 bgCol = (u_bgGrad == 1) ? mix(u_bg, u_bg2, clamp(bgT, 0.0, 1.0)) : u_bg;

  // ── material colouring ─────────────────────────────────────────────────
  vec3 col;
  float alpha = 1.0;
  float Ic = clamp(I, 0.0, 1.0);

  if (u_material == 2){                       // THERMAL — smooth in-shader LUT
    // Background remains the chosen background colour; heat only renders inside
    // the selected form, so thermal is now editable like every other render.
    float v = clamp((fullBleed ? hueT : I) * 0.92 + (silk - 0.5) * 0.10 * fl, 0.0, 1.0);
    float heatA = fullBleed ? 1.0 : smoothstep(max(0.0, 0.018 - u_blur * 0.012), 0.34 + u_blur * 0.42, I);
    col = mix(bgCol, blendOverBg(bgCol, thermalLUT(v)), heatA);
    alpha = u_transparent == 1 ? heatA : 1.0;
  } else if (u_material == 1){                // MONO — single-ink print of the forms
    float mI = fullBleed ? clamp(hueT * 1.15 - 0.05, 0.0, 1.0) : Ic;
    // Riso-like body: flats still breathe, but the material stays clearly mono.
    mI *= 0.86 + 0.14 * silk;
    col = mix(bgCol, blendOverBg(bgCol, u_ink0), mI);
    col += (hash21(v_uv * u_resolution * 0.5) - 0.5) * 0.035 * mI;
    alpha = u_transparent == 1 ? mI : 1.0;
  } else if (u_material == 3){                // PARTICLES — paper stage, dots draw the form
    col = bgCol;
    alpha = u_transparent == 1 ? 0.0 : 1.0;
  } else {                                    // GRADIENT
    vec3 formCol = paletteRamp(hueT);
    // silk sheen: cream highlight along the ridge lines of the warp
    float ridge = pow(1.0 - abs(2.0 * silk - 1.0), 3.0);
    formCol = mix(formCol, vec3(0.985, 0.965, 0.93), ridge * (0.10 + fl * 0.30) * Ic);
    // luminous core lift
    formCol += vec3(0.06) * pow(Ic, 3.0);
    col = mix(bgCol, blendOverBg(bgCol, formCol), Ic);
    // chromatic edge fringe when rippling (per-channel offset)
    if (u_ripple > 0.003 && dMin < 0.25){
      float fr = u_ripple * 0.05 * exp(-abs(dMin) * 10.0);
      col.r += fr * cos(dMin * 130.0);
      col.b += fr * cos(dMin * 130.0 + 2.1);
    }
    alpha = u_transparent == 1 ? Ic : 1.0;
  }

  // high-quality film grain — pixel-scale, monochrome, contrast-aware.
  // Stronger at the upper end, with sparse salt/pepper grit instead of a boxy mesh.
  col = flowFilters(col);
  float lumG = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col += vec3(nymphFilmGrain(gl_FragCoord.xy, u_seed, u_grain, lumG));

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), alpha);
}
`;

/* ─── particle programs ──────────────────────────────────────────────────── */
const PART_VS = `
attribute vec2 a_pos;      // unit space
attribute vec2 a_prop;     // size(px@1x), alpha
uniform vec2 u_resolution;
uniform float u_dpr;
varying float v_alpha;
void main(){
  float minAxis = min(u_resolution.x, u_resolution.y);
  vec2 px = (a_pos - 0.5) * minAxis + 0.5 * u_resolution;
  vec2 ndc = px / u_resolution * 2.0 - 1.0;
  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
  gl_PointSize = a_prop.x * u_dpr;
  v_alpha = a_prop.y;
}
`;
const PART_FS = `
precision highp float;
uniform vec3 u_inkA;
uniform vec3 u_inkB;
uniform float u_softness;
uniform float u_grain;
uniform int u_bw;
uniform int u_invert;
uniform int u_blendMode;
uniform vec3 u_bg;
varying float v_alpha;
float phash(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 partBlend(vec3 bg, vec3 fg){
  if (u_blendMode == 1) return 1.0 - (1.0 - bg) * (1.0 - fg);
  if (u_blendMode == 2) return bg * fg;
  if (u_blendMode == 3) {
    float ybg = dot(bg, vec3(0.2126, 0.7152, 0.0722));
    return ybg > 0.56 ? vec3(0.08) : vec3(0.96);
  }
  return fg;
}
vec3 partFilters(vec3 col){
  if (u_invert == 1) col = vec3(1.0) - col;
  if (u_bw == 1){
    float y = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = vec3(mix(0.08, 0.94, clamp(0.5 + (y - 0.5) * 1.12, 0.0, 1.0)));
  }
  return col;
}
void main(){
  // Round printed particles / soft micro-spheres — never square point blocks.
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c);
  float core = 1.0 - smoothstep(0.34, 0.50, r);
  float soft = 1.0 - smoothstep(mix(0.47, 0.15, clamp(u_softness, 0.0, 1.0)), 0.50, r);
  float a = mix(core, soft, clamp(u_softness, 0.0, 1.0)) * v_alpha;
  if (a < 0.01) discard;
  float sphere = 1.0 - smoothstep(0.03, 0.50, r) * 0.30 + (0.5 - c.y) * 0.10;
  vec2 px = floor(gl_FragCoord.xy);
  float toothA = phash(px);
  float toothB = phash(px * 1.37 + 29.1);
  float tooth = (toothA + toothB - 1.0);
  float strength = pow(clamp(u_grain, 0.0, 1.0), 0.72);
  float salt = step(0.992 - strength * 0.045, phash(px * 2.11 + 17.0));
  float pepper = step(0.994 - strength * 0.038, phash(px * 0.73 + 109.0));
  float speck = salt * 0.85 - pepper * 0.75;
  a *= clamp(1.0 + tooth * strength * 0.42, 0.48, 1.26);
  vec3 col = mix(u_inkA, u_inkB, v_alpha * 0.80) * sphere;
  col = partBlend(u_bg, col);
  col = partFilters(col);
  col += tooth * strength * 0.070 + speck * strength * 0.085;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), a);
}
`;

/* JS-side value noise for the particle wind (curl of fbm) */
function jsHash(x, y){ const s = Math.sin(x*127.1 + y*311.7) * 43758.5453; return s - Math.floor(s); }
function jsNoise(x, y){
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x-ix, fy = y-iy;
  const ux = fx*fx*fx*(fx*(fx*6-15)+10), uy = fy*fy*fy*(fy*(fy*6-15)+10);
  const a = jsHash(ix,iy), b = jsHash(ix+1,iy), c = jsHash(ix,iy+1), d = jsHash(ix+1,iy+1);
  return a + (b-a)*ux + (c-a)*uy + (a-b-c+d)*ux*uy;
}
function jsFbm(x, y){ return jsNoise(x,y)*0.6 + jsNoise(x*2.1+5.2, y*2.1+1.3)*0.4; }
function jsCurl(x, y, t){
  const e = 0.02;
  const n1 = jsFbm(x, y+e + t), n2 = jsFbm(x, y-e + t);
  const n3 = jsFbm(x+e + t, y), n4 = jsFbm(x-e + t, y);
  return [ (n1-n2)/(2*e), -(n3-n4)/(2*e) ];
}

/* ─── GL init (mirrors gradient.js: single triangle + context-loss safe) ─── */
const FLOW_VS = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main(){ v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5); gl_Position = vec4(a_pos, 0.0, 1.0); }
`;
function initFlowGL(canvas) {
  const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false });
  if (!gl) return null;
  const field = WP.compileProgram(gl, FLOW_VS, FLOW_FS);
  const parts = WP.compileProgram(gl, PART_VS, PART_FS);

  const triBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, triBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);

  const partBuf = gl.createBuffer();

  gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.SCISSOR_TEST);
  return { gl, field, parts, triBuf, partBuf,
    fieldPos: gl.getAttribLocation(field, 'a_pos'),
    partPos: gl.getAttribLocation(parts, 'a_pos'),
    partProp: gl.getAttribLocation(parts, 'a_prop') };
}


// Static offscreen renderer used by the Export Panel after FLOW is no longer
// the active mounted module. The live component renderer is still preferred
// while FLOW is open; this fallback prevents saved FLOW snaps from being
// exported as whatever the current module happens to be, or from being cropped
// out of a low-res thumbnail.
function renderGeometricStaticToDataURL(moduleTweaks, renderState, width, height, extra = {}) {
  if (!moduleTweaks) return null;
  const material = moduleTweaks.material || 'gradient';
  // Particle export needs the live particle simulation state. If FLOW is not
  // mounted, fall back to the saved bitmap rather than generating a false cloud.
  if (material === 'particles') return null;

  const w = Math.max(1, Math.round(width) || 1920);
  const h = Math.max(1, Math.round(height) || 1080);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const R = initFlowGL(canvas);
  if (!R) return null;

  const { gl, field } = R;
  const T = moduleTweaks || {};
  const palette = (T.colors && T.colors.length >= 2) ? T.colors : ['#CBD2D4', '#FF4D00', '#FF2E9A'];
  const cIdx = (T.compositionIdx ?? 0) % GEOMETRIC_COMPOSITIONS.length;
  const comp = GEOMETRIC_COMPOSITIONS[cIdx];
  const spread = T.vectorDistance ?? 1;
  const scale = T.vectorScale ?? 1;
  const rs = renderState || {};
  const mouseRaw = rs.mouse || { x:0.5, y:0.5, chaosX:0.5, chaosY:0.5 };
  const mouse = { x: mouseRaw.chaosX ?? mouseRaw.x ?? 0.5, y: mouseRaw.chaosY ?? mouseRaw.y ?? 0.5 };
  const t = Number.isFinite(rs.t) ? rs.t : (Number.isFinite(rs.time) ? rs.time : 0);
  const liveForms = Array.isArray(rs.liveForms) && rs.liveForms.length
    ? rs.liveForms
    : comp.forms.map(f => ({
        x: 0.5 + (f.x - 0.5) * spread,
        y: 0.5 + (f.y - 0.5) * spread,
        r: f.r * scale
      }));

  gl.viewport(0, 0, w, h);
  gl.useProgram(field);
  gl.disable(gl.BLEND);
  gl.bindBuffer(gl.ARRAY_BUFFER, R.triBuf);
  gl.enableVertexAttribArray(R.fieldPos);
  gl.vertexAttribPointer(R.fieldPos, 2, gl.FLOAT, false, 0, 0);
  [R.partPos, R.partProp].forEach(loc => { if (loc >= 0 && loc !== R.fieldPos) gl.disableVertexAttribArray(loc); });

  const u = (n) => gl.getUniformLocation(field, n);
  gl.uniform2f(u('u_resolution'), w, h);
  gl.uniform1f(u('u_time'), t);
  gl.uniform2f(u('u_mouse'), mouse.x, mouse.y);
  gl.uniform1f(u('u_pulse'), rs.pulse || 0);
  gl.uniform1f(u('u_flow'), T.flow ?? 0.2);
  gl.uniform1f(u('u_ripple'), T.ripple ?? 0);
  gl.uniform1f(u('u_glow'), T.glow ?? 0.6);
  gl.uniform1f(u('u_grain'), T.grain ?? 0.10);
  gl.uniform1f(u('u_blur'), T.blur ?? 0);
  gl.uniform1f(u('u_pull'), T.mousePull ?? 0.85);
  gl.uniform1i(u('u_bw'), T.bw ? 1 : 0);
  gl.uniform1i(u('u_invert'), T.invert ? 1 : 0);
  const blendMap = { normal:0, screen:1, multiply:2, silhouette:3, difference:1, exclusion:2, hardmix:3 };
  gl.uniform1i(u('u_blendMode'), blendMap[T.blendMode || 'normal'] ?? 0);
  gl.uniform1f(u('u_seed'), 0.413 + cIdx * 0.173);
  const matMap = { gradient:0, mono:1, thermal:2, particles:3 };
  gl.uniform1i(u('u_material'), matMap[material] ?? 0);
  gl.uniform1f(u('u_heatSteps'), T.heatSteps ?? 0);
  gl.uniform1i(u('u_transparent'), extra.transparent ? 1 : 0);

  for (let i = 0; i < 3; i++) {
    const f = comp.forms[i];
    const L = liveForms[i];
    if (f && L) {
      gl.uniform4f(u(`u_form${i}`), L.x, L.y, L.r, f.type);
      gl.uniform1i(u(`u_formCi${i}`), f.ci);
    } else {
      gl.uniform4f(u(`u_form${i}`), 0, 0, 0, 0);
      gl.uniform1i(u(`u_formCi${i}`), 1);
    }
  }

  const bg = geoHexRgb01(T.backdropA || palette[0]);
  const bg2 = geoHexRgb01(T.backdropB || palette[1] || palette[0]);
  gl.uniform3f(u('u_bg'), bg[0], bg[1], bg[2]);
  gl.uniform3f(u('u_bg2'), bg2[0], bg2[1], bg2[2]);
  gl.uniform1i(u('u_bgGrad'), T.backdropGradient ? 1 : 0);
  const inks = palette.slice(1);
  gl.uniform1i(u('u_inkCount'), Math.min(4, Math.max(1, inks.length)));
  for (let i = 0; i < 4; i++) {
    const c = geoHexRgb01(inks[Math.min(i, inks.length - 1)] || '#FF4D00');
    gl.uniform3f(u(`u_ink${i}`), c[0], c[1], c[2]);
  }
  const sorted = [...inks].sort((a,b)=>geoLum(a)-geoLum(b)).map(geoHexRgb01);
  const cold = (sorted[0]||[0.1,0.2,0.5]).map(v=>v*0.14);
  const hi = sorted[sorted.length-1]||[1,0.9,0.8];
  const hot = hi.map(v=>v+(1-v)*0.8);
  const lutStops = [cold, sorted[0]||cold, sorted[Math.floor((sorted.length-1)/2)]||sorted[0]||cold, sorted[sorted.length-1]||hot, hot];
  lutStops.forEach((stop,i)=>gl.uniform3f(u(`u_lut${i}`), stop[0], stop[1], stop[2]));

  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.flush();
  const dataUrl = canvas.toDataURL('image/png');
  try { const loseCtx = gl.getExtension('WEBGL_lose_context'); if (loseCtx) loseCtx.loseContext(); } catch (e) {}
  return dataUrl;
}
window.NurrGeometricRenderStaticToDataURL = renderGeometricStaticToDataURL;

/* ─── GeometricMode ──────────────────────────────────────────────────────── */
function GeometricMode({ tweaks, registerSnapshot, mouseRef }) {
  const canvasRef = geomUR(null);
  const glRef = geomUR(null);
  WP.useStageSize(canvasRef);
  const stateRef = geomUR({
    pulse: 0,
    frozen: false, frozenMouse: null, frozenTime: null,
    mouseLocked: false, lockedMouse: null, clickTimer: null, suppressClick: false,
    anchorOverrides: {},                    // { compIdx: { formIdx: {x,y} } }
    live: { idx: -1, forms: [] },           // eased positions
    drag: null,
    smooth: { x: 0.5, y: 0.5 },
    particles: { key: '', n: 0, rel: null, data: null, off: null, tempo: null, baseSize: null, baseAlpha: null },
    exportHold: null,
  });

  geomUE(() => {
    const canvas = canvasRef.current;
    const res = initFlowGL(canvas);
    if (res) glRef.current = res;
    const onLost = (e) => e.preventDefault();
    const onRestored = () => { const r = initFlowGL(canvas); if (r) glRef.current = r; };
    canvas.addEventListener('webglcontextlost', onLost, false);
    canvas.addEventListener('webglcontextrestored', onRestored, false);
    const onVis = () => { if (!document.hidden && canvasRef.current) drawAt(canvasRef.current.width, canvasRef.current.height, false, 0); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      canvas.removeEventListener('webglcontextlost', onLost, false);
      canvas.removeEventListener('webglcontextrestored', onRestored, false);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  // Explicit escape hatch for the UI: return to cursor-driven/freeflow behaviour.
  // This is more reliable than asking users to remember the click/double-click state.
  geomUE(() => {
    if (tweaks.freeflowResetToken == null) return;
    const st = stateRef.current;
    if (st.clickTimer) { clearTimeout(st.clickTimer); st.clickTimer = null; }
    st.frozen = false;
    st.frozenMouse = null;
    st.frozenTime = null;
    st.mouseLocked = false;
    st.lockedMouse = null;
    st.suppressClick = false;
    st.drag = null;
    st.pulse = 0;
    st.anchorOverrides = {};
    st.live = { idx: -1, forms: [] };
    st.particles = { key: '', n: 0, rel: null, data: null, off: null, tempo: null, baseSize: null, baseAlpha: null };
  }, [tweaks.freeflowResetToken]);

  /* ── pointer interactions (freeze / lock / drag) ────────────────────────── */
  geomUE(() => {
    const isUI = (e) => !!(e.target && e.target.closest && e.target.closest('.panel,.icon-btn,.rail,.geo-shape-card,.geo-render-chip,.layout-card,.palette-card,.nature-thumb,.swatch,.color-wheel-card,.eyedropper-follow,button,input,select,textarea,label,.drop-zone,.nymph-landing,.nm-sheet,.nm-dock,.nm-top'));
    const readPt = (e) => {
      const canvas = canvasRef.current; if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return null;
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      const live = mouseRef.current || { x, y, chaosX: x, chaosY: y };
      return { x, y, chaosX: live.chaosX ?? x, chaosY: live.chaosY ?? y };
    };
    const toUnit = (pt) => {
      const c = canvasRef.current; if (!c) return pt;
      const minA = Math.min(c.width, c.height);
      return { x: (pt.x*c.width - 0.5*c.width)/minA + 0.5, y: (pt.y*c.height - 0.5*c.height)/minA + 0.5 };
    };
    const hit = (pt) => {
      const st = stateRef.current, u = toUnit(pt);
      let best = -1, bd = 1e9;
      st.live.forms.forEach((L, i) => {
        const d = Math.hypot(L.x - u.x, L.y - u.y);
        if (d < Math.max(0.12, L.r*1.2) && d < bd) { bd = d; best = i; }
      });
      return best;
    };
    const onDown = (e) => { if (isUI(e)) return; const pt = readPt(e); if (!pt) return;
      const i = hit(pt);
      if (i >= 0) {
        const st = stateRef.current;
        const u = toUnit(pt);
        const L = st.live.forms[i] || { x:u.x, y:u.y };
        // Dragging means: grab the form exactly where the cursor touches it.
        // The old version placed the centre under the cursor, which made vertical
        // movement feel inverted/floaty when Cursor pull was high.
        st.frozen = false; st.frozenMouse = null; st.frozenTime = null;
        st.mouseLocked = false; st.lockedMouse = null;
        st.drag = { i, moved: false, offX: L.x - u.x, offY: L.y - u.y };
      }
    };
    const onMove = (e) => {
      const st = stateRef.current; if (!st.drag) return;
      const pt = readPt(e); if (!pt) return;
      const u = toUnit(pt);
      st.drag.moved = true;
      const ci = st.live.idx;
      (st.anchorOverrides[ci] = st.anchorOverrides[ci] || {})[st.drag.i] =
        { x: Math.max(-0.25, Math.min(1.25, u.x + (st.drag.offX || 0))),
          y: Math.max(-0.25, Math.min(1.25, u.y + (st.drag.offY || 0))) };
    };
    const onUp = () => { const st = stateRef.current;
      if (st.drag && st.drag.moved) st.suppressClick = true; st.drag = null; };
    const onClick = (e) => {
      if (isUI(e)) return;
      const st = stateRef.current;
      if (st.suppressClick) { st.suppressClick = false; return; }
      const pt = readPt(e); if (!pt) return;
      // Single click is only a pulse. It no longer traps the module in a frozen state.
      st.pulse = 1.0;
    };
    const onDbl = (e) => {
      if (isUI(e)) return;
      const pt = readPt(e); if (!pt) return;
      const st = stateRef.current;
      if (st.clickTimer) { clearTimeout(st.clickTimer); st.clickTimer = null; }
      // Double-click = full freeze. Double-click again = freeflow.
      st.frozen = !st.frozen;
      if (st.frozen) { st.frozenMouse = pt; st.frozenTime = performance.now()/1000; }
      else { st.frozenMouse = null; st.frozenTime = null; }
      st.mouseLocked = false; st.lockedMouse = null;
      st.pulse = 0;
      e.preventDefault();
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('click', onClick, true);
    window.addEventListener('dblclick', onDbl, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('dblclick', onDbl, true);
      if (stateRef.current.clickTimer) clearTimeout(stateRef.current.clickTimer);
    };
  }, []);

  /* ── shared per-frame state ─────────────────────────────────────────────── */
  const readFrame = (opts = {}) => {
    const st = stateRef.current;
    const T = opts.tweaksOverride || tweaks;
    const palette = (T.colors && T.colors.length >= 2) ? T.colors : ['#CBD2D4', '#FF4D00', '#FF2E9A'];
    const cIdx = (T.compositionIdx ?? 0) % GEOMETRIC_COMPOSITIONS.length;
    const comp = GEOMETRIC_COMPOSITIONS[cIdx];
    if (st.live.idx !== cIdx || st.live.forms.length !== comp.forms.length) {
      st.live = { idx: cIdx, forms: comp.forms.map(f => ({ x: f.x, y: f.y, r: f.r })) };
    }
    const rs = opts.renderStateOverride || null;
    const m = rs && rs.mouse ? rs.mouse
      : (st.frozen && st.frozenMouse ? st.frozenMouse
      : (st.mouseLocked && st.lockedMouse ? st.lockedMouse
      : (mouseRef.current || { x:0.5, y:0.5, chaosX:0.5, chaosY:0.5 })));
    const t = rs && Number.isFinite(rs.t) ? rs.t
      : (st.frozen && st.frozenTime ? st.frozenTime : (window.__NURR_T ?? performance.now()/1000));
    return { st, palette, cIdx, comp, t,
      mouse: { x: m.chaosX ?? m.x, y: m.chaosY ?? m.y },
      spread: T.vectorDistance ?? 1,
      scale: T.vectorScale ?? 1,
      pull: T.mousePull ?? 0.85,
      flow: T.flow ?? 0.2,
      ripple: T.ripple ?? 0,
      glow: T.glow ?? 0.6,
      // Density is a clean 0..1.6 design control. Legacy values above this are
      // clamped so old snapshots do not explode into 160k live points.
      particlesAmt: Math.max(0.03, Math.min(1.6, T.particles ?? 0.55)),
      // Dot size is a direct scale: 0.35 = tiny film dots, 3.2 = visible spheres.
      particleSize: T.particleSize ?? 0.70,
      particleLoose: T.particleLoose ?? 0.12,
      blur: T.blur ?? 0,
      material: T.material || 'gradient',
      heatSteps: T.heatSteps ?? 0,
      grain: T.grain ?? 0.10,
      bw: !!T.bw,
      invert: !!T.invert,
      blendMode: T.blendMode || 'normal',
      exportQuality: !!opts.exportQuality,
      backdropGradient: !!T.backdropGradient,
      backdropA: T.backdropA || palette[0],
      backdropB: T.backdropB || palette[1] || palette[0],
    };
  };

  const stepForms = (F, W, H, dt) => {
    const { st, comp } = F;
    const minA = Math.min(W, H);
    const mu = { x: (F.mouse.x*W - 0.5*W)/minA + 0.5, y: (F.mouse.y*H - 0.5*H)/minA + 0.5 };
    const overrides = st.anchorOverrides[F.cIdx] || {};
    comp.forms.forEach((f, i) => {
      const L = st.live.forms[i];
      const base = overrides[i] || { x: f.x, y: f.y };
      const ax = 0.5 + (base.x - 0.5) * F.spread;
      const ay = 0.5 + (base.y - 0.5) * F.spread;
      // Cursor lean. While actively dragging, the form follows the grabbed
      // point directly; cursor pull resumes only after release.
      const draggingThis = st.drag && st.drag.i === i;
      const dx = mu.x - ax, dy = mu.y - ay;
      const d2 = dx*dx + dy*dy;
      const lean = draggingThis ? 0 : Math.exp(-d2 * 3.5) * F.pull * 0.09;
      const breathe = draggingThis ? 0 : 0.006;
      const tx = ax + dx * lean + Math.sin(F.t*0.23 + i*2.1) * breathe;
      const ty = ay + dy * lean + Math.cos(F.t*0.19 + i*1.7) * breathe;
      const k = draggingThis ? 0.82 : (dt > 0 && !st.frozen ? Math.min(1, dt*4.2) : 1);
      L.x += (tx - L.x) * k;
      L.y += (ty - L.y) * k;
      L.r = f.r * F.scale;
    });
    st.smooth.x += (mu.x - st.smooth.x) * (dt > 0 ? Math.min(1, dt*5) : 1);
    st.smooth.y += (mu.y - st.smooth.y) * (dt > 0 ? Math.min(1, dt*5) : 1);
    return mu;
  };

  /* ── particle simulation (exclusive particle material) ─────────────────────── */
  const ensureParticles = (F) => {
    const st = stateRef.current;
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    // Density now scales with shape area. A large object can still be made from
    // tiny dots without turning into one thin dust cloud. Live caps are kept sane;
    // export gets a higher ceiling through exportQuality.
    const scaleArea = Math.max(0.42, Math.min(6.0, F.scale * F.scale));
    const base = coarse ? 9000 : 18000;
    const cap  = F.exportQuality ? (coarse ? 120000 : 240000) : (coarse ? 42000 : 82000);
    const n = Math.min(cap, Math.round(F.particlesAmt * base * scaleArea));
    const key = 'sphereIso5|' + F.cIdx + '|' + n + '|' + F.comp.forms.length;
    if (st.particles.key === key) return st.particles;

    const rel = new Float32Array(n * 4);      // formIndex, u, v, w
    const tempo = new Float32Array(n);
    const off = new Float32Array(n * 2);
    const baseSize = new Float32Array(n);
    const baseAlpha = new Float32Array(n);
    const data = new Float32Array(n * 4);     // pos.xy + size, alpha
    let rs = 12345 + F.cIdx * 777;
    const rnd = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; };
    const forms = F.comp.forms.length ? F.comp.forms : [{ type:1, x:0.5, y:0.5, r:0.3 }];

    for (let i = 0; i < n; i++){
      const fi = Math.floor(rnd() * forms.length);
      rel[i*4]   = fi;
      rel[i*4+1] = rnd();                    // u
      rel[i*4+2] = rnd();                    // v
      rel[i*4+3] = rnd();                    // w / face selector
      tempo[i] = 0.28 + rnd() * 1.95;        // per-dot tempo for cursor parallax
      baseSize[i] = 0.78 + Math.pow(rnd(), 1.8) * 1.35;
      baseAlpha[i] = 0.42 + rnd() * 0.46;
    }
    st.particles = { key, n, rel, data, off, tempo, baseSize, baseAlpha };
    return st.particles;
  };

  const isoProject = (x, y, z, r) => ({
    x: (x * 0.86 + z * 0.42) * r,
    y: (y * 0.72 - z * 0.30) * r,
    depth: z,
  });

  const particleBase = (F, P, i) => {
    const fi = Math.min(F.st.live.forms.length - 1, Math.max(0, Math.floor(P.rel[i*4])));
    const f = F.comp.forms[fi] || F.comp.forms[0] || { type:1, x:0.5, y:0.5, r:0.3 };
    const L = F.st.live.forms[fi] || { x:f.x, y:f.y, r:f.r * F.scale };
    const u = P.rel[i*4+1], v = P.rel[i*4+2], w = P.rel[i*4+3];
    const a = u * Math.PI * 2;
    const loose = Math.max(0, Math.min(1.25, F.particleLoose ?? 0.12));
    const jitter = (loose * loose) * 0.16;
    const jx = (jsHash(i + 11.7, F.cIdx + 3.1) - 0.5) * jitter;
    const jy = (jsHash(i + 41.3, F.cIdx + 9.2) - 0.5) * jitter;
    const jz = (jsHash(i + 72.6, F.cIdx + 1.4) - 0.5) * jitter;

    let X = 0, Y = 0, Z = 0;

    if (f.type === 4) {                                      // full-bleed particle field
      return { x: u, y: v, depth: w * 2 - 1, body: 0.60 };
    }

    if (f.type === 7) {                                      // isometric torus / ring
      const th = a;
      const ph = v * Math.PI * 2;
      const major = 0.74;
      const minor = 0.20 + loose * 0.035;
      X = (major + minor * Math.cos(ph)) * Math.cos(th);
      Y = (major + minor * Math.cos(ph)) * Math.sin(th) * 1.10;
      Z = minor * Math.sin(ph) * 1.75;
    } else if (f.type === 2) {                               // vertical capsule / cylinder cloud
      const h = (v * 2 - 1);
      const cap = Math.max(0, Math.abs(h) - 0.70) / 0.30;
      const rad = 0.48 * (1.0 - cap * 0.34);
      X = Math.cos(a) * rad;
      Z = Math.sin(a) * rad;
      Y = h * 1.08;
    } else if (f.type === 3) {                               // long folded band / wave plane
      const sx = u * 2.55 - 1.275;
      const sy = (v - 0.5) * 0.70;
      X = sx;
      Y = sy + Math.sin(sx * 2.2 + w * 2.0) * 0.17;
      Z = Math.cos(sx * 1.7 + w * 2.4) * 0.34;
    } else if (f.type === 5) {                               // tilted ribbon surface
      const sx = u * 2.05 - 1.025;
      const sy = (v - 0.5) * 0.58;
      X = sx;
      Y = sy + Math.sin(sx * Math.PI) * 0.18;
      Z = Math.cos(sx * Math.PI * 0.85) * 0.36 + (w - 0.5) * 0.18;
      const ca = Math.cos(-0.58), sa = Math.sin(-0.58);
      const rx = X * ca - Y * sa;
      const ry = X * sa + Y * ca;
      X = rx; Y = ry;
    } else if (f.type === 6) {                               // isometric soft block / poster tile
      // Sample visible cuboid faces so the dot cloud reads as geometry, not dust.
      const face = w < 0.38 ? 0 : (w < 0.70 ? 1 : 2);
      if (face === 0) { X = u * 1.50 - 0.75; Y = v * 1.02 - 0.51; Z = 0.38; }
      else if (face === 1) { X = 0.75; Y = u * 1.02 - 0.51; Z = v * 0.76 - 0.38; }
      else { X = u * 1.50 - 0.75; Y = -0.51; Z = v * 0.76 - 0.38; }
    } else {                                                 // orb / sphere surface
      const z = v * 2 - 1;
      const rr = Math.sqrt(Math.max(0, 1 - z*z));
      X = Math.cos(a) * rr;
      Y = Math.sin(a) * rr;
      Z = z;
    }

    X += jx; Y += jy; Z += jz;
    const proj = isoProject(X, Y, Z, L.r);
    return { x: L.x + proj.x, y: L.y + proj.y, depth: proj.depth, body: 1.0 };
  };

  const stepParticles = (F, mu, dt) => {
    const P = ensureParticles(F);
    const { st } = F;
    const loose = Math.max(0, Math.min(1.25, F.particleLoose ?? 0.12));
    const windT = F.t * (0.020 + F.flow * 0.048);
    const drift = 0.18 + F.flow * 0.95;
    const scatter = 0.025 + loose * 0.30 + F.ripple * 0.82;
    const pointScale = Math.max(0.35, Math.min(3.2, F.particleSize ?? 0.70));
    for (let i = 0; i < P.n; i++){
      const b = particleBase(F, P, i);
      const bx = b.x, by = b.y;
      const tempo = P.tempo[i];
      const c = jsCurl(bx * 2.1 + P.off[i*2] * 0.36, by * 2.1 + P.off[i*2+1] * 0.36, windT * tempo);
      // Cursor shear with per-dot tempo: the cloud splits into subtle parallax speeds.
      const dx = st.smooth.x - bx, dy = st.smooth.y - by;
      const d = Math.hypot(dx, dy) + 0.001;
      const fall = Math.exp(-d*d*3.4);
      const tx = c[0] * 0.024 * drift * scatter * tempo
        + (dx/d) * fall * F.pull * 0.075 * tempo
        - (dy/d) * fall * F.pull * 0.032 * tempo;
      const ty = c[1] * 0.024 * drift * scatter * tempo
        + (dy/d) * fall * F.pull * 0.075 * tempo
        + (dx/d) * fall * F.pull * 0.032 * tempo;
      const k = dt > 0 && !st.frozen ? Math.min(1, dt * (0.9 + tempo * 2.8)) : 1;
      P.off[i*2]   += (tx - P.off[i*2]) * k;
      P.off[i*2+1] += (ty - P.off[i*2+1]) * k;
      P.data[i*4]   = bx + P.off[i*2];
      P.data[i*4+1] = by + P.off[i*2+1];
      P.data[i*4+2] = Math.max(0.55, P.baseSize[i] * pointScale);
      // Depth shading helps the particle shape read as an isometric object.
      const depthLift = 0.56 + Math.max(-1, Math.min(1, b.depth || 0)) * 0.22;
      P.data[i*4+3] = Math.max(0.08, Math.min(0.96, (0.42 + P.baseAlpha[i] * 0.56) * depthLift * (1.05 - loose * 0.18)));
    }
    return P;
  };


  const pointerUnitFromMouse = (m, W, H) => {
    const minA = Math.min(W, H);
    return { x: ((m.x ?? 0.5) * W - 0.5 * W) / minA + 0.5,
             y: ((m.y ?? 0.5) * H - 0.5 * H) / minA + 0.5 };
  };

  const visibleUnitRect = (W, H) => {
    const minA = Math.min(W, H);
    return {
      x0: 0.5 - W / (2 * minA), x1: 0.5 + W / (2 * minA),
      y0: 0.5 - H / (2 * minA), y1: 0.5 + H / (2 * minA),
    };
  };
  const formBounds = (f, L) => {
    let rx = L.r, ry = L.r;
    if (f.type === 2) { rx = L.r * 0.58; ry = L.r * 0.92; }
    else if (f.type === 3) { rx = 1.45; ry = L.r * 0.60; }
    else if (f.type === 4) { rx = 0.60; ry = 0.60; }
    else if (f.type === 5) { rx = L.r * 1.12; ry = L.r * 0.72; }
    else if (f.type === 6) { rx = L.r * 0.96; ry = L.r * 0.72; }
    else if (f.type === 7) { rx = L.r * 0.94; ry = L.r * 1.16; }
    return { x0:L.x-rx, x1:L.x+rx, y0:L.y-ry, y1:L.y+ry };
  };
  // Transparent layer exports should include the object, not crop it because a
  // huge shape was composed on a different aspect ratio. Full-background exports
  // do not use this; those remain composition-faithful.
  const fitFormsIntoView = (F, W, H) => {
    const forms = F.st.live.forms || [];
    if (!forms.length) return;
    let b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    forms.forEach((L, i) => {
      const f = F.comp.forms[i]; if (!f || f.type === 4) return;
      const bb = formBounds(f, L);
      b.x0 = Math.min(b.x0, bb.x0); b.x1 = Math.max(b.x1, bb.x1);
      b.y0 = Math.min(b.y0, bb.y0); b.y1 = Math.max(b.y1, bb.y1);
    });
    if (!Number.isFinite(b.x0)) return;
    const v = visibleUnitRect(W, H);
    const pad = Math.min(v.x1 - v.x0, v.y1 - v.y0) * 0.07;
    const availW = Math.max(0.01, (v.x1 - v.x0) - pad * 2);
    const availH = Math.max(0.01, (v.y1 - v.y0) - pad * 2);
    const bw = Math.max(0.01, b.x1 - b.x0), bh = Math.max(0.01, b.y1 - b.y0);
    const sFit = Math.min(1, availW / bw, availH / bh);
    if (sFit >= 0.999 && b.x0 >= v.x0+pad && b.x1 <= v.x1-pad && b.y0 >= v.y0+pad && b.y1 <= v.y1-pad) return;
    const cx = (b.x0 + b.x1) * 0.5, cy = (b.y0 + b.y1) * 0.5;
    const vcx = (v.x0 + v.x1) * 0.5, vcy = (v.y0 + v.y1) * 0.5;
    forms.forEach(L => { L.x = vcx + (L.x - cx) * sFit; L.y = vcy + (L.y - cy) * sFit; L.r *= sFit; });
  };

  /* ── draw ───────────────────────────────────────────────────────────────── */
  const drawAt = (W, H, transparent = false, dt = 0, opts = {}) => {
    const R = glRef.current; if (!R) return;
    const { gl, field, parts } = R;
    if (gl.isContextLost && gl.isContextLost()) return;
    const F = readFrame(opts);
    if (opts.renderStateOverride && Array.isArray(opts.renderStateOverride.liveForms)) {
      F.st.live = { idx: F.cIdx, forms: opts.renderStateOverride.liveForms.map(f => ({ x:f.x, y:f.y, r:f.r })) };
      F.st.anchorOverrides = JSON.parse(JSON.stringify(opts.renderStateOverride.anchorOverrides || {}));
    }
    if (opts.fitObject && transparent) fitFormsIntoView(F, W, H);
    const mu = opts.renderStateOverride ? pointerUnitFromMouse(F.mouse, W, H) : stepForms(F, W, H, dt);

    gl.viewport(0, 0, W, H);

    // ── pass 1: field ──
    gl.useProgram(field);
    gl.disable(gl.BLEND);
    gl.bindBuffer(gl.ARRAY_BUFFER, R.triBuf);
    gl.enableVertexAttribArray(R.fieldPos);
    gl.vertexAttribPointer(R.fieldPos, 2, gl.FLOAT, false, 0, 0);
    // Attribute indices are shared across programs: partPos may alias
    // fieldPos (both location 0). Only disable locations we are not using
    // in THIS pass, or the triangle degenerates and nothing rasterises.
    [R.partPos, R.partProp].forEach(loc => {
      if (loc >= 0 && loc !== R.fieldPos) gl.disableVertexAttribArray(loc);
    });

    const u = (n) => gl.getUniformLocation(field, n);
    gl.uniform2f(u('u_resolution'), W, H);
    gl.uniform1f(u('u_time'), F.t);
    gl.uniform2f(u('u_mouse'), F.mouse.x, F.mouse.y);
    gl.uniform1f(u('u_pulse'), F.st.pulse);
    gl.uniform1f(u('u_flow'), F.flow);
    gl.uniform1f(u('u_ripple'), F.ripple);
    gl.uniform1f(u('u_glow'), F.glow);
    gl.uniform1f(u('u_grain'), F.grain);
    gl.uniform1f(u('u_blur'), F.blur);
    gl.uniform1f(u('u_pull'), F.pull);
    gl.uniform1i(u('u_bw'), F.bw ? 1 : 0);
    gl.uniform1i(u('u_invert'), F.invert ? 1 : 0);
    const blendMap = { normal:0, screen:1, multiply:2, silhouette:3, difference:1, exclusion:2, hardmix:3 };
    gl.uniform1i(u('u_blendMode'), blendMap[F.blendMode] ?? 0);
    gl.uniform1f(u('u_seed'), 0.413 + F.cIdx * 0.173);
    const matMap = { gradient:0, mono:1, thermal:2, particles:3 };
    gl.uniform1i(u('u_material'), matMap[F.material] ?? 0);
    gl.uniform1f(u('u_heatSteps'), F.heatSteps);
    gl.uniform1i(u('u_transparent'), transparent ? 1 : 0);

    for (let i = 0; i < 3; i++){
      const f = F.comp.forms[i];
      const L = F.st.live.forms[i];
      if (f && L) {
        gl.uniform4f(u(`u_form${i}`), L.x, L.y, L.r, f.type);
        gl.uniform1i(u(`u_formCi${i}`), f.ci);
      } else {
        gl.uniform4f(u(`u_form${i}`), 0, 0, 0, 0);
        gl.uniform1i(u(`u_formCi${i}`), 1);
      }
    }

    const bg = geoHexRgb01(F.backdropA || F.palette[0]);
    const bg2 = geoHexRgb01(F.backdropB || F.palette[1] || F.palette[0]);
    gl.uniform3f(u('u_bg'), bg[0], bg[1], bg[2]);
    gl.uniform3f(u('u_bg2'), bg2[0], bg2[1], bg2[2]);
    gl.uniform1i(u('u_bgGrad'), F.backdropGradient ? 1 : 0);
    const inks = F.palette.slice(1);
    gl.uniform1i(u('u_inkCount'), Math.min(4, Math.max(1, inks.length)));
    for (let i = 0; i < 4; i++){
      const c = geoHexRgb01(inks[Math.min(i, inks.length-1)] || '#FF4D00');
      gl.uniform3f(u(`u_ink${i}`), c[0], c[1], c[2]);
    }
    // thermal LUT: inks sorted dark→light, framed by near-black and near-white
    const sorted = [...inks].sort((a,b)=>geoLum(a)-geoLum(b)).map(geoHexRgb01);
    const cold = (sorted[0]||[0.1,0.2,0.5]).map(v=>v*0.14);
    const hi = sorted[sorted.length-1]||[1,0.9,0.8];
    const hot = hi.map(v=>v+(1-v)*0.8);
    const lutStops = [cold,
      sorted[0]||cold,
      sorted[Math.floor((sorted.length-1)/2)]||sorted[0]||cold,
      sorted[sorted.length-1]||hot,
      hot];
    lutStops.forEach((s,i)=>gl.uniform3f(u(`u_lut${i}`), s[0], s[1], s[2]));

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // ── pass 2: particle body — exclusive material, not an overlay ──
    if (F.material === 'particles'){
      const P = stepParticles(F, mu, dt);
      if (P.n > 0){
        gl.useProgram(parts);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.bindBuffer(gl.ARRAY_BUFFER, R.partBuf);
        gl.bufferData(gl.ARRAY_BUFFER, P.data, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(R.partPos);
        gl.vertexAttribPointer(R.partPos, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(R.partProp);
        gl.vertexAttribPointer(R.partProp, 2, gl.FLOAT, false, 16, 8);
        if (R.fieldPos >= 0 && R.fieldPos !== R.partPos && R.fieldPos !== R.partProp)
          gl.disableVertexAttribArray(R.fieldPos);
        const pu = (n) => gl.getUniformLocation(parts, n);
        gl.uniform2f(pu('u_resolution'), W, H);
        gl.uniform1f(pu('u_dpr'), Math.max(1, W / (canvasRef.current?.clientWidth || W)));
        // Dots print in the selected form inks, shaded toward print black.
        const inks2 = F.palette.slice(1);
        const ciA = ((F.comp.forms[0]?.ci || 1) - 1 + inks2.length) % Math.max(1, inks2.length);
        const ciB = ((F.comp.forms[1]?.ci || F.comp.forms[0]?.ci || 1) - 1 + inks2.length) % Math.max(1, inks2.length);
        const A = geoHexRgb01(inks2[ciA] || '#1A1A1A');
        const B = geoHexRgb01(inks2[ciB] || inks2[ciA] || '#1A1A1A');
        gl.uniform3f(pu('u_inkA'), A[0]*0.45, A[1]*0.45, A[2]*0.45);
        gl.uniform3f(pu('u_inkB'), B[0]*0.62, B[1]*0.62, B[2]*0.62);
        gl.uniform3f(pu('u_bg'), bg[0], bg[1], bg[2]);
        gl.uniform1i(pu('u_bw'), F.bw ? 1 : 0);
        gl.uniform1i(pu('u_invert'), F.invert ? 1 : 0);
        gl.uniform1i(pu('u_blendMode'), blendMap[F.blendMode] ?? 0);
        gl.uniform1f(pu('u_softness'), F.blur);
        gl.uniform1f(pu('u_grain'), F.grain);
        gl.drawArrays(gl.POINTS, 0, P.n);
        gl.disable(gl.BLEND);
      }
    }
    gl.flush();
  };

  WP.useAnimationLoop((t, dt) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const safeDt = Math.min(dt, 0.1);
    stateRef.current.pulse *= Math.exp(-safeDt * 1.4);
    drawAt(canvas.width, canvas.height, false, safeDt);
  });

  const cloneParticlePack = (P) => {
    if (!P) return { key:'', n:0, rel:null, data:null, off:null, tempo:null, baseSize:null, baseAlpha:null };
    const cloneTA = (ta) => (ta && ta.slice) ? ta.slice(0) : ta;
    return {
      key: P.key || '',
      n: P.n || 0,
      rel: cloneTA(P.rel),
      data: cloneTA(P.data),
      off: cloneTA(P.off),
      tempo: cloneTA(P.tempo),
      baseSize: cloneTA(P.baseSize),
      baseAlpha: cloneTA(P.baseAlpha),
    };
  };

  const cloneGeoState = (st) => ({
    pulse: st.pulse || 0,
    frozen: !!st.frozen,
    frozenMouse: st.frozenMouse ? { ...st.frozenMouse } : null,
    frozenTime: st.frozenTime ?? null,
    mouseLocked: !!st.mouseLocked,
    lockedMouse: st.lockedMouse ? { ...st.lockedMouse } : null,
    clickTimer: null,
    suppressClick: false,
    anchorOverrides: JSON.parse(JSON.stringify(st.anchorOverrides || {})),
    live: { idx: st.live?.idx ?? -1, forms: (st.live?.forms || []).map(f => ({ x:f.x, y:f.y, r:f.r })) },
    drag: null,
    smooth: { x: st.smooth?.x ?? 0.5, y: st.smooth?.y ?? 0.5 },
    particles: cloneParticlePack(st.particles),
    exportHold: null,
  });

  const snapshotToDataURL = (opts = {}) => {
    const canvas = canvasRef.current; if (!canvas) return null;
    const w = Math.max(1, Math.round(opts.width || 3840));
    const h = Math.max(1, Math.round(opts.height || 2160));
    const st = stateRef.current;
    const material = (opts.tweaksOverride || tweaks)?.material || tweaks.material;
    const useOffscreen = !!opts.exportQuality || material === 'particles' || w !== canvas.width || h !== canvas.height;

    const m = mouseRef.current || { x:0.5, y:0.5, chaosX:0.5, chaosY:0.5 };
    const buildRenderState = () => {
      const stNow = stateRef.current || {};
      const pm = stNow.frozen && stNow.frozenMouse
        ? stNow.frozenMouse
        : (stNow.mouseLocked && stNow.lockedMouse ? stNow.lockedMouse : m);
      return {
        t: window.__NURR_T ?? performance.now()/1000,
        mouse: { x:pm.chaosX ?? pm.x, y:pm.chaosY ?? pm.y, chaosX:pm.chaosX ?? pm.x, chaosY:pm.chaosY ?? pm.y },
        liveForms: (stNow.live?.forms || []).map(f => ({ x:f.x, y:f.y, r:f.r })),
        anchorOverrides: JSON.parse(JSON.stringify(stNow.anchorOverrides || {})),
      };
    };

    if (useOffscreen) {
      const off = document.createElement('canvas');
      off.width = w; off.height = h;
      const offR = initFlowGL(off);
      if (!offR) return null;
      const liveR = glRef.current;
      const liveCanvas = canvasRef.current;
      const liveState = stateRef.current;
      const tempState = cloneGeoState(liveState);
      const liveDpr = Math.max(1, (liveCanvas?.width || w) / Math.max(1, liveCanvas?.clientWidth || liveCanvas?.width || w));
      const fakeCanvas = { width: w, height: h, clientWidth: Math.max(1, Math.round(w / liveDpr)), style: {} };
      try {
        glRef.current = offR;
        canvasRef.current = fakeCanvas;
        stateRef.current = tempState;
        drawAt(w, h, !!opts.transparent, 0, opts);
        const dataUrl = off.toDataURL('image/png');
        const renderState = opts.captureRenderState ? buildRenderState() : null;
        return opts.captureRenderState ? { dataUrl, renderState, tweaks: JSON.parse(JSON.stringify(opts.tweaksOverride || tweaks)) } : dataUrl;
      } finally {
        glRef.current = liveR;
        canvasRef.current = liveCanvas;
        stateRef.current = liveState;
        try { const lose = offR.gl?.getExtension && offR.gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); } catch (e) {}
      }
    }

    const ow = canvas.width, oh = canvas.height, osw = canvas.style.width, osh = canvas.style.height;
    const saved = {
      live: { idx: st.live.idx, forms: (st.live.forms || []).map(f => ({ x:f.x, y:f.y, r:f.r })) },
      anchorOverrides: JSON.parse(JSON.stringify(st.anchorOverrides || {})),
      particles: cloneParticlePack(st.particles),
      frozen: st.frozen, frozenMouse: st.frozenMouse, frozenTime: st.frozenTime,
      mouseLocked: st.mouseLocked, lockedMouse: st.lockedMouse,
      smooth: { x: st.smooth?.x ?? 0.5, y: st.smooth?.y ?? 0.5 },
    };
    canvas.width = w; canvas.height = h;
    drawAt(w, h, !!opts.transparent, 0, opts);
    const dataUrl = canvas.toDataURL('image/png');
    const renderState = opts.captureRenderState ? buildRenderState() : null;
    st.live = saved.live; st.anchorOverrides = saved.anchorOverrides; st.particles = saved.particles;
    st.frozen = saved.frozen; st.frozenMouse = saved.frozenMouse; st.frozenTime = saved.frozenTime;
    st.mouseLocked = saved.mouseLocked; st.lockedMouse = saved.lockedMouse; st.smooth = saved.smooth;
    canvas.width = ow; canvas.height = oh; canvas.style.width = osw; canvas.style.height = osh;
    return opts.captureRenderState ? { dataUrl, renderState, tweaks: JSON.parse(JSON.stringify(opts.tweaksOverride || tweaks)) } : dataUrl;
  };

  geomUE(() => {
    registerSnapshot((opts = {}) => {
      const canvas = canvasRef.current; if (!canvas) return null;
      const w = opts.width || 3840, h = opts.height || 2160;
      const out = snapshotToDataURL(opts);
      const dataUrl = typeof out === 'string' ? out : (out && out.dataUrl);
      if (!opts.returnDataUrl && dataUrl) {
        const tmp = document.createElement('canvas');
        tmp.width = w; tmp.height = h;
        const img = new Image();
        img.onload = () => {
          const ctx = tmp.getContext('2d');
          ctx.clearRect(0,0,w,h); ctx.drawImage(img,0,0,w,h);
          WP.downloadCanvas(tmp, opts.filename || `nymph-geometric-${w}x${h}-${Date.now()}.png`);
        };
        img.src = dataUrl;
      }
      return out;
    });
    window.NurrGeometricRenderToDataURL = (moduleTweaks, renderState, w, h, extra = {}) => {
      const r = snapshotToDataURL({ width:w, height:h, returnDataUrl:true, tweaksOverride:moduleTweaks, renderStateOverride:renderState, ...extra });
      return typeof r === 'string' ? r : (r && r.dataUrl) || null;
    };
    return () => {
      if (window.NurrGeometricRenderToDataURL) delete window.NurrGeometricRenderToDataURL;
    };
  }, [tweaks, registerSnapshot]);

  return <canvas ref={canvasRef} className="stage" />;
}

/* ─── previews ───────────────────────────────────────────────────────────── */
function CompositionPreview({ comp, palette, material }) {
  const safePalette = palette || ['#CBD2D4', '#FF4D00', '#FF2E9A'];
  const bg = safePalette[0] || '#CBD2D4';
  const cols = safePalette.slice(1).length ? safePalette.slice(1) : ['#FF4D00'];
  const uid = comp.name.replace(/[^a-z0-9]+/gi,'-');
  const drawForm = (f, i, fill) => {
    if (f.type === 4) return <rect key={i} width="100" height="100" fill={fill} />;
    if (f.type === 2) return <rect key={i} x={(f.x - f.r*0.52)*100} y={(f.y - f.r*0.9)*100}
      width={f.r*1.04*100} height={f.r*1.8*100} rx={f.r*52} fill={fill} />;
    if (f.type === 3) return <rect key={i} x="0" y={(f.y - f.r*0.5)*100} width="100" height={f.r*100} fill={fill} />;
    if (f.type === 5) return <rect key={i} x={(f.x - f.r*0.95)*100} y={(f.y - f.r*0.28)*100}
      width={f.r*1.9*100} height={f.r*0.56*100} rx={f.r*28}
      transform={`rotate(-33 ${f.x*100} ${f.y*100})`} fill={fill} />;
    if (f.type === 6) return <rect key={i} x={(f.x - f.r*0.82)*100} y={(f.y - f.r*0.58)*100}
      width={f.r*1.64*100} height={f.r*1.16*100} rx={f.r*18} fill={fill} />;
    if (f.type === 7) return <ellipse key={i} cx={f.x*100} cy={f.y*100}
      rx={f.r*70} ry={f.r*94} fill="none" stroke={fill} strokeWidth={f.r*30} strokeLinecap="round" />;
    return <circle key={i} cx={f.x*100} cy={f.y*100} r={f.r*100} fill={fill} />;
  };
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
      <defs>
        {comp.forms.map((f, i) => {
          const c = cols[(f.ci-1) % cols.length];
          const c2 = cols[f.ci % cols.length] || c;
          return (
            <radialGradient key={i} id={`fg-${uid}-${i}`} cx="42%" cy="36%" r="78%">
              <stop offset="0%" stopColor={material === 'mono' ? c : '#FFFFFF'} stopOpacity={material === 'mono' ? 1 : 0.30} />
              <stop offset="35%" stopColor={c} />
              <stop offset="100%" stopColor={material === 'thermal' ? '#111111' : c2} stopOpacity={f.type === 4 ? 1 : 0.18} />
            </radialGradient>
          );
        })}
        <filter id={`fb-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation={material === 'particles' ? '0.2' : '2.4'} />
        </filter>
      </defs>
      <rect width="100" height="100" fill={bg} />
      {material !== 'particles' && (
        <g filter={`url(#fb-${uid})`}>
          {comp.forms.map((f, i) => drawForm(f, i, `url(#fg-${uid}-${i})`))}
        </g>
      )}
      {material === 'particles' && (
        <g fill={cols[0] || '#111'} opacity="0.72">
          {Array.from({length: 42}).map((_, i) => {
            const f = comp.forms[i % comp.forms.length] || comp.forms[0];
            const a = i * 2.399, rr = 7 + (i * 5) % 29;
            const cx = f.type === 4 ? ((i * 23) % 100) : f.x * 100 + Math.cos(a) * rr;
            const cy = f.type === 4 ? ((i * 41) % 100) : f.y * 100 + Math.sin(a) * rr * 0.68;
            return <circle key={i} cx={cx} cy={cy} r="0.9" />;
          })}
        </g>
      )}
    </svg>
  );
}

/* ─── controls ───────────────────────────────────────────────────────────── */
function GeometricControls({ tweaks, setTweaks }) {
  const PaletteEditor = window.NurrPaletteEditor;
  const [presetsOpen, setPresetsOpen] = geomUS(false);
  const setColors = (next) => setTweaks({ colors: next.slice(0, 5) });
  const material = tweaks.material || 'gradient';
  const cIdx = (tweaks.compositionIdx ?? 0) % GEOMETRIC_COMPOSITIONS.length;
  const randomBackdrop = () => {
    const presets = (WP && WP.PALETTE_PRESETS) || [];
    const p = presets.length ? presets[Math.floor(Math.random() * presets.length)] : ['#F2F0E7', '#C9D7DA'];
    const a = p[0] || '#F2F0E7';
    const b = p[Math.min(p.length - 1, 1 + Math.floor(Math.random() * Math.max(1, p.length - 1)))] || '#C9D7DA';
    setTweaks({ backdropGradient: true, backdropA: a, backdropB: b });
  };

  const pickArrangement = (i) => {
    // Curated starting point per arrangement — sliders remain fully editable.
    const s = GEOMETRIC_COMPOSITIONS[i].suggest || {};
    setTweaks({ compositionIdx: i, ...s });
  };

  return (
    <>
      <div className="section geo-render-section">
        <div className="section-label"><span className="name">Flow render</span>
          <span className="value">{(GEO_MATERIALS.find(m => m[0] === material) || GEO_MATERIALS[0])[1]}</span></div>
        <div className="geo-render-grid">
          {GEO_MATERIALS.map(([id, label]) => (
            <button key={id} className={'geo-render-chip' + (id === material ? ' active' : '')}
              onClick={() => setTweaks({ material: id })}>{label}</button>
          ))}
        </div>
      </div>

      <div className="section geo-action-section">
        <button type="button" className="geo-action-btn"
          onClick={() => setTweaks({ freeflowResetToken: Date.now() })}>
          Freeflow reset
        </button>
        <button type="button" className={'geo-action-btn' + (tweaks.backdropGradient ? ' active' : '')}
          onClick={randomBackdrop}>
          Backdrop gradient
        </button>
      </div>
      {tweaks.backdropGradient && (
        <div className="section geo-action-section geo-action-section-single">
          <button type="button" className="geo-action-btn" onClick={() => setTweaks({ backdropGradient: false })}>Flat backdrop</button>
        </div>
      )}

      <div className="section geo-filter-section">
        <button type="button" className={'geo-action-btn' + (tweaks.bw ? ' active' : '')}
          onClick={() => setTweaks({ bw: !tweaks.bw })}>B/W</button>
        <button type="button" className={'geo-action-btn' + (tweaks.invert ? ' active' : '')}
          onClick={() => setTweaks({ invert: !tweaks.invert })}>Invert</button>
      </div>

      <div className="section geo-blend-section">
        <div className="section-label"><span className="name">Blend</span><span className="value">{tweaks.blendMode || 'normal'}</span></div>
        <div className="geo-render-grid">
          {[["normal","Normal"],["screen","Screen"],["multiply","Multiply"],["silhouette","Silhouette"]].map(([id,label]) => (
            <button key={id} className={'geo-render-chip' + ((tweaks.blendMode || 'normal') === id ? ' active' : '')}
              onClick={() => setTweaks({ blendMode: id })}>{label}</button>
          ))}
        </div>
      </div>

      <div className="section geo-shape-section">
        <div className="section-label"><span className="name">Shape</span>
          <span className="value">{GEOMETRIC_COMPOSITIONS[cIdx].name}</span></div>
        <div className="geo-shape-grid">
          {GEOMETRIC_COMPOSITIONS.map((comp, i) => (
            <button key={i} className={'geo-shape-card' + (i === cIdx ? ' active' : '')}
              onClick={() => pickArrangement(i)} title={comp.name}>
              <CompositionPreview comp={comp} palette={tweaks.colors} material={material} />
            </button>
          ))}
        </div>
      </div>

      <PaletteEditor colors={tweaks.colors} setColors={setColors}
        countLabel={`${tweaks.colors.length} colors`} allowAdd={true}
        minColors={2} maxColors={5} compact={true} />
      {material === 'thermal' && (
        <div className="geo-note">First swatch = flat background. Backdrop gradient overrides it. Remaining swatches form the heat scale.</div>
      )}

      <div className={'section presets-section collapsible-presets ' + (presetsOpen ? 'is-open' : 'is-collapsed')}>
        <button type="button" className="section-label presets-toggle"
          onClick={() => setPresetsOpen(!presetsOpen)} aria-expanded={presetsOpen}>
          <span className="name">Presets</span>
          <span className="value">{WP.PALETTE_PRESETS.length}</span>
          <span className="preset-arrow">{presetsOpen ? '⌃' : '⌄'}</span>
        </button>
        <div className="palette-grid">
          {WP.PALETTE_PRESETS.map((p, i) => (
            <button key={i} className="palette-card" onClick={() => setTweaks({ colors: p.slice(0, 4) })} title={p.slice(0, 4).join(' · ')}>
              {p.slice(0, 4).map((c, j) => <span key={j} style={{ background: c }} />)}
            </button>
          ))}
        </div>
      </div>

      {(material === 'particles' ? [
        ['particles',      'Particle amount', 0.03, 1.6],
        ['particleSize',   'Dot size',        0.35, 3.2],
        ['particleLoose',  'Looseness',       0, 1.25],
        ['flow',           'Drift',           0, 1],
        ['ripple',         'Scatter',         0, 1],
        ['blur',           'Blur',            0, 1],
        ['vectorScale',    'Shape size',      0.30, 4.0],
        ['vectorDistance', 'Shape spacing',   0.45, 1.7],
        ['mousePull',      'Cursor pull',     0, 2],
        ['grain',          'Film grain',      0, 1],
      ] : [
        ['flow',           'Flow',        0, 1],
        ['ripple',         material === 'thermal' ? 'Bands' : 'Ripple', 0, 1],
        ['glow',           'Glow',        0, 1],
        ['blur',           'Blur',        0, 1],
        ['vectorScale',    'Shape size',  0.25, 2.6],
        ['vectorDistance', 'Shape spacing', 0.45, 1.7],
        ['mousePull',      'Cursor pull', 0, 2],
        ...(material === 'thermal' ? [['heatSteps', 'Heat steps', 0, 12]] : []),
        ['grain',          'Film grain',  0, 1],
      ]).map(([k, label, min, max]) => {
        const fallback = k === 'particles' ? 0.55 : (k === 'particleSize' ? 0.70 : (k === 'particleLoose' ? 0.12 : (k === 'grain' ? 0.10 : 0)));
        const val = tweaks[k] ?? fallback;
        return (
          <div className="section" key={k}>
            <div className="section-label"><span className="name">{label}</span>
              <span className="value">{k === 'heatSteps'
                ? (val < 2 ? 'smooth' : Math.round(val))
                : Math.round(((val - min) / (max - min)) * 100)}</span></div>
            <input className="slider" type="range" min={min} max={max}
              step={k === 'heatSteps' ? '1' : '0.01'}
              value={val}
              onChange={(e) => setTweaks({ [k]: parseFloat(e.target.value) })} />
          </div>
        );
      })}

      <div className="help compact-help">
        FLOW: choose a shape, then render that same body as gradient, mono, thermal or particles.
        Drag to place; release keeps it alive. Double-click freezes; double-click again releases.
        Particle amount changes point count, Shape size changes the object, Dot size changes the marks.
      </div>
    </>
  );
}

window.GeometricMode      = GeometricMode;
window.GeometricControls  = GeometricControls;
window.GEOMETRIC_DEFAULTS = {
  compositionIdx: 0,
  colors: ['#CBD2D4', '#FF4D00', '#FF2E9A', '#6A5BD8'],
  material: 'gradient',
  flow: 0.05, ripple: 0.0, glow: 0.85, blur: 0.0, particles: 0.55,
  particleSize: 0.70, particleLoose: 0.12,
  vectorScale: 1.0, vectorDistance: 1.0, mousePull: 0.85,
  heatSteps: 0, grain: 0.10, bw: false, invert: false, blendMode: 'normal',
  backdropGradient: false, backdropA: '#CBD2D4', backdropB: '#F2EDE0',
};
