import test from 'node:test';
import assert from 'node:assert/strict';
import { faultyTube } from '../lib/cabin-wear.ts';
import { displayAge, displayFlicker } from '../lib/display-aging.ts';

test('faulty tube: mostly lit, twitches, drops out now and then, steady with reduced motion', () => {
  let out = 0,
    lit = 0,
    n = 0;
  for (let t = 0; t < 600; t += 0.02, n++) {
    const v = faultyTube(t);
    assert.ok(v >= 0 && v <= 1);
    if (v < 0.1) out++;
    if (v > 0.75) lit++;
  }
  assert.ok(lit / n > 0.8, 'mostly lit');
  assert.ok(out / n > 0.02 && out / n < 0.12, 'occasional dropouts: ' + out / n);
  assert.equal(faultyTube(12.3, true), 0.85);
});

test('running displays shimmer visibly but stay readable', () => {
  for (const i of [1, 3]) {
    const base = 1 - 0.07 * displayAge(i);
    const v = [];
    for (let t = 100; t < 160; t += 0.01) v.push(displayFlicker('ready', 13, t, i, false));
    const min = Math.min(...v),
      mean = v.reduce((a, b) => a + b, 0) / v.length;
    assert.ok(min < base * 0.9, 'visible shimmer/dropouts');
    assert.ok(mean > base * 0.9, 'readable on average: ' + mean / base);
  }
});
