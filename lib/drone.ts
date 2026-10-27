// Aufklärungsdrohne von IV-04: sitzt in einer Halterung auf dem Rücken, startet auf Knopfdruck,
// wird mit Tastatur und Maus geflogen und kehrt bei leerem Akku oder Funkverlust selbst zurück.
// Begleitmodus: startet selbstständig, folgt dem Mech schräg hinten oben, landet bei schwachem
// Akku zum Laden und startet danach wieder – die Steuertasten bleiben beim Mech.
// Reine Logik ohne three.js (Weltkoordinaten in Metern, y nach oben), damit sie testbar ist.
import { MAP } from './terrain';
import type { MachineState } from './machine';
import { mainPowerAvailable } from './machine';
import { SHELTER } from './weather';

export type DronePhase = 'docked' | 'spinup' | 'launch' | 'flying' | 'follow' | 'rtb' | 'landing';
export type Vec = { x: number; y: number; z: number };
/** Steuerbefehle −1…1: vor/zurück, seitlich, steigen/sinken, drehen. */
export type DroneInput = { forward: number; strafe: number; climb: number; turn: number };
export type DroneState = {
  phase: DronePhase;
  /** Sekunden in der aktuellen Phase */
  t: number;
  pos: Vec;
  vel: Vec;
  /** Blickrichtung (rad, 0 = −z wie der Mech) */
  yaw: number;
  /** Kameraneigung (rad, negativ = nach unten) */
  camPitch: number;
  /** Akku 0…1 */
  battery: number;
  /** Funkqualität 0…1 (Entfernung zum Mech) */
  signal: number;
  /** Rotordrehzahl 0…1 (für Bild und Ton) */
  rotor: number;
  /** Markiertes Ziel für die Armkanonen */
  mark: Vec | null;
  /** Grund der automatischen Rückkehr (für die Anzeige) */
  rtbReason: 'battery' | 'signal' | 'manual' | 'hall' | null;
  /** Begleitmodus gewünscht: nach dem Start (und nach dem Laden) dem Mech folgen */
  follow: boolean;
  /** Kreisflug um den stehenden Mech (rad) */
  orbit: number;
};
/** Mech für den Begleitmodus (Welt, Meter). */
export type DroneEscort = { x: number; z: number; yaw: number; speed: number; inHall: boolean };
/** Umgebung je Bild: Halterung am Mech, Boden, Hangartor, Wind. */
export type DroneWorld = {
  dock: Vec;
  dockYaw: number;
  ground: (x: number, z: number) => number;
  /** Öffnung des Hangartors 0…1 */
  gate: number;
  /** Wind/Böen 0…1 (Regen, Gewitter) */
  wind: number;
  time: number;
  /** Mech, dem im Begleitmodus gefolgt wird */
  mech?: DroneEscort;
};

export const DRONE = {
  maxSpeed: 9,
  accel: 7,
  climbSpeed: 3.5,
  turnRate: 1.6,
  /** Flugzeit mit vollem Akku in Sekunden (bei Schwebeflug) */
  endurance: 180,
  /** Ladezeit leer → voll in der Halterung (Sekunden) */
  recharge: 90,
  /** Funk: voll bis hier, dann abnehmend bis lost */
  signalFull: 200,
  signalLost: 340,
  minBattery: 0.06,
  lowBattery: 0.2,
  spinup: 2.4,
  launch: 1.8,
  launchHeight: 3,
  maxAltitude: 60,
  minClearance: 0.6,
  /** Begleitmodus: Abstand hinter dem Mech, seitlicher Versatz, Höhe über Grund */
  escort: { behind: 24, side: 7, height: 14, orbitRadius: 26, orbitRate: 0.1 },
  /** Begleitmodus: nach dem Laden wieder starten ab diesem Akkustand */
  relaunch: 0.9,
  /** Landen von Hand: so nah über der Halterung */
  landRadius: 3,
  landHeight: 5,
  /** Hangar (Weltkoordinaten, Hallenboden y = −2,6): Decke innen, Dach, Toröffnung */
  hall: {
    ...SHELTER,
    ceiling: 9.2,
    roofTop: 11.2,
    doorZ: -34.6,
    doorHalfWidth: 6.6,
    doorHeight: 8.2,
  },
} as const;

export const initialDrone = (): DroneState => ({
  phase: 'docked',
  t: 0,
  pos: { x: 0, y: 0, z: 0 },
  vel: { x: 0, y: 0, z: 0 },
  yaw: 0,
  camPitch: -0.25,
  battery: 1,
  signal: 1,
  rotor: 0,
  mark: null,
  rtbReason: null,
  follow: false,
  orbit: 0,
});
export const idleDroneInput = (): DroneInput => ({ forward: 0, strafe: 0, climb: 0, turn: 0 });

/** Warum die Drohne nicht starten kann (deutsch, Übersetzung beim Anzeigen). */
export function droneBlock(s: MachineState, d: DroneState): string | null {
  if (d.phase !== 'docked') return null;
  if (!(s.stage >= 1 && s.overhead.avionics && mainPowerAvailable(s)))
    return 'Drohne braucht Hauptstrom und AVIONICS.';
  if (d.battery < 0.25) return 'Drohnenakku wird geladen.';
  return null;
}
export const droneAirborne = (d: DroneState) => d.phase !== 'docked';
/** Nimmt die Drohne die Steuertasten (Mech steht dann still)? Im Begleitmodus nicht. */
export const droneHasControls = (d: DroneState) => d.phase === 'flying';
/** Fliegt frei (von Hand oder begleitend) – z. B. zum Erfassen von Zielen. */
export const droneOnStation = (d: DroneState) => d.phase === 'flying' || d.phase === 'follow';
/** Begleitmodus: geladen und bereit zum selbstständigen Wiederstart? */
export const followRelaunchDue = (d: DroneState) =>
  d.phase === 'docked' && d.follow && d.battery >= DRONE.relaunch;

const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const inHall = (p: Vec) =>
  p.x > DRONE.hall.minX &&
  p.x < DRONE.hall.maxX &&
  p.z > DRONE.hall.minZ &&
  p.z < DRONE.hall.maxZ &&
  p.y < DRONE.hall.roofTop;

/** Wände des Hangars: hinein und hinaus nur durch das offene Tor. */
function hallBlocks(from: Vec, to: Vec, gate: number) {
  const a = inHall(from),
    b = inHall(to);
  if (a && to.y > DRONE.hall.ceiling) return true;
  if (a === b) return false;
  const throughDoor =
    Math.abs((from.x + to.x) / 2) < DRONE.hall.doorHalfWidth * gate &&
    Math.max(from.y, to.y) < DRONE.hall.doorHeight &&
    Math.abs((from.z + to.z) / 2 - DRONE.hall.doorZ) < 2;
  return !throughDoor;
}

/** Start (von Hand), wenn angedockt; sonst Rückkehr anfordern (beendet auch das Begleiten). */
export function droneToggle(d: DroneState, s: MachineState): DroneState {
  if (d.phase === 'docked')
    return droneBlock(s, d) ? d : { ...d, phase: 'spinup', t: 0, follow: false };
  if (d.phase === 'flying' || d.phase === 'follow')
    return { ...d, phase: 'rtb', t: 0, rtbReason: 'manual', follow: false };
  if (d.follow) return { ...d, follow: false };
  return d;
}
/**
 * Begleitmodus umschalten. Angedockt: selbstständig starten und folgen. In der Luft:
 * zwischen Begleiten und Handsteuerung wechseln. Bei Rückkehr/Landung nur den Wunsch merken.
 */
export function droneFollowToggle(d: DroneState, s: MachineState): DroneState {
  if (d.phase === 'docked') {
    if (d.follow) return { ...d, follow: false };
    return droneBlock(s, d)
      ? { ...d, follow: true }
      : { ...d, phase: 'spinup', t: 0, follow: true };
  }
  if (d.phase === 'flying') return { ...d, phase: 'follow', t: 0, follow: true, rtbReason: null };
  if (d.phase === 'follow') return { ...d, phase: 'flying', t: 0, follow: false };
  return { ...d, follow: !d.follow };
}
/** Landen von Hand: nur dicht über der Halterung. */
export function droneCanLand(d: DroneState, w: DroneWorld) {
  return (
    d.phase === 'flying' &&
    Math.hypot(d.pos.x - w.dock.x, d.pos.z - w.dock.z) < DRONE.landRadius &&
    d.pos.y - w.dock.y < DRONE.landHeight &&
    d.pos.y > w.dock.y
  );
}

export function stepDrone(
  d: DroneState,
  input: DroneInput,
  dt: number,
  w: DroneWorld,
  powered: boolean,
): DroneState {
  if (dt <= 0) return d;
  const n: DroneState = { ...d, pos: { ...d.pos }, vel: { ...d.vel }, t: d.t + dt };
  const range = Math.hypot(n.pos.x - w.dock.x, n.pos.z - w.dock.z);
  n.signal =
    n.phase === 'docked'
      ? 1
      : clamp(1 - (range - DRONE.signalFull) / (DRONE.signalLost - DRONE.signalFull), 0, 1);
  switch (n.phase) {
    case 'docked': {
      n.pos = { ...w.dock };
      n.vel = { x: 0, y: 0, z: 0 };
      n.yaw = w.dockYaw;
      n.rotor = Math.max(0, n.rotor - dt / 1.5);
      n.mark = null;
      n.rtbReason = null;
      if (powered) n.battery = Math.min(1, n.battery + dt / DRONE.recharge);
      return n;
    }
    case 'spinup': {
      n.pos = { ...w.dock };
      n.yaw = w.dockYaw;
      n.rotor = Math.min(1, n.t / DRONE.spinup);
      if (!powered) return { ...n, phase: 'docked', t: 0 };
      if (n.t >= DRONE.spinup) return { ...n, phase: 'launch', t: 0 };
      return n;
    }
    case 'launch': {
      // Senkrecht aus der Halterung heben; folgt dabei dem (eventuell gehenden) Mech.
      const k = Math.min(1, n.t / DRONE.launch);
      n.rotor = 1;
      n.pos = { x: w.dock.x, y: w.dock.y + DRONE.launchHeight * k * k * (3 - 2 * k), z: w.dock.z };
      n.yaw = w.dockYaw;
      n.battery = Math.max(0, n.battery - dt / DRONE.endurance);
      if (n.t >= DRONE.launch) return { ...n, phase: n.follow ? 'follow' : 'flying', t: 0 };
      return n;
    }
    case 'landing': {
      // Sanft auf die Halterung setzen; Ausrichtung zum Mech.
      n.rotor = 1;
      const target = w.dock;
      const k = Math.min(1, dt * 2.2);
      n.pos.x += (target.x - n.pos.x) * k;
      n.pos.z += (target.z - n.pos.z) * k;
      n.pos.y = Math.max(target.y, n.pos.y - dt * 1.6);
      n.yaw += wrap(w.dockYaw - n.yaw) * k;
      n.vel = { x: 0, y: 0, z: 0 };
      n.battery = Math.max(0, n.battery - dt / DRONE.endurance);
      if (dist(n.pos, target) < 0.08) return { ...n, phase: 'docked', t: 0, pos: { ...target } };
      return n;
    }
  }
  // Fliegen (Hand oder automatische Rückkehr)
  n.rotor = 1;
  const drain = (1 + 0.6 * (Math.hypot(n.vel.x, n.vel.z) / DRONE.maxSpeed)) / DRONE.endurance;
  n.battery = Math.max(0, n.battery - dt * drain);
  let want: Vec;
  if (n.phase === 'rtb') {
    // Über die Halterung fliegen (über dem Hallendach nicht hinein), dann landen.
    const above = { x: w.dock.x, y: w.dock.y + 4, z: w.dock.z };
    const dx = above.x - n.pos.x,
      dz = above.z - n.pos.z,
      dy = above.y - n.pos.y,
      flat = Math.hypot(dx, dz);
    const speed = Math.min(DRONE.maxSpeed, flat * 1.2);
    want = {
      x: flat > 0.01 ? (dx / flat) * speed : 0,
      y: clamp(dy * 1.2, -DRONE.climbSpeed, DRONE.climbSpeed),
      z: flat > 0.01 ? (dz / flat) * speed : 0,
    };
    if (flat > 1) n.yaw += wrap(Math.atan2(-dx, -dz) - n.yaw) * Math.min(1, dt * 2);
    if (flat < 0.6 && Math.abs(dy) < 0.6) return { ...n, phase: 'landing', t: 0 };
  } else if (n.phase === 'follow') {
    if (n.battery <= DRONE.lowBattery * 0.6)
      return { ...n, phase: 'rtb', t: 0, rtbReason: 'battery' };
    if (n.signal <= 0.2) return { ...n, phase: 'rtb', t: 0, rtbReason: 'signal' };
    const m = w.mech;
    if (!m || m.inHall) return { ...n, phase: 'rtb', t: 0, rtbReason: 'hall' };
    want = escortVelocity(n, m, w, dt);
  } else {
    n.yaw = wrap(n.yaw - input.turn * DRONE.turnRate * dt);
    const f = clamp(input.forward, -1, 1) * DRONE.maxSpeed,
      st = clamp(input.strafe, -1, 1) * DRONE.maxSpeed;
    const sin = Math.sin(n.yaw),
      cos = Math.cos(n.yaw);
    want = {
      x: -sin * f + cos * st,
      y: clamp(input.climb, -1, 1) * DRONE.climbSpeed,
      z: -cos * f - sin * st,
    };
    if (n.battery <= DRONE.minBattery) return { ...n, phase: 'rtb', t: 0, rtbReason: 'battery' };
    if (n.signal <= 0) return { ...n, phase: 'rtb', t: 0, rtbReason: 'signal' };
  }
  // Träge wie ein echtes Fluggerät; Wind schüttelt.
  const a = DRONE.accel * dt;
  const gust = w.wind * 1.8;
  for (const k of ['x', 'y', 'z'] as const) {
    const delta = want[k] - n.vel[k];
    n.vel[k] += clamp(delta, -a, a);
  }
  n.vel.x += Math.sin(w.time * 1.7 + 1.3) * gust * dt;
  n.vel.z += Math.sin(w.time * 1.1 + 4.1) * gust * dt;
  n.vel.y += Math.sin(w.time * 2.3) * gust * 0.4 * dt;
  const next = {
    x: clamp(n.pos.x + n.vel.x * dt, MAP.minX + 20, MAP.maxX - 20),
    y: n.pos.y + n.vel.y * dt,
    z: clamp(n.pos.z + n.vel.z * dt, MAP.minZ + 20, 12),
  };
  const floor = w.ground(next.x, next.z) + DRONE.minClearance;
  if (next.y < floor) {
    next.y = floor;
    n.vel.y = Math.max(0, n.vel.y);
  }
  next.y = Math.min(next.y, w.dock.y + DRONE.maxAltitude);
  if (hallBlocks(n.pos, next, w.gate)) {
    // An der Wand stehen bleiben (nicht hindurch).
    n.vel = { x: 0, y: Math.min(0, n.vel.y), z: 0 };
    if (inHall(n.pos)) n.pos.y = Math.min(n.pos.y, DRONE.hall.ceiling);
  } else n.pos = next;
  return n;
}

/**
 * Begleitflug: Sollpunkt schräg hinter dem Mech (in Laufrichtung versetzt), beim stehenden
 * Mech langsam kreisend. Blick und Kamera auf den Mech. Liefert die Sollgeschwindigkeit.
 */
function escortVelocity(n: DroneState, m: DroneEscort, w: DroneWorld, dt: number): Vec {
  const E = DRONE.escort;
  const sin = Math.sin(m.yaw),
    cos = Math.cos(m.yaw);
  let tx: number, tz: number;
  if (Math.abs(m.speed) > 0.3) {
    // Hinter dem Mech (Vorwärts = −sin, −cos) und etwas rechts versetzt
    tx = m.x + sin * E.behind + cos * E.side;
    tz = m.z + cos * E.behind - sin * E.side;
    // Kreis dort fortsetzen, wo die Drohne gerade steht (kein Sprung beim Anhalten)
    n.orbit = Math.atan2(n.pos.x - m.x, n.pos.z - m.z);
  } else {
    n.orbit += E.orbitRate * dt;
    tx = m.x + Math.sin(n.orbit) * E.orbitRadius;
    tz = m.z + Math.cos(n.orbit) * E.orbitRadius;
  }
  // Höhe über dem höheren Boden (Sollpunkt oder aktuelle Lage), Dächer eingeschlossen
  const ty = Math.max(w.ground(tx, tz), w.ground(n.pos.x, n.pos.z)) + E.height;
  const dx = tx - n.pos.x,
    dz = tz - n.pos.z,
    flat = Math.hypot(dx, dz);
  // Proportional anfliegen, mit Vorhalt für den gehenden Mech
  const lead = { x: -sin * m.speed, z: -cos * m.speed };
  const speed = Math.min(DRONE.maxSpeed, flat * 0.7);
  const vx = (flat > 0.01 ? (dx / flat) * speed : 0) + lead.x,
    vz = (flat > 0.01 ? (dz / flat) * speed : 0) + lead.z;
  const k = Math.min(DRONE.maxSpeed, Math.hypot(vx, vz)) / (Math.hypot(vx, vz) || 1);
  // Blick zum Mech, Kamera leicht auf ihn geneigt
  const mx = m.x - n.pos.x,
    mz = m.z - n.pos.z;
  n.yaw += wrap(Math.atan2(-mx, -mz) - n.yaw) * Math.min(1, dt * 1.5);
  const drop = n.pos.y - (w.ground(m.x, m.z) + 4);
  n.camPitch +=
    (clamp(-Math.atan2(drop, Math.hypot(mx, mz)), -1.2, 0.1) - n.camPitch) * Math.min(1, dt * 2);
  return {
    x: vx * k,
    y: clamp((ty - n.pos.y) * 0.8, -DRONE.climbSpeed, DRONE.climbSpeed),
    z: vz * k,
  };
}

/** Ziel markieren (Punkt aus dem Kamerastrahl der Drohne) oder Markierung löschen. */
export function droneMark(d: DroneState, point: Vec | null): DroneState {
  if (d.phase === 'docked') return d;
  return { ...d, mark: point ? { ...point } : null };
}

/** Kamera schwenken (Maus): Drehen um die Hochachse und Neigen. */
export function droneLook(d: DroneState, dYaw: number, dPitch: number): DroneState {
  if (d.phase !== 'flying') return d;
  return { ...d, yaw: wrap(d.yaw - dYaw), camPitch: clamp(d.camPitch - dPitch, -1.45, 0.35) };
}
