// Gewicht beim Gehen: Erkennen, wann ein Fuß aufsetzt, und ein gedämpfter
// Kamerastoß für die Kanzel. Reine Logik ohne Three.js – testbar.

/**
 * Der linke Fuß (side -1) setzt bei Schrittphase 0 auf, der rechte (side 1) bei 0,5
 * (siehe legCycle in mech-exterior.ts; dort sind auch die Schrittgeräusche synchron).
 * Liefert die Seiten, deren Aufsetzpunkt zwischen zwei Bildern überschritten wurde –
 * vorwärts wie rückwärts.
 */
export function detectFootfalls(previous: number, current: number): (-1 | 1)[] {
  if (!Number.isFinite(previous) || !Number.isFinite(current)) return [];
  const delta = current - previous;
  // Große Sprünge (Teleport, Zurücksetzen) lösen nichts aus.
  if (delta === 0 || Math.abs(delta) > 0.5) return [];
  const out: (-1 | 1)[] = [];
  const lo = Math.min(previous, current),
    hi = Math.max(previous, current);
  for (let k = Math.floor(lo * 2); k <= Math.ceil(hi * 2); k++) {
    const mark = k / 2;
    const crossed = delta > 0 ? mark > lo && mark <= hi : mark >= lo && mark < hi;
    if (crossed) out.push(k % 2 === 0 ? -1 : 1);
  }
  return out;
}

/**
 * Gedämpfte Feder für den Kanzelstoß: Aufsetzen drückt die Kanzel kurz nach unten
 * und kippt sie minimal nach vorn; danach schwingt sie in ~0,4 s aus.
 */
export class StepJolt {
  y = 0;
  vy = 0;
  pitch = 0;
  vPitch = 0;
  roll = 0;
  vRoll = 0;
  /** Für Instrumentenzittern: klingt mit dem Stoß ab. */
  shake = 0;
  impulse(strength: number, side: number) {
    const s = Math.max(0, Math.min(1.5, strength));
    this.vy -= 0.55 * s;
    this.vPitch -= 0.09 * s;
    this.vRoll += 0.05 * s * side;
    this.shake = Math.min(1.5, this.shake + s);
  }
  step(dt: number) {
    dt = Math.min(dt, 0.05);
    const k = 260,
      c = 22;
    for (const [p, v] of [
      ['y', 'vy'],
      ['pitch', 'vPitch'],
      ['roll', 'vRoll'],
    ] as const) {
      this[v] += (-k * this[p] - c * this[v]) * dt;
      this[p] += this[v] * dt;
    }
    this.shake *= Math.exp(-dt * 7);
    return this;
  }
}

/** Stärke eines Aufsetzers aus Geschwindigkeit (m/s) und Drehrate. */
export const footfallStrength = (speed: number, turnRate: number) =>
  Math.min(1.2, 0.35 + Math.abs(speed) * 0.4 + Math.abs(turnRate) * 1.5);
