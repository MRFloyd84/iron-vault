import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  batchStaticCockpit,
  nextDisplay,
  cockpitPixelRatio,
  cabinLighting,
  instrumentSpill,
  ceilingLighting,
  braceLighting,
  setCockpitInterior,
} from '../lib/cockpit-rendering.ts';
import { initialState, command, overheadCommand } from '../lib/machine.ts';

test('cabin lights follow battery power, master power and the existing light switch', () => {
  const cold = initialState();
  assert.equal(cabinLighting(cold).intensity, 0);
  assert.equal(cabinLighting(cold).emission, 0);
  const battery = overheadCommand(cold, 40, 100),
    backup = cabinLighting(battery);
  assert.ok(backup.intensity > 0 && backup.emission > 0);
  assert.equal(backup.work, false);
  const powered = { ...battery, stage: 1, light: true },
    work = cabinLighting(powered);
  assert.ok(work.intensity > backup.intensity && work.emission > backup.emission);
  assert.equal(work.work, true);
  assert.deepEqual(cabinLighting({ ...powered, light: false }), backup);
  assert.deepEqual(cabinLighting(command(powered, 0, 200)), backup);
  assert.equal(cabinLighting(overheadCommand(battery, 40, 300)).intensity, 0);
});

test('instrument reflection follows power and the dimmer independently of the cabin light', () => {
  const cold = initialState(),
    battery = overheadCommand(cold, 40, 100);
  assert.equal(instrumentSpill(cold), 0);
  assert.ok(instrumentSpill(battery) > 0);
  const powered = { ...battery, stage: 1, displayBrightness: 1, light: true };
  assert.ok(instrumentSpill(powered) > instrumentSpill(battery));
  assert.ok(instrumentSpill({ ...powered, displayBrightness: 0.4 }) < instrumentSpill(powered));
  assert.equal(instrumentSpill({ ...powered, light: false }), instrumentSpill(powered));
  assert.equal(instrumentSpill(command(powered, 0, 200)), instrumentSpill(battery));
});

test('red ceiling lamp follows both batteries and its own dimmer independently of warm light', () => {
  const cold = initialState(),
    battery = overheadCommand(cold, 41, 100),
    backup = ceilingLighting(battery);
  assert.equal(ceilingLighting(cold).intensity, 0);
  assert.equal(ceilingLighting(cold).emission, 0);
  assert.ok(backup.intensity > 0 && backup.emission > 0);
  const powered = { ...battery, stage: 1, light: true },
    work = ceilingLighting(powered);
  assert.deepEqual(work, backup);
  assert.ok(ceilingLighting({ ...powered, ceilingBrightness: 1 }).intensity > work.intensity);
  assert.ok(ceilingLighting({ ...powered, ceilingBrightness: 0.2 }).intensity < work.intensity);
  assert.deepEqual(ceilingLighting({ ...powered, ceilingBrightness: 0 }), {
    intensity: 0,
    emission: 0,
  });
  assert.deepEqual(ceilingLighting({ ...powered, light: false }), backup);
  assert.deepEqual(ceilingLighting(command(powered, 0, 200)), backup);
  assert.equal(ceilingLighting(overheadCommand(battery, 41, 300)).intensity, 0);
  const both = overheadCommand(battery, 40, 400);
  assert.deepEqual(ceilingLighting(overheadCommand(both, 41, 500)), backup);
});

test('green brace lights require power and remain independent of the red dimmer and warm switch', () => {
  const cold = initialState();
  assert.deepEqual(braceLighting(cold), { intensity: 0, emission: 0 });
  for (const batteryId of [40, 41]) {
    const battery = overheadCommand(cold, batteryId, 100),
      lit = braceLighting(battery);
    assert.ok(lit.intensity > 0 && lit.emission > 0);
    assert.deepEqual(braceLighting({ ...battery, ceilingBrightness: 0, light: false }), lit);
    assert.deepEqual(braceLighting({ ...battery, stage: 1, light: true }), lit);
    assert.deepEqual(braceLighting(overheadCommand(battery, batteryId, 200)), braceLighting(cold));
  }
});

test('batching preserves world geometry, occlusion, and moving controls', () => {
  const scene = new THREE.Scene(),
    panel = new THREE.Group();
  panel.position.set(1, 1, -2);
  panel.rotation.y = 0.3;
  scene.add(panel);
  const metal = new THREE.MeshStandardMaterial(),
    geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  const a = new THREE.Mesh(geometry, metal),
    b = new THREE.Mesh(geometry, metal);
  a.position.x = -0.2;
  b.position.x = 0.2;
  panel.add(a, b);
  const pivot = new THREE.Group();
  pivot.userData.label = 'BAT 1';
  panel.add(pivot);
  const lever = new THREE.Mesh(geometry, metal);
  lever.position.z = 0.2;
  pivot.add(lever);
  const needle = new THREE.Group(),
    tip = new THREE.Mesh(geometry, metal);
  tip.position.y = 0.2;
  needle.add(tip);
  panel.add(needle);
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.1),
    new THREE.MeshBasicMaterial({ transparent: true }),
  );
  panel.add(label);
  scene.updateMatrixWorld(true);
  const aWorld = a.matrixWorld.clone(),
    bWorld = b.matrixWorld.clone(),
    leverBefore = lever.getWorldPosition(new THREE.Vector3()),
    tipBefore = tip.getWorldPosition(new THREE.Vector3());
  const ray = new THREE.Raycaster(new THREE.Vector3(1, 1, 3), new THREE.Vector3(0, 0, -1));
  const before = ray
    .intersectObjects(scene.children, true)
    .map((hit) => [hit.object.id, hit.distance]);
  const result = batchStaticCockpit(scene, new Set([pivot, needle]));
  assert.equal(result.combined, 1);
  assert.equal(result.geometries.length, 1);
  assert.deepEqual(a.matrixWorld.elements, aWorld.elements);
  assert.deepEqual(b.matrixWorld.elements, bWorld.elements);
  const merged = result.geometries[0].attributes.position,
    original = geometry.toNonIndexed().attributes.position;
  for (const [index, matrix] of [aWorld, bWorld].entries())
    for (let i = 0; i < original.count; i++) {
      const expected = new THREE.Vector3().fromBufferAttribute(original, i).applyMatrix4(matrix);
      const actual = new THREE.Vector3().fromBufferAttribute(merged, index * original.count + i);
      assert.ok(actual.distanceTo(expected) < 1e-6, 'static vertex moved');
    }
  assert.deepEqual(
    ray.intersectObjects(result.picking, false).map((hit) => [hit.object.id, hit.distance]),
    before,
  );
  assert.equal(label.parent, panel);
  assert.equal(lever.parent, pivot);
  pivot.rotation.y = 0.7;
  needle.rotation.z = 0.7;
  scene.updateMatrixWorld();
  assert.ok(lever.getWorldPosition(new THREE.Vector3()).distanceTo(leverBefore) > 0.1);
  assert.ok(tip.getWorldPosition(new THREE.Vector3()).distanceTo(tipBefore) > 0.1);
  assert.ok(pivot.matrixAutoUpdate && needle.matrixAutoUpdate);
  assert.equal(panel.matrixAutoUpdate, false);
});

test('hidden displays cost no uploads and newly visible displays catch up without starving others', () => {
  const screens = Array.from({ length: 10 }, (_, id) => ({ id, lastDraw: -Infinity }));
  const drawn = [];
  for (let frame = 0; frame < 30; frame++) {
    const now = (frame * 1000) / 60,
      screen = nextDisplay(screens, now, (s) => s.id < 8);
    if (screen) {
      assert.ok(now - screen.lastDraw >= 125);
      screen.lastDraw = now;
      drawn.push(screen.id);
    }
  }
  assert.ok(drawn.length <= 30);
  assert.equal(new Set(drawn).size, 8);
  assert.ok(!drawn.includes(8));
  assert.equal(nextDisplay(screens, 501, () => true).id, 8);
  assert.equal(
    nextDisplay(screens, 501, () => false),
    undefined,
  );
});

test('render size caps HiDPI cost and retains native resolution on a 1080p laptop', () => {
  assert.equal(cockpitPixelRatio(1920, 1080, 1), 1);
  for (const [width, height] of [
    [1366, 768],
    [1920, 1080],
    [2560, 1600],
    [3840, 2160],
  ]) {
    const ratio = cockpitPixelRatio(width, height, 2);
    assert.ok(ratio <= 1.5);
    assert.ok(width * height * ratio * ratio <= 2_500_001);
  }
  assert.ok(Number.isFinite(cockpitPixelRatio(0, 0, 2)));
});

test('moving capsule retains batched click colliders and lights in its local frame', () => {
  const scene = new THREE.Scene(),
    cabin = new THREE.Group();
  scene.add(cabin);
  const panel = new THREE.Group();
  panel.position.set(1, 1, -2);
  cabin.add(panel);
  const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2),
    metal = new THREE.MeshStandardMaterial();
  const a = new THREE.Mesh(geometry, metal),
    b = new THREE.Mesh(geometry, metal);
  a.position.x = -0.2;
  b.position.x = 0.2;
  panel.add(a, b);
  const light = new THREE.PointLight();
  light.position.set(0, 2, 0);
  cabin.add(light);
  const result = batchStaticCockpit(cabin, new Set(), true);
  assert.equal(result.combined, 1);
  cabin.matrixAutoUpdate = true;
  const before = a.getWorldPosition(new THREE.Vector3());
  cabin.position.set(10, 1.8, -85);
  cabin.rotation.y = 0.9;
  scene.updateMatrixWorld(true);
  const expected = cabin.localToWorld(before.clone()),
    actual = a.getWorldPosition(new THREE.Vector3());
  assert.ok(actual.distanceTo(expected) < 1e-8);
  const ray = new THREE.Raycaster(
    expected.clone().add(new THREE.Vector3(0, 0, 4)),
    new THREE.Vector3(0, 0, -1),
  );
  assert.ok(ray.intersectObjects(result.picking, false).some((hit) => hit.object === a));
  assert.ok(
    light.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(10, 3.8, -85)) < 1e-8,
  );
  assert.equal(a.parent.visible, false);
});

test('outside views omit hidden cockpit rendering and restore the same working controls on return', () => {
  const world = new THREE.Scene(),
    cabin = new THREE.Group(),
    interior = new THREE.Group(),
    exterior = new THREE.Group();
  world.add(cabin);
  cabin.add(interior, exterior);
  cabin.scale.setScalar(0.46);
  const switchPivot = new THREE.Group(),
    light = new THREE.PointLight();
  interior.add(switchPivot, light);
  switchPivot.position.set(1, 2, 3);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshBasicMaterial());
  switchPivot.add(mesh);
  let updates = 0;
  const original = interior.updateMatrixWorld;
  interior.updateMatrixWorld = function (...args) {
    updates++;
    return original.apply(this, args);
  };
  setCockpitInterior(cabin, interior, false);
  cabin.position.set(10, 5, -60);
  cabin.rotation.y = 0.6;
  switchPivot.rotation.x = 0.7;
  world.updateMatrixWorld(true);
  assert.equal(updates, 0);
  assert.equal(interior.parent, null);
  assert.equal(exterior.parent, cabin);
  const rendered = [];
  world.traverseVisible((o) => rendered.push(o));
  assert.ok(!rendered.includes(mesh));
  assert.ok(!rendered.includes(light));
  setCockpitInterior(cabin, interior, true);
  world.updateMatrixWorld(true);
  assert.equal(updates, 1);
  assert.equal(mesh.parent, switchPivot);
  assert.equal(switchPivot.rotation.x, 0.7);
  const expected = new THREE.Vector3(1, 2, 3).applyMatrix4(cabin.matrixWorld);
  assert.ok(switchPivot.getWorldPosition(new THREE.Vector3()).distanceTo(expected) < 1e-8);
  const ray = new THREE.Raycaster(
    mesh.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0, 4)),
    new THREE.Vector3(0, 0, -1),
  );
  assert.ok(ray.intersectObject(mesh).length > 0);
  setCockpitInterior(cabin, interior, true);
  assert.equal(cabin.children.filter((o) => o === interior).length, 1);
  mesh.geometry.dispose();
  mesh.material.dispose();
});
