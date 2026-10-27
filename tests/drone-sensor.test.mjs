import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DroneSensor, HEAT_AMBIENT, heatOf, SENSOR_MODES } from '../lib/drone-sensor.ts';

test('Drohnensensor: Temperatur wird von der Gruppe geerbt, sonst Umgebung', () => {
  const mech = new THREE.Group();
  mech.userData.heat = 0.88;
  const leg = new THREE.Mesh();
  const arm = new THREE.Group();
  arm.add(leg);
  mech.add(arm);
  const rock = new THREE.Mesh();
  assert.equal(heatOf(leg), 0.88);
  assert.equal(heatOf(rock), HEAT_AMBIENT);
});

test('Drohnensensor: 8 schaltet TV → Wärmebild → Nachtsicht → TV', () => {
  const s = new DroneSensor();
  assert.equal(s.mode, 'tv');
  const seen = SENSOR_MODES.map(() => s.cycle());
  assert.deepEqual(seen, ['thermal', 'night', 'tv']);
  s.dispose();
});
