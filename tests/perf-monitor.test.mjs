import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerfMonitor } from '../lib/perf-monitor.ts';

const fakeRenderer = () => ({
  info: {
    autoReset: true,
    resets: 0,
    reset() {
      this.resets++;
    },
    render: { calls: 0, triangles: 0 },
    memory: { geometries: 3, textures: 2 },
    programs: [1, 2],
  },
  getContext: () => ({}),
});

test('Diagnose: Bildrate, Mittel, Maximum und 1 %-Low aus den Bildabständen', () => {
  const r = fakeRenderer();
  const m = new PerfMonitor(r);
  assert.equal(r.info.autoReset, false, 'zählt alle Durchgänge eines Bildes');
  let t = 0;
  for (let i = 0; i < 300; i++) {
    t += i % 100 === 99 ? 50 : 16; // drei Ausreißer
    m.frame(t);
    r.info.render.calls = 700;
    m.endFrame();
  }
  const s = m.stats();
  assert.equal(s.frames, 299);
  assert.ok(Math.abs(s.frameMs - (296 * 16 + 3 * 50) / 299) < 0.01);
  assert.equal(s.frameMaxMs, 50);
  // 1 % der langsamsten (2 Bilder à 50 ms) → 20 fps
  assert.ok(Math.abs(s.low1 - 20) < 0.01);
  assert.equal(s.calls, 700);
  assert.equal(s.gpuMs, null, 'ohne Timer-Erweiterung nicht verfügbar');
  assert.equal(s.programs, 2);
  m.reset();
  assert.equal(m.stats().frames, 0);
});

test('Diagnose: Pausen (verdeckter Tab) verfälschen die Bildzeit nicht', () => {
  const m = new PerfMonitor(fakeRenderer());
  m.frame(0);
  m.frame(16);
  m.frame(5016); // 5 s Pause
  m.frame(5032);
  const s = m.stats();
  assert.equal(s.frames, 2);
  assert.equal(s.frameMaxMs, 16);
});
