/* NYMPH landing surface — isolated landing engine.
   Edit this file to change only the start page animation.

   Same contract as before: window.NYMPHLanding.mount(canvas) -> unmount().
   Internally this now renders a WebGL fragment shader instead of a per-pixel
   2D canvas loop — that loop was the source of the lag. Falls back to a
   cheap CSS-gradient-driven 2D surface if WebGL isn't available. */
(function () {
  var VERT = [
    'attribute vec2 a_pos;',
    'void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'uniform vec2 u_resolution;',
    'uniform float u_time;',
    'uniform vec2 u_pointer;',
    'uniform vec4 u_pulses[8];',
    'uniform int u_pulseCount;',

    'vec3 mod289_3(vec3 x){ return x - floor(x*(1.0/289.0))*289.0; }',
    'vec2 mod289_2(vec2 x){ return x - floor(x*(1.0/289.0))*289.0; }',
    'vec3 permute(vec3 x){ return mod289_3(((x*34.0)+1.0)*x); }',

    'float snoise(vec2 v){',
    '  const vec4 C = vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);',
    '  vec2 i  = floor(v + dot(v, C.yy));',
    '  vec2 x0 = v - i + dot(i, C.xx);',
    '  vec2 i1 = (x0.x > x0.y) ? vec2(1.0,0.0) : vec2(0.0,1.0);',
    '  vec4 x12 = x0.xyxy + C.xxzz;',
    '  x12.xy -= i1;',
    '  i = mod289_2(i);',
    '  vec3 p = permute(permute(i.y + vec3(0.0,i1.y,1.0)) + i.x + vec3(0.0,i1.x,1.0));',
    '  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);',
    '  m = m*m; m = m*m;',
    '  vec3 x = 2.0*fract(p*C.www) - 1.0;',
    '  vec3 h = abs(x) - 0.5;',
    '  vec3 ox = floor(x+0.5);',
    '  vec3 a0 = x - ox;',
    '  m *= 1.79284291400159 - 0.85373472095314*(a0*a0+h*h);',
    '  vec3 g;',
    '  g.x = a0.x*x0.x + h.x*x0.y;',
    '  g.yz = a0.yz*x12.xz + h.yz*x12.yw;',
    '  return 130.0*dot(m,g);',
    '}',

    'float fbm(vec2 p){',
    '  float v = 0.0; float a = 0.5;',
    '  for(int i=0;i<4;i++){ v += a*snoise(p); p *= 2.02; a *= 0.55; }',
    '  return v;',
    '}',

    'void main(){',
    '  float aspect = u_resolution.x/u_resolution.y;',
    '  vec2 uv = gl_FragCoord.xy / u_resolution.xy;',
    '  vec2 p = uv; p.x *= aspect;',
    '  vec2 pointer = u_pointer; pointer.x *= aspect;',
    '  float t = u_time;',

    '  vec2 toP = pointer - p;',
    '  float distP = length(toP);',
    '  float pull = smoothstep(0.55, 0.0, distP) * 0.045;',
    '  vec2 warped = p + normalize(toP + 1e-5) * pull;',

    '  vec2 q = vec2(fbm(warped*1.6 + t*0.015), fbm(warped*1.6 - t*0.012 + 5.2));',
    '  vec2 r = warped + 0.6*q;',
    '  float n = fbm(r*1.2 + t*0.01);',

    '  float ringDist = length(p - vec2(0.52*aspect, 0.58));',
    '  n += sin(ringDist*16.0 - t*0.42) * 0.05 * smoothstep(1.1,0.05,ringDist);',

    '  float curDist = distance(p, pointer);',
    '  n += sin(curDist*34.0 - t*1.35) * smoothstep(0.42,0.0,curDist) * 0.05;',

    '  float pulseField = 0.0;',
    '  for(int i=0;i<8;i++){',
    '    if(i >= u_pulseCount) break;',
    '    vec4 pu = u_pulses[i];',
    '    vec2 pc = pu.xy; pc.x *= aspect;',
    '    float age = t - pu.z;',
    '    if (age < 0.0) continue;',
    '    float radius = age * 0.13;',
    '    float ring = exp(-pow((distance(p,pc)-radius)*20.0, 2.0));',
    '    float life = exp(-age*0.42);',
    '    pulseField += ring * life * pu.w;',
    '  }',
    '  n += pulseField * 0.55;',

    '  float band = clamp(n*0.62+0.48, 0.0, 1.0);',

    '  vec3 c0 = vec3(0.012,0.024,0.051);',
    '  vec3 c1 = vec3(0.039,0.106,0.20);',
    '  vec3 c2 = vec3(0.071,0.235,0.29);',
    '  vec3 c3 = vec3(0.243,0.353,0.40);',
    '  vec3 c4 = vec3(0.749,0.902,0.91);',

    '  vec3 color;',
    '  if (band < 0.33) color = mix(c0,c1, band/0.33);',
    '  else if (band < 0.62) color = mix(c1,c2, (band-0.33)/0.29);',
    '  else if (band < 0.86) color = mix(c2,c3, (band-0.62)/0.24);',
    '  else color = mix(c3,c4, (band-0.86)/0.14);',

    '  float glow = smoothstep(0.5, 0.0, distP) * 0.16;',
    '  color += vec3(0.30,0.55,0.58) * glow;',

    '  vec2 centered = uv - 0.5;',
    '  float vig = 1.0 - smoothstep(0.35, 0.92, length(centered));',
    '  color *= mix(0.60, 1.0, vig);',

    '  color = pow(max(color,0.0), vec3(0.96));',

    '  float gtime = floor(t*10.0);',
    '  float grain = fract(sin(dot(gl_FragCoord.xy + gtime, vec2(12.9898,78.233)))*43758.5453);',
    '  color += (grain - 0.5) * 0.02;',

    '  gl_FragColor = vec4(color, 1.0);',
    '}'
  ].join('\n');

  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error('NYMPH landing shader compile error: ' + log);
    }
    return sh;
  }

  function mountGL(canvas, gl) {
    var prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('NYMPH landing program link error: ' + gl.getProgramInfoLog(prog));
    }
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    var aPos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    var uRes = gl.getUniformLocation(prog, 'u_resolution');
    var uTime = gl.getUniformLocation(prog, 'u_time');
    var uPointer = gl.getUniformLocation(prog, 'u_pointer');
    var uPulses = gl.getUniformLocation(prog, 'u_pulses');
    var uPulseCount = gl.getUniformLocation(prog, 'u_pulseCount');

    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var dpr = Math.min(window.devicePixelRatio || 1, 1.8);
    var w = 0, h = 0, raf = 0, stopped = false;
    var t0 = performance.now();

    var pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
    var pulses = []; // {x, y, startTime, force}
    var pulseData = new Float32Array(8 * 4);

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 1.8);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    function addPulse(x, y, force) {
      pulses.push({ x: x, y: y, startTime: (performance.now() - t0) / 1000, force: force });
      if (pulses.length > 8) pulses.shift();
    }

    function onMove(e) {
      pointer.tx = e.clientX / Math.max(1, w);
      pointer.ty = 1 - e.clientY / Math.max(1, h);
    }
    function onDown(e) {
      pointer.tx = e.clientX / Math.max(1, w);
      pointer.ty = 1 - e.clientY / Math.max(1, h);
      addPulse(pointer.tx, pointer.ty, 0.9);
    }

    function frame() {
      if (stopped) return;
      var time = (performance.now() - t0) / 1000;

      pointer.x += (pointer.tx - pointer.x) * 0.05;
      pointer.y += (pointer.ty - pointer.y) * 0.05;

      while (pulses.length && (time - pulses[0].startTime) > 7) pulses.shift();

      var count = Math.min(pulses.length, 8);
      for (var i = 0; i < count; i++) {
        var p = pulses[i];
        pulseData[i*4+0] = p.x;
        pulseData[i*4+1] = p.y;
        pulseData[i*4+2] = p.startTime;
        pulseData[i*4+3] = p.force;
      }

      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, time);
      gl.uniform2f(uPointer, pointer.x, pointer.y);
      gl.uniform4fv(uPulses, pulseData);
      gl.uniform1i(uPulseCount, count);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (!reduceMotion) raf = requestAnimationFrame(frame);
    }

    resize();
    addPulse(0.5, 0.5, 0.18);
    window.addEventListener('resize', resize);
    if (!reduceMotion) {
      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerdown', onDown, { passive: true });
    }
    frame();

    return function unmount() {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      var lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    };
  }

  // Lightweight fallback for browsers without WebGL — no per-pixel loop,
  // just a slowly drifting CSS-style gradient drawn a few times a second.
  function mount2DFallback(canvas) {
    var ctx = canvas.getContext('2d');
    if (!ctx) return function () {};
    var raf = 0, stopped = false, last = 0;
    var w = 0, h = 0;
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }

    function paint(time) {
      if (stopped) return;
      if (!reduceMotion && time - last < 80) { raf = requestAnimationFrame(paint); return; }
      last = time;
      var t = time * 0.0002;
      var cx = w * (0.4 + 0.06 * Math.sin(t));
      var cy = h * (0.35 + 0.05 * Math.cos(t * 0.8));
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.8);
      g.addColorStop(0, '#123c4a');
      g.addColorStop(0.45, '#0a1b33');
      g.addColorStop(1, '#03060d');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      if (!reduceMotion) raf = requestAnimationFrame(paint);
    }

    resize();
    window.addEventListener('resize', resize);
    raf = requestAnimationFrame(paint);

    return function unmount() {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }

  function mount(canvas) {
    if (!canvas) return function () {};
    var gl = canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false })
      || canvas.getContext('experimental-webgl', { alpha: false, antialias: false });
    if (!gl) return mount2DFallback(canvas);
    try {
      return mountGL(canvas, gl);
    } catch (err) {
      console.warn('[nymph-landing] falling back to 2D surface:', err);
      return mount2DFallback(canvas);
    }
  }

  window.NYMPHLanding = { mount: mount };
})();
