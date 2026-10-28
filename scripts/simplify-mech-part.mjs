// Tripo-Teil spieltauglich machen: zu einem Mesh zusammenfassen, auf Zielzahl Dreiecke
// vereinfachen, Texturen auf 1024 px JPEG.
// Aufruf: node scripts/simplify-mech-part.mjs ein.glb aus.glb zieldreiecke [fehlergrenze]
// Werkzeuge einmalig: npm i --no-save @gltf-transform/core @gltf-transform/extensions
//   @gltf-transform/functions meshoptimizer sharp
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  flatten,
  join,
  prune,
  simplify,
  textureCompress,
  weld,
} from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const [input, output, targetArg] = process.argv.slice(2);
const target = Number(targetArg);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const count = () => {
  let t = 0;
  for (const m of doc.getRoot().listMeshes())
    for (const p of m.listPrimitives())
      t += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  return t;
};
const before = count();
await MeshoptSimplifier.ready;
await doc.transform(dedup(), flatten(), join({ keepNamed: false }), weld());
const welded = count();
// Verhältnis aus Zielzahl; Fehlergrenze großzügig, damit das Ziel erreicht wird
await doc.transform(
  simplify({
    simplifier: MeshoptSimplifier,
    lockBorder: false,
    ratio: Math.min(1, target / welded),
    error: Number(process.argv[5] ?? 0.02),
  }),
  prune(),
  textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [1024, 1024], quality: 82 }),
);
await io.write(output, doc);
console.log(
  `${input.split('/').pop()}: ${before} → ${Math.round(welded)} (weld) → ${Math.round(count())} Dreiecke, ${doc.getRoot().listMeshes().length} Mesh(es)`,
);
