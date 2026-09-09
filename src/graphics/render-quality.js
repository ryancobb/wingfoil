// Software WebGL has no GPU to absorb the per-pixel cost of the ocean shaders.
// Keep the CSS viewport and scene intact while bounding its drawing-buffer work.
export function renderQuality(rendererName = '') {
  const software = /swiftshader|llvmpipe|softpipe|software rasterizer|microsoft basic render/i.test(rendererName);
  return {
    software,
    shadowSize: software ? 512 : 1024,
    reflectionSize: software ? 64 : 128,
    pixelRatio(width, height, density) {
      const ratio = Math.min(density, 1.7);
      return software ? Math.min(ratio, Math.sqrt(160000 / Math.max(1, width * height))) : ratio;
    },
  };
}
