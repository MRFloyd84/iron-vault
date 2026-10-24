import test from 'node:test';
import assert from 'node:assert/strict';
import { detectFootfalls, footfallStrength, StepJolt } from '../lib/footfall.ts';
import { insideShelter, weatherParams, SHELTER } from '../lib/weather.ts';
import { PRINT_LIFE } from '../lib/ground-effects.ts';

test('touchdown is detected once per foot, left at whole phases, right at halves', () => {
  assert.deepEqual(detectFootfalls(0.9, 1.05), [-1]);
  assert.deepEqual(detectFootfalls(1.4, 1.55), [1]);
  assert.deepEqual(detectFootfalls(1.1, 1.3), []);
  // Rückwärts (Phase läuft zurück) ebenfalls genau einmal.
  assert.deepEqual(detectFootfalls(2.05, 1.95), [-1]);
  // Sprünge und ungültige Werte lösen nichts aus.
  assert.deepEqual(detectFootfalls(0, 7), []);
  assert.deepEqual(detectFootfalls(NaN, 1), []);
  // Über viele kleine Bildschritte: genau zwei Aufsetzer je voller Phase.
  let count = 0;
  for (let p = 0; p < 10; p += 0.013) count += detectFootfalls(p, p + 0.013).length;
  assert.equal(count, 20);
});

test('cabin jolt dips, rebounds and settles within half a second', () => {
  const j = new StepJolt();
  j.impulse(footfallStrength(2, 0), -1);
  let min = 0;
  for (let t = 0; t < 0.15; t += 1 / 60) min = Math.min(min, j.step(1 / 60).y);
  assert.ok(min < -0.01, 'cabin dips on touchdown');
  for (let t = 0; t < 0.6; t += 1 / 60) j.step(1 / 60);
  assert.ok(Math.abs(j.y) < 0.002 && Math.abs(j.pitch) < 0.0005, 'settled');
  assert.ok(j.shake < 0.05, 'instrument rattle fades');
  assert.ok(footfallStrength(2.2, 0) > footfallStrength(0.5, 0));
});

test('dry weather leaves the scene unchanged; rain darkens and thickens the air', () => {
  const dry = weatherParams(0),
    wet = weatherParams(1);
  for (const k of ['fogDensity', 'sky', 'hemi', 'sun']) assert.equal(dry[k], 1, k);
  assert.equal(dry.wet, 0);
  assert.ok(wet.fogDensity > 2 && wet.sky < 0.6 && wet.sun < 0.3 && wet.wet === 1);
});

test('the hall stays dry, the yard does not', () => {
  assert.ok(insideShelter(0, 1.3), 'service bay');
  assert.ok(insideShelter(10, -30));
  assert.ok(!insideShelter(0, -36), 'just outside the gate');
  assert.ok(!insideShelter(0, -80));
  assert.ok(SHELTER.top > 10);
  assert.ok(PRINT_LIFE >= 60);
});
