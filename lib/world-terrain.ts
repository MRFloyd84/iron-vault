// Geländenetz der Wüste: 12 × 12 Kacheln à 125 m, je drei Detailstufen (3 m, 10 m, 31 m
// Raster), mit heruntergezogenen Rändern gegen Spalten zwischen den Stufen. Farbe pro Ecke
// (Sand, Fels an Hängen, Schotter auf Pisten, festgefahrene Flächen an den Anlagen),
// dazu eine kachelbare Sandkörnung als Textur.
import * as THREE from 'three';
import {
  MAP,
  terrainHeight,
  roadWeight,
  yardWeight,
  noise,
  smoothstep,
  SITES,
  MESAS,
} from './terrain';

const CHUNK = 125;
const LEVELS = [
  { segments: 40, distance: 0 },
  { segments: 10, distance: 230 },
  { segments: 4, distance: 600 },
] as const;
const SKIRT = 5;
const FLOOR = -2.6;

/** Unter Hofplatte, Fahrbahn und Hallenboden liegt das Gelände knapp tiefer (kein Flimmern). */
function underSlab(x: number, z: number) {
  const inside = (x0: number, x1: number, z0: number, z1: number) =>
    x > x0 - 1.5 && x < x1 + 1.5 && z > z0 - 1.5 && z < z1 + 1.5;
  return (
    inside(-55, 55, -173, -34) ||
    inside(-8, 8, -245, -34) ||
    inside(-18, 18, -38, 12) ||
    inside(-17, 17, -38.3, -34.3)
  );
}

const C = (hex: number) => new THREE.Color(hex);
const SAND_A = C(0xc49c69),
  SAND_B = C(0xdcbb88),
  SAND_DARK = C(0x9a774e),
  ROCK = C(0x7b5a42),
  ROCK_DARK = C(0x5e4535),
  GRAVEL = C(0x80735f),
  PAD = C(0x948a7a),
  YARD = C(0x6f6b62);

function groundColor(x: number, z: number, h: number, slope: number, out: THREE.Color) {
  const n = noise(x / 140 + 9.1, z / 140 - 3.3) * 0.5 + 0.5,
    m = noise(x / 37 - 4.2, z / 37 + 8.8) * 0.5 + 0.5;
  out.copy(SAND_A).lerp(SAND_B, n);
  // Dunklere Flecken (Geröll, feuchterer Boden in Senken)
  out.lerp(SAND_DARK, smoothstep(0.6, 0.9, m) * 0.35 + smoothstep(-1, -4, h) * 0.15);
  // Fels an steilen Hängen und auf den Tafelbergen
  let rock = smoothstep(0.32, 0.6, slope);
  for (const mesa of MESAS)
    if (Math.hypot(x - mesa.x, z - mesa.z) < mesa.r + 30)
      rock = Math.max(rock, smoothstep(mesa.h * 0.4, mesa.h * 0.8, h) * 0.55);
  out.lerp(rock > 0.5 ? ROCK_DARK : ROCK, rock);
  // Festgefahrene Flächen an den Anlagen, Schotterpisten mit dunkleren Fahrspuren
  for (const s of SITES) {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d < s.r + 10) out.lerp(PAD, smoothstep(s.r + 10, s.r - 15, d) * 0.7);
  }
  const road = roadWeight(x, z);
  if (road > 0) out.lerp(GRAVEL, Math.min(1, road * 1.6) * 0.95);
  const yard = yardWeight(x, z);
  if (yard > 0) out.lerp(YARD, yard * 0.8);
  return out;
}

/** Kachelbares Wertrauschen: Gitter wiederholt sich nach `period` Zellen. */
function tileNoise(x: number, y: number, period: number, seed: number) {
  const i = Math.floor(x),
    j = Math.floor(y);
  const fx = x - i,
    fy = y - j;
  const u = fx * fx * (3 - 2 * fx),
    v = fy * fy * (3 - 2 * fy);
  const h = (a: number, b: number) => {
    const k =
      Math.sin(
        (((a % period) + period) % period) * 127.1 +
          (((b % period) + period) % period) * 311.7 +
          seed * 74.7,
      ) * 43758.5453;
    return k - Math.floor(k);
  };
  const a = h(i, j),
    b = h(i + 1, j),
    c = h(i, j + 1),
    d = h(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Kachelbare Sandkörnung (hell, wird mit der Eckfarbe multipliziert). */
export function sandTexture() {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const fx = x / size,
        fy = y / size;
      // Flecken in drei Größen, Windrippel schwach und unregelmäßig, feines Korn
      const blotch =
        tileNoise(fx * 6, fy * 6, 6, 1) * 0.5 +
        tileNoise(fx * 13, fy * 13, 13, 2) * 0.3 +
        tileNoise(fx * 29, fy * 29, 29, 3) * 0.2;
      const warp = tileNoise(fx * 4, fy * 4, 4, 4);
      const ripple = Math.sin((fy * 11 + fx * 3 + warp * 1.6) * Math.PI * 2) * 0.5 + 0.5;
      const grain = Math.random();
      const value = 206 + (blotch - 0.5) * 34 + ripple * 6 + (grain - 0.5) * 30;
      const i = (y * size + x) * 4;
      img.data[i] = Math.min(255, value + 5);
      img.data[i + 1] = Math.min(255, value);
      img.data[i + 2] = Math.min(255, value - 8);
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 7, 1 / 7);
  t.anisotropy = 8;
  return t;
}

/** Höhen einer Kachel im feinsten Raster, eine Reihe Rand ringsum (für Normalen). */
type Sampled = {
  n: number;
  step: number;
  heights: Float32Array;
  colors: Float32Array;
  normals: Float32Array;
};
function sampleChunk(cx: number, cz: number, n: number): Sampled {
  const step = CHUNK / n,
    row = n + 3;
  const heights = new Float32Array(row * row);
  for (let j = 0; j < row; j++)
    for (let i = 0; i < row; i++)
      heights[j * row + i] = terrainHeight(cx + (i - 1) * step, cz + (j - 1) * step);
  const inner = n + 1;
  const normals = new Float32Array(inner * inner * 3),
    colors = new Float32Array(inner * inner * 3);
  const color = new THREE.Color();
  for (let j = 0; j < inner; j++)
    for (let i = 0; i < inner; i++) {
      const at = (di: number, dj: number) => heights[(j + 1 + dj) * row + (i + 1 + di)];
      const gx = (at(1, 0) - at(-1, 0)) / (2 * step),
        gz = (at(0, 1) - at(0, -1)) / (2 * step);
      const l = Math.hypot(gx, 1, gz),
        k = (j * inner + i) * 3;
      normals[k] = -gx / l;
      normals[k + 1] = 1 / l;
      normals[k + 2] = -gz / l;
      groundColor(cx + i * step, cz + j * step, at(0, 0), Math.hypot(gx, gz), color);
      colors[k] = color.r;
      colors[k + 1] = color.g;
      colors[k + 2] = color.b;
    }
  return { n, step, heights, colors, normals };
}

/** Netz einer Detailstufe aus dem fein abgetasteten Raster (jeder `stride`-te Punkt). */
function chunkGeometry(cx: number, cz: number, sampled: Sampled, segments: number) {
  const stride = sampled.n / segments,
    n = segments,
    step = CHUNK / n,
    row = n + 3,
    srow = sampled.n + 3,
    inner = sampled.n + 1;
  const count = row * row;
  const pos = new Float32Array(count * 3),
    nor = new Float32Array(count * 3),
    col = new Float32Array(count * 3),
    uv = new Float32Array(count * 2);
  for (let j = 0; j < row; j++)
    for (let i = 0; i < row; i++) {
      const gi = Math.min(n, Math.max(0, i - 1)),
        gj = Math.min(n, Math.max(0, j - 1));
      const si = gi * stride,
        sj = gj * stride;
      const x = cx + gi * step,
        z = cz + gj * step;
      const skirt = i === 0 || j === 0 || i === row - 1 || j === row - 1;
      const h = sampled.heights[(sj + 1) * srow + (si + 1)];
      const k = j * row + i,
        s = (sj * inner + si) * 3;
      pos[k * 3] = x;
      pos[k * 3 + 1] = FLOOR + h - (underSlab(x, z) ? 0.06 : 0) - (skirt ? SKIRT : 0);
      pos[k * 3 + 2] = z;
      nor[k * 3] = sampled.normals[s];
      nor[k * 3 + 1] = sampled.normals[s + 1];
      nor[k * 3 + 2] = sampled.normals[s + 2];
      col[k * 3] = sampled.colors[s];
      col[k * 3 + 1] = sampled.colors[s + 1];
      col[k * 3 + 2] = sampled.colors[s + 2];
      uv[k * 2] = x;
      uv[k * 2 + 1] = z;
    }
  const index: number[] = [];
  for (let j = 0; j < row - 1; j++)
    for (let i = 0; i < row - 1; i++) {
      const a = j * row + i,
        b = a + 1,
        c = a + row,
        d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.Uint16BufferAttribute(index, 1));
  return g;
}

export type TerrainBuild = {
  root: THREE.Group;
  material: THREE.MeshStandardMaterial;
  geometries: THREE.BufferGeometry[];
};

/** Baut alle Kacheln. `normalMap`: feine Struktur (geteilt mit dem Hofbeton). */
export function buildTerrain(material: THREE.MeshStandardMaterial): TerrainBuild {
  const root = new THREE.Group();
  root.name = 'Desert terrain';
  const geometries: THREE.BufferGeometry[] = [];
  for (let cz = MAP.minZ; cz < MAP.maxZ; cz += CHUNK)
    for (let cx = MAP.minX; cx < MAP.maxX; cx += CHUNK) {
      const lod = new THREE.LOD();
      // LOD misst den Abstand zum Objektursprung: in die Kachelmitte legen
      lod.position.set(cx + CHUNK / 2, 0, cz + CHUNK / 2);
      const sampled = sampleChunk(cx, cz, LEVELS[0].segments);
      for (const level of LEVELS) {
        const g = chunkGeometry(cx, cz, sampled, level.segments);
        g.translate(-(cx + CHUNK / 2), 0, -(cz + CHUNK / 2));
        g.computeBoundingSphere();
        geometries.push(g);
        const mesh = new THREE.Mesh(g, material);
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        lod.addLevel(mesh, level.distance, 40);
      }
      lod.updateMatrix();
      lod.matrixAutoUpdate = false;
      root.add(lod);
    }
  return { root, material, geometries };
}

/** Ferne Bergkette rund um die Karte (im Dunst, nur Silhouette). */
export function buildHorizon(material: THREE.Material) {
  const segments = 160,
    rings = 4;
  const cx = (MAP.minX + MAP.maxX) / 2,
    cz = (MAP.minZ + MAP.maxZ) / 2;
  const pos: number[] = [],
    index: number[] = [];
  for (let r = 0; r <= rings; r++) {
    const radius = 1350 + r * 380;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const ridge =
        Math.max(0, noise(Math.cos(a) * 4 + 20, Math.sin(a) * 4) * 0.5 + 0.5) ** 1.6 * 230 +
        noise(Math.cos(a) * 14, Math.sin(a) * 14 + 7) * 30;
      const y = FLOOR - 8 + (r === 0 ? 0 : ridge * Math.min(1, r / 2) * (r === rings ? 0.75 : 1));
      pos.push(cx + Math.cos(a) * radius, y, cz + Math.sin(a) * radius);
    }
  }
  for (let r = 0; r < rings; r++)
    for (let i = 0; i < segments; i++) {
      const a = r * (segments + 1) + i,
        b = a + 1,
        c = a + segments + 1,
        d = c + 1;
      index.push(a, b, c, b, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, material);
  mesh.name = 'Distant ridges';
  mesh.matrixAutoUpdate = false;
  return mesh;
}
