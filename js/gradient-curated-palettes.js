// gradient-curated-palettes.js — curated NURR gradient palettes + hidden matched generator
// Add after helpers.js and before/after gradient.js. Safe: only extends WP.PALETTE_PRESETS.

(function(){
  'use strict';

  const FAMILIES = [
  {
    "id": "chaos-vibrant-03",
    "label": "Chaos vibrant 03",
    "palettes": [
      [
        "#FD5DCF",
        "#A51261",
        "#F3F3F1",
        "#2E484A",
        "#ABB5EB"
      ],
      [
        "#FCD12C",
        "#0381ED",
        "#FF0C32",
        "#FF9FF4",
        "#AF78D1"
      ],
      [
        "#D5D4CF",
        "#009642",
        "#CFFA33",
        "#FE7B01",
        "#F3F3F1"
      ],
      [
        "#009642",
        "#F84622",
        "#FE7B01",
        "#E916FF",
        "#072FC0"
      ],
      [
        "#EAEAEA",
        "#FD5DCF",
        "#CCC3BA",
        "#C0CCFC",
        "#EBFF6C"
      ]
    ]
  },
  {
    "id": "deep-burn",
    "label": "Deep burn",
    "palettes": [
      [
        "#691D29",
        "#190A13",
        "#F53522",
        "#B91F31"
      ],
      [
        "#F3AE39",
        "#C0011A",
        "#FCF6B8",
        "#E75909",
        "#0A5598"
      ],
      [
        "#55100D",
        "#D9D9D9",
        "#DD0200",
        "#1B0706",
        "#F54703"
      ],
      [
        "#DD6312",
        "#7B7673",
        "#FAF6EA",
        "#B82816",
        "#060807"
      ],
      [
        "#F73B2A",
        "#24050B",
        "#B71026",
        "#F7448D",
        "#240A0B"
      ]
    ]
  },
  {
    "id": "eco-electric-01",
    "label": "Eco Electric 01",
    "palettes": [
      [
        "#E3FF9A",
        "#C2C4B5",
        "#F6F1E7",
        "#9DF200"
      ],
      [
        "#D0CECA",
        "#D3ED18",
        "#FBC3E6",
        "#ABB5EB"
      ],
      [
        "#C7CC10",
        "#4B52EB",
        "#5E4D3C",
        "#D1ED40",
        "#0C2CC3"
      ],
      [
        "#E3FF9A",
        "#C7CC10",
        "#D3ED18",
        "#F6F1E7",
        "#C2C4B4",
        "#818166",
        "#0C2CC3"
      ],
      [
        "#598FFD",
        "#C7CC10",
        "#5E4D3C",
        "#0C2CC3",
        "#8987EC"
      ],
      [
        "#87A029",
        "#D3ED18",
        "#D2DDBF",
        "#EBFF6C",
        "#8C4C1C",
        "#A9A0F9"
      ]
    ]
  },
  {
    "id": "night-07",
    "label": "Night 07",
    "palettes": [
      [
        "#1E1F24",
        "#052C45",
        "#C7C7C5",
        "#FF1727"
      ],
      [
        "#4F1535",
        "#1E1F24",
        "#F84622",
        "#FF5CCF",
        "#233940"
      ],
      [
        "#4F1535",
        "#12291F",
        "#D0FF01",
        "#FB1000"
      ],
      [
        "#221337",
        "#D0CECA",
        "#D3ED18",
        "#818166"
      ],
      [
        "#1E011F",
        "#190013",
        "#87B2FF",
        "#E12BA9",
        "#D80B7A"
      ]
    ]
  },
  {
    "id": "saphire-quartz-06",
    "label": "Saphire Quartz 06",
    "palettes": [
      [
        "#081599",
        "#080317",
        "#8BCAFF",
        "#87B2FF",
        "#1E7AF1"
      ],
      [
        "#C8C693",
        "#7C679F",
        "#3F2646",
        "#34369B",
        "#24211A"
      ],
      [
        "#1829FD",
        "#20094F",
        "#400E45",
        "#250DD5",
        "#150218"
      ],
      [
        "#450580",
        "#A28CFB",
        "#16021F",
        "#806EFE",
        "#1B1FFC"
      ]
    ]
  },
  {
    "id": "vibrant-eclectic-02",
    "label": "Vibrant eclectic 02",
    "palettes": [
      [
        "#FD5035",
        "#1D020E",
        "#FC87C2",
        "#2E484A"
      ],
      [
        "#0B5F3D",
        "#ED2705",
        "#E80542",
        "#CB300A",
        "#081C1B"
      ],
      [
        "#FD5035",
        "#1D020E",
        "#FC87C2",
        "#507176",
        "#2E484A"
      ],
      [
        "#BC352A",
        "#514306",
        "#260F27",
        "#FD2D78",
        "#F43B10"
      ],
      [
        "#221337",
        "#D0CECA",
        "#0258BB",
        "#006EE8",
        "#2C0115",
        "#79BEB2",
        "#FDE7B6"
      ],
      [
        "#FB381D",
        "#9F89F1",
        "#053D7C",
        "#2E0008",
        "#D6B6EC",
        "#DED0D0",
        "#5B7374"
      ],
      [
        "#D60C1E",
        "#DB4630",
        "#F2BC49",
        "#A51261",
        "#ABB5EB",
        "#DB8307"
      ],
      [
        "#03639E",
        "#E79C71",
        "#FBC3E6",
        "#F2BC49",
        "#233940",
        "#DACAC9",
        "#0B0A25"
      ]
    ]
  },
  {
    "id": "earthly-modern-04",
    "label": "earthly modern 04",
    "palettes": [
      [
        "#EAEAEA",
        "#4E4B38",
        "#F04E31",
        "#CCC3BA",
        "#1A1500"
      ],
      [
        "#050505",
        "#C6C0A0",
        "#F2BC49",
        "#D1ED40",
        "#8C8C8C"
      ],
      [
        "#E0D8C3",
        "#DF2D21",
        "#1E1F24",
        "#F2BC49",
        "#8BA5A4"
      ],
      [
        "#222021",
        "#598FFD",
        "#EBF698",
        "#FF7043",
        "#AC9D58"
      ],
      [
        "#2460A8",
        "#711E2A",
        "#BE690E",
        "#24231E",
        "#D9C004"
      ]
    ]
  },
  {
    "id": "mineral-05",
    "label": "mineral 05",
    "palettes": [
      [
        "#010101",
        "#60798B",
        "#B5B198",
        "#DCD9C8",
        "#364759"
      ],
      [
        "#050505",
        "#C6C0A0",
        "#FAF6EA",
        "#8C8C8C",
        "#D9C8C1"
      ]
    ]
  }
];

  const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
  const normalizeHex = (value, fallback) => {
    let h = String(value || '').trim();
    if (!h) return fallback || '#000000';
    if (h[0] !== '#') h = '#' + h;
    if (/^#[0-9a-fA-F]{3}$/.test(h)) h = '#' + h.slice(1).split('').map(c => c+c).join('');
    return /^#[0-9a-fA-F]{6}$/.test(h) ? h.toUpperCase() : (fallback || '#000000');
  };
  const hexToRgb = (hex) => {
    const h = normalizeHex(hex).slice(1);
    return { r:parseInt(h.slice(0,2),16), g:parseInt(h.slice(2,4),16), b:parseInt(h.slice(4,6),16) };
  };
  const rgbToHex = (r,g,b) => '#' + [r,g,b].map(v => clamp(Math.round(v),0,255).toString(16).padStart(2,'0')).join('').toUpperCase();
  const mix = (a,b,t) => {
    const A=hexToRgb(a), B=hexToRgb(b);
    return rgbToHex(A.r+(B.r-A.r)*t, A.g+(B.g-A.g)*t, A.b+(B.b-A.b)*t);
  };
  const rgbToHsl = (rgb) => {
    let r=rgb.r/255,g=rgb.g/255,b=rgb.b/255,max=Math.max(r,g,b),min=Math.min(r,g,b),h=0,s=0,l=(max+min)/2;
    if(max!==min){let d=max-min;s=l>.5?d/(2-max-min):d/(max+min);if(max===r)h=(g-b)/d+(g<b?6:0);else if(max===g)h=(b-r)/d+2;else h=(r-g)/d+4;h*=60;}
    return {h,s,l};
  };
  const hslToRgb = (h,s,l) => {
    h=((h%360)+360)%360/360; let r,g,b;
    if(s===0){r=g=b=l;}else{
      const hue2rgb=(p,q,t)=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};
      const q=l<.5?l*(1+s):l+s-l*s; const p=2*l-q;
      r=hue2rgb(p,q,h+1/3); g=hue2rgb(p,q,h); b=hue2rgb(p,q,h-1/3);
    }
    return {r:r*255,g:g*255,b:b*255};
  };
  const hslToHex = (h,s,l) => { const c=hslToRgb(h,s,l); return rgbToHex(c.r,c.g,c.b); };
  const mutate = (hex, amount) => {
    const hsl = rgbToHsl(hexToRgb(hex));
    hsl.h += (Math.random()-.5) * 16 * amount;
    hsl.s = clamp(hsl.s + (Math.random()-.5) * .18 * amount, .06, .98);
    hsl.l = clamp(hsl.l + (Math.random()-.5) * .16 * amount, .04, .96);
    return hslToHex(hsl.h, hsl.s, hsl.l);
  };
  const uniquePalette = (colors) => colors.map(c => normalizeHex(c)).filter((c,i,a)=>a.indexOf(c)===i);
  const keyFor = (p) => p.map(c => normalizeHex(c)).join('|');
  const pick = (arr) => arr[Math.floor(Math.random()*arr.length)];

  const visiblePresets = [];
  const hiddenPool = [];
  FAMILIES.forEach(f => {
    f.palettes.forEach(p => {
      const clean = uniquePalette(p).slice(0, 6);
      if (clean.length >= 3) {
        visiblePresets.push(clean);
        hiddenPool.push({ family:f.id, label:f.label, colors:clean });
      }
    });
  });

  function installPresets(){
    window.WP = window.WP || {};
    window.WP.PALETTE_PRESETS = window.WP.PALETTE_PRESETS || [];
    const seen = new Set(window.WP.PALETTE_PRESETS.map(keyFor));
    visiblePresets.forEach(p => {
      const key = keyFor(p);
      if (!seen.has(key)) {
        window.WP.PALETTE_PRESETS.push(p);
        seen.add(key);
      }
    });
  }

  function randomMatchedPalette(count){
    count = clamp(Math.round(count || 4), 2, 4);
    const family = pick(FAMILIES);
    const a = pick(family.palettes);
    const b = pick(family.palettes);
    const out = [];
    for (let i=0; i<count; i++) {
      const ca = a[i % a.length];
      const cb = b[(i + 1 + Math.floor(Math.random()*Math.max(1,b.length-1))) % b.length];
      const mixed = mix(ca, cb, .22 + Math.random()*.56);
      out.push(mutate(mixed, .65));
    }
    out[0] = mutate(pick(a), .35);
    return uniquePalette(out).slice(0,count);
  }

  function randomFromFamily(familyId, count){
    const family = FAMILIES.find(f => f.id === familyId) || pick(FAMILIES);
    const source = pick(family.palettes);
    return uniquePalette(source).slice(0, clamp(Math.round(count || 4), 2, 4));
  }

  installPresets();

  window.NURR_GRADIENT_PALETTE_ENGINE = {
    families: FAMILIES,
    visiblePresets,
    hiddenPool,
    installPresets,
    randomMatchedPalette,
    randomFromFamily
  };
}());
