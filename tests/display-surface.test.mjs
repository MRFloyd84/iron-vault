import test from 'node:test';
import assert from 'node:assert/strict';
import { drawDisplaySurface } from '../lib/display-surface.ts';
import { createCanvas } from './canvas-fixture.mjs';

test(
  'scanlines darken actual display pixels while the gaps remain legible',
  { skip: !createCanvas },
  () => {
    const c = createCanvas(960, 720).getContext('2d');
    c.fillStyle = 'white';
    c.fillRect(0, 0, 960, 720);
    drawDisplaySurface(c, 0, true);
    const line = c.getImageData(100, 0, 1, 1).data,
      gap = c.getImageData(100, 7, 1, 1).data;
    assert.ok(line[1] < gap[1] - 40);
    assert.equal(gap[1], 255);
    assert.equal(line[3], 255);
  },
);
test(
  'HUD remains transparent and reduced motion produces identical pixels',
  { skip: !createCanvas },
  () => {
    const c = createCanvas(640, 480).getContext('2d');
    c.fillStyle = '#b5f591';
    c.fillRect(100, 100, 200, 50);
    drawDisplaySurface(c, 0, true);
    assert.equal(c.getImageData(0, 0, 1, 1).data[3], 0);
    const make = (t) => {
      const x = createCanvas(640, 480).getContext('2d');
      x.fillStyle = 'white';
      x.fillRect(0, 0, 640, 480);
      drawDisplaySurface(x, t, true);
      return x.getImageData(0, 0, 640, 480).data;
    };
    assert.deepEqual(make(0), make(5));
  },
);
test(
  'camera overlay paints scanlines over the live image and flicker changes pixels',
  { skip: !createCanvas },
  () => {
    const c = createCanvas(960, 720).getContext('2d');
    drawDisplaySurface(c, 0, true, 6, true);
    assert.ok(c.getImageData(100, 0, 1, 1).data[3] > 0);
    assert.equal(c.getImageData(100, 7, 1, 1).data[3], 0);
    const make = (t) => {
      const x = createCanvas(960, 720).getContext('2d');
      x.fillStyle = 'white';
      x.fillRect(0, 0, 960, 720);
      drawDisplaySurface(x, t, false);
      return x.getImageData(0, 0, 960, 720).data;
    };
    assert.notDeepEqual(make(0), make(0.5));
  },
);
