// texture-presets.js — shared NURR surface presets.
// Minimal surface set: Clean / Chromatic haze / Pixelate. Texture image presets are paused for now.
(function(){
  window.NURR_TEXTURE_PRESETS = [
    { id:'clean', name:'Clean', mode:0, amount:0.0, scale:0.45, softness:0.45, distortion:0.0, access:'free' },
    { id:'chromatic-haze', name:'Chromatic haze', mode:4, amount:0.26, scale:0.48, softness:0.76, distortion:0.14, access:'experimental' },
    { id:'print-noise', name:'Pixelate', mode:5, amount:0.12, scale:0.30, softness:0.88, distortion:0.0, access:'experimental' }
  ];
})();
