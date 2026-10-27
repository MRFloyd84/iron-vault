// Bereitet Renes Tripo-Sensorkopf für die Drohne auf.
//
// Aufruf:  node scripts/prepare-drone-head.mjs PFAD/head_Drohne.glb
// Ergebnis: public/models/iv-04-drone-head.glb
//
// - Textur 4096 px → 1024 px JPEG (der Kopf ist nur gut 20 cm groß)
// - Objektive nach −z gedreht (Blickrichtung der Drohne), Mittelpunkt im Ursprung
//   (Drehpunkt des Gimbals), Breite 0,24 m
//
// Läuft wie prepare-drone-model.mjs in Chromium (Playwright, global über NODE_PATH).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const source = process.argv[2];
if (!source) throw new Error('Pfad zur Tripo-GLB angeben');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public/models/iv-04-drone-head.glb');
const three = path.join(root, 'node_modules/three');
const WIDTH = 0.24;
const TEXTURE = 1024;

const page = `<!doctype html><script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
window.build = async () => {
  const gltf = await new GLTFLoader().loadAsync('/source.glb');
  gltf.scene.updateMatrixWorld(true);
  let src = null;
  gltf.scene.traverse((o) => { if (o.isMesh) src = o; });
  const geo = src.geometry.clone();
  geo.applyMatrix4(src.matrixWorld);
  geo.rotateY(Math.PI);
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  geo.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, -(bb.min.z + bb.max.z) / 2);
  const k = ${WIDTH} / (bb.max.x - bb.min.x);
  geo.scale(k, k, k);
  const c = document.createElement('canvas');
  c.width = c.height = ${TEXTURE};
  c.getContext('2d').drawImage(src.material.map.image, 0, 0, ${TEXTURE}, ${TEXTURE});
  const map = new THREE.CanvasTexture(c);
  map.flipY = false;
  map.colorSpace = THREE.SRGBColorSpace;
  map.userData.mimeType = 'image/jpeg';
  const mat = new THREE.MeshStandardMaterial({
    name: 'drone-head', map, metalness: src.material.metalness, roughness: src.material.roughness,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'drone-head';
  const scene = new THREE.Scene();
  scene.add(mesh);
  const glb = new Uint8Array(await new GLTFExporter().parseAsync(scene, { binary: true }));
  let s = '';
  for (let i = 0; i < glb.length; i += 0x8000) s += String.fromCharCode.apply(null, glb.subarray(i, i + 0x8000));
  geo.computeBoundingBox();
  return { glb: btoa(s), triangles: geo.index.count / 3, material: [src.material.metalness, src.material.roughness],
    size: geo.boundingBox.max.toArray().map((v, i) => +(v - geo.boundingBox.min.getComponent(i)).toFixed(3)) };
};
window.ready = true;
</script>`;

const types = { '.js': 'text/javascript', '.glb': 'model/gltf-binary' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file = null;
  if (url === '/') return res.end(page);
  if (url === '/source.glb') file = path.resolve(source);
  else if (url.startsWith('/three/')) file = path.join(three, url.slice(7));
  if (!file || (url !== '/source.glb' && !file.startsWith(three)) || !fs.existsSync(file)) {
    res.statusCode = 404;
    return res.end();
  }
  res.setHeader('content-type', types[path.extname(file)] ?? 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
try {
  const tab = await browser.newPage();
  tab.on('pageerror', (e) => console.error(e.message));
  await tab.goto(`http://127.0.0.1:${server.address().port}/`);
  await tab.waitForFunction(() => globalThis.ready);
  const result = await tab.evaluate(() => globalThis.build());
  fs.writeFileSync(out, Buffer.from(result.glb, 'base64'));
  console.log(
    `${result.triangles} Dreiecke, ${result.size.join(' × ')} m, Material ${result.material.join('/')},`,
    `${(fs.statSync(out).size / 1e6).toFixed(2)} MB → ${path.relative(root, out)}`,
  );
} finally {
  await browser.close();
  server.close();
}
