import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FAR_PLANE,
  PRESETS,
  getGraphics,
  matchPreset,
  minFogDensity,
  onGraphicsChange,
  sanitize,
  setGraphics,
  shadowMapSize,
} from '../lib/graphics-settings.ts';

test('Grafik: "Hoch" ist der bisherige Stand und Standard', () => {
  assert.deepEqual(sanitize(null), PRESETS.high);
  assert.equal(PRESETS.high.resolution, 1);
  assert.equal(shadowMapSize('high', 2048), 2048);
  assert.equal(FAR_PLANE.far, 2600);
  assert.equal(minFogDensity('far'), 0, 'Nebel bei voller Sicht unverändert');
});

test('Grafik: ungültige gespeicherte Werte fallen auf "Hoch" zurück', () => {
  const g = sanitize({ resolution: 3, shadows: 'ultra', distance: 'near', monitors: 1 });
  assert.equal(g.resolution, 1);
  assert.equal(g.shadows, 'high');
  assert.equal(g.distance, 'near');
  assert.equal(g.monitors, 'smooth');
});

test('Grafik: kürzere Sichtweite blendet am Rand vollständig in den Dunst', () => {
  for (const d of ['medium', 'near']) {
    const rest = Math.exp(-((minFogDensity(d) * FAR_PLANE[d]) ** 2));
    assert.ok(rest < 0.005, d + ': Restsicht am Rand ' + rest);
  }
});

test('Grafik: Voreinstellung erkennen, Änderungen melden', () => {
  assert.equal(matchPreset(PRESETS.low), 'low');
  assert.equal(matchPreset({ ...PRESETS.high, shadows: 'off' }), null);
  const seen = [];
  const off = onGraphicsChange((g) => seen.push(g));
  setGraphics(PRESETS.medium);
  setGraphics({ shadows: 'off' });
  off();
  assert.equal(seen.length, 2);
  assert.equal(getGraphics().shadows, 'off');
  assert.equal(getGraphics().resolution, PRESETS.medium.resolution);
  assert.equal(shadowMapSize('off', 1024), 256, 'nie eine leere Schattenkarte');
});
