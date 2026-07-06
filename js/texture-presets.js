// texture-presets.js — shared NURR surface presets.
// Clean / Chromatic Haze / Pixelate are separate states; chroma is not a texture mode.
(function(){
  window.NURR_TEXTURE_PRESETS = [
    { id:'clean', name:'Clean', mode:0, amount:0.0, scale:0.45, softness:0.45, distortion:0.0, access:'free' },
    { id:'chromatic-haze', name:'Chromatic haze', mode:0, amount:0.56, scale:0.45, softness:0.86, distortion:0.0, access:'experimental' },
    { id:'print-noise', name:'Pixelate', mode:5, amount:0.44, scale:0.62, softness:0.88, distortion:0.0, access:'experimental' }
  ];
})();
