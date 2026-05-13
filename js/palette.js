// palette.js — NurrPaletteEditor: swatch row + canvas eyedropper + color wheel card.
// Exposes: window.NurrPaletteEditor

const { useEffect, useRef, useState } = React;

function NurrPaletteEditor({ colors, setColors, countLabel, allowAdd=true, minColors=2, maxColors=4, compact=false }) {
  const [picker, setPicker] = useState(null);
  const [livePos, setLivePos] = useState({ x:-100, y:-100 });
  const [liveColor, setLiveColor] = useState('#08015F');
  const pickerRef = useRef(null);
  const liveRef = useRef({ x:-100, y:-100, color:'#08015F' });
  const rafRef = useRef(null);
  const wheelRef = useRef(null);

  const normalizeHex = (hex) => {
    if (!hex) return '#000000';
    const h = String(hex).trim();
    if (/^#[0-9a-fA-F]{6}$/.test(h)) return h.toUpperCase();
    return '#000000';
  };
  const setColor = (i, hex) => {
    const next = [...colors]; next[i] = normalizeHex(hex); setColors(next);
  };
  const addColor = () => {
    if (!allowAdd || colors.length >= maxColors) return;
    setColors([...colors, WP.hslToHex(Math.random()*360, 0.72, 0.56)]);
  };
  const removeColor = (i) => {
    if (!allowAdd || colors.length <= minColors) return;
    setColors(colors.filter((_,idx) => idx !== i));
  };
  const randomize = () => {
    const p = WP.PALETTE_PRESETS[Math.floor(Math.random()*WP.PALETTE_PRESETS.length)];
    setColors(p.slice(0, Math.max(minColors, Math.min(maxColors, colors.length))));
  };

  const hexToRgbObj = (hex) => {
    const clean = normalizeHex(hex).replace('#','');
    return { r:parseInt(clean.slice(0,2),16), g:parseInt(clean.slice(2,4),16), b:parseInt(clean.slice(4,6),16) };
  };
  const rgbToCmyk = ({r,g,b}) => {
    const rr=r/255, gg=g/255, bb=b/255;
    const k = 1-Math.max(rr,gg,bb);
    if (k >= 0.999) return {c:0,m:0,y:0,k:100};
    return {c:Math.round(((1-rr-k)/(1-k))*100), m:Math.round(((1-gg-k)/(1-k))*100), y:Math.round(((1-bb-k)/(1-k))*100), k:Math.round(k*100)};
  };

  const colorFromWheelEvent = (e) => {
    const rect = wheelRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX-rect.left)/rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY-rect.top)/rect.height));
    const hue = x * 360;
    const sat = Math.min(1, 0.16 + y*0.84);
    const light = 0.08 + (1-y)*0.86;
    return WP.hslToHex(hue, sat, light);
  };

  const sampleCanvasAt = (clientX, clientY) => {
    const canvases = Array.from(document.querySelectorAll('canvas.stage')).reverse();
    for (const canvas of canvases) {
      const rect = canvas.getBoundingClientRect();
      if (clientX<rect.left||clientX>rect.right||clientY<rect.top||clientY>rect.bottom) continue;
      const x = Math.floor((clientX-rect.left)/rect.width*canvas.width);
      const yTop = Math.floor((clientY-rect.top)/rect.height*canvas.height);
      try {
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl) {
          gl.finish && gl.finish();
          const px = new Uint8Array(4);
          const yGL = Math.max(0, Math.min(canvas.height-1, canvas.height-1-yTop));
          gl.readPixels(Math.max(0,Math.min(canvas.width-1,x)), yGL, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          return '#'+[px[0],px[1],px[2]].map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();
        }
      } catch(err) {}
      try {
        const ctx = canvas.getContext('2d', {willReadFrequently:true});
        if (ctx) {
          const px = ctx.getImageData(Math.max(0,Math.min(canvas.width-1,x)), Math.max(0,Math.min(canvas.height-1,yTop)), 1,1).data;
          return '#'+[px[0],px[1],px[2]].map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();
        }
      } catch(err) {}
    }
    return null;
  };

  const activeColor = liveColor || picker?.color || colors[picker?.idx||0] || '#08015F';
  const rgbObj = hexToRgbObj(activeColor);
  const cmykObj = rgbToCmyk(rgbObj);

  useEffect(() => { pickerRef.current = picker; }, [picker]);

  useEffect(() => {
    if (!picker) return;
    document.body.classList.add('is-picking-color');
    const isWheelPoint = (x,y) => {
      const el = document.elementFromPoint(x,y);
      return !!(el && el.closest && el.closest('.color-wheel-surface'));
    };
    const isReadoutPoint = (x,y) => {
      const el = document.elementFromPoint(x,y);
      return !!(el && el.closest && el.closest('.color-readout'));
    };
    const getPointColor = (x,y) => {
      if (isWheelPoint(x,y)) return colorFromWheelEvent({clientX:x,clientY:y});
      return sampleCanvasAt(x,y) || liveRef.current.color || pickerRef.current?.color;
    };
    const flush = () => {
      rafRef.current = null;
      setLivePos({x:liveRef.current.x, y:liveRef.current.y});
      setLiveColor(liveRef.current.color);
      setPicker(p => p ? {...p, color:liveRef.current.color} : p);
    };
    const queue = (x,y) => {
      liveRef.current = {x,y, color:normalizeHex(getPointColor(x,y))};
      if (!rafRef.current) rafRef.current = requestAnimationFrame(flush);
    };
    const move = (e) => queue(e.clientX, e.clientY);
    const down = (e) => {
      const current = pickerRef.current;
      if (!current) return;
      if (isReadoutPoint(e.clientX, e.clientY)) return;
      const picked = normalizeHex(getPointColor(e.clientX,e.clientY) || current.color);
      setColor(current.idx, picked);
      setPicker(null); pickerRef.current = null;
      e.preventDefault(); e.stopPropagation();
    };
    document.addEventListener('pointermove', move, true);
    document.addEventListener('mousemove', move, true);
    document.addEventListener('pointerdown', down, true);
    return () => {
      document.body.classList.remove('is-picking-color');
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('mousemove', move, true);
      document.removeEventListener('pointerdown', down, true);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [!!picker, colors]);

  const openPicker = (i, e) => {
    const color = normalizeHex(colors[i]);
    liveRef.current = {x:e.clientX, y:e.clientY, color};
    setLiveColor(color); setLivePos({x:e.clientX, y:e.clientY});
    const next = {idx:i, color};
    pickerRef.current = next; setPicker(next);
    e.preventDefault(); e.stopPropagation();
  };

  return (
    <>
      <div className="section palette-section">
        <div className="section-label">
          <span className="name">Palette</span>
          <span className="value">{countLabel || `${colors.length} of ${maxColors}`}</span>
        </div>
        <div className="swatches">
          {colors.map((c,i) => (
            <button key={i} type="button"
              className={'swatch remove-target'+(picker?.idx===i?' active':'')}
              style={{background:c}}
              onClick={(e)=>openPicker(i,e)}
              onContextMenu={(e)=>{e.preventDefault();removeColor(i);}}
              title="Click to pick · Right-click to remove" />
          ))}
          {allowAdd && colors.length < maxColors &&
            <button type="button" className="swatch add" onClick={addColor} title="Add color">+</button>
          }
        </div>
        <div className="btn-row compact-row">
          <button className="btn btn-italic" onClick={randomize}>{compact ? 'Shuffle' : 'Shuffle palette'}</button>
        </div>
      </div>

      {picker && (
        <>
          <div className="color-wheel-card">
            <div ref={wheelRef} className="color-wheel-surface"
              title="Move over the spectrum or artwork, then click to select" />
            <div className="color-readout">
              <div><span>HEX</span><strong>{activeColor}</strong></div>
              <div><span>RGB</span><strong>{rgbObj.r}, {rgbObj.g}, {rgbObj.b}</strong></div>
              <div><span>CMYK</span><strong>{cmykObj.c}% {cmykObj.m}% {cmykObj.y}% {cmykObj.k}%</strong></div>
            </div>
          </div>
          <div className="eyedropper-follow" style={{left:livePos.x, top:livePos.y}}>
            <div className="eyedropper-color" style={{background:activeColor}} />
            <svg viewBox="0 0 64 64" aria-hidden="true">
              <path fill="currentColor" d="M44.7 6.6a7 7 0 0 1 9.9 9.9l-7.1 7.1 4.2 4.2-6.4 6.4-4.2-4.2-20 20c-1.1 1.1-2.5 1.8-4 2.1L6.8 54.4l2.3-10.3c.3-1.5 1-2.9 2.1-4l20-20-4.2-4.2 6.4-6.4 4.2 4.2 7.1-7.1Z"/>
            </svg>
          </div>
        </>
      )}
    </>
  );
}

window.NurrPaletteEditor = NurrPaletteEditor;
