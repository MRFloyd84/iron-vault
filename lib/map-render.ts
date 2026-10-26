// Karte der Außenwelt für die Einsatzleitung: Relief aus der Geländefunktion (einmal
// berechnet), Pisten, Anlagen, Planquadrate; darüber Mech, Drohne und Einsatzziele.
import { MAP, MAP_SIZE, ROADS, SITES, MESAS, terrainHeight, roadWeight } from './terrain';
import { PIPELINE, TARGETS } from './world-layout';
import { tr } from './i18n';

const SIZE = 600;
let relief: HTMLCanvasElement | null = null;

/** Kartenpixel → Weltkoordinate */
export const fromMap = (px: number, py: number, size = SIZE) => ({
  x: MAP.minX + (px / size) * MAP_SIZE,
  z: MAP.minZ + (py / size) * MAP_SIZE,
});
/** Weltkoordinate → Kartenpixel */
export const toMap = (x: number, z: number, size = SIZE) => ({
  x: ((x - MAP.minX) / MAP_SIZE) * size,
  y: ((z - MAP.minZ) / MAP_SIZE) * size,
});

function buildRelief() {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d')!;
  const img = g.createImageData(SIZE, SIZE);
  const step = MAP_SIZE / SIZE;
  const h = new Float32Array((SIZE + 1) * (SIZE + 1));
  for (let j = 0; j <= SIZE; j++)
    for (let i = 0; i <= SIZE; i++)
      h[j * (SIZE + 1) + i] = terrainHeight(MAP.minX + i * step, MAP.minZ + j * step);
  for (let j = 0; j < SIZE; j++)
    for (let i = 0; i < SIZE; i++) {
      const at = (a: number, b: number) => h[Math.min(SIZE, b) * (SIZE + 1) + Math.min(SIZE, a)];
      const v = at(i, j);
      const dx = (at(i + 1, j) - v) / step,
        dz = (at(i, j + 1) - v) / step;
      // Licht von Nordwesten, Höhenstufen in Sandtönen
      const shade = Math.max(0.45, Math.min(1.25, 1 + (-dx - dz) * 1.6));
      const tint = Math.max(0, Math.min(1, (v + 6) / 40));
      let r = (150 + 40 * tint) * shade,
        gg = (128 + 30 * tint) * shade,
        b = (92 + 18 * tint) * shade;
      // Höhenlinien alle 5 m
      if (
        Math.floor(v / 5) !== Math.floor(at(i + 1, j) / 5) ||
        Math.floor(v / 5) !== Math.floor(at(i, j + 1) / 5)
      ) {
        r *= 0.82;
        gg *= 0.82;
        b *= 0.82;
      }
      const road = roadWeight(MAP.minX + i * step, MAP.minZ + j * step);
      r += (110 - r) * road * 0.6;
      gg += (100 - gg) * road * 0.6;
      b += (85 - b) * road * 0.6;
      const k = (j * SIZE + i) * 4;
      img.data[k] = r;
      img.data[k + 1] = gg;
      img.data[k + 2] = b;
      img.data[k + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  // Planquadrate 250 m
  g.strokeStyle = 'rgba(30,40,20,0.35)';
  g.lineWidth = 1;
  g.font = '600 13px monospace';
  g.fillStyle = 'rgba(25,32,18,0.7)';
  for (let k = 0; k <= 6; k++) {
    const p = (k / 6) * SIZE;
    g.beginPath();
    g.moveTo(p, 0);
    g.lineTo(p, SIZE);
    g.moveTo(0, p);
    g.lineTo(SIZE, p);
    g.stroke();
    if (k < 6) {
      g.fillText('ABCDEF'[k], p + 4, SIZE - 6);
      g.fillText(String(6 - k), 4, p + 16);
    }
  }
  // Pipeline
  g.strokeStyle = 'rgba(60,60,55,0.8)';
  g.setLineDash([6, 4]);
  g.beginPath();
  PIPELINE.forEach(([x, z], i) => {
    const p = toMap(x, z);
    if (i) g.lineTo(p.x, p.y);
    else g.moveTo(p.x, p.y);
  });
  g.stroke();
  g.setLineDash([]);
  // Hof und Halle
  const yard0 = toMap(-55, -245),
    yard1 = toMap(55, 10);
  g.fillStyle = 'rgba(70,74,70,0.75)';
  g.fillRect(yard0.x, yard0.y, yard1.x - yard0.x, yard1.y - yard0.y);
  void ROADS;
  void MESAS;
  return c;
}

export type MapOverlay = {
  /** Autopilot: Route (ab aktivem Wegpunkt) und Kartenpunkt */
  route?: { points: { x: number; z: number }[]; tmpy: boolean } | null;
  mapPoint?: { x: number; z: number } | null;
  x: number;
  z: number;
  yaw: number;
  drone: { x: number; z: number } | null;
  destroyed: string[];
  objectives: {
    x: number;
    z: number;
    r: number;
    exact: boolean;
    done: boolean;
    visible: boolean;
    label: string;
  }[];
};

/** Karte zeichnen (Relief aus dem Zwischenspeicher, darüber Lage und Ziele). */
export function drawMap(c: CanvasRenderingContext2D, o: MapOverlay, time: number) {
  relief ??= buildRelief();
  const size = c.canvas.width,
    k = size / SIZE;
  c.drawImage(relief, 0, 0, size, size);
  const at = (x: number, z: number) => toMap(x, z, size);
  // Anlagen
  c.font = `600 ${Math.round(12 * k)}px monospace`;
  for (const s of SITES) {
    const p = at(s.x, s.z);
    c.strokeStyle = 'rgba(40,30,20,0.8)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(p.x, p.y, (s.r / MAP_SIZE) * size, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = 'rgba(30,24,16,0.9)';
    c.fillText(tr(s.name), p.x + 6, p.y - (s.r / MAP_SIZE) * size - 4);
  }
  // Ziele
  for (const t of TARGETS) {
    const p = at(t.x, t.z);
    const gone = o.destroyed.includes(t.id);
    c.fillStyle = gone ? 'rgba(40,40,40,0.8)' : 'rgba(150,40,20,0.9)';
    c.fillRect(p.x - 3, p.y - 3, 6, 6);
  }
  // Einsatzziele
  for (const ob of o.objectives) {
    if (!ob.visible) continue;
    const p = at(ob.x, ob.z),
      r = Math.max(6, (ob.r / MAP_SIZE) * size);
    c.strokeStyle = ob.exact ? '#d9531e' : 'rgba(217,83,30,0.85)';
    c.lineWidth = 2.5;
    c.setLineDash(ob.exact ? [] : [6, 5]);
    c.beginPath();
    c.arc(p.x, p.y, r + (ob.exact ? Math.sin(time * 4) * 2 : 0), 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
  }
  // Autopilot-Route: magenta, vorläufig gelb gestrichelt
  if (o.route && o.route.points.length > 1) {
    c.strokeStyle = o.route.tmpy ? '#b59a00' : '#c02fb4';
    c.lineWidth = 2.5 * k;
    c.setLineDash(o.route.tmpy ? [6 * k, 5 * k] : []);
    c.beginPath();
    o.route.points.forEach((pt, i) => {
      const q = at(pt.x, pt.z);
      if (i) c.lineTo(q.x, q.y);
      else c.moveTo(q.x, q.y);
    });
    c.stroke();
    c.setLineDash([]);
    const end = at(o.route.points.at(-1)!.x, o.route.points.at(-1)!.z);
    c.fillStyle = c.strokeStyle;
    c.beginPath();
    c.moveTo(end.x, end.y - 7 * k);
    c.lineTo(end.x + 7 * k, end.y);
    c.lineTo(end.x, end.y + 7 * k);
    c.lineTo(end.x - 7 * k, end.y);
    c.closePath();
    c.fill();
  }
  // Kartenpunkt für den Autopiloten
  if (o.mapPoint) {
    const q = at(o.mapPoint.x, o.mapPoint.z);
    c.strokeStyle = '#0d6f8f';
    c.lineWidth = 3 * k;
    c.beginPath();
    c.moveTo(q.x - 8 * k, q.y);
    c.lineTo(q.x + 8 * k, q.y);
    c.moveTo(q.x, q.y - 8 * k);
    c.lineTo(q.x, q.y + 8 * k);
    c.stroke();
    c.beginPath();
    c.arc(q.x, q.y, 11 * k, 0, Math.PI * 2);
    c.stroke();
  }
  // Drohne
  if (o.drone) {
    const p = at(o.drone.x, o.drone.z);
    c.fillStyle = '#2f6b1a';
    c.beginPath();
    c.arc(p.x, p.y, 4, 0, Math.PI * 2);
    c.fill();
  }
  // Mech: Pfeil in Blickrichtung
  const p = at(o.x, o.z);
  c.save();
  c.translate(p.x, p.y);
  c.rotate(-o.yaw);
  c.fillStyle = '#122c06';
  c.strokeStyle = '#c6ffa0';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(0, -11);
  c.lineTo(7, 8);
  c.lineTo(0, 4);
  c.lineTo(-7, 8);
  c.closePath();
  c.fill();
  c.stroke();
  c.restore();
}
