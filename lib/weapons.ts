// Waffensystem IV-04: zwei Maschinenkanonen in den Unterarmen und ein Laser-
// Entfernungsmesser. Reine Logik ohne Three.js – Freigaben, Feuertakt, Munition,
// Laufhitze und Nachladen. Die Darstellung liegt in weapon-effects.ts.
import { dcPowerAvailable, type MachineState } from './machine';

export const WEAPON = {
  /** Schuss pro Sekunde und Kanone; beide feuern abwechselnd. */
  rate: 5,
  magazine: 150,
  /** Mündungsgeschwindigkeit m/s (30-mm-Maschinenkanone, alt und ausgeschossen). */
  muzzleVelocity: 880,
  /** Hitze pro Schuss; 1 = Laufüberhitzung, Sperre bis unter 0,4. */
  heatPerShot: 0.045,
  coolPerSecond: 0.09,
  /** Nachladen in der Halle (Schuss pro Sekunde und Kanone). */
  reloadRate: 25,
  /** Halber Schwenkbereich der Waffenlafette relativ zum Oberkörper (rad). */
  coneYaw: 0.42,
  conePitchUp: 0.22,
  conePitchDown: 0.38,
  /** Streuung (rad): alte Läufe streuen etwas. */
  spread: 0.0045,
} as const;

export type WeaponState = {
  armed: boolean;
  laser: boolean;
  ammo: [number, number];
  heat: [number, number];
  overheated: [boolean, boolean];
  /** Welche Kanone als nächste feuert (0 = links, 1 = rechts). */
  next: 0 | 1;
  /** Zeitpunkt (s), ab dem wieder geschossen werden darf. */
  ready: number;
  shots: number;
  hits: number;
  reloading: boolean;
};

export const initialWeapons = (): WeaponState => ({
  armed: false,
  laser: false,
  ammo: [WEAPON.magazine, WEAPON.magazine],
  heat: [0, 0],
  overheated: [false, false],
  next: 0,
  ready: 0,
  shots: 0,
  hits: 0,
  reloading: false,
});

/** Grund, warum nicht gefeuert werden darf – oder null. */
export function weaponBlock(s: MachineState, w: WeaponState, sheltered: boolean): string | null {
  if (!dcPowerAvailable(s)) return 'KEIN BORDSTROM';
  if (!w.armed) return 'MASTER ARM AUS';
  if (s.stage < 6) return 'STEUERFREIGABE FEHLT';
  if (sheltered) return 'WAFFENSPERRE HALLE';
  if (w.ammo[0] + w.ammo[1] <= 0) return 'MUNITION LEER';
  if (w.overheated[0] && w.overheated[1]) return 'LÄUFE ÜBERHITZT';
  return null;
}

/**
 * Ein Zeitschritt. `trigger` = Abzug gehalten. Gibt den neuen Zustand und die Kanonen
 * zurück, die in diesem Schritt einen Schuss abgeben (0/1, ggf. mehrere bei großem dt).
 */
export function stepWeapons(
  w: WeaponState,
  s: MachineState,
  dt: number,
  now: number,
  trigger: boolean,
  sheltered: boolean,
  parkedInBay: boolean,
): { w: WeaponState; shots: (0 | 1)[] } {
  dt = Math.max(0, Math.min(dt, 0.25));
  const next: WeaponState = {
    ...w,
    ammo: [...w.ammo] as [number, number],
    heat: [...w.heat] as [number, number],
    overheated: [...w.overheated] as [boolean, boolean],
  };
  for (const g of [0, 1] as const) {
    next.heat[g] = Math.max(0, next.heat[g] - WEAPON.coolPerSecond * dt);
    if (next.overheated[g] && next.heat[g] < 0.4) next.overheated[g] = false;
  }
  // Nachladen nur gesichert, geparkt am Serviceplatz.
  next.reloading =
    !next.armed &&
    parkedInBay &&
    (next.ammo[0] < WEAPON.magazine || next.ammo[1] < WEAPON.magazine);
  if (next.reloading)
    for (const g of [0, 1] as const)
      next.ammo[g] = Math.min(WEAPON.magazine, next.ammo[g] + WEAPON.reloadRate * dt);
  const shots: (0 | 1)[] = [];
  if (!trigger || weaponBlock(s, next, sheltered)) {
    next.ready = Math.max(next.ready, now);
    return { w: next, shots };
  }
  const interval = 1 / (WEAPON.rate * 2);
  if (next.ready < now - 0.25) next.ready = now; // nach Pause nicht nachholen
  let guard = 0;
  while (next.ready <= now && guard++ < 8) {
    // Abwechselnd; ist eine Seite leer oder überhitzt, feuert die andere.
    let g = next.next;
    const usable = (k: 0 | 1) => next.ammo[k] >= 1 && !next.overheated[k];
    if (!usable(g)) g = (1 - g) as 0 | 1;
    if (!usable(g)) break;
    next.ammo[g] -= 1;
    next.heat[g] = Math.min(1, next.heat[g] + WEAPON.heatPerShot);
    if (next.heat[g] >= 1) next.overheated[g] = true;
    next.next = (1 - g) as 0 | 1;
    next.shots++;
    shots.push(g);
    next.ready += interval;
  }
  return { w: next, shots };
}

/**
 * Begrenzt eine gewünschte Schussrichtung (Winkel relativ zum Oberkörper) auf den
 * Schwenkbereich der Lafette. Liefert die Winkel und ob das Ziel erreichbar ist.
 */
export function clampAim(yaw: number, pitch: number) {
  const cy = Math.max(-WEAPON.coneYaw, Math.min(WEAPON.coneYaw, yaw));
  const cp = Math.max(-WEAPON.conePitchDown, Math.min(WEAPON.conePitchUp, pitch));
  return { yaw: cy, pitch: cp, onTarget: Math.abs(cy - yaw) < 0.01 && Math.abs(cp - pitch) < 0.01 };
}

/** Torso-Sollwinkel (Grad), damit das Ziel wieder in den Schwenkbereich kommt. */
export function torsoFollow(currentTorsoDeg: number, aimYawRelative: number) {
  const margin = WEAPON.coneYaw * 0.6;
  if (Math.abs(aimYawRelative) <= margin) return null;
  const needed =
    currentTorsoDeg + ((aimYawRelative - Math.sign(aimYawRelative) * margin) * 180) / Math.PI;
  return Math.max(-45, Math.min(45, needed));
}
