// Tag/Nacht: reine Parameterfunktion (testbar) und ein prozedural gemalter Nachthimmel.
import * as THREE from 'three';
import { hash } from './display-aging';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mixColor = (a: number, b: number, t: number) =>
  new THREE.Color(a).lerp(new THREE.Color(b), t);

/** Übergangsgeschwindigkeit: ca. 2,5 s von Tag zu Nacht. */
export const DAY_NIGHT_RATE = 1.6;

/**
 * Alle Szenenwerte für einen Nachtanteil n (0 = Tag wie bisher, 1 = volle Nacht).
 * Die Tag-Werte entsprechen exakt dem bisherigen Aussehen.
 */
export function dayNightParams(n: number) {
  n = THREE.MathUtils.clamp(n, 0, 1);
  // Himmel blendet über Dunkel: erste Hälfte Tageshimmel aus, zweite Nachthimmel ein.
  const dayPart = Math.max(0, 1 - n * 2),
    nightPart = Math.max(0, n * 2 - 1);
  return {
    n,
    sky: n < 0.5 ? ('day' as const) : ('night' as const),
    skyIntensity: n < 0.5 ? 0.03 + 0.77 * dayPart : 0.03 + 0.97 * nightPart,
    hemiIntensity: lerp(0.2, 0.09, n),
    hemiSky: mixColor(0x91aea8, 0x41557e, n),
    hemiGround: mixColor(0x10130e, 0x07080a, n),
    fogColor: mixColor(0x39444a, 0x0a0f17, n),
    fogScale: lerp(1, 1.5, n),
    yardEnv: lerp(0.85, 0.07, n),
    envScale: lerp(1, 0.18, n),
    lampGlow: lerp(3, 7, n),
    floodScale: lerp(1, 1.25, n),
  };
}

/** Prozeduraler Nachthimmel (Equirect): Sterne, Mond, Restlicht am Horizont. */
export function createNightSky(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const w = 2048,
    h = 1024,
    canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d')!;
  const g = c.createLinearGradient(0, 0, 0, h / 2);
  g.addColorStop(0, '#020309');
  g.addColorStop(0.7, '#08101d');
  g.addColorStop(1, '#1b2433');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h / 2);
  // Unterhalb des Horizonts: dunkler Boden (wird von Gelände verdeckt).
  c.fillStyle = '#05070a';
  c.fillRect(0, h / 2, w, h / 2);
  // Schwaches, warmes Streulicht ferner Industrie am Horizont.
  const glow = c.createLinearGradient(0, h / 2 - 90, 0, h / 2);
  glow.addColorStop(0, 'rgba(120,90,60,0)');
  glow.addColorStop(1, 'rgba(120,90,60,0.22)');
  c.fillStyle = glow;
  c.fillRect(0, h / 2 - 90, w, 90);
  // Sterne: dichter nach oben, einige heller und farbig.
  for (let i = 0; i < 2600; i++) {
    const y = Math.pow(hash(i, 1), 1.7) * (h / 2 - 30);
    const x = hash(i, 2) * w;
    const b = hash(i, 3);
    const size = b > 0.985 ? 2.2 : b > 0.9 ? 1.4 : 0.9;
    const tint = hash(i, 4);
    const alpha = (0.25 + 0.75 * b) * (1 - y / (h / 2)) ** 0.3;
    c.fillStyle =
      tint > 0.85
        ? `rgba(255,214,170,${alpha})`
        : tint > 0.7
          ? `rgba(180,205,255,${alpha})`
          : `rgba(235,240,255,${alpha})`;
    c.fillRect(x, y, size, size);
  }
  // Milchstraßen-Schleier
  for (let i = 0; i < 900; i++) {
    const t = hash(i, 9);
    const x = t * w,
      y = 120 + Math.sin(t * Math.PI * 2) * 110 + (hash(i, 10) - 0.5) * 90;
    c.fillStyle = `rgba(150,165,200,${0.025 + 0.03 * hash(i, 11)})`;
    c.beginPath();
    c.arc(x, y, 6 + 18 * hash(i, 12), 0, Math.PI * 2);
    c.fill();
  }
  // Mond mit Hof
  const mx = w * 0.63,
    my = h * 0.17;
  const halo = c.createRadialGradient(mx, my, 8, mx, my, 120);
  halo.addColorStop(0, 'rgba(200,215,255,0.35)');
  halo.addColorStop(1, 'rgba(200,215,255,0)');
  c.fillStyle = halo;
  c.fillRect(mx - 120, my - 120, 240, 240);
  c.fillStyle = '#e9edf2';
  c.beginPath();
  c.arc(mx, my, 15, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = 'rgba(160,170,180,0.35)';
  for (const [dx, dy, r] of [
    [-4, -3, 4],
    [5, 4, 3],
    [2, -7, 2.5],
  ]) {
    c.beginPath();
    c.arc(mx + dx, my + dy, r, 0, Math.PI * 2);
    c.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
}
