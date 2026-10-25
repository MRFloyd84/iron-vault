import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  clampAim,
  initialWeapons,
  stepWeapons,
  torsoFollow,
  WEAPON,
  weaponBlock,
} from '../lib/weapons.ts';
import { groundHit, segmentBox } from '../lib/firing-range.ts';
import { collisionAt, WRECKS } from '../lib/walking.ts';
import { initialState } from '../lib/machine.ts';

const ready = () => {
  const s = initialState();
  return { ...s, stage: 6, service: { ...s.service, groundConnected: true } };
};

test('weapons need power, MASTER ARM, control release and leaving the hall', () => {
  const w = initialWeapons();
  assert.equal(weaponBlock(initialState(), { ...w, armed: true }, false), 'KEIN BORDSTROM');
  assert.equal(weaponBlock(ready(), w, false), 'MASTER ARM AUS');
  assert.equal(
    weaponBlock({ ...ready(), stage: 5 }, { ...w, armed: true }, false),
    'STEUERFREIGABE FEHLT',
  );
  assert.equal(weaponBlock(ready(), { ...w, armed: true }, true), 'WAFFENSPERRE HALLE');
  assert.equal(weaponBlock(ready(), { ...w, armed: true }, false), null);
});

test('guns alternate at the set rate, use ammo, heat up and lock when overheated', () => {
  let w = { ...initialWeapons(), armed: true };
  const s = ready();
  const fired = [];
  for (let t = 0; t < 1; t += 1 / 60) {
    const r = stepWeapons(w, s, 1 / 60, t, true, false, false);
    w = r.w;
    fired.push(...r.shots);
  }
  assert.ok(Math.abs(fired.length - WEAPON.rate * 2) <= 1, 'shots per second: ' + fired.length);
  assert.ok(
    fired.every((g, i) => i === 0 || g !== fired[i - 1]),
    'alternating',
  );
  assert.equal(w.ammo[0] + w.ammo[1], WEAPON.magazine * 2 - fired.length);
  assert.ok(w.heat[0] > 0.05);
  // Dauerfeuer bis zur Überhitzung
  let t = 1,
    guard = 0;
  while (!(w.overheated[0] && w.overheated[1]) && guard++ < 10000) {
    w = stepWeapons(w, s, 1 / 60, t, true, false, false).w;
    t += 1 / 60;
  }
  assert.ok(w.overheated[0] && w.overheated[1], 'barrels overheat under sustained fire');
  assert.equal(stepWeapons(w, s, 1 / 60, t, true, false, false).shots.length, 0);
  // Abkühlen bis unter 0,4 gibt wieder frei
  for (let k = 0; k < 60 * 12; k++)
    w = stepWeapons(w, s, 1 / 60, (t += 1 / 60), false, false, false).w;
  assert.ok(!w.overheated[0] && !w.overheated[1]);
});

test('no catch-up burst after a pause; reload only safe and parked in the bay', () => {
  let w = { ...initialWeapons(), armed: true };
  const s = ready();
  w = stepWeapons(w, s, 1 / 60, 0, true, false, false).w;
  const late = stepWeapons(w, s, 1 / 60, 30, true, false, false);
  assert.ok(late.shots.length <= 1, 'no burst after pause');
  w = { ...late.w, ammo: [10, 10] };
  assert.equal(stepWeapons(w, s, 1, 31, false, true, true).w.ammo[0], 10, 'armed: no reload');
  const safe = { ...w, armed: false };
  assert.equal(stepWeapons(safe, s, 1, 31, false, false, false).w.ammo[0], 10, 'outside bay');
  const r = stepWeapons(safe, s, 0.2, 31, false, true, true).w;
  assert.ok(r.reloading && Math.abs(r.ammo[0] - (10 + WEAPON.reloadRate * 0.2)) < 1e-9);
});

test('aim cone limits the mount; torso follows only beyond the margin', () => {
  assert.ok(clampAim(0.1, 0).onTarget);
  const wide = clampAim(1, 0);
  assert.equal(wide.yaw, WEAPON.coneYaw);
  assert.ok(!wide.onTarget);
  assert.equal(torsoFollow(0, 0.1), null);
  assert.ok(torsoFollow(0, 0.6) > 0 && torsoFollow(0, -0.6) < 0, 'turns towards the target');
  assert.equal(torsoFollow(40, 1.5), 45, 'respects torso limit');
});

test('hit tests: box entry face and normal, ground under ramps, wrecks block walking', () => {
  const half = new THREE.Vector3(1, 1, 0.1);
  const r = segmentBox(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -5), half);
  assert.ok(r && Math.abs(r.t - 0.49) < 1e-6 && r.normal.z === 1);
  assert.equal(segmentBox(new THREE.Vector3(3, 0, 5), new THREE.Vector3(3, 0, -5), half), null);
  const g = groundHit(new THREE.Vector3(0, 5, -80), new THREE.Vector3(0, -10, -90));
  assert.ok(g && Math.abs(g.point.y - -2.6) < 0.2, 'hits the yard floor');
  for (const w of WRECKS) assert.equal(collisionAt(w.x, w.z, 0), 'Fahrzeugwrack');
});

test('parked sister IV-02 blocks walking only when its model is present', async () => {
  const { SISTER, sisterPark } = await import('../lib/walking.ts');
  // Ohne Modell (öffentliches Repository) bleibt der Stellplatz frei.
  sisterPark.present = false;
  assert.equal(collisionAt(SISTER.x, SISTER.z, 0), null);
  sisterPark.present = true;
  assert.equal(collisionAt(SISTER.x, SISTER.z, 0), 'IV-02 (abgestellt)');
  assert.equal(collisionAt(0, SISTER.z, 0), null, 'test road stays clear');
  sisterPark.present = false;
});

const sisterFile = new URL('../public/models/iv-02-sister.glb', import.meta.url);
test(
  'local IV-02 model is browser friendly (only if the licensed file exists)',
  { skip: !(await import('node:fs')).existsSync(sisterFile) && 'IV-02-Modell nicht vorhanden' },
  async () => {
    const glb = (await import('node:fs')).readFileSync(sisterFile);
    const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString());
    assert.ok(json.extras.triangles < 300000, 'browser-friendly triangle count');
    assert.deepEqual(
      json.nodes.map((n) => n.name),
      ['body', 'detached_arm'],
    );
  },
);
