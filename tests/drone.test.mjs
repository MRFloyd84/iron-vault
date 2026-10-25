import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DRONE,
  initialDrone,
  idleDroneInput,
  stepDrone,
  droneToggle,
  droneBlock,
  droneCanLand,
  droneMark,
  droneLook,
} from '../lib/drone.ts';
import { initialState } from '../lib/machine.ts';

// Mech im Hof vor der Halle; Boden bei y = −2,6, Halterung auf dem Rücken.
const world = (over = {}) => ({
  dock: { x: 0, y: 6.4, z: -80 },
  dockYaw: 0,
  ground: () => -2.6,
  gate: 1,
  wind: 0,
  time: 0,
  ...over,
});
const powered = () => {
  const s = initialState();
  return { ...s, stage: 6, overhead: { ...s.overhead, avionics: true, mainGen: true } };
};
const run = (d, input, seconds, w = world(), power = true) => {
  for (let i = 0; i < seconds * 30; i++) d = stepDrone(d, input, 1 / 30, w, power);
  return d;
};
const fly = (input) => ({ ...idleDroneInput(), ...input });
function airborne(w = world()) {
  let d = run(initialDrone(), idleDroneInput(), 0.1, w);
  d = droneToggle(d, powered());
  assert.equal(d.phase, 'spinup');
  return run(d, idleDroneInput(), DRONE.spinup + DRONE.launch + 0.2, w);
}

test('Start nur mit Hauptstrom und AVIONICS; Rotoren laufen hoch, dann senkrecht abheben', () => {
  const cold = initialState();
  assert.match(droneBlock(cold, initialDrone()), /AVIONICS/);
  assert.equal(droneToggle(initialDrone(), cold).phase, 'docked');
  let d = droneToggle(initialDrone(), powered());
  d = run(d, idleDroneInput(), DRONE.spinup / 2);
  assert.equal(d.phase, 'spinup');
  assert.ok(d.rotor > 0.3 && d.rotor < 0.7);
  d = run(d, idleDroneInput(), DRONE.spinup / 2 + DRONE.launch + 0.1);
  assert.equal(d.phase, 'flying');
  assert.ok(Math.abs(d.pos.y - (6.4 + DRONE.launchHeight)) < 0.05, 'steht 3 m über der Halterung');
});

test('fliegt in Blickrichtung, dreht, steigt und hält Abstand zum Boden', () => {
  let d = airborne();
  d = run(d, fly({ forward: 1 }), 3);
  assert.ok(d.pos.z < -100, 'vorwärts = −z bei Blick 0');
  assert.ok(Math.hypot(d.vel.x, d.vel.z) <= DRONE.maxSpeed + 1e-6);
  d = run(d, fly({ turn: 1 }), Math.PI / 2 / DRONE.turnRate);
  const z0 = d.pos.z,
    x0 = d.pos.x;
  d = run(d, fly({ forward: 1 }), 2);
  assert.ok(
    d.pos.x > x0 + 5 && Math.abs(d.pos.z - z0) < 6,
    'nach Rechtsdrehung fliegt sie nach +x',
  );
  d = run(d, fly({ climb: -1 }), 10);
  assert.ok(
    Math.abs(d.pos.y - (-2.6 + DRONE.minClearance)) < 1e-6,
    'setzt nicht auf dem Boden auf',
  );
});

test('leerer Akku und Funkverlust lösen die Rückkehr aus; die Drohne dockt an und lädt', () => {
  let d = { ...airborne(), battery: DRONE.minBattery + 0.001 };
  d = run(d, idleDroneInput(), 0.3);
  assert.equal(d.phase, 'rtb');
  assert.equal(d.rtbReason, 'battery');
  d = run(d, idleDroneInput(), 20);
  assert.equal(d.phase, 'docked');
  const charged = run(d, idleDroneInput(), 30);
  assert.ok(charged.battery > d.battery, 'lädt in der Halterung');
  // Weit weg: Signal bricht ab
  let far = { ...airborne(), pos: { x: 0, y: 10, z: -80 - DRONE.signalLost - 5 } };
  far = run(far, idleDroneInput(), 0.1);
  assert.equal(far.phase, 'rtb');
  assert.equal(far.rtbReason, 'signal');
  const mid = run({ ...airborne(), pos: { x: 0, y: 10, z: -80 - 175 } }, idleDroneInput(), 0.05);
  assert.ok(mid.signal > 0.2 && mid.signal < 0.8, 'Signal nimmt mit der Entfernung ab');
});

test('Rückkehr folgt dem gehenden Mech; Landen von Hand nur dicht über der Halterung', () => {
  let d = run(airborne(), fly({ forward: 1 }), 2);
  assert.equal(droneCanLand(d, world()), false);
  d = droneToggle(d, powered());
  assert.equal(d.phase, 'rtb');
  // Mech ist inzwischen 6 m weitergegangen
  const moved = world({ dock: { x: 2, y: 6.4, z: -86 } });
  d = run(d, idleDroneInput(), 25, moved);
  assert.equal(d.phase, 'docked');
  assert.deepEqual(d.pos, moved.dock);
  const hover = run(airborne(), idleDroneInput(), 0.5);
  assert.equal(droneCanLand(hover, world()), true);
});

test('Hangar: Wände halten die Drohne auf, durch das offene Tor geht es', () => {
  // In der Halle, Tor zu: nicht hinaus
  const inside = world({ dock: { x: 0, y: 6.4, z: 1.3 }, gate: 0 });
  let d = airborne(inside);
  d = run(d, fly({ forward: 1 }), 8, inside);
  assert.ok(d.pos.z > -34.9, 'Tor zu: bleibt drin');
  assert.ok(d.pos.y <= DRONE.hall.ceiling + 1e-6, 'nicht durchs Dach');
  // Tor offen, mittig und unter der Torhöhe: hinaus
  const open = { ...inside, gate: 1 };
  d = run({ ...airborne(open), pos: { x: 0, y: 4, z: -20 } }, fly({ forward: 1 }), 4, open);
  assert.ok(d.pos.z < -36, 'Tor offen: fliegt hinaus');
  // Seitlich durch die Wand: nein
  d = run({ ...airborne(open), pos: { x: 14, y: 4, z: -30 } }, fly({ forward: 1 }), 3, open);
  assert.ok(d.pos.z > -34.9);
});

test('Ziel markieren und Kamera schwenken', () => {
  let d = airborne();
  d = droneMark(d, { x: 3, y: -2.6, z: -200 });
  assert.deepEqual(d.mark, { x: 3, y: -2.6, z: -200 });
  d = droneMark(d, null);
  assert.equal(d.mark, null);
  assert.equal(droneMark(initialDrone(), { x: 0, y: 0, z: 0 }).mark, null, 'angedockt: nichts');
  const looked = droneLook(d, 0.3, 5);
  assert.ok(looked.camPitch >= -1.45 - 1e-9, 'Kamera nicht über die Senkrechte');
  // Beim Andocken verschwindet die Markierung
  let back = droneMark(airborne(), { x: 1, y: 1, z: 1 });
  back = run(droneToggle(back, powered()), idleDroneInput(), 15);
  assert.equal(back.phase, 'docked');
  assert.equal(back.mark, null);
});

test('Drohnengeräusche: Start, Abheben, Landung, Abbruch und Markierung', async () => {
  const { droneSoundEvents } = await import('../lib/drone-audio.ts');
  const at = (phase, marks = 0) => ({ phase, rotor: 1, marks, signal: 1, speed: 0 });
  assert.deepEqual(droneSoundEvents(null, at('spinup')), []);
  assert.deepEqual(droneSoundEvents(at('docked'), at('spinup')), ['spinup']);
  assert.deepEqual(droneSoundEvents(at('spinup'), at('launch')), ['release']);
  assert.deepEqual(droneSoundEvents(at('flying'), at('flying')), []);
  assert.deepEqual(droneSoundEvents(at('landing'), at('docked')), ['dock', 'spindown']);
  // Start ohne Strom abgebrochen: nichts setzt auf, Motoren laufen nur aus.
  assert.deepEqual(droneSoundEvents(at('spinup'), at('docked')), ['spindown']);
  assert.deepEqual(droneSoundEvents(at('flying', 2), at('flying', 3)), ['mark']);
});
