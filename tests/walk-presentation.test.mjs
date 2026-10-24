import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WalkPresentation } from '../lib/walk-presentation.ts';
const pose = (time) => ({
  x: 0,
  z: time === 0 ? 0 : (-2 * time) / 1000,
  yaw: time / 10000,
  height: 0,
  pitch: 0,
  roll: 0,
  phase: (2 * time) / 2600,
  speed: 2,
  turnRate: 0.1,
});

test('70-ms samples produce even motion at 30, 60 and 144 display frames/s', () => {
  for (const fps of [30, 60, 144]) {
    const view = new WalkPresentation(),
      out = pose(0),
      velocities = [],
      oldVelocities = [];
    let previous = 0,
      old = 0,
      previousOld = 0;
    for (let i = 0; i < fps * 4; i++) {
      const now = (i * 1000) / fps,
        time = Math.floor(now / 70) * 70,
        source = pose(time);
      view.sample(source, time, now, out);
      old += (source.z - old) * (1 - Math.exp(-14 / fps));
      if (now > 1000) {
        velocities.push((out.z - previous) * fps);
        oldVelocities.push((old - previousOld) * fps);
      }
      previous = out.z;
      previousOld = old;
      if (now >= 100) assert.ok(Math.abs(out.phase - (2 * (now - 100)) / 2600) < 1e-12);
    }
    const spread = (a) => Math.max(...a) - Math.min(...a);
    assert.ok(spread(velocities) < 1e-10);
    assert.ok(spread(oldVelocities) > 0.6);
    if (fps === 60)
      console.log({
        oldVisibleSpeedRange: [Math.min(...oldVelocities), Math.max(...oldVelocities)],
        newVisibleSpeedRange: [Math.min(...velocities), Math.max(...velocities)],
      });
  }
});

test('stop/collision samples never extrapolate; missing ticks hold the last safe pose', () => {
  const view = new WalkPresentation(),
    out = pose(0);
  for (let now = 0; now <= 1400; now += 10) {
    const time = Math.min(700, Math.floor(now / 70) * 70),
      source = pose(time);
    if (time === 700) source.speed = 0;
    view.sample(source, time, now, out);
    assert.ok(out.z >= -1.4 - 1e-10);
  }
  assert.equal(out.z, -1.4);
  assert.equal(out.speed, 0);
});

test('buffer copies snapshots, tolerates jitter, resumes and resets without replaying stale movement', () => {
  const view = new WalkPresentation(),
    out = pose(0),
    source = pose(0);
  view.sample(source, 0, 0, out);
  source.z = 99;
  view.sample(pose(70), 70, 70, out);
  assert.ok(out.z === 0);
  for (const now of [150, 213, 298, 355, 432]) {
    const time = now - 10;
    view.sample(pose(time), time, now, out);
    assert.ok(out.z >= pose(time).z);
  }
  view.sample(pose(9000), 9000, 9000, out);
  assert.deepEqual(out, pose(9000));
  view.sample(pose(0), 0, 9010, out);
  assert.deepEqual(out, pose(0));
});
