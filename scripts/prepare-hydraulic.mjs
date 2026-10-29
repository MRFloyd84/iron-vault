// Hydraulikzylinder aus Renes Tripo-Satz: Rohr (mit Kopf und Anschlüssen) und Kolbenstange
// (mit Endkappe) als zwei Meshes, entlang +Y auf Länge 1 und Durchmesser 1 normiert
// (Fußpunkt y = 0). Die Größe stellt mech-hydraulics.ts je Zylinder ein.
//
// Aufruf: node scripts/prepare-hydraulic.mjs hydraulic_cylinder_3d_model.glb aus.glb
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { join, prune, transformMesh, weld, flatten, normals } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

const [input, output] = process.argv.slice(2);
// Teile laut Vorschau: Rohr = 2 (Rohr mit Lagerauge), 4 (Kopf), 25 und 30 (Anschlüsse);
// Stange = 8 (Kolbenstange), 16 (Endkappe). Achse im Original: x.
const GROUPS = {
  Barrel: { parts: [2, 4, 25, 30], target: 3000 },
  Rod: { parts: [8, 16], target: 900 },
};
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;
const doc = await io.read(input);
await doc.transform(flatten());
const root = doc.getRoot();
const scene = root.listScenes()[0];
const byPart = (i) => root.listNodes().find((n) => n.getName() === 'tripo_part_' + i);
const keep = new Set(Object.values(GROUPS).flatMap((g) => g.parts.map(byPart)));
for (const n of root.listNodes()) if (!keep.has(n)) n.dispose();
// Je Gruppe ein Elternknoten, dann zusammenfassen
for (const [name, g] of Object.entries(GROUPS)) {
  const parent = doc.createNode(name);
  scene.addChild(parent);
  for (const i of g.parts) {
    const n = byPart(i);
    scene.removeChild(n);
    parent.addChild(n);
  }
}
// Nur die Form wird gebraucht (Farbe kommt aus mech-hydraulics.ts): ohne Textur und Normalen
// lassen sich die Teile ohne Nähte zusammenschweißen und stark vereinfachen.
for (const m of root.listMeshes())
  for (const p of m.listPrimitives()) {
    for (const sem of p.listSemantics()) if (sem !== 'POSITION') p.setAttribute(sem, null);
    p.setMaterial(null);
  }
await doc.transform(join({ keepNamed: false }), weld({ tolerance: 0.0005 }));
for (const name of Object.keys(GROUPS)) {
  const node = root.listNodes().find((n) => n.getName() === name);
  // Nach join hängt ein Mesh an einem Kindknoten: auf den Gruppenknoten ziehen
  const child = node.listChildren().find((c) => c.getMesh());
  const mesh = child.getMesh();
  node.setMesh(mesh);
  for (const c of node.listChildren()) c.dispose();
  mesh.setName(name);
  const b = getBounds(node);
  const len = b.max[0] - b.min[0],
    dia = Math.max(b.max[1] - b.min[1], b.max[2] - b.min[2]);
  const cy = (b.max[1] + b.min[1]) / 2,
    cz = (b.max[2] + b.min[2]) / 2;
  // x → y (Achse), y → −x; Fußpunkt auf 0, Länge 1, Durchmesser 1
  const kx = 1 / len,
    kr = 1 / dia;
  transformMesh(mesh, [
    0,
    kx,
    0,
    0,
    -kr,
    0,
    0,
    0,
    0,
    0,
    kr,
    0,
    kr * cy,
    -b.min[0] * kx,
    -kr * cz,
    1,
  ]);
  console.log(name, 'Länge', len.toFixed(3), 'Durchmesser', dia.toFixed(3));
}
for (const [name, g] of Object.entries(GROUPS)) {
  const mesh = root.listMeshes().find((m) => m.getName() === name);
  let t = 0;
  for (const p of mesh.listPrimitives()) t += p.getIndices().getCount() / 3;
  const ratio = g.target / t;
  // simplify() wirkt auf alle Meshes: einzeln über eine Hilfsfunktion je Primitive
  for (const p of mesh.listPrimitives()) {
    const idx = p.getIndices().getArray(),
      pos = p.getAttribute('POSITION').getArray();
    const [out] = MeshoptSimplifier.simplify(
      Uint32Array.from(idx),
      Float32Array.from(pos),
      3,
      Math.round((idx.length * ratio) / 3) * 3,
      0.01,
      [],
    );
    p.getIndices().setArray(Uint32Array.from(out));
  }
}
await doc.transform(prune(), normals({ overwrite: true }));
for (const m of root.listMeshes()) {
  let t = 0;
  for (const p of m.listPrimitives())
    t += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  console.log(m.getName(), t, 'Dreiecke');
}
await io.write(output, doc);
