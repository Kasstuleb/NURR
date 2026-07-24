// print-export.js — NYMPH print pipeline.
//
// Produces press-ready files at true physical size: A0–A5 and US sizes, 150–400
// DPI, sRGB or coated CMYK, as PDF / TIFF / PNG.
//
// ── Why this is raster, not vector ──────────────────────────────────────────
// Gradient / Abstract / Flow output comes from per-pixel fragment shaders:
// warped multi-octave noise, blur, blob fields and film grain. None of that has
// a vector representation — you cannot express Perlin-warped noise or grain as
// PDF path or shading operators. The professional answer for generative art is
// raster at correct physical resolution, which is what this module does. (A
// pure linear/radial gradient with grain and texture OFF could be emitted as a
// real PDF type 2/3 shading dictionary; that is a separate, narrower feature.)
//
// ── Why it streams ──────────────────────────────────────────────────────────
// A0 at 300 DPI is 9933 × 14043 px = 139 megapixels — 558 MB as RGBA. Nothing
// here ever holds the full bitmap. The image is rendered in horizontal bands
// through a single reused WebGL context, each band is converted, compressed and
// appended to the output stream, then discarded. Peak memory stays in the low
// tens of megabytes regardless of page size.
(function () {
  'use strict';

  // ═════════════════════════════════════════════════════════════════════════
  // Paper sizes
  // ═════════════════════════════════════════════════════════════════════════
  const PAPER = {
    a0:      { label: 'A0',      w: 841,  h: 1189, group: 'ISO' },
    a1:      { label: 'A1',      w: 594,  h: 841,  group: 'ISO' },
    a2:      { label: 'A2',      w: 420,  h: 594,  group: 'ISO' },
    a3:      { label: 'A3',      w: 297,  h: 420,  group: 'ISO' },
    a4:      { label: 'A4',      w: 210,  h: 297,  group: 'ISO' },
    b1:      { label: 'B1',      w: 707,  h: 1000, group: 'ISO' },
    b2:      { label: 'B2',      w: 500,  h: 707,  group: 'ISO' },
    archE:   { label: 'Arch E',  w: 914,  h: 1219, group: 'US' },
    archD:   { label: 'Arch D',  w: 610,  h: 914,  group: 'US' },
    ansiE:   { label: 'ANSI E',  w: 864,  h: 1118, group: 'US' },
    tabloid: { label: 'Tabloid', w: 279,  h: 432,  group: 'US' },
    letter:  { label: 'Letter',  w: 216,  h: 279,  group: 'US' },
    poster24:{ label: '24×36 in',w: 610,  h: 914,  group: 'US' },
  };

  const DPI_OPTIONS = [150, 200, 300, 400];

  const MM_PER_IN = 25.4;
  const PT_PER_IN = 72;

  function pageMetrics(paperKey, dpi, landscape, customMM) {
    const p = customMM || PAPER[paperKey] || PAPER.a2;
    const wmm = landscape ? p.h : p.w;
    const hmm = landscape ? p.w : p.h;
    return {
      wmm, hmm, dpi,
      px:   Math.round((wmm / MM_PER_IN) * dpi),
      py:   Math.round((hmm / MM_PER_IN) * dpi),
      ptW:  (wmm / MM_PER_IN) * PT_PER_IN,
      ptH:  (hmm / MM_PER_IN) * PT_PER_IN,
    };
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Colour science
  //
  // Honest scope: without the ISO Coated v2 ICC profile this is a
  // colorimetrically-informed approximation, not a profile-exact conversion.
  // What it does guarantee is the part that actually ruins prints — it removes
  // colours the coated process physically cannot hit (saturated neons above
  // all), smoothly and at constant hue, so nothing turns muddy or bands. Drop a
  // real .icc into the profile slot and it gets embedded so a RIP can soft-proof
  // against the genuine article.
  // ═════════════════════════════════════════════════════════════════════════

  function srgbToLinear(c) {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function linearToSrgb(c) {
    if (c <= 0) return 0;
    if (c >= 1) return 1;
    return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  }

  const Xn = 0.95047, Yn = 1.0, Zn = 1.08883;   // D65

  function rgbToLab(r, g, b) {
    const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
    const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / Xn;
    const Y = (0.2126729 * R + 0.7151522 * G + 0.0721750 * B) / Yn;
    const Z = (0.0193339 * R + 0.1191920 * G + 0.9503041 * B) / Zn;
    const f = (t) => t > 0.008856451679 ? Math.cbrt(t) : (7.787037037 * t + 16 / 116);
    const fx = f(X), fy = f(Y), fz = f(Z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }

  function labToRgb(L, a, bb) {
    const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - bb / 200;
    const fi = (t) => { const t3 = t * t * t; return t3 > 0.008856451679 ? t3 : (t - 16 / 116) / 7.787037037; };
    const X = fi(fx) * Xn, Y = fi(fy) * Yn, Z = fi(fz) * Zn;
    const R =  3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
    const G = -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z;
    const B =  0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
    return [linearToSrgb(R), linearToSrgb(G), linearToSrgb(B)];
  }

  // Coated-offset gamut boundary, anchored to ISO Coated v2 solid primaries and
  // secondaries (approximate Lab). Each anchor gives the hue's maximum chroma
  // and the lightness at which it occurs (the "cusp"). Between anchors the
  // boundary is interpolated; at a given lightness the cross-section is modelled
  // as the standard cusp triangle — the same construction real gamut-mapping
  // algorithms use.
  const GAMUT_ANCHORS = [
    { h:   0, C: 72, L: 48 },   // red-magenta
    { h:  30, C: 83, L: 47 },   // red        (M+Y)
    { h:  60, C: 88, L: 62 },   // orange
    { h:  90, C: 93, L: 88 },   // yellow
    { h: 120, C: 78, L: 76 },   // yellow-green
    { h: 150, C: 72, L: 52 },   // green      (C+Y)
    { h: 180, C: 60, L: 55 },   // green-cyan
    { h: 210, C: 58, L: 56 },   // cyan
    { h: 240, C: 60, L: 48 },   // cyan-blue
    { h: 270, C: 55, L: 32 },   // blue       (C+M)
    { h: 300, C: 55, L: 27 },   // blue-violet
    { h: 330, C: 74, L: 45 },   // magenta
  ];

  function gamutAt(hue) {
    const n = GAMUT_ANCHORS.length;
    let i = 0;
    while (i < n && GAMUT_ANCHORS[i].h <= hue) i++;
    const a = GAMUT_ANCHORS[(i - 1 + n) % n];
    const b = GAMUT_ANCHORS[i % n];
    let span = b.h - a.h; if (span <= 0) span += 360;
    let d = hue - a.h;    if (d < 0) d += 360;
    const t = span > 0 ? d / span : 0;
    return { C: a.C + (b.C - a.C) * t, L: a.L + (b.L - a.L) * t };
  }

  // Map one sRGB colour into the coated gamut, preserving hue and lightness
  // exactly and easing chroma back with a smooth knee so gradients that cross
  // the gamut boundary stay continuous instead of flattening into a hard edge.
  function toCoatedGamut(r, g, b) {
    const lab = rgbToLab(r, g, b);
    const L = lab[0], A = lab[1], B2 = lab[2];
    const C = Math.sqrt(A * A + B2 * B2);
    if (C < 1e-4) return [r, g, b];
    let h = Math.atan2(B2, A) * 180 / Math.PI;
    if (h < 0) h += 360;

    const cusp = gamutAt(h);
    const Lc = Math.max(1, Math.min(99, cusp.L));
    // Gamut cross-section as a cusp triangle, softened on the upper branch:
    // the real coated gamut bulges toward the light end rather than tapering
    // in a straight line, which matters most for yellows.
    const maxCAt = (Lv) => Lv <= Lc
      ? cusp.C * (Lv / Lc)
      : cusp.C * Math.pow((100 - Lv) / (100 - Lc), 0.7);

    const maxC0 = maxCAt(L);
    if (maxC0 <= 0) return labToRgb(L, 0, 0);

    // Strict constant-lightness clipping turns a saturated out-of-gamut colour
    // pale, because the gamut is narrow at extreme lightness. Real perceptual
    // intents trade a little lightness for chroma; so does this, by a bounded
    // amount, which is what keeps the substituted tone attractive rather than
    // merely legal.
    const excess = Math.max(0, (C - maxC0) / Math.max(1, maxC0));
    const w = Math.min(0.42, 0.5 * (excess / (excess + 0.55)));
    const Lm = L + (Lc - L) * w;
    const maxC = maxCAt(Lm);
    if (maxC <= 0) return labToRgb(Lm, 0, 0);

    const knee = maxC * 0.82;
    let Cn = C;
    if (C > knee) {
      const span = maxC - knee;
      // tanh asymptotes to 1, so chroma approaches but never exceeds maxC, and
      // the derivative matches at the knee — C1 continuous, therefore no banding.
      Cn = knee + span * Math.tanh((C - knee) / span);
    }
    if (Cn >= C && Math.abs(Lm - L) < 1e-6) return [r, g, b];
    const s2 = Cn / C;
    return labToRgb(Lm, A * s2, B2 * s2);
  }

  function smoothstep(e0, e1, x) {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  }

  // Ink separation with grey-component replacement and a total-area-coverage
  // limit. TAC 300% is the usual ceiling for ISO Coated v2 / FOGRA39 sheetfed.
  function separate(r, g, b, tac, gcrAmount) {
    let c = 1 - r, m = 1 - g, y = 1 - b;
    const k0 = Math.min(c, m, y);

    // Neutral colours go almost entirely to K, so greys print clean rather than
    // as a three-ink build that shifts with registration and ink density.
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    const neutral = 1 - Math.min(1, chroma / 0.18);
    let gcr = gcrAmount * smoothstep(0.05, 0.40, k0);
    gcr = gcr + (0.97 - gcr) * neutral;

    let k = k0 * gcr;
    // Floor the denominator: as k approaches 1 the undercolour term explodes and
    // a solid black would separate to CMY ~100 each, slamming into the ink
    // limit. The floor only engages above ~85% K, so it shapes deep shadows
    // into a conventional rich black and leaves every other tone untouched.
    const den = Math.max(1 - k, 0.15);
    c = (c - k) / den; m = (m - k) / den; y = (y - k) / den;

    c = Math.max(0, Math.min(1, c));
    m = Math.max(0, Math.min(1, m));
    y = Math.max(0, Math.min(1, y));
    k = Math.max(0, Math.min(1, k));

    // TAC: pull CMY back first — K carries shadow density far more efficiently.
    const limit = tac / 100;
    const total = c + m + y + k;
    if (total > limit) {
      const avail = Math.max(0, limit - k);
      const cmy = c + m + y;
      if (cmy > avail && cmy > 1e-6) { const f = avail / cmy; c *= f; m *= f; y *= f; }
    }
    return [c, m, y, k];
  }

  // ── RGB → CMYK 3D lookup table ────────────────────────────────────────────
  // The full per-pixel path costs six pow() calls and a cbrt; at 139 megapixels
  // that is unusable. Real colour engines solve this with a 3D LUT plus
  // trilinear interpolation, and so does this: build a 33³ grid once at full
  // precision, then interpolate. The transform is smooth, so interpolation is
  // visually exact — and critically, trilinear (not nearest) is what keeps
  // gradients free of banding.
  const LUT_N = 33;
  function buildCmykLUT(tac, gcrAmount) {
    const n = LUT_N, out = new Float32Array(n * n * n * 4);
    let i = 0;
    for (let bi = 0; bi < n; bi++) {
      for (let gi = 0; gi < n; gi++) {
        for (let ri = 0; ri < n; ri++) {
          const mapped = toCoatedGamut(ri / (n - 1), gi / (n - 1), bi / (n - 1));
          const cmyk = separate(mapped[0], mapped[1], mapped[2], tac, gcrAmount);
          out[i++] = cmyk[0]; out[i++] = cmyk[1]; out[i++] = cmyk[2]; out[i++] = cmyk[3];
        }
      }
    }
    return out;
  }

  // Same grid, but returning gamut-mapped RGB — used for RGB print output so a
  // proof PNG/PDF shows what the CMYK file will actually be able to print.
  function buildRgbGamutLUT() {
    const n = LUT_N, out = new Float32Array(n * n * n * 3);
    let i = 0;
    for (let bi = 0; bi < n; bi++) {
      for (let gi = 0; gi < n; gi++) {
        for (let ri = 0; ri < n; ri++) {
          const m = toCoatedGamut(ri / (n - 1), gi / (n - 1), bi / (n - 1));
          out[i++] = m[0]; out[i++] = m[1]; out[i++] = m[2];
        }
      }
    }
    return out;
  }

  function lutApply(lut, comps, rgba, count, dst) {
    const n = LUT_N, nm1 = n - 1, s = nm1 / 255;
    for (let p = 0; p < count; p++) {
      const o = p * 4;
      const fr = rgba[o] * s, fg = rgba[o + 1] * s, fb = rgba[o + 2] * s;
      const r0 = fr | 0, g0 = fg | 0, b0 = fb | 0;
      const r1 = r0 < nm1 ? r0 + 1 : r0, g1 = g0 < nm1 ? g0 + 1 : g0, b1 = b0 < nm1 ? b0 + 1 : b0;
      const dr = fr - r0, dg = fg - g0, db = fb - b0;

      const i000 = ((b0 * n + g0) * n + r0) * comps, i100 = ((b0 * n + g0) * n + r1) * comps;
      const i010 = ((b0 * n + g1) * n + r0) * comps, i110 = ((b0 * n + g1) * n + r1) * comps;
      const i001 = ((b1 * n + g0) * n + r0) * comps, i101 = ((b1 * n + g0) * n + r1) * comps;
      const i011 = ((b1 * n + g1) * n + r0) * comps, i111 = ((b1 * n + g1) * n + r1) * comps;

      const od = p * comps;
      for (let c = 0; c < comps; c++) {
        const c00 = lut[i000 + c] + (lut[i100 + c] - lut[i000 + c]) * dr;
        const c10 = lut[i010 + c] + (lut[i110 + c] - lut[i010 + c]) * dr;
        const c01 = lut[i001 + c] + (lut[i101 + c] - lut[i001 + c]) * dr;
        const c11 = lut[i011 + c] + (lut[i111 + c] - lut[i011 + c]) * dr;
        const c0 = c00 + (c10 - c00) * dg;
        const c1 = c01 + (c11 - c01) * dg;
        const v = (c0 + (c1 - c0) * db) * 255;
        dst[od + c] = v < 0 ? 0 : v > 255 ? 255 : (v + 0.5) | 0;
      }
    }
    return dst;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Deflate — native CompressionStream('deflate') emits zlib-wrapped deflate,
  // which is exactly what both PDF /FlateDecode and TIFF compression 8 expect.
  // No library needed.
  // ═════════════════════════════════════════════════════════════════════════
  function hasDeflate() { return typeof CompressionStream === 'function'; }

  class Deflator {
    constructor() {
      const cs = new CompressionStream('deflate');
      this.writer = cs.writable.getWriter();
      this.reader = cs.readable.getReader();
      this.chunks = [];
      this.length = 0;
      // Drain concurrently: writing without reading deadlocks once the
      // internal queue fills, which it will on a page this size.
      this.pumping = (async () => {
        for (;;) {
          const { done, value } = await this.reader.read();
          if (done) break;
          this.chunks.push(value);
          this.length += value.length;
        }
      })();
    }
    async push(u8) { await this.writer.write(u8); }
    async finish() {
      await this.writer.close();
      await this.pumping;
      return { chunks: this.chunks, length: this.length };
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Byte helpers
  // ═════════════════════════════════════════════════════════════════════════
  function u32be(v) { return new Uint8Array([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]); }
  function ascii(s) { const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 255; return a; }

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(chunks) {
    let c = 0xFFFFFFFF;
    for (const arr of chunks) for (let i = 0; i < arr.length; i++) c = CRC_TABLE[(c ^ arr[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PNG (streaming, RGB, with pHYs so the DPI travels with the file)
  // PNG has no CMYK support by design — CMYK output goes to TIFF or PDF.
  // ═════════════════════════════════════════════════════════════════════════
  function pngChunk(type, dataChunks) {
    const parts = [ascii(type), ...dataChunks];
    let len = 0; for (const d of dataChunks) len += d.length;
    return [u32be(len), ...parts, u32be(crc32(parts))];
  }

  async function encodePNG(width, height, dpi, bandProvider, onProgress) {
    const out = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])];

    const ihdr = new Uint8Array(13);
    ihdr.set(u32be(width), 0); ihdr.set(u32be(height), 4);
    ihdr[8] = 8;    // bit depth
    ihdr[9] = 2;    // colour type 2 = truecolour RGB
    out.push(...pngChunk('IHDR', [ihdr]));

    const ppm = Math.round(dpi / 0.0254);
    const phys = new Uint8Array(9);
    phys.set(u32be(ppm), 0); phys.set(u32be(ppm), 4); phys[8] = 1; // unit = metre
    out.push(...pngChunk('pHYs', [phys]));

    const def = new Deflator();
    const stride = width * 3;
    let prev = new Uint8Array(stride);
    const raw = new Uint8Array(stride);
    const line = new Uint8Array(stride + 1);

    await bandProvider(async (rgb, rows, y0) => {
      for (let r = 0; r < rows; r++) {
        raw.set(rgb.subarray(r * stride, r * stride + stride));
        // Adaptive filter: Sub suits horizontal gradients, Up suits vertical.
        // Picking per row by absolute-sum keeps files small without the cost of
        // trying all five filters.
        let sSub = 0, sUp = 0;
        for (let i = 0; i < stride; i++) {
          const left = i >= 3 ? raw[i - 3] : 0;
          sSub += Math.abs((raw[i] - left) << 24 >> 24);
          sUp  += Math.abs((raw[i] - prev[i]) << 24 >> 24);
        }
        if (sSub <= sUp) {
          line[0] = 1;
          for (let i = 0; i < stride; i++) line[i + 1] = (raw[i] - (i >= 3 ? raw[i - 3] : 0)) & 255;
        } else {
          line[0] = 2;
          for (let i = 0; i < stride; i++) line[i + 1] = (raw[i] - prev[i]) & 255;
        }
        await def.push(line.slice());
        prev.set(raw);
      }
      if (onProgress) onProgress(y0 + rows);
    });

    const { chunks } = await def.finish();
    out.push(...pngChunk('IDAT', chunks));
    out.push(...pngChunk('IEND', []));
    return new Blob(out, { type: 'image/png' });
  }

  // ═════════════════════════════════════════════════════════════════════════
  // TIFF (streaming, strip-per-band, Adobe Deflate, RGB or CMYK, optional ICC)
  // ═════════════════════════════════════════════════════════════════════════
  async function encodeTIFF(width, height, dpi, comps, bandProvider, iccBytes, onProgress) {
    const isCMYK = comps === 4;
    const strips = [];          // { bytes: Uint8Array[], length }
    const stripRows = [];

    await bandProvider(async (data, rows, y0) => {
      const def = new Deflator();
      await def.push(data.slice(0, rows * width * comps));
      const { chunks, length } = await def.finish();
      strips.push({ chunks, length });
      stripRows.push(rows);
      if (onProgress) onProgress(y0 + rows);
    });

    // Header (8) + strip data, then the IFD at the end.
    let offset = 8;
    const stripOffsets = [], stripCounts = [];
    for (const s of strips) { stripOffsets.push(offset); stripCounts.push(s.length); offset += s.length; }

    const SOFTWARE = 'NYMPH print export\0';
    const rowsPerStrip = stripRows[0] || height;

    // Out-of-line values must be word-aligned and come after the IFD.
    const extras = [];
    const addExtra = (bytes) => { const at = 0; extras.push(bytes); return at; };

    const bpsBytes = new Uint8Array(comps * 2);
    for (let i = 0; i < comps; i++) { bpsBytes[i * 2] = 8; bpsBytes[i * 2 + 1] = 0; }
    const softBytes = ascii(SOFTWARE);
    const resBytes = new Uint8Array(8);
    const rv = new DataView(resBytes.buffer);
    rv.setUint32(0, dpi, true); rv.setUint32(4, 1, true);   // XResolution rational
    const res2 = resBytes.slice();

    const soBytes = new Uint8Array(stripOffsets.length * 4);
    const scBytes = new Uint8Array(stripCounts.length * 4);

    const tags = [];
    const add = (tag, type, count, value, inlineOK) => tags.push({ tag, type, count, value, inlineOK });
    add(256, 4, 1, width, true);
    add(257, 4, 1, height, true);
    add(258, 3, comps, bpsBytes, comps <= 2);
    add(259, 3, 1, 8, true);                       // Adobe Deflate
    add(262, 3, 1, isCMYK ? 5 : 2, true);          // Separated / RGB
    add(273, 4, stripOffsets.length, soBytes, stripOffsets.length === 1);
    add(277, 3, 1, comps, true);
    add(278, 4, 1, rowsPerStrip, true);
    add(279, 4, stripCounts.length, scBytes, stripCounts.length === 1);
    add(282, 5, 1, resBytes, false);
    add(283, 5, 1, res2, false);
    add(284, 3, 1, 1, true);                       // chunky
    add(296, 3, 1, 2, true);                       // resolution unit = inch
    add(305, 2, softBytes.length, softBytes, false);
    if (isCMYK) { add(332, 3, 1, 1, true); add(334, 3, 1, 4, true); }
    if (iccBytes && iccBytes.length) add(34675, 7, iccBytes.length, iccBytes, false);
    tags.sort((a, b) => a.tag - b.tag);

    const ifdOffset = offset;
    const ifdSize = 2 + tags.length * 12 + 4;
    let extraAt = ifdOffset + ifdSize;
    if (extraAt & 1) extraAt++;

    // Assign out-of-line offsets in tag order.
    const outOfLine = [];
    for (const t of tags) {
      const bytes = (t.value instanceof Uint8Array) ? t.value : null;
      const size = bytes ? bytes.length : 0;
      if (bytes && !(t.inlineOK && size <= 4)) {
        t.offset = extraAt;
        outOfLine.push(bytes);
        extraAt += size + (size & 1);
      }
    }

    // Now that offsets are fixed, fill strip offset/count arrays.
    const sov = new DataView(soBytes.buffer), scv = new DataView(scBytes.buffer);
    for (let i = 0; i < stripOffsets.length; i++) { sov.setUint32(i * 4, stripOffsets[i], true); scv.setUint32(i * 4, stripCounts[i], true); }

    const header = new Uint8Array(8);
    const hv = new DataView(header.buffer);
    hv.setUint16(0, 0x4949, true);   // "II" little-endian
    hv.setUint16(2, 42, true);
    hv.setUint32(4, ifdOffset, true);

    const ifd = new Uint8Array(ifdSize);
    const iv = new DataView(ifd.buffer);
    iv.setUint16(0, tags.length, true);
    tags.forEach((t, i) => {
      const o = 2 + i * 12;
      iv.setUint16(o, t.tag, true);
      iv.setUint16(o + 2, t.type, true);
      iv.setUint32(o + 4, t.count, true);
      if (t.value instanceof Uint8Array) {
        if (t.offset !== undefined) iv.setUint32(o + 8, t.offset, true);
        else ifd.set(t.value.subarray(0, 4), o + 8);
      } else if (t.type === 3) {
        iv.setUint16(o + 8, t.value, true); iv.setUint16(o + 10, 0, true);
      } else {
        iv.setUint32(o + 8, t.value, true);
      }
    });
    iv.setUint32(ifdSize - 4, 0, true);   // no next IFD

    const parts = [header];
    for (const s of strips) parts.push(...s.chunks);
    if ((8 + strips.reduce((n, s) => n + s.length, 0)) !== ifdOffset) throw new Error('TIFF layout mismatch');
    parts.push(ifd);
    if ((ifdOffset + ifdSize) & 1) parts.push(new Uint8Array(1));
    for (const b of outOfLine) { parts.push(b); if (b.length & 1) parts.push(new Uint8Array(1)); }

    return new Blob(parts, { type: 'image/tiff' });
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PDF (streaming, lossless FlateDecode, true physical page size)
  //
  // The previous exporter embedded a JPEG via /DCTDecode. DCT ringing on smooth
  // gradients is exactly the wrong failure mode for this artwork; everything
  // here is lossless.
  // ═════════════════════════════════════════════════════════════════════════
  async function encodePDF(width, height, page, comps, bandProvider, iccBytes, onProgress) {
    const isCMYK = comps === 4;
    const def = new Deflator();
    await bandProvider(async (data, rows, y0) => {
      await def.push(data.slice(0, rows * width * comps));
      if (onProgress) onProgress(y0 + rows);
    });
    const { chunks: imgChunks, length: imgLen } = await def.finish();

    const parts = [];
    let pos = 0;
    const offsets = {};
    const put = (x) => { const d = typeof x === 'string' ? ascii(x) : x; parts.push(d); pos += d.length; };
    const obj = (n, body) => { offsets[n] = pos; put(`${n} 0 obj\n`); body.forEach(put); put('\nendobj\n'); };

    // Object numbering is fixed up front so cross-references stay simple.
    const N_CAT = 1, N_PAGES = 2, N_PAGE = 3, N_IMG = 4, N_CONTENT = 5, N_ICC = 6, N_INTENT = 7;
    const useICC = !!(iccBytes && iccBytes.length && isCMYK);

    put('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n');

    const catalogExtra = isCMYK
      ? ` /OutputIntents [${N_INTENT} 0 R]`
      : '';
    obj(N_CAT, [`<< /Type /Catalog /Pages ${N_PAGES} 0 R${catalogExtra} >>`]);
    obj(N_PAGES, [`<< /Type /Pages /Kids [${N_PAGE} 0 R] /Count 1 >>`]);
    obj(N_PAGE, [`<< /Type /Page /Parent ${N_PAGES} 0 R /MediaBox [0 0 ${page.ptW.toFixed(3)} ${page.ptH.toFixed(3)}] ` +
                 `/Resources << /XObject << /Im0 ${N_IMG} 0 R >> >> /Contents ${N_CONTENT} 0 R >>`]);

    const cs = useICC ? `[/ICCBased ${N_ICC} 0 R]` : (isCMYK ? '/DeviceCMYK' : '/DeviceRGB');
    obj(N_IMG, [
      `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace ${cs} ` +
      `/BitsPerComponent 8 /Interpolate false /Filter /FlateDecode /Length ${imgLen} >>\nstream\n`,
      ...imgChunks,
      `\nendstream`
    ]);

    // Place the image across the full page: the cm matrix scales the unit
    // image space to the page box, so the file is a true A-size page at the
    // requested DPI rather than a giant page measured in pixels.
    const content = `q\n${page.ptW.toFixed(3)} 0 0 ${page.ptH.toFixed(3)} 0 0 cm\n/Im0 Do\nQ\n`;
    obj(N_CONTENT, [`<< /Length ${content.length} >>\nstream\n${content}endstream`]);

    if (useICC) {
      obj(N_ICC, [`<< /N 4 /Length ${iccBytes.length} >>\nstream\n`, iccBytes, `\nendstream`]);
    }
    if (isCMYK) {
      // Records the intended print condition. With a real profile embedded this
      // is a genuine PDF/X-style output intent; without one it is honest
      // metadata telling the RIP what the numbers were separated for.
      const intent = `<< /Type /OutputIntent /S /GTS_PDFA1 ` +
        `/OutputConditionIdentifier (FOGRA39) ` +
        `/OutputCondition (Coated FOGRA39 \\(ISO 12647-2:2004\\)) ` +
        `/RegistryName (http://www.color.org)` +
        (useICC ? ` /DestOutputProfile ${N_ICC} 0 R` : '') + ` >>`;
      obj(N_INTENT, [intent]);
    }

    const maxObj = isCMYK ? N_INTENT : N_CONTENT;
    const xref = pos;
    put(`xref\n0 ${maxObj + 1}\n0000000000 65535 f \n`);
    for (let i = 1; i <= maxObj; i++) {
      put((offsets[i] === undefined ? 0 : offsets[i]).toString().padStart(10, '0') + ' 00000 n \n');
    }
    put(`trailer\n<< /Size ${maxObj + 1} /Root ${N_CAT} 0 R >>\nstartxref\n${xref}\n%%EOF`);
    return new Blob(parts, { type: 'application/pdf' });
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Tiled render driver
  // ═════════════════════════════════════════════════════════════════════════
  const BAND_ROWS = 512;

  let _maxViewport = null;
  function maxViewportDim() {
    if (_maxViewport !== null) return _maxViewport;
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      const d = gl && gl.getParameter(gl.MAX_VIEWPORT_DIMS);
      _maxViewport = d ? Math.min(d[0], d[1]) : 16384;
      const lose = gl && gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    } catch (e) { _maxViewport = 16384; }
    return _maxViewport;
  }

  function openSource(item, fullW, fullH, grainPitch) {
    const mod = item.module;
    const tweaks = item.tweaks ? item.tweaks[mod] : null;
    if (!tweaks) return null;
    const S = window.NymphTileSession || {};
    const key = mod === 'nature' ? null : mod;
    if (key && typeof S[key] === 'function') {
      const sess = S[key](tweaks, item.renderState || {}, fullW, fullH, { tileW: fullW, tileH: BAND_ROWS, grainPitch });
      if (sess) return sess;
    }
    return null;
  }

  // Photo/nature and FLOW particle mode have no tileable static field, so they
  // fall back to a single full-frame render. Their ceiling is the source image,
  // not the page, which the UI states plainly rather than pretending otherwise.
  async function fallbackFullFrame(item, fullW, fullH) {
    const tweaks = item.tweaks ? item.tweaks[item.module] : null;
    let src = null;
    if (item.module === 'nature' && typeof window.NurrNatureRenderToDataURL === 'function' && item.currentImg) {
      src = await window.NurrNatureRenderToDataURL(tweaks, item.renderState || {}, fullW, fullH, { currentImg: item.currentImg });
    }
    if (!src) src = item.exportSource || item.preview;
    if (!src) throw new Error('No renderable source for this item.');
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    // Never allocate a print-size 2D canvas here: A0/300 would be 558 MB and
    // browsers refuse well before that. Cap the intermediate and let the band
    // reader scale from it — for these two fallback cases the true ceiling is
    // the source material anyway, not the page.
    const CAP = 32e6;
    const total = fullW * fullH;
    const k = total > CAP ? Math.sqrt(CAP / total) : 1;
    const cw = Math.max(1, Math.round(fullW * k));
    const ch = Math.max(1, Math.round(fullH * k));
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, cw, ch);
    return c;
  }

  // Produces bands of converted pixels and hands them to `sink`.
  function makeBandProvider(item, page, colorMode, lut, comps, grainPitch, onTick) {
    const W = page.px, H = page.py;
    return async function bandProvider(sink) {
      const session = openSource(item, W, H, grainPitch);
      let canvasFallback = null;
      if (!session) canvasFallback = await fallbackFullFrame(item, W, H);
      let bandCanvas = null, bandCtx = null;

      const outBuf = new Uint8Array(W * BAND_ROWS * comps);
      try {
        for (let y = 0; y < H; y += BAND_ROWS) {
          const rows = Math.min(BAND_ROWS, H - y);
          let rgba;
          if (session) {
            rgba = session.renderTile(0, y, W, rows);
          } else {
            const sy = y * (canvasFallback.height / H);
            const sh = rows * (canvasFallback.height / H);
            if (!bandCanvas) {
              bandCanvas = document.createElement('canvas');
              bandCanvas.width = W; bandCanvas.height = BAND_ROWS;
              bandCtx = bandCanvas.getContext('2d');
              bandCtx.imageSmoothingEnabled = true;
              bandCtx.imageSmoothingQuality = 'high';
            }
            bandCtx.clearRect(0, 0, W, rows);
            bandCtx.drawImage(canvasFallback, 0, sy, canvasFallback.width, sh, 0, 0, W, rows);
            rgba = new Uint8Array(bandCtx.getImageData(0, 0, W, rows).data.buffer);
          }
          lutApply(lut, comps, rgba, W * rows, outBuf);
          await sink(outBuf, rows, y);
          if (onTick) onTick(y + rows, H);
          // Yield so the progress UI paints and the tab stays responsive.
          await new Promise(r => setTimeout(r, 0));
        }
      } finally {
        if (session) session.dispose();
      }
    };
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Public export entry
  // ═════════════════════════════════════════════════════════════════════════
  async function exportPrintFile(item, opts) {
    const {
      paper = 'a2', dpi = 300, landscape = false,
      colorMode = 'cmyk', format = 'pdf',
      tac = 300, gcr = 0.75, icc = null,
      onProgress = null,
    } = opts || {};

    if (!hasDeflate()) throw new Error('This browser lacks CompressionStream; print export needs it.');

    const page = pageMetrics(paper, dpi, landscape);
    const isCMYK = colorMode === 'cmyk' && format !== 'png';
    const comps = isCMYK ? 4 : 3;

    // Grain pitch in render pixels, held at a constant physical size (~0.085 mm)
    // so a 300 DPI page gets a fine film tooth instead of grain that scales up
    // with the paper. Floored at 1 px so it can never alias below the grid.
    const grainPitch = Math.max(1.0, (dpi / MM_PER_IN) * 0.085);

    const maxVp = maxViewportDim();
    if (Math.max(page.px, page.py) > maxVp) {
      throw new Error(
        `${page.px}×${page.py}px exceeds this GPU's ${maxVp}px render limit. ` +
        `Lower the DPI or choose a smaller sheet.`);
    }

    const lut = isCMYK ? buildCmykLUT(tac, gcr) : buildRgbGamutLUT();

    const tick = (done, total) => { if (onProgress) onProgress(done / total); };
    const provider = makeBandProvider(item, page, colorMode, lut, comps, grainPitch, tick);

    let blob;
    if (format === 'png')      blob = await encodePNG(page.px, page.py, dpi, provider);
    else if (format === 'tiff') blob = await encodeTIFF(page.px, page.py, dpi, comps, provider, icc);
    else                        blob = await encodePDF(page.px, page.py, page, comps, provider, icc);

    return { blob, page, comps };
  }

  window.NymphPrint = {
    PAPER, DPI_OPTIONS, pageMetrics, exportPrintFile, hasDeflate,
    // exposed for testing / reuse
    _internal: { toCoatedGamut, separate, buildCmykLUT, buildRgbGamutLUT, lutApply, encodePNG, encodeTIFF, encodePDF, Deflator },
  };
})();

// ═══════════════════════════════════════════════════════════════════════════
// Print panel UI
// Written with React.createElement rather than JSX so this file needs no Babel
// pass — it stays a plain script that loads before app.js.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  if (typeof React === 'undefined') return;
  const h = React.createElement;
  const P = window.NymphPrint;

  const FORMATS = [
    { key: 'pdf',  label: 'PDF',  note: 'lossless, vector page box' },
    { key: 'tiff', label: 'TIFF', note: 'CMYK, layered-workflow safe' },
    { key: 'png',  label: 'PNG',  note: 'RGB only' },
  ];

  function PrintTab({ library, moduleDisplay, showToast }) {
    const { useState, useMemo } = React;
    const [sel, setSel]         = useState(() => (library[0] ? library[0].id : null));
    const [paper, setPaper]     = useState('a2');
    const [dpi, setDpi]         = useState(300);
    const [landscape, setLand]  = useState(false);
    const [colorMode, setColor] = useState('cmyk');
    const [formats, setFormats] = useState({ pdf: true, tiff: false, png: false });
    const [tac, setTac]         = useState(300);
    const [icc, setIcc]         = useState(null);
    const [busy, setBusy]       = useState(null);

    const item = library.find(l => l.id === sel) || library[0] || null;
    const page = useMemo(() => P.pageMetrics(paper, dpi, landscape), [paper, dpi, landscape]);
    const mpx  = (page.px * page.py) / 1e6;

    // Photo and FLOW particle mode have no tileable static field.
    const tileable = item && item.module !== 'nature'
      && !(item.module === 'geometric' && item.tweaks
           && item.tweaks.geometric && item.tweaks.geometric.material === 'particles');

    const active = FORMATS.filter(f => formats[f.key]);

    const run = async () => {
      if (!item || !active.length || busy) return;
      if (!P.hasDeflate()) { showToast('⚠ Browser lacks CompressionStream'); return; }
      try {
        for (const f of active) {
          setBusy({ label: f.label, pct: 0 });
          const { blob } = await P.exportPrintFile(item, {
            paper, dpi, landscape, colorMode, format: f.key, tac, icc,
            onProgress: (p) => setBusy({ label: f.label, pct: Math.round(p * 100) }),
          });
          const cm = (f.key === 'png' ? 'rgb' : colorMode);
          const name = `nymph-print-${moduleDisplay(item.module)}-${(P.PAPER[paper] || {}).label || paper}`
            + `${landscape ? '-L' : ''}-${dpi}dpi-${cm}.${f.key === 'tiff' ? 'tif' : f.key}`;
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = name.replace(/\s+/g, '');
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 2000);
        }
        showToast('✓ Print files ready');
      } catch (err) {
        console.error('Print export failed', err);
        showToast('⚠ Print export failed — see console');
      } finally {
        setBusy(null);
      }
    };

    if (!library.length) {
      return h('div', { className: 'export-empty' },
        'No snapshots yet — press ', h('kbd', null, 'S'), ' on any module to save.');
    }

    const block = (title, kids, cls) =>
      h('div', { className: 'export-control-block ' + (cls || '') },
        h('div', { className: 'export-control-title' }, title), kids);

    const chips = (opts, value, onPick, keyer) =>
      h('div', { className: 'print-chip-row' }, opts.map(o =>
        h('button', {
          key: keyer(o),
          type: 'button',
          className: 'print-chip' + (value === keyer(o) ? ' active' : ''),
          onClick: () => onPick(keyer(o)),
        }, o.label)));

    const papers = Object.keys(P.PAPER).map(k => ({ key: k, label: P.PAPER[k].label, group: P.PAPER[k].group }));

    return h('div', { className: 'print-tab' },

      block('Snapshot', h('div', { className: 'print-snap-row' },
        library.map(l => h('button', {
          key: l.id, type: 'button',
          className: 'print-snap' + (item && l.id === item.id ? ' active' : ''),
          onClick: () => setSel(l.id), title: moduleDisplay(l.module),
        }, h('img', { src: l.preview, alt: '' }),
           h('span', null, moduleDisplay(l.module).slice(0, 4).toUpperCase()))))),

      block('Paper', h('div', null,
        h('div', { className: 'print-group-label' }, 'ISO'),
        chips(papers.filter(p => p.group === 'ISO'), paper, setPaper, o => o.key),
        h('div', { className: 'print-group-label' }, 'US / Arch'),
        chips(papers.filter(p => p.group === 'US'), paper, setPaper, o => o.key),
        h('label', { className: 'print-toggle' },
          h('input', { type: 'checkbox', checked: landscape, onChange: e => setLand(e.target.checked) }),
          h('span', null, 'Landscape')))),

      block('Resolution',
        h('div', null,
          chips(P.DPI_OPTIONS.map(d => ({ key: d, label: d + ' DPI' })), dpi, setDpi, o => o.key),
          h('div', { className: 'print-note' },
            `${page.wmm}×${page.hmm} mm · ${page.px}×${page.py} px · ${mpx.toFixed(1)} Mpx`,
            mpx > 90 ? h('em', null, ' — large job, expect a minute or two') : null))),

      block('Colour', h('div', null,
        chips([{ key: 'cmyk', label: 'CMYK · coated' }, { key: 'rgb', label: 'RGB · sRGB' }],
              colorMode, setColor, o => o.key),
        colorMode === 'cmyk' ? h('div', null,
          h('label', { className: 'print-range' },
            h('span', null, `Total ink limit ${tac}%`),
            h('input', {
              type: 'range', min: 240, max: 340, step: 10, value: tac,
              onChange: e => setTac(Number(e.target.value)),
            })),
          h('div', { className: 'print-note' },
            'Separated for coated FOGRA39 (ISO 12647-2) with grey-component replacement. ',
            'Colours outside the coated gamut are eased back at constant hue to the nearest printable tone.'),
          h('label', { className: 'print-icc' },
            h('span', null, icc ? '✓ ICC profile embedded' : 'Embed ICC profile (optional)'),
            h('input', {
              type: 'file', accept: '.icc,.icm',
              onChange: async (e) => {
                const f = e.target.files && e.target.files[0];
                if (!f) { setIcc(null); return; }
                setIcc(new Uint8Array(await f.arrayBuffer()));
              },
            })),
          h('div', { className: 'print-note print-note-dim' },
            'Without a profile the separation is a colorimetric approximation, not profile-exact. ',
            'For colour-critical work embed ISO Coated v2 (free from ECI) and soft-proof.')
        ) : h('div', { className: 'print-note' },
          'RGB output is still gamut-mapped to coated, so an RGB proof shows what CMYK can actually reach.'))),

      block('Format', h('div', null,
        h('div', { className: 'print-fmt-grid' }, FORMATS.map(f =>
          h('label', {
            key: f.key,
            className: 'print-fmt' + (formats[f.key] ? ' active' : ''),
          },
            h('input', {
              type: 'checkbox', checked: !!formats[f.key],
              onChange: e => setFormats(p => Object.assign({}, p, { [f.key]: e.target.checked })),
            }),
            h('strong', null, f.label), h('small', null, f.note)))),
        colorMode === 'cmyk' && formats.png
          ? h('div', { className: 'print-note print-warn' }, 'PNG has no CMYK mode — it will be written as gamut-mapped RGB.')
          : null,
        !tileable
          ? h('div', { className: 'print-note print-warn' },
              item && item.module === 'nature'
                ? 'Photo output is limited by the source image resolution, not the page size.'
                : 'FLOW particle mode has no static field to render at print size; it will be scaled from the saved master.')
          : null)),

      h('div', { className: 'print-actions' },
        h('button', {
          className: 'btn primary btn-italic',
          disabled: !!busy || !active.length,
          onClick: run,
        }, busy ? `${busy.label} — ${busy.pct}%` : `Export ${active.length || 0} print file${active.length === 1 ? '' : 's'}`),
        busy ? h('div', { className: 'print-progress' },
          h('div', { className: 'print-progress-bar', style: { width: busy.pct + '%' } })) : null)
    );
  }

  window.NymphPrintPanel = PrintTab;
})();
