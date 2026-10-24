import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { ServiceAudio } from '../lib/service-audio.ts';
import { initialState, serviceCommand, overheadCommand } from '../lib/machine.ts';
import { serviceWarning } from '../lib/service-systems.ts';

function setup(delayed = false) {
  const sources = [],
    decodes = [];
  const output = { name: 'master mute bus' };
  const param = () => ({
    value: 0,
    setValueAtTime(v) {
      this.value = v;
    },
    linearRampToValueAtTime(v) {
      this.value = v;
    },
    setTargetAtTime(v) {
      this.value = v;
    },
    cancelScheduledValues() {},
  });
  const ctx = {
    currentTime: 0,
    state: 'running',
    createGain() {
      return {
        gain: param(),
        connect(node) {
          this.output = node;
        },
        disconnect() {},
      };
    },
    createBufferSource() {
      return {
        playbackRate: param(),
        stops: [],
        connect(node) {
          this.output = node;
        },
        disconnect() {},
        start(when, offset) {
          this.offset = offset;
          sources.push(this);
        },
        stop(when) {
          this.stops.push(when);
        },
      };
    },
    decodeAudioData(bytes) {
      const effect = new Uint8Array(bytes)[0],
        buffer = { effect, duration: [4.8, 0.425, 0.445, 6, 4, 2.8, 1, 8][effect] };
      return delayed
        ? new Promise((resolve) => decodes.push(() => resolve(buffer)))
        : Promise.resolve(buffer);
    },
  };
  const bytes = Object.fromEntries(
    ['pump', 'on', 'off', 'warning', 'leak', 'calibration', 'lock', 'gate'].map((name, i) => [
      name,
      Promise.resolve(new Uint8Array([i]).buffer),
    ]),
  );
  return {
    audio: new ServiceAudio(ctx, output, bytes),
    ctx,
    sources,
    output,
    resolve() {
      decodes.forEach((r) => r());
    },
    of(i) {
      return sources.filter((s) => s.buffer.effect === i);
    },
  };
}
const running = () => {
  const s = serviceCommand(initialState(), 68);
  return {
    ...s,
    simAt: 0,
    stage: 2,
    coolantFlow: 42.8,
    service: { ...s.service, pumpAFlow: 42.8 },
    overhead: { ...s.overhead, coolantValve: true },
  };
};
test('each coolant pump has its own loop, follows actual flow and fades independently', async () => {
  const f = setup();
  let s = running();
  f.audio.update(s);
  await setImmediate();
  assert.equal(f.of(0).length, 1);
  const a = f.of(0)[0];
  assert.equal(a.loop, true);
  const before = a.output.gain.value,
    rate = a.playbackRate.value;
  s = { ...s, service: { ...s.service, pumpAFlow: 62 } };
  f.audio.update(s);
  assert.ok(a.output.gain.value > before);
  assert.ok(a.playbackRate.value > rate);
  s = { ...s, service: { ...s.service, pumpAFlow: 22, pumpBFlow: 20 } };
  f.audio.update(s);
  await setImmediate();
  assert.equal(f.of(0).length, 2);
  const b = f.of(0)[1];
  assert.equal(b.offset, 2.1);
  f.audio.update({ ...s, service: { ...s.service, pumpAFlow: 0, pumpBFlow: 42.8 } });
  assert.equal(a.stops.length, 1);
  assert.equal(b.stops.length, 0);
  f.audio.update({ ...s, service: { ...s.service, pumpAFlow: 0, pumpBFlow: 0 } });
  assert.equal(b.stops.length, 1);
});
test('contactor recordings trigger on actual changes, never repeated polls or rejected commands', async () => {
  const f = setup();
  let s = initialState();
  f.audio.update(s);
  await setImmediate();
  assert.equal(f.sources.length, 0);
  s = serviceCommand(s, 68);
  f.audio.update(s);
  await setImmediate();
  assert.equal(f.of(1).length, 1);
  for (let i = 0; i < 50; i++) f.audio.update(s);
  await setImmediate();
  assert.equal(f.of(1).length, 1);
  s = overheadCommand(s, 51, 0);
  assert.equal(s.error, true);
  f.audio.update(s);
  await setImmediate();
  assert.equal(f.of(1).length, 1);
  s = serviceCommand(s, 68);
  f.audio.update(s);
  await setImmediate();
  assert.equal(f.of(2).length, 1);
  f.ctx.currentTime = 2;
  f.audio.update(s);
  f.audio.update(s);
  assert.equal(f.of(2).length, 1);
});
test('pump alarm loops, acknowledgement stops it without repairing the pump, and new faults rearm', async () => {
  const f = setup();
  let s = running();
  f.audio.update(s);
  s = serviceCommand(s, 66);
  f.audio.update(s);
  await setImmediate();
  assert.equal(f.of(3).length, 1);
  assert.equal(f.of(3)[0].loop, true);
  for (let i = 0; i < 30; i++) f.audio.update(s);
  assert.equal(f.of(3).length, 1);
  s = serviceCommand(s, 67);
  f.audio.update(s);
  assert.equal(s.service.pumpAFault, true);
  assert.equal(f.of(3)[0].stops.length, 1);
  assert.equal(serviceWarning(s), false);
  s = serviceCommand(serviceCommand(s, 66), 66);
  f.audio.update(s);
  await setImmediate();
  assert.equal(f.of(3).length, 2);
});
test('overload acknowledgement preserves the tripped breaker and a separate new fault sounds again', async () => {
  const f = setup();
  let s = running();
  s = {
    ...s,
    service: {
      ...s.service,
      groundConnected: true,
      trips: { ground: false, apu: true, main: false },
    },
  };
  f.audio.update(s);
  await setImmediate();
  assert.equal(f.of(3).length, 1);
  s = serviceCommand(s, 67);
  f.audio.update(s);
  assert.equal(s.service.trips.apu, true);
  assert.equal(serviceWarning(s), false);
  assert.equal(f.of(3)[0].stops.length, 1);
  s = serviceCommand(s, 66);
  f.audio.update(s);
  await setImmediate();
  assert.equal(serviceWarning(s), true);
  assert.equal(f.of(3).length, 2);
});
test('low battery warning is acknowledged separately and clears on recovery', () => {
  let s = initialState();
  s = {
    ...s,
    simAt: 0,
    service: { ...s.service, batteryAh: [5, 0] },
    overhead: { ...s.overhead, battery1: true },
  };
  assert.equal(serviceWarning(s), true);
  s = serviceCommand(s, 67);
  assert.equal(serviceWarning(s), false);
  s = serviceCommand(s, 68);
  assert.deepEqual(s.service.acknowledgedWarnings, []);
  s = serviceCommand(s, 68);
  assert.equal(serviceWarning(s), true);
});
test('late decoding cannot resurrect an acknowledged alarm, stopped pump or stale contactor', async () => {
  const f = setup(true);
  let s = running();
  f.audio.update(initialState());
  f.audio.update(s);
  s = serviceCommand(s, 66);
  f.audio.update(s);
  await setImmediate();
  f.ctx.currentTime = 2;
  s = serviceCommand(s, 67);
  s = { ...s, service: { ...s.service, pumpAFlow: 0 } };
  f.audio.update(s);
  f.resolve();
  await setImmediate();
  assert.equal(f.sources.length, 0);
});
test('service sounds use the shared mute bus and disposal invalidates pending playback', async () => {
  const f = setup();
  f.audio.update(initialState());
  f.audio.update(serviceCommand(running(), 66));
  await setImmediate();
  assert.ok(f.sources.length >= 3);
  for (const s of f.sources) assert.equal(s.output.output, f.output);
  f.audio.dispose();
  for (const s of f.sources) assert.ok(s.stops.length > 0);
  const g = setup(true);
  g.audio.update(serviceCommand(running(), 66));
  await setImmediate();
  g.audio.dispose();
  g.resolve();
  await setImmediate();
  assert.equal(g.sources.length, 0);
});

test('leak hiss follows real loss and stops on isolation despite an acknowledged fault', async () => {
  const f = setup();
  let s = serviceCommand(running(), 71);
  f.audio.update(s);
  await setImmediate();
  assert.equal(f.of(4).length, 1);
  assert.equal(f.of(4)[0].loop, true);
  s = serviceCommand(s, 67);
  f.audio.update(s);
  assert.equal(f.of(4)[0].stops.length, 0);
  s = serviceCommand(s, 72);
  f.audio.update(s);
  assert.equal(f.of(4)[0].stops.length, 1);
  assert.equal(s.service.coolantLeak, true);
  s = serviceCommand(s, 72);
  f.audio.update(s);
  await setImmediate();
  assert.equal(f.of(4).length, 2);
  f.audio.dispose();
  assert.ok(f.of(4)[1].stops.length);
});

const calibrating = () => {
  const s = running();
  return {
    ...s,
    stage: 5,
    actualPressure: 210,
    overhead: { ...s.overhead, avionics: true, hydPump: true, reactorArm: true, mainGen: true },
    mobility: { ...s.mobility, helmet: true, calibration: 'running', elapsed: 0 },
  };
};
test('neurohelm recording loops only during calibration and ends on completion or interruption', async () => {
  for (const phase of ['ready', 'idle']) {
    const f = setup();
    let s = calibrating();
    f.audio.update(s);
    await setImmediate();
    assert.equal(f.of(5).length, 1);
    assert.equal(f.of(5)[0].loop, true);
    s = { ...s, mobility: { ...s.mobility, elapsed: 4 } };
    f.audio.update(s);
    await setImmediate();
    assert.equal(f.of(5).length, 1);
    s = { ...s, mobility: { ...s.mobility, calibration: phase } };
    f.audio.update(s);
    assert.equal(f.of(5)[0].stops.length, 1);
    f.audio.dispose();
  }
});
test('restarting calibration replaces the voice; losing avionics or disconnecting the helmet silences it', async () => {
  const f = setup();
  let s = calibrating();
  s = { ...s, mobility: { ...s.mobility, elapsed: 5 } };
  f.audio.update(s);
  await setImmediate();
  assert.equal(f.of(5)[0].offset, 5 % 2.8);
  s = { ...s, mobility: { ...s.mobility, elapsed: 0 } };
  f.audio.update(s);
  await setImmediate();
  assert.equal(f.of(5).length, 2);
  assert.equal(f.of(5)[0].stops.length, 1);
  f.audio.update({ ...s, overhead: { ...s.overhead, avionics: false } });
  assert.equal(f.of(5)[1].stops.length, 1);
  f.audio.update(s);
  await setImmediate();
  f.audio.update({ ...s, mobility: { ...s.mobility, helmet: false } });
  assert.equal(f.of(5)[2].stops.length, 1);
  f.audio.dispose();
});
test('parking recording plays once on each completed travel, including unpowered spring closure', async () => {
  const f = setup();
  let s = initialState();
  f.audio.update(s);
  await setImmediate();
  assert.equal(f.of(6).length, 0);
  for (const [moving, complete] of [
    ['releasing', 'released'],
    ['locking', 'locked'],
  ]) {
    s = { ...s, mobility: { ...s.mobility, restraints: moving } };
    f.audio.update(s);
    await setImmediate();
    const before = f.of(6).length;
    s = { ...s, mobility: { ...s.mobility, restraints: complete } };
    f.audio.update(s);
    await setImmediate();
    assert.equal(f.of(6).length, before + 1);
    assert.equal(f.of(6).at(-1).loop, false);
    for (let i = 0; i < 30; i++) f.audio.update({ ...s, error: true });
    await setImmediate();
    assert.equal(f.of(6).length, before + 1);
    f.ctx.currentTime += 2;
    f.audio.update(s);
  }
  assert.equal(f.of(6).length, 2);
  f.audio.dispose();
});
test('late decoding cannot replay completed calibration, isolated leak or stale latch', async () => {
  const f = setup(true);
  let s = serviceCommand(calibrating(), 71);
  s = { ...s, mobility: { ...s.mobility, restraints: 'locking' } };
  f.audio.update(s);
  await setImmediate();
  s = { ...s, mobility: { ...s.mobility, restraints: 'locked' } };
  f.audio.update(s);
  f.ctx.currentTime = 3;
  s = serviceCommand(s, 72);
  s = { ...s, mobility: { ...s.mobility, calibration: 'idle' } };
  f.audio.update(s);
  f.resolve();
  await setImmediate();
  assert.equal(f.of(4).length, 0);
  assert.equal(f.of(5).length, 0);
  assert.equal(f.of(6).length, 0);
  f.audio.dispose();
});
test('new recordings use the master mute bus and are disposed without restarting', async () => {
  const f = setup();
  let s = serviceCommand(calibrating(), 71);
  s = { ...s, mobility: { ...s.mobility, restraints: 'locking' } };
  f.audio.update(s);
  await setImmediate();
  s = { ...s, mobility: { ...s.mobility, restraints: 'locked' } };
  f.audio.update(s);
  await setImmediate();
  for (const effect of [4, 5, 6]) {
    assert.equal(f.of(effect).length, 1);
    assert.equal(f.of(effect)[0].output.output, f.output);
  }
  f.audio.dispose();
  for (const source of f.sources) assert.ok(source.stops.length > 0);
  f.audio.update(s);
  await setImmediate();
  for (const effect of [4, 5, 6]) assert.equal(f.of(effect).length, 1);
});

test('hall gate motor follows travel, works independently of Mech power and stops at either limit', async () => {
  const f = setup();
  let s = initialState();
  s = { ...s, hangar: { gate: 'opening', position: 0.3 } };
  f.audio.update(s);
  await setImmediate();
  assert.equal(f.of(7).length, 1);
  assert.equal(f.of(7)[0].offset, 3);
  for (let i = 0; i < 20; i++) f.audio.update(s);
  assert.equal(f.of(7).length, 1);
  s = { ...s, hangar: { gate: 'stopped', position: 0.3 } };
  f.audio.update(s);
  assert.equal(f.of(7)[0].stops.length, 1);
  s = { ...s, hangar: { gate: 'closing', position: 0.3 } };
  f.audio.update(s);
  await setImmediate();
  assert.equal(f.of(7).length, 2);
  s = { ...s, hangar: { gate: 'closed', position: 0 } };
  f.audio.update(s);
  assert.equal(f.of(7)[1].stops.length, 1);
  f.audio.dispose();
});

test('calibration and warning foregrounds lower pumps, then restore them without restarting', async () => {
  const f = setup();
  let s = running();
  f.audio.update(s);
  await setImmediate();
  const pump = f.of(0)[0],
    normal = pump.output.gain.value;
  const calibrating = {
    ...s,
    overhead: { ...s.overhead, avionics: true },
    mobility: { ...s.mobility, helmet: true, calibration: 'running' },
  };
  f.audio.update(calibrating);
  await setImmediate();
  assert.ok(pump.output.gain.value < normal * 0.6);
  assert.equal(f.of(5).length, 1);
  f.audio.update(s);
  assert.equal(pump.output.gain.value, normal);
  assert.equal(f.of(0).length, 1);
  s = serviceCommand(s, 71);
  f.audio.update(s);
  await setImmediate();
  assert.ok(pump.output.gain.value < normal * 0.6);
  assert.equal(f.of(3).length, 1);
  s = serviceCommand(s, 67);
  f.audio.update(s);
  assert.equal(pump.output.gain.value, normal);
  assert.equal(f.of(0).length, 1);
});
