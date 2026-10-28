import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { renderInstrument } from '../lib/instruments.ts';
import { initialState } from '../lib/machine.ts';

function context() {
  const images = [],
    texts = [];
  const c = new Proxy(
    {
      canvas: { width: 960, height: 720 },
      drawImage(...args) {
        images.push(args);
      },
      fillText(s) {
        texts.push(s);
      },
      measureText(s) {
        return { width: s.length * 12 };
      },
      createLinearGradient() {
        return { addColorStop() {} };
      },
      createRadialGradient() {
        return { addColorStop() {} };
      },
    },
    { get: (o, k) => (k in o ? o[k] : () => {}) },
  );
  return { c, images, texts };
}
test('structure atlas is derived from the currently shipped GLB with distinct front/rear projections', async () => {
  const root = new URL('../public/', import.meta.url),
    meta = JSON.parse(
      fs.readFileSync(new URL('instruments/mech-structure-atlas.json', root), 'utf8'),
    );
  const source = fs.readFileSync(new URL(meta.source, root));
  assert.equal(meta.sourceSha256, crypto.createHash('sha256').update(source).digest('hex'));
  assert.equal(meta.triangleCount, 319680);
  assert.deepEqual(meta.columns, ['base', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg']);
  const { data, info } = await sharp(new URL('instruments/mech-structure-atlas.png', root).pathname)
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 2560);
  assert.equal(info.height, 1024);
  assert.equal(info.channels, 4);
  const centroids = [];
  for (let row = 0; row < 2; row++) {
    const sums = Array.from({ length: 5 }, () => ({ count: 0, x: 0 }));
    for (let y = 0; y < 512; y++)
      for (let x = 0; x < 512; x++)
        for (let col = 0; col < 5; col++) {
          const alpha = data[((row * 512 + y) * info.width + col * 512 + x) * 4 + 3];
          if (alpha > 128) {
            sums[col].count++;
            sums[col].x += x;
          }
        }
    assert.ok(sums[0].count > 60000);
    for (const mask of sums.slice(1)) assert.ok(mask.count > 10000);
    centroids.push(sums.map((s) => s.x / s.count));
  }
  // Mech left is viewer right from the front, and viewer left from behind.
  assert.ok(centroids[0][1] > 256 && centroids[0][2] < 256);
  assert.ok(centroids[1][1] < 256 && centroids[1][2] > 256);
  const front = await sharp(new URL('instruments/mech-structure-atlas.png', root).pathname)
    .extract({ left: 0, top: 0, width: 512, height: 512 })
    .raw()
    .toBuffer();
  const rear = await sharp(new URL('instruments/mech-structure-atlas.png', root).pathname)
    .extract({ left: 0, top: 512, width: 512, height: 512 })
    .flop()
    .raw()
    .toBuffer();
  assert.notDeepEqual(front, rear, 'Rear must not be a mirrored front');
});
test('powered structure display uses two equally sized views and preserves actuator overlays', () => {
  const atlas = {},
    state = { ...initialState(), stage: 3 };
  let f = context();
  renderInstrument(f.c, 'armor', state, 0, 0, [], { structureAtlas: atlas });
  assert.equal(f.images.length, 2);
  assert.ok(f.texts.includes('100 %'));
  assert.ok(f.texts.includes('FRONT'));
  assert.ok(f.texts.includes('RÜCKSEITE'));
  assert.deepEqual(f.images[0], [atlas, 0, 0, 512, 512, 70, 190, 362, 362]);
  assert.deepEqual(f.images[1], [atlas, 0, 512, 512, 512, 528, 190, 362, 362]);
  for (let limb = 0; limb < 4; limb++) {
    f = context();
    renderInstrument(
      f.c,
      'armor',
      { ...state, testPhase: 'actuators', testElapsed: limb * 2.5 },
      0,
      0,
      [],
      { structureAtlas: atlas },
    );
    assert.equal(f.images.length, 4);
    assert.equal(f.images[1][1], (limb + 1) * 512);
    assert.equal(f.images[3][1], (limb + 1) * 512);
    assert.equal(f.images[1][2], 0);
    assert.equal(f.images[3][2], 512);
  }
});
test('cold state remains standby and missing imagery has an explicit loading state', () => {
  let f = context();
  renderInstrument(f.c, 'armor', initialState(), 0, 0, [], { structureAtlas: {} });
  assert.equal(f.images.length, 0);
  assert.ok(f.texts.includes('STANDBY'));
  f = context();
  renderInstrument(f.c, 'armor', { ...initialState(), stage: 1 }, 0, 0, []);
  assert.equal(f.images.length, 0);
  assert.ok(f.texts.includes('Modellansichten werden geladen …'));
  assert.ok(f.texts.includes('—'));
});
