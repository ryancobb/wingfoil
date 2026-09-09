import test from 'node:test';
import assert from 'node:assert/strict';
import { renderQuality } from '../src/graphics/render-quality.js';

test('software renderers stay within the pixel budget across desktop, retina and rotation', () => {
  for (const name of ['ANGLE (Google, SwiftShader Device)', 'llvmpipe (LLVM 15)', 'Microsoft Basic Render Driver']) {
    const quality = renderQuality(name);
    assert.equal(quality.software, true);
    for (const [width, height, density] of [[1280, 900, 1], [390, 844, 2], [844, 390, 2], [3840, 2160, 2]]) {
      const ratio = quality.pixelRatio(width, height, density);
      assert.ok(Math.floor(width * ratio) * Math.floor(height * ratio) <= 160000);
      assert.ok(ratio > 0 && ratio <= density);
    }
  }
});

test('hardware and unavailable renderer metadata retain the normal quality settings', () => {
  for (const name of ['ANGLE (Apple, Apple M3)', 'ANGLE (Qualcomm, Adreno 740)', '']) {
    const quality = renderQuality(name);
    assert.equal(quality.software, false);
    assert.equal(quality.pixelRatio(1280, 900, 2), 1.7);
    assert.equal(quality.pixelRatio(390, 844, 1), 1);
    assert.equal(quality.shadowSize, 1024);
    assert.equal(quality.reflectionSize, 128);
  }
});
