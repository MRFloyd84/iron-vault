// Neuen IV-04 aus Teilen zusammensetzen. Knotennamen und Gelenkpunkte bleiben die des
// bisherigen Modells (Torso, L_/R_Thigh, _Calf, _Foot, _Upperarm, _Forearm), damit Gang,
// Gelenke, Hydraulik und Lichter unverändert funktionieren.
//
// Aufruf (Werkzeuge einmalig: npm i --no-save @gltf-transform/core @gltf-transform/extensions
//   @gltf-transform/functions meshoptimizer):
//   node scripts/assemble-mech.mjs assets-src/mech-parts/iron-vault-rigged.glb assets-src/mech-parts \
//     public/models/iv-04-mech.glb
// Teile in assets-src/mech-parts/ entstehen mit scripts/simplify-mech-part.mjs und danach
// scripts/reduce-mech-part.mjs aus Renes Tripo-Dateien (Rumpf 60 000, Becken 28 000, Fuß 30 000,
// Oberschenkel 26 000, Schienbein 24 000, Oberarm 18 000, Kanone 18 000 Dreiecke, Texturen 1024 px).
import { NodeIO } from '@gltf-transform/core';
import {
  ALL_EXTENSIONS,
  EXTMeshoptCompression,
  KHRMeshQuantization,
} from '@gltf-transform/extensions';
import {
  mergeDocuments,
  prune,
  quantize,
  reorder,
  transformMesh,
  unpartition,
} from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const [oldPath, partsDir, outPath] = process.argv.slice(2);
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(oldPath);
const root = doc.getRoot();
const node = (name) => {
  const n = root.listNodes().find((x) => x.getName() === name);
  if (!n) throw new Error('Knoten fehlt: ' + name);
  return n;
};
/** Rumpf: Breite über die Schulterringe, Unterkante des Drehkranzes */
const TORSO = {
  width: Number(process.env.TORSO_W ?? 0.54),
  bottom: Number(process.env.TORSO_Y ?? 0.505),
};

// Teil laden, Mesh benennen, ins Hauptdokument übernehmen, Hilfsszene entfernen
async function part(file, name) {
  const d = await io.read(`${partsDir}/${file}`);
  const mesh = d.getRoot().listMeshes()[0];
  mesh.setName(name);
  const scenesBefore = new Set(root.listScenes());
  mergeDocuments(doc, d);
  for (const s of root.listScenes())
    if (!scenesBefore.has(s)) {
      for (const n of s.listChildren()) n.dispose();
      s.dispose();
    }
  return root.listMeshes().find((m) => m.getName() === name);
}
const boundsOf = (mesh) => {
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (const p of mesh.listPrimitives()) {
    const a = p.getAttribute('POSITION');
    const lo = a.getMin([]),
      hi = a.getMax([]);
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], lo[i]);
      max[i] = Math.max(max[i], hi[i]);
    }
  }
  return {
    min,
    max,
    size: max.map((v, i) => v - min[i]),
    center: max.map((v, i) => (v + min[i]) / 2),
  };
};
/** Matrix (spaltenweise): erst skalieren, dann verschieben */
const sm = (s, t) => [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, t[0], t[1], t[2], 1];
const report = [];

// ---------- Rumpf: gepanzerter Oberkörper auf Drehkranz ----------
{
  const mesh = await part('torso.glb', 'NEW_Torso');
  const b = boundsOf(mesh);
  // Seitliche Schulteraufnahmen außen bei ±0,25 (dort sitzen die Arme)
  // Seitliche Ringe = Schultergelenke auf Armhöhe; der Drehkranz unten wird zur Hüfte
  const s = TORSO.width / b.size[0];
  transformMesh(
    mesh,
    sm(s, [-b.center[0] * s, TORSO.bottom - b.min[1] * s, -b.center[2] * s - 0.01]),
  );
  const old = node('Torso').getMesh();
  node('Torso').setMesh(mesh);
  old?.dispose();
  mesh.setName('Torso');
  report.push(['Torso', boundsOf(mesh)]);
}

// ---------- Becken: Antriebsblock zwischen den Hüften ----------
{
  const mesh = await part('pelvis.glb', 'NEW_Pelvis');
  const b = boundsOf(mesh);
  const h = 0.2,
    s = h / b.size[1];
  transformMesh(
    mesh,
    sm(s, [-b.center[0] * s, TORSO.bottom + 0.01 - b.max[1] * s, -b.center[2] * s - 0.012]),
  );
  const pelvis = doc.createNode('Pelvis').setMesh(mesh);
  node('Torso').addChild(pelvis);
  report.push(['Pelvis', boundsOf(mesh)]);
}

/** Eigene Kopie der Daten (eigene Ruhelage je Seite für den Verschleiß-Shader) */
function cloneMesh(template, name) {
  const copy = doc.createMesh(name);
  for (const p of template.listPrimitives()) {
    const c = p.clone();
    for (const sem of c.listSemantics()) c.setAttribute(sem, c.getAttribute(sem).clone());
    c.setIndices(c.getIndices().clone());
    copy.addPrimitive(c);
  }
  return copy;
}

// ---------- Füße: dreizehiger Fuß mit runder Aufnahme ----------
{
  const template = await part('foot.glb', 'FootNew');
  const tb = boundsOf(template);
  const copy = cloneMesh(template, 'FootNew_R');
  for (const [side, mesh] of [
    ['L', template],
    ['R', copy],
  ]) {
    const footNode = node(side + '_Foot');
    const old = footNode.getMesh();
    const ob = boundsOf(old);
    // Gleich lang wie der alte Fuß wäre zu hoch: etwas kürzer, Sohle auf alter Sohle
    const s = (ob.size[2] * 0.9) / tb.size[2];
    transformMesh(
      mesh,
      sm(s, [
        ob.center[0] - tb.center[0] * s,
        ob.min[1] - tb.min[1] * s,
        ob.center[2] - tb.center[2] * s,
      ]),
    );
    footNode.setMesh(mesh);
    old.dispose();
    mesh.setName(side + '_Foot');
    report.push([side + '_Foot', boundsOf(mesh)]);
  }
}

// ---------- Kleine 3×3-Mathematik für Gliedmaßen ----------
const sub = (a, b) => a.map((v, i) => v - b[i]);
const len = (a) => Math.hypot(...a);
const mul3 = (m, v) => [0, 1, 2].map((r) => m[r][0] * v[0] + m[r][1] * v[1] + m[r][2] * v[2]);
const mm3 = (a, b) => [0, 1, 2].map((r) => [0, 1, 2].map((c) => a[r][0] * b[0][c] + a[r][1] * b[1][c] + a[r][2] * b[2][c]));
const diag = (x, y, z) => [[x, 0, 0], [0, y, 0], [0, 0, z]];
/** Drehung, die Richtung a auf Richtung b legt (Rodrigues) */
function align(a, b) {
  const u = a.map((v) => v / len(a)),
    w = b.map((v) => v / len(b));
  const c = u[0] * w[0] + u[1] * w[1] + u[2] * w[2];
  const k = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  const K = [[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]];
  const K2 = mm3(K, K),
    f = 1 / (1 + c);
  return [0, 1, 2].map((r) => [0, 1, 2].map((q) => (r === q ? 1 : 0) + K[r][q] + K2[r][q] * f));
}
/** 3×3 + Verschiebung → spaltenweise 4×4 (Punkt p: M·(p − from) + to) */
function affine(M, from, to) {
  const t = sub(to, mul3(M, from));
  return [M[0][0], M[1][0], M[2][0], 0, M[0][1], M[1][1], M[2][1], 0, M[0][2], M[1][2], M[2][2], 0, t[0], t[1], t[2], 1];
}
const ROT_Y180 = diag(-1, 1, -1);
/** Barrel entlang +x → +z (Drehung −90° um y) */
const ROT_X_TO_Z = [[0, 0, -1], [0, 1, 0], [1, 0, 0]];

/**
 * Gelenkpunkte in Renes Tripo-Teilen (Teilkoordinaten, aus den Achsstummeln gemessen):
 * Oberschenkel und Schienbein stehen senkrecht, Front nach +z; der Arm hat das
 * Schultergelenk innen (−x) oben und das Ellbogenlager unten; die Kanone zeigt nach +x
 * und hat hinten die Ellbogentrommel.
 */
const JOINT = {
  thigh: { top: [0, 0.888, 0.065], bottom: [0, 0.132, -0.009], widen: 1.35 },
  shin: { top: [0, 0.888, 0.018], bottom: [0, 0.104, 0.011], widen: 1.5 },
  upperarm: { shoulder: [-0.17, 0.804, 0], elbow: [0.031, 0.124, 0.013], scale: 0.45 },
  // toeIn: Läufe leicht nach innen (Konvergenzpunkt vorn); hält den Mech im Kollisionskreis
  forearm: { elbow: [-0.39, 0.224, 0], muzzle: [0.49, 0.184, 0], scale: 0.4, outward: 0, toeIn: 0.21 },
};

// ---------- Beine: Oberschenkel und Schienbein zwischen den alten Gelenkpunkten ----------
// Länge exakt Gelenk zu Gelenk (Gang und IK bleiben gleich), quer etwas kräftiger.
for (const [file, seg, child, j] of [
  ['thigh.glb', 'Thigh', 'Calf', JOINT.thigh],
  ['shin.glb', 'Shin', 'Foot', JOINT.shin],
]) {
  const template = await part(file, 'NEW_' + seg);
  const copy = cloneMesh(template, 'NEW_' + seg + '_R');
  const nodeSeg = seg === 'Shin' ? 'Calf' : seg;
  for (const [side, mesh] of [
    ['L', template],
    ['R', copy],
  ]) {
    const n = node(side + '_' + nodeSeg);
    const target = node(side + '_' + child).getTranslation();
    const src = sub(j.bottom, j.top);
    const s = len(target) / len([src[0] * j.widen, src[1], src[2] * j.widen]);
    const S = diag(s * j.widen, s, s * j.widen);
    const M = mm3(align(mul3(S, src), target), S);
    transformMesh(mesh, affine(M, j.top, [0, 0, 0]));
    const old = n.getMesh();
    n.setMesh(mesh);
    old?.dispose();
    mesh.setName(side + '_' + nodeSeg);
    report.push([side + '_' + nodeSeg, boundsOf(mesh)]);
  }
}

// ---------- Arme: Oberarm mit Schulter, Unterarm = Kanone ----------
{
  const upper = await part('upperarm.glb', 'NEW_Upperarm');
  const gun = await part('forearm.glb', 'NEW_Forearm');
  const pairs = [
    ['L', upper, gun, 1],
    ['R', cloneMesh(upper, 'NEW_Upperarm_R'), cloneMesh(gun, 'NEW_Forearm_R'), -1],
  ];
  const ua = JOINT.upperarm,
    fa = JOINT.forearm;
  for (const [side, upperMesh, gunMesh, sign] of pairs) {
    // Rechter Arm: um 180° gedreht, damit das Schultergelenk innen liegt
    const U = mm3(diag(ua.scale, ua.scale, ua.scale), sign > 0 ? diag(1, 1, 1) : ROT_Y180);
    const shoulderNode = node(side + '_Upperarm'),
      elbowNode = node(side + '_Forearm');
    transformMesh(upperMesh, affine(U, ua.shoulder, [0, 0, 0]));
    const elbow = mul3(U, sub(ua.elbow, ua.shoulder));
    elbowNode.setTranslation(elbow);
    const t = -sign * fa.toeIn,
      toe = [
        [Math.cos(t), 0, Math.sin(t)],
        [0, 1, 0],
        [-Math.sin(t), 0, Math.cos(t)],
      ];
    const G = mm3(diag(fa.scale, fa.scale, fa.scale), mm3(toe, ROT_X_TO_Z));
    const offset = [sign * fa.outward, 0, 0];
    transformMesh(gunMesh, affine(G, fa.elbow, offset));
    const muzzle = mul3(G, sub(fa.muzzle, fa.elbow)).map((v, i) => v + offset[i]);
    // Mündung für weapon-system.ts (Unterarm-Koordinaten)
    elbowNode.setExtras({ ...elbowNode.getExtras(), muzzle });
    for (const [n, mesh, name] of [
      [shoulderNode, upperMesh, side + '_Upperarm'],
      [elbowNode, gunMesh, side + '_Forearm'],
    ]) {
      const old = n.getMesh();
      n.setMesh(mesh);
      old?.dispose();
      mesh.setName(name);
      report.push([name, boundsOf(mesh)]);
    }
  }
}

// Kleiner ausliefern: Normalen und UVs quantisiert, Geometrie mit EXT_meshopt_compression
// (three.js entpackt mit MeshoptDecoder). Positionen bleiben float, damit Knoten und
// Gelenkpunkte unverändert sind.
await doc.transform(
  prune(),
  unpartition(),
  reorder({ encoder: MeshoptEncoder, target: 'size' }),
  quantize({ pattern: /^(NORMAL|TEXCOORD_0)$/ }),
);
doc.createExtension(KHRMeshQuantization).setRequired(true);
doc
  .createExtension(EXTMeshoptCompression)
  .setRequired(true)
  .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
await io.write(outPath, doc);
for (const [n, b] of report)
  console.log(
    n.padEnd(8),
    'min',
    b.min.map((v) => v.toFixed(3)).join(','),
    'max',
    b.max.map((v) => v.toFixed(3)).join(','),
  );
