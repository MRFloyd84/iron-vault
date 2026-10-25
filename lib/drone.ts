// Aufklärungsdrohne von IV-04: sitzt in einer Halterung auf dem Rücken, startet auf Knopfdruck,
// wird mit Tastatur und Maus geflogen und kehrt bei leerem Akku oder Funkverlust selbst zurück.
// Reine Logik ohne three.js (Weltkoordinaten in Metern, y nach oben), damit sie testbar ist.
import type { MachineState } from './machine';
import { mainPowerAvailable } from './machine';
import { SHELTER } from './weather';

export type DronePhase = 'docked' | 'spinup' | 'launch' | 'flying' | 'rtb' | 'landing';
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
  rtbReason: 'battery' | 'signal' | 'manual' | null;
};
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
  signalFull: 120,
  signalLost: 230,
  minBattery: 0.06,
  lowBattery: 0.2,
  spinup: 2.4,
  launch: 1.8,
  launchHeight: 3,
  maxAltitude: 60,
  minClearance: 0.6,
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
/** Nimmt die Drohne die Steuertasten (Mech steht dann still)? */
export const droneHasControls = (d: DroneState) => d.phase === 'flying';

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

/** Start, wenn angedockt; sonst Rückkehr anfordern. */
export function droneToggle(d: DroneState, s: MachineState): DroneState {
  if (d.phase === 'docked') return droneBlock(s, d) ? d : { ...d, phase: 'spinup', t: 0 };
  if (d.phase === 'flying') return { ...d, phase: 'rtb', t: 0, rtbReason: 'manual' };
  return d;
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
      if (n.t >= DRONE.launch) return { ...n, phase: 'flying', t: 0 };
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
    x: clamp(n.pos.x + n.vel.x * dt, -49, 49),
    y: n.pos.y + n.vel.y * dt,
    z: clamp(n.pos.z + n.vel.z * dt, -228, 12),
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
