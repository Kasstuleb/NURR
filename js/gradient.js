// gradient.js — Mode 1: grainy gradient field with WebGL.
// Exposes: window.GradientMode, window.GradientControls, window.GRADIENT_DEFAULTS

const { useEffect: gmUE, useRef: gmUR, useState: gmUS } = React;

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

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main(){
  vec2 uv = v_uv;
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
  float aT = u_time * 0.18 * u_flow;

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

  vec2 an0 = m*0.45 + vec2(cos(aT+0.0),   sin(aT+0.0))   * (orbit + 0.16*sin(u_time*0.4));
  vec2 an1 = m*0.45 + vec2(cos(aT+1.57),  sin(aT+1.57))  * (orbit + 0.16*sin(u_time*0.4+1.0));
  vec2 an2 = m*0.45 + vec2(cos(aT+3.14),  sin(aT+3.14))  * (orbit + 0.16*sin(u_time*0.4+2.0));
  vec2 an3 = m*0.45 + vec2(cos(aT+4.71),  sin(aT+4.71))  * (orbit + 0.16*sin(u_time*0.4+3.0));

  float d0 = distance(wp, an0);
  float d1 = distance(wp, an1);
  float d2 = distance(wp, an2);
  float d3 = distance(wp, an3);

  float w0 = 1.0 / (d0*d0*sharpness + softness);
  float w1 = 1.0 / (d1*d1*sharpness + softness);
  float w2 = 1.0 / (d2*d2*sharpness + softness);
  float w3 = 1.0 / (d3*d3*sharpness + softness);
  float k1 = step(2.0, cnt); float k2 = step(3.0, cnt); float k3 = step(4.0, cnt);
  vec3 acc = u_color0*w0 + u_color1*w1*k1 + u_color2*w2*k2 + u_color3*w3*k3;
  float wsum = w0 + w1*k1 + w2*k2 + w3*k3;
  vec3 col = acc / max(wsum, 0.0001);

  float g = hash(uv * u_resolution + u_time*60.0) - 0.5;
  col += g * u_grain * 0.36;

  float vg = smoothstep(1.25, 0.25, length(uv - 0.5));
  col *= mix(0.82, 1.0, vg);

  gl_FragColor = vec4(col, 1.0);
}
`;

function GradientMode({ tweaks, registerSnapshot, mouseRef }) {
  const canvasRef = gmUR(null);
  const glRef = gmUR(null);
  const progRef = gmUR(null);
  WP.useStageSize(canvasRef);
  const stateRef = gmUR({
    pulse: 0,
    frozen: false,
    frozenMouse: null
  });

  gmUE(() => {
    const canvas = canvasRef.current;
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer:true, antialias:false });
    if (!gl) return;
    glRef.current = gl;
    const prog = WP.compileProgram(gl, WP.VS_FULLSCREEN, GRADIENT_FS);
    progRef.current = prog;
    gl.useProgram(prog);
    WP.createQuadGeometry(gl, prog);
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

      // Keep the existing click ripple / pulse as feedback.
      stateRef.current.pulse = 1.0;

      // Click artwork once = freeze at that exact visual point.
      // Click artwork again = unfreeze and return to live mouse behavior.
      if (stateRef.current.frozen) {
        stateRef.current.frozen = false;
        stateRef.current.frozenMouse = null;
      } else {
        const live = mouseRef.current || { x, y, chaosX: x, chaosY: y };
        stateRef.current.frozen = true;
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
    gl.viewport(0, 0, targetW, targetH);
    const m = stateRef.current.frozen && stateRef.current.frozenMouse
      ? stateRef.current.frozenMouse
      : mouseRef.current;
    const t = performance.now() / 1000;
    gl.useProgram(prog);
    gl.uniform1f(gl.getUniformLocation(prog,'u_time'), t);
    gl.uniform2f(gl.getUniformLocation(prog,'u_resolution'), targetW, targetH);
    gl.uniform2f(gl.getUniformLocation(prog,'u_mouse'), m.chaosX, 1-m.chaosY);
    gl.uniform2f(gl.getUniformLocation(prog,'u_mouseRaw'), m.x, 1-m.y);
    gl.uniform1f(gl.getUniformLocation(prog,'u_clickPulse'), stateRef.current.pulse);
    gl.uniform1f(gl.getUniformLocation(prog,'u_grain'), tweaks.grain);
    gl.uniform1f(gl.getUniformLocation(prog,'u_flow'), tweaks.flow);
    gl.uniform1f(gl.getUniformLocation(prog,'u_spread'), tweaks.spread ?? 0.56);
    gl.uniform1i(gl.getUniformLocation(prog,'u_count'), tweaks.colors.length);
    for (let i=0; i<4; i++) {
      const hex = tweaks.colors[i] || tweaks.colors[tweaks.colors.length-1] || '#000000';
      const [r,g,b] = WP.hexToRGB(hex);
      gl.uniform3f(gl.getUniformLocation(prog,`u_color${i}`), r, g, b);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  WP.useAnimationLoop((t, dt) => {
    const canvas = canvasRef.current; if (!canvas) return;
    stateRef.current.pulse *= Math.exp(-dt*1.4);
    drawAt(canvas.width, canvas.height);
  });

  gmUE(() => {
    registerSnapshot(() => {
      const canvas = canvasRef.current; if (!canvas) return;
      const ow=canvas.width, oh=canvas.height, osw=canvas.style.width, osh=canvas.style.height;
      canvas.width=3840; canvas.height=2160; drawAt(3840,2160);
      WP.downloadCanvas(canvas, `gradient-${Date.now()}.png`);
      requestAnimationFrame(() => { canvas.width=ow; canvas.height=oh; canvas.style.width=osw; canvas.style.height=osh; });
    });
  }, [tweaks, registerSnapshot]);

  return <canvas ref={canvasRef} className="stage" />;
}

function GradientControls({ tweaks, setTweaks }) {
  const setColors = (next) => setTweaks({ colors: next });
  const PaletteEditor = window.NurrPaletteEditor;
  const activePresetIdx = WP.PALETTE_PRESETS.findIndex(p =>
    p.slice(0, tweaks.colors.length).every((c,i) => c.toLowerCase() === (tweaks.colors[i]||'').toLowerCase())
  );

  return (
    <>
      <PaletteEditor colors={tweaks.colors} setColors={setColors} minColors={2} maxColors={4} allowAdd={true} />

      <div className="section presets-section">
        <div className="section-label">
          <span className="name">Presets</span>
          <span className="value">{WP.PALETTE_PRESETS.length}</span>
        </div>
        <div className="palette-grid">
          {WP.PALETTE_PRESETS.map((p,i) => (
            <button key={i} className={'palette-card'+(i===activePresetIdx?' active':'')}
              onClick={() => setTweaks({colors:p.slice(0,Math.max(2,tweaks.colors.length))})}
              title={p.join(' · ')}>
              {p.map((c,j) => <span key={j} style={{background:c}} />)}
            </button>
          ))}
        </div>
      </div>

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
          <span className="value">{Math.round((tweaks.spread ?? 0.56) * 100)}</span>
        </div>
        <input className="slider" type="range" min="0" max="1" step="0.01"
          value={tweaks.spread ?? 0.56} onChange={(e)=>setTweaks({spread:parseFloat(e.target.value)})} />
      </div>

      <div className="help compact-help">
        Click the artwork to freeze/unfreeze the gradient before saving.
      </div>
    </>
  );
}

window.GradientMode   = GradientMode;
window.GradientControls = GradientControls;
window.GRADIENT_DEFAULTS = { colors:['#08015F','#FC6C3D'], grain:0.22, flow:1.0, spread:0.56 };
