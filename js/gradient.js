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

  float fine = hash(uv * u_resolution + vec2(u_textureSeed*997.0)) - 0.5;
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
    // Chromatic haze: airy RGB diffusion rather than a decorative glow.
    float haze = fbm(q*6.0 + vec2(time*0.006, 0.0));
    vec3 prism = vec3(
      sin((q.x+haze)*8.0 + 0.0),
      sin((q.x+haze)*8.0 + 2.1),
      sin((q.x+haze)*8.0 + 4.2)
    ) * 0.5 + 0.5;
    col = mix(col, col + (prism-0.5)*0.16 + vec3(haze-0.5)*0.08, amount*0.72);
    col += fine * amount * 0.022;
  } else if(mode == 5){
    // Pixelate: keep the palette soft but simplify color steps as blocks grow.
    float levels = mix(255.0, 22.0, pow(amount, 1.15));
    col = floor(col * levels + 0.5) / levels;
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

void main(){
  vec2 uv = gl_FragCoord.xy / max(u_resolution, vec2(1.0));
  if(u_textureMode == 5 && u_textureAmount > 0.001){
    // Pixel surface: wide range, from fine pixel texture to oversized calm colour blocks.
    // The sampled grid itself travels slowly, so the blocks breathe rather than blink.
    float amt = clamp(u_textureAmount, 0.0, 1.0);
    float scale = clamp(u_textureScale, 0.0, 1.0);
    float pxGrid = mix(260.0, 3.0, pow(amt, 1.18));
    pxGrid = mix(pxGrid * 1.35, pxGrid * 0.55, scale);
    vec2 aspectFix = vec2(u_resolution.x / max(u_resolution.y, 1.0), 1.0);
    vec2 drift = vec2(
      sin(u_time * 0.115 + u_textureSeed * 6.0) + sin(u_time * 0.051 + 2.4),
      cos(u_time * 0.093 + u_textureSeed * 4.0) + sin(u_time * 0.047 + 0.8)
    ) * mix(0.004, 0.038, amt);
    vec2 pixelSize = vec2(pxGrid * aspectFix.x, pxGrid);
    uv = (floor((uv + drift) * pixelSize) + 0.5) / pixelSize - drift;
  }
  vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;
  vec2 m = (u_mouse - 0.5) * aspect * 1.8;
  vec2 mr = (u_mouseRaw - 0.5) * aspect;

  float t = u_time * 0.22 * u_flow;
  vec2 warp = vec2(
    sin(p.x * 1.4 + p.y * 0.8 + t) + sin(p.y * 2.2 - t * 0.7) * 0.6,
    cos(p.y * 1.4 - p.x * 0.6 - t * 0.8) + cos(p.x * 2.1 + t * 0.5) * 0.6
  );
  vec2 toMouse = m - p;
  float dM = length(toMouse) + 0.001;
  warp += toMouse * (0.35 / (dM + 0.4));
  vec2 wp = p + warp * 0.32 * u_flow;

  float dmr = distance(p, mr);
  float ripple = sin(dmr * 18.0 - u_clickPulse * 9.0) * exp(-dmr * 2.2) * u_clickPulse * 0.42;
  wp += normalize(toMouse + 0.0001) * ripple;

  float cnt = float(u_count);
  float aT = u_time * (0.18 + 0.10 * u_flow);
  vec2 autoDrift = vec2(sin(u_time*0.061), cos(u_time*0.047)) * 0.18 * u_flow;

  /*
    Color spread:
    lower = broad, soft fields
    higher = denser, smaller fields so 3–4 colors stay visible
    Kept continuous/soft to avoid clean banding or hard edges.
  */
  float spread = clamp(u_spread, 0.0, 1.0);
  float orbit = mix(0.38, 0.86, spread);
  float sharpness = mix(2.8, 12.0, spread);
  float softness = mix(0.16, 0.045, spread);

  vec2 an0 = (m*0.45 + autoDrift) + vec2(cos(aT+0.0),   sin(aT+0.0))   * (orbit + 0.16*sin(u_time*0.4));
  vec2 an1 = (m*0.45 + autoDrift) + vec2(cos(aT+1.57),  sin(aT+1.57))  * (orbit + 0.16*sin(u_time*0.4+1.0));
  vec2 an2 = (m*0.45 + autoDrift) + vec2(cos(aT+3.14),  sin(aT+3.14))  * (orbit + 0.16*sin(u_time*0.4+2.0));
  vec2 an3 = (m*0.45 + autoDrift) + vec2(cos(aT+4.71),  sin(aT+4.71))  * (orbit + 0.16*sin(u_time*0.4+3.0));

  float d0 = distance(wp, an0);
  float d1 = distance(wp, an1);
  float d2 = distance(wp, an2);
  float d3 = distance(wp, an3);

  float w0 = 1.0 / (d0*d0*sharpness + softness);
  float w1 = 1.0 / (d1*d1*sharpness + softness);
  float w2 = 1.0 / (d2*d2*sharpness + softness);
  float w3 = 1.0 / (d3*d3*sharpness + softness);

  // NURR v10 rating data favoured clear hierarchy over equal, flat colour fields.
  // The palette order is now meaningful: 0 = anchor/dominant, 1 = colour body,
  // 2 = light/mist, 3 = accent. These weights keep all colours visible while
  // reducing the washed-out, equal-blend look.
  w0 *= 1.48;
  w1 *= 0.96;
  w2 *= 0.78;
  w3 *= 0.58;
  float k1 = step(2.0, cnt); float k2 = step(3.0, cnt); float k3 = step(4.0, cnt);
  vec3 acc = u_color0*w0 + u_color1*w1*k1 + u_color2*w2*k2 + u_color3*w3*k3;
  float wsum = w0 + w1*k1 + w2*k2 + w3*k3;
  vec3 col = acc / max(wsum, 0.0001);

  float g = hash(floor(uv * u_resolution) + vec2(u_textureSeed * 991.0)) - 0.5;
  col += g * u_grain * 0.36;

  col = applyTextureSurface(col, uv, p, u_time);

  float vg = smoothstep(1.25, 0.25, length(uv - 0.5));
  col *= mix(0.82, 1.0, vg);

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

function GradientMode({ tweaks, registerSnapshot, mouseRef }) {
  const canvasRef = gmUR(null);
  const glRef = gmUR(null);
  const progRef = gmUR(null);
  WP.useStageSize(canvasRef);
  const stateRef = gmUR({
    pulse: 0,
    frozen: false,
    frozenMouse: null,
    frozenTime: null
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
    const onDown = (e) => {
      if (
        e.target.closest(
          '.panel,.icon-btn,.rail,.layout-card,.palette-card,.nature-thumb,.swatch,.color-wheel-card,.eyedropper-follow,button,input,.drop-zone'
        )
      ) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const insideCanvas =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;

      if (!insideCanvas) return;

      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

      stateRef.current.pulse = 1.0;

      if (stateRef.current.frozen) {
        stateRef.current.frozen = false;
        stateRef.current.frozenMouse = null;
        stateRef.current.frozenTime = null;
      } else {
        const live = mouseRef.current || { x, y, chaosX: x, chaosY: y };
        stateRef.current.frozen = true;
        stateRef.current.frozenTime = performance.now() / 1000;
        stateRef.current.frozenMouse = {
          x,
          y,
          chaosX: live.chaosX ?? x,
          chaosY: live.chaosY ?? y
        };
      }
    };

    window.addEventListener('mousedown', onDown, true);
    return () => window.removeEventListener('mousedown', onDown, true);
  }, []);

  const drawAt = (targetW, targetH) => {
    const gl = glRef.current; const prog = progRef.current;
    if (!gl || !prog) return;
    // Guard against a lost context: isContextLost() returns true after loss.
    if (gl.isContextLost()) return;

    gl.viewport(0, 0, targetW, targetH);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.SCISSOR_TEST);

    // No gl.clear() needed — the oversized single triangle covers every pixel
    // in the viewport. Clearing would only add a risk of a one-frame flash to
    // black if compositing races the draw call after an idle period.

    const m = stateRef.current.frozen && stateRef.current.frozenMouse
      ? stateRef.current.frozenMouse
      : (mouseRef.current || { x:0.5, y:0.5, chaosX:0.5, chaosY:0.5 });
    const liveTime = performance.now() / 1000;
    const t = stateRef.current.frozen && stateRef.current.frozenTime != null ? stateRef.current.frozenTime : liveTime;
    gl.useProgram(prog);
    gl.uniform1f(gl.getUniformLocation(prog,'u_time'), t);
    gl.uniform2f(gl.getUniformLocation(prog,'u_resolution'), targetW, targetH);
    gl.uniform2f(gl.getUniformLocation(prog,'u_mouse'), m.chaosX, 1-m.chaosY);
    gl.uniform2f(gl.getUniformLocation(prog,'u_mouseRaw'), m.x, 1-m.y);
    gl.uniform1f(gl.getUniformLocation(prog,'u_clickPulse'), stateRef.current.pulse);
    gl.uniform1f(gl.getUniformLocation(prog,'u_grain'), tweaks.grain);
    gl.uniform1f(gl.getUniformLocation(prog,'u_flow'), tweaks.flow);
    gl.uniform1f(gl.getUniformLocation(prog,'u_spread'), tweaks.spread ?? 0.62);
    const tex = window.NurrTextureEngine ? window.NurrTextureEngine.toUniforms(tweaks) : { mode:0, amount:0, scale:0.45, softness:0.5, distortion:0, seed:0.413 };
    gl.uniform1i(gl.getUniformLocation(prog,'u_textureMode'), tex.mode);
    gl.uniform1f(gl.getUniformLocation(prog,'u_textureAmount'), tex.amount);
    gl.uniform1f(gl.getUniformLocation(prog,'u_textureScale'), tex.scale);
    gl.uniform1f(gl.getUniformLocation(prog,'u_textureSoftness'), tex.softness);
    gl.uniform1f(gl.getUniformLocation(prog,'u_textureDistortion'), tex.distortion);
    gl.uniform1f(gl.getUniformLocation(prog,'u_textureSeed'), tex.seed);
    gl.uniform1i(gl.getUniformLocation(prog,'u_count'), tweaks.colors.length);
    for (let i=0; i<4; i++) {
      const rawHex = tweaks.colors[i] || tweaks.colors[tweaks.colors.length-1] || '#000000';
      const hex = adjustGradientHex(rawHex, tweaks);
      const [r,g,b] = WP.hexToRGB(hex);
      gl.uniform3f(gl.getUniformLocation(prog,`u_color${i}`), r, g, b);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // gl.flush() pushes commands to the GPU immediately, preventing any
    // partial-draw artefact when the browser compositor reads the buffer.
    gl.flush();
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
    registerSnapshot((opts = {}) => {
      const canvas = canvasRef.current; if (!canvas) return null;
      const w = opts.width || 3840;
      const h = opts.height || 2160;
      const ow=canvas.width, oh=canvas.height, osw=canvas.style.width, osh=canvas.style.height;
      canvas.width=w; canvas.height=h; drawAt(w,h);
      const dataUrl = canvas.toDataURL('image/png');
      if (!opts.returnDataUrl) WP.downloadCanvas(canvas, opts.filename || `gradient-${w}x${h}-${Date.now()}.png`);
      if (opts.returnDataUrl) { canvas.width=ow; canvas.height=oh; canvas.style.width=osw; canvas.style.height=osh; }
      else requestAnimationFrame(() => { canvas.width=ow; canvas.height=oh; canvas.style.width=osw; canvas.style.height=osh; });
      return dataUrl;
    });
  }, [tweaks, registerSnapshot]);

  return <canvas ref={canvasRef} className="stage" />;
}

function GradientControls({ tweaks, setTweaks }) {
  const [presetsOpen, setPresetsOpen] = React.useState(false);
  const setColors = (next) => setTweaks({ colors: next });
  const PaletteEditor = window.NurrPaletteEditor;

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
      colors,
      spread: Math.max(tweaks.spread ?? 0.62, colors.length >= 3 ? 0.62 : 0.48),
      pigment: tweaks.pigment ?? 0.5,
      saturation: tweaks.saturation ?? 0.5,
      temperature: tweaks.temperature ?? 0
    });
  };

  const activePresetIdx = WP.PALETTE_PRESETS.findIndex(p =>
    p.slice(0, tweaks.colors.length).every((c,i) => c.toLowerCase() === (tweaks.colors[i]||'').toLowerCase())
  );

  return (
    <>
      <PaletteEditor colors={tweaks.colors} setColors={setColors} minColors={1} maxColors={4} allowAdd={true} />

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

window.GRADIENT_DEFAULTS = {
  colors:['#13051E','#EC315E','#F8E9D2'],
  grain:0.22,
  flow:0.92,
  spread:0.56,
  pigment:0.5,
  saturation:0.5,
  temperature:0,
  texturePreset:'clean',
  textureAmount:0,
  textureSeed:0.413
};
