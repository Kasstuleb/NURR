// texture-engine.js — shared helpers for surface/material passes.
// This first version is intentionally small: it gives modules one stable way
// to read texture preset data without binding the UI to one renderer.
(function(){
  function list(){ return window.NURR_TEXTURE_PRESETS || []; }
  function byId(id){ return list().find(p => p.id === id) || list()[0] || null; }
  function toUniforms(tweaks){
    const preset = byId(tweaks && tweaks.texturePreset);
    const amount = Number.isFinite(+tweaks?.textureAmount) ? +tweaks.textureAmount : (preset ? preset.amount : 0);
    return {
      preset,
      mode: preset ? preset.mode : 0,
      amount: Math.max(0, Math.min(1, amount)),
      scale: preset ? preset.scale : 0.45,
      softness: preset ? preset.softness : 0.5,
      distortion: preset ? preset.distortion : 0,
      seed: Number.isFinite(+tweaks?.textureSeed) ? +tweaks.textureSeed : 0.413,
      image: preset ? preset.image : null,
      blend: preset ? preset.blend : null
    };
  }
  function applyPresetToTweaks(preset, current){
    if (!preset) return {};
    return {
      texturePreset: preset.id,
      textureAmount: preset.amount,
      textureSeed: current?.textureSeed ?? Math.random()
    };
  }
  window.NurrTextureEngine = { list, byId, toUniforms, applyPresetToTweaks };
})();
