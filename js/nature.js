// nature.js — Mode 3: Photo mode. WebGL rewrite.
// Replaces the old Canvas 2D photo renderer. Exposes: window.NatureMode, window.NatureControls, window.NATURE_DEFAULTS

const { useEffect: nmUE, useRef: nmUR, useState: nmUS } = React;

const NATURE_FS = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2  u_resolution;
uniform vec2  u_imgSize;
uniform vec2  u_mouse;
uniform vec2  u_mouseRaw;
uniform float u_time;
uniform float u_strength;
uniform float u_blur;
uniform float u_split;
uniform float u_clickPulse;
uniform float u_hue;
uniform float u_sat;
uniform float u_contrast;
uniform float u_grain;
uniform float u_vignette;
uniform int   u_effect;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }

vec2 coverUV(vec2 uv){
  float vAR = u_resolution.x / u_resolution.y;
  float iAR = u_imgSize.x / u_imgSize.y;
  vec2 scale = vAR > iAR ? vec2(1.0, iAR/vAR) : vec2(vAR/iAR, 1.0);
  return (uv - 0.5) * scale + 0.5;
}

vec3 applyColor(vec3 c){
  float a = u_hue * 6.28318;
  float ca = cos(a), sa = sin(a);
  vec3 lumAxis = normalize(vec3(0.299, 0.587, 0.114));
  vec3 col = c * ca + cross(lumAxis, c) * sa + lumAxis * dot(lumAxis, c) * (1.0 - ca);
  vec3 gray = vec3(dot(col, vec3(0.299,0.587,0.114)));
  col = mix(gray, col, u_sat);
  col = (col - 0.5) * u_contrast + 0.5;
  return col;
}

vec3 sampleImage(vec2 uv){
  return texture2D(u_tex, coverUV(clamp(uv, 0.001, 0.999))).rgb;
}

void main(){
  vec2 uv = v_uv;
  vec2 toM = uv - u_mouseRaw;
  float dm = length(toM);
  float wide = exp(-dm * dm * 4.2);
  float pulse = u_clickPulse * exp(-dm * dm * 2.8);
  vec3 col;

  if (u_effect == 0) {
    float swirl = (u_strength * 2.8 + pulse * 1.4) * wide;
    float ang = swirl * 2.2;
    mat2 R = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
    vec2 d = R * toM - toM;
    float push = (u_strength * 0.12 + pulse * 0.06) * wide;
    vec2 disp = d * 0.65 + normalize(toM + 0.0001) * (-push);
    col = sampleImage(uv + disp);

  } else if (u_effect == 1) {
    float radius = (u_blur * 0.55 + pulse * 0.35) * wide * 0.065 + u_blur * 0.007;
    vec3 acc = vec3(0.0); float tw = 0.0;
    for(int i=-4;i<=4;i++){
      for(int j=-4;j<=4;j++){
        vec2 off = vec2(float(i),float(j)) * radius * 0.46;
        float k = exp(-float(i*i+j*j) * 0.38);
        acc += sampleImage(uv + off) * k;
        tw += k;
      }
    }
    col = acc / tw;

  } else if (u_effect == 2) {
    float amt = (u_split * 0.85 + pulse * 0.55) * wide * 0.046 + 0.0008;
    vec2 dir = normalize(toM + 0.0001);
    col.r = sampleImage(uv - dir * amt * 1.0).r;
    col.g = sampleImage(uv + dir * amt * 0.1).g;
    col.b = sampleImage(uv + dir * amt * 1.0).b;

  } else if (u_effect == 3) {
    float n = sin(uv.x * 16.0 + u_time * 0.65) * 0.42 + 0.5;
    float warp = (u_strength * 1.6 + pulse) * wide * 0.26 * n;
    float sway = (u_mouse.x - 0.5) * u_strength * 0.04 * wide;
    col = sampleImage(uv + vec2(sway, warp));

  } else {
    col = sampleImage(uv);
    vec2 cell = uv * u_resolution / max(u_resolution.x,u_resolution.y) * (12.0 + u_strength * 14.0);
    vec2 fr = fract(cell) - 0.5;
    float ring = 1.0 - smoothstep(0.18, 0.5, length(fr));
    float h2 = hash(floor(cell));
    float glow = (u_strength * 0.55 + pulse * 0.5) * ring * max(0.0, 1.0 - dm * 3.0) * h2;
    col += glow * vec3(0.95, 0.88, 0.72);
    col = mix(col, col * 1.06, wide * u_strength * 0.5);
  }

  col = applyColor(col);

  if (u_grain > 0.0) {
    float g = hash(uv * u_resolution + u_time * 60.0) - 0.5;
    col += g * u_grain * 0.16;
  }

  float vg = smoothstep(1.35, 0.12, length(uv - 0.5));
  col *= mix(1.0 - u_vignette * 0.68, 1.0, vg);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

function imgToTexture(gl, img) {
  const tc = document.createElement('canvas');
  const scale = Math.min(1, 4096 / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  tc.width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
  tc.height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
  const ctx = tc.getContext('2d', { willReadFrequently:false });
  ctx.drawImage(img, 0, 0, tc.width, tc.height);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tc);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return { tex, w: tc.width, h: tc.height };
}

function NatureMode({ tweaks, registerSnapshot, mouseRef, currentImg }) {
  const canvasRef = nmUR(null);
  const glRef = nmUR(null);
  const progRef = nmUR(null);
  const uniRef = nmUR({});
  const texRef = nmUR(null);
  const imgDimRef = nmUR({ w:1, h:1 });
  const stateRef = nmUR({ pulse:0, t:0 });
  const [loaded, setLoaded] = nmUS(false);

  WP.useStageSize(canvasRef);

  nmUE(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer:true, antialias:false });
    if (!gl) { console.error('WebGL not available'); return; }
    glRef.current = gl;
    const prog = WP.compileProgram(gl, WP.VS_FULLSCREEN, NATURE_FS);
    if (!prog) return;
    progRef.current = prog;
    gl.useProgram(prog);
    WP.createQuadGeometry(gl, prog);
    const names = ['u_tex','u_resolution','u_imgSize','u_mouse','u_mouseRaw','u_time','u_strength','u_blur','u_split','u_clickPulse','u_hue','u_sat','u_contrast','u_grain','u_vignette','u_effect'];
    const u = {};
    names.forEach(n => { u[n] = gl.getUniformLocation(prog, n); });
    uniRef.current = u;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([8,1,95,255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    texRef.current = tex;
  }, []);

  nmUE(() => {
    const gl = glRef.current;
    if (!currentImg) { setLoaded(false); return; }
    if (!gl) return;
    setLoaded(false);
    const img = new Image();
    img.onload = () => {
      const activeGl = glRef.current;
      if (!activeGl) return;
      try {
        const result = imgToTexture(activeGl, img);
        if (texRef.current) activeGl.deleteTexture(texRef.current);
        texRef.current = result.tex;
        imgDimRef.current = { w: result.w, h: result.h };
        setLoaded(true);
      } catch (err) {
        console.error('Texture upload failed:', err);
        setLoaded(false);
      }
    };
    img.onerror = () => { console.warn('Failed to load:', currentImg); setLoaded(false); };
    // Do not set crossOrigin for local relative images. It can break file:// testing in Safari.
    if (/^https?:\/\//i.test(currentImg)) img.crossOrigin = 'anonymous';
    img.src = currentImg;
  }, [currentImg, glRef.current]);

  nmUE(() => {
    const onDown = (e) => {
      if (e.target.closest('.panel,.icon-btn,.rail,.layout-card,.palette-card,.nature-thumb,.swatch,.color-wheel-card,.eyedropper-follow,.formation-card,button,input,.drop-zone')) return;
      stateRef.current.pulse = 1.0;
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, []);

  const drawAt = (targetW, targetH) => {
    const gl = glRef.current;
    const prog = progRef.current;
    const u = uniRef.current;
    if (!gl || !prog || !texRef.current) return;
    gl.viewport(0, 0, targetW, targetH);
    gl.useProgram(prog);
    const m = mouseRef?.current || { x:.5, y:.5, chaosX:.5, chaosY:.5 };
    const t = performance.now() / 1000;
    const effectMap = { warp:0, blur:1, split:2, melt:3, nodes:4 };
    const effectIdx = effectMap[tweaks.effect] ?? 0;
    const strength = tweaks.effect === 'blur' ? tweaks.blur : tweaks.effect === 'split' ? tweaks.split : tweaks.warp;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texRef.current);
    gl.uniform1i(u.u_tex, 0);
    gl.uniform2f(u.u_resolution, targetW, targetH);
    gl.uniform2f(u.u_imgSize, imgDimRef.current.w, imgDimRef.current.h);
    gl.uniform2f(u.u_mouse, m.chaosX, 1 - m.chaosY);
    gl.uniform2f(u.u_mouseRaw, m.x, 1 - m.y);
    gl.uniform1f(u.u_time, t);
    gl.uniform1f(u.u_strength, strength);
    gl.uniform1f(u.u_blur, tweaks.blur);
    gl.uniform1f(u.u_split, tweaks.split);
    gl.uniform1f(u.u_clickPulse, stateRef.current.pulse);
    gl.uniform1f(u.u_hue, tweaks.hue);
    gl.uniform1f(u.u_sat, tweaks.sat);
    gl.uniform1f(u.u_contrast, tweaks.contrast);
    gl.uniform1f(u.u_grain, tweaks.grain);
    gl.uniform1f(u.u_vignette, tweaks.vignette);
    gl.uniform1i(u.u_effect, effectIdx);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  WP.useAnimationLoop((t, dt) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    stateRef.current.t += dt;
    stateRef.current.pulse *= Math.exp(-dt * 1.55);
    drawAt(canvas.width, canvas.height);
  });

  nmUE(() => {
    registerSnapshot(() => {
      const canvas = canvasRef.current;
      if (!canvas || !loaded) return;
      const ow = canvas.width, oh = canvas.height, osw = canvas.style.width, osh = canvas.style.height;
      canvas.width = 3840; canvas.height = 2160;
      drawAt(3840, 2160);
      WP.downloadCanvas(canvas, `photo-${Date.now()}.png`);
      requestAnimationFrame(() => { canvas.width = ow; canvas.height = oh; canvas.style.width = osw; canvas.style.height = osh; });
    });
  }, [tweaks, registerSnapshot, loaded]);

  return <canvas ref={canvasRef} className="stage nature-stage" style={{ opacity: loaded ? 1 : 0.35, transition:'opacity 0.35s ease' }} />;
}

function NatureControls({ tweaks, setTweaks, natureImages, currentImg, setCurrentImg, onFiles }) {
  const inputRef = nmUR(null);
  const [dragOver, setDragOver] = nmUS(false);
  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length) onFiles(files);
  };
  const strengthKey = tweaks.effect === 'blur' ? 'blur' : tweaks.effect === 'split' ? 'split' : 'warp';
  return (
    <>
      <div className="section">
        <div className="section-label"><span className="name">Effect</span><span className="value">mouse-driven</span></div>
        <div className="seg">
          {['warp','blur','split','melt','nodes'].map(e => (
            <button key={e} className={'seg-opt' + (tweaks.effect === e ? ' active' : '')} onClick={() => setTweaks({ effect:e })}>{e}</button>
          ))}
        </div>
      </div>
      <div className="section">
        <div className="section-label"><span className="name">Strength</span><span className="value">{Math.round(tweaks[strengthKey] * 100)}</span></div>
        <input className="slider" type="range" min="0" max="1" step="0.01" value={tweaks[strengthKey]} onChange={e => setTweaks({ [strengthKey]:parseFloat(e.target.value) })} />
      </div>
      {[
        ['hue','Hue',-0.5,0.5,v => Math.round(v*360)+'°'],
        ['sat','Saturation',0,2.2,v => v.toFixed(2)],
        ['contrast','Contrast',0.4,1.9,v => v.toFixed(2)],
        ['grain','Grain',0,1,v => Math.round(v*100)],
        ['vignette','Vignette',0,1,v => Math.round(v*100)],
      ].map(([k,label,min,max,fmt]) => (
        <div className="section" key={k}>
          <div className="section-label"><span className="name">{label}</span><span className="value">{fmt(tweaks[k])}</span></div>
          <input className="slider" type="range" min={min} max={max} step="0.01" value={tweaks[k]} onChange={e => setTweaks({ [k]:parseFloat(e.target.value) })} />
        </div>
      ))}
      <div className="section">
        <div className="section-label"><span className="name">Images</span><span className="value">{natureImages.length > 0 ? `${natureImages.length} loaded` : 'none yet'}</span></div>
        {natureImages.length > 0 && (
          <div className="nature-grid">
            {natureImages.map((url, i) => (
              <button key={i} className={'nature-thumb' + (url === currentImg ? ' active' : '')} onClick={() => setCurrentImg(url)}>
                <img src={url} alt="" />
              </button>
            ))}
          </div>
        )}
        <div className={'drop-zone' + (dragOver ? ' dragover' : '')} onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={onDrop} onClick={() => inputRef.current?.click()}>
          <strong>Add photos</strong><br />Drag here or click — works immediately.
          <input ref={inputRef} type="file" accept="image/*" multiple style={{ display:'none' }} onChange={e => { onFiles(Array.from(e.target.files)); e.target.value = ''; }} />
        </div>
        <div className="folder-widget">
          <div className="folder-title">Permanent library</div>
          <p>Drop files in <code>nature/</code> + add to <code>nature/manifest.json</code>:</p>
          <code>["01.jpg", "02.jpg"]</code>
        </div>
      </div>
      <div className="help">Move cursor over image — all effects respond live. Click for a pulse.</div>
    </>
  );
}

window.NatureMode = NatureMode;
window.NatureControls = NatureControls;
window.NATURE_DEFAULTS = {
  effect:'warp', warp:0.45, blur:0.50, split:0.55,
  hue:0, sat:1.0, contrast:1.0, grain:0.04, vignette:0.22,
};
