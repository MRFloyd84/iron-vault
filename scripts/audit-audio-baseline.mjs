import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { MachineAudio as NewAudio } from '../lib/machine-audio.ts';
import { initialState, overheadCommand } from '../lib/machine.ts';
import { writeFile } from 'node:fs/promises';
const root = fileURLToPath(new URL('..', import.meta.url)),
  temp = await mkdtemp(join(tmpdir(), 'iron-vault-audio-audit-'));
let OldAudio;
try {
  const source = execFileSync('git', ['show', '7b16f50:lib/machine-audio.ts'], {
    cwd: root,
    encoding: 'utf8',
  }).replace(
    /from '([.][/][^']+)'/g,
    (_, path) => "from '" + pathToFileURL(join(root, 'lib', path + '.ts')).href + "'",
  );
  const file = join(temp, 'baseline.ts');
  await writeFile(file, source);
  OldAudio = (await import(pathToFileURL(file).href)).MachineAudio;
} finally {
  await rm(temp, { recursive: true, force: true });
}
globalThis.fetch = async (url) => ({
  ok: true,
  arrayBuffer: async () =>
    new TextEncoder().encode(new URL(url, 'https://example.test').pathname).buffer,
});
async function collect(Type) {
  const sources = [],
    oscillators = [],
    snapshots = [];
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
    start() {
      this.started = true;
    },
    stop(when) {
      this.stops.push(when ?? 0);
    },
  });
  const ctx = {
    currentTime: 0,
    state: 'running',
    destination: {},
    createGain: () => ({ ...node(), gain: param() }),
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
    decodeAudioData: async (bytes) => ({ file: new TextDecoder().decode(bytes), duration: 20 }),
    resume: async () => {},
    close: async () => {
      ctx.state = 'closed';
    },
  };
  globalThis.AudioContext = function () {
    return ctx;
  };
  const audio = new Type();
  let s = initialState();
  audio.update(s);
  await audio.enable();
  await setImmediate();
  const snapshot = async (label) => {
    await setImmediate();
    snapshots.push({
      label,
      master: audio.master.gain.value,
      fan: audio.fan.gain.value,
      hum: audio.hum.gain.value,
      sources: sources.map((v) => ({
        file: v.buffer.file,
        loop: !!v.loop,
        gain: v.output.gain.value,
        rate: v.playbackRate.value,
        stops: v.stops,
      })),
      oscillators: oscillators.map((v) => ({ frequency: v.frequency.value, stops: v.stops })),
    });
    ctx.currentTime += 1;
  };
  await snapshot('cold');
  s = overheadCommand(s, 40, 100);
  audio.update(s);
  await audio.playSwitch();
  await snapshot('BAT 1');
  s = overheadCommand(s, 41, 200);
  audio.update(s);
  await snapshot('BAT 2');
  for (const phase of ['starting', 'running']) {
    s = {
      ...s,
      overhead: {
        ...s.overhead,
        apuPhase: phase,
        apuProgress: 0.4,
        apuStarted: 500,
        apuGen: phase === 'running',
      },
    };
    audio.update(s);
    await snapshot('APU ' + phase);
  }
  for (const stage of [1, 2, 4, 5, 6]) {
    s = { ...s, stage, coolantFlow: 42.8, service: { ...s.service, pumpAFlow: 42.8 } };
    audio.update(s);
    audio.beep();
    await snapshot('stage ' + stage);
  }
  s = {
    ...s,
    throttle: 0.75,
    articulation: { ...s.articulation, effort: 0.8 },
    walk: { ...s.walk, step: 1, speed: 1, effort: 0.6 },
  };
  audio.update(s);
  await snapshot('load/walk/joints');
  s = { ...s, hydraulicPressure: 150 };
  audio.update(s);
  await snapshot('pressure release');
  audio.setMuted(true);
  await snapshot('muted');
  audio.setMuted(false);
  await snapshot('unmuted');
  s = {
    ...s,
    stage: 0,
    fanLevel: 0,
    overhead: { ...s.overhead, apuPhase: 'off', apuGen: false, battery1: false, battery2: false },
    service: { ...s.service, pumpAFlow: 0 },
  };
  audio.update(s);
  await snapshot('shutdown');
  audio.dispose();
  return snapshots;
}
const old = await collect(OldAudio),
  current = await collect(NewAudio);
// The user intentionally replaced the fan recording and its startup gate.
// Compare every retained channel without concealing that deliberate difference.
const retained = (items) =>
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- fan wird bewusst verworfen
  items.map(({ fan, ...item }) => ({
    ...item,
    sources: item.sources.filter(
      (s) => !['/audio/industrial-fan-loop.ogg', '/audio/display-fan-loop.ogg'].includes(s.file),
    ),
  }));
assert.deepEqual(retained(current), retained(old));
if (process.argv[2])
  await writeFile(
    process.argv[2],
    JSON.stringify(
      {
        baseline: '7b16f50',
        states: old.length,
        retainedChannelsIdentical: true,
        excluded: 'intentionally replaced fan recording and startup gate',
        snapshots: current,
      },
      null,
      2,
    ),
  );
console.log(
  old.length +
    ' state snapshots: retained audio channels identical; intentionally replaced fan excluded',
);
