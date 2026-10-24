// Bereitet das Schwesterschiff IV-02 aus einer sehr detaillierten FBX auf.
//
// Aufruf:  node --max-old-space-size=8000 scripts/prepare-sister-mech.mjs PFAD/122.fbx
// Ergebnis: public/models/iv-02-sister.glb
//
// - Vereinfachung von ~10 Mio. auf ~260.000 Dreiecke (meshoptimizer, je Teil)
// - Teile mit Außenkante links (linker Arm) werden als eigener Knoten "detached_arm"
//   abgelegt – IV-02 ist ein Teilespender, der Arm liegt abmontiert daneben.
// - Nur Position, Normale, Index; Lack und Verschleiß kommen zur Laufzeit per Shader.
// - Höhe auf 1 normiert, Fußsohle bei y = 0, horizontal zentriert.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { MeshoptSimplifier } from 'three/examples/jsm/libs/meshopt_simplifier.module.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const source = process.argv[2];
if (!source) throw new Error('Pfad zur FBX angeben');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public/models/iv-02-sister.glb');
const TARGET = 260000;

globalThis.self ??= globalThis;
globalThis.window ??= globalThis;
THREE.TextureLoader.prototype.load = () => new THREE.Texture(); // Texturen fehlen ohnehin
const bytes = fs.readFileSync(source);
const scene = new FBXLoader().parse(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  '',
);
scene.updateMatrixWorld(true);
await MeshoptSimplifier.ready;

const parts = [];
let total = 0;
scene.traverse((o) => {
  if (!o.isMesh) return;
  let g = o.geometry.clone();
  g.applyMatrix4(o.matrixWorld);
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  g = mergeVertices(g, 1e-5);
  const tris = g.index.count / 3;
  total += tris;
  parts.push({ name: o.name, g, tris });
});
const box = new THREE.Box3();
for (const p of parts) box.expandByObject(new THREE.Mesh(p.g));
const size = box.getSize(new THREE.Vector3());
const scale = 1 / size.y;
const ratio = TARGET / total;
console.log(
  'Quelle:',
  parts.length,
  'Teile,',
  Math.round(total),
  'Dreiecke, Verhältnis',
  ratio.toFixed(4),
);

const meshes = { body: [], detached_arm: [] };
let kept = 0;
for (const p of parts) {
  const pos = p.g.attributes.position.array;
  const idx = new Uint32Array(p.g.index.array);
  const r = Math.max(ratio, p.tris < 3000 ? 0.4 : ratio);
  const target = Math.max(36, Math.floor((idx.length * r) / 3) * 3);
  let [simplified] = MeshoptSimplifier.simplify(idx, pos, 3, target, 0.02, ['LockBorder']);
  if (simplified.length > target * 1.6)
    simplified = MeshoptSimplifier.simplifySloppy(idx, pos, 3, null, target, 0.02)[0];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(new THREE.BufferAttribute(simplified, 1));
  // Normieren: Fußsohle y = 0, mittig, Höhe 1
  g.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  g.scale(scale, scale, scale);
  const compact = compactGeometry(g);
  compact.computeVertexNormals();
  compact.computeBoundingBox();
  const c = compact.boundingBox.getCenter(new THREE.Vector3());
  // Die Teile der Quelle sind spiegelsymmetrisch zusammengefasst; der Arm wird daher
  // über die Lage der Dreiecke abgetrennt (Außenseite +x, oberhalb y = 0,6).
  const [stay, arm] = splitArm(compact);
  meshes.body.push(stay);
  if (arm) meshes.detached_arm.push(arm);
  kept += compact.index.count / 3;
  if (process.env.DEBUG)
    console.log(
      p.name,
      c
        .toArray()
        .map((v) => v.toFixed(2))
        .join(','),
      Math.round(compact.index.count / 3),
    );
}
console.log('Ergebnis:', Math.round(kept), 'Dreiecke; Arm-Teile:', meshes.detached_arm.length);

function splitArm(g) {
  const idx = g.index.array,
    pos = g.attributes.position.array;
  const keep = [],
    take = [];
  for (let i = 0; i < idx.length; i += 3) {
    let x = 0,
      y = 0;
    for (let k = 0; k < 3; k++) {
      x += pos[idx[i + k] * 3];
      y += pos[idx[i + k] * 3 + 1];
    }
    (x / 3 > 0.205 && y / 3 > 0.6 ? take : keep).push(idx[i], idx[i + 1], idx[i + 2]);
  }
  const part = (list) => {
    if (!list.length) return null;
    const r = new THREE.BufferGeometry();
    r.setAttribute('position', g.attributes.position);
    r.setAttribute('normal', g.attributes.normal);
    r.setIndex(new THREE.BufferAttribute(new Uint32Array(list), 1));
    const c = compactGeometry(r);
    c.computeVertexNormals();
    return c;
  };
  return [part(keep) ?? part([0, 0, 0]), part(take)];
}

function compactGeometry(g) {
  const idx = g.index.array,
    pos = g.attributes.position.array;
  const map = new Map(),
    np = [],
    ni = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) {
    let m = map.get(idx[i]);
    if (m === undefined) {
      m = np.length / 3;
      map.set(idx[i], m);
      np.push(pos[idx[i] * 3], pos[idx[i] * 3 + 1], pos[idx[i] * 3 + 2]);
    }
    ni[i] = m;
  }
  const r = new THREE.BufferGeometry();
  r.setAttribute('position', new THREE.BufferAttribute(new Float32Array(np), 3));
  r.setIndex(new THREE.BufferAttribute(ni, 1));
  return r;
}

// ---- Minimaler GLB-Schreiber: je Gruppe ein Mesh (Teile zusammengeführt) ----
function merge(list) {
  let vc = 0,
    ic = 0;
  for (const g of list) {
    vc += g.attributes.position.count;
    ic += g.index.count;
  }
  const pos = new Float32Array(vc * 3),
    nor = new Float32Array(vc * 3),
    idx = new Uint32Array(ic);
  let vo = 0,
    io = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += g.attributes.position.count;
    io += gi.length;
  }
  return { pos, nor, idx };
}
const chunks = [],
  views = [],
  accessors = [],
  meshDefs = [],
  nodes = [];
let offset = 0;
const pad = (n) => (n + 3) & ~3;
function addView(arr, target) {
  const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
  chunks.push(buf, Buffer.alloc(pad(buf.length) - buf.length));
  views.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, target });
  offset += pad(buf.length);
  return views.length - 1;
}
for (const [name, list] of Object.entries(meshes)) {
  if (!list.length) continue;
  const { pos, nor, idx } = merge(list);
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], pos[i + k]);
      max[k] = Math.max(max[k], pos[i + k]);
    }
  const pv = addView(pos, 34962),
    nv = addView(nor, 34962),
    iv = addView(idx, 34963);
  accessors.push({
    bufferView: pv,
    componentType: 5126,
    count: pos.length / 3,
    type: 'VEC3',
    min,
    max,
  });
  accessors.push({ bufferView: nv, componentType: 5126, count: nor.length / 3, type: 'VEC3' });
  accessors.push({ bufferView: iv, componentType: 5125, count: idx.length, type: 'SCALAR' });
  const a = accessors.length;
  meshDefs.push({
    name,
    primitives: [{ attributes: { POSITION: a - 3, NORMAL: a - 2 }, indices: a - 1 }],
  });
  nodes.push({ name, mesh: meshDefs.length - 1 });
}
const bin = Buffer.concat(chunks);
const json = {
  asset: { version: '2.0', generator: 'IRON VAULT prepare-sister-mech.mjs' },
  scene: 0,
  scenes: [{ nodes: nodes.map((_, i) => i) }],
  nodes,
  meshes: meshDefs,
  accessors,
  bufferViews: views,
  buffers: [{ byteLength: bin.length }],
  extras: {
    source: path.basename(source),
    sourceSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    sourceTriangles: Math.round(total),
    triangles: Math.round(kept),
    note: 'Höhe auf 1 normiert; Fußsohle bei y=0. Ohne Texturen (Lack per Shader).',
  },
};
let jsonBuf = Buffer.from(JSON.stringify(json));
jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(pad(jsonBuf.length) - jsonBuf.length, 0x20)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + bin.length, 8);
const jh = Buffer.alloc(8);
jh.writeUInt32LE(jsonBuf.length, 0);
jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8);
bh.writeUInt32LE(bin.length, 0);
bh.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(out, Buffer.concat([header, jh, jsonBuf, bh, bin]));
console.log(
  'geschrieben:',
  path.relative(root, out),
  (fs.statSync(out).size / 1048576).toFixed(2),
  'MB',
);
