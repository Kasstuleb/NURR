// texture-engine.js — isolated surface state for NURR renderers.
// Chromatic haze and Pixelate are intentionally separated:
// - chroma uses u_chroma* uniforms and never alters the UV grid.
// - pixelate is the only preset that can enable the pixel prepass.
(function(){
  function clamp01(v, fallback){
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(1, n));
  }
  function list(){ return window.NURR_TEXTURE_PRESETS || []; }
  function byId(id){ return list().find(p => p.id === id) || list().find(p => p.id === 'clean') || list()[0] || null; }
  function isKnownSurface(id){ return !!list().find(p => p.id === id); }
  function toUniforms(tweaks){
    const requestedPresetId = (tweaks && tweaks.texturePreset) || 'clean';
    const presetId = isKnownSurface(requestedPresetId) ? requestedPresetId : 'clean';
    const preset = byId(presetId) || { id:'clean', mode:0, amount:0, scale:0.45, softness:0.5, distortion:0 };
    const seed = Number.isFinite(+tweaks?.textureSeed) ? +tweaks.textureSeed : 0.413;
    const rawAmount = Number.isFinite(+tweaks?.textureAmount) ? +tweaks.textureAmount : preset.amount;

    const isPixelate = preset.id === 'print-noise';
    const isChroma = preset.id === 'chromatic-haze';

    return {
      preset,
      // Legacy texture mode is now reserved for non-chroma/non-pixel surfaces.
      // Pixelate still uses mode 5 for its colour quantisation, but only when
      // u_pixelateEnabled is also true. Chroma never uses this path.
      mode: (isPixelate || isChroma || preset.id === 'clean') ? 0 : (preset.mode || 0),
      amount: isPixelate ? clamp01(rawAmount, preset.amount || 0.45) : (isChroma ? 0 : clamp01(rawAmount, preset.amount || 0)),
      scale: Number.isFinite(+tweaks?.textureScale) ? +tweaks.textureScale : (preset.scale ?? 0.45),
      softness: preset.softness ?? 0.5,
      distortion: preset.distortion ?? 0,
      seed,
      pixelateEnabled: isPixelate ? 1 : 0,
      pixelateAmount: isPixelate ? clamp01(rawAmount, preset.amount || 0.44) : 0,
      pixelateScale: isPixelate ? (Number.isFinite(+tweaks?.textureScale) ? +tweaks.textureScale : (preset.scale ?? 0.62)) : 0.62,
      chromaEnabled: isChroma ? 1 : 0,
      // Cap chroma below full strength. Above this range the prism pass can
      // posterize on some WebGL/GPU combinations and look like broken blocks.
      chromaAmount: isChroma ? Math.min(0.62, clamp01(rawAmount, preset.amount || 0.56)) : 0,
      chromaSeed: seed,
      image: preset.image || null,
      blend: preset.blend || null
    };
  }
  function applyPresetToTweaks(preset, current){
    if (!preset) return {};
    const id = preset.id;
    return {
      texturePreset: id,
      textureAmount: id === 'clean' ? 0 : (id === 'chromatic-haze' ? Math.min(0.56, preset.amount ?? 0.56) : (id === 'print-noise' ? (preset.amount ?? 0.44) : preset.amount)),
      // Reset scale on every surface switch. Pixelate is the only preset that
      // uses scale as grid size; chroma uses its own uniforms and must never
      // inherit a previous pixel-grid value.
      textureScale: id === 'print-noise' ? (preset.scale ?? 0.62) : (id === 'chromatic-haze' ? 0.45 : (preset.scale ?? 0.45)),
      textureSeed: Math.random()
    };
  }
  window.NurrTextureEngine = { list, byId, toUniforms, applyPresetToTweaks, isKnownSurface };
})();
