// Pilotensitz mit Seitenkonsolen und Steuerknüppeln aus Renes Kanzelmodell (ohne Frontkonsole
// und Dach). Aufruf: node scripts/prepare-seat.mjs mech_cockpit_3d_model.glb aus.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { flatten, join, prune, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const [input, output] = process.argv.slice(2);
// Frontkonsole, Anzeigen und Dach (z < −0,09 bzw. oben) gehören nicht zum Sitz
const DROP = [0, 5, 13, 14, 28, 15, 18, 16, 17, 6, 31, 26, 34, 35];
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;
const doc = await io.read(input);
await doc.transform(flatten());
for (const n of doc.getRoot().listNodes())
  if (DROP.includes(Number(n.getName().replace('tripo_part_', '')))) n.dispose();
await doc.transform(prune(), join({ keepNamed: false }), weld());
let t = 0;
for (const m of doc.getRoot().listMeshes())
  for (const p of m.listPrimitives()) t += p.getIndices().getCount() / 3;
await doc.transform(
  simplify({ simplifier: MeshoptSimplifier, ratio: 26000 / t, error: 0.05, lockBorder: false }),
  prune(),
  textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [1024, 1024], quality: 82 }),
);
let after = 0;
for (const m of doc.getRoot().listMeshes()) {
  m.setName('Seat');
  for (const p of m.listPrimitives()) after += p.getIndices().getCount() / 3;
}
console.log(`${t} → ${after} Dreiecke`);
await io.write(output, doc);
