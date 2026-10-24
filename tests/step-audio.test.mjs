import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { StepAudio } from '../lib/step-audio.ts';
import { initialState } from '../lib/machine.ts';
function setup(delayed = false) {
  const sources = [],
    output = { name: 'master mute bus' };
  let finish;
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
  });
  const ctx = {
    state: 'running',
    currentTime: 0,
    createGain: () => ({
      gain: param(),
      connect(n) {
        this.output = n;
      },
      disconnect() {},
    }),
    createBufferSource() {
      return {
        playbackRate: param(),
        stops: [],
        connect(n) {
          this.output = n;
        },
        disconnect() {},
        start() {
          sources.push(this);
        },
        stop(t) {
          this.stops.push(t);
        },
      };
    },
    decodeAudioData: () =>
      delayed
        ? new Promise((resolve) => {
            finish = () => resolve({ duration: 1.285 });
          })
        : Promise.resolve({ duration: 1.285 }),
  };
  const audio = new StepAudio(ctx, output, Promise.resolve(new ArrayBuffer(1))),
    s = initialState();
  return {
    audio,
    ctx,
    sources,
    output,
    state: (n) => ({ ...s, walk: { ...s.walk, step: n } }),
    resolve: () => finish(),
  };
}
test('one impact per support transfer, silent at standstill and no catch-up burst', async () => {
  const f = setup();
  await setImmediate();
  f.audio.update(f.state(0));
  assert.equal(f.sources.length, 0);
  f.audio.update(f.state(1));
  assert.equal(f.sources.length, 1);
  assert.equal(f.sources[0].loop, undefined);
  for (let i = 0; i < 30; i++) f.audio.update(f.state(1));
  assert.equal(f.sources.length, 1);
  assert.equal(f.sources[0].stops.length, 0, 'last impact may decay naturally');
  f.audio.update(f.state(9));
  assert.equal(f.sources.length, 2);
  assert.equal(f.sources[1].output.output, f.output);
  f.audio.update(f.state(10));
  assert.notEqual(f.sources[1].playbackRate.value, f.sources[2].playbackRate.value);
  f.audio.update(f.state(0));
  assert.equal(f.sources.length, 3);
  f.audio.dispose();
  assert.ok(f.sources.every((v) => v.stops.length));
});
test('late decoding, suspension and disposal cannot replay past steps', async () => {
  const f = setup(true);
  await setImmediate();
  f.audio.update(f.state(0));
  f.audio.update(f.state(1));
  f.resolve();
  await setImmediate();
  assert.equal(f.sources.length, 0);
  f.audio.update(f.state(1));
  assert.equal(f.sources.length, 0);
  f.audio.update(f.state(2));
  assert.equal(f.sources.length, 1);
  f.ctx.state = 'suspended';
  f.audio.update(f.state(3));
  f.ctx.state = 'running';
  f.audio.update(f.state(3));
  assert.equal(f.sources.length, 1);
  f.audio.update(f.state(4));
  assert.equal(f.sources.length, 2);
  f.audio.dispose();
  f.audio.update(f.state(5));
  assert.equal(f.sources.length, 2);
  const g = setup(true);
  await setImmediate();
  g.audio.update(g.state(0));
  g.audio.dispose();
  g.resolve();
  await setImmediate();
  g.audio.update(g.state(1));
  assert.equal(g.sources.length, 0);
});
test('continuous walking bounds overlapping decay tails', async () => {
  const f = setup();
  await setImmediate();
  f.audio.update(f.state(0));
  for (let i = 1; i <= 20; i++) {
    f.ctx.currentTime = i * 0.59;
    f.audio.update(f.state(i));
  }
  assert.equal(f.sources.length, 20);
  assert.equal(f.sources.filter((s) => !s.stops.length).length, 3);
  f.audio.dispose();
  assert.ok(f.sources.every((s) => s.stops.length));
});
