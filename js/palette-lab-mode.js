// palette-lab-mode.js — NURR Palette Generator mode
// Exposes: window.PaletteMode, window.PaletteControls, window.PALETTE_DEFAULTS
// Also exposes: window.NURR_PALETTE_SEEDS, window.NURR_PALETTE_ENGINE

(function(){
  'use strict';

  const { useEffect, useRef, useState } = React;

  const SEEDS = [
    {id:'soft-editorial', label:'01 Soft Editorial', title:'Soft editorial', base:['#F4EDE0','#D8C7BD','#9EB7C2','#E6A6A9','#4B3C3E'], tags:['soft','warm','quiet']},
    {id:'digital-candy', label:'02 Digital Candy', title:'Digital candy', base:['#F02D78','#2A0D2D','#5A4A00','#FF3A14','#BE352D','#98F2F4'], tags:['electric','pop','synthetic']},
    {id:'acid-organic', label:'03 Acid Organic', title:'Acid organic', base:['#D9FF1F','#0D7C47','#F8F2DE','#FF6A1A','#071B2E'], tags:['acid','organic','loud']},
    {id:'night-electric', label:'04 Night Electric', title:'Night electric', base:['#05040A','#08015F','#2637D9','#FC6C3D','#98F2F4'], tags:['dark','electric','club']},
    {id:'heat-burn', label:'05 Heat Burn', title:'Heat burn', base:['#1A0710','#8A1424','#FC3C18','#F4A13B','#F4EDE0'], tags:['warm','cinematic','burnt']},
    {id:'mineral-glass', label:'06 Mineral Glass', title:'Mineral glass', base:['#07104C','#154D7A','#77D7EA','#C9B7E8','#F2FDFF'], tags:['cold','glass','clear']},
    {id:'brutalist-mono', label:'07 Brutalist Mono', title:'Brutalist mono', base:['#050505','#F1EEE6','#B8B4A8','#D9DC1B','#5A5A54'], tags:['mono','sharp','utility']},
    {id:'earth-industrial', label:'08 Earth Industrial', title:'Earth industrial', base:['#20140F','#7B4B31','#B66A3C','#C5B69C','#53624B'], tags:['earth','industrial','muted']},
    {id:'luxury-muted', label:'09 Luxury Muted', title:'Luxury muted', base:['#180D10','#4A1E24','#7A5739','#D8C7A1','#24372B'], tags:['dark','muted','rich']},
    {id:'clean-future', label:'10 Clean Future', title:'Clean future', base:['#F7FAFB','#DDF7FA','#A7B8C8','#08015F','#D9DC1B'], tags:['cold','clean','future']},
    {id:'pastel-synthetic', label:'11 Pastel Synthetic', title:'Pastel synthetic', base:['#B9F4E0','#C9B7E8','#FFF07A','#FF9A8B','#8BB9FF'], tags:['soft','synthetic','pastel']},
    {id:'dirty-pop', label:'12 Dirty Pop', title:'Dirty pop', base:['#FFF2D6','#EF233C','#2B59C3','#FFB703','#008F5A'], tags:['pop','poster','offbeat']}
  ];

  const NAMES = ['Soft signal','Pink static','Glass pulse','Acid noon','Night receipt','Burned velvet','Cold sugar','Mineral bruise','Editorial fever','Plastic orchid','Quiet voltage','Lime witness','Chrome dusk','Dirty halo','Electric moss','Synthetic blush','Black citrus','Powder damage'];
  const PERSONALITIES = ['electric','soft','acid','warm','cold','dark','mono'];

  const RAL = [
    ['RAL 1003 Signal yellow','#F9A800'],['RAL 1013 Oyster white','#EAE6CA'],['RAL 1015 Light ivory','#E6D2B5'],['RAL 1026 Luminous yellow','#FFFF00'],['RAL 2004 Pure orange','#E75B12'],['RAL 2005 Luminous orange','#FF2300'],['RAL 3000 Flame red','#A52019'],['RAL 3015 Light pink','#D8A0A6'],['RAL 3027 Raspberry red','#B81636'],['RAL 4003 Heather violet','#C0448F'],['RAL 4006 Traffic purple','#A03472'],['RAL 5002 Ultramarine blue','#20214F'],['RAL 5005 Signal blue','#154889'],['RAL 5012 Light blue','#0089B6'],['RAL 5018 Turquoise blue','#058B8C'],['RAL 5022 Night blue','#222D5A'],['RAL 6018 Yellow green','#61993B'],['RAL 6027 Light green','#7EBAB5'],['RAL 6038 Luminous green','#00BB2D'],['RAL 7001 Silver grey','#8A9597'],['RAL 7035 Light grey','#CBD0CC'],['RAL 7044 Silk grey','#BDBDB2'],['RAL 8004 Copper brown','#8E402A'],['RAL 8017 Chocolate brown','#44322D'],['RAL 9001 Cream','#FDF4E3'],['RAL 9002 Grey white','#E7EBDA'],['RAL 9003 Signal white','#F4F4F4'],['RAL 9004 Signal black','#282828'],['RAL 9005 Jet black','#0A0A0A'],['RAL 9010 Pure white','#FFFFFF'],['RAL 9011 Graphite black','#1C1C1C'],['RAL 3018 Strawberry red','#D53032'],['RAL 5024 Pastel blue','#6C9DA7'],['RAL 6019 Pastel green','#B9CEAC'],['RAL 4009 Pastel violet','#9D8692']
  ].map(function(x){ return { name:x[0], hex:x[1] }; });

  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function normalizeHex(value, fallback){
    let h = String(value || '').trim();
    if (!h) return fallback || '#000000';
    if (h[0] !== '#') h = '#' + h;
    if (/^#[0-9a-fA-F]{3}$/.test(h)) h = '#' + h.slice(1).split('').map(function(c){return c+c;}).join('');
    return /^#[0-9a-fA-F]{6}$/.test(h) ? h.toUpperCase() : (fallback || '#000000');
  }
  function hexToRgb(hex){ let h=normalizeHex(hex).slice(1); return {r:parseInt(h.slice(0,2),16), g:parseInt(h.slice(2,4),16), b:parseInt(h.slice(4,6),16)}; }
  function rgbToHex(r,g,b){ return '#'+[r,g,b].map(function(v){ return clamp(Math.round(v),0,255).toString(16).padStart(2,'0'); }).join('').toUpperCase(); }
  function rgbToHsl(rgb){ let r=rgb.r/255,g=rgb.g/255,b=rgb.b/255,max=Math.max(r,g,b),min=Math.min(r,g,b),h=0,s=0,l=(max+min)/2;if(max!==min){let d=max-min;s=l>.5?d/(2-max-min):d/(max+min);if(max===r)h=(g-b)/d+(g<b?6:0);else if(max===g)h=(b-r)/d+2;else h=(r-g)/d+4;h*=60;}return {h:h,s:s,l:l}; }
  function hslToRgb(h,s,l){ h=((h%360)+360)%360/360; let r,g,b;if(s===0){r=g=b=l;}else{const hue2rgb=function(p,q,t){if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};let q=l<.5?l*(1+s):l+s-l*s;let p=2*l-q;r=hue2rgb(p,q,h+1/3);g=hue2rgb(p,q,h);b=hue2rgb(p,q,h-1/3);}return {r:r*255,g:g*255,b:b*255}; }
  function hslToHex(h,s,l){ const c=hslToRgb(h,s,l); return rgbToHex(c.r,c.g,c.b); }
  function mix(a,b,t){ const A=hexToRgb(a),B=hexToRgb(b); return rgbToHex(A.r+(B.r-A.r)*t,A.g+(B.g-A.g)*t,A.b+(B.b-A.b)*t); }
  function colorDist(a,b){ const A=hexToRgb(a),B=hexToRgb(b); return Math.sqrt((A.r-B.r)*(A.r-B.r)+(A.g-B.g)*(A.g-B.g)+(A.b-B.b)*(A.b-B.b)); }
  function readableText(hex){ const c=hexToRgb(hex); return (c.r*299+c.g*587+c.b*114)/1000>150?'#101010':'#FFFFFF'; }
  function cmyk(hex){ let c=hexToRgb(hex),rr=c.r/255,gg=c.g/255,bb=c.b/255,k=1-Math.max(rr,gg,bb); if(k>.999)return '0, 0, 0, 100'; let cc=(1-rr-k)/(1-k),m=(1-gg-k)/(1-k),y=(1-bb-k)/(1-k); return [cc,m,y,k].map(function(v){return Math.round(v*100);}).join(', '); }
  function closestRal(hex){ let best=RAL[0],bd=9999; RAL.forEach(function(r){let d=colorDist(hex,r.hex); if(d<bd){bd=d; best=r;}}); return { name:best.name, hex:best.hex, distance:Math.round(bd), exact:bd<3 }; }
  function role(i){ return ['BACKGROUND','BASE','SECONDARY','ACCENT','LIGHT','DARK','EXTRA','EXTRA'][i] || ('COLOR '+(i+1)); }
  function svgText(s){ return String(s).replace(/[&<>]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[m];}); }

  function mutateColor(hex, idx, opts){
    let hsl = rgbToHsl(hexToRgb(hex));
    const personality = opts.personality || 'electric';
    const sign = idx % 2 ? 1 : -1;
    hsl.h += (opts.temperature * 26) + sign * (personality==='electric'?12:personality==='soft'?4:8) * opts.intensity;
    if(personality==='acid') hsl.h += idx%3===0?48:-18;
    if(personality==='warm') hsl.h += 18;
    if(personality==='cold') hsl.h -= 22;
    if(personality==='mono') hsl.s *= .18;
    hsl.s = clamp(hsl.s*(.72+opts.intensity*.72), personality==='soft'?.12:.2, personality==='electric'?.95:.82);
    const contrastPush = (idx-(opts.count-1)/2)/Math.max(1,opts.count-1);
    hsl.l = clamp(hsl.l + contrastPush*opts.contrast*.34 + (personality==='dark'?-.16:0) + (personality==='soft'?.11:0), .04, .94);
    return hslToHex(hsl.h,hsl.s,hsl.l);
  }



  function adjustPaletteColor(hex, index, baseColors, opts){
    // Slider logic is deterministic:
    // pigment     0.50 = original saturation, lower = muted, higher = vivid
    // contrast    0.50 = original lightness spread, lower = flatter, higher = more separation
    // temperature 0.00 = original hue, negative = cooler, positive = warmer
    const pigment = clamp(Number(opts && opts.intensity), 0, 1);
    const contrast = clamp(Number(opts && opts.contrast), 0, 1);
    const temperature = clamp(Number(opts && opts.temperature), -1, 1);
    const base = (baseColors || []).map(function(c){ return rgbToHsl(hexToRgb(c)); });
    const avgL = base.length ? base.reduce(function(sum,c){ return sum + c.l; }, 0) / base.length : 0.5;

    let hsl = rgbToHsl(hexToRgb(hex));

    // Temperature: gentle hue bias only, not a new palette generation.
    hsl.h += temperature * 18;
    if (temperature > 0) {
      // Warm bias pulls slightly toward red/orange while preserving identity.
      if (hsl.h > 180 && hsl.h < 330) hsl.h += temperature * 6;
    } else if (temperature < 0) {
      // Cool bias pulls slightly toward cyan/blue.
      if (hsl.h < 80 || hsl.h > 300) hsl.h += temperature * 5;
    }

    // Pigment: saturation only.
    if (pigment < 0.5) {
      hsl.s = hsl.s * (pigment / 0.5);
    } else {
      hsl.s = hsl.s + (1 - hsl.s) * ((pigment - 0.5) / 0.5);
    }

    // Contrast: value/lightness range only. 0.5 keeps the original palette.
    const spread = 0.45 + contrast * 1.35; // 0.45..1.80
    hsl.l = avgL + (hsl.l - avgL) * spread;

    hsl.s = clamp(hsl.s, 0, 1);
    hsl.l = clamp(hsl.l, 0.04, 0.96);
    return hslToHex(hsl.h, hsl.s, hsl.l);
  }

  function adjustedPaletteFromBase(baseColors, opts){
    opts = opts || {};
    return (baseColors || []).map(function(c, i){ return adjustPaletteColor(c, i, baseColors, opts); });
  }

  function withAdjustedColors(palette, opts){
    if (!palette) return palette;
    const base = (palette.baseColors || palette.colors || []).slice();
    const adjusted = adjustedPaletteFromBase(base, opts || {});
    return Object.assign({}, palette, { baseColors: base, colors: adjusted });
  }

  function generatePalette(opts){
    opts = opts || {};
    const fam = SEEDS.find(function(f){ return f.id === (opts.family || 'digital-candy'); }) || SEEDS[1];
    const count = opts.count || 5;
    const personality = opts.personality || 'electric';
    const ordered = fam.base.map(function(_,i){ return fam.base[(i + Math.floor(Math.random()*fam.base.length)) % fam.base.length]; });
    const out = [];
    for(let i=0;i<count;i++){
      let src = ordered[i % ordered.length];
      let next = mutateColor(src, i, { count:count, personality:personality, intensity:0.58, contrast:.58, temperature:0 });
      if(i >= ordered.length) next = mix(next, ordered[(i+2)%ordered.length], .28);
      out.push(next);
    }
    if(personality==='soft') out[0]=mix(out[0],'#F4EDE0',.45);
    if(personality==='dark') out[0]=mix(out[0],'#05040A',.55);
    const baseColors = out.slice();
    return { id:'nurr-'+Date.now()+'-'+Math.floor(Math.random()*9999), name:NAMES[Math.floor(Math.random()*NAMES.length)], family:fam, personality:personality, baseColors:baseColors, colors:adjustedPaletteFromBase(baseColors, { intensity:opts.intensity ?? .5, contrast:opts.contrast ?? .5, temperature:opts.temperature ?? 0 }), created:new Date().toISOString() };
  }

  function gradientFromPalette(palette){
    const cols = (palette && palette.colors ? palette.colors : []).slice();
    if(!cols.length) return ['#05040A','#F02D78','#FC6C3D','#BE352D'];
    const dark = cols.slice().sort(function(a,b){return rgbToHsl(hexToRgb(a)).l-rgbToHsl(hexToRgb(b)).l;})[0];
    const vivid = cols.slice().sort(function(a,b){return rgbToHsl(hexToRgb(b)).s-rgbToHsl(hexToRgb(a)).s;})[0];
    const rest = cols.filter(function(c){return c!==dark && c!==vivid;});
    return [dark].concat(rest.slice(0,3)).concat([vivid]).slice(0,5);
  }

  function gradientCss(colors){ const c=colors && colors.length?colors:['#05040A','#F02D78']; return 'linear-gradient(180deg, '+c.map(function(x,i){return x+' '+Math.round(i*100/(c.length-1||1))+'%';}).join(', ')+')'; }
  function backdropCss(colors){ const c=colors && colors.length?colors:['#05040A','#F02D78']; return [
    'radial-gradient(circle at 22% 18%, '+c[0]+' 0%, transparent 35%)',
    'radial-gradient(circle at 18% 56%, '+c[1%c.length]+' 0%, transparent 40%)',
    'radial-gradient(circle at 72% 42%, '+c[2%c.length]+' 0%, transparent 48%)',
    'radial-gradient(circle at 64% 86%, '+c[3%c.length]+' 0%, transparent 44%)',
    gradientCss(c)
  ].join(', '); }

  function prettyGradientCanvas(colors, w, h){
    colors = (colors && colors.length?colors:['#05040A','#F02D78']).map(function(c){return normalizeHex(c);});
    w = w || 3840; h = h || 2160;
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    const base = ctx.createLinearGradient(0,0,0,h);
    colors.forEach(function(hex,i){ base.addColorStop(i/(colors.length-1||1), hex); });
    ctx.fillStyle = base; ctx.fillRect(0,0,w,h);
    function radial(x,y,r,hex,alpha){
      const g=ctx.createRadialGradient(x*w,y*h,0,x*w,y*h,r*Math.max(w,h));
      g.addColorStop(0, hex); g.addColorStop(.42, hex+'CC'); g.addColorStop(1, hex+'00');
      ctx.globalAlpha=alpha; ctx.fillStyle=g; ctx.fillRect(0,0,w,h); ctx.globalAlpha=1;
    }
    radial(.22,.18,.43,colors[0%colors.length],.72);
    radial(.18,.56,.48,colors[1%colors.length],.62);
    radial(.72,.42,.56,colors[2%colors.length],.58);
    radial(.64,.86,.52,colors[3%colors.length],.54);
    radial(.48,.62,.44,colors[4%colors.length],.34);
    const veil=ctx.createLinearGradient(0,0,0,h); veil.addColorStop(0,'rgba(0,0,0,.18)'); veil.addColorStop(.5,'rgba(255,255,255,.04)'); veil.addColorStop(1,'rgba(0,0,0,.12)'); ctx.fillStyle=veil; ctx.fillRect(0,0,w,h);
    const img=ctx.getImageData(0,0,w,h); const data=img.data; let seed=17;
    for(let i=0;i<data.length;i+=4){ seed=(seed*1664525+1013904223)>>>0; const n=((seed/4294967295)-.5)*10; data[i]=clamp(data[i]+n,0,255); data[i+1]=clamp(data[i+1]+n,0,255); data[i+2]=clamp(data[i+2]+n,0,255); }
    ctx.putImageData(img,0,0); return canvas;
  }

  function drawPrettyGradientToCanvas(canvas, colors){
    if(!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(window.innerWidth*dpr));
    const h = Math.max(1, Math.round(window.innerHeight*dpr));
    if(canvas.width !== w || canvas.height !== h){ canvas.width=w; canvas.height=h; canvas.style.width=window.innerWidth+'px'; canvas.style.height=window.innerHeight+'px'; }
    const src = prettyGradientCanvas(colors, w, h);
    const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,w,h); ctx.drawImage(src,0,0);
  }

  function downloadBlob(name, blob){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){URL.revokeObjectURL(a.href);},1200); }
  function downloadText(name, text, type){ downloadBlob(name, new Blob([text], {type:type || 'text/plain'})); }

  function svgSwatches(palette){
    const colors=palette.colors, w=1200, h=780, cols=Math.min(colors.length,5), cellW=(w-120)/cols;
    const rects=colors.map(function(c,i){ let x=60+(i%5)*cellW, y=140+Math.floor(i/5)*220, ral=closestRal(c); return '<rect x="'+x+'" y="'+y+'" width="'+(cellW-12)+'" height="150" rx="0" fill="'+c+'"/><text x="'+(x+18)+'" y="'+(y+82)+'" font-family="Helvetica" font-size="18" fill="'+readableText(c)+'">'+c+'</text><text x="'+(x+18)+'" y="'+(y+112)+'" font-family="Helvetica" font-size="13" fill="'+readableText(c)+'">RGB '+Object.values(hexToRgb(c)).join(', ')+'</text><text x="'+(x+18)+'" y="'+(y+134)+'" font-family="Helvetica" font-size="12" fill="'+readableText(c)+'">'+svgText(ral.name)+' closest</text>'; }).join('');
    return '<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'"><rect width="100%" height="100%" fill="#EFEEE9"/><text x="60" y="78" font-family="Helvetica" font-weight="800" font-size="54">'+svgText(palette.family.title)+'</text>'+rects+'<text x="60" y="'+(h-56)+'" font-family="Helvetica" font-size="14">RAL values are closest available matches unless stated otherwise.</text></svg>';
  }
  function svgGradient(colors){
    const stops=colors.map(function(c,i){return '<stop offset="'+(i/(colors.length-1||1)*100)+'%" stop-color="'+c+'"/>';}).join('');
    return '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000"><defs><linearGradient id="base" x1="0" x2="0" y1="0" y2="1">'+stops+'</linearGradient><radialGradient id="r1" cx="22%" cy="18%" r="48%"><stop offset="0%" stop-color="'+colors[0]+'"/><stop offset="100%" stop-color="transparent"/></radialGradient><radialGradient id="r2" cx="70%" cy="42%" r="54%"><stop offset="0%" stop-color="'+colors[2%colors.length]+'"/><stop offset="100%" stop-color="transparent"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#base)"/><rect width="100%" height="100%" fill="url(#r1)" opacity=".70"/><rect width="100%" height="100%" fill="url(#r2)" opacity=".52"/></svg>';
  }
  function svgCombined(palette, colors){
    const sw = svgSwatches(palette).replace(/<svg[^>]*>|<\/svg>/g,'');
    return '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1400" viewBox="0 0 1600 1400"><rect width="100%" height="100%" fill="#EFEEE9"/><g transform="translate(0,0) scale(1.15)">'+sw+'</g><g transform="translate(70,910) scale(.91)">'+svgGradient(colors).replace(/<svg[^>]*>|<\/svg>/g,'')+'</g></svg>';
  }
  function escapePdf(s){ return String(s).replace(/[()\\]/g,'\\$&'); }
  function pdfColor(hex){ const c=hexToRgb(hex); return (c.r/255).toFixed(3)+' '+(c.g/255).toFixed(3)+' '+(c.b/255).toFixed(3)+' rg'; }
  function simplePdf(name,stream){ const objs=[]; const add=function(s){objs.push(s);return objs.length;}; add('<< /Type /Catalog /Pages 2 0 R >>'); add('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'); add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>'); add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'); add('<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream'); let pdf='%PDF-1.4\n',xref=[0]; objs.forEach(function(o,i){xref.push(pdf.length); pdf+=(i+1)+' 0 obj\n'+o+'\nendobj\n';}); let start=pdf.length; pdf+='xref\n0 '+(objs.length+1)+'\n0000000000 65535 f \n'+xref.slice(1).map(function(n){return String(n).padStart(10,'0')+' 00000 n ';}).join('\n')+'\ntrailer << /Size '+(objs.length+1)+' /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF'; downloadBlob(name,new Blob([pdf],{type:'application/pdf'})); }
  function pdfSwatches(palette){ let s='BT /F1 30 Tf 42 548 Td ('+escapePdf(palette.family.title)+') Tj ET\n'; let x=42,y=370,w=140,h=125; palette.colors.forEach(function(c){ const ral=closestRal(c); s+=pdfColor(c)+' '+x+' '+y+' '+w+' '+h+' re f\n0 0 0 rg BT /F1 10 Tf '+x+' '+(y-22)+' Td ('+escapePdf(c+' RGB '+Object.values(hexToRgb(c)).join(', '))+') Tj ET\nBT /F1 9 Tf '+x+' '+(y-38)+' Td ('+escapePdf(ral.name+' closest')+') Tj ET\n'; x+=w+16; if(x>720){x=42;y-=180;} }); simplePdf('nurr-palette-swatches.pdf',s); }
  function pdfGradient(colors, palette){ let s='BT /F1 30 Tf 42 548 Td ('+escapePdf(palette.family.title+' gradient')+') Tj ET\n'; const steps=260,x0=42,y0=120,w=758,h=340; for(let i=0;i<steps;i++){let t=i/(steps-1), pos=t*(colors.length-1), j=Math.min(colors.length-2,Math.floor(pos)), col=mix(colors[j],colors[j+1],pos-j); s+=pdfColor(col)+' '+(x0+i*w/steps)+' '+y0+' '+(w/steps+1)+' '+h+' re f\n';} simplePdf('nurr-gradient.pdf',s); }
  function makeAseBlob(colors){
    // Minimal Adobe Swatch Exchange writer, RGB global swatches.
    const enc = new TextEncoder();
    const blocks=[];
    colors.forEach(function(hex,i){ const rgb=hexToRgb(hex); const name='NURR '+(i+1)+' '+hex; const nameBytes=[]; for(let ch of name){ const code=ch.charCodeAt(0); nameBytes.push((code>>8)&255, code&255); } nameBytes.push(0,0); const len=2+nameBytes.length+4+12+2; const b=new ArrayBuffer(6+len); const dv=new DataView(b); let o=0; dv.setUint16(o,0x0001); o+=2; dv.setUint32(o,len); o+=4; dv.setUint16(o,name.length+1); o+=2; nameBytes.forEach(function(v){dv.setUint8(o++,v);}); enc.encode('RGB ').forEach(function(v){dv.setUint8(o++,v);}); dv.setFloat32(o,rgb.r/255); o+=4; dv.setFloat32(o,rgb.g/255); o+=4; dv.setFloat32(o,rgb.b/255); o+=4; dv.setUint16(o,0); blocks.push(new Uint8Array(b)); });
    const total=12+blocks.reduce(function(n,b){return n+b.length;},0); const out=new Uint8Array(total); out.set(enc.encode('ASEF'),0); const dv=new DataView(out.buffer); dv.setUint16(4,1); dv.setUint16(6,0); dv.setUint32(8,blocks.length); let o=12; blocks.forEach(function(b){out.set(b,o);o+=b.length;}); return new Blob([out],{type:'application/octet-stream'});
  }

  function exportItem(kind, palette, gradientColors){
    if(!palette) return;
    const colors = palette.colors;
    if(kind==='png-gradient') return prettyGradientCanvas(gradientColors,3840,2160).toBlob(function(blob){ downloadBlob('nurr-pretty-gradient.png', blob); }, 'image/png');
    if(kind==='svg-swatches') return downloadText('nurr-palette-swatches.svg', svgSwatches(palette), 'image/svg+xml');
    if(kind==='svg-gradient') return downloadText('nurr-gradient.svg', svgGradient(gradientColors), 'image/svg+xml');
    if(kind==='svg-combined') return downloadText('nurr-palette-combined.svg', svgCombined(palette, gradientColors), 'image/svg+xml');
    if(kind==='pdf-swatches') return pdfSwatches(palette);
    if(kind==='pdf-gradient') return pdfGradient(gradientColors, palette);
    if(kind==='json') return downloadText('nurr-palette.json', JSON.stringify({name:palette.name,family:palette.family.label,personality:palette.personality,colors:colors,gradient:gradientColors,ral:colors.map(closestRal)}, null, 2), 'application/json');
    if(kind==='js') return downloadText('nurr-palette.js', 'const nurrPalette = '+JSON.stringify(colors, null, 2)+';\n', 'text/javascript');
    if(kind==='ase') return downloadBlob('nurr-palette.ase', makeAseBlob(colors));
  }

  function relatedPalettes(state){
    const idx = SEEDS.findIndex(function(f){return f.id===state.family;});
    return Array.from({length:5}, function(_,i){ return generatePalette({ family:SEEDS[(idx+i+1+SEEDS.length)%SEEDS.length].id, count:state.count, personality:state.personality, intensity:state.intensity, contrast:state.contrast, temperature:state.temperature }); });
  }

  const ENGINE = { generatePalette:generatePalette, gradientFromPalette:gradientFromPalette, closestRal:closestRal, prettyGradientCanvas:prettyGradientCanvas, exportItem:exportItem, seeds:SEEDS };

  window.NURR_PALETTE_SEEDS = SEEDS;
  window.NURR_PALETTE_ENGINE = ENGINE;

  const DEFAULT_PALETTE = generatePalette({ family:'digital-candy', personality:'electric', count:5, intensity:.5, contrast:.5, temperature:0 });
  window.PALETTE_DEFAULTS = {
    family:'digital-candy', personality:'electric', count:5, intensity:.5, contrast:.5, temperature:0,
    palette: DEFAULT_PALETTE,
    gradientColors: gradientFromPalette(DEFAULT_PALETTE),
    history: []
  };

  function patchWithGenerated(tweaks, patch){
    const next = Object.assign({}, tweaks, patch || {});
    next.palette = generatePalette(next);
    next.gradientColors = gradientFromPalette(next.palette);
    return next;
  }

  function PaletteMode({ tweaks, registerSnapshot }){
    const canvasRef = useRef(null);
    const colors = (tweaks && tweaks.gradientColors) || gradientFromPalette(tweaks && tweaks.palette);
    useEffect(function(){
      const draw = function(){ drawPrettyGradientToCanvas(canvasRef.current, colors); };
      draw(); window.addEventListener('resize', draw);
      return function(){ window.removeEventListener('resize', draw); };
    }, [JSON.stringify(colors)]);
    useEffect(function(){
      registerSnapshot(function(){
        prettyGradientCanvas(colors,3840,2160).toBlob(function(blob){ downloadBlob('nurr-palette-gradient-'+Date.now()+'.png', blob); }, 'image/png');
      });
    }, [registerSnapshot, JSON.stringify(colors)]);
    return <canvas ref={canvasRef} className="stage nurr-palette-stage" />;
  }

  function PaletteControls({ tweaks, setTweaks }){
    const st = tweaks || window.PALETTE_DEFAULTS;
    const palette = st.palette || window.PALETTE_DEFAULTS.palette;
    const gradientColors = st.gradientColors || gradientFromPalette(palette);
    const [exportOpen, setExportOpen] = useState(false);
    const [related, setRelated] = useState(function(){ return relatedPalettes(st); });

    useEffect(function(){ setRelated(relatedPalettes(st)); }, [st.family, st.personality, st.count]);

    function patch(p){ setTweaks(p); }
    function generateNew(){ patch(patchWithGenerated(st, {})); }
    function setControl(key, value){
      const p={}; p[key]=value;
      if(key === 'intensity' || key === 'contrast' || key === 'temperature'){
        const nextSettings = Object.assign({}, st, p);
        const nextPalette = withAdjustedColors(palette, {
          intensity: nextSettings.intensity,
          contrast: nextSettings.contrast,
          temperature: nextSettings.temperature
        });
        patch(Object.assign({}, p, { palette:nextPalette, gradientColors:gradientFromPalette(nextPalette) }));
        return;
      }
      patch(patchWithGenerated(st, p));
    }
    function setGradientColor(i, value){ const next = gradientColors.slice(); next[i] = normalizeHex(value, next[i]); patch({ gradientColors: next }); }
    function openRelated(p){
      patch({ history: (st.history||[]).concat([{ palette:palette, gradientColors:gradientColors, family:st.family, personality:st.personality, count:st.count, intensity:st.intensity, contrast:st.contrast, temperature:st.temperature }]).slice(-8), palette:p, family:p.family.id, personality:p.personality, gradientColors:gradientFromPalette(p) });
    }
    function goBack(){ const h=(st.history||[]).slice(); const prev=h.pop(); if(prev) patch(Object.assign({}, prev, {history:h})); }

    return (
      <div className="nurr-palette-controls">
        <div className="nurr-palette-topline">
          <span>{palette.family.label}</span>
          <button className="btn nurr-palette-pill" onClick={generateNew}>Generate new ↻</button>
        </div>

        <div className="nurr-palette-title-row">
          <div>
            <div className="nurr-palette-title">{palette.family.title}</div>
            <div className="nurr-palette-name">{palette.name}</div>
          </div>
          {(st.history||[]).length > 0 && <button className="btn nurr-palette-back" onClick={goBack}>Back</button>}
        </div>

        <div className="nurr-palette-mosaic" style={{'--pretty-gradient':backdropCss(gradientColors)}}>
          {palette.colors.slice(0,5).map(function(c,i){return <div key={i} style={{background:c,color:readableText(c)}}><b>{c}</b><span>RGB {Object.values(hexToRgb(c)).join(', ')}</span><span>CMYK {cmyk(c)}</span></div>;})}
          <div className="nurr-palette-mosaic-gradient"><span>GRADIENT<br/>editable</span></div>
        </div>

        <div className="nurr-palette-form-grid section">
          <label><span>Family</span><select value={st.family} onChange={function(e){setControl('family', e.target.value);}}>{SEEDS.map(function(f){return <option key={f.id} value={f.id}>{f.label}</option>;})}</select></label>
          <label><span>Personality</span><select value={st.personality} onChange={function(e){setControl('personality', e.target.value);}}>{PERSONALITIES.map(function(p){return <option key={p} value={p}>{p}</option>;})}</select></label>
        </div>

        <div className="nurr-palette-inline-swatches">
          {palette.colors.map(function(c,i){return <div key={i}><button className="nurr-palette-swatch" style={{background:c}} title={c}></button><code>{c}</code></div>;})}
        </div>

        {[['count','Color count',2,8,1],['intensity','Pigment',0,1,.01],['contrast','Contrast',0,1,.01],['temperature','Temperature',-1,1,.01]].map(function(row){ const key=row[0], label=row[1]; return (
          <div className="section" key={key}>
            <div className="section-label"><span className="name">{label}</span><span className="value">{key==='count'?st[key]:Math.round((st[key]||0)*100)}</span></div>
            <input className="slider" type="range" min={row[2]} max={row[3]} step={row[4]} value={st[key]} onChange={function(e){ setControl(key, key==='count'?parseInt(e.target.value,10):parseFloat(e.target.value)); }} />
          </div>
        );})}

        <div className="section nurr-palette-gradient-editor">
          <div className="section-label"><span className="name">Gradient</span><span className="value">editable</span></div>
          <div className="nurr-palette-gradient-preview" style={{background:backdropCss(gradientColors)}}></div>
          <div className="nurr-palette-stop-list">
            {gradientColors.map(function(c,i){return <div className="nurr-palette-stop" key={i}><span style={{background:c}}></span><input type="color" value={c} onChange={function(e){setGradientColor(i,e.target.value);}} /><input type="text" value={c} onChange={function(e){setGradientColor(i,e.target.value);}} onBlur={function(e){setGradientColor(i,e.target.value);}} /></div>;})}
          </div>
        </div>

        <div className="section nurr-palette-export">
          <button className="btn primary btn-italic" onClick={function(){setExportOpen(!exportOpen);}}>Export</button>
          {exportOpen && <div className="nurr-palette-export-menu">
            <button onClick={function(){exportItem('png-gradient', palette, gradientColors);}}>PNG gradient HQ</button>
            <button onClick={function(){exportItem('svg-swatches', palette, gradientColors);}}>SVG swatches</button>
            <button onClick={function(){exportItem('svg-gradient', palette, gradientColors);}}>SVG gradient</button>
            <button onClick={function(){exportItem('svg-combined', palette, gradientColors);}}>SVG combined</button>
            <button onClick={function(){exportItem('pdf-swatches', palette, gradientColors);}}>PDF swatches</button>
            <button onClick={function(){exportItem('pdf-gradient', palette, gradientColors);}}>PDF gradient</button>
            <button onClick={function(){exportItem('ase', palette, gradientColors);}}>ASE swatches</button>
            <button onClick={function(){exportItem('json', palette, gradientColors);}}>JSON</button>
            <button onClick={function(){exportItem('js', palette, gradientColors);}}>JS array</button>
          </div>}
        </div>

        <div className="section">
          <div className="section-label"><span className="name">Color values</span><span className="value">RAL closest</span></div>
          <div className="nurr-palette-values">
            {palette.colors.map(function(c,i){ const ral=closestRal(c); return <div className="nurr-palette-value" key={i}><div style={{background:c}}></div><b>{role(i)}</b><code>{c}</code><span>RGB {Object.values(hexToRgb(c)).join(', ')}</span><span>CMYK {cmyk(c)}</span><span>{ral.name}{ral.exact?'':' · closest match'}</span></div>; })}
          </div>
        </div>

        <div className="section">
          <div className="section-label"><span className="name">Related palettes</span><span className="value">click to open</span></div>
          <div className="nurr-palette-related">
            {related.map(function(p){return <button key={p.id} className="nurr-palette-related-card" onClick={function(){openRelated(p);}}>{p.colors.slice(0,5).map(function(c,i){return <span key={i} style={{background:c}}></span>;})}<em>{p.family.title}</em></button>;})}
          </div>
        </div>
      </div>
    );
  }

  window.PaletteMode = PaletteMode;
  window.PaletteControls = PaletteControls;
}());
