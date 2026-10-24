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

test('storm: lightning only in heavy rain, thunder follows by distance, flash flickers', async () => {
  const { Storm, lightningFlash } = await import('../lib/weather.ts');
  const s = new Storm();
  for (let t = 0; t < 120; t += 0.1) assert.equal(s.update(t, 0.3).thunder.length, 0);
  const storm = new Storm();
  const strikes = [],
    thunders = [];
  for (let t = 0; t < 600; t += 0.05) {
    const r = storm.update(t, 1);
    if (r.flash === 1) strikes.push(t);
    for (const th of r.thunder) thunders.push({ t, ...th });
  }
  const first = strikes[0];
  assert.ok(first >= 6 && first <= 14.2, 'first strike soon after rain starts: ' + first);
  const distinct = strikes.filter((t, i) => i === 0 || t - strikes[i - 1] > 1);
  assert.ok(
    distinct.length >= 12 && distinct.length <= 40,
    'strikes in 10 min: ' + distinct.length,
  );
  assert.ok(thunders.length >= distinct.length - 1);
  assert.ok(thunders[0].t - first >= 0.6 && thunders[0].t - first <= 5.7, 'thunder delay');
  assert.ok(thunders.every((th) => th.variant === (th.distance < 0.45 ? 1 : 0)));
  // Doppelflackern, danach dunkel; reduzierte Bewegung ohne Flackern.
  assert.equal(lightningFlash(0.02, false), 1);
  assert.ok(lightningFlash(0.08, false) < 0.3 && lightningFlash(0.15, false) > 0.8);
  assert.equal(lightningFlash(0.7, false), 0);
  for (let a = 0; a < 0.6; a += 0.02) assert.ok(lightningFlash(a, true) <= 0.45);
});

test('Hydraulikgeräusche folgen dem Gangzyklus jedes Beins', async () => {
  const { hydraulicEvents, HYDRAULIC_VARIANTS, HYDRAULIC_PUMP } =
    await import('../lib/hydraulic-audio.ts');
  const fs = await import('node:fs');
  // Ein ganzer Doppelschritt in kleinen Schritten: je Bein genau einmal jedes Ereignis.
  const count = {};
  for (let i = 0; i < 100; i++) {
    const a = { phase: 3 + i / 100, speed: 2, turnRate: 0 },
      b = { phase: 3 + (i + 1) / 100, speed: 2, turnRate: 0 };
    for (const e of hydraulicEvents(a, b, 0)) {
      const key = e.kind + e.side;
      count[key] = (count[key] ?? 0) + 1;
      assert.ok(e.variant >= 0 && e.variant < HYDRAULIC_VARIANTS[e.kind]);
    }
  }
  for (const side of [-1, 1])
    for (const kind of ['vent', 'retract', 'extend', 'settle'])
      assert.equal(count[kind + side], 1, kind + ' ' + side);
  // Im Stand und bei Sprüngen (Zurücksetzen) still.
  assert.deepEqual(
    hydraulicEvents({ phase: 1, speed: 0, turnRate: 0 }, { phase: 1.6, speed: 0, turnRate: 0 }),
    [],
  );
  assert.deepEqual(
    hydraulicEvents({ phase: 0.1, speed: 2, turnRate: 0 }, { phase: 4, speed: 2, turnRate: 0 }),
    [],
  );
  // Nässe lässt die Gelenke öfter knarzen.
  const creaks = (wet) => {
    let n = 0;
    for (let i = 0; i < 400; i++)
      n += hydraulicEvents(
        { phase: i * 0.5 - 0.01, speed: 2, turnRate: 0 },
        { phase: i * 0.5 + 0.01, speed: 2, turnRate: 0 },
        wet,
      ).filter((e) => e.kind === 'creak').length;
    return n;
  };
  assert.ok(creaks(0) > 20 && creaks(0) < 160, 'trocken: gelegentlich ' + creaks(0));
  assert.ok(creaks(1) > creaks(0) * 2, 'nass: deutlich öfter ' + creaks(1));
  // Alle Dateien vorhanden.
  for (const [kind, n] of Object.entries(HYDRAULIC_VARIANTS))
    for (let i = 1; i <= n; i++)
      assert.ok(fs.existsSync(new URL(`../public/audio/hyd-${kind}-${i}.ogg`, import.meta.url)));
  assert.ok(fs.existsSync(new URL('../public/audio/' + HYDRAULIC_PUMP, import.meta.url)));
});
