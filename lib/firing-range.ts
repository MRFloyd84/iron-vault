// Schießstand am Ende des Testgeländes: sieben Klappziele aus Stahl hinter der
// Streckenbegrenzung und zwei ausgeschlachtete Fahrzeugwracks neben der Strecke.
// Trefferprüfung für Geschosse: Strecke gegen gedrehte Quader (Slab-Test) und Boden.
import * as THREE from 'three';
import type { CockpitScene } from './cockpit-scene';
import { groundHeight, WRECKS } from './walking';
import { YARD } from './yard-scene';
import { terrainHeight } from './terrain';
import { WORLD_OBSTACLES, TARGETS } from './world-layout';

export const PLATE_Z = -231.2;
export const PLATE_XS = [-36, -24, -12, 0, 12, 24, 36] as const;
export { WRECKS } from './walking';
/** Sekunden, bis ein umgeklapptes Ziel wieder hochkommt. */
export const PLATE_RESET = 6;

export type HitKind = 'steel' | 'wreck' | 'ground' | 'structure' | 'target';
export type Hit = {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  kind: HitKind;
  t: number;
  plate?: number;
  /** Getroffenes Ziel (kind 'target') */
  target?: string;
};

/** Trefferquader der Außenwelt: Mitte, halbe Maße, Drehung um y (wie die Gehhindernisse). */
type WorldBox = {
  c: THREE.Vector3;
  half: THREE.Vector3;
  angle: number;
  radius: number;
  target?: string;
};
const FLOOR = -2.6;
export const WORLD_BOXES: WorldBox[] = [
  ...WORLD_OBSTACLES.filter((o) => !o.target).map((o) => {
    const bottom = FLOOR + terrainHeight(o.x, o.z) - 0.6,
      top = FLOOR + o.top;
    const half = new THREE.Vector3(o.w / 2, Math.max(0.3, (top - bottom) / 2), o.d / 2);
    return {
      c: new THREE.Vector3(o.x, (top + bottom) / 2, o.z),
      half,
      angle: o.angle ?? 0,
      radius: half.length(),
    };
  }),
  ...TARGETS.map((t) => {
    const half = new THREE.Vector3(...t.half);
    return {
      c: new THREE.Vector3(t.x, FLOOR + t.y, t.z),
      half,
      angle: t.a,
      radius: half.length(),
      target: t.id,
    };
  }),
];
const la = new THREE.Vector3(),
  lb = new THREE.Vector3(),
  seg = new THREE.Vector3(),
  rel = new THREE.Vector3();
function toLocal(p: THREE.Vector3, box: WorldBox, out: THREE.Vector3) {
  const dx = p.x - box.c.x,
    dz = p.z - box.c.z,
    c = Math.cos(box.angle),
    s = Math.sin(box.angle);
  return out.set(c * dx - s * dz, p.y - box.c.y, s * dx + c * dz);
}
/** Erster Treffer an Gebäuden, Felsen und Zielen der Außenwelt. */
export function worldHit(
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  destroyed: (id: string) => boolean = () => false,
): Hit | null {
  let best: Hit | null = null;
  seg.subVectors(p1, p0);
  const len2 = seg.lengthSq();
  for (const box of WORLD_BOXES) {
    // Vorprüfung: Abstand Mittelpunkt–Strecke größer als Umkugel
    rel.subVectors(box.c, p0);
    const t = len2 > 0 ? Math.max(0, Math.min(1, rel.dot(seg) / len2)) : 0;
    const dx = rel.x - seg.x * t,
      dy = rel.y - seg.y * t,
      dz = rel.z - seg.z * t;
    if (dx * dx + dy * dy + dz * dz > box.radius * box.radius) continue;
    toLocal(p0, box, la);
    toLocal(p1, box, lb);
    const r = segmentBox(la, lb, box.half);
    if (!r || (best && r.t >= best.t)) continue;
    // Normale zurück in Weltlage drehen
    const c = Math.cos(box.angle),
      s = Math.sin(box.angle);
    const n = new THREE.Vector3(
      c * r.normal.x + s * r.normal.z,
      r.normal.y,
      -s * r.normal.x + c * r.normal.z,
    );
    const alive = box.target && !destroyed(box.target);
    best = {
      t: r.t,
      point: new THREE.Vector3().lerpVectors(p0, p1, r.t),
      normal: n,
      kind: alive ? 'target' : 'structure',
      target: alive ? box.target : undefined,
    };
  }
  return best;
}

type Collider = { mesh: THREE.Object3D; half: THREE.Vector3; kind: HitKind; plate?: number };

const inv = new THREE.Matrix4(),
  a = new THREE.Vector3(),
  b = new THREE.Vector3(),
  d = new THREE.Vector3();

/** Schnitt der Strecke p0→p1 mit einem lokalen Quader [-half, half]; t ∈ [0,1] oder null. */
export function segmentBox(p0: THREE.Vector3, p1: THREE.Vector3, half: THREE.Vector3) {
  d.subVectors(p1, p0);
  let t0 = 0,
    t1 = 1,
    axis = -1,
    sign = 1;
  for (let i = 0; i < 3; i++) {
    const o = p0.getComponent(i),
      v = d.getComponent(i),
      h = half.getComponent(i);
    if (Math.abs(v) < 1e-9) {
      if (o < -h || o > h) return null;
      continue;
    }
    let ta = (-h - o) / v,
      tb = (h - o) / v,
      s = -1;
    if (ta > tb) {
      [ta, tb] = [tb, ta];
      s = 1;
    }
    if (ta > t0) {
      t0 = ta;
      axis = i;
      sign = s;
    }
    t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  if (axis < 0) return null; // Start im Inneren: ignorieren
  const normal = new THREE.Vector3();
  normal.setComponent(axis, sign);
  return { t: t0, normal };
}

function plateTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 160;
  const x = c.getContext('2d')!;
  x.fillStyle = '#c9c3b0';
  x.fillRect(0, 0, 128, 160);
  for (const [r, col] of [
    [58, '#b8451f'],
    [42, '#d8d2bf'],
    [26, '#b8451f'],
    [10, '#1d1c1a'],
  ] as const) {
    x.fillStyle = col;
    x.beginPath();
    x.arc(64, 72, r, 0, Math.PI * 2);
    x.fill();
  }
  // Einschüsse und Rost früherer Übungen
  for (let i = 0; i < 70; i++) {
    x.fillStyle = `rgba(${60 + (i % 3) * 30},${40 + (i % 5) * 8},25,${0.25 + (i % 4) * 0.12})`;
    x.beginPath();
    x.arc((i * 37) % 128, (i * 53) % 160, 1 + (i % 4), 0, Math.PI * 2);
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class FiringRange {
  root = new THREE.Group();
  /** Ziele der Außenwelt, die schon zerstört sind (Treffer zählen dann als Trümmer). */
  destroyed: (id: string) => boolean = () => false;
  plates: { hinge: THREE.Group; down: number; fallStart: number }[] = [];
  private colliders: Collider[] = [];

  constructor(host: CockpitScene) {
    this.root.name = 'Firing range';
    host.scene.add(this.root);
    const steel = host.mat({ color: 0x3f4447, metalness: 0.7, roughness: 0.55 });
    const map = plateTexture();
    if (map) host.textures.push(map);
    const face = host.mat({ color: 0xffffff, map, metalness: 0.35, roughness: 0.6 });
    const rust = host.pbr('hull', 0x7a4f35, 0.95, 0.6, 0.9);
    const dark = host.mat({ color: 0x1d1f1e, metalness: 0.2, roughness: 0.9 });
    const floor = YARD.floor;
    // Klappziele: Stahlplatte 2,4 × 3 m an einem Scharnier, auf Sockel.
    PLATE_XS.forEach((x, i) => {
      host.box(this.root, x, floor + 0.35, PLATE_Z, 3.2, 0.7, 1.2, steel, 0.03);
      const hinge = new THREE.Group();
      hinge.position.set(x, floor + 0.72, PLATE_Z);
      this.root.add(hinge);
      const plate = host.box(hinge, 0, 1.6, 0, 2.4, 3, 0.12, steel, 0.02);
      const front = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.9), face);
      front.position.set(0, 1.6, 0.065);
      hinge.add(front);
      host.box(hinge, 0, 0.05, -0.12, 0.6, 0.1, 0.25, dark, 0.01);
      this.plates.push({ hinge, down: 0, fallStart: -1e9 });
      this.colliders.push({
        mesh: plate,
        half: new THREE.Vector3(1.2, 1.5, 0.06),
        kind: 'steel',
        plate: i,
      });
    });
    // Ausgeschlachtete Radpanzer-Wracks.
    for (const w of WRECKS) {
      const g = new THREE.Group();
      g.position.set(w.x, floor, w.z);
      g.rotation.y = w.angle;
      this.root.add(g);
      const parts: [number, number, number, number, number, number, THREE.Material][] = [
        [0, 1.55, 0, 3.2, 1.6, 7.2, rust], // Wanne
        [0, 2.55, -1.6, 2.6, 0.5, 2.8, rust], // Fahrerbereich
        [0.1, 2.95, 0.8, 1.9, 0.75, 2.0, rust], // Turm
        [0.1, 3.05, 3.0, 0.25, 0.25, 2.6, dark], // abgeknickte Kanone
      ];
      for (const [x, y, z, sx, sy, sz, m] of parts) {
        const mesh = host.box(g, x, y, z, sx, sy, sz, m, 0.05);
        if (sx > 1)
          this.colliders.push({
            mesh,
            half: new THREE.Vector3(sx / 2, sy / 2, sz / 2),
            kind: 'wreck',
          });
      }
      // Räder (zwei fehlen)
      for (const z of [-2.6, -0.9, 0.9, 2.6])
        for (const s of [-1, 1]) {
          if ((z === 0.9 && s === 1) || (z === -2.6 && s === -1)) continue;
          const wheel = host.cylinder(g, s * 1.75, 0.62, z, 0.62, 0.45, dark);
          wheel.rotation.set(0, 0, Math.PI / 2);
        }
    }
    this.root.updateMatrixWorld(true);
  }

  /** Klappziel `i` getroffen: fällt nach hinten um. */
  knock(i: number, time: number) {
    const p = this.plates[i];
    if (p && p.down === 0) p.fallStart = time;
  }

  update(time: number) {
    for (const p of this.plates) {
      const age = time - p.fallStart;
      // 0,35 s fallen, liegen bleiben, nach PLATE_RESET wieder aufrichten.
      p.down =
        age < 0 || age > PLATE_RESET + 0.8
          ? 0
          : age < 0.35
            ? (age / 0.35) ** 2
            : age < PLATE_RESET
              ? 1
              : 1 - (age - PLATE_RESET) / 0.8;
      p.hinge.rotation.x = -p.down * 1.45;
      p.hinge.updateMatrixWorld(true);
    }
  }

  /** Erster Treffer auf der Strecke p0→p1 (Ziele, Wracks, Boden) oder null. */
  hitTest(p0: THREE.Vector3, p1: THREE.Vector3): Hit | null {
    let best: Hit | null = null;
    for (const c of this.colliders) {
      if (c.plate !== undefined && this.plates[c.plate].down > 0.5) continue;
      inv.copy(c.mesh.matrixWorld).invert();
      a.copy(p0).applyMatrix4(inv);
      b.copy(p1).applyMatrix4(inv);
      const r = segmentBox(a, b, c.half);
      if (r && (!best || r.t < best.t)) {
        const normal = r.normal.transformDirection(c.mesh.matrixWorld);
        best = {
          t: r.t,
          point: new THREE.Vector3().lerpVectors(p0, p1, r.t),
          normal,
          kind: c.kind,
          plate: c.plate,
        };
      }
    }
    const world = worldHit(p0, p1, this.destroyed);
    if (world && (!best || world.t < best.t)) best = world;
    const ground = groundHit(p0, p1);
    if (ground && (!best || ground.t < best.t)) best = ground;
    return best;
  }
}

/** Boden-Schnitt einer Strecke durch Abtasten der Geländehöhe (Rampen inklusive). */
export function groundHit(p0: THREE.Vector3, p1: THREE.Vector3): Hit | null {
  const steps = Math.max(1, Math.ceil(p0.distanceTo(p1) / 1.5));
  const above = (t: number) => {
    const x = p0.x + (p1.x - p0.x) * t,
      z = p0.z + (p1.z - p0.z) * t;
    return p0.y + (p1.y - p0.y) * t - (YARD.floor + groundHeight(x, z));
  };
  let prev = 0,
    prevH = above(0);
  if (prevH < 0) return null;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps,
      h = above(t);
    if (h <= 0) {
      const tt = prev + (t - prev) * (prevH / (prevH - h));
      return {
        t: tt,
        point: new THREE.Vector3().lerpVectors(p0, p1, tt),
        normal: groundNormal(p0.x + (p1.x - p0.x) * tt, p0.z + (p1.z - p0.z) * tt),
        kind: 'ground',
      };
    }
    prev = t;
    prevH = h;
  }
  return null;
}

function groundNormal(x: number, z: number) {
  const e = 1;
  const gx = (groundHeight(x + e, z) - groundHeight(x - e, z)) / (2 * e),
    gz = (groundHeight(x, z + e) - groundHeight(x, z - e)) / (2 * e);
  return new THREE.Vector3(-gx, 1, -gz).normalize();
}
