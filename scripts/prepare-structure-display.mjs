// Offline orthographic instrument views of the SAME GLB shipped in the game.
// Depth-tested software rasterization: no browser, runtime GPU pass or readback.
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import sharp from 'sharp';

const source = new URL('../public/models/iron-vault-rigged.glb', import.meta.url);
const output = new URL('../public/instruments/', import.meta.url);
const file = fs.readFileSync(source),
  n = file.readUInt32LE(12),
  g = JSON.parse(file.subarray(20, 20 + n).toString());
const binary = file.subarray(28 + n);
const material = g.materials[0],
  image = g.images[g.textures[material.pbrMetallicRoughness.baseColorTexture.index].source];
const bv = g.bufferViews[image.bufferView];
const albedo = await sharp(binary.subarray(bv.byteOffset, bv.byteOffset + bv.byteLength))
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
for (const mesh of g.meshes) for (const p of mesh.primitives) delete p.material;
delete g.materials;
delete g.textures;
delete g.images;
g.buffers[0].uri = 'data:application/octet-stream;base64,' + binary.toString('base64');
globalThis.ProgressEvent ??= class {};
const { scene } = await new GLTFLoader().parseAsync(JSON.stringify(g), '');
scene.updateMatrixWorld(true);
const meshes = [],
  bounds = new THREE.Box3().setFromObject(scene);
scene.traverse((o) => {
  if (o.isMesh) meshes.push(o);
});
const size = 1024,
  tile = 512,
  extent = Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y) * 1.075;
const center = bounds.getCenter(new THREE.Vector3()),
  pixelsPerUnit = (size - 1) / extent;
const tiles = [],
  maskCounts = [];
let triangleCount = 0;
for (const sign of [1, -1]) {
  const depth = new Float32Array(size * size).fill(-Infinity),
    light = new Float32Array(size * size),
    zone = new Int8Array(size * size).fill(-2);
  const normals = new Float32Array(size * size * 3),
    lamp = new THREE.Vector3(-sign * 0.35, 0.6, sign * 0.75).normalize();
  for (const mesh of meshes) {
    const pos = mesh.geometry.attributes.position,
      norm = mesh.geometry.attributes.normal,
      uv = mesh.geometry.attributes.uv,
      idx = mesh.geometry.index;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    const screen = new Float32Array(pos.count * 3),
      worldNormals = new Float32Array(pos.count * 3);
    const p = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      screen.set(
        [
          sign * (p.x - center.x) * pixelsPerUnit + size / 2,
          (center.y - p.y) * pixelsPerUnit + size / 2,
          sign * p.z,
        ],
        i * 3,
      );
      p.fromBufferAttribute(norm, i).applyMatrix3(normalMatrix).normalize();
      worldNormals.set(p.toArray(), i * 3);
    }
    const meshLimb = mesh.name.startsWith('L_')
      ? /arm/i.test(mesh.name)
        ? 0
        : 2
      : mesh.name.startsWith('R_')
        ? /arm/i.test(mesh.name)
          ? 1
          : 3
        : -1;
    for (let t = 0; t < idx.count; t += 3) {
      if (sign === 1) triangleCount++;
      const a = idx.getX(t),
        b = idx.getX(t + 1),
        c = idx.getX(t + 2);
      const ax = screen[a * 3],
        ay = screen[a * 3 + 1],
        bx = screen[b * 3],
        by = screen[b * 3 + 1],
        cx = screen[c * 3],
        cy = screen[c * 3 + 1];
      // Correct tiny auto-rig spill islands in the diagnostic masks only; no
      // geometry edits. Lower ankle fragments are legs, central roof is torso.
      const mx = (((ax + bx + cx) / 3 - size / 2) / pixelsPerUnit) * sign + center.x;
      const my = center.y - ((ay + by + cy) / 3 - size / 2) / pixelsPerUnit;
      let limb = meshLimb;
      if (limb >= 0 && limb < 2 && my < 0.35 && Math.abs(mx) < 0.3) limb = mx > 0 ? 2 : 3;
      if (my > 0.62 && Math.abs(mx) < 0.19) limb = -1;
      const denom = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(denom) < 1e-8) continue;
      const x0 = Math.max(1, Math.floor(Math.min(ax, bx, cx))),
        x1 = Math.min(size - 2, Math.ceil(Math.max(ax, bx, cx)));
      const y0 = Math.max(1, Math.floor(Math.min(ay, by, cy))),
        y1 = Math.min(size - 2, Math.ceil(Math.max(ay, by, cy)));
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const wa = ((by - cy) * (x + 0.5 - cx) + (cx - bx) * (y + 0.5 - cy)) / denom;
          const wb = ((cy - ay) * (x + 0.5 - cx) + (ax - cx) * (y + 0.5 - cy)) / denom,
            wc = 1 - wa - wb;
          if (wa < 0 || wb < 0 || wc < 0) continue;
          const z = wa * screen[a * 3 + 2] + wb * screen[b * 3 + 2] + wc * screen[c * 3 + 2],
            i = y * size + x;
          if (z <= depth[i]) continue;
          depth[i] = z;
          zone[i] = limb;
          const nx = wa * worldNormals[a * 3] + wb * worldNormals[b * 3] + wc * worldNormals[c * 3];
          const ny =
            wa * worldNormals[a * 3 + 1] +
            wb * worldNormals[b * 3 + 1] +
            wc * worldNormals[c * 3 + 1];
          const nz =
            wa * worldNormals[a * 3 + 2] +
            wb * worldNormals[b * 3 + 2] +
            wc * worldNormals[c * 3 + 2];
          normals.set([nx, ny, nz], i * 3);
          const u = wa * uv.getX(a) + wb * uv.getX(b) + wc * uv.getX(c),
            v = wa * uv.getY(a) + wb * uv.getY(b) + wc * uv.getY(c);
          const tx = Math.min(
              albedo.info.width - 1,
              Math.max(0, Math.floor(u * albedo.info.width)),
            ),
            ty = Math.min(albedo.info.height - 1, Math.max(0, Math.floor(v * albedo.info.height)));
          const k = (ty * albedo.info.width + tx) * albedo.info.channels;
          const tone =
            (albedo.data[k] * 0.2126 + albedo.data[k + 1] * 0.7152 + albedo.data[k + 2] * 0.0722) /
            255;
          light[i] =
            0.22 + 0.53 * Math.max(0, nx * lamp.x + ny * lamp.y + nz * lamp.z) + 0.25 * tone;
        }
    }
  }
  const rgba = new Uint8Array(size * size * 4),
    masks = Array.from({ length: 4 }, () => new Uint8Array(size * size * 4)),
    counts = [0, 0, 0, 0];
  for (let y = 1; y < size - 1; y++)
    for (let x = 1; x < size - 1; x++) {
      const i = y * size + x;
      if (zone[i] === -2) continue;
      let contour = false,
        crease = false;
      for (const j of [i - 1, i + 1, i - size, i + size]) {
        if (zone[j] === -2) {
          contour = true;
          continue;
        }
        const dot =
          normals[i * 3] * normals[j * 3] +
          normals[i * 3 + 1] * normals[j * 3 + 1] +
          normals[i * 3 + 2] * normals[j * 3 + 2];
        if (Math.abs(depth[i] - depth[j]) > 0.018 || dot < 0.72 || zone[i] !== zone[j])
          crease = true;
      }
      const level = contour ? 1 : crease ? 0.8 : light[i] * 0.58;
      rgba.set([38 + level * 125, 68 + level * 165, 31 + level * 96, 255], i * 4);
      if (zone[i] >= 0) {
        counts[zone[i]]++;
        masks[zone[i]].set([155 + level * 84, 94 + level * 95, 32 + level * 72, 255], i * 4);
      }
    }
  for (const pixels of [rgba, ...masks])
    tiles.push(
      await sharp(pixels, { raw: { width: size, height: size, channels: 4 } })
        .resize(tile, tile)
        .png()
        .toBuffer(),
    );
  maskCounts.push(counts);
}
fs.mkdirSync(output, { recursive: true });
const path = new URL('mech-structure-atlas.png', output);
await sharp({
  create: {
    width: tile * 5,
    height: tile * 2,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite(
    tiles.map((input, i) => ({ input, left: (i % 5) * tile, top: Math.floor(i / 5) * tile })),
  )
  .png()
  .toFile(path.pathname);
fs.writeFileSync(
  new URL('mech-structure-atlas.json', output),
  JSON.stringify(
    {
      source: 'models/iron-vault-rigged.glb',
      sourceSha256: crypto.createHash('sha256').update(file).digest('hex'),
      triangleCount,
      tile,
      columns: ['base', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'],
      rows: ['front+Z', 'rear-Z'],
      maskCounts,
    },
    null,
    2,
  ) + '\n',
);
console.log({ triangleCount, atlasBytes: fs.statSync(path).size, maskCounts });
