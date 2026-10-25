// Bereitet Renes Tripo-Drohnenmodell für das Spiel auf.
//
// Aufruf:  node scripts/prepare-drone-model.mjs PFAD/rustydrone3dmodel.glb
// Ergebnis: public/models/iv-04-drone.glb
//
// - 37 Einzelteile mit je eigenen Texturen → ein Teil mit einem Texturatlas
//   (Farbe 2048 px breit, Normalen und Metall/Rauheit halb so groß, JPEG)
// - Das Tripo-Skelett wird entfernt (die Ruhelage ist das Modell selbst)
// - Vorn (Kamera) nach −z gedreht, Kufen auf y = 0, mittig, in Metern (× 1,15)
//
// Die Arbeit läuft in Chromium (Playwright), weil dort Bilder, Canvas und der
// GLTFExporter von three.js zur Verfügung stehen. Benötigt Playwright mit Chromium
// (z. B. `npm i -g playwright && npx playwright install chromium`; global installiert
// wird es über NODE_PATH gefunden).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const source = process.argv[2];
if (!source) throw new Error('Pfad zur Tripo-GLB angeben');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public/models/iv-04-drone.glb');
const three = path.join(root, 'node_modules/three');

const page = `<!doctype html><script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
window.build = async () => {
  const gltf = await new GLTFLoader().loadAsync('/source.glb');
  gltf.scene.updateMatrixWorld(true);
  const parts = [];
  gltf.scene.traverse((o) => o.isMesh && parts.push(o));
  // Atlas: halbe Auflösung je Teil, Zweierpotenzen lückenlos in Regalen gepackt
  const W = 2048, G = 3;
  const items = parts.map((o) => ({ o, s: Math.max(64, o.material.map.image.width / 2) }))
    .sort((a, b) => b.s - a.s);
  let x = 0, y = 0, row = 0;
  for (const it of items) {
    if (x + it.s > W) { x = 0; y += row; row = 0; }
    it.x = x; it.y = y; x += it.s; row = Math.max(row, it.s);
  }
  const H = Math.ceil((y + row) / 256) * 256;
  const canvas = (w, h, fill) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.fillStyle = fill; g.fillRect(0, 0, w, h); return [c, g];
  };
  const [base, bx] = canvas(W, H, '#000'), [nrm, nx] = canvas(W / 2, H / 2, 'rgb(128,128,255)'),
    [mr, mx] = canvas(W / 2, H / 2, 'rgb(0,200,255)');
  // Mit Rand gegen Ausbluten: erst vergrößert, dann das eigentliche Bild darüber
  const draw = (g, img, x, y, s, m) => {
    if (!img) return;
    g.drawImage(img, x - m, y - m, s + 2 * m, s + 2 * m);
    g.drawImage(img, x + m, y + m, s - 2 * m, s - 2 * m);
  };
  const geos = [];
  for (const it of items) {
    const m = it.o.material;
    draw(bx, m.map.image, it.x, it.y, it.s, G);
    draw(nx, m.normalMap?.image, it.x / 2, it.y / 2, it.s / 2, G / 2);
    draw(mx, m.roughnessMap?.image, it.x / 2, it.y / 2, it.s / 2, G / 2);
    const src = it.o.geometry, geo = new THREE.BufferGeometry();
    geo.setAttribute('position', src.attributes.position.clone());
    geo.setAttribute('normal', src.attributes.normal.clone());
    const uv = src.attributes.uv.clone();
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, (it.x + G + uv.getX(i) * (it.s - 2 * G)) / W, (it.y + G + uv.getY(i) * (it.s - 2 * G)) / H);
    geo.setAttribute('uv', uv);
    geo.setIndex(src.index.clone());
    geo.applyMatrix4(it.o.matrixWorld);
    geos.push(geo);
  }
  const geo = mergeGeometries(geos, false);
  geo.rotateY(Math.PI);
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  geo.scale(1.15, 1.15, 1.15);
  const tex = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    t.flipY = false;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.userData.mimeType = 'image/jpeg';
    return t;
  };
  const mat = new THREE.MeshStandardMaterial({
    name: 'drone', map: tex(base, true), normalMap: tex(nrm), roughnessMap: tex(mr), metalness: 1, roughness: 1,
  });
  mat.metalnessMap = mat.roughnessMap;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'drone';
  const scene = new THREE.Scene();
  scene.add(mesh);
  const glb = new Uint8Array(await new GLTFExporter().parseAsync(scene, { binary: true }));
  let s = '';
  for (let i = 0; i < glb.length; i += 0x8000) s += String.fromCharCode.apply(null, glb.subarray(i, i + 0x8000));
  geo.computeBoundingBox();
  return { glb: btoa(s), parts: parts.length, triangles: geo.index.count / 3,
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
  if (!file || !file.startsWith(url === '/source.glb' ? file : three) || !fs.existsSync(file)) {
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
    `${result.parts} Teile → 1, ${result.triangles} Dreiecke, ${result.size.join(' × ')} m,`,
    `${(fs.statSync(out).size / 1e6).toFixed(1)} MB → ${path.relative(root, out)}`,
  );
} finally {
  await browser.close();
  server.close();
}
