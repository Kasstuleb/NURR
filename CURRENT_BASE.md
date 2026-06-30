# NYMPH — Frozen CSS Ownership Base

Date: 2026-06-29  
Version label: `20260629-css-ownership-base`

## Purpose

This base exists to make the current generator safer to customize before landing-page work.

This pass is **not** a redesign pass and **not** a feature pass. The goal was CSS ownership: moving module-specific and control-specific styling out of global files so future visual finetuning can happen in predictable places.

Palette, 3D, and Studio-related work are intentionally preserved even where they are not visible in the current menu. They should not be treated as abandoned code.

## Confirmed loaded CSS files

1. `https://use.typekit.net/uib5hvg.css`
2. `css/base.css?v=20260629-css-ownership`
3. `css/nav-v2.css?v=20260629-css-ownership`
4. `css/mobile.css?v=20260629-css-ownership`
5. `css/nurr-panels.css?v=20260629-css-ownership`
6. `css/nurr-panel-design.css?v=20260629-css-ownership`
7. `css/nymph-liquid-system.css?v=20260629-css-ownership`
8. `css/panel-controls.css?v=20260629-css-ownership`
9. `css/gradient.css?v=20260629-css-ownership`
10. `css/geometric.css?v=20260629-css-ownership`
11. `css/glass3d.css?v=20260629-css-ownership`
12. `css/abstract.css?v=20260629-css-ownership`
13. `css/palette.css?v=20260629-css-ownership`
14. `css/export-panel-isolated.css?v=20260629-css-ownership`
15. `css/panel-state-clean.css?v=20260629-css-ownership`
16. `css/color-picker.css?v=20260629-css-ownership`

## Confirmed loaded JS files

1. `https://unpkg.com/react@18.3.1/umd/react.development.js`
2. `https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js`
3. `https://unpkg.com/@babel/standalone@7.29.0/babel.min.js`
4. `https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js`
5. `js/helpers.js?v=v16-interaction-lock`
6. `js/palette.js?v=20260628_recent_chroma_final`
7. `js/gradient-curated-palettes.js?v=v16-interaction-lock`
8. `js/texture-presets.js?v=20260628-chroma-reference`
9. `js/texture-engine.js?v=20260628_recent_chroma_final`
10. `js/gradient.js?v=20260628_recent_chroma_final`
11. `https://unpkg.com/three@0.160.0/build/three.min.js`
12. `js/glass3d-renderer.js?v=opal-body-swatches-1`
13. `js/geometric.js?v=v16-interaction-lock`
14. `js/glass3d-mode.js?v=opal-body-swatches-1`
15. `js/nature.js?v=v18-preserve-features-motion`
16. `js/abstract.js?v=20260628-abstract-form-ripple-clean`
17. `js/motion-export.js?v=20260624b-safari-video`
18. `js/app.js?v=20260625-export-dom-grid`
19. `js/mobile.js?v=v16-interaction-lock`

## CSS ownership after cleanup

### Global / structural CSS

- `css/base.css` — reset, tokens, root layout, brand/support strip, generic non-module base.
- `css/nav-v2.css` — header/navigation shell only.
- `css/mobile.css` — responsive/mobile rules.
- `css/nurr-panels.css` — panel structure and shared layout shell.
- `css/nurr-panel-design.css` — panel shell design layer only.
- `css/nymph-liquid-system.css` — liquid-glass panel system and shared panel material rules only.
- `css/panel-state-clean.css` — drag/collapse/state rules.

### Shared control CSS

- `css/panel-controls.css` — shared buttons, icon buttons, segment controls, swatches, help text, drop zones, nature thumbnails, generic reusable panel controls.

### Module CSS

- `css/gradient.css` — Gradient module, Gradient surface/texture cards, Gradient segment overrides, Chromatic Haze / Pixelate surface control styling.
- `css/abstract.css` — Abstract module, Ripple-related UI, glass-type controls, abstract formation controls.
- `css/geometric.css` — Geometric module, layout grid/cards/previews.
- `css/glass3d.css` — 3D module controls, material/shape/preset styling.
- `css/palette.css` — Palette module and palette cards/actions/presets.
- `css/export-panel-isolated.css` — export panel, snapshot drawer, snapshot preview, motion export UI, library/studio export-related UI.
- `css/color-picker.css` — colour picker, picking state, recent colours, picker-specific UI.

## What changed in this pass

- Added `css/panel-controls.css` for reusable panel controls that previously lived inside global CSS.
- Moved active module-specific CSS rules out of:
  - `css/base.css`
  - `css/nav-v2.css`
  - `css/nurr-panels.css`
  - `css/nurr-panel-design.css`
  - `css/nymph-liquid-system.css`
- Moved those rules into their owning module/control files without intentionally changing declaration values.
- Reordered CSS loading so shared/global styles load first and module/component ownership files load after them.
- Cleaned malformed/dead Abstract repair-comment debris from `css/nymph-liquid-system.css`.
- Updated cache-busting query strings in `index.html` to `20260629-css-ownership`.

## What was deliberately left untouched

- JS behaviour.
- Module navigation logic.
- Gradient behaviour.
- Chromatic Haze / Pixelate separation logic.
- Manual colour editing logic.
- Colour picker behaviour.
- Recent colours logic.
- Abstract module behaviour, including Ripple.
- Export panel behaviour.
- Sidepanel drag/collapse behaviour.
- Snapshot/export behaviour.
- Palette, 3D, and dormant Studio-related work.
- `js/palette-lab-mode.js` remains present but not loaded.
- `nurr-formula-sandbox-v10.html` remains present but not loaded.

## Checks run

- Confirmed loaded CSS/JS from `index.html`.
- Confirmed all CSS files parse through `tinycss2` without parser-level errors.
- Confirmed no active module-specific selectors remain in the global CSS files after stripping comments.
- Standard `node --check` is not valid for the JSX-bearing files because this app loads several files through Babel using `type="text/babel"`. Pure Node syntax checking reports JSX as `Unexpected token '<'`, which is expected for this structure and was not treated as a runtime error.

## Remaining architectural debt

- The app still uses runtime Babel in the browser. This is workable for the current local/prototype state, but not ideal for a final production build.
- CSS still contains historical comments and accumulated override sections inside some module files. They are now in better ownership locations, but the next CSS pass could compress duplicated rules inside each module.
- Palette and 3D are preserved but not currently presented as primary menu modules. Their CSS/JS remains available for later recovery.
- Studio-related selectors live mostly inside export/library UI ownership because there is no clean active Studio module entry in the current interface.

## Recommended next step for landing-page work

Create the landing page as a separate layer:

```text
index.html              landing / entry page
app.html                generator app
css/landing.css         landing-only styling
js/landing.js           landing-only interaction
```

Before adding the landing page, duplicate the current generator entry into `app.html`. Then convert `index.html` into the landing page and link into `app.html`.

Do not mix landing CSS into the generator CSS files.

## Regression repair — 2026-06-29

Added `css/regression-fixes.css` as a targeted post-migration correction layer.

Fixed:
- Photo module sidepanel disappearing behind the full-stage no-image placeholder overlay by giving the sidepanel an explicit stack level.
- Create-tab export buttons returning to one compact horizontal row for `1×1 / HD / 2K / 4K` and one full-width `Export panel` button below.
- Export matrix snapshot cell spacing so `Layer PNG` has a safe metadata column and does not overlap the thumbnail/name area.

Deliberately not changed:
- No JS behaviour changed.
- No module logic changed.
- No visual redesign beyond restoring unintended regressions.
- Palette / 3D / dormant files remain preserved.

Remaining note:
- This is still a regression-fix base. After Safari confirmation, functional fixes should come before intentional visual finetuning.


## 2026-06-29 regression repair follow-up

- Restored create/export sidepanel buttons to the original compact pill appearance after the CSS ownership migration.
- Kept the Photo module sidepanel stack fix.
- Kept export matrix overlap protection for snapshot metadata / Layer PNG.
- Changed the freeze instruction helper from a bordered card back to plain helper text.
- No JavaScript logic or feature behaviour changed.

## Regression repair v3 — 2026-06-29

- Corrected the sidepanel create/export buttons using the uploaded source zip as visual reference.
- Removed the prior overcorrection that forced 62px button heights. The restored controls use compact 31px minimum-height pills, matching the original cascade.
- Kept the Photo sidepanel z-index fix.
- Kept the export matrix overlap protection for snapshot metadata / Layer PNG chips.
- Kept the freeze instruction as plain helper text, not a bordered container.
