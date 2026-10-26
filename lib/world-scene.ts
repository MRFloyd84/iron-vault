// Grafik der Außenwelt: Gelände, Horizont, Felsen, Anlagen, Leitungen und die
// zerstörbaren Ziele. Statische Teile werden je Anlage und Material zu einem Netz
// zusammengefasst (wenige Zeichenaufrufe); Ziele bleiben eigene Gruppen.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CockpitScene } from './cockpit-scene';
import { applyWetness } from './weather';
import { buildTerrain, buildHorizon, sandTexture } from './world-terrain';
import { MAP, SITES, site, terrainHeight, noise } from './terrain';
import {
  STRUCTURES,
  ROCKS,
  POWER_LINE,
  TARGETS,
  baseHeight,
  type Structure,
  type Target,
} from './world-layout';

const FLOOR = -2.6;
const Q = new THREE.Quaternion(),
  E = new THREE.Euler(),
  V = new THREE.Vector3(),
  S = new THREE.Vector3();
/** Lokale Matrix aus Lage, Drehung (XYZ) und Größe. */
export function mat4(
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
  sx = 1,
  sy = 1,
  sz = 1,
) {
  return new THREE.Matrix4().compose(
    V.set(x, y, z),
    Q.setFromEuler(E.set(rx, ry, rz, 'YXZ')),
    S.set(sx, sy, sz),
  );
}

/** Sammelt Teile je Material und fasst sie zu je einem Netz zusammen. */
class Batch {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(geo: THREE.BufferGeometry, mat: THREE.Material, matrix: THREE.Matrix4) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(matrix);
    if (!g.getAttribute('uv'))
      g.setAttribute(
        'uv',
        new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2),
      );
    for (const name of Object.keys(g.attributes))
      if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat)!.push(g);
  }
  build(parent: THREE.Object3D, name: string, shadows = true) {
    const geometries: THREE.BufferGeometry[] = [];
    for (const [mat, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = name;
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      parent.add(mesh);
      geometries.push(merged);
    }
    this.parts.clear();
    return geometries;
  }
}

export type TargetVisual = {
  target: Target;
  group: THREE.Group;
  /** Teil, das beim Zerstören besonders bewegt wird (Radarschüssel, Mast) */
  moving?: THREE.Object3D;
  base: THREE.Vector3;
};

type Mats = Record<
  | 'concrete'
  | 'rust'
  | 'steel'
  | 'dark'
  | 'pale'
  | 'yellow'
  | 'red'
  | 'plaster'
  | 'tank'
  | 'gravel'
  | 'rock'
  | 'rubber'
  | 'glass',
  THREE.MeshStandardMaterial
> & {
  containers: THREE.MeshStandardMaterial[];
  lamp: THREE.Material;
  beacon: THREE.MeshStandardMaterial;
};

export class DesertWorld {
  root = new THREE.Group();
  targets = new Map<string, TargetVisual>();
  /** Animierte Teile: Fackelflamme, Radar, Kontrollpunkt-Blinklicht */
  private flames: THREE.Sprite[] = [];
  private radarDish: THREE.Object3D | null = null;
  private beacons: THREE.MeshStandardMaterial[] = [];
  private host: CockpitScene;
  private geos = new Map<string, THREE.BufferGeometry>();
  private disposables: { dispose(): void }[] = [];
  m: Mats;

  constructor(host: CockpitScene) {
    this.host = host;
    this.root.name = 'Desert world';
    host.scene.add(this.root);
    const pbr = (kind: string, color: number, rough: number, normal: number, repeat: number) => {
      const m = host.pbr(kind, color, rough, normal, repeat);
      host.yardMaterials.push(m);
      applyWetness(m, host.wet);
      return m;
    };
    const plain = (p: THREE.MeshStandardMaterialParameters) => {
      const m = host.mat(p);
      host.yardMaterials.push(m);
      applyWetness(m, host.wet);
      return m;
    };
    this.m = {
      concrete: pbr('yard-concrete', 0xe2d9c5, 0.96, 0.55, 0.27),
      rust: pbr('hull', 0x8a5a3c, 0.9, 0.6, 0.6),
      steel: plain({ color: 0x5a6563, metalness: 0.65, roughness: 0.55 }),
      dark: plain({ color: 0x24251f, metalness: 0.3, roughness: 0.85 }),
      pale: plain({ color: 0xaeaca0, metalness: 0.45, roughness: 0.6 }),
      yellow: plain({ color: 0xbf9a48, roughness: 0.78 }),
      red: plain({ color: 0x9b3a2a, roughness: 0.75 }),
      plaster: pbr('yard-concrete', 0xffe6bf, 0.98, 0.7, 0.35),
      tank: pbr('paint', 0xc9c3b2, 0.85, 0.4, 0.5),
      gravel: pbr('yard-concrete', 0xd8c7a6, 1, 0.9, 0.6),
      rock: pbr('yard-concrete', 0xd6a47c, 0.97, 1, 0.45),
      rubber: plain({ color: 0x151512, roughness: 0.95 }),
      glass: plain({ color: 0x1c2a2c, metalness: 0.6, roughness: 0.2 }),
      containers: [
        pbr('yard-container', 0xadc0a4, 0.86, 0.55, 0.32),
        pbr('hull', 0xc0703c, 0.9, 0.6, 0.6),
        plain({ color: 0x4f6a84, metalness: 0.5, roughness: 0.6 }),
        pbr('paint', 0xd2c49a, 0.88, 0.4, 0.6),
      ],
      lamp: host.yardLamp ?? plain({ color: 0xffe6b3, emissive: 0xffc876, emissiveIntensity: 2 }),
      beacon: host.mat({ color: 0x3a2a10, emissive: 0xffa020, emissiveIntensity: 0 }),
    };
    this.buildGround();
    this.buildRocks();
    this.buildStructures();
    this.buildSiteSigns();
    this.root.updateMatrixWorld(true);
  }

  // ---------- Geometrie-Bausteine ----------
  private box(w: number, h: number, d: number) {
    return this.host.geo(w, h, d, 0);
  }
  /** Zylinder mit Texturkoordinaten in Metern. */
  private cyl(rt: number, rb: number, h: number, seg = 16, open = false) {
    const key = ['cyl', rt, rb, h, seg, open].join(':');
    let g = this.geos.get(key);
    if (!g) {
      g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
      const uv = g.getAttribute('uv');
      const circ = Math.PI * (rt + rb);
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ, uv.getY(i) * h);
      this.geos.set(key, g);
      this.disposables.push(g);
    }
    return g;
  }
  private cone(r: number, h: number, seg = 18) {
    const key = ['cone', r, h, seg].join(':');
    let g = this.geos.get(key);
    if (!g) {
      g = new THREE.ConeGeometry(r, h, seg, 3);
      const uv = g.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * r * 6, uv.getY(i) * h);
      this.geos.set(key, g);
      this.disposables.push(g);
    }
    return g;
  }
  /** Schräger Balken von a nach b (lokale Koordinaten). */
  private beam(
    batch: Batch,
    frame: THREE.Matrix4,
    a: number[],
    b: number[],
    t: number,
    mat: THREE.Material,
  ) {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz);
    const mid = new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(dx, dy, dz).normalize(),
    );
    const m = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1));
    batch.add(this.box(t, len, t), mat, frame.clone().multiply(m));
  }

  // ---------- Gelände, Horizont, Felsen ----------
  private buildGround() {
    const sand = sandTexture();
    this.host.textures.push(sand);
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: sand,
      roughness: 0.97,
      metalness: 0,
    });
    // Zweite, grobe Abtastung derselben Körnung gegen sichtbare Wiederholung
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
          vec4 sampledDiffuseColor = texture2D( map, vMapUv );
          vec4 coarseSand = texture2D( map, vMapUv * 0.137 + vec2( 0.31, 0.73 ) );
          sampledDiffuseColor.rgb *= 0.55 + 0.5 * coarseSand.rgb;
          diffuseColor *= sampledDiffuseColor;
        #endif`,
      );
    };
    this.host.materials.push(material);
    this.host.yardMaterials.push(material);
    applyWetness(material, this.host.wet);
    const terrain = buildTerrain(material);
    this.root.add(terrain.root);
    this.disposables.push(...terrain.geometries);
    const ridgeMat = this.host.mat({ color: 0x6d5a48, roughness: 1, side: THREE.DoubleSide });
    const horizon = buildHorizon(ridgeMat);
    this.root.add(horizon);
    this.disposables.push(horizon.geometry);
  }
  private buildRocks() {
    const variants = [0, 1, 2].map((v) => {
      const g = new THREE.IcosahedronGeometry(1, 1);
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i),
          y = p.getY(i),
          z = p.getZ(i);
        const k = 0.72 + 0.35 * (noise(x * 2.1 + v * 7, z * 2.1 + y * 1.7) * 0.5 + 0.5);
        p.setXYZ(i, x * k * (1 + 0.25 * v), Math.max(-0.35, y) * k * (0.62 - v * 0.08), z * k);
      }
      g.computeVertexNormals();
      this.disposables.push(g);
      return g;
    });
    const counts = [0, 0, 0];
    for (const r of ROCKS) counts[r.variant]++;
    const meshes = variants.map((g, v) => {
      const mesh = new THREE.InstancedMesh(g, this.m.rock, counts[v]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = 'Rocks ' + v;
      mesh.count = 0;
      this.root.add(mesh);
      return mesh;
    });
    for (const r of ROCKS) {
      const mesh = meshes[r.variant];
      const y = FLOOR + terrainHeight(r.x, r.z) - r.r * 0.15;
      mesh.setMatrixAt(mesh.count++, mat4(r.x, y, r.z, 0, r.a, 0, r.r, r.r, r.r * 0.9));
    }
    for (const mesh of meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }

  // ---------- Anlagen ----------
  private buildStructures() {
    const batches = new Map<string, Batch>();
    const batchFor = (x: number, z: number) => {
      // Je Anlage ein eigenes Netz (Sichtbarkeitsprüfung), Rest in Zonen à 375 m
      const near = SITES.find((s) => Math.hypot(x - s.x, z - s.z) < s.r + 40);
      const key = near
        ? near.id
        : 'zone' + Math.floor((x - MAP.minX) / 375) + ':' + Math.floor((z - MAP.minZ) / 375);
      if (!batches.has(key)) batches.set(key, new Batch());
      return batches.get(key)!;
    };
    for (const s of STRUCTURES) {
      const target = 'target' in s && s.target ? TARGETS.find((t) => t.id === s.target) : undefined;
      if (target) {
        this.buildTarget(s, target);
        continue;
      }
      this.buildStructure(s, batchFor(s.x, s.z));
    }
    this.buildPowerLines();
    for (const [key, batch] of batches) {
      const group = new THREE.Group();
      group.name = 'Site ' + key;
      this.root.add(group);
      this.disposables.push(...batch.build(group, key));
    }
  }

  /** Fußpunkt-Matrix einer Anlage: Welt (x, Boden, z), Drehung a. */
  private frame(s: { x: number; z: number }, a = 0, radius = 2) {
    return mat4(s.x, FLOOR + baseHeight(s.x, s.z, radius) - 0.05, s.z, 0, a, 0);
  }

  private buildStructure(s: Structure, b: Batch) {
    const m = this.m;
    const add = (
      frame: THREE.Matrix4,
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      local: THREE.Matrix4,
    ) => b.add(geo, mat, frame.clone().multiply(local));
    switch (s.kind) {
      case 'tank':
        this.tank(b, this.frame(s, 0, s.r), s.r, s.h);
        break;
      case 'column': {
        const f = this.frame(s, 0, s.r + 1);
        add(f, this.cyl(s.r + 1.6, s.r + 1.8, 0.6, 20), m.concrete, mat4(0, 0.3, 0));
        add(f, this.cyl(s.r, s.r, s.h, 20), m.pale, mat4(0, s.h / 2, 0));
        add(f, this.cone(s.r, s.r * 0.8, 20), m.pale, mat4(0, s.h + s.r * 0.4, 0));
        for (let y = 6; y < s.h; y += 7) {
          add(f, this.cyl(s.r + 1.3, s.r + 1.3, 0.18, 20), m.steel, mat4(0, y, 0));
          add(
            f,
            this.cyl(s.r + 1.3, s.r + 1.3, 1.1, 20, true),
            m.steel,
            mat4(0, y + 0.6, 0, 0, 0, 0, 1, 0.08, 1),
          );
        }
        add(f, this.box(0.6, s.h, 0.3), m.steel, mat4(0, s.h / 2, s.r + 0.3));
        // Leitung zur Rohrbrücke
        add(f, this.cyl(0.35, 0.35, 8, 10), m.steel, mat4(s.r + 4, 5.5, 0, 0, 0, Math.PI / 2));
        break;
      }
      case 'flare': {
        const f = this.frame(s, 0, 3);
        add(f, this.box(4.5, 0.6, 4.5), m.concrete, mat4(0, 0.3, 0));
        const legs = [
          [-1.6, -1.6],
          [1.6, -1.6],
          [0, 1.8],
        ];
        for (const [lx, lz] of legs)
          this.beam(b, f, [lx, 0, lz], [lx * 0.25, s.h, lz * 0.25], 0.28, m.steel);
        for (let y = 4; y < s.h; y += 4.5) {
          const k = 1 - (y / s.h) * 0.75;
          for (let i = 0; i < 3; i++) {
            const [ax, az] = legs[i],
              [bx, bz] = legs[(i + 1) % 3];
            this.beam(b, f, [ax * k, y, az * k], [bx * k, y + 4.5, bz * k], 0.12, m.steel);
          }
        }
        add(f, this.cyl(0.45, 0.5, s.h + 2, 12), m.rust, mat4(0, (s.h + 2) / 2, 0));
        add(f, this.cyl(0.9, 0.6, 1.2, 12), m.dark, mat4(0, s.h + 2.6, 0));
        this.flame(s.x, FLOOR + baseHeight(s.x, s.z) + s.h + 4.5, s.z);
        break;
      }
      case 'rack': {
        const f = this.frame(s, s.a, 3);
        const n = Math.round(s.len / 6);
        for (let i = 0; i <= n; i++) {
          const x = -s.len / 2 + (i * s.len) / n;
          for (const z of [-1.6, 1.6]) add(f, this.box(0.35, 6.5, 0.35), m.steel, mat4(x, 3.25, z));
          add(f, this.box(0.3, 0.35, 3.6), m.steel, mat4(x, 6.4, 0));
          add(f, this.box(0.3, 0.3, 3.6), m.steel, mat4(x, 4.2, 0));
        }
        for (const [z, y, r] of [
          [-1.1, 6.95, 0.4],
          [-0.1, 6.85, 0.3],
          [0.9, 6.95, 0.45],
          [0.4, 4.6, 0.25],
        ])
          add(
            f,
            this.cyl(r, r, s.len, 12),
            z > 0.5 ? m.rust : m.pale,
            mat4(0, y, z, 0, 0, Math.PI / 2),
          );
        break;
      }
      case 'building':
        this.building(b, s);
        break;
      case 'warehouse': {
        const f = this.frame(s, s.a, 8);
        const { w, d, h } = s;
        for (let x = -w / 2; x <= w / 2 + 0.01; x += w / 6)
          for (const z of [-d / 2, d / 2])
            add(f, this.box(0.5, h, 0.5), m.steel, mat4(x, h / 2, z));
        add(f, this.box(w, h, 0.25), m.containers[3], mat4(0, h / 2, -d / 2));
        for (const x of [-w / 2, w / 2])
          add(f, this.box(0.25, h, d), m.containers[3], mat4(x, h / 2, 0));
        add(
          f,
          this.box(w + 1.5, 0.3, d / 2 + 1.2),
          m.containers[1],
          mat4(0, h + 0.65, -d / 4, -0.12, 0, 0),
        );
        add(
          f,
          this.box(w + 1.5, 0.3, d / 2 + 1.2),
          m.containers[1],
          mat4(0, h + 0.65, d / 4, 0.12, 0, 0),
        );
        // Kaputtes Rolltor halb heruntergelassen
        add(f, this.box(w * 0.3, h * 0.35, 0.15), m.steel, mat4(-w * 0.25, h * 0.82, d / 2));
        add(f, this.box(0.4, 0.4, 0.4), m.lamp, mat4(w * 0.3, h - 1, d / 2 + 0.3));
        break;
      }
      case 'container': {
        const f = this.frame(s, s.a, 3);
        for (let level = 0; level < s.stack; level++) {
          const y = level * 2.6;
          add(
            f,
            this.box(6.06, 2.6, 2.44),
            m.containers[(s.tint + level) % 4],
            mat4(0, y + 1.3, 0),
          );
          for (const sx of [-1, 1])
            for (const sz of [-1, 1])
              add(f, this.box(0.12, 2.62, 0.12), m.steel, mat4(sx * 2.98, y + 1.3, sz * 1.2));
          for (const xx of [-0.85, 0.85])
            add(f, this.box(0.06, 2.35, 0.06), m.pale, mat4(xx, y + 1.3, 1.25));
        }
        break;
      }
      case 'truck':
        this.truck(b, this.frame(s, s.a, 3), s.burnt ?? false);
        break;
      case 'car': {
        const f = this.frame(s, s.a, 2);
        add(f, this.box(1.8, 0.8, 4.3), m.rust, mat4(0, 0.75, 0, 0.02, 0, 0.06));
        add(f, this.box(1.6, 0.6, 2.1), m.dark, mat4(0, 1.45, -0.2, 0, 0, 0.06));
        for (const [x, z] of [
          [-0.85, -1.3],
          [0.85, -1.3],
          [-0.85, 1.3],
        ])
          add(f, this.cyl(0.36, 0.36, 0.25, 10), m.rubber, mat4(x, 0.36, z, 0, 0, Math.PI / 2));
        break;
      }
      case 'pile': {
        const f = this.frame(s, 0, s.r);
        add(f, this.cone(s.r, s.h, 22), m.gravel, mat4(0, s.h / 2 - 0.4, 0, 0, s.x, 0, 1, 1, 0.85));
        break;
      }
      case 'gantry': {
        const ax = s.x,
          az = s.z;
        const len = Math.hypot(s.x2 - ax, s.z2 - az),
          ang = -Math.atan2(s.z2 - az, s.x2 - ax);
        const f = mat4(ax, FLOOR + baseHeight(ax, az), az, 0, ang, 0);
        const slope = Math.atan2(s.h2 - s.h, len);
        add(
          f,
          this.box(len + 2, 1.6, 2.4),
          m.rust,
          mat4(len / 2, (s.h + s.h2) / 2, 0, 0, 0, slope),
        );
        add(
          f,
          this.box(len + 2, 0.15, 2.9),
          m.steel,
          mat4(len / 2, (s.h + s.h2) / 2 + 1.3, 0, 0, 0, slope),
        );
        for (let x = 6; x < len; x += 10) {
          const y = s.h + ((s.h2 - s.h) * x) / len;
          for (const z of [-1.5, 1.5])
            this.beam(b, f, [x, 0, z * 1.5], [x, y - 0.8, z], 0.3, m.steel);
          add(f, this.box(0.25, 0.25, 4.5), m.steel, mat4(x, y * 0.5, 0));
        }
        break;
      }
      case 'excavator': {
        const f = this.frame(s, s.a, 4);
        for (const x of [-1.9, 1.9]) add(f, this.box(1.1, 1.3, 6.5), m.dark, mat4(x, 0.65, 0));
        add(f, this.box(3.6, 2.2, 4.6), m.yellow, mat4(0, 2.4, 0.3, 0, 0.3, 0));
        add(f, this.box(1.6, 1.8, 1.8), m.glass, mat4(-0.9, 4.2, -1.2, 0, 0.3, 0));
        this.beam(b, f, [0.4, 3, -1.8], [1.6, 7, -6], 0.8, m.yellow);
        this.beam(b, f, [1.6, 7, -6], [2.2, 2.5, -8.5], 0.6, m.yellow);
        add(f, this.box(2.2, 1.3, 1.6), m.rust, mat4(2.3, 1.2, -8.8, 0.6, 0.3, 0));
        break;
      }
      case 'waterTower': {
        const f = this.frame(s, 0, 4);
        for (const [x, z] of [
          [-3, -3],
          [3, -3],
          [-3, 3],
          [3, 3],
        ]) {
          this.beam(b, f, [x * 1.15, 0, z * 1.15], [x * 0.8, s.h, z * 0.8], 0.4, m.steel);
          add(f, this.box(1.2, 0.5, 1.2), m.concrete, mat4(x * 1.15, 0.25, z * 1.15));
        }
        for (let y = 5; y < s.h; y += 5.5) {
          const k = 1.15 - (y / s.h) * 0.35;
          for (const [a, c] of [
            [
              [-3, -3],
              [3, -3],
            ],
            [
              [3, -3],
              [3, 3],
            ],
            [
              [3, 3],
              [-3, 3],
            ],
            [
              [-3, 3],
              [-3, -3],
            ],
          ])
            this.beam(b, f, [a[0] * k, y, a[1] * k], [c[0] * k, y, c[1] * k], 0.18, m.steel);
        }
        add(f, this.cyl(5, 5, 6.5, 22), m.rust, mat4(0, s.h + 3.2, 0));
        add(f, this.cone(5.4, 2.4, 22), m.dark, mat4(0, s.h + 7.6, 0));
        add(f, this.box(0.3, s.h + 6, 0.3), m.steel, mat4(0, (s.h + 6) / 2, 0));
        break;
      }
      case 'pylon': {
        const f = this.frame(s, s.a, 2);
        const h = 24;
        for (const [x, z] of [
          [-1.8, -1.8],
          [1.8, -1.8],
          [-1.8, 1.8],
          [1.8, 1.8],
        ])
          this.beam(b, f, [x, 0, z], [x * 0.3, h, z * 0.3], 0.22, m.steel);
        for (let y = 3; y < h - 2; y += 3.5) {
          const k = 1 - (y / h) * 0.7;
          this.beam(b, f, [-1.8 * k, y, -1.8 * k], [1.8 * k, y + 3.5, 1.8 * k], 0.1, m.steel);
          this.beam(b, f, [1.8 * k, y, -1.8 * k], [-1.8 * k, y + 3.5, 1.8 * k], 0.1, m.steel);
        }
        add(f, this.box(0.4, 0.4, 11), m.steel, mat4(0, h - 1.5, 0));
        add(f, this.box(0.35, 0.35, 7), m.steel, mat4(0, h + 1.5, 0));
        for (const [y, z] of [
          [h - 2.3, -5.2],
          [h - 2.3, 5.2],
          [h + 0.8, 3.2],
        ])
          add(f, this.cyl(0.18, 0.18, 1.3, 8), m.pale, mat4(0, y, z));
        break;
      }
      case 'pipe': {
        const len = Math.hypot(s.x2 - s.x, s.z2 - s.z),
          ang = -Math.atan2(s.z2 - s.z, s.x2 - s.x);
        const y0 = FLOOR + Math.min(terrainHeight(s.x, s.z), terrainHeight(s.x2, s.z2));
        const f = mat4(s.x, y0, s.z, 0, ang, 0);
        // Leitung folgt dem Gelände nicht – Stützen gleichen aus
        add(f, this.cyl(0.6, 0.6, len + 0.4, 14), m.pale, mat4(len / 2, 2, 0, 0, 0, Math.PI / 2));
        for (let x = 0; x <= len; x += len / 2) {
          const ground =
            FLOOR + terrainHeight(s.x + Math.cos(-ang) * x, s.z + Math.sin(-ang) * x) - y0;
          add(
            f,
            this.box(1.4, 2.2 - ground + 0.6, 1),
            m.concrete,
            mat4(x, (1.4 + ground) / 2 - 0.3 + 0.2, 0),
          );
          add(f, this.box(0.3, 0.3, 1.6), m.steel, mat4(x, 1.45, 0));
        }
        add(f, this.cyl(0.66, 0.66, 0.25, 14), m.steel, mat4(len, 2, 0, 0, 0, Math.PI / 2));
        break;
      }
      case 'drums': {
        const f = this.frame(s, 0, 2);
        for (let i = 0; i < s.n; i++) {
          const a = i * 2.4,
            r = 0.7 * Math.sqrt(i);
          const fallen = i % 5 === 3;
          add(
            f,
            this.cyl(0.3, 0.3, 0.9, 12),
            [m.rust, m.red, m.containers[2], m.yellow][i % 4],
            fallen
              ? mat4(Math.cos(a) * r, 0.3, Math.sin(a) * r, 0, a, Math.PI / 2)
              : mat4(Math.cos(a) * r, 0.45, Math.sin(a) * r),
          );
        }
        break;
      }
      case 'checkpost': {
        const f = this.frame(s, s.a, 2);
        add(f, this.box(3.2, 2.6, 3.2), m.plaster, mat4(0, 1.3, 0));
        add(f, this.box(3.6, 0.25, 3.6), m.dark, mat4(0, 2.72, 0));
        add(f, this.box(2.2, 0.8, 0.05), m.glass, mat4(0, 1.7, 1.62));
        add(f, this.box(0.5, 0.5, 0.5), m.lamp, mat4(1.4, 2.4, 1.7));
        // Schranke (rot/weiß) quer zur Straße, offen
        for (let i = 0; i < 8; i++)
          add(f, this.box(0.18, 0.8, 0.18), i % 2 ? m.pale : m.red, mat4(2.4, 1.6 + i * 0.8, 0.2));
        add(f, this.box(0.5, 1.2, 0.5), m.steel, mat4(2.4, 0.6, 0.2));
        // Blinklicht-Mast
        add(f, this.box(0.25, 9, 0.25), m.steel, mat4(-3, 4.5, -1));
        const lamp = new THREE.Mesh(this.cyl(0.35, 0.35, 0.5, 12), m.beacon);
        lamp.position.set(-3, 9.25, -1);
        const g = new THREE.Group();
        g.matrixAutoUpdate = false;
        g.matrix.copy(f);
        g.add(lamp);
        this.root.add(g);
        this.beacons.push(m.beacon);
        break;
      }
      case 'mechwreck':
        void this.mechWreck(s);
        break;
      default:
        break;
    }
  }

  private tank(b: Batch, f: THREE.Matrix4, r: number, h: number) {
    const m = this.m;
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, local: THREE.Matrix4) =>
      b.add(geo, mat, f.clone().multiply(local));
    add(this.cyl(r + 1.2, r + 1.4, 0.5, 28), m.concrete, mat4(0, 0.25, 0));
    add(this.cyl(r, r, h, 32), m.tank, mat4(0, 0.5 + h / 2, 0));
    add(this.cone(r * 1.02, r * 0.2, 32), m.tank, mat4(0, 0.5 + h + r * 0.1, 0));
    for (const y of [h * 0.33, h * 0.66])
      add(this.cyl(r + 0.08, r + 0.08, 0.22, 32), m.steel, mat4(0, 0.5 + y, 0));
    // Treppe außen und Geländer oben
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * 1.4,
        y = 0.5 + (i / 9) * h;
      add(
        this.box(1.1, 0.12, 0.9),
        m.steel,
        mat4(Math.cos(a) * (r + 0.6), y, Math.sin(a) * (r + 0.6), 0, -a, 0),
      );
    }
    add(
      this.cyl(r * 0.98, r * 0.98, 1, 32, true),
      m.steel,
      mat4(0, 0.5 + h + 0.8, 0, 0, 0, 0, 1, 0.1, 1),
    );
    add(this.box(1.2, 1.2, 1.2), m.rust, mat4(r + 0.5, 1.1, 0));
    add(this.cyl(0.35, 0.35, 4, 10), m.pale, mat4(r + 2.5, 1.1, 0, 0, 0, Math.PI / 2));
  }

  private building(b: Batch, s: Extract<Structure, { kind: 'building' }>) {
    const m = this.m;
    const f = this.frame(s, s.a, Math.min(s.w, s.d) / 2);
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, local: THREE.Matrix4) =>
      b.add(geo, mat, f.clone().multiply(local));
    const { w, d, h } = s;
    if (s.style === 'ruin') {
      // Wände ohne Dach, unregelmäßig abgebrochen, Schutt davor
      let k = Math.abs(Math.round(s.x * 13 + s.z * 7));
      const rnd = () => (k = (k * 1103515245 + 12345) % 2147483648) / 2147483648;
      const wall = (x0: number, z0: number, x1: number, z1: number) => {
        const len = Math.hypot(x1 - x0, z1 - z0),
          ang = -Math.atan2(z1 - z0, x1 - x0);
        const n = Math.max(2, Math.round(len / 2.4));
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n;
          const wh = h * (0.35 + 0.65 * rnd());
          if (rnd() < 0.12) continue; // Loch in der Wand
          add(
            this.box(len / n + 0.02, wh, 0.4),
            m.plaster,
            mat4(x0 + (x1 - x0) * t, wh / 2, z0 + (z1 - z0) * t, 0, ang, 0),
          );
        }
      };
      wall(-w / 2, -d / 2, w / 2, -d / 2);
      wall(w / 2, -d / 2, w / 2, d / 2);
      wall(w / 2, d / 2, -w / 2, d / 2);
      wall(-w / 2, d / 2, -w / 2, -d / 2);
      for (let i = 0; i < 5; i++)
        add(
          this.box(1 + rnd() * 2, 0.4 + rnd() * 0.6, 1 + rnd() * 1.5),
          m.concrete,
          mat4((rnd() - 0.5) * w * 0.7, 0.2, (rnd() - 0.5) * d * 0.7, rnd() * 0.3, rnd() * 3, 0),
        );
      add(this.box(w * 0.6, 0.25, d * 0.3), m.dark, mat4(0, h * 0.55, -d * 0.2, 0.5, 0, 0.2));
      return;
    }
    const wallMat = s.style === 'metal' ? m.containers[0] : m.plaster;
    add(this.box(w, h, d), wallMat, mat4(0, h / 2, 0));
    add(this.box(w + 0.6, 0.3, d + 0.6), m.dark, mat4(0, h + 0.15, 0));
    add(this.box(2.2, 2.6, 0.1), m.dark, mat4(-w * 0.25, 1.3, d / 2 + 0.05));
    for (let x = -w / 2 + 2.5; x < w / 2 - 1.5; x += 3.5)
      add(this.box(1.6, 1.1, 0.1), m.glass, mat4(x + 1.2, h * 0.6, d / 2 + 0.05));
    add(this.box(0.4, 0.4, 0.4), m.lamp, mat4(-w * 0.25, 2.9, d / 2 + 0.25));
    if (s.style === 'concrete')
      for (const x of [-w / 4, w / 4]) add(this.box(1.6, 1, 1.6), m.steel, mat4(x, h + 0.8, 0));
    if (s.label) {
      const y = FLOOR + baseHeight(s.x, s.z, Math.min(w, d) / 2) + h * 0.85;
      const sign = new THREE.Group();
      sign.position.set(s.x, y, s.z);
      sign.rotation.y = s.a;
      this.root.add(sign);
      this.host.label(
        sign,
        s.label,
        0,
        0,
        d / 2 + 0.08,
        Math.min(w * 0.6, 8),
        0.9,
        '#d6cfb3',
        '#2a2a24',
      );
    }
  }

  private truck(b: Batch, f: THREE.Matrix4, burnt: boolean) {
    const m = this.m;
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, local: THREE.Matrix4) =>
      b.add(geo, mat, f.clone().multiply(local));
    const paint = burnt ? m.rust : m.containers[0];
    add(this.box(2.3, 0.5, 7.6), m.dark, mat4(0, 1.05, 0));
    add(this.box(2.4, 2.2, 2.2), paint, mat4(0, 2.2, -2.8));
    add(this.box(2.2, 0.9, 0.08), burnt ? m.dark : m.glass, mat4(0, 2.7, -3.92));
    add(this.box(2.5, 2.4, 5), burnt ? m.dark : m.containers[3], mat4(0, 2.5, 1.2));
    for (const z of [-2.8, 0.6, 2.4])
      for (const x of [-1.15, 1.15])
        add(this.cyl(0.55, 0.55, 0.45, 12), m.rubber, mat4(x, 0.55, z, 0, 0, Math.PI / 2));
  }

  /** Ziele: eigene Gruppen (werden beim Zerstören verändert). */
  private buildTarget(s: Structure, t: Target) {
    const group = new THREE.Group();
    group.name = 'Target ' + t.id;
    this.root.add(group);
    const b = new Batch();
    const base = new THREE.Vector3(s.x, FLOOR + baseHeight(s.x, s.z, 3) - 0.05, s.z);
    const id = new THREE.Matrix4();
    let moving: THREE.Object3D | undefined;
    switch (s.kind) {
      case 'tank': {
        this.tank(b, id, s.r, s.h);
        const label = s.label ?? '';
        this.host.label(
          group,
          label,
          0,
          0.5 + s.h * 0.6,
          s.r + 0.05,
          s.r * 1.1,
          s.r * 0.22,
          '#3a3a33',
        );
        break;
      }
      case 'truck':
        this.truck(b, mat4(0, 0, 0, 0, s.a, 0), false);
        break;
      case 'valve': {
        const m = this.m;
        const f = mat4(0, 0, 0, 0, s.a, 0);
        const add = (geo: THREE.BufferGeometry, mat: THREE.Material, local: THREE.Matrix4) =>
          b.add(geo, mat, f.clone().multiply(local));
        add(this.box(6, 0.4, 4.5), m.concrete, mat4(0, 0.2, 0));
        add(this.cyl(0.8, 0.8, 5.5, 14), m.yellow, mat4(0, 2, 0, 0, 0, Math.PI / 2));
        add(this.cyl(1.1, 1.1, 1.4, 14), m.yellow, mat4(0, 2, 0));
        add(this.box(1.4, 1.6, 1.4), m.steel, mat4(0, 3.3, 0));
        add(this.cyl(0.9, 0.9, 0.12, 16), m.red, mat4(0, 4.2, 0));
        add(this.box(1.6, 2, 1.4), m.containers[2], mat4(2.4, 1.2, 1.6));
        break;
      }
      case 'mast': {
        // Gittermast als eigene Gruppe: kippt beim Zerstören um den Fuß
        const pivot = new THREE.Group();
        group.add(pivot);
        moving = pivot;
        const mb = new Batch();
        const m = this.m;
        const legs = [
          [-2.4, -2.4],
          [2.4, -2.4],
          [2.4, 2.4],
          [-2.4, 2.4],
        ];
        for (const [x, z] of legs)
          this.beam(mb, id, [x, 0, z], [x * 0.15, s.h, z * 0.15], 0.3, m.red);
        for (let y = 0; y < s.h - 3; y += 3.2) {
          const k0 = 1 - (y / s.h) * 0.85,
            k1 = 1 - ((y + 3.2) / s.h) * 0.85;
          for (let i = 0; i < 4; i++) {
            const [ax, az] = legs[i],
              [bx, bz] = legs[(i + 1) % 4];
            this.beam(
              mb,
              id,
              [ax * k0, y, az * k0],
              [bx * k1, y + 3.2, bz * k1],
              0.09,
              i % 2 ? m.pale : m.red,
            );
          }
        }
        for (const y of [s.h * 0.55, s.h * 0.8])
          for (const a of [0, 2.1, 4.2])
            mb.add(
              this.cyl(0.6, 0.6, 1.8, 10),
              m.pale,
              mat4(Math.cos(a) * 1.2, y, Math.sin(a) * 1.2, Math.PI / 2, a, 0),
            );
        mb.add(this.box(0.2, 6, 0.2), m.steel, mat4(0, s.h + 3, 0));
        mb.add(this.box(0.5, 0.5, 0.5), m.lamp, mat4(0, s.h + 6, 0));
        this.disposables.push(...mb.build(pivot, 'mast'));
        b.add(this.box(6.5, 0.6, 6.5), m.concrete, mat4(0, 0.3, 0));
        break;
      }
      case 'radar': {
        const m = this.m;
        for (const [x, z] of [
          [-2, -2],
          [2, -2],
          [2, 2],
          [-2, 2],
        ]) {
          this.beam(b, id, [x, 0, z], [x * 0.5, s.h, z * 0.5], 0.3, m.steel);
          b.add(this.box(0.9, 0.5, 0.9), m.concrete, mat4(x, 0.25, z));
        }
        b.add(this.box(3.4, 0.3, 3.4), m.steel, mat4(0, s.h, 0));
        const dishGroup = new THREE.Group();
        dishGroup.position.set(0, s.h + 1.2, 0);
        group.add(dishGroup);
        const db = new Batch();
        const dish = new THREE.SphereGeometry(4, 24, 8, 0, Math.PI * 2, 0, 0.75);
        this.disposables.push(dish);
        db.add(dish, m.pale, mat4(0, 0.4, 1.5, -Math.PI / 2 - 0.2, 0, 0, 1, 1, 0.5));
        db.add(this.cyl(0.6, 0.8, 1.6, 12), m.steel, mat4(0, -0.6, 0));
        db.add(this.box(0.15, 0.15, 3.4), m.steel, mat4(0, 1.2, -0.4, -0.2, 0, 0));
        db.add(this.box(0.6, 0.6, 0.6), m.dark, mat4(0, 1.6, -2.1));
        this.disposables.push(...db.build(dishGroup, 'radar dish'));
        moving = dishGroup;
        this.radarDish = dishGroup;
        break;
      }
      default:
        break;
    }
    this.disposables.push(...b.build(group, t.id));
    group.position.copy(base);
    group.updateMatrixWorld(true);
    this.targets.set(t.id, { target: t, group, moving, base });
  }

  private buildPowerLines() {
    const pos: number[] = [];
    for (let i = 1; i < POWER_LINE.length; i++) {
      const [ax, az] = POWER_LINE[i - 1],
        [bx, bz] = POWER_LINE[i];
      const ya = FLOOR + baseHeight(ax, az) + 21.7,
        yb = FLOOR + baseHeight(bx, bz) + 21.7;
      const ang = Math.atan2(bz - az, bx - ax);
      const nx = -Math.sin(ang),
        nz = Math.cos(ang);
      for (const [off, dy] of [
        [-5.2, 0],
        [5.2, 0],
        [3.2, 3.1],
      ]) {
        const steps = 12;
        for (let k = 0; k < steps; k++) {
          for (const t of [k / steps, (k + 1) / steps]) {
            const sag = 4 * t * (1 - t) * 3.2;
            pos.push(
              ax + (bx - ax) * t + nx * off,
              ya + (yb - ya) * t + dy - sag,
              az + (bz - az) * t + nz * off,
            );
          }
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x1d1f1c }));
    lines.name = 'Power lines';
    lines.matrixAutoUpdate = false;
    this.root.add(lines);
    this.disposables.push(g, lines.material as THREE.Material);
  }

  private buildSiteSigns() {
    // Wegweiser an der Ausfahrt aus dem Testgelände
    {
      const g = new THREE.Group();
      g.position.set(47, FLOOR, -188);
      g.rotation.y = 0.6;
      this.root.add(g);
      const b = new Batch();
      for (const px of [-2.6, 2.6]) b.add(this.box(0.2, 4.6, 0.2), this.m.steel, mat4(px, 2.3, 0));
      b.add(this.box(5.8, 1.6, 0.1), this.m.yellow, mat4(0, 3.8, -0.07));
      this.disposables.push(...b.build(g, 'exit sign'));
      this.host.label(g, 'AUSFAHRT WÜSTE · KREUZWEG 450 M', 0, 3.8, 0, 5.5, 0.7, '#1d1c18');
    }
    for (const s of SITES) {
      if (s.id === 'checkpoint') continue;
      // Schild am Rand der Anlage, zur Halle (Süden) gedreht
      const ang = Math.atan2(-s.x, 600 - s.z * 0) * 0;
      const x = s.x + s.r * 0.75,
        z = s.z + s.r * 0.55;
      const y = FLOOR + terrainHeight(x, z);
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.rotation.y = ang;
      this.root.add(g);
      const b = new Batch();
      for (const px of [-3.4, 3.4])
        b.add(this.box(0.25, 5.2, 0.25), this.m.steel, mat4(px, 2.6, 0));
      b.add(this.box(7.6, 1.8, 0.12), this.m.dark, mat4(0, 4.4, -0.08));
      this.disposables.push(...b.build(g, 'sign'));
      this.host.label(g, s.name, 0, 4.4, 0, 7.2, 1, '#d6cfb3');
    }
  }

  /** Wrack IV-01: das eigene Mech-Modell, umgestürzt und halb im Sand. */
  private async mechWreck(s: Extract<Structure, { kind: 'mechwreck' }>) {
    const ext = this.host.exterior;
    if (!ext) return;
    await ext.ready;
    const model = ext.model;
    if (!model || this.host.disposed) return;
    const wreck = model.clone(true);
    const rust = this.m.rust;
    // Lichter, Drohnenhalterung usw. hängen am lebenden Modell – im Wrack nur die Hülle
    const extras: THREE.Object3D[] = [];
    wreck.traverse((o) => {
      const transparent =
        o instanceof THREE.Mesh &&
        [o.material]
          .flat()
          .some((m: THREE.Material) => m.transparent || m.blending !== THREE.NormalBlending);
      // Lichtkegel der Scheinwerfer, Funken, Linien: im Wrack nichts davon
      if (
        o instanceof THREE.Light ||
        o instanceof THREE.Sprite ||
        o instanceof THREE.Points ||
        o instanceof THREE.Line ||
        transparent
      )
        extras.push(o);
    });
    for (const o of extras) o.removeFromParent();
    // Eigene Lackierung behalten, aber verblichen und angerostet
    const faded = new Map<THREE.Material, THREE.Material>();
    wreck.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const src = o.material as THREE.MeshStandardMaterial;
        if (!faded.has(src)) {
          const m = src.clone();
          m.onBeforeCompile = () => {};
          if (m.color) m.color.multiply(new THREE.Color(0xa07e62));
          this.disposables.push(m);
          faded.set(src, m);
        }
        o.material = faded.get(src) ?? rust;
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    const holder = new THREE.Group();
    const y = FLOOR + terrainHeight(s.x, s.z) - 0.9;
    holder.position.set(s.x, y, s.z);
    holder.rotation.set(0, s.a, 0);
    const tilt = new THREE.Group();
    tilt.rotation.set(-0.35, 0, 1.35); // auf die Seite gekippt, halb im Sand
    holder.add(tilt);
    wreck.scale.setScalar(9.5);
    wreck.position.set(0, 0, 0);
    tilt.add(wreck);
    this.root.add(holder);
    holder.updateMatrixWorld(true);
    // Die vielen Einzelteile des Modells zu je einem Netz pro Material zusammenfassen
    // (statt rund 80 Zeichenaufrufen für ein fernes Wrack nur noch eine Handvoll).
    const inv = holder.matrixWorld.clone().invert();
    const batch = new Batch();
    wreck.traverse((o) => {
      if (o instanceof THREE.Mesh && o.visible)
        batch.add(o.geometry, o.material as THREE.Material, inv.clone().multiply(o.matrixWorld));
    });
    tilt.removeFromParent();
    this.disposables.push(...batch.build(holder, 'IV-01 wreck'));
    holder.updateMatrixWorld(true);
  }

  private flame(x: number, y: number, z: number) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 40, 2, 32, 34, 30);
    grad.addColorStop(0, 'rgba(255,245,200,1)');
    grad.addColorStop(0.35, 'rgba(255,160,50,0.85)');
    grad.addColorStop(1, 'rgba(255,60,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.host.textures.push(tex);
    const mat = new THREE.SpriteMaterial({
      map: tex,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.disposables.push(mat);
    for (let i = 0; i < 3; i++) {
      const sp = new THREE.Sprite(mat);
      sp.position.set(x, y + i * 1.2, z);
      sp.scale.set(3, 5, 1);
      this.root.add(sp);
      this.flames.push(sp);
    }
  }

  /** Pro Bild: Fackel flackert, Radar dreht, Blinklicht. */
  update(time: number, dt: number) {
    for (let i = 0; i < this.flames.length; i++) {
      const sp = this.flames[i];
      const f = 0.8 + 0.35 * Math.sin(time * (9 + i * 3.1) + i) + 0.2 * noise(time * 3 + i * 5, i);
      sp.scale.set(2.6 * f + i * 0.3, 4.6 * f + i, 1);
      sp.updateMatrixWorld();
    }
    if (this.radarDish && this.radarDish.userData.stopped !== true) {
      this.radarDish.rotation.y += dt * 0.6;
      this.radarDish.updateMatrixWorld(true);
    }
    const blink = Math.sin(time * 4.2) > 0.2 ? 3 : 0.05;
    for (const b of this.beacons) b.emissiveIntensity = blink;
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.root.removeFromParent();
  }
}

export { site };
