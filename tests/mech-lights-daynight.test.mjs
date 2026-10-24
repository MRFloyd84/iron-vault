import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { dayNightParams } from '../lib/day-night.ts';
import {
  beaconLevel,
  bakeRestPositions,
  buildWaistRing,
  headlightLevel,
  HEADLIGHT_TILT,
} from '../lib/mech-details.ts';

test('day values match v48 except the softer sky reflection (sun carries light since v50); night is darker with brighter yard lamps', () => {
  const day = dayNightParams(0),
    night = dayNightParams(1);
  assert.equal(day.sky, 'day');
  assert.ok(Math.abs(day.skyIntensity - 0.8) < 1e-12);
  assert.equal(day.hemiIntensity, 0.2);
  assert.equal(day.hemiSky.getHex(), 0x91aea8);
  assert.equal(day.fogColor.getHex(), 0x39444a);
  assert.equal(day.yardEnv, 0.55);
  assert.equal(day.envScale, 1);
  assert.equal(day.lampGlow, 3);
  assert.equal(day.floodScale, 1);
  assert.equal(night.sky, 'night');
  assert.ok(night.hemiIntensity < day.hemiIntensity);
  assert.ok(night.yardEnv < 0.1 && night.envScale < 0.25);
  assert.ok(night.lampGlow > day.lampGlow && night.floodScale > 1);
  // Übergang blendet über Dunkel, nie heller als die Endpunkte.
  for (let n = 0; n <= 1; n += 0.05) {
    const p = dayNightParams(n);
    assert.ok(p.skyIntensity <= 1 && p.skyIntensity >= 0.03 - 1e-12);
  }
  assert.ok(dayNightParams(0.5).skyIntensity < 0.1);
});

test('headlights need power, flicker briefly like old lamps, then stay steady', () => {
  assert.equal(headlightLevel(false, true, 5, false), 0);
  assert.equal(headlightLevel(true, false, 5, false), 0, 'no light without on-board power');
  const early = [];
  for (let t = 0; t < 0.9; t += 0.01) early.push(headlightLevel(true, true, t, false));
  assert.ok(Math.min(...early) < 0.2 && Math.max(...early) > 0.6, 'switch-on flicker');
  for (let t = 1; t < 20; t += 0.37) assert.equal(headlightLevel(true, true, t, false), 1);
  assert.equal(headlightLevel(true, true, 0.1, true), 1, 'reduced motion: no flicker');
  assert.ok(HEADLIGHT_TILT > 0.15 && HEADLIGHT_TILT < 0.45);
});

test('beacon rotates while moving and runs on for two seconds', () => {
  assert.equal(beaconLevel(3, 0, 5), 0);
  const moving = [];
  for (let t = 0; t < 1; t += 0.02) moving.push(beaconLevel(t, 2, 0));
  assert.ok(Math.max(...moving) > 0.9 && Math.min(...moving) < 0.25, 'rotating flashes');
  assert.ok(beaconLevel(0, 0, 1) > 0, 'run-on after stopping');
  assert.equal(beaconLevel(0, 0, 2.5), 0);
});

test('waist slewing ring stays slimmer than the old bearing and covers the joint', () => {
  const ring = buildWaistRing();
  assert.equal(ring.name, 'Waist bearing');
  ring.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(ring);
  const radius = Math.max(box.max.x, -box.min.x, box.max.z, -box.min.z);
  assert.ok(radius < 0.15, 'radius ' + radius);
  assert.ok(box.min.y <= 0.53 && box.max.y >= 0.6, 'covers waist seam at y=0.565');
});

test('rest positions are baked in model space so dirt does not swim while walking', () => {
  const model = new THREE.Group();
  const leg = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  leg.position.set(0.2, 0.3, 0);
  model.add(leg);
  bakeRestPositions(model);
  const rest = leg.geometry.getAttribute('aRest'),
    pos = leg.geometry.getAttribute('position');
  assert.ok(Math.abs(rest.getX(0) - (pos.getX(0) + 0.2)) < 1e-6);
  assert.ok(Math.abs(rest.getY(0) - (pos.getY(0) + 0.3)) < 1e-6);
  // Später bewegtes Bein behält seine einmal gebackenen Werte.
  leg.rotation.x = 1;
  bakeRestPositions(model);
  assert.ok(Math.abs(leg.geometry.getAttribute('aRest').getY(0) - (pos.getY(0) + 0.3)) < 1e-6);
});
