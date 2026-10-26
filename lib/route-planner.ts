// Routenplanung für den Autopiloten: Raster über die ganze Karte (4 m), begehbar heißt
// frei von Hindernissen (mit Sicherheitsabstand) und nicht zu steil. Pisten sind billiger,
// steile Hänge teurer. A* sucht den Weg, danach wird er zu wenigen geraden Abschnitten
// geglättet. Rein rechnerisch, ohne Three.js – läuft im Browser und in den Tests.
import { MAP, ROAD_WIDTH, insideMap, roadDistance, terrainHeight } from './terrain';
import { WALK_OBSTACLES, collisionAt, sisterPark } from './walking';
import { WORLD_OBSTACLES } from './world-layout';

export const CELL = 4;
const COLS = Math.round((MAP.maxX - MAP.minX) / CELL);
const ROWS = Math.round((MAP.maxZ - MAP.minZ) / CELL);
/** Steilste geplante Neigung (rad). Gehen erlaubt 0,36 längs – Reserve für kleine Wellen. */
export const PLAN_SLOPE = 0.27;
/** Halle und Tor plant der Autopilot nicht: dort steuert der Pilot selbst. */
export const NAV_MIN_Z = -40;

export type Point = { x: number; z: number };
export type Route = { points: Point[]; length: number };

type Grid = {
  radius: number;
  sister: boolean;
  blocked: Uint8Array;
  /** Kostenfaktor je Zelle aus der Neigung (1 = eben) */
  cost: Float32Array;
  /** 1 = auf einer Piste */
  road: Uint8Array;
};

let heights: Float32Array | null = null;
let roads: Uint8Array | null = null;
const grids = new Map<string, Grid>();
/** Zusätzlich gesperrte Zellen (z. B. dort, wo der Mech tatsächlich hängen blieb) */
const learned = new Set<number>();

const cx = (i: number) => MAP.minX + (i + 0.5) * CELL;
const cz = (j: number) => MAP.maxZ - (j + 0.5) * CELL;
const col = (x: number) => Math.floor((x - MAP.minX) / CELL);
const row = (z: number) => Math.floor((MAP.maxZ - z) / CELL);
const inside = (i: number, j: number) => i >= 0 && j >= 0 && i < COLS && j < ROWS;
export const cellOf = (x: number, z: number) => row(z) * COLS + col(x);

function terrain() {
  if (!heights || !roads) {
    heights = new Float32Array(COLS * ROWS);
    roads = new Uint8Array(COLS * ROWS);
    for (let j = 0; j < ROWS; j++)
      for (let i = 0; i < COLS; i++) {
        const x = cx(i),
          z = cz(j);
        heights[j * COLS + i] = terrainHeight(x, z);
        roads[j * COLS + i] = roadDistance(x, z) < ROAD_WIDTH / 2 - 1 ? 1 : 0;
      }
  }
  return { heights, roads };
}

/** Steigung einer Zelle aus den Nachbarzellen (Gradient über 8 m). */
function slopeAt(h: Float32Array, i: number, j: number) {
  const at = (a: number, b: number) =>
    h[Math.min(ROWS - 1, Math.max(0, b)) * COLS + Math.min(COLS - 1, Math.max(0, a))];
  const gx = (at(i + 1, j) - at(i - 1, j)) / (2 * CELL),
    gz = (at(i, j + 1) - at(i, j - 1)) / (2 * CELL);
  return Math.atan(Math.hypot(gx, gz));
}

/** Begehbarkeitsraster für einen Sicherheitsradius (zwischengespeichert). */
export function walkGrid(radius: number): Grid {
  const key = radius.toFixed(1) + (sisterPark.present ? 's' : '');
  const cached = grids.get(key);
  if (cached) return cached;
  const { heights: h, roads: r } = terrain();
  const blocked = new Uint8Array(COLS * ROWS),
    cost = new Float32Array(COLS * ROWS);
  for (let j = 0; j < ROWS; j++)
    for (let i = 0; i < COLS; i++) {
      const k = j * COLS + i,
        x = cx(i),
        z = cz(j);
      const slope = slopeAt(h, i, j);
      // Rampe zum Schießstand: Seitenwände nicht queren
      const ramp = Math.abs(x) <= 5.5 + radius && z <= -101 && z >= -141;
      if (z > NAV_MIN_Z || !insideMap(x, z, 30 + radius) || slope > PLAN_SLOPE || ramp)
        blocked[k] = 1;
      cost[k] = 1 + 5 * slope;
    }
  // Hindernisse: nur Zellen in der Nähe genau prüfen
  const near = new Set<number>();
  const mark = (x: number, z: number, reach: number) => {
    for (let j = row(z + reach); j <= row(z - reach); j++)
      for (let i = col(x - reach); i <= col(x + reach); i++)
        if (inside(i, j)) near.add(j * COLS + i);
  };
  for (const o of [...WALK_OBSTACLES, ...WORLD_OBSTACLES])
    mark(o.x, o.z, Math.hypot(o.w, o.d) / 2 + radius + CELL);
  for (const k of near) {
    if (blocked[k]) continue;
    const i = k % COLS,
      j = (k - i) / COLS;
    if (collisionAt(cx(i), cz(j), 1, radius)) blocked[k] = 1;
  }
  const grid = { radius, sister: sisterPark.present, blocked, cost, road: r };
  grids.set(key, grid);
  return grid;
}

/** Stelle sperren, an der der Mech hängen blieb (gilt für alle späteren Planungen). */
export function learnBlocked(x: number, z: number) {
  const i = col(x),
    j = row(z);
  for (let b = j - 1; b <= j + 1; b++)
    for (let a = i - 1; a <= i + 1; a++) if (inside(a, b)) learned.add(b * COLS + a);
}
export const forgetLearned = () => learned.clear();

const free = (g: Grid, k: number) => !g.blocked[k] && !learned.has(k);

/** Nächste freie Zelle um (x, z), höchstens `reach` Meter entfernt. */
function nearestFree(g: Grid, x: number, z: number, reach: number) {
  const i0 = col(x),
    j0 = row(z),
    n = Math.ceil(reach / CELL);
  let best = -1,
    bestD = Infinity;
  for (let j = j0 - n; j <= j0 + n; j++)
    for (let i = i0 - n; i <= i0 + n; i++) {
      if (!inside(i, j)) continue;
      const k = j * COLS + i;
      if (!free(g, k)) continue;
      const d = Math.hypot(cx(i) - x, cz(j) - z);
      if (d < bestD && d <= reach) {
        bestD = d;
        best = k;
      }
    }
  return best;
}

/** Kleine Binärhalde für A*. */
class Heap {
  keys: number[] = [];
  prio: number[] = [];
  get size() {
    return this.keys.length;
  }
  push(k: number, p: number) {
    const a = this.keys,
      b = this.prio;
    let n = a.length;
    a.push(k);
    b.push(p);
    while (n > 0) {
      const up = (n - 1) >> 1;
      if (b[up] <= p) break;
      a[n] = a[up];
      b[n] = b[up];
      n = up;
    }
    a[n] = k;
    b[n] = p;
  }
  pop() {
    const a = this.keys,
      b = this.prio,
      top = a[0],
      lastK = a.pop()!,
      lastP = b.pop()!;
    if (a.length) {
      let n = 0;
      for (;;) {
        let c = 2 * n + 1;
        if (c >= a.length) break;
        if (c + 1 < a.length && b[c + 1] < b[c]) c++;
        if (b[c] >= lastP) break;
        a[n] = a[c];
        b[n] = b[c];
        n = c;
      }
      a[n] = lastK;
      b[n] = lastP;
    }
    return top;
  }
}

const SQRT2 = Math.SQRT2;
const MOVES = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
] as const;

/** Gerade Linie frei? (Abtastung alle 2 m auf dem Raster) */
function clear(g: Grid, a: Point, b: Point) {
  const d = Math.hypot(b.x - a.x, b.z - a.z),
    n = Math.max(1, Math.ceil(d / 2));
  for (let s = 0; s <= n; s++) {
    const t = s / n,
      x = a.x + (b.x - a.x) * t,
      z = a.z + (b.z - a.z) * t,
      i = col(x),
      j = row(z);
    if (!inside(i, j) || !free(g, j * COLS + i)) return false;
  }
  return true;
}

/** So nah muss die Route mindestens an ein eingeschlossenes Ziel heranführen (m). */
const REACH = 150;

/** Längster gerader Abschnitt beim Glätten (folgt so den Pisten weiterhin). */
const MAX_LEG = 70;

/**
 * Route von `from` nach `to`. `null`, wenn kein begehbarer Weg existiert.
 * Das Ziel darf in einem Gebäude liegen: dann endet die Route an der nächsten freien Stelle.
 */
export function planRoute(
  from: Point,
  to: Point,
  radius: number,
  preferRoads = true,
): Route | null {
  const g = walkGrid(radius);
  const start = nearestFree(g, from.x, from.z, 12),
    goal = nearestFree(g, to.x, to.z, 90);
  if (start < 0) return null;
  const target = goal >= 0 ? goal : cellOf(to.x, to.z);
  const gx = target % COLS,
    gy = (target - gx) / COLS;
  const minCost = preferRoads ? 0.7 : 1;
  const h = (k: number) => {
    const i = k % COLS,
      j = (k - i) / COLS,
      dx = Math.abs(i - gx),
      dy = Math.abs(j - gy);
    return (Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy)) * minCost;
  };
  const dist = new Float32Array(COLS * ROWS).fill(Infinity);
  const prev = new Int32Array(COLS * ROWS).fill(-1);
  const done = new Uint8Array(COLS * ROWS);
  const open = new Heap();
  dist[start] = 0;
  open.push(start, h(start));
  let found = false;
  // Liegt das Ziel in einer abgeschlossenen Ecke (z. B. Hof zwischen Tanks), endet die
  // Route an der erreichbaren Stelle, die dem Ziel am nächsten kommt.
  let closest = start,
    closestD = Infinity;
  while (open.size) {
    const k = open.pop();
    if (done[k]) continue;
    done[k] = 1;
    if (k === goal) {
      found = true;
      break;
    }
    const i = k % COLS,
      j = (k - i) / COLS;
    const dGoal = Math.hypot(cx(i) - to.x, cz(j) - to.z);
    if (dGoal < closestD) {
      closestD = dGoal;
      closest = k;
    }
    for (const [di, dj, step] of MOVES) {
      const a = i + di,
        b = j + dj;
      if (!inside(a, b)) continue;
      const n = b * COLS + a;
      if (done[n] || !free(g, n)) continue;
      // Diagonal nicht an Ecken vorbeischneiden
      if (di && dj && (!free(g, j * COLS + a) || !free(g, b * COLS + i))) continue;
      const c = g.cost[n] * (preferRoads && g.road[n] ? 0.7 : 1);
      const nd = dist[k] + step * c;
      if (nd < dist[n]) {
        dist[n] = nd;
        prev[n] = k;
        open.push(n, nd + h(n));
      }
    }
  }
  const end = found ? goal : closestD <= REACH ? closest : -1;
  if (end < 0) return null;
  const cells: number[] = [];
  for (let k = end; k >= 0; k = prev[k]) cells.push(k);
  cells.reverse();
  const raw: Point[] = cells.map((k) => {
    const i = k % COLS;
    return { x: cx(i), z: cz((k - i) / COLS) };
  });
  raw[0] = { x: from.x, z: from.z };
  // Glätten: von jedem Ankerpunkt so weit wie möglich geradeaus
  const points: Point[] = [raw[0]];
  let anchor = 0;
  while (anchor < raw.length - 1) {
    let next = anchor + 1;
    const last = Math.min(raw.length - 1, anchor + Math.ceil((2 * MAX_LEG) / CELL));
    for (let t = last; t > anchor + 1; t--) {
      const a = raw[anchor],
        b = raw[t];
      if (Math.hypot(b.x - a.x, b.z - a.z) <= MAX_LEG && clear(g, a, b)) {
        next = t;
        break;
      }
    }
    points.push(raw[next]);
    anchor = next;
  }
  let length = 0;
  for (let i = 1; i < points.length; i++)
    length += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  return { points, length };
}
