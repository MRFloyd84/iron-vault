// Neuen IV-04 aus Teilen zusammensetzen. Knotennamen und Gelenkpunkte bleiben die des
// bisherigen Modells (Torso, L_/R_Thigh, _Calf, _Foot, _Upperarm, _Forearm), damit Gang,
// Gelenke, Hydraulik und Lichter unverändert funktionieren.
//
// Aufruf (Werkzeuge einmalig: npm i --no-save @gltf-transform/core @gltf-transform/extensions
//   @gltf-transform/functions meshoptimizer):
//   node scripts/assemble-mech.mjs assets-src/mech-parts/iron-vault-rigged.glb assets-src/mech-parts \
//     public/models/iv-04-mech.glb
// Teile in assets-src/mech-parts/ entstehen mit scripts/simplify-mech-part.mjs aus Renes
// Tripo-Dateien (Rumpf 60 000, Becken 28 000, Fuß ~52 000 Dreiecke, Texturen 1024 px).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, prune, transformMesh, unpartition } from '@gltf-transform/functions';

const [oldPath, partsDir, outPath] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
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

// ---------- Füße: dreizehiger Fuß mit runder Aufnahme ----------
{
  const template = await part('foot.glb', 'FootNew');
  const tb = boundsOf(template);
  // Rechte Seite: eigene Kopie der Daten (eigene Ruhelage für den Verschleiß-Shader)
  const copy = doc.createMesh('FootNew_R');
  for (const p of template.listPrimitives()) {
    const c = p.clone();
    for (const sem of c.listSemantics()) c.setAttribute(sem, c.getAttribute(sem).clone());
    c.setIndices(c.getIndices().clone());
    copy.addPrimitive(c);
  }
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

await doc.transform(prune(), unpartition());
await io.write(outPath, doc);
for (const [n, b] of report)
  console.log(
    n.padEnd(8),
    'min',
    b.min.map((v) => v.toFixed(3)).join(','),
    'max',
    b.max.map((v) => v.toFixed(3)).join(','),
  );
