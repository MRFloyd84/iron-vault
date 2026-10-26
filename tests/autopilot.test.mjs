import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState } from '../lib/machine.ts';
import { advanceWalking, collisionAt, WALK } from '../lib/walking.ts';
import { SITES, terrainHeight } from '../lib/terrain.ts';
import { planRoute, CELL, PLAN_SLOPE } from '../lib/route-planner.ts';
import {
  autopilotStep,
  destinations,
  disengage,
  fmsCommand,
  logMessage,
  HANGAR_APRON,
  LSK_ACTION,
  MCDU_KEY_ACTION,
  MCDU_KEYS,
  ROUTE_RADIUS,
} from '../lib/autopilot.ts';
import { checked } from './mobility-helpers.mjs';

const key = (s, k) => fmsCommand(s, MCDU_KEY_ACTION + MCDU_KEYS.indexOf(k));
const lsk = (s, n) => fmsCommand(s, LSK_ACTION + n - 1);
function ready(x = 0, z = -60, yaw = 0) {
  const s = initialState();
  const r = checked({
    ...s,
    stage: 6,
    simAt: 0,
    throttle: 1,
    hangar: { gate: 'open', position: 1 },
    mobility: { ...s.mobility, restraints: 'released', travel: 1 },
    overhead: {
      ...s.overhead,
      battery1: true,
      mainGen: true,
      hydPump: true,
      avionics: true,
      coolantValve: true,
      reactorArm: true,
    },
  });
  return { ...r, walk: { ...r.walk, x, z, yaw } };
}
const dirTo = (s, id) => {
  const i = destinations(s.fms).findIndex((d) => d.id === id);
  s = key(s, 'DIR');
  for (let p = 0; p < Math.floor(i / 5); p++) s = key(s, '►');
  return lsk(s, (i % 5) + 1);
};
function fly(s, seconds, each = () => {}) {
  const dt = 0.07;
  for (let t = 0; t < seconds && s.fms.ap !== 'off'; t += dt) {
    const before = s;
    s = advanceWalking(autopilotStep(s, dt), dt);
    each(before, s, dt);
  }
  return s;
}

test('Routenplaner: jede Anlage erreichbar, Strecken frei von Hindernissen und nicht zu steil', () => {
  for (const site of SITES) {
    const r = planRoute({ x: 0, z: -60 }, site, ROUTE_RADIUS);
    assert.ok(r, 'keine Route nach ' + site.id);
    for (let i = 1; i < r.points.length; i++) {
      const a = r.points[i - 1],
        b = r.points[i],
        n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 2);
      for (let k = 0; k <= n; k++) {
        const x = a.x + ((b.x - a.x) * k) / n,
          z = a.z + ((b.z - a.z) * k) / n;
        assert.equal(collisionAt(x, z, 1), null, `${site.id}: Hindernis bei ${x | 0},${z | 0}`);
        const g = Math.hypot(
          terrainHeight(x + CELL, z) - terrainHeight(x - CELL, z),
          terrainHeight(x, z + CELL) - terrainHeight(x, z - CELL),
        );
        assert.ok(Math.atan(g / (2 * CELL)) < PLAN_SLOPE + 0.08, `${site.id}: zu steil`);
      }
    }
  }
});

test('Autopilot: DIR → vorläufiger Plan (TMPY) → INSERT → AP; CLR verwirft den Entwurf', () => {
  let s = dirTo(ready(), 'checkpoint');
  assert.equal(s.fms.page, 'fpln');
  assert.ok(s.fms.tmpy && !s.fms.plan, 'erst vorläufig');
  assert.equal(key(s, 'CLR').fms.tmpy, null, 'CLR verwirft');
  s = lsk(s, 6);
  assert.equal(s.fms.plan.dest.id, 'checkpoint');
  assert.equal(s.fms.tmpy, null);
  s = key(s, 'AP');
  assert.equal(s.fms.ap, 'nav', s.message);
});

test('Autopilot: läuft in Stufe 2 bis zum Kontrollpunkt, nur über die normale Laufsimulation', () => {
  let s = key(lsk(dirTo(ready(), 'checkpoint'), 6), 'SPD 2');
  s = key(s, 'AP');
  let blocked = 0,
    fastest = 0,
    jerk = 0;
  s = fly(s, 600, (a, b, dt) => {
    if (b.walk.blocked) blocked++;
    fastest = Math.max(fastest, b.walk.speed);
    // Kein Sprung im Tempo: höchstens Anfahr- bzw. Bremsverzögerung
    jerk = Math.max(jerk, Math.abs(b.walk.speed - a.walk.speed) / dt);
  });
  assert.equal(s.fms.ap, 'off');
  assert.match(s.message, /Ziel erreicht/);
  assert.equal(blocked, 0);
  assert.ok(Math.abs(fastest - WALK.fastSpeed) < 0.05, 'Stufe 2 genutzt: ' + fastest);
  assert.ok(jerk <= WALK.brake + 1e-6, 'nie härter als normales Bremsen: ' + jerk);
  assert.ok(Math.abs(s.walk.speed) < 0.05, 'steht am Ziel');
  assert.equal(s.fms.plan, null, 'abgeflogener Plan wird gelöscht');
  const dest = destinations(s.fms).find((d) => d.id === 'checkpoint');
  const left = Math.hypot(s.walk.x - dest.x, s.walk.z - dest.z);
  assert.ok(left < 60, 'nah am Ziel: ' + left);
});

test('Autopilot: Eingabe des Piloten trennt sofort, HOLD hält an und setzt fort', () => {
  let s = key(lsk(dirTo(ready(), 'settlement'), 6), 'AP');
  s = fly(s, 30);
  assert.ok(s.walk.speed > 1);
  const held = fly(key(s, 'HOLD'), 20);
  assert.equal(held.fms.ap, 'hold');
  assert.ok(Math.abs(held.walk.speed) < 0.05, 'HOLD bremst bis zum Stand');
  assert.ok(fly(key(held, 'HOLD'), 15).walk.speed > 1, 'fortgesetzt');
  const off = disengage(s, 'Autopilot aus – Steuerung übernommen.');
  assert.equal(off.fms.ap, 'off');
  assert.deepEqual(off.walk.input, { forward: 0, turn: 0, brake: false });
});

test('Autopilot: verweigert ohne Plan, in der Halle und ohne Laufbereitschaft', () => {
  assert.match(key(ready(), 'AP').message, /kein Flugplan/);
  const planned = lsk(dirTo(ready(), 'mine'), 6);
  assert.match(
    key({ ...planned, walk: { ...planned.walk, z: -20 } }, 'AP').message,
    /außerhalb der Halle/,
  );
  assert.match(key({ ...planned, throttle: 0 }, 'AP').message, /nicht verfügbar/);
  // Leistungshebel während des Marschs auf 0: Autopilot trennt
  const going = fly(key(planned, 'AP'), 5);
  const cut = autopilotStep({ ...going, throttle: 0 }, 0.07);
  assert.equal(cut.fms.ap, 'off');
  assert.ok(cut.error);
});

test('RTB plant zur Halle, Meldungen landen im Verlauf', () => {
  const s = key(ready(200, -600), 'RTB');
  assert.equal(s.fms.tmpy.dest.id, HANGAR_APRON.id);
  let m = logMessage({ ...s, message: 'Erste Meldung', error: false });
  m = logMessage({ ...m, message: 'Zweite Meldung', error: true });
  m = logMessage(m);
  assert.deepEqual(
    m.fms.log.map((l) => l.text),
    ['Zweite Meldung', 'Erste Meldung'],
  );
});
