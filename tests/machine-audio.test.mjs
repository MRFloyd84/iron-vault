import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { MachineAudio } from '../lib/machine-audio.ts';
import { initialState, overheadCommand } from '../lib/machine.ts';
import { DisplayBoot } from '../lib/display-boot.ts';

function setup() {
  const saved = { fetch: globalThis.fetch, AudioContext: globalThis.AudioContext },
    sources = [],
    oscillators = [],
    requests = [];
  const param = () => ({
    value: 0,
    setValueAtTime(v) {
      this.value = v;
    },
    linearRampToValueAtTime(v) {
      this.value = v;
    },
    exponentialRampToValueAtTime(v) {
      this.value = v;
    },
    setTargetAtTime(v) {
      this.value = v;
    },
    cancelScheduledValues() {},
  });
  const node = () => ({
    connect(to) {
      this.output = to;
    },
    disconnect() {},
  });
  const voice = () => ({
    ...node(),
    playbackRate: param(),
    frequency: param(),
    stops: [],
    start(when, offset) {
      this.started = true;
      this.offset = offset;
    },
    stop(when) {
      this.stops.push(when);
    },
  });
  const ctx = {
    currentTime: 0,
    state: 'running',
    destination: { name: 'speakers' },
    createGain: () => ({ ...node(), gain: param() }),
    createBiquadFilter: () => ({ ...node(), frequency: param(), Q: param(), type: '' }),
    createStereoPanner: () => ({ ...node(), pan: param() }),
    createOscillator() {
      const v = voice();
      oscillators.push(v);
      return v;
    },
    createBufferSource() {
      const v = voice();
      sources.push(v);
      return v;
    },
    decodeAudioData(bytes) {
      return Promise.resolve({ file: new TextDecoder().decode(bytes), duration: 20 });
    },
    resume() {
      this.state = 'running';
      return Promise.resolve();
    },
    close() {
      this.state = 'closed';
      return Promise.resolve();
    },
  };
  globalThis.fetch = async (url) => {
    requests.push(url);
    return {
      ok: true,
      arrayBuffer: async () =>
        new TextEncoder().encode(new URL(url, 'https://example.test').pathname).buffer,
    };
  };
  globalThis.AudioContext = function () {
    return ctx;
  };
  const statuses = [],
    audio = new MachineAudio((status) => statuses.push(status));
  return {
    audio,
    ctx,
    sources,
    oscillators,
    statuses,
    requests,
    of(file) {
      return sources.filter((s) => s.buffer?.file === '/audio/' + file && s.started);
    },
    restore() {
      audio.dispose();
      Object.assign(globalThis, saved);
    },
  };
}

// 19 Bestandsgeräusche + 16 Hydraulik-Ereignisse + Hydraulikpumpe (v56) + 7 Drohne (v60.1)
test('all 43 active sound paths are preloaded through versioned URLs', async () => {
  const f = setup();
  try {
    await setImmediate();
    const paths = f.requests.map((url) => new URL(url, 'https://example.test'));
    assert.equal(paths.length, 43);
    assert.equal(new Set(paths.map((url) => url.pathname)).size, 43);
    assert.ok(paths.every((url) => url.searchParams.has('v')));
  } finally {
    f.restore();
  }
});

test('display boot plays once on first battery power, follows the existing clock and does not restart on source transfer', async () => {
  const f = setup(),
    boot = new DisplayBoot();
  try {
    let s = initialState();
    f.audio.update(s);
    await f.audio.enable();
    await setImmediate();
    assert.equal(f.of('display-boot.mp3').length, 0);
    const sync = (now) => {
      f.audio.update(s);
      boot.update(s, now);
      f.audio.setDisplayBoot(boot.phase, boot.elapsed, boot.cycle);
    };
    s = overheadCommand(s, 40, 1000);
    sync(1000);
    await setImmediate();
    const voice = f.of('display-boot.mp3')[0];
    assert.ok(voice);
    assert.equal(voice.offset, 0);
    assert.equal(voice.output.output, f.audio.master);
    assert.equal(!!voice.loop, false);
    s = overheadCommand(s, 41, 2000);
    sync(2000);
    s = overheadCommand(s, 40, 3000);
    sync(3000);
    for (let i = 0; i < 10; i++) sync(4000 + i * 100);
    await setImmediate();
    assert.equal(f.of('display-boot.mp3').length, 1);
    sync(14000);
    assert.equal(boot.phase, 'ready');
    assert.equal(voice.stops.length, 1);
    sync(15000);
    await setImmediate();
    assert.equal(f.of('display-boot.mp3').length, 1);
  } finally {
    f.restore();
  }
});

test('power loss stops boot before the next render; a new display cycle restarts from zero and respects mute', async () => {
  const f = setup(),
    boot = new DisplayBoot();
  try {
    let s = overheadCommand(initialState(), 40, 0);
    f.audio.update(s);
    await f.audio.enable();
    boot.update(s, 0);
    f.audio.setDisplayBoot(boot.phase, boot.elapsed, boot.cycle);
    await setImmediate();
    const old = f.of('display-boot.mp3')[0];
    s = overheadCommand(s, 40, 1000);
    f.audio.update(s);
    assert.equal(old.stops.length, 1);
    boot.update(s, 1000);
    f.audio.setDisplayBoot(boot.phase, boot.elapsed, boot.cycle);
    f.audio.setMuted(true);
    s = overheadCommand(s, 40, 1100);
    f.audio.update(s);
    boot.update(s, 1100);
    f.audio.setDisplayBoot(boot.phase, boot.elapsed, boot.cycle);
    await setImmediate();
    assert.equal(f.of('display-boot.mp3').length, 2);
    assert.equal(f.of('display-boot.mp3')[1].offset, 0);
    assert.equal(boot.cycle, 2);
    assert.equal(f.audio.master.gain.value, 0);
  } finally {
    f.restore();
  }
});

test('enabling audio partway through boot seeks to current display time rather than replaying the beginning', async () => {
  const f = setup();
  try {
    f.audio.update(overheadCommand(initialState(), 40, 0));
    f.audio.setDisplayBoot('boot', 5.4, 1);
    await f.audio.enable();
    await setImmediate();
    assert.equal(f.of('display-boot.mp3')[0].offset, 5.4);
  } finally {
    f.restore();
  }
});

test('delayed boot decoding cannot resurrect an aborted or already completed display boot', async () => {
  for (const end of ['off', 'ready', 'dispose']) {
    const f = setup();
    try {
      let resolveBoot;
      const decode = f.ctx.decodeAudioData;
      f.ctx.decodeAudioData = (bytes) =>
        new TextDecoder().decode(bytes) === '/audio/display-boot.mp3'
          ? new Promise((resolve) => {
              resolveBoot = resolve;
            })
          : decode(bytes);
      f.audio.setDisplayBoot('boot', 0, 1);
      await f.audio.enable();
      await setImmediate();
      if (end === 'dispose') f.audio.dispose();
      else f.audio.setDisplayBoot(end, end === 'ready' ? 13 : 0, 1);
      resolveBoot({ file: '/audio/display-boot.mp3', duration: 12.3 });
      await setImmediate();
      assert.equal(f.of('display-boot.mp3').length, 0);
    } finally {
      f.restore();
    }
  }
});

test('browser audio suspension stops the boot voice and resumes at current display time', async () => {
  const f = setup();
  try {
    f.audio.update(overheadCommand(initialState(), 40, 0));
    await f.audio.enable();
    f.audio.setDisplayBoot('boot', 0, 1);
    await setImmediate();
    const old = f.of('display-boot.mp3')[0];
    f.ctx.state = 'suspended';
    f.ctx.onstatechange();
    assert.equal(old.stops.length, 1);
    f.audio.setDisplayBoot('boot', 4.2, 1);
    await setImmediate();
    assert.equal(f.of('display-boot.mp3').length, 1);
    await f.audio.enable();
    await setImmediate();
    assert.equal(f.of('display-boot.mp3').length, 2);
    assert.equal(f.of('display-boot.mp3')[1].offset, 4.2);
  } finally {
    f.restore();
  }
});

test('first sound-button click activates audio and confirms it; subsequent clicks mute and restore the same bus', async () => {
  const f = setup();
  try {
    f.ctx.state = 'suspended';
    await f.audio.toggleSound();
    await setImmediate();
    assert.equal(f.ctx.state, 'running');
    assert.equal(f.audio.muted, false);
    assert.equal(f.statuses.at(-1), 'active');
    assert.ok(f.audio.master.gain.value > 0);
    assert.ok(
      f.oscillators.some((o) => o.stops.length && o.started),
      'activation confirmation is scheduled',
    );
    const master = f.audio.master;
    await f.audio.toggleSound();
    assert.equal(f.audio.muted, true);
    assert.equal(f.statuses.at(-1), 'muted');
    await f.audio.toggleSound();
    assert.equal(f.audio.muted, false);
    assert.equal(f.audio.master, master);
    assert.equal(f.statuses.at(-1), 'active');
  } finally {
    f.restore();
  }
});

test('browser interruption is reported and resumed without replacing the existing sound graph or unmuting', async () => {
  const f = setup();
  try {
    await f.audio.enable();
    await setImmediate();
    const master = f.audio.master,
      count = f.of('main-drive-loop.ogg').length;
    for (const state of ['suspended', 'interrupted']) {
      f.ctx.state = state;
      f.ctx.onstatechange();
      assert.equal(f.statuses.at(-1), 'blocked');
      await f.audio.enable();
      assert.equal(f.ctx.state, 'running');
      assert.equal(f.statuses.at(-1), 'active');
    }
    f.audio.setMuted(true);
    f.ctx.state = 'interrupted';
    f.ctx.onstatechange();
    await f.audio.enable();
    assert.equal(f.statuses.at(-1), 'muted');
    assert.equal(f.audio.master.gain.value, 0);
    assert.equal(f.audio.master, master);
    assert.equal(f.of('main-drive-loop.ogg').length, count);
  } finally {
    f.restore();
  }
});

test('failed browser unlock stays visible and a later sound-button gesture retries instead of muting', async () => {
  const f = setup();
  try {
    f.ctx.state = 'suspended';
    f.ctx.resume = async () => {
      throw new Error('User gesture required');
    };
    await assert.rejects(f.audio.toggleSound());
    assert.equal(f.statuses.at(-1), 'blocked');
    assert.equal(f.audio.muted, false);
    f.ctx.resume = async () => {
      f.ctx.state = 'running';
    };
    await f.audio.toggleSound();
    assert.equal(f.statuses.at(-1), 'active');
    f.audio.dispose();
    assert.equal(f.ctx.onstatechange, null);
  } finally {
    f.restore();
  }
});

test('master chain carries fan, engine, steps and mute without repeated step impacts', async () => {
  const f = setup();
  try {
    let s = initialState();
    f.audio.update(s);
    await f.audio.enable();
    await setImmediate();
    assert.equal(f.audio.fan.gain.value, 0);
    assert.equal(f.of('main-drive-loop.ogg')[0].output.gain.value, 0);
    s = { ...overheadCommand(s, 40, 0), stage: 4, fanLevel: 3 };
    f.audio.update(s);
    f.audio.setDisplayBoot('ready', 13, 1);
    assert.ok(f.audio.fan.gain.value > 0);
    assert.ok(f.of('main-drive-loop.ogg')[0].output.gain.value > 0);
    assert.equal(f.audio.fan.output, f.audio.master);
    assert.equal(f.of('main-drive-loop.ogg')[0].output.output, f.audio.master);
    const before = f.oscillators.length;
    s = { ...s, walk: { ...s.walk, step: 1, speed: 1 } };
    f.audio.update(s);
    assert.equal(f.of('mech-step.ogg').length, 1);
    assert.equal(f.oscillators.length, before);
    for (let i = 0; i < 20; i++) f.audio.update(s);
    assert.equal(f.of('mech-step.ogg').length, 1);
    f.audio.setMuted(true);
    assert.equal(f.audio.master.gain.value, 0);
    assert.equal(f.of('mech-step.ogg')[0].output.output, f.audio.master);
    f.audio.setMuted(false);
    assert.ok(f.audio.master.gain.value > 0);
    f.audio.update({ ...s, stage: 0, fanLevel: 0 });
    assert.equal(f.audio.fan.gain.value, 0);
    assert.equal(f.of('main-drive-loop.ogg')[0].output.gain.value, 0);
  } finally {
    f.restore();
  }
});

test('new fan loop stays silent during boot and runs continuously afterwards even on batteries at stage zero', async () => {
  const f = setup(),
    boot = new DisplayBoot();
  try {
    const s = overheadCommand(initialState(), 40, 0);
    f.audio.update(s);
    await f.audio.enable();
    await setImmediate();
    boot.update(s, 0);
    f.audio.setDisplayBoot(boot.phase, boot.elapsed, boot.cycle);
    assert.equal(f.audio.fan.gain.value, 0);
    boot.update(s, 12999);
    f.audio.setDisplayBoot(boot.phase, boot.elapsed, boot.cycle);
    assert.equal(f.audio.fan.gain.value, 0);
    boot.update(s, 13000);
    f.audio.setDisplayBoot(boot.phase, boot.elapsed, boot.cycle);
    assert.ok(f.audio.fan.gain.value > 0);
    assert.equal(s.stage, 0);
    const voice = f.of('display-fan-loop.ogg')[0];
    assert.equal(voice.loop, true);
    assert.equal(voice.output, f.audio.fan);
    for (let i = 0; i < 50; i++) {
      f.audio.update(s);
      f.audio.setDisplayBoot('ready', 13, 1);
    }
    await setImmediate();
    assert.equal(f.of('display-fan-loop.ogg').length, 1);
    assert.equal(voice.stops.length, 0);
    assert.equal(f.of('industrial-fan-loop.ogg').length, 0);
  } finally {
    f.restore();
  }
});

test('postboot fan keeps the existing speed controls and master mute, and fades out on power loss', async () => {
  const f = setup();
  try {
    let s = overheadCommand(initialState(), 40, 0);
    f.audio.update(s);
    await f.audio.enable();
    await setImmediate();
    f.audio.setDisplayBoot('ready', 13, 1);
    s = { ...s, fanLevel: 1 };
    f.audio.update(s);
    const slow = f.audio.fan.gain.value;
    s = { ...s, fanLevel: 3 };
    f.audio.update(s);
    assert.ok(f.audio.fan.gain.value > slow);
    s = { ...s, fanLevel: 0 };
    f.audio.update(s);
    assert.equal(f.audio.fan.gain.value, 0);
    s = { ...s, fanLevel: 2 };
    f.audio.update(s);
    f.audio.setMuted(true);
    assert.equal(f.audio.master.gain.value, 0);
    f.audio.setDisplayBoot('ready', 13, 1);
    assert.equal(f.audio.master.gain.value, 0);
    f.audio.setMuted(false);
    assert.ok(f.audio.master.gain.value > 0);
    s = overheadCommand(s, 40, 14000);
    f.audio.update(s);
    assert.equal(f.audio.fan.gain.value, 0);
  } finally {
    f.restore();
  }
});

test('late fan decoding cannot sound after power loss or recreate playback after disposal', async () => {
  for (const dispose of [false, true]) {
    const f = setup();
    try {
      let resolveFan;
      const decode = f.ctx.decodeAudioData;
      f.ctx.decodeAudioData = (bytes) =>
        new TextDecoder().decode(bytes) === '/audio/display-fan-loop.ogg'
          ? new Promise((resolve) => {
              resolveFan = resolve;
            })
          : decode(bytes);
      const s = overheadCommand(initialState(), 40, 0);
      f.audio.update(s);
      await f.audio.enable();
      f.audio.setDisplayBoot('ready', 13, 1);
      await setImmediate();
      if (dispose) f.audio.dispose();
      else f.audio.update(initialState());
      resolveFan({ file: '/audio/display-fan-loop.ogg', duration: 11.08 });
      await setImmediate();
      if (dispose) assert.equal(f.of('display-fan-loop.ogg').length, 0);
      else assert.equal(f.audio.fan.gain.value, 0);
    } finally {
      f.restore();
    }
  }
});
test('switch sample and pressure reduction play through the master bus; polling does not repeat air', async () => {
  const f = setup();
  try {
    const s = { ...initialState(), stage: 2, hydraulicPressure: 280 };
    f.audio.update(s);
    await f.audio.enable();
    await setImmediate();
    await f.audio.playSwitch();
    assert.equal(f.of('switch-flip.mp3').length, 1);
    assert.equal(f.of('switch-flip.mp3')[0].output.output, f.audio.master);
    const lower = { ...s, hydraulicPressure: 150 };
    f.audio.update(lower);
    await setImmediate();
    assert.equal(f.of('air-release.mp3').length, 1);
    for (let i = 0; i < 20; i++) f.audio.update(lower);
    await setImmediate();
    assert.equal(f.of('air-release.mp3').length, 1);
    assert.equal(f.of('air-release.mp3')[0].output.output, f.audio.master);
  } finally {
    f.restore();
  }
});
test('manual joint load uses existing actuator sound and still follows master mute', async () => {
  const f = setup();
  try {
    const s = { ...initialState(), stage: 6 };
    f.audio.update(s);
    await f.audio.enable();
    await setImmediate();
    const drive = f.of('main-drive-loop.ogg')[0],
      idle = drive.output.gain.value;
    f.audio.update({ ...s, articulation: { ...s.articulation, effort: 1 } });
    assert.ok(drive.output.gain.value > idle);
    assert.equal(f.of('main-drive-loop.ogg').length, 1);
    f.audio.setMuted(true);
    assert.equal(f.audio.master.gain.value, 0);
    f.audio.update(s);
    assert.equal(drive.output.gain.value, idle);
  } finally {
    f.restore();
  }
});
