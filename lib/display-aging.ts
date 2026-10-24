// Alterungs-Look der Cockpitdisplays: IV-04 ist ein alter Mech mit müden Bildröhren.
//
// Zwei Ebenen:
//  1. Helligkeit (displayFlicker): wird jedes Bild auf das Material des 3D-Displays
//     angewendet – flüssiges Flackern ohne Canvas-Neuzeichnung.
//  2. Bildstörungen (drawDisplayAging): werden beim (gedrosselten) Neuzeichnen der
//     Canvas-Textur aufgetragen – Aufglühen, Durchrollen, Bildrisse, Rauschen.
//
// Alles ist deterministisch aus Zeit und Displaynummer berechnet: gleiche Eingabe,
// gleiches Bild. Bei "reduzierter Bewegung" im Betriebssystem entfallen Flackern und
// Störungen; nur die statische Randabdunklung bleibt.

import type { DisplayPhase } from './display-boot';

/** Wie verbraucht jede Röhre ist (0 = neuwertig, 1 = am Ende). Nach Displaynummer. */
const AGE = [0.55, 0.35, 0.7, 0.95, 0.5, 0.6, 0.45, 0.85, 0.3, 0.65];
export const displayAge = (index: number) => AGE[((index % AGE.length) + AGE.length) % AGE.length];

/** Ganzzahl-Hash → [0, 1). Schnell und ohne Zustand. */
export function hash(a: number, b = 0, c = 0): number {
  let h =
    Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77) ^ Math.imul(c | 0, 0xc2b2ae3d);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// ---------- Einschalten ----------

/** Displays springen nicht gleichzeitig an: kleine Verzögerung je Röhre. */
export const powerOnDelay = (index: number) => 0.12 + hash(index, 1) * 0.55;
/** Dauer, in der sich der Strahl zum vollen Bild öffnet. */
export const OPEN_SECONDS = 0.45;
/** Danach klingt die Instabilität (Durchrollen, Zittern, Flackern) ab. */
export const SETTLE_SECONDS = 4.5;

/** 1 direkt nach dem Öffnen, fällt bis SETTLE_SECONDS auf 0. */
function bootInstability(t: number, index: number) {
  if (t < OPEN_SECONDS) return 1;
  const k = 1 - (t - OPEN_SECONDS) / (SETTLE_SECONDS - OPEN_SECONDS);
  return k <= 0 ? 0 : Math.pow(k, 1.5) * (0.55 + 0.45 * displayAge(index));
}

// ---------- Störungen im Betrieb ----------

export type GlitchType = 'dip' | 'tear' | 'shake' | 'noise' | 'roll';
export type Glitch = { type: GlitchType; progress: number; strength: number; seed: number };
const SLOT_SECONDS = 6;

/**
 * Liefert die gerade laufende Störung eines Displays oder null.
 * Pro 6-Sekunden-Fenster entscheidet ein Hash, ob (und wann) etwas passiert.
 * Ältere Röhren stören häufiger; im Mittel trifft es irgendein Display alle paar Sekunden,
 * ein einzelnes etwa alle ein bis zwei Minuten.
 */
export function glitchAt(seconds: number, index: number): Glitch | null {
  const slot = Math.floor(seconds / SLOT_SECONDS);
  const age = displayAge(index);
  if (hash(index, slot, 7) > 0.08 + 0.22 * age) return null;
  const duration = 0.22 + hash(index, slot, 8) * 0.5;
  const start = slot * SLOT_SECONDS + hash(index, slot, 9) * (SLOT_SECONDS - duration);
  const progress = (seconds - start) / duration;
  if (progress < 0 || progress >= 1) return null;
  const pick = hash(index, slot, 10);
  const type: GlitchType =
    pick < 0.3
      ? 'dip'
      : pick < 0.6
        ? 'tear'
        : pick < 0.8
          ? 'shake'
          : pick < 0.92
            ? 'noise'
            : 'roll';
  return { type, progress, strength: 0.4 + 0.6 * hash(index, slot, 11), seed: slot * 31 + index };
}

// ---------- Ebene 1: Helligkeit ----------

/**
 * Helligkeitsfaktor (0…~1.1) für das Displaymaterial. Wird mit der eingestellten
 * Displayhelligkeit multipliziert.
 */
export function displayFlicker(
  phase: DisplayPhase,
  elapsed: number,
  seconds: number,
  index: number,
  reduced: boolean,
): number {
  if (phase === 'off') return 0;
  const age = displayAge(index);
  const base = 1 - 0.07 * age; // alte Röhren sind etwas trüber
  if (phase === 'boot') {
    const t = elapsed - powerOnDelay(index);
    if (t < 0) return 0;
    // Kathode heizt auf: Bild kommt dunkel und wird langsam voll.
    const warm = Math.min(1, 0.45 + 0.55 * (t / 2.8));
    if (reduced) return base * warm;
    if (t < OPEN_SECONDS) return 1.1; // greller Strahlstrich beim Öffnen
    const u = bootInstability(t, index);
    const frame = Math.floor(seconds * 15);
    const dip = hash(index, frame, 3) < 0.5 * u ? 0.2 + 0.5 * hash(index, frame, 4) : 1;
    const hum = 1 + 0.06 * u * Math.sin(seconds * 51 + index);
    return base * warm * dip * hum;
  }
  if (reduced) return base;
  // Netzbrummen und Dauerflimmern: alte Röhren halten die Helligkeit nie ganz ruhig.
  const flimmer =
    Math.sin(seconds * 9.3 + index * 2.1) * 0.5 +
    Math.sin(seconds * 23.7 + index) * 0.3 +
    (hash(index, Math.floor(seconds * 20), 12) - 0.5) * 0.6;
  let f =
    base *
    (1 + 0.012 * Math.sin(seconds * 47 + index * 1.7) - (0.025 + 0.035 * age) * Math.abs(flimmer));
  // Einzelne kurze Einbrüche (Wackelkontakt im Hochspannungsteil)
  if (hash(index, Math.floor(seconds * 20), 13) < 0.012 + 0.02 * age) f *= 0.55;
  const g = glitchAt(seconds, index);
  if (g) {
    const frame = Math.floor(seconds * 18);
    const jitter = 0.75 + 0.35 * hash(index, frame, 5);
    if (g.type === 'dip') f *= 1 - g.strength * 0.7 * Math.sin(Math.PI * g.progress) * jitter;
    else f *= 0.88 + 0.12 * jitter;
  }
  return f;
}

// ---------- Ebene 2: Bildstörungen auf der Canvas ----------

type Ctx = CanvasRenderingContext2D;

function blank(c: Ctx, x: number, y: number, w: number, h: number, transparent: boolean) {
  if (w <= 0 || h <= 0) return;
  if (transparent) c.clearRect(x, y, w, h);
  else {
    c.fillStyle = '#000';
    c.fillRect(x, y, w, h);
  }
}

// Bildbereiche verschieben. Im Browser per drawImage über eine Hilfscanvas (bleibt auf
// der GPU, kein getImageData-Rücklesen); ohne OffscreenCanvas (Node-Tests) per ImageData.
let scratch: OffscreenCanvasRenderingContext2D | null | undefined;
function scratchFor(w: number, h: number) {
  if (scratch === undefined)
    scratch =
      typeof OffscreenCanvas === 'undefined' ? null : new OffscreenCanvas(w, h).getContext('2d');
  if (scratch && (scratch.canvas.width < w || scratch.canvas.height < h)) {
    scratch.canvas.width = Math.max(w, scratch.canvas.width);
    scratch.canvas.height = Math.max(h, scratch.canvas.height);
  }
  return scratch;
}
/** Kopiert das Rechteck (0, sy, w, h) an die Stellen (dx, dy) der Liste. */
function moveRegion(c: Ctx, sy: number, w: number, h: number, targets: [number, number][]) {
  const s = scratchFor(w, h);
  if (s) {
    s.clearRect(0, 0, w, h);
    s.drawImage(c.canvas as CanvasImageSource, 0, sy, w, h, 0, 0, w, h);
    for (const [dx, dy] of targets) {
      c.clearRect(dx, dy, w, h);
      c.drawImage(s.canvas, 0, 0, w, h, dx, dy, w, h);
    }
  } else {
    const img = c.getImageData(0, sy, w, h);
    for (const [dx, dy] of targets) c.putImageData(img, dx, dy);
  }
}

/** Ganzes Bild senkrecht verschieben (Vertikalsynchronisation rastet nicht ein). */
function roll(c: Ctx, offset: number, transparent: boolean) {
  const w = c.canvas.width,
    h = c.canvas.height;
  const dy = ((Math.round(offset) % h) + h) % h;
  if (dy === 0) return;
  moveRegion(c, 0, w, h, [
    [0, dy],
    [0, dy - h],
  ]);
  // Schwarzer Austastbalken an der Nahtstelle.
  const bar = Math.max(3, Math.round(h * 0.045));
  blank(c, 0, dy - bar, w, bar, transparent);
}

/** Einzelne Zeilenbänder seitlich versetzen (Horizontalsynchronisation zittert). */
function shiftBands(c: Ctx, bands: { y: number; h: number; dx: number }[], transparent: boolean) {
  const w = c.canvas.width,
    H = c.canvas.height;
  for (const b of bands) {
    const y = Math.max(0, Math.min(H - 1, Math.round(b.y)));
    const bh = Math.max(1, Math.min(H - y, Math.round(b.h)));
    const dx = Math.round(b.dx);
    if (dx === 0) continue;
    moveRegion(c, y, w, bh, [[dx, y]]);
    // Die frei gewordene Kante wird schwarz statt alte Pixel stehen zu lassen.
    if (dx > 0) blank(c, 0, y, dx, bh, transparent);
    else blank(c, w + dx, y, -dx, bh, transparent);
  }
}

/** Dünne Rauschlinien und Schnee. */
function noise(c: Ctx, amount: number, seed: number) {
  const w = c.canvas.width,
    h = c.canvas.height;
  const lines = Math.round(amount * 14);
  for (let i = 0; i < lines; i++) {
    const r = hash(seed, i, 21);
    const bright = r > 0.45;
    c.fillStyle = bright
      ? `rgba(216,255,190,${0.08 + 0.22 * hash(seed, i, 22)})`
      : `rgba(0,0,0,${0.25 + 0.4 * hash(seed, i, 22)})`;
    const lh = 1 + Math.round(hash(seed, i, 23) * 3);
    const x = hash(seed, i, 24) * w * 0.5;
    c.fillRect(x, hash(seed, i, 25) * h, w * (0.4 + 0.6 * hash(seed, i, 26)), lh);
  }
  const specks = Math.round(amount * 260);
  c.fillStyle = 'rgba(222,255,200,0.35)';
  for (let i = 0; i < specks; i++)
    c.fillRect(hash(seed, i, 27) * w, hash(seed, i, 28) * h, 2, 1 + hash(seed, i, 29) * 2);
}

/** Statische Abdunklung der Ränder – gewölbtes, ungleichmäßig leuchtendes Röhrenglas. */
function vignette(c: Ctx, index: number) {
  const w = c.canvas.width,
    h = c.canvas.height;
  const g = c.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.35,
    w / 2,
    h / 2,
    Math.hypot(w, h) * 0.56,
  );
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${0.22 + 0.2 * displayAge(index)})`);
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
}

// ---------- Verschmutzte Scheibe ----------

const dirtCache = new Map<string, OffscreenCanvas>();
/**
 * Statische Verschmutzung je Display: Staub, Fingerabdrücke, Wischspuren, Kratzer und
 * Schmutzränder in den Ecken. Einmal gemalt und gecacht (nur im Browser).
 */
function dirtLayer(w: number, h: number, index: number) {
  if (typeof OffscreenCanvas === 'undefined') return null;
  const key = w + 'x' + h + ':' + index;
  const cached = dirtCache.get(key);
  if (cached) return cached;
  const canvas = new OffscreenCanvas(w, h);
  const x = canvas.getContext('2d');
  if (!x) return null;
  const k = w / 960,
    age = displayAge(index);
  // Staubkörner
  for (let i = 0; i < 260 + 300 * age; i++) {
    x.fillStyle = `rgba(210,225,200,${0.05 + 0.1 * hash(index, i, 101)})`;
    const r = (0.6 + 1.6 * hash(index, i, 102)) * k;
    x.fillRect(hash(index, i, 103) * w, hash(index, i, 104) * h, r, r);
  }
  // Wischspuren eines Lappens: weite, flache Bögen
  x.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    x.strokeStyle = `rgba(200,220,190,${0.025 + 0.025 * age})`;
    x.lineWidth = (30 + 50 * hash(index, i, 111)) * k;
    x.beginPath();
    const cx = hash(index, i, 112) * w,
      cy = hash(index, i, 113) * h;
    x.arc(cx, cy + h * 0.6, h * (0.5 + 0.4 * hash(index, i, 114)), -2.2, -0.9);
    x.stroke();
  }
  // Fingerabdrücke: Ovale aus feinen Rillen, meist am Rand, wo man hinlangt
  for (let i = 0; i < 2 + Math.round(3 * age); i++) {
    const edge = hash(index, i, 121) < 0.5;
    const fx = edge ? (hash(index, i, 122) < 0.5 ? 0.08 : 0.92) * w : hash(index, i, 122) * w;
    const fy = (0.2 + 0.7 * hash(index, i, 123)) * h;
    x.save();
    x.translate(fx, fy);
    x.rotate((hash(index, i, 124) - 0.5) * 1.2);
    x.strokeStyle = `rgba(215,230,205,${0.05 + 0.04 * age})`;
    x.lineWidth = 1.2 * k;
    for (let r = 4; r < 26; r += 3.2) {
      x.beginPath();
      x.ellipse(0, 0, r * 0.75 * k, r * k, 0, 0, Math.PI * 2);
      x.stroke();
    }
    x.restore();
  }
  // Kratzer
  for (let i = 0; i < 3 + Math.round(6 * age); i++) {
    x.strokeStyle = `rgba(225,235,215,${0.07 + 0.08 * hash(index, i, 131)})`;
    x.lineWidth = (0.8 + hash(index, i, 132)) * k;
    x.beginPath();
    const sx = hash(index, i, 133) * w,
      sy = hash(index, i, 134) * h,
      len = (40 + 200 * hash(index, i, 135)) * k,
      a = (hash(index, i, 136) - 0.5) * 1.4;
    x.moveTo(sx, sy);
    x.quadraticCurveTo(
      sx + Math.cos(a) * len * 0.5,
      sy + Math.sin(a) * len * 0.5 + 6 * k,
      sx + Math.cos(a) * len,
      sy + Math.sin(a) * len,
    );
    x.stroke();
  }
  // Schmutzrand in den Ecken (dort wischt keiner)
  for (const [cx, cy] of [
    [0, 0],
    [w, 0],
    [0, h],
    [w, h],
  ]) {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.32);
    g.addColorStop(0, `rgba(30,26,18,${0.35 + 0.25 * age})`);
    g.addColorStop(1, 'rgba(30,26,18,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
  }
  dirtCache.set(key, canvas);
  return canvas;
}

function drawGlassDirt(c: Ctx, index: number) {
  const layer = dirtLayer(c.canvas.width, c.canvas.height, index);
  if (layer) c.drawImage(layer, 0, 0);
}

/**
 * Trägt den Alterungs-Look auf eine fertig gezeichnete Displaycanvas auf.
 * `transparent`: HUD-Ebene, deren freie Flächen durchsichtig bleiben müssen.
 */
export function drawDisplayAging(
  c: Ctx,
  phase: DisplayPhase,
  elapsed: number,
  seconds: number,
  index: number,
  reduced: boolean,
  transparent = false,
) {
  if (phase === 'off') return;
  const w = c.canvas.width,
    h = c.canvas.height;
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.shadowBlur = 0;
  c.globalAlpha = 1;
  c.globalCompositeOperation = transparent ? 'source-atop' : 'source-over';
  vignette(c, index);
  c.globalCompositeOperation = 'source-over';
  if (!reduced) {
    const frame = Math.floor(seconds * 30);
    if (phase === 'boot') {
      const t = elapsed - powerOnDelay(index);
      if (t < 0) {
        blank(c, 0, 0, w, h, transparent);
      } else if (t < OPEN_SECONDS) {
        // Strahl öffnet sich vom hellen Strich zur vollen Bildhöhe.
        const k = t / OPEN_SECONDS;
        const bh = Math.max(2, h * k * k);
        const top = (h - bh) / 2;
        blank(c, 0, 0, w, top, transparent);
        blank(c, 0, top + bh, w, h - top - bh, transparent);
        c.fillStyle = `rgba(216,255,190,${0.75 * (1 - k)})`;
        c.fillRect(0, top, w, bh);
      } else {
        const u = bootInstability(t, index);
        // Die meisten Röhren rollen kurz durch, bis die Synchronisation einrastet.
        if (hash(index, 2) < 0.4 + 0.5 * displayAge(index)) {
          const lock = OPEN_SECONDS + 0.9 + hash(index, 3) * 1.6;
          if (t < lock) roll(c, Math.pow(lock - t, 2) * 0.55 * h, transparent);
        }
        // Sehr alte Röhren verlieren einmal kurz das Signal.
        if (displayAge(index) > 0.8 && t > 2.7 && t < 3.1) {
          blank(c, 0, 0, w, h, transparent);
          noise(c, 1, frame);
        } else if (u > 0.02) {
          const bands = [];
          const count = 1 + Math.round(u * 4);
          for (let i = 0; i < count; i++)
            if (hash(index, frame, 40 + i) < 0.4 + 0.6 * u)
              bands.push({
                y: hash(index, frame, 50 + i) * h,
                h: h * (0.01 + 0.08 * hash(index, frame, 60 + i)),
                dx: (hash(index, frame, 70 + i) - 0.5) * 2 * (8 + 50 * u) * (w / 960),
              });
          shiftBands(c, bands, transparent);
          noise(c, u * 0.8, frame * 13 + index);
        }
      }
    } else {
      // Dauerflimmern im Betrieb: wanderndes Interferenzband, zitternde Einzelzeilen.
      if (!transparent) {
        const bh = h * 0.12;
        const by = ((seconds * 0.07 + index * 0.21) % 1) * (h + bh * 2) - bh;
        const band = c.createLinearGradient(0, by, 0, by + bh);
        band.addColorStop(0, 'rgba(150,255,90,0)');
        band.addColorStop(0.5, `rgba(150,255,90,${0.035 + 0.03 * displayAge(index)})`);
        band.addColorStop(1, 'rgba(150,255,90,0)');
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = band;
        c.fillRect(0, by, w, bh);
        c.globalCompositeOperation = 'source-over';
      }
      if (hash(index, frame, 31) < 0.3 + 0.3 * displayAge(index))
        shiftBands(
          c,
          [
            {
              y: hash(index, frame, 32) * h,
              h: Math.max(2, h * 0.012),
              dx: (hash(index, frame, 33) - 0.5) * 6 * (w / 960),
            },
          ],
          transparent,
        );
      const g = glitchAt(seconds, index);
      if (g) {
        const s = g.strength;
        if (g.type === 'tear') {
          const y = hash(g.seed, 1) * h;
          const bh = h * (0.04 + 0.12 * hash(g.seed, 2));
          const dx = (hash(g.seed, frame, 3) - 0.5) * 2 * (20 + 60 * s) * (w / 960);
          shiftBands(c, [{ y, h: bh, dx }], transparent);
          c.fillStyle = 'rgba(216,255,190,0.25)';
          c.fillRect(0, y, w, 1);
        } else if (g.type === 'shake') {
          const bands = [];
          const step = Math.max(4, Math.round(h / 60));
          const amp = (4 + 14 * s) * (w / 960) * Math.sin(Math.PI * g.progress);
          for (let y = 0; y < h; y += step)
            bands.push({ y, h: step, dx: amp * Math.sin(y * 0.045 + frame * 1.3) });
          shiftBands(c, bands, transparent);
        } else if (g.type === 'noise') {
          noise(c, 0.5 + 0.5 * s, frame * 7 + index);
        } else if (g.type === 'roll') {
          roll(c, g.progress * h, transparent);
        }
      }
    }
  }
  // Verschmutzte Scheibe: statisch, daher auch bei reduzierter Bewegung.
  if (phase === 'ready' && !transparent) drawGlassDirt(c, index);
  c.restore();
}
