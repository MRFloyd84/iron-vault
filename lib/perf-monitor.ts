// Leistungsmessung für den Diagnosemodus (F3) und die Lasttests.
// Gemessen: Bildabstände aus den requestAnimationFrame-Zeitstempeln, CPU-Zeit je
// Abschnitt der Bildschleife, Zeichenaufrufe und Dreiecke aller Durchgänge eines Bildes,
// GPU-Zeit des Hauptbildes (nur wenn der Browser EXT_disjoint_timer_query_webgl2 anbietet),
// JS-Heap (nur Chromium: performance.memory), aktive Audioquellen.
// Geschätzt: Grafikspeicher (Summe der Puffer und Texturen, ohne Treiber-Overhead).
import * as THREE from 'three';

const N = 600; // ~10 s bei 60 Bildern/s

export type Section = 'update' | 'displays' | 'monitors' | 'render';
const SECTIONS: Section[] = ['update', 'displays', 'monitors', 'render'];

// ---------- Aktive Audioquellen (Oszillatoren und Puffer, gestartet und nicht beendet) ----------
let audioActive = 0;
let audioInstalled = false;
export function installAudioCounter() {
  if (audioInstalled || typeof AudioScheduledSourceNode === 'undefined') return;
  audioInstalled = true;
  const proto = AudioScheduledSourceNode.prototype;
  const start = proto.start;
  proto.start = function (this: AudioScheduledSourceNode, ...args: Parameters<typeof start>) {
    audioActive++;
    this.addEventListener('ended', () => (audioActive = Math.max(0, audioActive - 1)), {
      once: true,
    });
    return start.apply(this, args);
  } as typeof start;
}
export const activeAudioSources = () => (audioInstalled ? audioActive : null);

type GpuTimer = {
  gl: WebGL2RenderingContext;
  ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };
  pending: WebGLQuery[];
  active: WebGLQuery | null;
  last: number | null;
};

export class PerfMonitor {
  /** Aufwendigere Messungen (GPU-Zeit, Objektzählung) nur bei sichtbarer Anzeige */
  detailed = false;
  private intervals = new Float32Array(N);
  private count = 0;
  private head = 0;
  private lastStamp = -1;
  private sectionStart = 0;
  private cpu: Record<Section, Float32Array> = {
    update: new Float32Array(N),
    displays: new Float32Array(N),
    monitors: new Float32Array(N),
    render: new Float32Array(N),
  };
  calls = 0;
  triangles = 0;
  private gpu: GpuTimer | null = null;
  private objects = { total: 0, meshes: 0, lights: 0, at: -1e9 };
  private memory = { bytes: 0, at: -1e9 };
  /** Bilder, in denen die Darstellung keinen neueren Simulationsstand hatte */
  starved = 0;

  private renderer: THREE.WebGLRenderer;
  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    renderer.info.autoReset = false;
    // Verdeckter Tab: rAF pausiert, die Lücke ist kein langsames Bild
    if (typeof document !== 'undefined')
      document.addEventListener('visibilitychange', () => (this.lastStamp = -1));
  }

  /** Messfenster leeren (z. B. nach einem Ansichtswechsel). */
  reset() {
    this.count = 0;
    this.head = 0;
    this.lastStamp = -1;
  }
  /** Beginn eines Bildes (rAF-Zeitstempel in ms). */
  frame(ms: number) {
    if (this.lastStamp >= 0) {
      const dt = ms - this.lastStamp;
      // Auch lange Hänger zählen (früher ab 1 s verworfen und damit unsichtbar)
      if (dt > 0 && dt < 30000) {
        this.intervals[this.head] = dt;
        this.head = (this.head + 1) % N;
        this.count = Math.min(N, this.count + 1);
      }
    }
    this.lastStamp = ms;
    this.renderer.info.reset();
    this.sectionStart = performance.now();
  }
  /** Ende eines Abschnitts der Bildschleife. */
  section(name: Section) {
    const now = performance.now();
    this.cpu[name][(this.head + N - 1) % N] = now - this.sectionStart;
    this.sectionStart = now;
  }
  /** Zeichenaufrufe/Dreiecke aller Durchgänge des Bildes übernehmen. */
  endFrame() {
    this.calls = this.renderer.info.render.calls;
    this.triangles = this.renderer.info.render.triangles;
  }

  // ---------- GPU-Zeit ----------
  gpuBegin() {
    if (!this.detailed) return;
    if (!this.gpu) {
      const gl = this.renderer.getContext();
      if (!(gl instanceof WebGL2RenderingContext)) return;
      const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      if (!ext) return;
      this.gpu = { gl, ext, pending: [], active: null, last: null };
    }
    const g = this.gpu;
    // Fertige Abfragen auslesen (ohne zu warten)
    while (g.pending.length) {
      const q = g.pending[0];
      if (!g.gl.getQueryParameter(q, g.gl.QUERY_RESULT_AVAILABLE)) break;
      const disjoint = g.gl.getParameter(g.ext.GPU_DISJOINT_EXT);
      const ns = g.gl.getQueryParameter(q, g.gl.QUERY_RESULT) as number;
      if (!disjoint) g.last = ns / 1e6;
      g.gl.deleteQuery(q);
      g.pending.shift();
    }
    if (g.pending.length > 4) return;
    const q = g.gl.createQuery();
    if (!q) return;
    g.gl.beginQuery(g.ext.TIME_ELAPSED_EXT, q);
    g.active = q;
  }
  gpuEnd() {
    const g = this.gpu;
    if (!g?.active) return;
    g.gl.endQuery(g.ext.TIME_ELAPSED_EXT);
    g.pending.push(g.active);
    g.active = null;
  }

  // ---------- Auswertung ----------
  private values(buf: Float32Array) {
    const out: number[] = [];
    for (let i = 0; i < this.count; i++) out.push(buf[(this.head - 1 - i + N) % N]);
    return out;
  }
  stats() {
    const iv = this.values(this.intervals);
    const avg = iv.length ? iv.reduce((a, b) => a + b, 0) / iv.length : 0;
    const sorted = [...iv].sort((a, b) => b - a);
    // 1 % Low: Mittel der langsamsten 1 % Bilder, als Bilder pro Sekunde
    const worst = sorted.slice(0, Math.max(1, Math.floor(sorted.length / 100)));
    const low = worst.length ? 1000 / (worst.reduce((a, b) => a + b, 0) / worst.length) : 0;
    const cpu = Object.fromEntries(
      SECTIONS.map((k) => {
        const v = this.values(this.cpu[k]);
        return [k, v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0];
      }),
    ) as Record<Section, number>;
    const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    return {
      frames: iv.length,
      fps: avg ? 1000 / avg : 0,
      frameMs: avg,
      frameMaxMs: sorted[0] ?? 0,
      low1: low,
      cpu,
      calls: this.calls,
      triangles: this.triangles,
      gpuMs: this.gpu ? this.gpu.last : null,
      gpuTimer: this.gpu ? 'gemessen' : this.detailed ? 'nicht verfügbar' : 'aus',
      heapMB: heap ? heap.usedJSHeapSize / 1048576 : null,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      programs: this.renderer.info.programs?.length ?? 0,
      audio: activeAudioSources(),
      starved: this.starved,
    };
  }

  /** Objekte zählen (höchstens alle 2 s). */
  sceneObjects(scene: THREE.Object3D, now: number) {
    if (now - this.objects.at < 2000) return this.objects;
    let total = 0,
      meshes = 0,
      lights = 0;
    scene.traverse((o) => {
      total++;
      if ((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite)
        meshes++;
      if ((o as THREE.Light).isLight) lights++;
    });
    this.objects = { total, meshes, lights, at: now };
    return this.objects;
  }

  /** Geschätzter Grafikspeicher: Pufferdaten und Texturen (höchstens alle 5 s). */
  gpuMemoryEstimate(scene: THREE.Object3D, now: number) {
    if (now - this.memory.at < 5000) return this.memory.bytes;
    const geos = new Set<THREE.BufferGeometry>(),
      textures = new Set<THREE.Texture>();
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) geos.add(m.geometry);
      for (const mat of [m.material].flat())
        if (mat)
          for (const v of Object.values(mat as unknown as Record<string, unknown>))
            if (v instanceof THREE.Texture) textures.add(v);
    });
    let bytes = 0;
    for (const g of geos) {
      for (const a of Object.values(g.attributes))
        bytes += (a as THREE.BufferAttribute).array?.byteLength ?? 0;
      bytes += g.index?.array.byteLength ?? 0;
    }
    for (const t of textures) {
      const img = t.image as { width?: number; height?: number } | undefined;
      if (img?.width && img.height)
        bytes += img.width * img.height * 4 * (t.generateMipmaps ? 1.33 : 1);
    }
    this.memory = { bytes, at: now };
    return bytes;
  }
}
