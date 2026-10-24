import test from 'node:test';
import assert from 'node:assert/strict';
import {
  displayFlicker,
  drawDisplayAging,
  glitchAt,
  powerOnDelay,
  displayAge,
  SETTLE_SECONDS,
} from '../lib/display-aging.ts';
import { createCanvas } from './canvas-fixture.mjs';

test('displays switch on staggered, flicker while warming up and settle afterwards', () => {
  for (let i = 0; i < 10; i++) {
    const d = powerOnDelay(i);
    assert.ok(d > 0.1 && d < 0.7);
    assert.equal(
      displayFlicker('boot', d - 0.05, 1, i, false),
      0,
      'still dark before its tube fires',
    );
    // Während des Aufwärmens gibt es echte Helligkeitseinbrüche …
    const samples = [];
    for (let t = d + 0.5; t < d + 2.5; t += 0.01)
      samples.push(displayFlicker('boot', t, t, i, false));
    assert.ok(Math.min(...samples) < 0.5 * Math.max(...samples), 'display ' + i + ' flickers');
    // … danach ist das Bild ruhig.
    const settled = displayFlicker('boot', 9, 9, i, false);
    assert.ok(Math.abs(settled - (1 - 0.07 * displayAge(i))) < 1e-9);
  }
  assert.equal(displayFlicker('off', 5, 5, 0, false), 0);
});

test('reduced motion removes flicker and glitches but keeps the warm-up ramp', () => {
  const values = [];
  for (let t = 1; t < 3; t += 0.013) values.push(displayFlicker('boot', t, t, 3, true));
  for (let k = 1; k < values.length; k++) assert.ok(values[k] >= values[k - 1] - 1e-12);
  for (let t = 0; t < 600; t += 0.37)
    assert.equal(displayFlicker('ready', 13, t, 3, true), 1 - 0.07 * displayAge(3));
});

test('operation glitches are occasional, short and more frequent on older tubes', () => {
  const share = (i) => {
    let hit = 0,
      n = 0;
    for (let t = 0; t < 3600; t += 0.05, n++) if (glitchAt(t, i)) hit++;
    return hit / n;
  };
  for (let i = 0; i < 10; i++) {
    const s = share(i);
    assert.ok(s > 0.001 && s < 0.03, 'display ' + i + ' disturbed ' + (s * 100).toFixed(2) + ' %');
  }
  assert.ok(share(3) > share(8), 'oldest tube (3) glitches more than the newest (8)');
  assert.deepEqual(glitchAt(1234.5, 2), glitchAt(1234.5, 2), 'deterministic');
});

test(
  'power-on beam, transparent HUD and a settled picture on the canvas',
  { skip: !createCanvas },
  () => {
    const fill = (w, h) => {
      const c = createCanvas(w, h).getContext('2d');
      c.fillStyle = '#b5f591';
      c.fillRect(0, 0, w, h);
      return c;
    };
    // Vor dem Zünden schwarz.
    let c = fill(960, 720);
    drawDisplayAging(c, 'boot', powerOnDelay(0) - 0.05, 1, 0, false);
    assert.equal(c.getImageData(480, 360, 1, 1).data[1], 0);
    // Strahl öffnet sich: Mitte hell, oben noch schwarz.
    c = fill(960, 720);
    drawDisplayAging(c, 'boot', powerOnDelay(0) + 0.15, 1, 0, false);
    assert.ok(c.getImageData(480, 360, 1, 1).data[1] > 200);
    assert.equal(c.getImageData(480, 5, 1, 1).data[1], 0);
    // HUD bleibt außerhalb der Zeichnung durchsichtig.
    const hud = createCanvas(640, 480).getContext('2d');
    hud.fillStyle = '#b5f591';
    hud.fillRect(100, 100, 200, 50);
    drawDisplayAging(hud, 'ready', 13, 10, 8, true, true);
    assert.equal(hud.getImageData(5, 5, 1, 1).data[3], 0);
    assert.ok(hud.getImageData(200, 120, 1, 1).data[3] > 0);
    // Nach dem Einschwingen und ohne Störung: Bildmitte unverändert.
    c = fill(960, 720);
    let t = 0;
    while (glitchAt(t, 0)) t += 1;
    drawDisplayAging(c, 'ready', 13, t, 0, false);
    assert.deepEqual([...c.getImageData(480, 360, 1, 1).data], [0xb5, 0xf5, 0x91, 255]);
    assert.ok(SETTLE_SECONDS < 13);
  },
);
