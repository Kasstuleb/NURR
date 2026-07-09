// ─────────────────────────────────────────────────────────────────────────────
// NURR — abstract.js   Glass-refraction abstract mode (WebGL)
// Browser only: React + Babel standalone. No imports / exports.
//
// Architecture:
//   • Creates a WebGL overlay canvas on #root (z-index 1, pointer-events none)
//   • All rendering happens in a single fullscreen fragment shader
//   • Overlay is created on mount and torn down on unmount
//   • React state → WebGL uniforms on every control change
//
// Glass types: 0=clear  1=ripple  2=prism  3=water
// Click pulse applied to field coordinate (behind glass), not to glass grid.
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
  //   2. Mouse pull warps the field UV (glass pane grid drifts with cursor)
  //   3. Glass displacement via type-specific function (clear/ripple/prism/water)
  //   4. Click ripple added to FIELD coord (d), not to pane UV (sv)
  //      → disturbance appears behind the glass, panes stay rigid
  //   5. Blur / chromatic aberration sample of gradient field
  //   6. Glass surface highlights (caustics, specular, shadow)
  //   7. Contrast → B&W → Invert → Vignette → Grain
  // ═══════════════════════════════════════════════════════════════════════════
  const FRAG = `
precision highp float;

uniform vec2  u_res;
uniform int   u_form;        // 0=glass  1=ripple
uniform int   u_glassType;   // 0=clear  1=ripple  2=prism  3=water
uniform int   u_gsrc;        // 0=smooth 1=blob
uniform int   u_variant;     // 0..7 gradient composition variant
uniform vec3  u_pal[8];      // palette colours (always padded to 8)
uniform int   u_palN;        // active colour count 2–8
uniform float u_density;     // pane count / noise scale
uniform float u_strength;    // refraction / wave amplitude
uniform float u_blur;
uniform float u_vdist;
uniform float u_vsize;
uniform float u_contrast;
uniform float u_grain;
uniform float u_bw;
uniform float u_invert;
uniform float u_seed;
uniform float u_time;        // already multiplied by animSpeed in JS
uniform vec2  u_mouse;
uniform vec2  u_mouseRaw;
uniform float u_clickPulse;
uniform float u_mouseActive;
uniform float u_glassAngle;  // 0=vertical stripes → 1=horizontal stripes
uniform float u_specular;    // glass surface highlight intensity
uniform float u_vignette;    // vignette strength

// ── Hash ──────────────────────────────────────────────────────────────────────
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
// Robust fract-based hash used for pixel-scale passes (grain), where sin() of
// large arguments loses precision on mobile GPUs and starts producing
// diagonal stripe patterns. hash21 stays isotropic at any input scale.
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
  float grainPx = 900.0 / max(min(u_res.x, u_res.y), 1.0);
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


// ── Value noise (bilinear) ────────────────────────────────────────────────────
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i),                     hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)),    hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

// ── Palette lookup ────────────────────────────────────────────────────────────
vec3 pal(float t) {
  t = clamp(t, 0.0, 1.0);
  float fi = min(t * float(u_palN - 1), float(u_palN - 1) - 0.00012);
  int   i  = int(fi);
  float f  = fi - float(i);
  f = f * f * (3.0 - 2.0 * f);

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
float smoothField(vec2 uv) {
  float angle = u_seed * 6.28318 + float(u_variant) * 0.73 + u_time * 0.055;
  vec2  dir   = normalize(vec2(cos(angle), sin(angle)));
  vec2  dir2  = normalize(vec2(cos(angle + 1.5708), sin(angle + 1.5708)));
  float sp    = u_vdist * 1.65 + 0.42;
  float sz    = u_vsize * 0.90 + 0.45;

  float base = dot(uv - 0.5, dir) * sp * 0.82 + 0.5;

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
  float sp   = u_vdist * 1.60 + 0.50;
  float sz   = u_vsize * 1.20 + 0.52;
  float seed = u_seed * 6.28318 + float(u_variant) * 0.61 + u_time * 0.045;

  float val = 0.0;
  float wt  = 0.0;

  int count = 5 + (u_variant - (u_variant / 4) * 4);
  for (int k = 0; k < 8; k++) {
    if (k >= count) continue;
    float fk = float(k);
    float a  = seed + fk * 6.28318 / float(count);
    vec2  c  = vec2(0.5) + 0.44 * sp * vec2(cos(a), sin(a * (0.82 + 0.03*float(u_variant))));
    c += vec2(sin(seed + fk*2.17), cos(seed*0.77 + fk*1.41)) * 0.075;

    vec2  ell = vec2(0.32 + 0.22*sin(a*1.3), 0.30 + 0.20*cos(a*0.9)) * sz;
    float d   = length((uv - c) / ell);
    float w   = exp(-d*d * (1.25 + 0.22*float((k + u_variant) / 3)));
    float tone = mod(fk * 0.23 + float(u_variant) * 0.17, 1.0);
    val += w * tone;
    wt  += w;
  }

  vec2  anchor = vec2(0.5) + 0.24 * vec2(cos(seed*1.3), sin(seed*0.9));
  float dc     = length((uv - anchor) / (vec2(0.20,0.26) * sz));
  float wc     = exp(-dc*dc * (2.0 + float(u_variant)*0.12));
  val += wc * (u_variant == 2 || u_variant == 5 ? 0.12 : 0.62);
  wt  += wc;

  float f = val / max(wt, 0.0001);
  if (u_variant == 1 || u_variant == 6) f = smoothstep(0.18, 0.88, f);
  if (u_variant == 3) f = 1.0 - f * 0.88;
  return clamp(f, 0.0, 1.0);
}

float field(vec2 uv) {
  return (u_gsrc == 0) ? smoothField(uv) : blobField(uv);
}

// ── Pane coordinate helpers ───────────────────────────────────────────────────
// Decompose uv into (pane-axis, perp) coordinate system rotated by ang.
// t  = fractional position within pane [0, 1]
// pI = pane index (float)
// perp = coordinate along the pane (perpendicular to refraction axis)
void paneTF(vec2 uv, float N, float ang,
            out float t, out float pI, out float perp) {
  float ca   = cos(ang), sa = sin(ang);
  float axis = ca * uv.x + sa * uv.y;
  perp       = -sa * uv.x + ca * uv.y;
  float px   = axis * N;
  t  = fract(px);
  pI = floor(px);
}

// Rotate displacement from (axis-dir, perp-dir) back to screen (x, y).
vec2 paneToScreen(float dAxis, float dPerp, float ang) {
  float ca = cos(ang), sa = sin(ang);
  return vec2(ca * dAxis - sa * dPerp, sa * dAxis + ca * dPerp);
}

// ── Clear glass displacement ──────────────────────────────────────────────────
// Cylindrical glass rod refraction: cubic amplification near pane edges
// creates the dramatic colour-shift that makes glass look real, not just striped.
vec2 clearGlassDisp(vec2 uv) {
  float N   = floor(u_density * 18.0 + 28.0);
  float ang = u_glassAngle * 1.5708;
  float t, pI, perp;
  paneTF(uv, N, ang, t, pI, perp);

  float rnd   = hash(vec2(pI, floor(u_seed * 997.0)));
  float phase = pI * 2.39996 + u_seed * 6.28318 + u_time * 0.085;

  float c  = t - 0.5;                       // −0.5 … +0.5 across the pane
  float nc = clamp(c * 2.0, -0.985, 0.985); // −1 … +1

  // Refraction: cubic boost near edges mimics Snell's law at steep incidence.
  // At centre (nc≈0): near-linear, mild shift.
  // Near edges (|nc|→1): amplified by nc³ factor → colours from neighbouring
  // panes "spill through" the glass, giving a realistic wall-of-glass look.
  float refract   = nc * (1.0 + nc * nc * 1.65);
  float thickness = 0.72 + rnd * 0.56;

  float dAxis  = -refract * u_strength * (0.28 / sqrt(N)) * thickness;

  // Gentle vertical oscillation — panes breathe slightly and aren't perfectly rigid
  float breathe = sin(c * 3.14159) * sin(perp * 4.0 + phase) * 0.018 * u_strength;
  float drift   = sin(phase * 0.72 + pI * 1.31) * 0.007 * u_strength;
  float dPerp   = breathe + drift;

  return paneToScreen(dAxis, dPerp, ang);
}

// ── Clear glass surface highlight ─────────────────────────────────────────────
// Caustic line at inner edge + directional specular + trailing shadow.
float glassHighlight(vec2 uv) {
  if (u_specular < 0.02) return 0.0;
  float N   = floor(u_density * 18.0 + 28.0);
  float ang = u_glassAngle * 1.5708;
  float t, pI, perp;
  paneTF(uv, N, ang, t, pI, perp);

  // Directional specular: surface normal from cylindrical geometry
  float spec   = pow(max(0.0, 1.0 - t * 3.4), 2.4) * 0.12;

  // Caustic: bright concentrated line at the inner glass face
  float caus   = exp(-pow(t - 0.050, 2.0) * 260.0) * 0.24;
  caus        += exp(-pow(t - 0.110, 2.0) * 95.0)  * 0.10;

  // Secondary reflection on far face
  float refl   = exp(-pow(1.0 - t, 2.0) * 260.0) * 0.07;

  // Shadow: trailing dark edge
  float shadow = -exp(-pow(1.0 - t, 2.0) * 68.0) * 0.09;

  return (spec + caus + refl + shadow) * u_specular;
}

// ── Ripple displacement ────────────────────────────────────────────────────────
// Isotropic two-octave value noise — no regular pane structure.
// u_density controls noise scale (coarser / finer texture).
vec2 legacyDiffuseDisp(vec2 uv) {
  // Diffuse mode: broad Gaussian-prism displacement.
  // Avoid high-frequency value-noise grids, which read as muddy pixels.
  float t = u_time * 0.018 + u_seed * 6.28318;
  float lowA = vnoise(uv * 1.18 + vec2(cos(t), sin(t)) * 0.18);
  float lowB = vnoise(uv * 1.72 + vec2(3.1 + sin(t*0.7), 1.7 + cos(t*0.9)));
  float lowC = vnoise(uv * 2.35 + vec2(7.2, 4.4) + vec2(cos(t*0.5), sin(t*0.6)) * 0.12);
  vec2 swirl = vec2(
    sin((uv.y + lowA * 0.42) * 6.28318 + t) + cos((uv.x + lowB * 0.35) * 5.10 - t * 0.7),
    cos((uv.x - lowB * 0.40) * 6.28318 - t * 0.6) + sin((uv.y + lowC * 0.28) * 5.40 + t * 0.4)
  );
  vec2 haze = vec2(lowA - 0.5, lowB - 0.5) * 1.65 + swirl * 0.28;
  return haze * u_strength * (0.052 + u_density * 0.026);
}

// Milky brightness scatter for ripple surface
float legacyDiffuseOverlay(vec2 uv) {
  if (u_specular < 0.02) return 0.0;
  float t = u_time * 0.014 + u_seed * 3.1;
  float bloom = vnoise(uv * 1.45 + vec2(cos(t), sin(t)) * 0.25);
  float veil  = vnoise(uv * 2.15 + vec2(4.1, 2.6) - vec2(sin(t*.7), cos(t*.8)) * 0.18);
  float softVein = smoothstep(0.30, 0.92, bloom * 0.62 + veil * 0.38);
  return (softVein * 0.18 + bloom * 0.10) * u_specular;
}

// ── Water glass displacement ───────────────────────────────────────────────────
// Fewer, wider irregular channels — each one bulges and flows like a water lens.
// Heavy cubic refraction at pane centre gives strong "bulging water column" look.
// A slow trickle component makes each channel flow independently down the glass.
vec2 waterGlassDisp(vec2 uv) {
  float N   = floor(u_density * 8.0 + 10.0);
  float ang = u_glassAngle * 1.5708;
  float t, pI, perp;
  paneTF(uv, N, ang, t, pI, perp);

  float rnd    = hash(vec2(pI,        u_seed * 11.0));
  float rnd2   = hash(vec2(pI + 0.31, u_seed *  7.0));
  float rnd3   = hash(vec2(pI + 0.77, u_seed *  3.3));

  // Each channel has its own slowly-drifting water bulge
  float drift   = u_time * (0.18 + rnd * 0.22) + rnd2 * 6.28318;
  float trickle = sin(drift)             * 0.55
                + sin(drift * 1.7 + 0.9) * 0.30
                + sin(drift * 3.1 - 0.4) * 0.15;

  // Lens refraction: cubic profile — strong bulge, sharp edge correction
  float c   = (t - 0.5) * 2.0;                     // −1..+1 across pane
  float lens = c * (1.0 + c * c * 2.20);           // cubic Snell-ish

  // Width variation: narrow and wide channels mixed for organic feel
  float widthVar = 0.72 + rnd3 * 0.56;

  // Primary horizontal (axis) shift — strong enough to clearly see refraction
  float dAxis = -lens * widthVar * u_strength * (0.62 / sqrt(N));

  // Perpendicular flow: the water column itself drifts along the glass
  float dPerp  = trickle * 0.045 * u_strength;

  return paneToScreen(dAxis, dPerp, ang);
}

// Water glass surface highlights — edge gleam + flowing water-drop caustics
float waterHighlight(vec2 uv) {
  if (u_specular < 0.02) return 0.0;
  float N   = floor(u_density * 14.0 + 20.0);
  float ang = u_glassAngle * 1.5708;
  float t, pI, perp;
  paneTF(uv, N, ang, t, pI, perp);

  float rnd   = hash(vec2(pI,        u_seed * 11.0));
  float rnd2  = hash(vec2(pI + 0.31, u_seed *  7.0));
  float drift = u_time * (0.18 + rnd * 0.22) + rnd2 * 6.28318;
  float flow  = sin(drift) * 0.5 + sin(drift * 1.7) * 0.3;

  // Sharp bright edge on leading side of each pane
  float edge  = exp(-pow(t - 0.045, 2.0) * 260.0) * 0.30;
  // Soft trailing specular
  float spec  = pow(max(0.0, 1.0 - t * 3.2), 2.2) * 0.10;
  // Flowing caustic bead — moves along the pane with the water flow
  float beadY = 0.32 + flow * 0.18;
  float bead  = exp(-pow(t - beadY, 2.0) * 180.0) * (0.5 + flow * 0.3) * 0.09;
  // Dark shadow on trailing edge for depth
  float shadow = -exp(-pow(1.0 - t, 2.0) * 90.0) * 0.07;

  return (edge + spec + bead + shadow) * u_specular;
}

// ── Ripple displacement prototype ─────────────────────────────────────────────
vec2 rippleDisp(vec2 uv);

// ── Glass / form dispatcher ───────────────────────────────────────────────────
vec2 glassDisp(vec2 uv) {
  if (u_glassType == 1) return rippleDisp(uv);       // Ripple form, formerly Formation → Ripple
  if (u_glassType == 3) return waterGlassDisp(uv);
  return clearGlassDisp(uv); // 0=clear, 2=prism shares clear geometry
}

// ── Ripple displacement ───────────────────────────────────────────────────────
// Three circular wave sources at 120° create interference ripples.
// Gradient is sampled at displaced UV — it bends, no rings are drawn.
vec2 rippleDisp(vec2 uv) {
  float sp   = u_vdist * 0.52 + 0.20;
  float sz   = u_vsize * 0.72 + 0.42;
  float a0   = u_seed * 6.28318 + u_time * 0.18;
  float freq = 5.5 + 10.0 * sp;
  float amp  = u_strength * u_strength * 0.135;

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

  float vertical = sin((uv.x * (10.0 + sp * 20.0) + uv.y * 2.0 + u_seed) * 6.28318);
  d.y += vertical * 0.55;

  // Cursor and click response restored for the Ripple form.
  // This is intentionally inside rippleDisp(), not the glass dispatcher, so
  // Clear / Prism / Reflected keep their calmer glass behaviour.
  if (u_mouseActive > 0.5) {
    vec2 asp = vec2(u_res.x / u_res.y, 1.0);
    vec2 mp = mix(u_mouseRaw, u_mouse, 0.55);
    vec2 md = (uv - mp) * asp;
    float mr = length(md) + 0.0001;
    vec2 mg = normalize(md) / asp;

    float cursorWake = sin(mr * (18.0 + sp * 16.0) - u_time * 1.12) * exp(-mr * 2.85);
    float clickWake  = sin(mr * 26.0 - u_clickPulse * 9.0) * exp(-mr * 3.10) * u_clickPulse;

    d += mg * (cursorWake * 0.42 + clickWake * 1.15);
  }

  return d * amp;
}

// ── Mouse magnet — warps the FIELD (gradient) under the glass toward cursor ───
// Glass panes stay rigid; only the colours beneath are sucked toward the mouse.
vec2 mouseMagnet(vec2 uv) {
  if (u_mouseActive < 0.5) return vec2(0.0);

  vec2 asp = vec2(u_res.x / u_res.y, 1.0);
  vec2 p   = (uv - 0.5) * asp;

  // Mix raw cursor position with the smoothed/chaotic cursor value.
  // This makes the abstract gradient feel more physically pulled by movement.
  vec2 m = (mix(u_mouseRaw, u_mouse, 0.62) - 0.5) * asp;

  vec2 diff = m - p;
  float dist = length(diff);

  // Older Formation → Ripple behaviour: tighter, more physical cursor pull.
  // Keep this restrained for glass, but it gives Ripple its former mouse response.
  float pull =
      exp(-dist * dist * 3.0) * 0.34 +
      exp(-dist * dist * 0.48) * 0.11;

  return (diff / asp) * pull;
}

// ── 9-tap cross blur ──────────────────────────────────────────────────────────
vec3 blurSample(vec2 d) {
  float br = u_blur * u_blur * 0.090;
  vec3 col  = pal(field(d))                       * 0.24;
  col += pal(field(d + vec2( br,  0.0)))          * 0.10;
  col += pal(field(d + vec2(-br,  0.0)))          * 0.10;
  col += pal(field(d + vec2( 0.0,  br)))          * 0.10;
  col += pal(field(d + vec2( 0.0, -br)))          * 0.10;
  col += pal(field(d + vec2( br,  br) * 0.72))   * 0.09;
  col += pal(field(d + vec2(-br, -br) * 0.72))   * 0.09;
  col += pal(field(d + vec2( br, -br) * 0.72))   * 0.09;
  col += pal(field(d + vec2(-br,  br) * 0.72))   * 0.09;
  return col;
}

// ── Main ──────────────────────────────────────────────────────────────────────
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;

  // Stretch 8% beyond viewport edges
  vec2 sv = uv * 1.16 - 0.08;

  // Displacement: glass (all types) or ripple
  vec2 disp = (u_form == 0) ? glassDisp(sv) : rippleDisp(sv);

  // Magnet warps the gradient field beneath the glass toward the cursor.
  // Glass panes are unaffected — only the colours seen through them move.
  vec2 d = sv + disp + mouseMagnet(uv);

  // ── Colour sampling ────────────────────────────────────────────────────────
  vec3 col;

  if (u_form == 0 && u_glassType == 2) {
    // Prism glass: chromatic aberration — R/B channels displaced along
    // refraction direction, creating rainbow fringe at pane edges.
    float caSep    = u_specular * 0.026 + 0.012;
    vec2  dispDir  = length(disp) > 0.001 ? normalize(disp) : vec2(1.0, 0.0);
    col = blurSample(d);
    float rV = field(d + dispDir * caSep * 2.8);
    float gV = field(d + vec2(-dispDir.y, dispDir.x) * caSep * 0.8);
    float bV = field(d - dispDir * caSep * 1.9);
    col.r = mix(col.r, pal(rV).r, 0.86);
    col.g = mix(col.g, pal(gV).g, 0.32);
    col.b = mix(col.b, pal(bV).b, 0.82);

    // Prismatic edge highlight: restrained iridescent caustic line.
    float N_p  = floor(u_density * 18.0 + 28.0);
    float ap   = u_glassAngle * 1.5708;
    float t_p  = fract((cos(ap) * sv.x + sin(ap) * sv.y) * N_p);
    float edgeW = exp(-pow(t_p - 0.055, 2.0) * 230.0) * u_specular;
    float hue   = t_p * 18.8496 + u_seed * 2.3;
    vec3  rainbow = vec3(sin(hue)*0.5+0.5, sin(hue+2.094)*0.5+0.5, sin(hue+4.189)*0.5+0.5);
    col = mix(col, col + rainbow * edgeW * 0.46, 0.84);

  } else {
    col = blurSample(d);

    // Ripple form uses the former Formation ripple displacement directly.
    // No extra ripple/noise/gaussian overlay is applied here.
  }

  // ── Glass surface highlights ───────────────────────────────────────────────
  if (u_form == 0) {
    float h;
    if      (u_glassType == 0 || u_glassType == 2) { h = glassHighlight(sv); }
    else if (u_glassType == 1)                      { h = waterHighlight(sv) * 0.45; }
    else                                             { h = waterHighlight(sv); }
    col += vec3(h);
  }

  // ── Contrast ──────────────────────────────────────────────────────────────
  float c = u_contrast * 1.60 + 0.20;
  col = (col - 0.5) * c + 0.5;

  // ── B&W ───────────────────────────────────────────────────────────────────
  if (u_bw > 0.5) {
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = vec3(lum);
  }

  // ── Invert ────────────────────────────────────────────────────────────────
  if (u_invert > 0.5) col = 1.0 - col;

  // ── Vignette ──────────────────────────────────────────────────────────────
  if (u_vignette > 0.01) {
    vec2 vigUV = uv - 0.5;
    // Portrait-fair: stretch the shorter axis so the vignette stays circular
    // in both orientations instead of pinching horizontally on mobile.
    float vAR = u_res.x / max(u_res.y, 1.0);
    if (vAR >= 1.0) vigUV.x *= vAR;
    else            vigUV.y /= max(vAR, 0.0001);
    col *= 1.0 - smoothstep(0.28, 0.82, length(vigUV)) * u_vignette * 0.92;
  }

  // ── Film grain ────────────────────────────────────────────────────────────
  // Pixel-scale monochrome grit. Stronger upper range, no coarse cell layer.
  float lumG = dot(col, vec3(0.299, 0.587, 0.114));
  col += vec3(nymphFilmGrain(gl_FragCoord.xy, u_seed, u_grain, lumG));

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

  // ═══════════════════════════════════════════════════════════════════════════
  // parsePalette
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
        r = parseInt(h.slice(0, 2), 16) / 255;
        g = parseInt(h.slice(2, 4), 16) / 255;
        b = parseInt(h.slice(4, 6), 16) / 255;
        hex = c;
      } else if (Array.isArray(c) && c.length >= 3) {
        r = c[0] / 255; g = c[1] / 255; b = c[2] / 255;
        hex = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
      } else if (c && typeof c === 'object' && c.hex) {
        const h = (c.hex || '').replace('#', '');
        r = parseInt(h.slice(0, 2), 16) / 255;
        g = parseInt(h.slice(2, 4), 16) / 255;
        b = parseInt(h.slice(4, 6), 16) / 255;
        hex = c.hex;
      }

      if (isNaN(r)) r = 0.5;
      if (isNaN(g)) g = 0.5;
      if (isNaN(b)) b = 0.5;

      flat.push(r, g, b);
      hexes.push(hex);
    });

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
  // drawPreview — Canvas 2D formation thumbnail
  // formIdx: 0=glass, 1=ripple   glassType: 'clear'|'ripple'|'prism'|'water'
  // ═══════════════════════════════════════════════════════════════════════════
  function drawPreview(canvas, formIdx, palette, glassType) {
    var W = canvas.width  = canvas.offsetWidth  || 80;
    var H = canvas.height = canvas.offsetHeight || 52;
    if (W < 4 || H < 4) return;

    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var info  = parsePalette(palette);
    var hexes = info.hexes;
    var nC    = Math.max(2, hexes.length);

    // Base left→right gradient
    var grd = ctx.createLinearGradient(0, 0, W, 0);
    hexes.forEach(function (c, i) { grd.addColorStop(i / (nC - 1), c); });
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    if (formIdx === 0) {
      var gt = glassType || 'clear';
      var N  = 5;

      if (gt === 'ripple') {
        // Ripple preview: interference waves from the former Formation → Ripple mode.
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (var r = 0; r < 9; r++) {
          ctx.beginPath();
          ctx.arc(W * 0.44, H * 0.50, 8 + r * 8, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255,255,255,' + (0.16 - r * 0.010) + ')';
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }
        for (var q = 0; q < 7; q++) {
          ctx.beginPath();
          ctx.arc(W * 0.68, H * 0.36, 6 + q * 9, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(120,220,255,' + (0.12 - q * 0.010) + ')';
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
        ctx.restore();

      } else if (gt === 'prism') {
        for (var i = 0; i < N; i++) {
          var x0 = (i / N) * W;
          var pw = W / N;
          var shift = (i - (N - 1) / 2) * pw * 0.72;
          var g2 = ctx.createLinearGradient(-shift, 0, W - shift, 0);
          hexes.forEach(function (c, j) { g2.addColorStop(j / (nC - 1), c); });
          ctx.save();
          ctx.beginPath(); ctx.rect(x0, 0, pw, H); ctx.clip();
          ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
          // Rainbow caustic stripe
          var rg = ctx.createLinearGradient(0, 0, 0, H);
          rg.addColorStop(0.0,  'rgba(255, 60,120,0.72)');
          rg.addColorStop(0.25, 'rgba(80, 200,255,0.72)');
          rg.addColorStop(0.55, 'rgba(255,220, 40,0.72)');
          rg.addColorStop(0.80, 'rgba(120, 60,255,0.72)');
          rg.addColorStop(1.0,  'rgba(255, 60,120,0.72)');
          ctx.fillStyle = rg;
          ctx.fillRect(x0, 0, 2.5, H);
          ctx.restore();
        }

      } else if (gt === 'water') {
        for (var i = 0; i < N; i++) {
          var x0 = (i / N) * W;
          var pw = W / N;
          var wavyShift = (i - (N - 1) / 2) * pw * 0.60;
          wavyShift += Math.sin(i * 1.9 + 0.5) * pw * 0.18;
          var g2 = ctx.createLinearGradient(-wavyShift, 0, W - wavyShift, 0);
          hexes.forEach(function (c, j) { g2.addColorStop(j / (nC - 1), c); });
          ctx.save();
          ctx.beginPath(); ctx.rect(x0, 0, pw, H); ctx.clip();
          ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = 'rgba(255,255,255,0.28)';
          ctx.fillRect(x0, 0, 2, H);
          // Dark shadow trailing edge
          ctx.fillStyle = 'rgba(0,0,0,0.14)';
          ctx.fillRect(x0 + pw - 3, 0, 3, H);
          ctx.restore();
        }

      } else {
        // Clear glass — shifted panes with caustic highlights
        for (var i = 0; i < N; i++) {
          var x0    = (i / N) * W;
          var pw    = W / N;
          var shift = (i - (N - 1) / 2) * pw * 0.75;
          var g2    = ctx.createLinearGradient(-shift, 0, W - shift, 0);
          hexes.forEach(function (c, j) { g2.addColorStop(j / (nC - 1), c); });
          ctx.save();
          ctx.beginPath(); ctx.rect(x0, 0, pw, H); ctx.clip();
          ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
          // Bright caustic + specular
          var hg = ctx.createLinearGradient(x0, 0, x0 + pw * 0.35, 0);
          hg.addColorStop(0,   'rgba(255,255,255,0.42)');
          hg.addColorStop(0.2, 'rgba(255,255,255,0.18)');
          hg.addColorStop(1,   'rgba(255,255,255,0.00)');
          ctx.fillStyle = hg;
          ctx.fillRect(x0, 0, pw, H);
          // Shadow trailing edge
          ctx.fillStyle = 'rgba(0,0,0,0.12)';
          ctx.fillRect(x0 + pw - 4, 0, 4, H);
          ctx.restore();
        }
      }

    } else {
      // Ripple preview
      try {
        var img = ctx.getImageData(0, 0, W, H);
        var src = new Uint8ClampedArray(img.data);
        for (var x = 0; x < W; x++) {
          var wave = Math.sin((x / W) * Math.PI * 5) * 0.14;
          var sx   = Math.min(Math.max(Math.round(x + wave * W * 0.15), 0), W - 1);
          for (var y = 0; y < H; y++) {
            var di = (y * W + x)  * 4;
            var si = (y * W + sx) * 4;
            img.data[di    ] = src[si    ];
            img.data[di + 1] = src[si + 1];
            img.data[di + 2] = src[si + 2];
            img.data[di + 3] = 255;
          }
        }
        ctx.putImageData(img, 0, 0);
      } catch (e) {}
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // initGL
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

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, -1, 1, 1, -1, 1]),
      gl.STATIC_DRAW
    );

    const uLoc = {};
    [
      'u_res','u_form','u_glassType','u_gsrc','u_variant',
      'u_pal','u_palN','u_density','u_strength',
      'u_blur','u_vdist','u_vsize','u_contrast','u_grain',
      'u_bw','u_invert','u_seed','u_time',
      'u_mouse','u_mouseRaw','u_clickPulse','u_mouseActive',
      'u_glassAngle','u_specular','u_vignette',
    ].forEach(function (n) { uLoc[n] = gl.getUniformLocation(prog, n); });

    return { gl, prog, buf, aPos: gl.getAttribLocation(prog, 'a_pos'), uLoc };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // applyAbstractFrame — shared per-frame uniform application
  // Used by BOTH the live on-screen draw loop and the offscreen high-res
  // export renderer below, so there is exactly one place that decides what
  // the GPU sees. canvasW/canvasH is the render resolution (may be far
  // larger than the on-screen canvas); time/mouse/pulse/mouseActive is the
  // interaction state to render — the live values for the on-screen canvas,
  // or a frozen snapshot for export so a later high-res render always
  // matches what was saved.
  // ═══════════════════════════════════════════════════════════════════════════
  function applyAbstractFrame(gl, prog, uLoc, buf, aPos, canvasW, canvasH, tweaksState, time, mouse, pulse, mouseActive) {
    const st = getAbstractState(tweaksState);
    const p  = parsePalette(st.colors);

    gl.viewport(0, 0, canvasW, canvasH);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    gl.uniform2f(uLoc.u_res, canvasW, canvasH);
    gl.uniform1i(uLoc.u_form,      toFormationIndex(st.formation));
    gl.uniform1i(uLoc.u_glassType, toGlassTypeIndex(st.glassType));
    gl.uniform1i(uLoc.u_gsrc,      toGradientSourceIndex(st.gradientSource));
    gl.uniform1i(uLoc.u_variant,   st.variant || 0);
    gl.uniform3fv(uLoc.u_pal,      p.flat);
    gl.uniform1i(uLoc.u_palN,      p.count);

    gl.uniform1f(uLoc.u_density,   st.glassDensity);
    gl.uniform1f(uLoc.u_strength,  st.rippleStrength);
    gl.uniform1f(uLoc.u_blur,      st.blur);
    gl.uniform1f(uLoc.u_vdist,     st.vectorDistance);
    gl.uniform1f(uLoc.u_vsize,     st.vectorSize);
    gl.uniform1f(uLoc.u_contrast,  st.contrast);
    gl.uniform1f(uLoc.u_grain,     st.grain);
    gl.uniform1f(uLoc.u_bw,        st.bw     ? 1.0 : 0.0);
    gl.uniform1f(uLoc.u_invert,    st.invert ? 1.0 : 0.0);
    gl.uniform1f(uLoc.u_seed,      Number(st.seed) || 0.12345);
    gl.uniform1f(uLoc.u_glassAngle, st.glassAngle || 0);
    gl.uniform1f(uLoc.u_specular,  st.specular !== undefined ? st.specular : 0.68);
    gl.uniform1f(uLoc.u_vignette,  st.vignette || 0);

    gl.uniform1f(uLoc.u_time, time || 0);

    const m = mouse || { x: 0.5, y: 0.5, chaosX: 0.5, chaosY: 0.5 };
    gl.uniform2f(uLoc.u_mouse,       Number(m.chaosX) || Number(m.x) || 0.5,  1.0 - (Number(m.chaosY) || Number(m.y) || 0.5));
    gl.uniform2f(uLoc.u_mouseRaw,    Number(m.x) || 0.5,                       1.0 - (Number(m.y) || 0.5));
    gl.uniform1f(uLoc.u_clickPulse,  pulse || 0);
    gl.uniform1f(uLoc.u_mouseActive, mouseActive == null ? 1.0 : mouseActive);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // renderAbstractOffscreen — offscreen high-res export renderer
  // Renders Abstract natively at the exact requested export resolution on a
  // throwaway canvas/WebGL context, independent of whatever canvas is
  // currently mounted on screen. This is what lets the Export panel produce
  // a true 2K/4K/etc. image instead of upscaling a small saved preview,
  // keeps Grain procedural at full resolution instead of stretched into
  // square blocks, and avoids touching the live, still-animating on-screen
  // canvas (a known Safari stale-canvas trouble spot).
  // ═══════════════════════════════════════════════════════════════════════════
  function renderAbstractOffscreen(tweaksState, renderState, width, height) {
    if (!tweaksState) return null;
    const w = Math.max(1, Math.round(width) || 3840);
    const h = Math.max(1, Math.round(height) || 2160);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const glState = initGL(canvas);
    if (!glState) return null;
    const { gl, prog, buf, aPos, uLoc } = glState;
    const rs = renderState || {};
    const mouse = rs.mouse || { x: 0.5, y: 0.5, chaosX: 0.5, chaosY: 0.5 };
    const time = Number.isFinite(rs.time) ? rs.time : 0;
    const pulse = Number.isFinite(rs.pulse) ? rs.pulse : 0;
    const mouseActive = rs.mouseActive == null ? 1.0 : rs.mouseActive;
    applyAbstractFrame(gl, prog, uLoc, buf, aPos, w, h, tweaksState, time, mouse, pulse, mouseActive);
    const dataUrl = canvas.toDataURL('image/png');
    try { gl.deleteProgram(prog); gl.deleteBuffer(buf); } catch (e) {}
    const loseCtx = gl.getExtension('WEBGL_lose_context');
    if (loseCtx) loseCtx.loseContext();
    return dataUrl;
  }
  window.NurrAbstractRenderToDataURL = renderAbstractOffscreen;

  // ═══════════════════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════════════════
  function clamp01(v, fallback) {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.max(0, Math.min(1, n));
    return fallback !== undefined ? fallback : 0;
  }

  function toFormationIndex(v) {
    return v === 'ripple' || v === 1 ? 1 : 0;
  }

  function toGradientSourceIndex(v) {
    return v === 'blob' || v === 1 ? 1 : 0;
  }

  function toGlassTypeIndex(v) {
    // Glass surface types only. Ripple is not a glass type: it is the old
    // Formation → Ripple mode, now exposed inside the Form selector.
    if (v === 'prism'  || v === 2) return 2;
    if (v === 'water' || v === 'reflected' || v === 3) return 3;
    return 0; // clear
  }

  function normalizeAbstractGlassType(v) {
    if (v === 'reflected') return 'water';
    if (v === 'prism' || v === 'water') return v;
    return 'clear';
  }

  function normalizeAbstractFormation(v, glassType) {
    // Backwards compatibility: older versions stored Ripple as glassType.
    if (v === 'ripple' || v === 1 || glassType === 'ripple' || glassType === 'frost' || glassType === 'diffuse') return 'ripple';
    return 'glass';
  }

  function getAbstractState(tweaks) {
    const d = window.ABSTRACT_DEFAULTS || {};
    const def = function(key, fallback) {
      const tv = tweaks && tweaks[key] !== undefined ? tweaks[key] : undefined;
      return tv !== undefined ? tv : (d[key] !== undefined ? d[key] : fallback);
    };

    const rawFormation = def('formation', 'glass');
    const rawGlassType = def('glassType', 'clear');
    const formation = normalizeAbstractFormation(rawFormation, rawGlassType);

    return {
      formation:      formation,
      glassType:      normalizeAbstractGlassType(rawGlassType),
      gradientSource: def('gradientSource', 'smooth'),
      variant:        def('variant',        0),
      colors:         (tweaks && Array.isArray(tweaks.colors)) ? tweaks.colors
                      : (Array.isArray(d.colors) ? d.colors : ['#1a1a3e','#3a1060','#0e3a7a','#601040']),
      glassDensity:   clamp01(def('glassDensity',  0.55)),
      rippleStrength: clamp01(def('rippleStrength', 0.62)),
      blur:           clamp01(def('blur',           0.35)),
      glassAngle:     clamp01(def('glassAngle',     1.0)),
      specular:       clamp01(def('specular',       0.68)),
      animSpeed:      Math.max(0, Math.min(2, Number(def('animSpeed', 1.0)) || 1.0)),
      vignette:       clamp01(def('vignette',       0.0)),
      vectorDistance: clamp01(def('vectorDistance', 0.50)),
      vectorSize:     clamp01(def('vectorSize',     0.50)),
      contrast:       clamp01(def('contrast',       0.50)),
      grain:          clamp01(def('grain',          0.14)),
      bw:             !!(def('bw', false)),
      invert:         !!(def('invert', false)),
      seed:           def('seed', 0.12345),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AbstractMode — React component (WebGL canvas)
  // ═══════════════════════════════════════════════════════════════════════════
  function AbstractMode(props) {
    const tweaks          = props.tweaks || {};
    const registerSnapshot = props.registerSnapshot || function () {};
    const mouseRef        = props.mouseRef || { current: { x: 0.5, y: 0.5, chaosX: 0.5, chaosY: 0.5 } };

    const canvasRef  = useRef(null);
    const glRef      = useRef(null);
    const stateRef   = useRef(tweaks);
    const runtimeRef = useRef({ pulse: 0, positionPaused: false, pausedT: 0, pausedMouse: null, mouseLocked: false, lockedMouse: null, lastT: 0, clickTimer: null });

    function drawFrame() {
      const bundle = glRef.current;
      const canvas = canvasRef.current;
      if (!bundle || !canvas) return;

      const { gl, prog, buf, aPos, uLoc } = bundle;
      const tweaksState = stateRef.current || tweaks;
      const st = getAbstractState(tweaksState);

      // One click freezes the abstract effect. Double click locks/unlocks mouse tracking.
      const animSpeed = st.animSpeed !== undefined ? Math.max(0, st.animSpeed) : 1.0;
      const now       = window.__NURR_T ?? performance.now() / 1000;
      const rt        = runtimeRef.current;
      const t         = rt.positionPaused ? rt.pausedT : now * animSpeed;
      if (!rt.positionPaused) rt.lastT = t;

      const liveMouse = mouseRef.current || { x: 0.5, y: 0.5, chaosX: 0.5, chaosY: 0.5 };
      const m = rt.positionPaused && rt.pausedMouse
        ? rt.pausedMouse
        : (rt.mouseLocked && rt.lockedMouse ? rt.lockedMouse : liveMouse);
      const mouseActive = rt.positionPaused ? 0.0 : 1.0;

      // Single shared uniform/draw path — see applyAbstractFrame above.
      applyAbstractFrame(gl, prog, uLoc, buf, aPos, canvas.width, canvas.height, tweaksState, t, m, rt.pulse || 0, mouseActive);
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
        canvas.width  = Math.round(window.innerWidth  * dpr);
        canvas.height = Math.round(window.innerHeight * dpr);
        canvas.style.width  = window.innerWidth  + 'px';
        canvas.style.height = window.innerHeight + 'px';
        drawFrame();
      }

      resize();
      window.addEventListener('resize', resize);

      return function () {
        window.removeEventListener('resize', resize);
        const gs = glRef.current;
        if (gs) {
          try { gs.gl.deleteProgram(gs.prog); gs.gl.deleteBuffer(gs.buf); } catch (e) {}
        }
        glRef.current = null;
      };
    }, []);

    useEffect(function () {
      let raf;
      function tick() {
        // Click pulse is visual only: it decays independently from freeze /
        // mouse-lock state so Ripple can react to a click without stealing
        // the old formation behaviour.
        runtimeRef.current.pulse *= 0.935;
        if (runtimeRef.current.pulse < 0.002) runtimeRef.current.pulse = 0;
        drawFrame();
        raf = requestAnimationFrame(tick);
      }
      raf = requestAnimationFrame(tick);
      return function () { cancelAnimationFrame(raf); };
    }, []);

    useEffect(function () {
      function isInterfaceEvent(e) {
        return !!(e.target && e.target.closest &&
          e.target.closest('.panel,.icon-btn,.rail,.layout-card,.palette-card,.nature-thumb,.swatch,.color-wheel-card,.eyedropper-follow,.abstract-form-btn,button,input,select,textarea,label,.drop-zone,.nymph-landing'));
      }
      function mouseFromEvent(e) {
        const live = mouseRef.current || { x: 0.5, y: 0.5, chaosX: 0.5, chaosY: 0.5 };
        return { x: live.x ?? 0.5, y: live.y ?? 0.5, chaosX: live.chaosX ?? live.x ?? 0.5, chaosY: live.chaosY ?? live.y ?? 0.5 };
      }
      function onClick(e) {
        if (isInterfaceEvent(e)) return;
        const rt = runtimeRef.current;
        if (rt.clickTimer) clearTimeout(rt.clickTimer);
        rt.clickTimer = setTimeout(function () {
          rt.pulse = 1.0;
          rt.positionPaused = !rt.positionPaused;
          if (rt.positionPaused) {
            rt.pausedT = rt.lastT;
            rt.pausedMouse = mouseFromEvent(e);
          } else {
            rt.pausedMouse = null;
          }
          rt.clickTimer = null;
          drawFrame();
        }, 210);
      }
      function onDoubleClick(e) {
        if (isInterfaceEvent(e)) return;
        const rt = runtimeRef.current;
        if (rt.clickTimer) { clearTimeout(rt.clickTimer); rt.clickTimer = null; }
        rt.mouseLocked = !rt.mouseLocked;
        rt.lockedMouse = rt.mouseLocked ? mouseFromEvent(e) : null;
        // Double click only locks/unlocks cursor tracking; it returns the module to live motion.
        rt.positionPaused = false;
        rt.pausedMouse = null;
        rt.pausedT = 0;
        rt.pulse = 0.45;
        drawFrame();
        e.preventDefault();
      }
      window.addEventListener('click', onClick);
      window.addEventListener('dblclick', onDoubleClick);
      return function () {
        window.removeEventListener('click', onClick);
        window.removeEventListener('dblclick', onDoubleClick);
        if (runtimeRef.current.clickTimer) clearTimeout(runtimeRef.current.clickTimer);
      };
    }, []);

    useEffect(function () {
      registerSnapshot(function (opts) {
        opts = opts || {};
        const canvas = canvasRef.current;
        if (!canvas) return null;

        // Every snapshot — thumbnail, direct download, or (via app.js) a
        // matrix export — now renders through the same offscreen path
        // (renderAbstractOffscreen / applyAbstractFrame). The on-screen
        // canvas is never resized for this, which removes the resize/
        // restore race against the live rAF loop and the Safari
        // stale-canvas behaviour that race could trigger.
        const rt = runtimeRef.current;
        const tweaksState = stateRef.current || tweaks;
        const st = getAbstractState(tweaksState);
        const animSpeed = st.animSpeed !== undefined ? Math.max(0, st.animSpeed) : 1.0;
        const now = window.__NURR_T ?? performance.now() / 1000;
        const time = rt.positionPaused ? rt.pausedT : now * animSpeed;
        const liveMouse = mouseRef.current || { x: 0.5, y: 0.5, chaosX: 0.5, chaosY: 0.5 };
        const mouse = rt.positionPaused && rt.pausedMouse
          ? rt.pausedMouse
          : (rt.mouseLocked && rt.lockedMouse ? rt.lockedMouse : liveMouse);
        const liveRenderState = {
          time: time,
          mouse: { x: mouse.x, y: mouse.y, chaosX: mouse.chaosX, chaosY: mouse.chaosY },
          pulse: rt.pulse || 0,
          mouseActive: rt.positionPaused ? 0.0 : 1.0
        };
        const renderState = opts.renderStateOverride || opts.renderState || liveRenderState;

        if (opts.captureRenderState) {
          // Library save flow: freeze this exact interaction state alongside
          // the small preview so a later export can reproduce the same
          // visual at full resolution.
          const w = opts.width || 960, h = opts.height || 540;
          const dataUrl = renderAbstractOffscreen(tweaksState, renderState, w, h);
          return dataUrl ? { dataUrl: dataUrl, renderState: renderState, tweaks: JSON.parse(JSON.stringify(tweaksState)) } : null;
        }

        const w = opts.width || 3840, h = opts.height || 2160;
        const dataUrl = renderAbstractOffscreen(tweaksState, renderState, w, h);
        if (!dataUrl) return null;

        if (!opts.returnDataUrl) {
          const a = document.createElement('a');
          a.download = opts.filename || ('abstract-' + w + 'x' + h + '-' + Date.now() + '.png');
          a.href = dataUrl;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
        }
        return dataUrl;
      });
    }, [registerSnapshot, tweaks]);

    return React.createElement('canvas', { ref: canvasRef, className: 'stage abstract-stage' });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AbstractControls — React component (sidebar panel)
  // ═══════════════════════════════════════════════════════════════════════════
  function AbstractControls(props) {
    const [presetsOpen, setPresetsOpen] = React.useState(false);
    const tweaks    = props.tweaks || {};
    const setTweaks = props.setTweaks || function () {};
    const st        = getAbstractState(tweaks);
    const PaletteEditor = window.NurrPaletteEditor;

    const prevGlass  = useRef(null);

    useEffect(function () {
      if (prevGlass.current)  drawPreview(prevGlass.current,  toFormationIndex(st.formation), st.colors, st.formation === 'ripple' ? 'ripple' : st.glassType);
    }, [st.colors, st.gradientSource, st.glassType, st.formation]);

    const pct = function (v) { return Math.round((v || 0) * 100); };

    // Context-aware display values
    const glassType    = st.glassType || 'clear';
    const selectedForm = st.formation === 'ripple' ? 'ripple' : glassType;
    const isRipple     = st.formation === 'ripple';
    const isGlass      = !isRipple;

    const paneN        = Math.round(st.glassDensity * 18 + 28);
    const densityLabel = isRipple ? 'waves' : paneN + ' panes';

    const angleVal    = st.glassAngle || 0;
    const angleLabel  = angleVal < 0.10 ? 'vertical'
                      : angleVal > 0.90 ? 'horizontal'
                      : Math.round(angleVal * 90) + '°';

    const speedVal   = st.animSpeed !== undefined ? st.animSpeed : 1.0;
    const speedLabel = speedVal < 0.05 ? 'paused'
                     : speedVal < 0.45 ? 'slow'
                     : speedVal > 1.55 ? 'fast'
                     : Math.round(speedVal * 100) + '%';

    // Generic slider — supports max > 1 for animSpeed
    function slider(key, label, valueLabel, maxVal) {
      const max   = maxVal || 1;
      const value = st[key] !== undefined ? st[key] : 0;
      return (
        React.createElement('div', { className: 'section', key: key },
          React.createElement('div', { className: 'section-label' },
            React.createElement('span', { className: 'name' }, label),
            React.createElement('span', { className: 'value' }, valueLabel !== undefined ? valueLabel : pct(value))
          ),
          React.createElement('input', {
            type: 'range',
            className: 'slider',
            min: '0',
            max: String(max),
            step: '0.01',
            value: value,
            onChange: function (e) {
              var patch = {};
              patch[key] = parseFloat(e.target.value);
              setTweaks(patch);
            }
          })
        )
      );
    }

    // Form buttons. Ripple keeps the old Formation → Ripple rendering path;
    // the other options use the glass renderer.
    const formTypes = [
      { id: 'clear', label: 'Clear',     sym: '|||', formation: 'glass',  glassType: 'clear' },
      { id: 'prism', label: 'Prism',     sym: '◈▕', formation: 'glass',  glassType: 'prism' },
      { id: 'water', label: 'Reflected', sym: '≋≋', formation: 'glass',  glassType: 'water' },
      { id: 'ripple', label: 'Ripple',   sym: '◉≈', formation: 'ripple', glassType: 'clear' },
    ];

    function randomizeAbstract() {
      var formPool = ['clear', 'clear', 'water', 'prism', 'ripple'];
      var presets = (window.WP && Array.isArray(window.WP.PALETTE_PRESETS)) ? window.WP.PALETTE_PRESETS : [];
      var pal = presets.length ? presets[Math.floor(Math.random() * presets.length)].slice(0, 4) : st.colors;
      var formChoice = formPool[Math.floor(Math.random() * formPool.length)];
      setTweaks({
        colors:         pal.slice(0, 4),
        seed:           Math.random(),
        variant:        Math.floor(Math.random() * 8),
        gradientSource: Math.random() > 0.46 ? 'blob' : 'smooth',
        glassAngle:     1.0,
        formation:      formChoice === 'ripple' ? 'ripple' : 'glass',
        glassType:      formChoice === 'ripple' ? 'clear' : formChoice,
        rippleStrength: 0.42 + Math.random() * 0.44,
        glassDensity:   0.34 + Math.random() * 0.42,
        specular:       0.40 + Math.random() * 0.52,
      });
    }

    return (
      React.createElement(React.Fragment, null,

        // ── Palette editor ──────────────────────────────────────────────────
        PaletteEditor && React.createElement(PaletteEditor, {
          colors: st.colors,
          setColors: function (next) { setTweaks({ colors: next.slice(0, 4) }); },
          minColors: 1,
          maxColors: 4,
          allowAdd: true,
          compact: true,
          extraActions: React.createElement(React.Fragment, null,
            React.createElement('button', {
              type: 'button',
              className: 'btn btn-italic abstract-randomize-btn',
              onClick: randomizeAbstract
            }, 'Randomize'),
            React.createElement('button', {
              type: 'button',
              className: 'btn abstract-transform-btn' + (st.bw ? ' active' : ''),
              onClick: function () { setTweaks({ bw: !st.bw }); }
            }, 'B&W'),
            React.createElement('button', {
              type: 'button',
              className: 'btn abstract-transform-btn' + (st.invert ? ' active' : ''),
              onClick: function () { setTweaks({ invert: !st.invert }); }
            }, 'Invert')
          ),
        }),

        // ── Form picker ────────────────────────
        React.createElement('div', { className: 'section abstract-form-section' },
          React.createElement('div', { className: 'section-label' },
            React.createElement('span', { className: 'name' }, 'Form'),
            React.createElement('span', { className: 'value' }, selectedForm)
          ),
          React.createElement('div', { className: 'glass-type-grid abstract-form-grid' },
            formTypes.map(function (gt) {
              return React.createElement('button', {
                key: gt.id,
                className: 'glass-type-btn abstract-form-btn' + (selectedForm === gt.id ? ' active' : ''),
                onClick: function () { setTweaks({ formation: gt.formation, glassType: gt.glassType }); },
                title: gt.label,
              },
                React.createElement('span', { className: 'gt-sym' }, gt.sym),
                React.createElement('span', { className: 'gt-label' }, gt.label)
              );
            })
          )
        ),

        // ── Gradient source ─────────────────────────────────────────────────
        React.createElement('div', { className: 'section' },
          React.createElement('div', { className: 'section-label' },
            React.createElement('span', { className: 'name' }, 'Gradient source'),
            React.createElement('span', { className: 'value' }, st.gradientSource)
          ),
          React.createElement('div', { className: 'seg' },
            React.createElement('button', {
              className: 'seg-opt' + (st.gradientSource === 'smooth' ? ' active' : ''),
              onClick: function () { setTweaks({ gradientSource: 'smooth' }); }
            }, 'Smooth'),
            React.createElement('button', {
              className: 'seg-opt' + (st.gradientSource === 'blob' ? ' active' : ''),
              onClick: function () { setTweaks({ gradientSource: 'blob' }); }
            }, 'Blob')
          )
        ),

        // ── Presets ─────────────────────────────────────────────────────────
        React.createElement('div', {
          className: 'section presets-section collapsible-presets ' + (presetsOpen ? 'is-open' : 'is-collapsed')
        },
          React.createElement('button', {
            type: 'button',
            className: 'section-label presets-toggle',
            onClick: function () { setPresetsOpen(!presetsOpen); },
            'aria-expanded': presetsOpen,
          },
            React.createElement('span', { className: 'name' }, 'Presets'),
            React.createElement('span', { className: 'value' }, '8 styles'),
            React.createElement('span', { className: 'preset-arrow' }, presetsOpen ? '⌃' : '⌄')
          ),
          React.createElement('div', { className: 'palette-grid' },
            [
              ['#EAF0F2','#F04A2F','#2637D9','#2E2A4F','#F7FAFB'],
              ['#07104C','#FC6C3D','#98F2F4','#E38BB8','#05040A'],
              ['#F4EDE0','#BE1E2D','#1E33B8','#B9BCC9','#11121E'],
              ['#05040A','#08015F','#FC6C3D','#F4BE62','#98F2F4'],
              ['#e8f4f8','#b8d9e8','#7ab8d4','#3a85a8','#0a3c5c'],
              ['#f5ede0','#d4b896','#a07850','#6b4428','#2c1508'],
              ['#0d0221','#3a0e6f','#7b2fbe','#c77dff','#e0aaff'],
              ['#f2f7ff','#c8dcf8','#8ab8f0','#4a88d8','#0a3c8c'],
            ].map(function (p, i) {
              return React.createElement('button', {
                key: i,
                className: 'palette-card',
                title: 'Preset ' + (i + 1),
                onClick: function () { setTweaks({ colors: p, variant: i, seed: Math.random() }); },
              }, p.map(function (c, j) {
                return React.createElement('span', { key: j, style: { background: c } });
              }));
            })
          )
        ),

        // ── Sliders ─────────────────────────────────────────────────────────

        // Strength
        slider('rippleStrength', isRipple ? 'Ripple strength' : 'Refraction'),

        // Density — label varies by glass type
        isGlass && slider('glassDensity', 'Density', densityLabel),

        // Orientation — hidden for ripple (isotropic)
        isGlass && slider('glassAngle', 'Orientation', angleLabel),

        // Highlights — glass only
        isGlass && slider('specular', 'Highlights'),

        slider('blur', 'Blur'),
        slider('animSpeed', 'Speed', speedLabel, 2),
        slider('vignette',  'Vignette'),
        slider('vectorDistance', 'Field spread'),
        slider('vectorSize',     'Field scale'),
        slider('contrast', 'Contrast'),
        slider('grain',    'Grain')

      )
    );
  }

  window.AbstractMode     = AbstractMode;
  window.AbstractControls = AbstractControls;
  function buildRandomAbstractDefaults() {
    var palettes = [
      ['#EAF0F2','#F04A2F','#2637D9','#2E2A4F'],
      ['#07104C','#FC6C3D','#98F2F4','#E38BB8'],
      ['#F4EDE0','#BE1E2D','#1E33B8','#B9BCC9'],
      ['#05040A','#08015F','#FC6C3D','#F4BE62'],
      ['#e8f4f8','#b8d9e8','#7ab8d4','#0a3c5c'],
      ['#f5ede0','#d4b896','#a07850','#2c1508'],
      ['#0d0221','#3a0e6f','#7b2fbe','#e0aaff'],
      ['#f2f7ff','#8ab8f0','#4a88d8','#0a3c8c'],
      ['#13051E','#EC315E','#F8E9D2','#32E1D1'],
      ['#050505','#60798B','#B5B198','#DCD9C8'],
      ['#190A13','#F53522','#FCF6B8','#A51261'],
      ['#02070A','#0381ED','#F3F3F1','#CFFA33']
    ];
    var pal = palettes[Math.floor(Math.random() * palettes.length)].slice(0, 4);
    return {
      formation:      'glass',
      glassType:      'clear',
      gradientSource: 'smooth',
      variant:        Math.floor(Math.random() * 8),
      colors:         pal,
      glassDensity:   0.38 + Math.random() * 0.42,
      rippleStrength: 0.48 + Math.random() * 0.34,
      blur:           0.26 + Math.random() * 0.34,
      glassAngle:     1.0,
      specular:       0.48 + Math.random() * 0.38,
      animSpeed:      0.86 + Math.random() * 0.34,
      vignette:       0.0,
      vectorDistance: 0.42 + Math.random() * 0.28,
      vectorSize:     0.42 + Math.random() * 0.30,
      contrast:       0.44 + Math.random() * 0.22,
      grain:          0.08 + Math.random() * 0.12,
      bw:             false,
      invert:         false,
      seed:           Math.random(),
    };
  }

  window.ABSTRACT_DEFAULTS = buildRandomAbstractDefaults();

}());
