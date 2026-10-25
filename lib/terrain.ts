// Wüstengelände um Halle und Testgelände: 1,5 × 1,5 km. Reine Höhenfunktion ohne
// Three.js – Gehen, Füße, Drohne, Geschosse, Karte und Grafik nutzen dieselbe Quelle.
//
// Koordinaten wie überall: Meter, Halle bei x = 0, z = 0, Blick aus der Halle nach −z
// (auf der Karte „Norden“). Höhe relativ zum Hallenboden (y = −2,6 in der Szene).
//
// Aufbau: weite Bodenwellen + feinere Unebenheiten, ein Dünenfeld im Nordwesten, drei
// Tafelberge, ein Hügel für die Funkstation und ein Randwall. Straßen, Anlagen und der
// Hof werden weich eingeebnet, damit IV-04 dort sicher gehen kann.

export const MAP = { minX: -750, maxX: 750, minZ: -1440, maxZ: 60 } as const;
export const MAP_SIZE = MAP.maxX - MAP.minX;

/** Hof und Halle bleiben exakt eben (Rampen und Bodenwellen dort: walking.ts). */
const YARD_FLAT = { minX: -70, maxX: 70, minZ: -250, blend: 45 } as const;

export type Site = {
  id: string;
  name: string;
  x: number;
  z: number;
  /** Radius der eingeebneten Fläche */
  r: number;
  /** Breite des Übergangs ins Gelände (m) */
  blend?: number;
};
/** Anlagen (Mittelpunkt, eingeebnete Fläche). Aufbau der Gebäude: world-layout.ts. */
export const SITES: Site[] = [
  { id: 'refinery', name: 'RAFFINERIE ASCHE-7', x: -400, z: -600, r: 88 },
  { id: 'mine', name: 'FÖRDERANLAGE OST', x: 520, z: -400, r: 80 },
  { id: 'radio', name: 'FUNKSTATION KAMM', x: 470, z: -1010, r: 52, blend: 70 },
  { id: 'depot', name: 'DEPOT 4', x: -130, z: -1200, r: 78 },
  { id: 'settlement', name: 'SIEDLUNG KREUZWEG', x: -20, z: -745, r: 66 },
  { id: 'checkpoint', name: 'KONTROLLPUNKT', x: 34, z: -616, r: 18 },
];
export const site = (id: string) => SITES.find((s) => s.id === id)!;

/** Straßen (Mittellinie) – Schotterpisten, 12 m breit. */
export const ROAD_WIDTH = 12;
export const ROADS: [number, number][][] = [
  // Ausfahrt aus dem Testgelände (östlich der Schießbahn) zum Kreuzweg
  [
    [40, -205],
    [92, -245],
    [112, -335],
    [96, -470],
    [62, -640],
  ],
  // West: Raffinerie
  [
    [62, -640],
    [-80, -655],
    [-240, -615],
    [-330, -600],
  ],
  // Ost: Förderanlage
  [
    [62, -640],
    [200, -605],
    [380, -470],
    [455, -420],
  ],
  // Nord: Siedlung und Depot
  [
    [62, -640],
    [30, -760],
    [-20, -900],
    [-60, -1060],
    [-100, -1140],
  ],
  // Nordost: Funkstation (steigt sanft den Hügel hinauf)
  [
    [62, -640],
    [190, -770],
    [330, -880],
    [420, -975],
  ],
];

/** Tafelberge: steile Felsen, nicht begehbar – Landmarken und Sichtschutz. */
export const MESAS = [
  { x: 260, z: -1260, r: 85, h: 34 },
  { x: -600, z: -290, r: 78, h: 27 },
  { x: 620, z: -720, r: 58, h: 22 },
] as const;
/** Breiter Hügel unter der Funkstation (sanft, die Straße führt hinauf). */
const HILL = { x: 470, z: -1010, r: 160, h: 20 } as const;
/** Dünenfeld im Nordwesten (Wrack IV-01 liegt darin). */
const DUNES = { x0: -300, x1: -440, z0: -720, z1: -840 } as const;

// ---------- Rauschen (deterministisch, ohne Abhängigkeiten) ----------
function hash2(i: number, j: number) {
  let h = Math.imul(i, 374761393) + Math.imul(j, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
/** Wertrauschen −1…1, glatt interpoliert. */
export function noise(x: number, z: number) {
  const i = Math.floor(x),
    j = Math.floor(z);
  const fx = x - i,
    fz = z - j;
  const u = fx * fx * (3 - 2 * fx),
    v = fz * fz * (3 - 2 * fz);
  const a = hash2(i, j),
    b = hash2(i + 1, j),
    c = hash2(i, j + 1),
    d = hash2(i + 1, j + 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}
/** Zufallswert 0…1 für Platzierungen (Felsen, Spuren). */
export const scatter = (i: number, salt: number) => hash2(i * 7 + 13, salt * 31 + 101);

export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

// ---------- Bestandteile ----------
/** Weite Bodenwellen und der Stationshügel: daran orientieren sich Straßen und Anlagen. */
function broad(x: number, z: number) {
  const dh = Math.hypot(x - HILL.x, z - HILL.z) / HILL.r;
  return 5 * noise(x / 230 + 3.1, z / 230 - 7.7) + HILL.h * Math.exp(-dh * dh * 1.4);
}
function detail(x: number, z: number) {
  return 1.9 * noise(x / 80 + 17.3, z / 80 + 5.1) + 0.35 * noise(x / 23 + 2.7, z / 23 - 9.4);
}
function dunes(x: number, z: number) {
  const m = smoothstep(DUNES.x0, DUNES.x1, x) * smoothstep(DUNES.z0, DUNES.z1, z);
  if (m <= 0) return 0;
  const u = ((x * 0.62 + z * 0.78) / 88) * Math.PI * 2 + 2.2 * noise(x / 160, z / 160);
  const s = 0.5 + 0.5 * Math.sin(u);
  return m * 6.5 * s * s * (0.75 + 0.25 * noise(x / 60 + 4, z / 60));
}
function mesas(x: number, z: number) {
  let h = 0;
  for (const m of MESAS) {
    const d = Math.hypot(x - m.x, z - m.z);
    if (d > m.r + 40) continue;
    // Zerklüftete Kante, oben leicht gewellt
    const edge = m.r + 9 * noise(x / 22 + m.x, z / 22 + m.z);
    const top = m.h + 1.5 * noise(x / 30, z / 30);
    h = Math.max(h, top * smoothstep(edge + 14, edge - 4, d) + 4 * smoothstep(edge + 40, edge, d));
  }
  return h;
}
function border(x: number, z: number) {
  const e = Math.min(x - MAP.minX, MAP.maxX - x, z - MAP.minZ, MAP.maxZ - z);
  const t = 1 - smoothstep(0, 95, e);
  return 34 * t * t;
}

/** Abstand eines Punkts zur Strecke a→b. */
function segmentDistance(x: number, z: number, a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}
/** Kürzester Abstand zur nächsten Straße. */
export function roadDistance(x: number, z: number) {
  let best = Infinity;
  for (const road of ROADS)
    for (let i = 1; i < road.length; i++) {
      const a = road[i - 1],
        b = road[i];
      // Grobe Vorprüfung: Rechteck um die Strecke plus Rand
      if (
        x < Math.min(a[0], b[0]) - 40 ||
        x > Math.max(a[0], b[0]) + 40 ||
        z < Math.min(a[1], b[1]) - 40 ||
        z > Math.max(a[1], b[1]) + 40
      )
        continue;
      best = Math.min(best, segmentDistance(x, z, a, b));
    }
  return best;
}
/** Höhe der eingeebneten Anlagenflächen (Mittelpunkt der weiten Bodenwellen). */
const SITE_HEIGHT = new Map(SITES.map((s) => [s.id, broad(s.x, s.z)]));
export const siteHeight = (id: string) => SITE_HEIGHT.get(id) ?? 0;

/** Gewicht 0…1: wie stark Hof und Halle das Gelände einebnen. */
export function yardWeight(x: number, z: number) {
  const ex = Math.max(0, Math.abs(x) - YARD_FLAT.maxX),
    ez = Math.max(0, YARD_FLAT.minZ - z);
  return 1 - smoothstep(0, YARD_FLAT.blend, Math.hypot(ex, ez));
}
/** Gewicht 0…1 der Straße (Mitte = 1, Böschung weich). */
export const roadWeight = (x: number, z: number) =>
  smoothstep(ROAD_WIDTH / 2 + 14, ROAD_WIDTH / 2, roadDistance(x, z));

/**
 * Geländehöhe über dem Hallenboden (m). Innerhalb von Hof und Halle exakt 0.
 * Außerhalb der Karte steigt der Randwall weiter an.
 */
export function terrainHeight(x: number, z: number) {
  const wy = yardWeight(x, z);
  if (wy >= 1) return 0;
  const base = broad(x, z);
  let h = base + detail(x, z) + dunes(x, z) + mesas(x, z) + border(x, z);
  // Straßen folgen nur den weiten Bodenwellen
  const wr = roadWeight(x, z);
  if (wr > 0) h = mix(h, base, wr);
  // Anlagen: ebene Fläche auf der Höhe ihres Mittelpunkts
  for (const s of SITES) {
    const d = Math.hypot(x - s.x, z - s.z),
      blend = s.blend ?? 30;
    if (d < s.r + blend) h = mix(h, SITE_HEIGHT.get(s.id)!, smoothstep(s.r + blend, s.r, d));
  }
  return mix(h, 0, wy);
}

/** Steigung (Betrag des Gradienten) – für Felsfarbe und Tests. */
export function terrainSlope(x: number, z: number, e = 1) {
  const gx = (terrainHeight(x + e, z) - terrainHeight(x - e, z)) / (2 * e),
    gz = (terrainHeight(x, z + e) - terrainHeight(x, z - e)) / (2 * e);
  return Math.hypot(gx, gz);
}

/** Kartenquadrat 250 m: Spalten A–F (West → Ost), Reihen 1–6 (Süd → Nord). */
export function sectorName(x: number, z: number) {
  const col = Math.min(5, Math.max(0, Math.floor((x - MAP.minX) / 250)));
  const row = Math.min(5, Math.max(0, Math.floor((MAP.maxZ - z) / 250)));
  return 'ABCDEF'[col] + (row + 1);
}
export const insideMap = (x: number, z: number, margin = 0) =>
  x > MAP.minX + margin && x < MAP.maxX - margin && z > MAP.minZ + margin && z < MAP.maxZ - margin;
