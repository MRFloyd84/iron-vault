import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAP,
  ROADS,
  SITES,
  terrainHeight,
  terrainSlope,
  siteHeight,
  sectorName,
  roadDistance,
} from '../lib/terrain.ts';
import {
  STRUCTURES,
  WORLD_OBSTACLES,
  TARGETS,
  SCAN_POINTS,
  ROCKS,
  structureTop,
  target,
} from '../lib/world-layout.ts';
import { collisionAt, groundHeight, MAX_PITCH } from '../lib/walking.ts';
import {
  initialDamage,
  damageTarget,
  blastDamage,
  restoreTargets,
  isDestroyed,
} from '../lib/targets.ts';
import {
  MISSIONS,
  startMission,
  stepMission,
  nextObjective,
  objectiveVisible,
  bearing,
  mission,
} from '../lib/missions.ts';
import { worldHit } from '../lib/firing-range.ts';
import * as THREE from 'three';

test('Gelände: Hof und Halle bleiben eben, Karte 1,5 × 1,5 km, deterministisch', () => {
  assert.equal(MAP.maxX - MAP.minX, 1500);
  assert.equal(MAP.maxZ - MAP.minZ, 1500);
  for (const [x, z] of [
    [0, 0],
    [0, -100],
    [45, -200],
    [-60, -240],
  ])
    assert.equal(terrainHeight(x, z), 0);
  assert.equal(groundHeight(0, -121), 1.8, 'Rampe im Hof bleibt');
  assert.equal(terrainHeight(-321.5, -888.25), terrainHeight(-321.5, -888.25));
  // Es gibt echtes Relief: Tafelberge und Randwall
  assert.ok(terrainHeight(260, -1260) > 25);
  assert.ok(terrainHeight(0, -1430) > 20);
});

test('Gelände: Pisten sind überall begehbar, Anlagen eben', () => {
  let worst = 0;
  for (const road of ROADS)
    for (let i = 1; i < road.length; i++) {
      const [a, b] = [road[i - 1], road[i]];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let s = 0; s <= len; s += 4) {
        const x = a[0] + ((b[0] - a[0]) * s) / len,
          z = a[1] + ((b[1] - a[1]) * s) / len;
        worst = Math.max(worst, terrainSlope(x, z, 1.6));
      }
    }
  assert.ok(worst < Math.tan(MAX_PITCH) * 0.85, 'steilste Pistenstelle ' + worst.toFixed(2));
  for (const s of SITES)
    assert.ok(Math.abs(terrainHeight(s.x, s.z) - siteHeight(s.id)) < 0.01, s.id + ' eben');
});

test('Planquadrate A1 (Südwesten) bis F6 (Nordosten)', () => {
  assert.equal(sectorName(-740, 50), 'A1');
  assert.equal(sectorName(740, -1430), 'F6');
  assert.equal(sectorName(0, 0), 'D1');
});

test('Weltaufbau: Anlagen, Ziele und Aufklärungspunkte vollständig, Pisten frei', () => {
  assert.ok(STRUCTURES.length > 80);
  assert.ok(ROCKS.length > 300);
  assert.deepEqual(TARGETS.map((t) => t.id).sort(), [
    'radar',
    'radio-mast',
    'tank-a',
    'tank-b',
    'tank-c',
    'truck-1',
    'truck-2',
    'truck-3',
    'valve-1',
    'valve-2',
    'valve-3',
    'valve-4',
  ]);
  for (const id of ['water-tower', 'iv01', 'bunker', 'scan-radar', 'scan-truck-1'])
    assert.ok(
      SCAN_POINTS.some((p) => p.id === id),
      id,
    );
  // Kein Hindernis ragt so weit in eine Piste, dass IV-04 (Radius 4,65 m) nicht vorbeikommt
  for (const o of WORLD_OBSTACLES) {
    if (o.label === 'Pipeline') continue;
    const reach = Math.hypot(o.w, o.d) / 2;
    assert.ok(
      roadDistance(o.x, o.z) > reach * 0.5 + 1,
      o.label + ' auf der Piste bei ' + o.x + ',' + o.z,
    );
  }
});

test('Gehen: Anlagen, Felsen und Kartenrand sind fest, Pisten frei', () => {
  const tank = target('tank-a');
  assert.equal(collisionAt(tank.x, tank.z, 1), 'Tank');
  assert.equal(collisionAt(MAP.minX + 10, -600, 1), 'Geländegrenze');
  // Entlang der Pisten (Mittellinie) ist nichts im Weg
  for (const road of ROADS)
    for (let i = 1; i < road.length; i++) {
      const [a, b] = [road[i - 1], road[i]];
      for (let t = 0.1; t < 1; t += 0.2) {
        const x = a[0] + (b[0] - a[0]) * t,
          z = a[1] + (b[1] - a[1]) * t;
        assert.equal(
          collisionAt(x, z, 1),
          null,
          'Piste bei ' + Math.round(x) + ',' + Math.round(z),
        );
      }
    }
});

test('Drohne: Dächer und Türme zählen als Hindernis', () => {
  const tank = target('tank-a');
  assert.ok(structureTop(tank.x, tank.z) > siteHeight('refinery') + 10);
  assert.equal(structureTop(0, -400), -Infinity);
});

test('Treffer an Zielen, Gebäuden und Boden in der Außenwelt', () => {
  const t = target('truck-1');
  const y = -2.6 + t.y;
  // Von oben (Drohnenblick auf den Lastwagen zwischen den Containern)
  const hit = worldHit(new THREE.Vector3(t.x, y + 40, t.z), new THREE.Vector3(t.x, y - 3, t.z));
  assert.equal(hit?.kind, 'target');
  assert.equal(hit?.target, 'truck-1');
  const gone = worldHit(
    new THREE.Vector3(t.x, y + 40, t.z),
    new THREE.Vector3(t.x, y - 3, t.z),
    (id) => id === 'truck-1',
  );
  assert.equal(gone?.kind, 'structure');
});

test('Ziele: Trefferpunkte, Zerstörung, Druckwelle, Wiederaufbau', () => {
  let d = initialDamage();
  const tank = target('tank-a');
  for (let i = 0; i < tank.hp - 1; i++) d = damageTarget(d, 'tank-a', 1, i).damage;
  assert.equal(isDestroyed(d, 'tank-a'), false);
  const r = damageTarget(d, 'tank-a', 1, 99);
  assert.deepEqual(r.destroyed, ['tank-a']);
  assert.equal(isDestroyed(r.damage, 'tank-a'), true);
  // Weitere Treffer auf ein Wrack ändern nichts
  assert.deepEqual(damageTarget(r.damage, 'tank-a', 5, 100).destroyed, []);
  // Tanks stehen weiter auseinander als ihre Druckwelle: jeder muss einzeln getroffen werden
  assert.ok(blastDamage(tank).every((b) => !b.id.startsWith('tank')));
  // Lastwagen in Containerreihen: Explosion beschädigt nur in der Nähe
  for (const b of blastDamage(target('valve-1'))) assert.ok(b.distance < target('valve-1').blast);
  d = restoreTargets(r.damage, ['tank-a']);
  assert.equal(isDestroyed(d, 'tank-a'), false);
  assert.equal(d.hp['tank-a'], tank.hp);
});

const facts = (over = {}) => ({
  x: 0,
  z: -100,
  inHangar: false,
  scanned: () => false,
  destroyed: () => false,
  ...over,
});

test('Mission: Erreichen, Erfassen, Rückkehr erst am Schluss', () => {
  let p = startMission('patrol', 0);
  // In der Halle zu Beginn: Rückkehr zählt noch nicht
  let r = stepMission(p, facts({ inHangar: true }));
  assert.equal(r.progress.done.return, undefined);
  r = stepMission(r.progress, facts({ x: 34, z: -616 }));
  assert.deepEqual(
    r.events.map((e) => e.type),
    ['objective'],
  );
  r = stepMission(r.progress, facts({ scanned: (id) => id === 'water-tower' }));
  assert.equal(r.progress.done.tower, true);
  const m = mission('patrol');
  assert.equal(objectiveVisible(m.objectives[2], m, r.progress), true, 'Rückkehr jetzt sichtbar');
  r = stepMission(r.progress, facts({ inHangar: true }));
  assert.equal(r.progress.status, 'complete');
  assert.ok(r.events.some((e) => e.type === 'complete'));
});

test('Mission Depot: Lastwagen erst nach dem Erfassen auf der Karte', () => {
  const m = mission('depot');
  let p = startMission('depot', 0);
  const destroy1 = m.objectives.find((o) => o.id === 'truck-1');
  assert.equal(objectiveVisible(destroy1, m, p), false);
  p = stepMission(p, facts({ scanned: (id) => id === 'scan-truck-1' })).progress;
  assert.equal(objectiveVisible(destroy1, m, p), true);
  // Nächstes Ziel: Suchgebiet oder erfasster Lastwagen
  assert.ok(nextObjective(p, -130, -1200));
});

test('Mission Raffinerie: alle Tanks zerstört, dann heim', () => {
  let p = startMission('refinery', 0);
  p = stepMission(p, facts({ destroyed: (id) => id.startsWith('tank') })).progress;
  assert.equal(p.status, 'active');
  assert.equal(nextObjective(p, -400, -600).objective.kind, 'return');
  p = stepMission(p, facts({ inHangar: true, destroyed: () => true })).progress;
  assert.equal(p.status, 'complete');
});

test('Alle Missionen verweisen auf vorhandene Ziele und Punkte', () => {
  for (const m of MISSIONS)
    for (const o of m.objectives) {
      if (o.kind === 'destroy')
        assert.ok(
          TARGETS.some((t) => t.id === o.target),
          o.target,
        );
      if (o.kind === 'scan')
        assert.ok(
          SCAN_POINTS.some((p) => p.id === o.point),
          o.point,
        );
    }
});

test('Kompass: Norden 0°, Osten 90°', () => {
  assert.equal(Math.round(bearing(0, 0, 0, -100)), 0);
  assert.equal(Math.round(bearing(0, 0, 100, 0)), 90);
  assert.equal(Math.round(bearing(0, 0, 0, 100)), 180);
});

test('Taktik-Display zeichnet Lagebild, Einsatzziel und Entfernung', async () => {
  const { renderInstrument } = await import('../lib/instruments.ts');
  const { initialState } = await import('../lib/machine.ts');
  const texts = [];
  let paths = 0;
  const c = new Proxy(
    {
      canvas: { width: 960, height: 720 },
      fillText(s) {
        texts.push(s);
      },
      lineTo() {
        paths++;
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
  const s = { ...initialState(), stage: 6, radarRange: 500, radarPaused: false };
  renderInstrument(c, 'radar', s, 1, 0, [], {
    tactical: {
      x: 60,
      z: -600,
      yaw: 0,
      drone: { x: 40, z: -650 },
      roads: ROADS,
      blips: [{ x: 70, z: -640 }],
      targets: TARGETS.map((t) => ({
        x: t.x,
        z: t.z,
        destroyed: t.id === 'tank-a',
        objective: t.id.startsWith('tank'),
      })),
      objective: { x: -452, z: -634, r: 10, exact: true, label: 'Tank A zerstören', distance: 513 },
      mission: 'TREIBSTOFFLAGER ASCHE-7',
    },
  });
  assert.ok(texts.includes('Tank A zerstören'));
  assert.ok(texts.includes('513 m'));
  assert.ok(paths > 10, 'Pisten und Symbole gezeichnet');
});
