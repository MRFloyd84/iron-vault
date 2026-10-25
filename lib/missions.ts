// Einsätze: Aufklären (Drohne erfasst Objekte), Zerstören (Ziele ausschalten), Erreichen
// (Wegpunkt) und Rückkehr zur Halle. Reine Logik ohne Three.js – die Szene liefert die
// Fakten (Lage, erfasste Objekte, zerstörte Ziele), hier wird nur ausgewertet.
import { site } from './terrain';
import { target, scanPoint } from './world-layout';

export type Objective =
  | { kind: 'reach'; id: string; label: string; x: number; z: number; r: number }
  | {
      kind: 'scan';
      id: string;
      label: string;
      point: string;
      /** Lage unbekannt: nur das Suchgebiet ist bekannt */
      area?: { x: number; z: number; r: number };
    }
  | {
      kind: 'destroy';
      id: string;
      label: string;
      target: string;
      /** Erst sichtbar, wenn diese Erfassung gelungen ist */
      revealedBy?: string;
    }
  | { kind: 'return'; id: string; label: string };

export type Mission = {
  id: string;
  title: string;
  type: string;
  brief: string;
  objectives: Objective[];
};

/** Halle: Rückkehrpunkt */
export const HANGAR_POINT = { x: 0, z: -12 } as const;
const ret: Objective = { kind: 'return', id: 'return', label: 'Zurück zur Halle' };
const depot = site('depot');

export const MISSIONS: Mission[] = [
  {
    id: 'patrol',
    title: 'ERSTER AUSSENEINSATZ',
    type: 'ERKUNDUNG',
    brief:
      'Die Funkverbindung zur Siedlung Kreuzweg ist abgerissen. Zum Kontrollpunkt am Kreuzweg laufen und mit der Drohne den Wasserturm der Siedlung aufklären. Danach zurück zur Halle.',
    objectives: [
      {
        kind: 'reach',
        id: 'checkpoint',
        label: 'Kontrollpunkt Kreuzweg erreichen',
        x: site('checkpoint').x,
        z: site('checkpoint').z,
        r: 32,
      },
      {
        kind: 'scan',
        id: 'tower',
        label: 'Wasserturm mit der Drohne erfassen',
        point: 'water-tower',
      },
      ret,
    ],
  },
  {
    id: 'refinery',
    title: 'TREIBSTOFFLAGER ASCHE-7',
    type: 'ZERSTÖREN',
    brief:
      'In der stillgelegten Raffinerie lagern noch drei volle Treibstofftanks. Sie dürfen nicht in fremde Hände fallen. Tanks A, B und C zerstören – Abstand halten, sie brennen heftig.',
    objectives: [
      { kind: 'destroy', id: 'tank-a', label: 'Tank A zerstören', target: 'tank-a' },
      { kind: 'destroy', id: 'tank-b', label: 'Tank B zerstören', target: 'tank-b' },
      { kind: 'destroy', id: 'tank-c', label: 'Tank C zerstören', target: 'tank-c' },
      ret,
    ],
  },
  {
    id: 'wreck',
    title: 'VERSCHOLLEN: IV-01',
    type: 'AUFKLÄRUNG',
    brief:
      'IV-01, das erste Fahrzeug der Baureihe, gilt seit einem Sandsturm als verschollen. Letzte Peilung: Dünenfeld im Nordwesten. Die Dünen sind für IV-04 zu steil – mit der Drohne suchen.',
    objectives: [
      {
        kind: 'scan',
        id: 'iv01',
        label: 'Wrack IV-01 finden und erfassen',
        point: 'iv01',
        area: { x: -535, z: -995, r: 170 },
      },
      ret,
    ],
  },
  {
    id: 'radio',
    title: 'FUNKSTATION KAMM',
    type: 'AUFKLÄREN + ZERSTÖREN',
    brief:
      'Von der Funkstation auf dem Kamm wird gestört. Zuerst Radar und Bunker mit der Drohne aufklären, dann Radaranlage und Sendemast ausschalten.',
    objectives: [
      { kind: 'scan', id: 'scan-radar', label: 'Radar erfassen', point: 'scan-radar' },
      { kind: 'scan', id: 'scan-bunker', label: 'Bunker erfassen', point: 'bunker' },
      { kind: 'destroy', id: 'radar', label: 'Radaranlage zerstören', target: 'radar' },
      { kind: 'destroy', id: 'mast', label: 'Sendemast zerstören', target: 'radio-mast' },
      ret,
    ],
  },
  {
    id: 'depot',
    title: 'DEPOT 4',
    type: 'AUFKLÄREN + ZERSTÖREN',
    brief:
      'Im Depot 4 stehen drei Lastwagen mit Munition, versteckt zwischen Containern. Mit der Drohne finden und erfassen, dann zerstören.',
    objectives: [
      ...[1, 2, 3].map((i): Objective => ({
        kind: 'scan',
        id: 'find-' + i,
        label: 'Lastwagen ' + i + ' finden',
        point: 'scan-truck-' + i,
        area: { x: depot.x + 8, z: depot.z - 6, r: 95 },
      })),
      ...[1, 2, 3].map((i): Objective => ({
        kind: 'destroy',
        id: 'truck-' + i,
        label: 'Lastwagen ' + i + ' zerstören',
        target: 'truck-' + i,
        revealedBy: 'find-' + i,
      })),
      ret,
    ],
  },
  {
    id: 'pipeline',
    title: 'PIPELINE',
    type: 'ZERSTÖREN',
    brief:
      'Die alte Pipeline zwischen Raffinerie und Förderanlage leckt. Alle vier Schieberstationen zerstören, damit nichts mehr nachläuft.',
    objectives: [
      ...[1, 2, 3, 4].map((i): Objective => ({
        kind: 'destroy',
        id: 'valve-' + i,
        label: 'Schieberstation ' + i + ' zerstören',
        target: 'valve-' + i,
      })),
      ret,
    ],
  },
];
export const mission = (id: string) => MISSIONS.find((m) => m.id === id) ?? null;

export type MissionProgress = {
  id: string;
  done: Record<string, boolean>;
  status: 'active' | 'complete';
  startedAt: number;
};
export type MissionFacts = {
  x: number;
  z: number;
  inHangar: boolean;
  scanned: (point: string) => boolean;
  destroyed: (target: string) => boolean;
};
export type MissionEvent =
  { type: 'objective'; id: string; label: string } | { type: 'complete'; title: string };

export const startMission = (id: string, time: number): MissionProgress => ({
  id,
  done: {},
  status: 'active',
  startedAt: time,
});

/** Alle Ziele der Mission ohne die Rückkehr erledigt? */
const fieldworkDone = (m: Mission, p: MissionProgress) =>
  m.objectives.every((o) => o.kind === 'return' || p.done[o.id]);

/** Ist das Ziel schon auf der Karte bekannt? */
export function objectiveVisible(o: Objective, m: Mission, p: MissionProgress) {
  if (p.done[o.id]) return false;
  if (o.kind === 'return') return fieldworkDone(m, p);
  if (o.kind === 'destroy' && o.revealedBy) return !!p.done[o.revealedBy];
  return true;
}

/** Ort eines Ziels: genaue Lage, Suchgebiet (unbekannte Lage) oder Halle. */
export function objectivePosition(o: Objective) {
  switch (o.kind) {
    case 'reach':
      return { x: o.x, z: o.z, r: o.r, exact: true };
    case 'scan': {
      if (o.area) return { ...o.area, exact: false };
      const p = scanPoint(o.point);
      return { x: p.x, z: p.z, r: 12, exact: true };
    }
    case 'destroy': {
      const t = target(o.target);
      return { x: t.x, z: t.z, r: 10, exact: true };
    }
    case 'return':
      return { ...HANGAR_POINT, r: 18, exact: true };
  }
}

/** Fortschritt auswerten. Rückkehr zählt erst, wenn alles andere erledigt ist. */
export function stepMission(p: MissionProgress, f: MissionFacts) {
  const m = mission(p.id);
  const events: MissionEvent[] = [];
  if (!m || p.status !== 'active') return { progress: p, events };
  let done = p.done;
  const finish = (o: Objective) => {
    done = { ...done, [o.id]: true };
    events.push({ type: 'objective', id: o.id, label: o.label });
  };
  for (const o of m.objectives) {
    if (done[o.id]) continue;
    if (o.kind === 'reach' && Math.hypot(f.x - o.x, f.z - o.z) <= o.r) finish(o);
    if (o.kind === 'scan' && f.scanned(o.point)) finish(o);
    if (o.kind === 'destroy' && f.destroyed(o.target)) finish(o);
  }
  let next: MissionProgress = done === p.done ? p : { ...p, done };
  const r = m.objectives.find((o) => o.kind === 'return');
  if (r && !done[r.id] && fieldworkDone(m, next) && f.inHangar) {
    finish(r);
    next = { ...next, done };
  }
  if (m.objectives.every((o) => done[o.id])) {
    next = { ...next, status: 'complete' };
    events.push({ type: 'complete', title: m.title });
  }
  return { progress: next, events };
}

/** Nächstes sichtbares Ziel (für Wegweiser und Radar). */
export function nextObjective(p: MissionProgress, x: number, z: number) {
  const m = mission(p.id);
  if (!m || p.status !== 'active') return null;
  let best: { objective: Objective; distance: number } | null = null;
  for (const o of m.objectives) {
    if (!objectiveVisible(o, m, p)) continue;
    const pos = objectivePosition(o);
    const d = Math.hypot(pos.x - x, pos.z - z);
    if (!best || d < best.distance) best = { objective: o, distance: d };
  }
  return best;
}

/** Ziele, die zu Beginn wieder aufgebaut werden. */
export const missionTargets = (m: Mission) =>
  m.objectives.flatMap((o) => (o.kind === 'destroy' ? [o.target] : []));
/** Aufklärungspunkte der Mission. */
export const missionScans = (m: Mission) =>
  m.objectives.flatMap((o) => (o.kind === 'scan' ? [o.point] : []));

/** Kompassrichtung (0 = Norden = −z) in Grad. */
export function bearing(fromX: number, fromZ: number, toX: number, toZ: number) {
  const deg = (Math.atan2(toX - fromX, -(toZ - fromZ)) * 180) / Math.PI;
  return (deg + 360) % 360;
}
