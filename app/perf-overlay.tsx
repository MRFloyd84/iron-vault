import { useEffect, useState } from 'react';
import { tr } from '../lib/i18n';
import { useLang } from './language-menu';
import type { CockpitScene } from '../lib/cockpit-scene';
import { classifyGpu, rendererName, shortGpuName, type GpuKind } from '../lib/gpu-info';

type Stats = ReturnType<CockpitScene['perf']['stats']> & {
  objects: number;
  meshes: number;
  lights: number;
  gpuMemMB: number;
};

const f1 = (v: number) => v.toFixed(1);
const NA = 'nicht verfügbar';

/**
 * Diagnoseanzeige (F3): liest zweimal pro Sekunde die Messwerte der Szene. Kennzeichnet,
 * was gemessen, was geschätzt und was im Browser nicht verfügbar ist.
 */
export default function PerfOverlay({ scene }: { scene: () => CockpitScene | null }) {
  useLang();
  const [s, setStats] = useState<Stats | null>(null);
  const [gpu, setGpu] = useState<{ name: string | null; kind: GpuKind } | null>(null);
  useEffect(() => {
    const sc = scene();
    if (sc) {
      sc.perf.detailed = true;
      const raw = rendererName(sc.renderer.getContext());
      setGpu({ name: shortGpuName(raw), kind: classifyGpu(raw) });
    }
    const id = window.setInterval(() => {
      const sc = scene();
      if (!sc) return;
      const now = performance.now();
      const o = sc.perf.sceneObjects(sc.scene, now);
      setStats({
        ...sc.perf.stats(),
        objects: o.total,
        meshes: o.meshes,
        lights: o.lights,
        gpuMemMB: sc.perf.gpuMemoryEstimate(sc.scene, now) / 1048576,
      });
    }, 500);
    return () => {
      clearInterval(id);
      const sc = scene();
      if (sc) sc.perf.detailed = false;
    };
  }, [scene]);
  if (!s) return null;
  const rows: [string, string, 'm' | 'e' | 'n' | 'w'][] = [
    ['Grafikkarte', gpu?.name ?? tr(NA), gpu?.kind === 'software' ? 'w' : gpu?.name ? 'm' : 'n'],
    ['Bilder/s', f1(s.fps), 'm'],
    ['Bildzeit Ø / max', f1(s.frameMs) + ' / ' + f1(s.frameMaxMs) + ' ms', 'm'],
    ['1 % Low', f1(s.low1) + ' fps', 'm'],
    ['CPU Simulation', f1(s.cpu.update) + ' ms', 'm'],
    ['CPU Monitore', f1(s.cpu.monitors) + ' ms', 'm'],
    ['CPU Displays', f1(s.cpu.displays) + ' ms', 'm'],
    ['CPU Rendern', f1(s.cpu.render) + ' ms', 'm'],
    ['GPU-Zeit', s.gpuMs !== null ? f1(s.gpuMs) + ' ms' : tr(NA), s.gpuMs !== null ? 'm' : 'n'],
    ['Zeichenaufrufe', String(s.calls), 'm'],
    ['Dreiecke', Math.round(s.triangles / 1000) + ' k', 'm'],
    [
      'JS-Heap',
      s.heapMB !== null ? Math.round(s.heapMB) + ' MB' : tr(NA),
      s.heapMB !== null ? 'm' : 'n',
    ],
    ['Grafikspeicher', '≈ ' + Math.round(s.gpuMemMB) + ' MB', 'e'],
    ['Objekte / sichtbar', s.objects + ' / ' + s.meshes, 'm'],
    ['Lichter', String(s.lights), 'm'],
    ['Shader', String(s.programs), 'm'],
    ['Geometrien / Texturen', s.geometries + ' / ' + s.textures, 'm'],
    ['Audioquellen', s.audio !== null ? String(s.audio) : tr(NA), s.audio !== null ? 'm' : 'n'],
    ['Darstellung ohne neuen Stand', String(s.starved), 'm'],
  ];
  const mark = { m: '', e: tr('geschätzt'), n: '', w: tr('ohne Grafikkarte!') };
  return (
    <aside className="perf-overlay" aria-label={tr('Diagnose')}>
      <strong>{tr('DIAGNOSE · F3')}</strong>
      <dl>
        {rows.map(([label, value, kind]) => (
          <div key={label} className={'perf-' + kind}>
            <dt>{tr(label)}</dt>
            <dd>
              {value}
              {mark[kind] && <em> {mark[kind]}</em>}
            </dd>
          </div>
        ))}
      </dl>
      <p>
        {tr(
          'Werte der letzten 10 s. Geschätzt: ohne Treiberanteil. GPU-Zeit nur mit Timer-Erweiterung des Browsers.',
        )}
      </p>
    </aside>
  );
}
