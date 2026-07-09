/* ─────────────────────────────────────────────────────────────────────────────
   nymph  js/mobile.js  —  adaptive chrome ink

   Historical note: this file used to carry a responsive-UI layer (an
   `is-mobile-ui` body class, a `--nurr-vh` unit, and a drag handle that turned
   the desktop side panel into a bottom sheet). All three are dead. Nothing in
   the CSS reads `is-mobile-ui` or `--nurr-vh` any more, and the phone UI is a
   separate component (`.nymph-m`) with its own stylesheet. Carrying that code
   only kept a bug alive: at viewport heights under 650px the old mobile.css
   drawer rules fired on *desktop* and slid the panel off-screen. Both are gone.

   What remains is one job, done properly.

   ── Adaptive chrome ink ────────────────────────────────────────────────────
   The logo and the module rail sit directly on the artwork with no plate
   behind them. Whether their glyphs should be black or white depends on what
   is actually behind *them* — not on some other corner of the canvas.

   The previous system took a single luminance probe from underneath the side
   panel (top right) and used it to colour the logo (top left). Over any piece
   with a bright corner and a dark one it guessed wrong about half the time.
   Its hysteresis band (0.30 → 0.74) was also so wide that mid-tone backdrops
   never flipped at all.

   This sampler:

     1. Draws the whole stage once per tick into a small offscreen buffer and
        reads it back once. One `getImageData` per tick, not one per element —
        WebGL readbacks stall the GPU, so we pay for exactly one.
     2. Converts that buffer to relative luminance through a 256-entry LUT.
     3. For each piece of chrome, averages the luminance of the buffer region
        that lies behind it, plus a small margin (what the eye actually reads
        the glyph against).
     4. Chooses ink at the WCAG black-vs-white crossover — relative luminance
        0.1791, nudged to 0.20 so that flat mid-grey resolves to black ink —
        with a tight ±0.05 hysteresis so it settles without going deaf.
     5. Derives a `--halo` from the local luminance *spread* and from how close
        the mean sits to the crossover. The stylesheet turns that into a
        counter-toned glow. Busy or ambiguous backdrops get more separation.
        No plate, no background, no box.

   Writes: `data-ink` + inline `--halo` on `.nurr-brand`, each `.rail-item`,
   and `.panel`; `data-ink` on `.rail`; `data-panel-ink` on <body>, which every
   glass surface reads for its veil and ink channels.
   ───────────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  /* Buffer resolution. 192×120 keeps a 116px-wide logo at roughly 13×4 samples
     on a 1440×900 stage — enough for a stable mean and a usable spread — while
     a single readback stays under 25k pixels. */
  const BW = 192;
  const BH = 120;

  /* WCAG crossover between black and white text sits at relative luminance
     0.1791. Biased very slightly up so flat mid-grey (#808080, L≈0.216)
     resolves to black ink, which reads better on photographic backdrops. */
  const CROSSOVER = 0.20;
  const HYSTERESIS = 0.05;

  /* ~10 samples a second: fast enough to track an animating shader, far
     cheaper than the old per-frame readback. */
  const INTERVAL_MS = 96;

  /* sRGB channel → linear, precomputed. */
  const LIN = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  const probe = document.createElement('canvas');
  probe.width = BW;
  probe.height = BH;
  const pctx = probe.getContext('2d', { willReadFrequently: true });

  /* Luminance and alpha planes for the current tick. */
  const lum = new Float32Array(BW * BH);
  const alpha = new Float32Array(BW * BH);

  /* Last ink decision per element, so hysteresis has something to hold. */
  const inkState = new WeakMap();

  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

  /* The live artwork surface. WebGL modules paint `canvas.stage`; the photo
     module can fall back to an <img>. Either is drawable. */
  function artworkSource() {
    const stage = document.querySelector('canvas.stage');
    if (stage && stage.width > 0 && stage.height > 0) return stage;
    const img = document.querySelector('.nature-fallback-img');
    if (img && img.naturalWidth > 0) return img;
    return null;
  }

  /* One draw, one read, one luminance pass. Returns the stage's viewport rect
     so element rects can be mapped into buffer space. */
  function grab(src) {
    const rect = src.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return null;

    pctx.clearRect(0, 0, BW, BH);
    pctx.drawImage(src, 0, 0, BW, BH);

    const data = pctx.getImageData(0, 0, BW, BH).data;
    for (let i = 0, p = 0; p < lum.length; i += 4, p++) {
      const a = data[i + 3] / 255;
      alpha[p] = a;
      lum[p] = a < 0.1
        ? 0
        : 0.2126 * LIN[data[i]] + 0.7152 * LIN[data[i + 1]] + 0.0722 * LIN[data[i + 2]];
    }
    return rect;
  }

  /* Mean luminance + standard deviation for the buffer region behind `rect`.
     `pad` widens the probe by that many CSS pixels on every side. */
  function measure(stageRect, rect, pad) {
    const sx = BW / stageRect.width;
    const sy = BH / stageRect.height;

    let x0 = Math.floor((rect.left - pad - stageRect.left) * sx);
    let y0 = Math.floor((rect.top - pad - stageRect.top) * sy);
    let x1 = Math.ceil((rect.right + pad - stageRect.left) * sx);
    let y1 = Math.ceil((rect.bottom + pad - stageRect.top) * sy);

    x0 = Math.max(0, Math.min(BW - 1, x0));
    y0 = Math.max(0, Math.min(BH - 1, y0));
    x1 = Math.max(x0 + 1, Math.min(BW, x1));
    y1 = Math.max(y0 + 1, Math.min(BH, y1));

    let sum = 0;
    let sumSq = 0;
    let count = 0;
    for (let y = y0; y < y1; y++) {
      const row = y * BW;
      for (let x = x0; x < x1; x++) {
        const p = row + x;
        if (alpha[p] < 0.1) continue;
        const l = lum[p];
        sum += l;
        sumSq += l * l;
        count++;
      }
    }
    if (!count) return null;

    const mean = sum / count;
    const variance = Math.max(0, sumSq / count - mean * mean);
    return { mean, spread: Math.sqrt(variance) };
  }

  /* Halo strength: how hard the counter-glow has to work.
       · noise     — a busy backdrop needs more separation than a flat one.
       · ambiguity — the closer the mean sits to the crossover, the less any
                     single ink choice can be trusted on its own. */
  function haloFor(mean, spread) {
    const noise = clamp01(spread * 3.4);
    const ambiguity = clamp01(1 - Math.abs(mean - CROSSOVER) / 0.22);
    return Math.round(clamp01(0.20 + noise * 0.55 + ambiguity * 0.42) * 100) / 100;
  }

  /* Sticky ink decision with a tight band around the crossover. */
  function decide(el, mean) {
    const prev = inkState.get(el);
    let next;
    if (prev === 'dark') next = mean < CROSSOVER - HYSTERESIS ? 'light' : 'dark';
    else if (prev === 'light') next = mean > CROSSOVER + HYSTERESIS ? 'dark' : 'light';
    else next = mean > CROSSOVER ? 'dark' : 'light';
    inkState.set(el, next);
    return next;
  }

  function paint(el, stageRect, pad) {
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return null;

    const m = measure(stageRect, rect, pad);
    if (!m) return null;

    const ink = decide(el, m.mean);
    if (el.dataset.ink !== ink) el.dataset.ink = ink;
    el.style.setProperty('--halo', String(haloFor(m.mean, m.spread)));
    return ink;
  }

  let lastTick = 0;
  let raf = 0;

  function tick(now) {
    raf = requestAnimationFrame(tick);
    if (now - lastTick < INTERVAL_MS) return;
    lastTick = now;

    if (document.hidden) return;
    if (document.body.classList.contains('nymph-landing-active')) return;

    const logo = document.querySelector('.nurr-brand, .nurr-brand-button');
    const rail = document.querySelector('.rail');
    const panel = document.querySelector('.panel');

    /* On phones every one of these is display:none, which collapses the rect
       to zero. (`offsetParent` is not a safe test here: it is null for any
       position:fixed element, and the chrome has been both across versions.) */
    const shown = el => !!el && el.getBoundingClientRect().width > 2;
    if (!shown(logo) && !shown(rail) && !shown(panel)) return;

    const src = artworkSource();
    if (!src || !pctx) return;

    try {
      const stageRect = grab(src);
      if (!stageRect) return;

      /* Logo — generous pad; it is a large mark drawn in thin strokes. */
      paint(logo, stageRect, 10);

      /* Rail items — each label reads against its own slice of artwork. */
      let dark = 0;
      let total = 0;
      document.querySelectorAll('.rail-item').forEach(item => {
        const ink = paint(item, stageRect, 8);
        if (ink) { total++; if (ink === 'dark') dark++; }
      });

      /* The hairline under the rail spans every item, so it takes the majority
         vote rather than a probe of its own two-pixel strip. */
      if (rail && total) {
        const ink = dark * 2 >= total ? 'dark' : 'light';
        if (rail.dataset.ink !== ink) rail.dataset.ink = ink;
      }

      /* Panel — one probe under the glass drives every glass surface: side
         panel, colour picker, export window, placeholder card. */
      if (shown(panel)) {
        const ink = paint(panel, stageRect, 0);
        if (ink && document.body.dataset.panelInk !== ink) {
          document.body.dataset.panelInk = ink;
        }
      }
    } catch (err) {
      /* A tainted or not-yet-painted surface: hold the last good decision. */
    }
  }

  function start() {
    if (raf) return;
    lastTick = 0;
    raf = requestAnimationFrame(tick);
  }
  function stop() {
    if (!raf) return;
    cancelAnimationFrame(raf);
    raf = 0;
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop(); else start();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
