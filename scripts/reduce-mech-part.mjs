// Zweite Stufe nach simplify-mech-part.mjs: Tripo-Teile bleiben dort an den UV-Nähten
// hängen. simplifyWithAttributes (UV + Normale) mit 'Permissive' darf Nähte überqueren,
// solange die Textur passt – so kommt z. B. die Kanone von 1,36 Mio. auf 18 000 Dreiecke.
// Aufruf: node scripts/reduce-mech-part.mjs ein.glb aus.glb zieldreiecke [fehlergrenze]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, compactPrimitive } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
const [input, output, targetArg, errArg] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
await MeshoptSimplifier.ready;
for (const mesh of doc.getRoot().listMeshes())
  for (const p of mesh.listPrimitives()) {
    const pos = Float32Array.from(p.getAttribute('POSITION').getArray());
    const n = pos.length / 3;
    const uv = p.getAttribute('TEXCOORD_0')?.getArray(), nor = p.getAttribute('NORMAL')?.getArray();
    const attr = new Float32Array(n * 5);
    for (let i = 0; i < n; i++) {
      if (uv) { attr[i * 5] = uv[i * 2]; attr[i * 5 + 1] = uv[i * 2 + 1]; }
      if (nor) for (let k = 0; k < 3; k++) attr[i * 5 + 2 + k] = nor[i * 3 + k];
    }
    const idx = Uint32Array.from(p.getIndices().getArray());
    const [out, err] = MeshoptSimplifier.simplifyWithAttributes(idx, pos, 3, attr, 5, [1.5, 1.5, 0.3, 0.3, 0.3], null,
      Math.round(Number(targetArg)) * 3, Number(errArg ?? 0.02), ['Permissive', 'Prune']);
    p.getIndices().setArray(out);
    compactPrimitive(p);
    console.log(idx.length / 3, '→', out.length / 3, 'err', err.toFixed(4));
  }
await doc.transform(prune());
await io.write(output, doc);
