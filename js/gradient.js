// gradient.js — Mode 1: grainy gradient field with WebGL.
// NURR patch: curated palette support + color spread + palette adjustment sliders + single-triangle WebGL render.
// Exposes: window.GradientMode, window.GradientControls, window.GRADIENT_DEFAULTS

const { useEffect: gmUE, useRef: gmUR, useState: gmUS } = React;

const GRADIENT_VS = `
attribute vec2 a_pos;
varying vec2 v_uv;

void main(){
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

function createGradientSingleTriangle(gl, program) {
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  // One oversized triangle avoids the diagonal seam that can appear between
  // two fullscreen triangles. The triangle is large enough to cover the full
  // NDC square in all orientations.
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, 'a_pos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  return buf;
}

function initGradientGL(canvas) {
  const gl = canvas.getContext('webgl', { preserveDrawingBuffer:true, antialias:false });
  if (!gl) return null;
  const prog = WP.compileProgram(gl, GRADIENT_VS, GRADIENT_FS);
  gl.useProgram(prog);
  gl.disable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.SCISSOR_TEST);
  createGradientSingleTriangle(gl, prog);
  return { gl, prog };
}

const GRADIENT_FS = `
precision highp float;
varying vec2 v_uv;
uniform float u_time;
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform vec2  u_mouseRaw;
uniform float u_clickPulse;
uniform float u_grain;
uniform float u_flow;
uniform float u_spread;
uniform float u_distance;
uniform float u_blend;
uniform float u_role0;
uniform float u_role1;
uniform float u_role2;
uniform float u_role3;
uniform int   u_directionMode;
uniform int   u_invert;
uniform int   u_bw;
uniform int   u_count;
uniform vec3  u_color0;
uniform vec3  u_color1;
uniform vec3  u_color2;
uniform vec3  u_color3;
uniform int   u_textureMode;
uniform float u_textureAmount;
uniform float u_textureScale;
uniform float u_textureSoftness;
uniform float u_textureDistortion;
uniform float u_textureSeed;
uniform int   u_pixelateEnabled;
uniform float u_pixelateAmount;
uniform float u_pixelateScale;
uniform int   u_chromaEnabled;
uniform float u_chromaAmount;
uniform float u_chromaSeed;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i=floor(p); vec2 f=fract(p);
  f=f*f*(3.0-2.0*f);
  float a=hash(i+vec2(u_textureSeed));
  float b=hash(i+vec2(1.0,0.0)+vec2(u_textureSeed));
  float c=hash(i+vec2(0.0,1.0)+vec2(u_textureSeed));
  float d=hash(i+vec2(1.0,1.0)+vec2(u_textureSeed));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
float fbm(vec2 p){
  float v=0.0; float a=0.5;
  for(int i=0;i<5;i++){ v += noise(p)*a; p*=2.04; a*=0.52; }
  return v;
}

// ── Robust hash / noise for high-frequency + pixel-scale passes ─────────────
// The legacy hash() above uses sin(dot(p,...)*43758). On mobile GPUs, sin()
// precision breaks down when the argument gets into the millions (pixel coord
// times ~300 times 43758 is many millions). Once precision breaks, the "noise"
// stops being random and starts correlating along the perpendicular of
// (127.1, 311.7) — producing the visible diagonal stripes users saw with grain
// at max on mobile. This fract-based hash stays numerically stable at any
// input scale we ever feed it, so grain reads as isotropic dust on every GPU.
float hash21(vec2 p){
  // Hoskins-style hash: stable on mobile GPUs and less patterned on integer
  // pixel coordinates than the previous fract(p*vec2) hash. Grain, Chroma and
  // Pixelate share this, so it must stay isotropic.
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

// Smoothstep-interpolated noise from hash21. Used by the chromatic-haze pass
// where we specifically want NO visible cell structure at any resolution.
float smoothNoise21(vec2 p, float seed){
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f*f*(3.0-2.0*f);
  float a = hash21(i + vec2(seed));
  float b = hash21(i + vec2(1.0, 0.0) + vec2(seed));
  float c = hash21(i + vec2(0.0, 1.0) + vec2(seed));
  float d = hash21(i + vec2(1.0, 1.0) + vec2(seed));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
float fbm21(vec2 p, float seed){
  float v = 0.0;
  float a = 0.5;
  for(int i=0;i<5;i++){
    v += smoothNoise21(p, seed + float(i) * 17.31) * a;
    p *= 2.04;
    a *= 0.52;
  }
  return v;
}
vec3 hardLight(vec3 base, vec3 blend){
  return mix(2.0 * base * blend, 1.0 - 2.0 * (1.0 - base) * (1.0 - blend), step(0.5, blend));
}

vec3 applyTextureSurface(vec3 col, vec2 uv, vec2 p, float time){
  int mode = u_textureMode;
  float amount = clamp(u_textureAmount, 0.0, 1.0);
  if(mode == 0 || amount <= 0.001) return col;

  float sc = mix(180.0, 38.0, clamp(u_textureScale,0.0,1.0));
  float soft = clamp(u_textureSoftness, 0.0, 1.0);
  float distort = clamp(u_textureDistortion, 0.0, 1.0);

  // Texture movement is intentionally very slow. The surface should sit on the image,
  // not flicker like video noise.
  vec2 q = uv + vec2(
    fbm(uv*3.0 + vec2(time*0.004 + u_textureSeed)),
    fbm(uv*3.0 + vec2(-time*0.003 + u_textureSeed*1.7))
  ) * 0.018 * distort;

  float fine = hash21(floor(gl_FragCoord.xy) + vec2(u_textureSeed*997.0)) - 0.5;
  float cloud = fbm(q * sc * 0.055 + vec2(time*0.004, -time*0.003));
  float fiber = fbm(vec2(q.x*sc*0.10, q.y*sc*0.018) + vec2(u_textureSeed*4.0));
  float wrinkleA = fbm(vec2(q.x*sc*0.020, q.y*sc*0.090) + vec2(8.0, u_textureSeed));
  float wrinkleB = fbm(vec2(q.x*sc*0.115, q.y*sc*0.026) + vec2(u_textureSeed*2.0, 3.0));
  float vign = smoothstep(0.86, 0.12, length(uv-0.5));

  if(mode == 1){
    // Fine grain: stable, small, non-pixelated surface tooth.
    float paper = (fiber-0.5)*0.085 + (cloud-0.5)*0.040 + fine*0.025;
    col = mix(col, col * (1.0 + paper), amount*0.72);
  } else if(mode == 2){
    // Half temp: generated from the Multiply reference, but procedural.
    // Fine printed mesh + faint dirt; applied as a multiply layer.
    vec2 screenUV = q * vec2(u_resolution.x/u_resolution.y, 1.0);
    float angle = 0.785398;
    mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
    vec2 ruv = rot * (screenUV * mix(170.0, 260.0, soft));
    vec2 cell = fract(ruv) - 0.5;
    float dotShape = 1.0 - smoothstep(0.10, 0.34, length(cell));
    float mesh = dotShape * (0.66 + 0.34 * hash(floor(ruv) + vec2(u_textureSeed*19.0)));
    float stains = smoothstep(0.70, 0.98, cloud) * 0.18 + smoothstep(0.86, 1.0, fiber) * 0.11;
    float plate = clamp(mesh*0.23 + stains + fine*0.035, 0.0, 0.45);
    col *= (1.0 - plate * amount);
  } else if(mode == 3){
    // Foil: generated from the hard-light/lighten reference, not pasted as an image.
    // Crumpled directional highlights, blended between lighten and hard-light logic.
    float ridges = abs(wrinkleA - wrinkleB);
    float sharp = smoothstep(0.055, 0.22, ridges);
    float broad = cloud * 0.55 + fiber * 0.45;
    float crease = pow(clamp(sharp + broad*0.45, 0.0, 1.0), 1.35);
    vec3 foilTone = vec3(0.56 + crease*0.54);
    vec3 lightenPass = max(col, foilTone);
    vec3 hardPass = hardLight(col, foilTone);
    col = mix(col, mix(lightenPass, hardPass, 0.55), amount * 0.65);
    col += vec3(fine * 0.045 * amount);
  } else if(mode == 4){
    // Legacy guard only. Chromatic haze is no longer processed through
    // the generic texture mode path; it has its own final pass in main().
    // This prevents it from inheriting Pixelate/grid state.
    col = col;
  } else if(mode == 5){
    // Pixelate is now handled only by u_pixelateEnabled in the UV prepass.
    // Keep this legacy mode as a no-op so stale textureMode values cannot
    // create block artefacts when Chromatic Haze is active.
    col = col;
  } else if(mode == 6){
    // Paper: generated from the Multiply 2 paper reference, used as multiply texture.
    float folded = smoothstep(0.48, 0.82, abs(wrinkleA - 0.5) + abs(wrinkleB - 0.5));
    float pulp = (fiber-0.5)*0.16 + (cloud-0.5)*0.09 + fine*0.055;
    float emboss = (folded*0.20 + pulp);
    col *= (1.0 - clamp(emboss, -0.10, 0.32) * amount * 0.82);
    col += vec3(max(-emboss, 0.0) * amount * 0.10);
  }

  // Softness blends the effect back into the base; low softness = rougher surface.
  float keep = mix(0.72, 0.92, soft);
  col = mix(col, smoothstep(0.0, 1.0, col), (1.0-keep)*0.22);
  col *= 1.0 - (1.0-vign)*amount*0.018;
  return clamp(col, 0.0, 1.0);
}


float rampWeight(float t, float pos, float sigma, float floorW){
  float d = t - pos;
  return exp(-(d*d) / max(0.0001, 2.0*sigma*sigma)) + floorW;
}

float nymphRoleWeight(float idx){
  if(idx < 0.5) return u_role0;
  if(idx < 1.5) return u_role1;
  if(idx < 2.5) return u_role2;
  return u_role3;
}

vec3 recoverBody(vec3 c, float blend){
  float mx = max(max(c.r, c.g), c.b);
  float mn = min(min(c.r, c.g), c.b);
  vec3 grey = vec3((mx + mn) * 0.5);
  // Recover colour body lost to weighted RGB blending. The previous values
  // were too polite after the mobile rewrite: strong palettes averaged into
  // beige/grey centres, especially when CSS scale cropped the middle of the
  // field. This keeps blends soft but restores visible chroma + contrast.
  float sat = mix(1.32, 1.12, blend);
  float contrast = mix(1.22, 1.09, blend);
  c = mix(grey, c, sat);
  c = 0.5 + (c - 0.5) * contrast;
  return clamp(c, 0.0, 1.0);
}


vec3 applyChromaticHazeFinal(vec3 col, vec2 uv, float time){
  float amount = clamp(u_chromaAmount, 0.0, 0.86);
  if(u_chromaEnabled == 0 || amount <= 0.001) return col;

  // Restored from the stable older Chromatic Haze visual: prism veil + soft
  // haze, not colour-noise speckles. The original bug came from letting haze
  // share texture/pixel state and from unstable pixel-scale hash noise. This
  // version keeps the old look but uses the independent chroma uniforms and
  // stable hash21/fbm21 helpers, so it cannot inherit Pixelate blocks.
  float a = smoothstep(0.0, 1.0, amount);
  float seed = u_chromaSeed;
  vec2 q = uv + vec2(
    fbm21(uv*3.0 + vec2(time*0.004 + seed), seed * 1.37 + 11.0),
    fbm21(uv*3.0 + vec2(-time*0.003 + seed*1.7), seed * 2.11 + 29.0)
  ) * 0.018;

  float haze = fbm21(q*6.0 + vec2(time*0.006, 0.0), seed * 3.17 + 43.0);
  vec3 prism = vec3(
    sin((q.x+haze)*8.0 + 0.0),
    sin((q.x+haze)*8.0 + 2.1),
    sin((q.x+haze)*8.0 + 4.2)
  ) * 0.5 + 0.5;

  vec3 target = col + (prism - 0.5) * 0.18 + vec3(haze - 0.5) * 0.085;
  col = mix(col, target, a * 0.78);

  // Very small stable tooth, only to stop the haze looking digitally flat.
  // It is not a grid and it is not shared with Pixelate.
  float fine = hash21(floor(uv * u_resolution) + vec2(seed*997.0, 41.0)) - 0.5;
  col += fine * a * 0.010;
  return clamp(col, 0.0, 1.0);
}

vec3 weightedDirectionalRamp(float t, float distance, float blend, float spread, float cnt){
  float d = clamp(distance, 0.0, 1.0);
  float b = clamp(blend, 0.0, 1.0);
  float s = smoothstep(0.0, 1.0, clamp(spread, 0.0, 1.0));
  float k1 = step(2.0, cnt);
  float k2 = step(3.0, cnt);
  float k3 = step(4.0, cnt);

  // Distance moves the colour bodies. Spread changes their territory and
  // separation. The previous mapping made Spread mostly a role-weight detail,
  // so the node felt dead. Here low Spread melts fields together; high Spread
  // gives each colour clearer physical territory without turning the output flat.
  float margin = mix(0.30, 0.075, d);
  float p0 = margin;
  float p3 = 1.0 - margin;
  float p1 = margin + (1.0 - 2.0 * margin) * 0.34;
  float p2 = margin + (1.0 - 2.0 * margin) * 0.66;

  if(cnt < 3.5){
    p0 = margin;
    p1 = 0.50;
    p2 = 1.0 - margin;
    p3 = p2;
  }
  if(cnt < 2.5){
    p0 = margin;
    p1 = 1.0 - margin;
    p2 = p1;
    p3 = p1;
  }

  float baseSigma = mix(0.340, 0.054, s) + mix(0.020, 0.074, b);
  float floorW = mix(0.072, 0.0040, s) * mix(1.0, 0.70, d);
  float roleMix = mix(0.22, 0.92, s);

  float r0 = mix(1.0, clamp(u_role0, 0.20, 2.20), roleMix);
  float r1 = mix(1.0, clamp(u_role1, 0.20, 2.20), roleMix);
  float r2 = mix(1.0, clamp(u_role2, 0.20, 2.20), roleMix);
  float r3 = mix(1.0, clamp(u_role3, 0.20, 2.20), roleMix);

  float sig0 = baseSigma * mix(1.08, 0.92, s) / sqrt(max(r0, 0.20));
  float sig1 = baseSigma * mix(1.08, 0.94, s) / sqrt(max(r1, 0.20));
  float sig2 = baseSigma * mix(1.08, 0.96, s) / sqrt(max(r2, 0.20));
  float sig3 = baseSigma * mix(1.08, 1.00, s) / sqrt(max(r3, 0.20));

  float w0 = exp(-pow(t - p0, 2.0)/(2.0*sig0*sig0)) * r0 + floorW;
  float w1 = exp(-pow(t - p1, 2.0)/(2.0*sig1*sig1)) * r1 * k1 + floorW * k1;
  float w2 = exp(-pow(t - p2, 2.0)/(2.0*sig2*sig2)) * r2 * k2 + floorW * k2;
  float w3 = exp(-pow(t - p3, 2.0)/(2.0*sig3*sig3)) * r3 * k3 + floorW * k3;

  vec3 acc = u_color0*w0 + u_color1*w1 + u_color2*w2 + u_color3*w3;
  float wsum = w0 + w1 + w2 + w3;
  return recoverBody(acc / max(wsum, 0.0001), b);
}

void main(){
  vec2 uv = gl_FragCoord.xy / max(u_resolution, vec2(1.0));
  if(u_pixelateEnabled == 1 && u_pixelateAmount > 0.001){
    // Pixel surface prepass: only active for explicit Pixelate.
    // Chroma has independent uniforms and can never enter this path.
    float amt = clamp(u_pixelateAmount, 0.0, 1.0);
    float scale = clamp(u_pixelateScale, 0.0, 1.0);
    float pxGrid = mix(320.0, 7.0, pow(amt, 1.22));
    pxGrid = mix(pxGrid * 1.35, pxGrid * 0.50, scale);
    vec2 aspectFix = vec2(u_resolution.x / max(u_resolution.y, 1.0), 1.0);
    vec2 drift = vec2(
      sin(u_time * 0.115 + u_textureSeed * 6.0) + sin(u_time * 0.051 + 2.4),
      cos(u_time * 0.093 + u_textureSeed * 4.0) + sin(u_time * 0.047 + 0.8)
    ) * mix(0.003, 0.025, amt);
    vec2 pixelSize = vec2(pxGrid * aspectFix.x, pxGrid);
    uv = (floor((uv + drift) * pixelSize) + 0.5) / pixelSize - drift;
  }
  // Portrait-fair aspect. Previously aspect = (w/h, 1.0), which was fine on
  // landscape but collapsed p.x to a tiny range on portrait: the warp orbits,
  // sharpness scale and anchor radii were all calibrated for landscape and
  // read as "pinched" on mobile. Using max/min keeps the shorter axis at 1
  // and the longer axis at the ratio, so the anchors always orbit inside a
  // full unit box in the longer direction, regardless of orientation.
  float aspectRatio = u_resolution.x / max(u_resolution.y, 1.0);
  vec2 aspect = aspectRatio >= 1.0
    ? vec2(aspectRatio, 1.0)
    : vec2(1.0, 1.0 / max(aspectRatio, 0.0001));
  vec2 p = (uv - 0.5) * aspect;
  vec2 m = (u_mouse - 0.5) * aspect * 1.8;
  vec2 mr = (u_mouseRaw - 0.5) * aspect;

  // Restored from the older NURR motion base: the field is always in slow
  // liquid movement and the mouse bends the actual colour body, not only a
  // decorative overlay. This is the part that made NURR-poolik feel alive.
  float flow = clamp(u_flow, 0.0, 2.2);
  float t = u_time * 0.22 * flow;
  vec2 warp = vec2(
    sin(p.x * 1.4 + p.y * 0.8 + t) + sin(p.y * 2.2 - t * 0.7) * 0.6,
    cos(p.y * 1.4 - p.x * 0.6 - t * 0.8) + cos(p.x * 2.1 + t * 0.5) * 0.6
  );
  vec2 toMouse = m - p;
  float dM = length(toMouse) + 0.001;
  warp += toMouse * (0.35 / (dM + 0.4));
  vec2 wp = p + warp * 0.32 * flow;

  float dmr = distance(p, mr);
  float ripple = sin(dmr * 18.0 - u_clickPulse * 9.0) * exp(-dmr * 2.2) * u_clickPulse * 0.42;
  wp += normalize(toMouse + 0.0001) * ripple;

  float cnt = float(u_count);
  float spread = clamp(u_spread, 0.0, 1.0);
  float distanceCtrl = clamp(u_distance, 0.0, 1.0);
  float blendCtrl = clamp(u_blend, 0.0, 1.0);

  // Organic mode: restored inverse-distance anchor system from NURR-poolik,
  // but keeps the current formula weights. It avoids the recent vertical/ribbon
  // artefacts because there is no UV stripe field mixed into the result.
  float aT = u_time * (0.18 + 0.10 * flow);
  vec2 autoDrift = vec2(sin(u_time*0.061), cos(u_time*0.047)) * 0.18 * flow;
  float spreadCurve = smoothstep(0.0, 1.0, spread);
  float orbit = mix(0.16, 1.02, spreadCurve);
  float sharpness = mix(2.0, 15.0, spreadCurve);
  float softness = mix(0.260, 0.030, spreadCurve) + blendCtrl * 0.026;

  vec2 an0 = (m*0.45 + autoDrift) + vec2(cos(aT+0.0),  sin(aT+0.0))  * (orbit + 0.16*sin(u_time*0.4));
  vec2 an1 = (m*0.45 + autoDrift) + vec2(cos(aT+1.57), sin(aT+1.57)) * (orbit + 0.16*sin(u_time*0.4+1.0));
  vec2 an2 = (m*0.45 + autoDrift) + vec2(cos(aT+3.14), sin(aT+3.14)) * (orbit + 0.16*sin(u_time*0.4+2.0));
  vec2 an3 = (m*0.45 + autoDrift) + vec2(cos(aT+4.71), sin(aT+4.71)) * (orbit + 0.16*sin(u_time*0.4+3.0));

  float od0 = distance(wp, an0);
  float od1 = distance(wp, an1);
  float od2 = distance(wp, an2);
  float od3 = distance(wp, an3);

  float ow0 = 1.0 / (od0*od0*sharpness + softness);
  float ow1 = 1.0 / (od1*od1*sharpness + softness);
  float ow2 = 1.0 / (od2*od2*sharpness + softness);
  float ow3 = 1.0 / (od3*od3*sharpness + softness);

  ow0 *= clamp(u_role0, 0.20, 2.20);
  ow1 *= clamp(u_role1, 0.20, 2.20);
  ow2 *= clamp(u_role2, 0.20, 2.20);
  ow3 *= clamp(u_role3, 0.20, 2.20);

  float k1 = step(2.0, cnt); float k2 = step(3.0, cnt); float k3 = step(4.0, cnt);
  vec3 organicAcc = u_color0*ow0 + u_color1*ow1*k1 + u_color2*ow2*k2 + u_color3*ow3*k3;
  float organicSum = ow0 + ow1*k1 + ow2*k2 + ow3*k3;
  vec3 organicCol = recoverBody(organicAcc / max(organicSum, 0.0001), blendCtrl);

  vec3 col = organicCol;

  if(u_directionMode == 1 || u_directionMode == 2){
    // True horizontal / vertical: no cross-axis bending. Movement is limited
    // to a very small axis drift so the gradient is alive but still optically
    // straight. Spread is handled inside weightedDirectionalRamp, where it has
    // a clear territory/separation effect.
    float axis = (u_directionMode == 2) ? uv.y : uv.x;
    float mouseAxis = (u_directionMode == 2) ? (u_mouseRaw.y - 0.5) : (u_mouseRaw.x - 0.5);
    float timeDrift = sin(u_time * 0.042 + u_textureSeed * 5.7) * 0.010 * flow;
    float mouseDrift = mouseAxis * 0.060 * flow;
    float clickDrift = sin(dmr * 9.0 - u_clickPulse * 6.0) * exp(-dmr * 2.2) * u_clickPulse * 0.018;
    float dirT = clamp(axis + timeDrift + mouseDrift + clickDrift, 0.0, 1.0);
    vec3 rampCol = weightedDirectionalRamp(dirT, distanceCtrl, blendCtrl, spread, cnt);
    col = rampCol;
  }
  if(u_invert == 1){ col = vec3(1.0) - col; }

  if(u_bw == 1){
    float y = dot(col, vec3(0.2126, 0.7152, 0.0722));
    y = clamp(0.5 + (y - 0.5) * 1.08, 0.0, 1.0);
    col = vec3(mix(0.12, 0.90, y));
  }

  col = applyTextureSurface(col, uv, p, u_time);
  col = applyChromaticHazeFinal(col, uv, u_time);

  // Film grain overlay: sharper and stronger at the top end, but still
  // pixel-scale and monochrome so it exports as texture, not square blocks.
  float lumGrain = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col += vec3(nymphFilmGrain(gl_FragCoord.xy, u_textureSeed, u_grain, lumGrain));

  // Pixelate must be visible as both block geometry and simplified colour.
  // Round 4 kept only the UV block prepass, so soft gradients still looked
  // almost unfiltered. This colour step is restrained and only active for the
  // explicit Pixelate surface.
  if(u_pixelateEnabled == 1 && u_pixelateAmount > 0.001){
    float pxAmt = clamp(u_pixelateAmount, 0.0, 1.0);
    float levels = mix(255.0, 18.0, pow(pxAmt, 1.08));
    vec3 stepped = floor(col * levels + 0.5) / levels;
    col = mix(col, stepped, clamp(pxAmt * 0.72, 0.0, 0.82));
  }

  float vg = smoothstep(1.25, 0.25, length(uv - 0.5));
  col *= mix(0.90, 1.0, vg);

  gl_FragColor = vec4(col, 1.0);
}
`;


function clampGradient(v, a, b) { return Math.max(a, Math.min(b, v)); }
function normalizeGradientHex(value, fallback) {
  let h = String(value || '').trim();
  if (!h) return fallback || '#000000';
  if (h[0] !== '#') h = '#' + h;
  if (/^#[0-9a-fA-F]{3}$/.test(h)) h = '#' + h.slice(1).split('').map(c => c + c).join('');
  return /^#[0-9a-fA-F]{6}$/.test(h) ? h.toUpperCase() : (fallback || '#000000');
}
function gradientHexToRgb255(hex) {
  const h = normalizeGradientHex(hex).slice(1);
  return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) };
}
function gradientRgbToHex(r,g,b) {
  return '#' + [r,g,b].map(v => clampGradient(Math.round(v),0,255).toString(16).padStart(2,'0')).join('').toUpperCase();
}
function gradientRgbToHsl(rgb) {
  let r=rgb.r/255, g=rgb.g/255, b=rgb.b/255;
  let max=Math.max(r,g,b), min=Math.min(r,g,b), h=0, s=0, l=(max+min)/2;
  if(max!==min){
    let d=max-min;
    s=l>.5 ? d/(2-max-min) : d/(max+min);
    if(max===r) h=(g-b)/d+(g<b?6:0);
    else if(max===g) h=(b-r)/d+2;
    else h=(r-g)/d+4;
    h*=60;
  }
  return {h,s,l};
}
function gradientHslToRgb(h,s,l) {
  h=((h%360)+360)%360/360;
  let r,g,b;
  if(s===0){ r=g=b=l; }
  else {
    const hue2rgb = (p,q,t) => {
      if(t<0)t+=1; if(t>1)t-=1;
      if(t<1/6)return p+(q-p)*6*t;
      if(t<1/2)return q;
      if(t<2/3)return p+(q-p)*(2/3-t)*6;
      return p;
    };
    const q = l < .5 ? l*(1+s) : l+s-l*s;
    const p = 2*l-q;
    r=hue2rgb(p,q,h+1/3); g=hue2rgb(p,q,h); b=hue2rgb(p,q,h-1/3);
  }
  return {r:r*255,g:g*255,b:b*255};
}
function gradientHslToHex(h,s,l) {
  const c = gradientHslToRgb(h,s,l);
  return gradientRgbToHex(c.r,c.g,c.b);
}
function adjustGradientHex(hex, tweaks) {
  const pigment = clampGradient(Number(tweaks.pigment ?? 0.5), 0, 1);
  const saturation = clampGradient(Number(tweaks.saturation ?? 0.5), 0, 1);
  const temperature = clampGradient(Number(tweaks.temperature ?? 0), -1, 1);
  const hsl = gradientRgbToHsl(gradientHexToRgb255(hex));

  // Temperature is intentionally gentle: enough to bias the palette, not enough to destroy it.
  hsl.h += temperature * 22;

  // Saturation is a direct chroma control, centered at 0.5 = original.
  const satFactor = saturation < 0.5
    ? 0.35 + saturation * 1.3      // 0.35..1.0
    : 1.0 + (saturation - 0.5) * 1.35; // 1.0..1.675
  hsl.s = clampGradient(hsl.s * satFactor, 0, 1);

  // Pigment adds/removes visual body: saturation + lightness contrast around middle grey.
  const pigmentSat = pigment < 0.5
    ? 0.55 + pigment * 0.9          // 0.55..1.0
    : 1.0 + (pigment - 0.5) * 0.75; // 1.0..1.375
  const pigmentContrast = pigment < 0.5
    ? 0.82 + pigment * 0.36         // 0.82..1.0
    : 1.0 + (pigment - 0.5) * 0.42; // 1.0..1.21
  hsl.s = clampGradient(hsl.s * pigmentSat, 0, 1);
  hsl.l = clampGradient(0.5 + (hsl.l - 0.5) * pigmentContrast, 0.035, 0.965);

  return gradientHslToHex(hsl.h, hsl.s, hsl.l);
}

const NYMPH_MANUAL_FORMULA_WEIGHTS = [1.08, 1.04, 1.00, 0.96];
function cleanGradientColors(colors, max = 4) {
  return (Array.isArray(colors) ? colors : [])
    .map(c => normalizeGradientHex(c, ''))
    .filter(Boolean)
    .slice(0, max);
}
function bakeGradientPalette(colors, tweaks = {}) {
  return cleanGradientColors(colors).map(c => adjustGradientHex(c, tweaks));
}
function manualGradientPatch(colors, currentTweaks = {}) {
  const clean = cleanGradientColors(colors);
  return {
    colors: clean.length ? clean : cleanGradientColors(currentTweaks.colors || ['#000000', '#FFFFFF']),
    manualPalette: true,
    formula: 'manual',
    formulaLabel: 'Manual palette',
    formulaWeights: NYMPH_MANUAL_FORMULA_WEIGHTS.slice(),
    // When a user edits a colour, the displayed colour must become the rendered colour.
    // Reset hidden colour modifiers so the picker, swatches and canvas all agree.
    pigment: 0.5,
    saturation: 0.5,
    temperature: 0
  };
}

// Nymph gradient formula — ported from the Figma plugin into NURR's gradient system.
// Purpose: generate stronger hierarchy: dark anchor + vivid body + pale/mist + restrained accent.
const NYMPH_FORMULAS = {
  'deep-shadow':{id:'deep-shadow',label:'Deep shadow',w:[1.42,.78,.58,.44],spread:.52,distance:.58,blend:.40},
  'dominant-heavy':{id:'dominant-heavy',label:'Dominant heavy',w:[1.55,.85,.70,.46],spread:.50,distance:.60,blend:.42},
  'equal-stress':{id:'equal-stress',label:'Equal stress',w:[1.00,1.00,1.00,.62],spread:.68,distance:.62,blend:.46},
  'mist-heavy':{id:'mist-heavy',label:'Mist heavy',w:[.95,.88,1.35,.48],spread:.55,distance:.56,blend:.45},
  'accent-pin':{id:'accent-pin',label:'Accent pin',w:[1.28,.92,.72,.36],spread:.53,distance:.64,blend:.40}
};
const NYMPH_FORMULA_BAG = ['deep-shadow','deep-shadow','deep-shadow','dominant-heavy','dominant-heavy','dominant-heavy','equal-stress','equal-stress','mist-heavy','mist-heavy','accent-pin'];
const NYMPH_MOOD_BAG = ['mineral','mineral','acid','acid','burn','burn','dusk','dusk','bruised-pastel','bruised-pastel','electric-night','electric-night','dirty-cream','infrared','cold-bloom','cold-bloom','oil-slick','radioactive','soft-wound','steel-orchid'];
const NYMPH_MOOD_SEEDS = {
  mineral:[['#050505','#60798B','#B5B198','#DCD9C8'],['#101214','#6E8795','#D8D1B8','#EEF1E8'],['#030405','#3F5664','#A9B3A8','#E5DFCA'],['#12100D','#53666A','#C0B18D','#F4EFE2']],
  acid:[['#07100B','#D8FF2F','#F3F6E8','#135CFF'],['#010A05','#00E36E','#F2F4E8','#E6FF00'],['#0D0615','#B8FF1D','#FFF7D5','#F21BD5'],['#101500','#CFFA33','#F9F6E7','#FE7B01']],
  burn:[['#190A13','#F53522','#FCF6B8','#A51261'],['#26050B','#F7442E','#F2BC49','#B71026'],['#16090A','#E75909','#FAF6EA','#C0011A'],['#2A0808','#FF3A1F','#D9C004','#7A1026']],
  dusk:[['#12091D','#455A88','#F1D7C8','#D74876'],['#1E1F24','#052C45','#C7C7C5','#FF1727'],['#221337','#818166','#F3EAD7','#A28CFB'],['#190013','#4F1535','#87B2FF','#E12BA9']],
  'bruised-pastel':[['#1D020E','#FC87C2','#F3F3F1','#2E484A'],['#25051E','#F2A1D4','#E9E2CF','#7C679F'],['#16021F','#A28CFB','#FAF6EA','#F7448D'],['#2E0008','#FBC3E6','#E79C71','#03639E']],
  'electric-night':[['#080317','#1829FD','#8BCAFF','#E916FF'],['#01020E','#0C2CC3','#D0FF01','#FF0C32'],['#05040A','#4B52EB','#F3F3F1','#FD5DCF'],['#1E011F','#87B2FF','#190013','#E12BA9']],
  'dirty-cream':[['#050505','#C6C0A0','#FAF6EA','#8C8C8C'],['#222021','#EBF698','#FF7043','#598FFD'],['#4E4B38','#CCC3BA','#F04E31','#EAEAEA'],['#5E4D3C','#D1ED40','#F6F1E7','#C7CC10']],
  infrared:[['#120003','#FB1000','#FF5CCF','#F3F3F1'],['#1E011F','#E12BA9','#87B2FF','#F84622'],['#090003','#FD2D78','#F2BC49','#FF0C32'],['#260F27','#FD5035','#FC87C2','#2E484A']],
  'cold-bloom':[['#02070A','#0381ED','#F3F3F1','#CFFA33'],['#052C45','#8BCAFF','#FAF6EA','#FF1727'],['#081599','#87B2FF','#F6F1E7','#FD5DCF'],['#12291F','#009642','#D0CECA','#D3ED18']],
  'oil-slick':[['#050407','#450580','#00D9A6','#F3AE39'],['#010101','#34369B','#C8C693','#E12BA9'],['#16021F','#806EFE','#B5B198','#F54703']],
  radioactive:[['#050800','#D0FF01','#F6F1E7','#FB1000'],['#07100B','#9DF200','#E3FF9A','#0381ED'],['#1E1F24','#D3ED18','#D0CECA','#4B52EB']],
  'soft-wound':[['#190A13','#F87CB8','#F3EAD7','#F53522'],['#2A070E','#FBC3E6','#FCF6B8','#B91F31'],['#1D020E','#FC87C2','#E79C71','#FD5035']],
  'steel-orchid':[['#101214','#60798B','#FBC3E6','#A51261'],['#1E1F24','#8BCAFF','#EAEAEA','#FD5DCF'],['#2E484A','#C0CCFC','#F3F3F1','#E916FF']]
};
let nymphActiveFormula = NYMPH_FORMULAS['dominant-heavy'];
let nymphShuffleHistory = [];
function nymphPick(a){ return a[Math.floor(Math.random()*a.length)]; }
function nymphChance(p){ return Math.random() < p; }
function nymphAnalyze(hex){ const h=gradientRgbToHsl(gradientHexToRgb255(hex)); return {hex:normalizeGradientHex(hex),h:h.h,s:h.s,l:h.l,chroma:h.s*(1-Math.abs(h.l-.5))}; }
function nymphHueDistance(a,b){ let d=Math.abs(a-b)%360; return d>180?360-d:d; }
function nymphPaletteStats(colors){ const hsls=colors.map(c=>gradientRgbToHsl(gradientHexToRgb255(c))); const l=hsls.map(x=>x.l),s=hsls.map(x=>x.s); return {rangeL:Math.max(...l)-Math.min(...l),minL:Math.min(...l),maxL:Math.max(...l),maxS:Math.max(...s),vivid:s.filter(x=>x>.58).length,muted:hsls.filter(x=>x.s<.45||x.l>.78).length}; }
function nymphQualityScore(colors){ const st=nymphPaletteStats(colors); return st.rangeL*1.55+st.maxS*.52+(st.minL<.24?.30:0)+(st.maxL>.68?.26:0)+(st.vivid>=2?.20:0)+(st.muted>=1?.16:0); }
function nymphRoleQuality(colors){
  const st=nymphPaletteStats(colors);
  let q=nymphQualityScore(colors);
  if(st.rangeL<.30)q-=1.2;
  if(st.minL>.32)q-=.7;
  if(st.maxL<.58)q-=.7;
  if(st.vivid>=1)q+=.22;
  if(st.muted>=1)q+=.22;
  const hs=colors.map(c=>nymphAnalyze(c).h);
  let minHue=999, maxHue=0;
  for(let i=0;i<hs.length;i++)for(let j=i+1;j<hs.length;j++){ const hd=nymphHueDistance(hs[i],hs[j]); minHue=Math.min(minHue,hd); maxHue=Math.max(maxHue,hd); }
  if(minHue<8)q-=.45;
  if(maxHue>150)q+=.18;
  return q;
}

function nymphPaletteSimilarity(a,b){ const A=a.map(nymphAnalyze),B=b.map(nymphAnalyze); let total=0; for(let i=0;i<Math.min(A.length,B.length);i++){ const dh=nymphHueDistance(A[i].h,B[i].h)/180, ds=Math.abs(A[i].s-B[i].s), dl=Math.abs(A[i].l-B[i].l); total += 1-(dh*.42+ds*.27+dl*.31); } return total/Math.max(1,Math.min(A.length,B.length)); }
function nymphTooRecent(p){ return nymphShuffleHistory.some(old=>nymphPaletteSimilarity(p,old)>.84); }
function nymphRemember(p){
  nymphShuffleHistory.unshift(p.slice());
  nymphShuffleHistory=nymphShuffleHistory.slice(0,48);
  try { localStorage.setItem('nurrGradientRecentPalettes', JSON.stringify(nymphShuffleHistory.slice(0,24))); } catch(e) {}
}
function nymphLoadRecent(){
  try {
    const raw = JSON.parse(localStorage.getItem('nurrGradientRecentPalettes') || '[]');
    if(Array.isArray(raw)) nymphShuffleHistory = raw.filter(Array.isArray).slice(0,24);
  } catch(e) {}
}
nymphLoadRecent();
function nymphMutateHex(hex,hs,sm,ls){ const h=gradientRgbToHsl(gradientHexToRgb255(hex)); return gradientHslToHex(h.h+hs,clampGradient(h.s*sm,.08,.98),clampGradient(h.l+ls,.035,.95)); }
function nymphColorFromRole(base,offset,s,l,hJ=10,sJ=.08,lJ=.055){ const h=base+offset+(Math.random()-.5)*hJ*2; const sat=clampGradient(s+(Math.random()-.5)*sJ*2,.07,.98); const lit=clampGradient(l+(Math.random()-.5)*lJ*2,.025,.965); return gradientHslToHex(h,sat,lit); }
function nymphSmartReorder(colors){ const items=colors.map(nymphAnalyze); const dark=[...items].sort((a,b)=>a.l-b.l)[0],light=[...items].sort((a,b)=>b.l-a.l)[0],vivid=[...items].sort((a,b)=>b.chroma-a.chroma)[0],vivid2=[...items].sort((a,b)=>b.s-a.s)[1]||vivid,muted=[...items].sort((a,b)=>a.s-b.s)[0]||light; const map={'deep-shadow':[dark.hex,vivid.hex,light.hex,vivid2.hex],'dominant-heavy':[dark.hex,vivid.hex,muted.hex,light.hex],'equal-stress':[vivid.hex,dark.hex,light.hex,vivid2.hex],'mist-heavy':[light.hex,dark.hex,vivid.hex,muted.hex],'accent-pin':[dark.hex,light.hex,vivid2.hex,vivid.hex]}; const raw=map[nymphActiveFormula.id]||map['dominant-heavy']; const out=[]; raw.concat(colors).forEach(c=>{c=normalizeGradientHex(c); if(!out.includes(c))out.push(c);}); return out.slice(0,4); }
function nymphFamilyQuality(colors, family){
  let q = nymphRoleQuality(colors);
  const st = nymphPaletteStats(colors);
  // Avoid the failed states seen in screenshots: neon stripe sets and flat muddy middles.
  if(st.vivid >= 3 && st.muted < 1) q -= 0.55;
  if(st.rangeL < 0.34) q -= 0.85;
  if(st.rangeL > 0.82) q -= 0.20;
  if(st.minL < 0.08 && st.maxL > 0.70) q += 0.18;
  if(st.muted >= 1) q += 0.16;
  if(nymphTooRecent(colors)) q -= 2.25;
  return q;
}
const NYMPH_SHUFFLE_FAMILIES = Object.keys(NYMPH_MOOD_SEEDS);
let nymphFamilyHistory = [];
function nymphPickFamily(){
  const available = NYMPH_SHUFFLE_FAMILIES.filter(f => nymphFamilyHistory.indexOf(f) === -1);
  const pool = available.length ? available : NYMPH_SHUFFLE_FAMILIES.slice();
  const family = nymphPick(pool);
  nymphFamilyHistory.unshift(family);
  nymphFamilyHistory = nymphFamilyHistory.slice(0, 5);
  return family;
}
function nymphGeneratedPaletteForMood(forcedMood){
  const hueTemplates=[[0,24,178,312],[0,-28,145,205],[0,42,184,252],[0,68,156,292],[0,-46,112,188],[0,18,214,336],[0,32,164,304],[0,58,194,332],[0,-36,156,236],[0,82,172,268],[0,-18,132,318],[0,54,221,340],[0,108,188,294],[0,-64,148,224],[0,76,160,326],[0,16,198,278],[0,-42,206,300],[0,90,146,242]];
  const formulaProfiles={'deep-shadow':{L:[.055,.49,.84,.42],S:[.82,.92,.30,.88],j:[12,.10,.06]},'dominant-heavy':{L:[.070,.51,.80,.45],S:[.78,.90,.34,.84],j:[14,.11,.07]},'equal-stress':{L:[.10,.53,.79,.50],S:[.80,.88,.36,.88],j:[16,.12,.075]},'mist-heavy':{L:[.84,.44,.13,.62],S:[.30,.88,.76,.80],j:[16,.10,.07]},'accent-pin':{L:[.08,.80,.47,.52],S:[.54,.32,.96,.98],j:[18,.12,.07]}};
  const moodBias={mineral:{sMul:.72,lShift:.02,hShift:190},acid:{sMul:1.03,lShift:.035,hShift:80},burn:{sMul:1.02,lShift:-.02,hShift:8},dusk:{sMul:.86,lShift:-.01,hShift:250},'bruised-pastel':{sMul:.78,lShift:.08,hShift:315},'electric-night':{sMul:1.02,lShift:-.025,hShift:225},'dirty-cream':{sMul:.68,lShift:.11,hShift:44},infrared:{sMul:1.02,lShift:.00,hShift:342},'cold-bloom':{sMul:.90,lShift:.05,hShift:190},'oil-slick':{sMul:.94,lShift:-.02,hShift:275},radioactive:{sMul:1.02,lShift:.02,hShift:105},'soft-wound':{sMul:.88,lShift:.05,hShift:352},'steel-orchid':{sMul:.82,lShift:.02,hShift:218}};
  const profile=formulaProfiles[nymphActiveFormula.id]||formulaProfiles['dominant-heavy']; let best=null,score=-999;
  const mood = forcedMood || nymphPickFamily();
  const bias=moodBias[mood]||moodBias.burn;
  for(let i=0;i<120;i++){
    const base=(bias.hShift+(Math.random()*220)+(Math.random()-.5)*72)%360;
    const template=nymphPick(hueTemplates);
    let colors=template.map((off,j)=>nymphColorFromRole(base,off,clampGradient(profile.S[j]*bias.sMul,.08,.94),clampGradient(profile.L[j]+bias.lShift,.035,.93),profile.j[0],profile.j[1],profile.j[2]));
    colors=nymphSmartReorder(colors);
    const sc=nymphFamilyQuality(colors,mood);
    if(sc>score){best=colors;score=sc;}
  }
  return best;
}
function nymphBuildCuratedVariant(forcedMood){
  let best=null,score=-999;
  const presets=(window.WP&&Array.isArray(WP.PALETTE_PRESETS)?WP.PALETTE_PRESETS:[]);
  const family = forcedMood || nymphPickFamily();
  const familySeeds = NYMPH_MOOD_SEEDS[family] || [];
  const enginePool = (window.NURR_GRADIENT_PALETTE_ENGINE && Array.isArray(window.NURR_GRADIENT_PALETTE_ENGINE.hiddenPool)) ? window.NURR_GRADIENT_PALETTE_ENGINE.hiddenPool : [];
  for(let i=0;i<120;i++){
    let source;
    if(familySeeds.length && nymphChance(.62)) source = nymphPick(familySeeds).slice();
    else if(enginePool.length && nymphChance(.24)) source = nymphPick(enginePool).colors.slice();
    else source = (presets.length ? nymphPick(presets).slice() : nymphPick(familySeeds).slice());
    let p=nymphSmartReorder(source);
    const mutation=nymphChance(.70)?(.20+Math.random()*.50):0;
    if(mutation)p=p.map(c=>nymphMutateHex(c,(Math.random()-.5)*18*mutation,.90+Math.random()*.22,(Math.random()-.5)*.065*mutation));
    p=nymphSmartReorder(p);
    const sc=nymphFamilyQuality(p,family);
    if(sc>score){best=p;score=sc;}
  }
  return best||nymphGeneratedPaletteForMood(family);
}
function nymphChoosePalette(){
  // User-facing shuffle should jump to a new family, not slightly mutate one colour.
  const family = nymphPickFamily();
  const candidates=[];
  for(let i=0;i<10;i++)candidates.push(nymphGeneratedPaletteForMood(family));
  for(let i=0;i<12;i++)candidates.push(nymphBuildCuratedVariant(family));
  // Add a few cross-family wildcards only as backups, not as the main experience.
  for(let i=0;i<4;i++)candidates.push(nymphGeneratedPaletteForMood(nymphPickFamily()));
  let best=null,score=-999;
  for(const p of candidates.filter(Boolean)){
    const sc=nymphFamilyQuality(p,family);
    if(sc>score){best=p;score=sc;}
  }
  best=best||nymphGeneratedPaletteForMood(family);
  nymphRemember(best);
  return {colors:best, family};
}
window.NURR_NYMPH_GRADIENT_ENGINE = {
  formulas: NYMPH_FORMULAS,
  shuffle(){
    // Figma-plugin-aligned shuffle: broad candidate search + role formula.
    // No calm/desaturation pass, because that made NURR outputs muddy and repetitive.
    nymphActiveFormula = NYMPH_FORMULAS[nymphPick(NYMPH_FORMULA_BAG)] || NYMPH_FORMULAS['dominant-heavy'];
    const picked = nymphChoosePalette();
    const colors = Array.isArray(picked) ? picked : picked.colors;
    const family = picked.family || 'mixed';
    nymphRemember(colors);
    return {
      colors,
      formula:nymphActiveFormula.id,
      formulaWeights:(nymphActiveFormula.w || [1,1,1,.62]).slice(0,4),
      label:nymphActiveFormula.label,
      family,
      // Figma plugin base values; range kept restrained so horizontal/vertical remain multi-colour fields.
      spread:clampGradient(nymphActiveFormula.spread + (Math.random()-.5)*.10,.54,.80),
      distance:clampGradient(nymphActiveFormula.distance + (Math.random()-.5)*.10,.44,.72),
      blend:clampGradient(nymphActiveFormula.blend + .035 + (Math.random()-.5)*.08,.40,.58),
      pigment:0.92,
      saturation:0.60 + Math.random()*0.08,
      grain:0.025,
      direction:(Math.random() < .34 ? 'organic' : (Math.random() < .50 ? 'horizontal' : 'vertical'))
    };
  }
};

function getNymphFormulaWeights(tweaks = {}) {
  // Generated palettes keep the Nymph hierarchy. Manual edits switch to a
  // balanced role model so every swatch the user edits remains visible.
  if (tweaks.manualPalette || tweaks.formula === 'manual') {
    return NYMPH_MANUAL_FORMULA_WEIGHTS.slice();
  }
  if (Array.isArray(tweaks.formulaWeights) && tweaks.formulaWeights.length >= 4) {
    return tweaks.formulaWeights.map(v => clampGradient(Number(v) || 1, 0.18, 2.2)).slice(0,4);
  }
  const id = tweaks.formula || 'dominant-heavy';
  const f = NYMPH_FORMULAS[id] || NYMPH_FORMULAS['dominant-heavy'];
  return (f && Array.isArray(f.w) ? f.w : [1.55,.85,.70,.46]).slice(0,4);
}

// ── Shared per-frame uniform application ────────────────────────────────────
// Used by BOTH the live on-screen draw loop and the offscreen high-res export
// renderer below, so there is exactly one place that decides what the GPU
// sees. targetW/targetH is the render resolution (may be far larger than the
// on-screen canvas); time/mouse/pulse is the interaction state to render —
// the live values for the on-screen canvas, or a frozen snapshot for export
// so a later high-res render always matches what was saved, not whatever the
// canvas happens to be doing right now.
//
// Surface state (Clean / Chromatic Haze / Pixelate) is set through one
// explicit three-way branch. Each branch sets every surface-related uniform
// for its own mode and zeroes the other two modes' uniforms in the same
// pass, so no leftover Pixelate grid or Chroma value can survive a mode
// switch, a shuffle, a randomize, or a re-render at a different resolution.
function applyGradientFrame(gl, prog, targetW, targetH, tweaks, time, mouse, pulse) {
  gl.viewport(0, 0, targetW, targetH);
  gl.disable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.SCISSOR_TEST);
  gl.useProgram(prog);

  const u = (name) => gl.getUniformLocation(prog, name);
  const m = mouse || { x:0.5, y:0.5, chaosX:0.5, chaosY:0.5 };

  gl.uniform1f(u('u_time'), time || 0);
  gl.uniform2f(u('u_resolution'), targetW, targetH);
  gl.uniform2f(u('u_mouse'), m.chaosX ?? m.x ?? 0.5, 1 - (m.chaosY ?? m.y ?? 0.5));
  gl.uniform2f(u('u_mouseRaw'), m.x ?? 0.5, 1 - (m.y ?? 0.5));
  gl.uniform1f(u('u_clickPulse'), pulse || 0);
  gl.uniform1f(u('u_grain'), tweaks.grain);
  gl.uniform1f(u('u_flow'), tweaks.flow);
  gl.uniform1f(u('u_spread'), tweaks.spread ?? 0.62);
  gl.uniform1f(u('u_distance'), tweaks.colorDistance ?? tweaks.spread ?? 0.56);
  gl.uniform1f(u('u_blend'), tweaks.blend ?? 0.56);
  const fw = getNymphFormulaWeights(tweaks);
  gl.uniform1f(u('u_role0'), fw[0]);
  gl.uniform1f(u('u_role1'), fw[1]);
  gl.uniform1f(u('u_role2'), fw[2]);
  gl.uniform1f(u('u_role3'), fw[3]);
  const directionMap = { organic:0, horizontal:1, vertical:2 };
  gl.uniform1i(u('u_directionMode'), directionMap[tweaks.direction || 'organic'] ?? 0);
  gl.uniform1i(u('u_invert'), tweaks.invert ? 1 : 0);
  gl.uniform1i(u('u_bw'), tweaks.bw ? 1 : 0);

  const tex = window.NurrTextureEngine
    ? window.NurrTextureEngine.toUniforms(tweaks)
    : { mode:0, amount:0, scale:0.45, softness:0.5, distortion:0, seed:0.413, pixelateAmount:0, pixelateScale:0.62, chromaAmount:0, chromaSeed:0.413 };
  const surfaceId = tweaks.texturePreset || 'clean';
  const surfaceMode = surfaceId === 'print-noise' ? 'pixelate' : (surfaceId === 'chromatic-haze' ? 'chroma' : 'clean');

  if (surfaceMode === 'pixelate') {
    gl.uniform1i(u('u_textureMode'), 0);
    gl.uniform1f(u('u_textureAmount'), 0);
    gl.uniform1f(u('u_textureScale'), tex.scale);
    gl.uniform1f(u('u_textureSoftness'), tex.softness);
    gl.uniform1f(u('u_textureDistortion'), 0);
    gl.uniform1f(u('u_textureSeed'), tex.seed);
    gl.uniform1i(u('u_pixelateEnabled'), 1);
    gl.uniform1f(u('u_pixelateAmount'), tex.pixelateAmount ?? tex.amount ?? 0);
    gl.uniform1f(u('u_pixelateScale'), tex.pixelateScale ?? tex.scale ?? 0.62);
    gl.uniform1i(u('u_chromaEnabled'), 0);
    gl.uniform1f(u('u_chromaAmount'), 0);
    gl.uniform1f(u('u_chromaSeed'), 0.413);
  } else if (surfaceMode === 'chroma') {
    gl.uniform1i(u('u_textureMode'), 0);
    gl.uniform1f(u('u_textureAmount'), 0);
    gl.uniform1f(u('u_textureScale'), 0.45);
    gl.uniform1f(u('u_textureSoftness'), tex.softness);
    gl.uniform1f(u('u_textureDistortion'), 0);
    gl.uniform1f(u('u_textureSeed'), tex.seed);
    gl.uniform1i(u('u_pixelateEnabled'), 0);
    gl.uniform1f(u('u_pixelateAmount'), 0);
    gl.uniform1f(u('u_pixelateScale'), 0.62);
    gl.uniform1i(u('u_chromaEnabled'), 1);
    gl.uniform1f(u('u_chromaAmount'), Math.min(0.78, tex.chromaAmount || tweaks.textureAmount || 0.70));
    gl.uniform1f(u('u_chromaSeed'), tex.chromaSeed || tex.seed || 0.413);
  } else {
    gl.uniform1i(u('u_textureMode'), tex.mode);
    gl.uniform1f(u('u_textureAmount'), tex.amount);
    gl.uniform1f(u('u_textureScale'), tex.scale);
    gl.uniform1f(u('u_textureSoftness'), tex.softness);
    gl.uniform1f(u('u_textureDistortion'), tex.distortion);
    gl.uniform1f(u('u_textureSeed'), tex.seed);
    gl.uniform1i(u('u_pixelateEnabled'), 0);
    gl.uniform1f(u('u_pixelateAmount'), 0);
    gl.uniform1f(u('u_pixelateScale'), 0.62);
    gl.uniform1i(u('u_chromaEnabled'), 0);
    gl.uniform1f(u('u_chromaAmount'), 0);
    gl.uniform1f(u('u_chromaSeed'), 0.413);
  }

  gl.uniform1i(u('u_count'), tweaks.colors.length);
  for (let i=0; i<4; i++) {
    const rawHex = tweaks.colors[i] || tweaks.colors[tweaks.colors.length-1] || '#000000';
    const hex = adjustGradientHex(rawHex, tweaks);
    const [r,g,b] = WP.hexToRGB(hex);
    gl.uniform3f(u(`u_color${i}`), r, g, b);
  }
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.flush();
}

// ── Offscreen high-res export renderer ──────────────────────────────────────
// Renders the gradient natively at the exact requested export resolution on
// a throwaway canvas/WebGL context, independent of whatever canvas is
// currently mounted on screen. This is what lets the Export panel produce a
// true 2K/4K/etc. image instead of upscaling a small saved preview, keeps
// Grain procedural at full resolution instead of stretched into square
// blocks, and avoids any race or stale-context behaviour from resizing the
// live, still-animating on-screen canvas (a known Safari trouble spot).
function renderGradientOffscreen(tweaks, renderState, width, height) {
  if (!tweaks) return null;
  const w = Math.max(1, Math.round(width) || 3840);
  const h = Math.max(1, Math.round(height) || 2160);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const result = initGradientGL(canvas);
  if (!result) return null;
  const { gl, prog } = result;
  const rs = renderState || {};
  const mouse = rs.mouse || { x:0.5, y:0.5, chaosX:0.5, chaosY:0.5 };
  const time = Number.isFinite(rs.time) ? rs.time : 0;
  const pulse = Number.isFinite(rs.pulse) ? rs.pulse : 0;
  applyGradientFrame(gl, prog, w, h, tweaks, time, mouse, pulse);
  const dataUrl = canvas.toDataURL('image/png');
  const loseCtx = gl.getExtension('WEBGL_lose_context');
  if (loseCtx) loseCtx.loseContext();
  return dataUrl;
}
window.NurrGradientRenderToDataURL = renderGradientOffscreen;

// ── Persistent-context motion renderer ──────────────────────────────────────
// One offscreen WebGL context, reused for every frame of a motion export, so
// the animation is rendered natively at the chosen export resolution on the
// GPU. captureStream() reads this canvas directly — no per-frame PNG encode /
// decode, no context churn — which is what makes high-res video export fast
// and crisp. Returns { canvas, draw(tweaks, renderState), dispose() }.
window.NurrGradientMotion = function (width, height) {
  const w = Math.max(1, Math.round(width) || 1920);
  const h = Math.max(1, Math.round(height) || 1080);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const res = initGradientGL(canvas);
  if (!res) return null;
  const { gl, prog } = res;
  return {
    canvas,
    width: w,
    height: h,
    draw(tweaks, renderState) {
      const rs = renderState || {};
      const mouse = rs.mouse || { x: 0.5, y: 0.5, chaosX: 0.5, chaosY: 0.5 };
      applyGradientFrame(
        gl, prog, w, h, tweaks,
        Number.isFinite(rs.time) ? rs.time : 0,
        mouse,
        Number.isFinite(rs.pulse) ? rs.pulse : 0
      );
    },
    dispose() {
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    }
  };
};
// Exposed for the mobile UI so its palette edits go through the exact same
// path as the desktop palette editor (keeps swatches, picker and canvas in sync).
window.NURR_manualGradientPatch = manualGradientPatch;
window.NURR_adjustGradientHex   = adjustGradientHex;

function GradientMode({ tweaks, registerSnapshot, mouseRef }) {
  const canvasRef = gmUR(null);
  const glRef = gmUR(null);
  const progRef = gmUR(null);
  WP.useStageSize(canvasRef);
  const stateRef = gmUR({
    pulse: 0,
    positionPaused: false,
    pausedMouse: null,
    pausedTime: null,
    mouseLocked: false,
    lockedMouse: null,
    smoothMouse: { x:0.5, y:0.5, chaosX:0.5, chaosY:0.5 },
    pointerDown: false,
    pointerStart: null,
    pointerCurrent: null,
    isDragging: false,
    suppressClickUntil: 0,
    clickTimer: null
  });

  // ── GL initialisation ────────────────────────────────────────────────────
  gmUE(() => {
    const canvas = canvasRef.current;
    const result = initGradientGL(canvas);
    if (!result) return;
    glRef.current = result.gl;
    progRef.current = result.prog;

    // ── WebGL context loss / restore ─────────────────────────────────────
    // Browsers can terminate a WebGL context after extended idle (especially
    // on mobile / low-power mode). Without handling this the canvas shows a
    // blank frame with a hard diagonal boundary on restore.
    const onContextLost = (e) => {
      e.preventDefault(); // required so the browser will restore the context
    };
    const onContextRestored = () => {
      const res = initGradientGL(canvas);
      if (!res) return;
      glRef.current = res.gl;
      progRef.current = res.prog;
    };
    canvas.addEventListener('webglcontextlost', onContextLost, false);
    canvas.addEventListener('webglcontextrestored', onContextRestored, false);

    // ── Visibility change ─────────────────────────────────────────────────
    // When the page returns from hidden, force an immediate draw so the first
    // visible frame is always complete — preventing the partial-triangle seam
    // that can appear when the compositor resumes before rAF fires.
    const onVisibility = () => {
      if (!document.hidden) {
        const c = canvasRef.current;
        if (c) drawAt(c.width, c.height);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      canvas.removeEventListener('webglcontextlost', onContextLost, false);
      canvas.removeEventListener('webglcontextrestored', onContextRestored, false);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  gmUE(() => {
    const isInterfaceEvent = (e) => !!(e.target && e.target.closest && e.target.closest(
      '.panel,.icon-btn,.rail,.layout-card,.palette-card,.nature-thumb,.swatch,.color-wheel-card,.eyedropper-follow,button,input,select,textarea,label,.drop-zone,.nymph-landing'
    ));
    const readPoint = (e) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return null;
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      const live = mouseRef.current || { x, y, chaosX: x, chaosY: y };
      const dx = x - (live.x ?? x);
      const dy = y - (live.y ?? y);
      return {
        x, y,
        chaosX: Math.max(0, Math.min(1, (live.chaosX ?? x) + dx)),
        chaosY: Math.max(0, Math.min(1, (live.chaosY ?? y) + dy))
      };
    };
    const movedEnough = (a, b) => {
      if (!a || !b) return false;
      const dx = (a.clientX - b.clientX);
      const dy = (a.clientY - b.clientY);
      return Math.sqrt(dx*dx + dy*dy) > 4;
    };

    const onPointerDown = (e) => {
      if (isInterfaceEvent(e)) return;
      const pt = readPoint(e);
      if (!pt) return;
      const st = stateRef.current;
      st.pointerDown = true;
      st.pointerStart = { clientX:e.clientX, clientY:e.clientY, pt };
      st.pointerCurrent = st.pointerStart;
      st.isDragging = false;
    };
    const onPointerMove = (e) => {
      const st = stateRef.current;
      if (!st.pointerDown || !st.pointerStart) return;
      const pt = readPoint(e);
      if (!pt) return;
      st.pointerCurrent = { clientX:e.clientX, clientY:e.clientY, pt };
      if (!st.isDragging && movedEnough(st.pointerStart, st.pointerCurrent)) {
        st.isDragging = true;
        st.positionPaused = false;
        st.pausedMouse = null;
        st.pausedTime = null;
        st.mouseLocked = true;
      }
      if (st.isDragging) {
        st.lockedMouse = pt;
        st.pulse = Math.max(st.pulse, 0.45);
        e.preventDefault();
      }
    };
    const onPointerUp = (e) => {
      const st = stateRef.current;
      if (st.pointerDown && st.isDragging) {
        const pt = readPoint(e) || (st.pointerCurrent && st.pointerCurrent.pt) || st.lockedMouse;
        if (pt) st.lockedMouse = pt;
        st.mouseLocked = true;
        st.positionPaused = false;
        st.pausedMouse = null;
        st.pausedTime = null;
        st.suppressClickUntil = performance.now() + 260;
        e.preventDefault();
      }
      st.pointerDown = false;
      st.pointerStart = null;
      st.pointerCurrent = null;
      st.isDragging = false;
    };

    const onClick = (e) => {
      if (isInterfaceEvent(e)) return;
      const st = stateRef.current;
      if (performance.now() < st.suppressClickUntil) return;
      const pt = readPoint(e);
      if (!pt) return;
      if (st.clickTimer) clearTimeout(st.clickTimer);
      st.clickTimer = setTimeout(() => {
        st.pulse = 1.0;
        st.positionPaused = !st.positionPaused;
        if (st.positionPaused) {
          // One click is a soft freeze: it preserves the exact current field position
          // and leaves only the slow breathing motion alive.
          st.pausedMouse = st.smoothMouse || pt;
          st.pausedTime = (window.__NURR_T ?? performance.now() / 1000);
        } else {
          st.pausedMouse = null;
          st.pausedTime = null;
        }
        st.clickTimer = null;
      }, 210);
    };
    const onDoubleClick = (e) => {
      if (isInterfaceEvent(e)) return;
      const pt = readPoint(e);
      if (!pt) return;
      const st = stateRef.current;
      if (st.clickTimer) { clearTimeout(st.clickTimer); st.clickTimer = null; }
      st.positionPaused = false;
      st.pausedMouse = null;
      st.pausedTime = null;
      st.mouseLocked = !st.mouseLocked;
      // Double click toggles cursor tracking without snapping the field back.
      // When locking, use the current smoothed field position; when releasing,
      // the same smoothed position eases toward the live cursor in drawAt().
      st.lockedMouse = st.mouseLocked ? (st.smoothMouse || pt) : null;
      st.pulse = Math.max(st.pulse, 0.65);
      e.preventDefault();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', onPointerUp, true);
    window.addEventListener('click', onClick, true);
    window.addEventListener('dblclick', onDoubleClick, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', onPointerUp, true);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('dblclick', onDoubleClick, true);
      if (stateRef.current.clickTimer) clearTimeout(stateRef.current.clickTimer);
    };
  }, []);

  const drawAt = (targetW, targetH) => {
    const gl = glRef.current; const prog = progRef.current;
    if (!gl || !prog) return;
    // Guard against a lost context: isContextLost() returns true after loss.
    if (gl.isContextLost()) return;

    // No gl.clear() needed — the oversized single triangle covers every pixel
    // in the viewport. Clearing would only add a risk of a one-frame flash to
    // black if compositing races the draw call after an idle period.

    const stInteract = stateRef.current;
    const targetMouse = stInteract.positionPaused && stInteract.pausedMouse
      ? stInteract.pausedMouse
      : (stInteract.mouseLocked && stInteract.lockedMouse
        ? stInteract.lockedMouse
        : (mouseRef.current || { x:0.5, y:0.5, chaosX:0.5, chaosY:0.5 }));
    const prevMouse = stInteract.smoothMouse || targetMouse;
    const ease = stInteract.positionPaused ? 0.055 : (stInteract.mouseLocked ? 0.20 : 0.16);
    const m = {
      x: prevMouse.x + ((targetMouse.x ?? 0.5) - prevMouse.x) * ease,
      y: prevMouse.y + ((targetMouse.y ?? 0.5) - prevMouse.y) * ease,
      chaosX: prevMouse.chaosX + ((targetMouse.chaosX ?? targetMouse.x ?? 0.5) - prevMouse.chaosX) * ease,
      chaosY: prevMouse.chaosY + ((targetMouse.chaosY ?? targetMouse.y ?? 0.5) - prevMouse.chaosY) * ease
    };
    stInteract.smoothMouse = m;
    const liveTime = window.__NURR_T ?? performance.now() / 1000;
    const t = stInteract.positionPaused && stInteract.pausedTime != null
      ? stInteract.pausedTime + (liveTime - stInteract.pausedTime) * 0.16
      : liveTime;
    // Single shared uniform/draw path — see applyGradientFrame above.
    applyGradientFrame(gl, prog, targetW, targetH, tweaks, t, m, stInteract.pulse);
  };

  WP.useAnimationLoop((t, dt) => {
    const canvas = canvasRef.current; if (!canvas) return;
    // Clamp dt to avoid a huge pulse decay on the first frame after the tab
    // was hidden for a long time (rAF pauses when the tab is not visible).
    const safeDt = Math.min(dt, 0.1);
    stateRef.current.pulse *= Math.exp(-safeDt*1.4);
    drawAt(canvas.width, canvas.height);
  });

  gmUE(() => {
    // Publish the current look + interaction state so the motion exporter can
    // start its designed animation from exactly what's on screen (colours,
    // spread, blend, direction, texture) and morph outward from there.
    window.NurrGradientLiveState = () => {
      const st = stateRef.current || {};
      const liveTime = window.__NURR_T ?? performance.now() / 1000;
      const mouse = st.smoothMouse ? { ...st.smoothMouse } : { x: 0.5, y: 0.5, chaosX: 0.5, chaosY: 0.5 };
      return {
        tweaks: JSON.parse(JSON.stringify(tweaks)),
        renderState: { time: liveTime, mouse, pulse: st.pulse || 0 }
      };
    };
    return () => { if (window.NurrGradientLiveState) delete window.NurrGradientLiveState; };
  }, [tweaks]);

  gmUE(() => {
    registerSnapshot((opts = {}) => {
      const canvas = canvasRef.current; if (!canvas) return null;
      // Every snapshot — thumbnail, direct download, or (via app.js) a
      // matrix export — now renders through the same offscreen path
      // (renderGradientOffscreen / applyGradientFrame). The on-screen canvas
      // is never resized for this, which removes the resize/restore race
      // against the live rAF loop and the Safari stale-canvas behaviour
      // that race could trigger.
      const stInteract = stateRef.current;
      const liveTime = window.__NURR_T ?? performance.now() / 1000;
      const time = stInteract.positionPaused && stInteract.pausedTime != null
        ? stInteract.pausedTime + (liveTime - stInteract.pausedTime) * 0.16
        : liveTime;
      const mouse = stInteract.smoothMouse
        ? { ...stInteract.smoothMouse }
        : { x:0.5, y:0.5, chaosX:0.5, chaosY:0.5 };
      const liveRenderState = { time, mouse, pulse: stInteract.pulse || 0 };
      const renderState = opts.renderStateOverride || opts.renderState || liveRenderState;

      if (opts.captureRenderState) {
        // Library save flow: freeze this exact interaction state alongside
        // the small preview so a later export can reproduce the same
        // visual at full resolution instead of whatever the canvas happens
        // to be doing when Export is eventually clicked.
        const w = opts.width || 960, h = opts.height || 540;
        const dataUrl = renderGradientOffscreen(tweaks, renderState, w, h);
        return dataUrl ? { dataUrl, renderState, tweaks: JSON.parse(JSON.stringify(tweaks)) } : null;
      }

      const w = opts.width || 3840;
      const h = opts.height || 2160;
      const dataUrl = renderGradientOffscreen(tweaks, renderState, w, h);
      if (!dataUrl) return null;
      if (!opts.returnDataUrl) {
        const filename = opts.filename || `gradient-${w}x${h}-${Date.now()}.png`;
        const a = document.createElement('a');
        a.href = dataUrl; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      }
      return dataUrl;
    });
  }, [tweaks, registerSnapshot]);

  return <canvas ref={canvasRef} className="stage" />;
}

function GradientControls({ tweaks, setTweaks }) {
  const [presetsOpen, setPresetsOpen] = React.useState(false);
  const setColors = (next) => setTweaks(manualGradientPatch(next, tweaks));
  const PaletteEditor = window.NurrPaletteEditor;
  const displayColors = Array.isArray(tweaks.colors) ? tweaks.colors.map(c => adjustGradientHex(c, tweaks)) : tweaks.colors;

  const cleanPresetColors = (palette) => {
    const source = Array.isArray(palette) ? palette : [];
    const unique = [];
    source.forEach((color) => {
      const hex = String(color || '').trim().toUpperCase();
      if (/^#[0-9A-F]{6}$/.test(hex) && unique.indexOf(hex) === -1) unique.push(hex);
    });
    return unique.slice(0, 4);
  };

  const applyPreset = (palette) => {
    const colors = cleanPresetColors(palette);
    if (colors.length < 2) return;
    setTweaks({
      ...manualGradientPatch(colors, tweaks),
      spread: Math.max(tweaks.spread ?? 0.62, colors.length >= 3 ? 0.62 : 0.48),
      colorDistance: tweaks.colorDistance ?? 0.56,
      blend: tweaks.blend ?? 0.56
    });
  };

  const activePresetIdx = WP.PALETTE_PRESETS.findIndex(p =>
    p.slice(0, tweaks.colors.length).every((c,i) => c.toLowerCase() === (tweaks.colors[i]||'').toLowerCase())
  );

  const randomizeGradient = () => {
    const formula = window.NURR_NYMPH_GRADIENT_ENGINE && window.NURR_NYMPH_GRADIENT_ENGINE.shuffle
      ? window.NURR_NYMPH_GRADIENT_ENGINE.shuffle()
      : null;
    const rawColors = formula && formula.colors ? formula.colors : cleanPresetColors(WP.PALETTE_PRESETS[Math.floor(Math.random() * WP.PALETTE_PRESETS.length)] || tweaks.colors);
    const formulaColorTweaks = {
      pigment: formula && formula.pigment != null ? formula.pigment : (0.68 + Math.random() * 0.26),
      saturation: formula && formula.saturation != null ? formula.saturation : (0.44 + Math.random() * 0.26),
      temperature: 0
    };
    const colors = bakeGradientPalette(rawColors, formulaColorTweaks);
    // Randomize must not mix visual generation with surface state.
    // Surface effects are explicit user choices only; this prevents stale
    // Pixelate/chroma internals from surviving a randomize click.
    const nextTexture = 'clean';
    const nextTextureAmount = 0;
    setTweaks({
      colors: colors && colors.length >= 2 ? colors.slice(0, 4) : tweaks.colors,
      manualPalette: false,
      direction: formula && formula.direction ? formula.direction : (Math.random() < .34 ? 'organic' : (Math.random() < .5 ? 'horizontal' : 'vertical')),
      spread: formula && formula.spread != null ? formula.spread : (0.46 + Math.random() * 0.32),
      colorDistance: formula && formula.distance != null ? formula.distance : (0.34 + Math.random() * 0.42),
      blend: formula && formula.blend != null ? formula.blend : (0.42 + Math.random() * 0.34),
      pigment: 0.5,
      saturation: 0.5,
      temperature: 0,
      flow: 0.62 + Math.random() * 0.68,
      grain: formula && formula.grain != null ? formula.grain : (0.018 + Math.random() * 0.035),
      texturePreset: nextTexture,
      textureAmount: nextTextureAmount,
      textureScale: 0.45,
      textureSeed: Math.random(),
      formula: formula ? formula.formula : tweaks.formula,
      formulaLabel: formula ? formula.label : tweaks.formulaLabel,
      formulaWeights: formula && formula.formulaWeights ? formula.formulaWeights : tweaks.formulaWeights,
    });
  };

  return (
    <>
      <PaletteEditor
        colors={tweaks.colors}
        swatchColors={(tweaks.colors || []).map(c => adjustGradientHex(c, tweaks))}
        setColors={setColors}
        minColors={1}
        maxColors={4}
        allowAdd={true}
        extraActions={(
          <>
            <button
              type="button"
              className="btn gradient-flip-btn"
              onClick={() => setTweaks({ ...manualGradientPatch((tweaks.colors || []).slice().reverse(), tweaks), textureSeed: Math.random() })}
              title="Reverse palette order"
            >Flip</button>
            <button
              type="button"
              className="btn gradient-randomize-btn"
              onClick={randomizeGradient}
              title="Randomize palette, direction, movement, spread and surface"
            >Randomize</button>
          </>
        )}
      />

      <div className={'section presets-section collapsible-presets ' + (presetsOpen ? 'is-open' : 'is-collapsed')}>
        <button
          type="button"
          className="section-label presets-toggle"
          onClick={() => setPresetsOpen(!presetsOpen)}
          aria-expanded={presetsOpen}
        >
          <span className="name">Presets</span>
          <span className="value">{WP.PALETTE_PRESETS.length}</span>
          <span className="preset-arrow">{presetsOpen ? '⌃' : '⌄'}</span>
        </button>
        <div className="palette-grid">
          {WP.PALETTE_PRESETS.map((p,i) => (
            <button key={i} className={'palette-card'+(i===activePresetIdx?' active':'')}
              onClick={() => applyPreset(p)}
              title={p.join(' · ')}>
              {p.map((c,j) => <span key={j} style={{background:c}} />)}
            </button>
          ))}
        </div>
      </div>


      <div className="section gradient-direction-section">
        <div className="section-label"><span className="name">Direction</span><span className="value">{(tweaks.direction || 'organic')}</span></div>
        <div className="nurr-segment-row gradient-segment-row">
          {[['organic','Organic'],['horizontal','Horizontal'],['vertical','Vertical']].map(([id,label]) => (
            <button
              key={id}
              type="button"
              className={'nurr-segment' + ((tweaks.direction || 'organic') === id ? ' active' : '')}
              onClick={() => setTweaks({direction:id})}
            >{label}</button>
          ))}
        </div>
      </div>

      <div className="section gradient-transform-section">
        <div className="section-label"><span className="name">Transform</span><span className="value">{tweaks.bw ? 'B&W' : (tweaks.invert ? 'Invert' : 'Color')}</span></div>
        <div className="nurr-segment-row gradient-segment-row">
          <button type="button" className={'nurr-segment' + (tweaks.bw ? ' active' : '')} onClick={() => setTweaks({bw:!tweaks.bw})}>B&amp;W</button>
          <button type="button" className={'nurr-segment' + (tweaks.invert ? ' active' : '')} onClick={() => setTweaks({invert:!tweaks.invert})}>Invert</button>
        </div>
      </div>


      <div className="section surface-section">
        <div className="section-label">
          <span className="name">Surface</span>
          <span className="value">{(window.NurrTextureEngine?.byId(tweaks.texturePreset)?.name || 'Clean')}</span>
        </div>
        <div className="surface-grid">
          {(window.NurrTextureEngine?.list() || []).map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={'surface-card' + ((tweaks.texturePreset || 'clean') === preset.id ? ' active' : '')}
              onClick={() => setTweaks(window.NurrTextureEngine.applyPresetToTweaks(preset, tweaks))}
              title={preset.access === 'free' ? preset.name : `${preset.name} · ${preset.access}`}
            >
              <span className={'surface-sample surface-' + preset.id}></span>
              <span className="surface-name">{preset.name}</span>
            </button>
          ))}
        </div>
      </div>

      {(tweaks.texturePreset || 'clean') !== 'clean' && (
        <div className="section">
          <div className="section-label">
            <span className="name">{(tweaks.texturePreset || 'clean') === 'print-noise' ? 'Pixel size' : 'Surface amount'}</span>
            <span className="value">{Math.round((tweaks.textureAmount ?? 0) * 100)}</span>
          </div>
          <input className="slider" type="range" min="0" max="1" step="0.01"
            value={tweaks.textureAmount ?? 0}
            onChange={(e)=>setTweaks({textureAmount:parseFloat(e.target.value)})} />
        </div>
      )}

      <div className="section">
        <div className="section-label"><span className="name">Grain</span><span className="value">{Math.round(tweaks.grain*100)}</span></div>
        <input className="slider" type="range" min="0" max="1" step="0.01"
          value={tweaks.grain} onChange={(e)=>setTweaks({grain:parseFloat(e.target.value)})} />
      </div>
      <div className="section">
        <div className="section-label"><span className="name">Flow</span><span className="value">{Math.round(tweaks.flow*100)}</span></div>
        <input className="slider" type="range" min="0" max="2.2" step="0.01"
          value={tweaks.flow} onChange={(e)=>setTweaks({flow:parseFloat(e.target.value)})} />
      </div>

      <div className="section">
        <div className="section-label">
          <span className="name">Color spread</span>
          <span className="value">{Math.round((tweaks.spread ?? 0.62) * 100)}</span>
        </div>
        <input className="slider" type="range" min="0.18" max="1" step="0.01"
          value={tweaks.spread ?? 0.62} onChange={(e)=>setTweaks({spread:parseFloat(e.target.value)})} />
      </div>

      <div className="section">
        <div className="section-label">
          <span className="name">Color distance</span>
          <span className="value">{Math.round((tweaks.colorDistance ?? 0.56) * 100)}</span>
        </div>
        <input className="slider" type="range" min="0" max="1" step="0.01"
          value={tweaks.colorDistance ?? 0.56} onChange={(e)=>setTweaks({colorDistance:parseFloat(e.target.value)})} />
      </div>

      <div className="section">
        <div className="section-label">
          <span className="name">Blend</span>
          <span className="value">{Math.round((tweaks.blend ?? 0.56) * 100)}</span>
        </div>
        <input className="slider" type="range" min="0" max="1" step="0.01"
          value={tweaks.blend ?? 0.56} onChange={(e)=>setTweaks({blend:parseFloat(e.target.value)})} />
      </div>

      <div className="section">
        <div className="section-label"><span className="name">Pigment</span><span className="value">{Math.round((tweaks.pigment ?? 0.5) * 100)}</span></div>
        <input className="slider" type="range" min="0" max="1" step="0.01"
          value={tweaks.pigment ?? 0.5} onChange={(e)=>setTweaks({pigment:parseFloat(e.target.value)})} />
      </div>

      <div className="section">
        <div className="section-label"><span className="name">Saturation</span><span className="value">{Math.round((tweaks.saturation ?? 0.5) * 100)}</span></div>
        <input className="slider" type="range" min="0" max="1" step="0.01"
          value={tweaks.saturation ?? 0.5} onChange={(e)=>setTweaks({saturation:parseFloat(e.target.value)})} />
      </div>

      <div className="section">
        <div className="section-label"><span className="name">Color temp</span><span className="value">{Math.round((tweaks.temperature ?? 0) * 100)}</span></div>
        <input className="slider" type="range" min="-1" max="1" step="0.01"
          value={tweaks.temperature ?? 0} onChange={(e)=>setTweaks({temperature:parseFloat(e.target.value)})} />
      </div>

      <div className="help compact-help">
        Click the artwork to freeze/unfreeze the gradient before saving.
      </div>
    </>
  );
}

const NYMPH_LAUNCH_PRESETS = [
  ['#050505','#60798B','#B5B198','#DCD9C8'],
  ['#190A13','#F53522','#FCF6B8','#A51261'],
  ['#12091D','#455A88','#F1D7C8','#D74876'],
  ['#101214','#60798B','#FBC3E6','#A51261'],
  ['#1D020E','#FC87C2','#F3F3F1','#2E484A'],
  ['#02070A','#0381ED','#F3F3F1','#CFFA33'],
  ['#050407','#450580','#00D9A6','#F3AE39'],
  ['#050505','#C6C0A0','#FAF6EA','#8C8C8C'],
  ['#221337','#818166','#F3EAD7','#A28CFB'],
  ['#2E0008','#FBC3E6','#E79C71','#03639E'],
  ['#081599','#87B2FF','#F6F1E7','#FD5DCF'],
  ['#4E4B38','#CCC3BA','#F04E31','#EAEAEA'],
  ['#2460A8','#711E2A','#BE690E','#D9C004'],
  ['#1E1F24','#052C45','#C7C7C5','#FF1727'],
  ['#2A070E','#FBC3E6','#FCF6B8','#B91F31'],
  ['#0B4E9B','#2A0318','#0379EF','#FDE7B6']
];

function nymphCalmPalette(colors){
  return colors.slice(0,4).map((c,i)=>{
    const h=gradientRgbToHsl(gradientHexToRgb255(c));
    // Keep accents alive but avoid every colour becoming max-neon on reload.
    const maxS = i === 1 ? 0.78 : (i === 3 ? 0.72 : 0.64);
    h.s = clampGradient(h.s, 0.10, maxS);
    h.l = clampGradient(h.l, i === 0 ? 0.045 : 0.075, i === 2 ? 0.90 : 0.84);
    return gradientHslToHex(h.h,h.s,h.l);
  });
}

function buildRandomGradientDefaults(){
  const fallback = {
    colors:['#160006','#065D78','#F1BE92','#9AF01D'],
    grain:0.025, flow:0.96, spread:0.58, colorDistance:0.64, blend:0.44,
    pigment:0.86, saturation:0.56, temperature:0, direction:'vertical',
    bw:false, invert:false, texturePreset:'clean', textureAmount:0, textureSeed:0.413,
    formula:'dominant-heavy', formulaWeights:[1.55,.85,.70,.46], manualPalette:false
  };
  try {
    const f = window.NURR_NYMPH_GRADIENT_ENGINE && window.NURR_NYMPH_GRADIENT_ENGINE.shuffle
      ? window.NURR_NYMPH_GRADIENT_ENGINE.shuffle()
      : null;
    if(!f || !Array.isArray(f.colors)) return fallback;
    return {
      ...fallback,
      colors:bakeGradientPalette(f.colors, { pigment:f.pigment ?? fallback.pigment, saturation:f.saturation ?? fallback.saturation, temperature:0 }),
      manualPalette:false,
      spread:f.spread ?? fallback.spread,
      colorDistance:f.distance ?? fallback.colorDistance,
      blend:f.blend ?? fallback.blend,
      pigment:0.5,
      saturation:0.5,
      temperature:0,
      grain:f.grain ?? fallback.grain,
      formula:f.formula || fallback.formula,
      formulaWeights:f.formulaWeights || fallback.formulaWeights,
      formulaLabel:f.label || 'Dominant heavy',
      textureSeed:Math.random(),
      direction:f.direction || (Math.random() < 0.34 ? 'organic' : (Math.random() < 0.52 ? 'horizontal' : 'vertical'))
    };
  } catch(e) {
    return fallback;
  }
}


window.GRADIENT_DEFAULTS = buildRandomGradientDefaults();
window.NURR_GRADIENT_FIXED_START = {
  colors:['#004999','#12000A','#007BF0','#FFF0CF'],
  grain:0.025, flow:0.96, spread:0.58, colorDistance:0.64, blend:0.44,
  pigment:0.5, saturation:0.5, temperature:0, direction:'horizontal',
  bw:false, invert:false, texturePreset:'clean', textureAmount:0, textureSeed:0.413, manualPalette:false
};
