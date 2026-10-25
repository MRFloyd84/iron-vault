// Aufbau der Außenwelt als Daten (ohne Three.js): Anlagen, Leitungen, Felsen, Ziele.
// Daraus entstehen Kollision (Gehen, Drohne), Trefferflächen, Radar, Karte und Grafik
// (world-scene.ts) – alles aus derselben Liste, damit Bild und Verhalten übereinstimmen.
import {
  ROADS,
  SITES,
  MESAS,
  site,
  siteHeight,
  terrainHeight,
  roadDistance,
  yardWeight,
  scatter,
  insideMap,
} from './terrain';

export type Material =
  'concrete' | 'rust' | 'steel' | 'dark' | 'container' | 'pale' | 'yellow' | 'sand' | 'red';

/** Bauteil einer Anlage. x/z Welt, a = Drehung um y (wie rotation.y), y = Fußpunkt (Höhe relativ). */
export type Structure =
  | { kind: 'tank'; x: number; z: number; r: number; h: number; target?: string; label?: string }
  | { kind: 'column'; x: number; z: number; r: number; h: number }
  | { kind: 'flare'; x: number; z: number; h: number }
  | { kind: 'rack'; x: number; z: number; len: number; a: number }
  | {
      kind: 'building';
      x: number;
      z: number;
      w: number;
      d: number;
      h: number;
      a: number;
      style: 'concrete' | 'metal' | 'ruin';
      label?: string;
    }
  | { kind: 'warehouse'; x: number; z: number; w: number; d: number; h: number; a: number }
  | { kind: 'container'; x: number; z: number; a: number; stack: number; tint: number }
  | { kind: 'truck'; x: number; z: number; a: number; target?: string; burnt?: boolean }
  | { kind: 'car'; x: number; z: number; a: number }
  | { kind: 'pile'; x: number; z: number; r: number; h: number }
  | { kind: 'gantry'; x: number; z: number; x2: number; z2: number; h: number; h2: number }
  | { kind: 'excavator'; x: number; z: number; a: number }
  | { kind: 'mast'; x: number; z: number; h: number; target?: string }
  | { kind: 'radar'; x: number; z: number; h: number; target?: string }
  | { kind: 'waterTower'; x: number; z: number; h: number }
  | { kind: 'pylon'; x: number; z: number; a: number }
  | { kind: 'pipe'; x: number; z: number; x2: number; z2: number }
  | { kind: 'valve'; x: number; z: number; a: number; target?: string }
  | { kind: 'drums'; x: number; z: number; n: number }
  | { kind: 'checkpost'; x: number; z: number; a: number }
  | { kind: 'mechwreck'; x: number; z: number; a: number };

export type Obstacle = {
  x: number;
  z: number;
  w: number;
  d: number;
  angle?: number;
  label: string;
  /** Oberkante über dem Hallenboden (für die Drohne) */
  top: number;
  /** Ziel, zu dem das Hindernis gehört (bleibt als Trümmer stehen) */
  target?: string;
};

/** Zerstörbares Ziel. Trefferquader: Mitte (x, y, z), halbe Maße, Drehung a. */
export type Target = {
  id: string;
  label: string;
  kind: 'tank' | 'radar' | 'mast' | 'truck' | 'valve';
  site: string;
  x: number;
  z: number;
  y: number;
  half: [number, number, number];
  a: number;
  hp: number;
  /** Explosionsradius (Schaden an Zielen in der Nähe) */
  blast: number;
};

/** Punkt, den die Drohne erfassen kann (Aufklärung). */
export type ScanPoint = {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  /** Größe des Objekts – größer = aus größerer Entfernung erkennbar */
  size: number;
};

const local = (siteId: string, lx: number, lz: number) => {
  const s = site(siteId);
  return { x: s.x + lx, z: s.z + lz };
};
/** Fußpunkt: tiefste Geländehöhe unter der Grundfläche (nichts schwebt). */
export function baseHeight(x: number, z: number, radius = 2) {
  let h = terrainHeight(x, z);
  for (const [dx, dz] of [
    [radius, 0],
    [-radius, 0],
    [0, radius],
    [0, -radius],
  ])
    h = Math.min(h, terrainHeight(x + dx, z + dz));
  return h;
}

/** An Straßen taucht die Pipeline ab (Abstand Mitte, m). */
const ROAD_GAP = 16;

// ---------- Anlagen ----------
const S: Structure[] = [];
const add = (s: Structure) => S.push(s);

// Raffinerie Asche-7: Tanklager im Westen, Kolonnen, Fackel, Rohrbrücken, Leitstand.
{
  const at = (lx: number, lz: number) => local('refinery', lx, lz);
  const tanks: [number, number, string?][] = [
    [-52, -34, 'tank-a'],
    [-52, -4, 'tank-b'],
    [-52, 26, 'tank-c'],
    [-24, -34],
    [-24, 26],
  ];
  for (const [lx, lz, target] of tanks)
    add({
      kind: 'tank',
      ...at(lx, lz),
      r: 9,
      h: 11,
      target,
      label: target ? 'TANK ' + target.slice(-1).toUpperCase() : undefined,
    });
  add({ kind: 'column', ...at(14, -22), r: 2.6, h: 30 });
  add({ kind: 'column', ...at(24, -12), r: 2, h: 24 });
  add({ kind: 'column', ...at(8, -2), r: 1.6, h: 19 });
  add({ kind: 'flare', ...at(38, 34), h: 38 });
  add({ kind: 'rack', ...at(-8, -14), len: 34, a: Math.PI / 2 });
  add({ kind: 'rack', ...at(4, 14), len: 26, a: 0 });
  add({ kind: 'building', ...at(30, -52), w: 20, d: 11, h: 6, a: 0, style: 'concrete' });
  add({ kind: 'building', ...at(-6, 46), w: 12, d: 9, h: 5, a: 0.1, style: 'metal' });
  add({ kind: 'drums', ...at(18, 40), n: 14 });
  add({ kind: 'truck', ...at(40, -30), a: 1.2, burnt: true });
}
// Förderanlage Ost: Bunker, Förderband, Halden, Bagger- und Kipperwrack.
{
  const at = (lx: number, lz: number) => local('mine', lx, lz);
  add({
    kind: 'building',
    ...at(8, -8),
    w: 16,
    d: 16,
    h: 15,
    a: 0,
    style: 'metal',
    label: 'HOPPER',
  });
  const g1 = at(18, 4),
    g2 = at(56, 34);
  add({ kind: 'gantry', x: g1.x, z: g1.z, x2: g2.x, z2: g2.z, h: 14, h2: 9 });
  add({ kind: 'pile', ...at(60, 38), r: 15, h: 9 });
  add({ kind: 'pile', ...at(-22, 46), r: 12, h: 7 });
  add({ kind: 'pile', ...at(42, -42), r: 10, h: 6 });
  add({ kind: 'excavator', ...at(-12, 30), a: 2.4 });
  add({ kind: 'truck', ...at(-38, -32), a: 0.6, burnt: true });
  add({ kind: 'building', ...at(26, -46), w: 14, d: 8, h: 5, a: -0.2, style: 'metal' });
  add({ kind: 'drums', ...at(-30, 4), n: 9 });
}
// Funkstation Kamm: Gittermast, Radar, Bunker, Generatorhaus.
{
  const at = (lx: number, lz: number) => local('radio', lx, lz);
  add({ kind: 'mast', ...at(12, -16), h: 48, target: 'radio-mast' });
  add({ kind: 'radar', ...at(-16, -14), h: 12, target: 'radar' });
  add({
    kind: 'building',
    ...at(14, 16),
    w: 14,
    d: 10,
    h: 4,
    a: 0.2,
    style: 'concrete',
    label: 'BUNKER',
  });
  add({ kind: 'building', ...at(-20, 16), w: 8, d: 6, h: 4, a: -0.1, style: 'metal' });
  add({ kind: 'drums', ...at(-8, 26), n: 6 });
}
// Depot 4: Lagerhalle, Containerreihen, drei versteckte Lastwagen.
{
  const at = (lx: number, lz: number) => local('depot', lx, lz);
  add({ kind: 'warehouse', ...at(-30, -32), w: 40, d: 22, h: 11, a: 0 });
  let tint = 0;
  for (const lz of [-44, -26, -8])
    for (const lx of [12, 24, 36, 48]) {
      if (lz === -26 && lx === 24) continue; // Lücke: hier steht ein Lastwagen
      add({
        kind: 'container',
        ...at(lx, lz),
        a: Math.PI / 2,
        stack: (lx + lz) % 3 === 0 ? 2 : 1,
        tint: tint++ % 4,
      });
    }
  for (const lx of [-50, -38, -10])
    add({ kind: 'container', ...at(lx, 12), a: 0, stack: 1, tint: tint++ % 4 });
  add({ kind: 'truck', ...at(24, -26), a: Math.PI / 2, target: 'truck-1' });
  add({ kind: 'truck', ...at(-24, 12), a: 0.05, target: 'truck-2' });
  add({ kind: 'truck', ...at(44, 30), a: -0.7, target: 'truck-3' });
  add({ kind: 'drums', ...at(4, 28), n: 16 });
  add({ kind: 'building', ...at(-56, 40), w: 10, d: 8, h: 4, a: 0.3, style: 'metal' });
}
// Siedlung Kreuzweg: Ruinen, Wasserturm, Autowracks.
{
  const at = (lx: number, lz: number) => local('settlement', lx, lz);
  add({ kind: 'waterTower', ...at(-8, -18), h: 22 });
  const ruins: [number, number, number, number, number, number][] = [
    [-40, -40, 12, 9, 6, 0.05],
    [-18, -46, 9, 8, 4, 0.05],
    [8, -40, 10, 12, 7, -0.02],
    [-44, -8, 9, 14, 5, 0.03],
    [-38, 20, 12, 8, 4, 0],
    [-12, 30, 10, 10, 8, 0.04],
    [14, 22, 8, 9, 4, -0.05],
    [16, -6, 7, 7, 3, 0.02],
  ];
  for (const [lx, lz, w, d, h, a] of ruins)
    add({ kind: 'building', ...at(lx, lz), w, d, h, a, style: 'ruin' });
  add({ kind: 'car', ...at(-26, -22), a: 0.9 });
  add({ kind: 'car', ...at(30, 8), a: -0.3 });
  add({ kind: 'car', ...at(-2, 48), a: 2.1 });
}
// Kontrollpunkt am Kreuzweg (Wegpunkt mit Blinklicht).
{
  add({ kind: 'checkpost', ...local('checkpoint', 0, 0), a: -0.35 });
}
// Pipeline von der Raffinerie zur Förderanlage, an Straßen unterirdisch.
export const PIPELINE: [number, number][] = [
  [-345, -560],
  [-150, -505],
  [40, -470],
  [250, -485],
  [445, -440],
];
export const VALVES = [
  { id: 'valve-1', at: [-245, -532] as [number, number] },
  { id: 'valve-2', at: [-55, -488] as [number, number] },
  { id: 'valve-3', at: [175, -480] as [number, number] },
  { id: 'valve-4', at: [330, -467] as [number, number] },
];
{
  for (let i = 1; i < PIPELINE.length; i++) {
    const [ax, az] = PIPELINE[i - 1],
      [bx, bz] = PIPELINE[i];
    const len = Math.hypot(bx - ax, bz - az),
      n = Math.ceil(len / 24);
    for (let k = 0; k < n; k++) {
      const t0 = k / n,
        t1 = (k + 1) / n;
      const x = ax + (bx - ax) * t0,
        z = az + (bz - az) * t0,
        x2 = ax + (bx - ax) * t1,
        z2 = az + (bz - az) * t1;
      // An Straßen taucht die Leitung ab (Durchgang für IV-04).
      if (roadDistance((x + x2) / 2, (z + z2) / 2) < ROAD_GAP) continue;
      add({ kind: 'pipe', x, z, x2, z2 });
    }
  }
  for (const v of VALVES) {
    const i = PIPELINE.findIndex(([px]) => px > v.at[0]);
    const a = Math.atan2(PIPELINE[i][1] - PIPELINE[i - 1][1], PIPELINE[i][0] - PIPELINE[i - 1][0]);
    add({ kind: 'valve', x: v.at[0], z: v.at[1], a: -a, target: v.id });
  }
}
// Stromleitung von der Halle über den Kreuzweg zur Funkstation.
export const POWER_LINE: [number, number][] = [];
{
  const route: [number, number][] = [
    [70, -232],
    [112, -300],
    [120, -420],
    [92, -560],
    [86, -640],
    [210, -750],
    [345, -860],
    [440, -985],
  ];
  let carry = 0;
  for (let i = 1; i < route.length; i++) {
    const [ax, az] = route[i - 1],
      [bx, bz] = route[i];
    const len = Math.hypot(bx - ax, bz - az);
    for (let s = carry; s < len; s += 68) {
      const x = ax + ((bx - ax) * s) / len,
        z = az + ((bz - az) * s) / len;
      if (roadDistance(x, z) < 12) continue;
      POWER_LINE.push([x, z]);
      add({ kind: 'pylon', x, z, a: -Math.atan2(bz - az, bx - ax) });
    }
    carry = 0;
  }
}
// Verschollenes Wrack IV-01 im Dünenfeld.
export const WRECK_IV01 = { x: -560, z: -1020, a: 0.7 } as const;
add({ kind: 'mechwreck', ...WRECK_IV01 });
// Ausgebrannte Fahrzeuge an den Pisten.
for (const [x, z, a] of [
  [150, -350, 0.4],
  [-170, -640, 2.2],
  [0, -1000, -0.8],
  [300, -930, 1.1],
] as const)
  add({ kind: 'car', x, z, a });

export const STRUCTURES: readonly Structure[] = S;

// ---------- Felsen ----------
export type Rock = { x: number; z: number; r: number; a: number; variant: number };
export const ROCKS: Rock[] = [];
{
  let i = 0;
  const clear = (x: number, z: number, r: number) =>
    insideMap(x, z, 60) &&
    yardWeight(x, z) < 0.01 &&
    roadDistance(x, z) > 14 + r &&
    SITES.every((s) => Math.hypot(x - s.x, z - s.z) > s.r + 12 + r) &&
    Math.hypot(x - WRECK_IV01.x, z - WRECK_IV01.z) > 30;
  // Verstreut über die Ebene
  for (let n = 0; ROCKS.length < 420 && n < 4000; n++, i++) {
    const x = -720 + scatter(i, 1) * 1440,
      z = -1410 + scatter(i, 2) * 1440;
    const big = scatter(i, 3) < 0.15;
    const r = big ? 2 + scatter(i, 4) * 2.5 : 0.4 + scatter(i, 4) * 1.3;
    if (clear(x, z, r)) ROCKS.push({ x, z, r, a: scatter(i, 5) * 6.28, variant: i % 3 });
  }
  // Geröll am Fuß der Tafelberge
  for (const m of MESAS)
    for (let k = 0; k < 40; k++, i++) {
      const ang = scatter(i, 6) * Math.PI * 2,
        d = m.r + 6 + scatter(i, 7) * 26;
      const x = m.x + Math.cos(ang) * d,
        z = m.z + Math.sin(ang) * d,
        r = 0.8 + scatter(i, 8) * 3;
      if (clear(x, z, r)) ROCKS.push({ x, z, r, a: scatter(i, 9) * 6.28, variant: i % 3 });
    }
}

// ---------- Kollision ----------
function footprint(s: Structure): Obstacle[] {
  const top = (h: number, r = 2) => baseHeight(s.x, s.z, r) + h;
  switch (s.kind) {
    case 'tank':
      return [
        {
          x: s.x,
          z: s.z,
          w: s.r * 2,
          d: s.r * 2,
          label: 'Tank',
          top: top(s.h + 1.6, s.r),
          target: s.target,
        },
      ];
    case 'column':
      return [{ x: s.x, z: s.z, w: s.r * 2 + 2, d: s.r * 2 + 2, label: 'Kolonne', top: top(s.h) }];
    case 'flare':
      return [{ x: s.x, z: s.z, w: 4, d: 4, label: 'Fackel', top: top(s.h) }];
    case 'rack':
      return [{ x: s.x, z: s.z, w: s.len, d: 4, angle: s.a, label: 'Rohrbrücke', top: top(7) }];
    case 'building':
      return [
        {
          x: s.x,
          z: s.z,
          w: s.w,
          d: s.d,
          angle: s.a,
          label: s.style === 'ruin' ? 'Ruine' : 'Gebäude',
          top: top(s.h, Math.min(s.w, s.d) / 2),
        },
      ];
    case 'warehouse': {
      // Offene Halle: nur Rückwand und Seitenwände sind Hindernisse.
      const t = top(s.h, 6);
      return [
        { x: s.x, z: s.z - s.d / 2 + 0.5, w: s.w, d: 1, label: 'Lagerhalle', top: t },
        { x: s.x - s.w / 2 + 0.5, z: s.z, w: 1, d: s.d, label: 'Lagerhalle', top: t },
        { x: s.x + s.w / 2 - 0.5, z: s.z, w: 1, d: s.d, label: 'Lagerhalle', top: t },
        { x: s.x, z: s.z, w: s.w, d: s.d, label: 'Lagerhalle', top: t, target: 'roof' },
      ];
    }
    case 'container':
      return [
        {
          x: s.x,
          z: s.z,
          w: 6.06,
          d: 2.44,
          angle: s.a,
          label: 'Container',
          top: top(2.6 * s.stack),
        },
      ];
    case 'truck':
      return [
        {
          x: s.x,
          z: s.z,
          w: 2.6,
          d: 8,
          angle: s.a,
          label: 'Lastwagen',
          top: top(3.4),
          target: s.target,
        },
      ];
    case 'car':
      return [{ x: s.x, z: s.z, w: 1.9, d: 4.4, angle: s.a, label: 'Autowrack', top: top(1.5) }];
    case 'pile':
      return [{ x: s.x, z: s.z, w: s.r * 1.5, d: s.r * 1.5, label: 'Halde', top: top(s.h, s.r) }];
    case 'gantry': {
      const len = Math.hypot(s.x2 - s.x, s.z2 - s.z);
      return [
        {
          x: (s.x + s.x2) / 2,
          z: (s.z + s.z2) / 2,
          w: len,
          d: 3,
          angle: -Math.atan2(s.z2 - s.z, s.x2 - s.x),
          label: 'Förderband',
          top: top(Math.max(s.h, s.h2)),
        },
      ];
    }
    case 'excavator':
      return [{ x: s.x, z: s.z, w: 6, d: 9, angle: s.a, label: 'Baggerwrack', top: top(7) }];
    case 'mast':
      return [{ x: s.x, z: s.z, w: 6, d: 6, label: 'Funkmast', top: top(s.h), target: s.target }];
    case 'radar':
      return [{ x: s.x, z: s.z, w: 5, d: 5, label: 'Radar', top: top(s.h + 4), target: s.target }];
    case 'waterTower':
      return [{ x: s.x, z: s.z, w: 8, d: 8, label: 'Wasserturm', top: top(s.h + 6) }];
    case 'pylon':
      return [{ x: s.x, z: s.z, w: 4, d: 4, angle: s.a, label: 'Strommast', top: top(26) }];
    case 'pipe': {
      const len = Math.hypot(s.x2 - s.x, s.z2 - s.z);
      return [
        {
          x: (s.x + s.x2) / 2,
          z: (s.z + s.z2) / 2,
          w: len,
          d: 2,
          angle: -Math.atan2(s.z2 - s.z, s.x2 - s.x),
          label: 'Pipeline',
          top: top(2.6),
        },
      ];
    }
    case 'valve':
      return [
        {
          x: s.x,
          z: s.z,
          w: 5,
          d: 4,
          angle: s.a,
          label: 'Schieberstation',
          top: top(3.6),
          target: s.target,
        },
      ];
    case 'drums':
      return [{ x: s.x, z: s.z, w: 5, d: 5, label: 'Fässer', top: top(1.2) }];
    case 'checkpost':
      return [{ x: s.x, z: s.z, w: 4, d: 4, angle: s.a, label: 'Kontrollhäuschen', top: top(3.5) }];
    case 'mechwreck':
      return [{ x: s.x, z: s.z, w: 9, d: 14, angle: s.a, label: 'Wrack IV-01', top: top(5) }];
  }
}

export const WORLD_OBSTACLES: Obstacle[] = [
  ...STRUCTURES.flatMap(footprint).filter((o) => o.target !== 'roof'),
  ...ROCKS.filter((r) => r.r > 1.6).map((r) => ({
    x: r.x,
    z: r.z,
    w: r.r * 1.6,
    d: r.r * 1.6,
    angle: r.a,
    label: 'Felsblock',
    top: terrainHeight(r.x, r.z) + r.r,
  })),
];
/** Dächer und Oberkanten für die Drohne (inkl. Lagerhallendach). */
const TOPS: Obstacle[] = [
  ...STRUCTURES.flatMap(footprint),
  ...WORLD_OBSTACLES.filter((o) => o.label === 'Felsblock'),
];

function insideBox(x: number, z: number, o: Obstacle, margin: number) {
  const dx = x - o.x,
    dz = z - o.z,
    a = o.angle ?? 0,
    c = Math.cos(a),
    s = Math.sin(a);
  const lx = c * dx - s * dz,
    lz = s * dx + c * dz;
  return Math.abs(lx) < o.w / 2 + margin && Math.abs(lz) < o.d / 2 + margin;
}
/** Höchste Oberkante eines Bauwerks unter (x, z) oder −∞ (für die Drohne). */
export function structureTop(x: number, z: number, margin = 0.8) {
  let top = -Infinity;
  for (const o of TOPS) {
    if (Math.abs(x - o.x) > o.w + o.d || Math.abs(z - o.z) > o.w + o.d) continue;
    if (insideBox(x, z, o, margin)) top = Math.max(top, o.top);
  }
  return top;
}

// ---------- Ziele und Aufklärungspunkte ----------
function targetOf(s: Structure): Target | null {
  if (!('target' in s) || !s.target) return null;
  const y0 = baseHeight(s.x, s.z, 3);
  const siteId = SITES.reduce(
    (best, k) =>
      Math.hypot(s.x - k.x, s.z - k.z) < Math.hypot(s.x - best.x, s.z - best.z) ? k : best,
    SITES[0],
  ).id;
  switch (s.kind) {
    case 'tank':
      return {
        id: s.target,
        label: s.label ?? 'Tank',
        kind: 'tank',
        site: siteId,
        x: s.x,
        z: s.z,
        y: y0 + s.h / 2,
        half: [s.r * 0.86, s.h / 2 + 0.6, s.r * 0.86],
        a: 0,
        hp: 40,
        blast: 26,
      };
    case 'radar':
      return {
        id: s.target,
        label: 'Radar',
        kind: 'radar',
        site: siteId,
        x: s.x,
        z: s.z,
        y: y0 + s.h + 1.5,
        half: [3.8, 3, 3.8],
        a: 0,
        hp: 22,
        blast: 10,
      };
    case 'mast':
      return {
        id: s.target,
        label: 'Sendemast',
        kind: 'mast',
        site: siteId,
        x: s.x,
        z: s.z,
        y: y0 + 7,
        half: [2.6, 7, 2.6],
        a: 0,
        hp: 30,
        blast: 8,
      };
    case 'truck':
      return {
        id: s.target,
        label: 'Lastwagen ' + s.target.slice(-1),
        kind: 'truck',
        site: siteId,
        x: s.x,
        z: s.z,
        y: y0 + 1.7,
        half: [1.3, 1.7, 4],
        a: s.a,
        hp: 14,
        blast: 12,
      };
    case 'valve':
      return {
        id: s.target,
        label: 'Schieber ' + s.target.slice(-1),
        kind: 'valve',
        site: 'pipeline',
        x: s.x,
        z: s.z,
        y: y0 + 1.6,
        half: [2.4, 1.6, 2],
        a: s.a,
        hp: 12,
        blast: 9,
      };
    default:
      return null;
  }
}
export const TARGETS: Target[] = STRUCTURES.map(targetOf).filter((t): t is Target => !!t);
export const target = (id: string) => TARGETS.find((t) => t.id === id)!;

const wt = STRUCTURES.find((s) => s.kind === 'waterTower')!;
const bunker = STRUCTURES.find((s) => s.kind === 'building' && s.label === 'BUNKER')!;
export const SCAN_POINTS: ScanPoint[] = [
  {
    id: 'water-tower',
    label: 'Wasserturm',
    x: wt.x,
    z: wt.z,
    y: baseHeight(wt.x, wt.z) + 24,
    size: 8,
  },
  {
    id: 'iv01',
    label: 'Wrack IV-01',
    x: WRECK_IV01.x,
    z: WRECK_IV01.z,
    y: terrainHeight(WRECK_IV01.x, WRECK_IV01.z) + 3,
    size: 9,
  },
  {
    id: 'bunker',
    label: 'Bunker',
    x: bunker.x,
    z: bunker.z,
    y: baseHeight(bunker.x, bunker.z) + 2,
    size: 8,
  },
  ...TARGETS.filter((t) => t.kind !== 'tank' && t.kind !== 'valve').map((t) => ({
    id: 'scan-' + t.id,
    label: t.label,
    x: t.x,
    z: t.z,
    y: t.y,
    size: Math.max(...t.half) * 2,
  })),
];
export const scanPoint = (id: string) => SCAN_POINTS.find((p) => p.id === id)!;

/** Straßenverlauf für Karte und Radar (Wiederexport). */
export { ROADS, SITES, siteHeight };
