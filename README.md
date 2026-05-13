# NURR — Wallpaper Studio

Four generative wallpaper modes. Brutalist-editorial aesthetic.

---

## Quick start

> **JSX modules require an HTTP server.** Opening `index.html` via `file://` will block the external script loads (browser CORS restriction). One command is all you need:

```bash
npx serve .
# or
python -m http.server 8000
```

Then open `http://localhost:3000` (serve) or `http://localhost:8000`.

---

## File structure

```
index.html          ← Entry point. Only loads CSS + scripts. Edit this rarely.
css/
  nurr.css          ← All styles. Edit freely for visual tweaks.
js/
  helpers.js        ← Shared utilities (WebGL, color math, hooks). Plain JS — no Babel.
  palette.js        ← NurrPaletteEditor component.
  gradient.js       ← Mode 1: Gradient field (WebGL).
  geometric.js      ← Mode 2: Brutalist compositions (Canvas 2D).
  nature.js         ← Mode 3: Photo with effects (Canvas 2D).
  abstract.js       ← Mode 4: Abstract poster generator (Canvas 2D).
  app.js            ← App shell: panel, history, collection, keyboard shortcuts.
nature/
  manifest.json     ← List your photo filenames here (see below).
  01.jpg            ← Drop your photos here (any name).
```

---

## Adding permanent photos (Photo mode)

1. Drop your images into `nature/`
2. Edit `nature/manifest.json`:

```json
["01.jpg", "portrait.webp", "landscape.png"]
```

That's it. Restart the server and the images auto-load.

**Alternatively**: just drag-and-drop images onto the Photo mode placeholder card — they load immediately as session-only photos without touching any files.

---

## Keyboard shortcuts

| Key       | Action               |
|-----------|----------------------|
| `1–4`     | Switch mode          |
| `S`       | Save 4K PNG          |
| `H`       | Toggle panel         |
| `⌘Z / CtrlZ` | Undo              |

---

## Editing workflow

Each `js/` file is self-contained and hot-reloads on page refresh:

- **Tweak a formation**: edit `abstract.js` → `renderFormation()` switch block
- **Add a composition**: add an entry to `GEOMETRIC_COMPOSITIONS` in `geometric.js`
- **Change palette presets**: edit `PALETTE_PRESETS` in `helpers.js`
- **Restyle the panel**: edit `css/nurr.css`
- **Add a photo effect**: add a case to the `effect` switch in `nature.js`
