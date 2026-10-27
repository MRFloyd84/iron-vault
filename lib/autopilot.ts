// Marschautopilot und Navigationsrechner (MCDU) von IV-04.
//
// Der Autopilot fasst die Laufsimulation nicht an: Er setzt nur die Eingabe (vor, drehen),
// die sonst von W/A/D kommt. Anfahren, Bremsen, Wenden, Hang und Kollision bleiben exakt
// wie beim Pilotenbetrieb – der Mech bleibt schwer.
//
// Bedienung wie ein Airbus-MCDU: Seitentasten (DIR, PROG, PERF, M-PLN, MSG), sechs
// Zeilentasten unter dem Bildschirm, CLR, AP, HOLD, SPD 1/2. Ein neues Ziel erscheint als
// vorläufiger Plan (TMPY, gelb) und wird erst mit *INSERT übernommen.
import type { MachineState } from './machine';
import { SITES } from './terrain';
import { WALK, fastAllowed, idleInput, walkBlock, type WalkInput } from './walking';
import { armsExtended } from './articulation';
import { NAV_MIN_Z, learnBlocked, planRoute, type Point } from './route-planner';

export type FmsPage = 'dir' | 'mpln' | 'prog' | 'perf' | 'msg';
export type Destination = { id: string; name: string; x: number; z: number };
export type MarchPlan = { dest: Destination; points: Point[]; length: number };
export type ApMode = 'off' | 'nav' | 'hold';
export type FmsState = {
  page: FmsPage;
  /** Erste angezeigte Zeile bzw. Seite (DIR, M-PLN, MSG) */
  scroll: number;
  plan: MarchPlan | null;
  tmpy: MarchPlan | null;
  /** Index des aktiven Wegpunkts (TO) in plan.points */
  leg: number;
  ap: ApMode;
  /** Geschwindigkeitsstufe des Autopiloten */
  gear: 1 | 2;
  preferRoads: boolean;
  /** Anhalten so viele Meter vor dem Ziel */
  stopDistance: number;
  brightness: number;
  /** Meldungsverlauf, neueste zuerst */
  log: { text: string; error: boolean }[];
  /** Aktuelles Einsatzziel und Kartenpunkt (von der Oberfläche gesetzt) */
  mission: Destination | null;
  mapPoint: Destination | null;
  /** Fortschrittskontrolle gegen Hängenbleiben */
  watch: { remaining: number; time: number };
  replans: number;
  /** Laufzeit des Autopiloten (s), für die Fortschrittskontrolle */
  clock: number;
};

export const MCDU_KEYS = [
  'DIR',
  'PROG',
  'PERF',
  'M-PLN',
  'MSG',
  'MAP',
  '◄',
  '►',
  '▲',
  '▼',
  'CLR',
  'RTB',
  'AP',
  'HOLD',
  'SPD 1',
  'SPD 2',
  'BRT',
  'DIM',
] as const;
/** Beschreibung beim Überfahren mit der Maus */
export const MCDU_KEY_HINT: Record<(typeof MCDU_KEYS)[number], string> = {
  DIR: 'DIR: Direktziel wählen',
  PROG: 'PROG: Fortschritt',
  PERF: 'PERF: Autopilot-Einstellungen',
  'M-PLN': 'M-PLN: Marschplan',
  MSG: 'MSG: Meldungen',
  MAP: 'MAP: Einsatzkarte',
  '◄': 'Vorherige Seite',
  '►': 'Nächste Seite',
  '▲': 'Nach oben blättern',
  '▼': 'Nach unten blättern',
  CLR: 'CLR: Entwurf bzw. Meldung löschen',
  RTB: 'RTB: Route zur Halle',
  AP: 'AP: Autopilot ein/aus',
  HOLD: 'HOLD: anhalten / weiter',
  'SPD 1': 'SPD 1: Autopilot im Schritt',
  'SPD 2': 'SPD 2: Autopilot im Eilmarsch',
  BRT: 'BRT: heller',
  DIM: 'DIM: dunkler',
};
/** Aktionsnummern: Funktionstasten 110–127, Zeilentasten 130–135 */
export const MCDU_KEY_ACTION = 110;
export const LSK_ACTION = 130;
export const MAP_ACTION = MCDU_KEY_ACTION + MCDU_KEYS.indexOf('MAP');
export const isMcduAction = (a: number) => a >= 110 && a <= 135;

/** Planungsradius: Torso gedreht plus Reserve (Arme müssen eingezogen sein). */
export const ROUTE_RADIUS = 6;
const SWITCH_RADIUS = 9;
const STUCK_SECONDS = 25;
const MAX_REPLANS = 4;
const STOP_OPTIONS = [10, 25, 50];
export const DIR_PAGE = 5;
export const FPLN_ROWS = 4;
export const MSG_ROWS = 5;

export const initialFms = (): FmsState => ({
  page: 'msg',
  scroll: 0,
  plan: null,
  tmpy: null,
  leg: 1,
  ap: 'off',
  gear: 1,
  preferRoads: true,
  stopDistance: 25,
  brightness: 1,
  log: [],
  mission: null,
  mapPoint: null,
  watch: { remaining: Infinity, time: 0 },
  replans: 0,
  clock: 0,
});

const SITE_NAMES: Record<string, string> = {
  refinery: 'RAFFINERIE',
  mine: 'FÖRDERANLAGE',
  radio: 'FUNKSTATION',
  depot: 'DEPOT 4',
  settlement: 'SIEDLUNG',
  checkpoint: 'KONTROLLPUNKT',
};
export const HANGAR_APRON: Destination = { id: 'hangar', name: 'HALLE', x: 0, z: -48 };
const FIXED: Destination[] = [
  ...SITES.map((s) => ({ id: s.id, name: SITE_NAMES[s.id] ?? s.name, x: s.x, z: s.z })),
  { id: 'range', name: 'TESTGELÄNDE', x: 0, z: -160 },
  HANGAR_APRON,
];

/** Ziele für DIR TO: Einsatzziel und Kartenpunkt zuerst, dann die Anlagen. */
export function destinations(f: FmsState): Destination[] {
  return [...(f.mission ? [f.mission] : []), ...(f.mapPoint ? [f.mapPoint] : []), ...FIXED];
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** Kurs (Grad, 0 = Norden = −z) */
export const courseTo = (from: Point, to: Point) =>
  ((Math.atan2(to.x - from.x, -(to.z - from.z)) * 180) / Math.PI + 360) % 360;
const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.z - a.z);

/** Restweg ab der aktuellen Position über die verbleibenden Wegpunkte. */
export function remaining(f: FmsState, pos: Point) {
  if (!f.plan) return 0;
  const p = f.plan.points;
  let d = dist(pos, p[Math.min(f.leg, p.length - 1)]);
  for (let i = Math.max(1, f.leg); i < p.length - 1; i++) d += dist(p[i], p[i + 1]);
  return d;
}

/** Höchstgeschwindigkeit, mit der der Autopilot plant (m/s). */
export function cruiseSpeed(s: MachineState) {
  const top = s.walk.gear === 2 && fastAllowed(s.walk.x, s.walk.z) ? WALK.fastSpeed : WALK.maxSpeed;
  return top * Math.max(0.25, s.throttle);
}

/** Querablage zur aktiven Strecke (m, + = rechts der Strecke). */
export function crossTrack(f: FmsState, pos: Point) {
  if (!f.plan || f.leg < 1) return 0;
  const a = f.plan.points[f.leg - 1],
    b = f.plan.points[f.leg];
  const dx = b.x - a.x,
    dz = b.z - a.z,
    len = Math.hypot(dx, dz) || 1;
  return ((pos.z - a.z) * dx - (pos.x - a.x) * dz) / len;
}

const withFms = (s: MachineState, fms: Partial<FmsState>): MachineState => ({
  ...s,
  fms: { ...s.fms, ...fms },
});
const say = (s: MachineState, message: string, error = false): MachineState => ({
  ...s,
  message,
  error,
});

/** Autopilot trennen (Pilot übernimmt, Fehler oder Ziel erreicht). */
export function disengage(s: MachineState, message: string, error = false): MachineState {
  if (s.fms.ap === 'off') return s;
  return say(
    {
      ...withFms(s, { ap: 'off' }),
      walk: { ...s.walk, input: idleInput() },
    },
    message,
    error,
  );
}

function plan(s: MachineState, dest: Destination): MarchPlan | null {
  const r = planRoute({ x: s.walk.x, z: s.walk.z }, dest, ROUTE_RADIUS, s.fms.preferRoads);
  return r ? { dest, points: r.points, length: r.length } : null;
}

function engage(s: MachineState): MachineState {
  const f = s.fms;
  if (!f.plan) return say(s, 'Autopilot: kein Marschplan. Ziel mit DIR wählen.', true);
  if (s.walk.z > NAV_MIN_Z - 2)
    return say(s, 'Autopilot erst außerhalb der Halle. Durchs Tor auf den Hof gehen.', true);
  const block = walkBlock(s);
  if (block) return say(s, 'Autopilot nicht verfügbar: ' + block, true);
  if (armsExtended(s.articulation.pose))
    return say(s, 'Autopilot: Arme zuerst einziehen (Gelenke neutral).', true);
  // Immer ab der aktuellen Position neu planen – der Mech kann seit der Planung gegangen sein.
  const fresh = plan(s, f.plan.dest);
  if (!fresh)
    return say(s, 'Autopilot: keine begehbare Route nach ' + f.plan.dest.name + '.', true);
  return say(
    {
      ...withFms(s, {
        ap: 'nav',
        plan: fresh,
        leg: 1,
        replans: 0,
        watch: { remaining: fresh.length, time: f.clock },
      }),
      walk: { ...s.walk, gear: f.gear },
    },
    'Autopilot ein: NAV nach ' + fresh.dest.name + ', Stufe ' + f.gear + '.',
  );
}

/** Tasten und Zeilentasten des MCDU. */
export function fmsCommand(s: MachineState, action: number): MachineState {
  const f = s.fms;
  const key = action < LSK_ACTION ? MCDU_KEYS[action - MCDU_KEY_ACTION] : null;
  const page = (p: FmsPage) => withFms(s, { page: p, scroll: 0 });
  switch (key) {
    case 'DIR':
      return page('dir');
    case 'PROG':
      return page('prog');
    case 'PERF':
      return page('perf');
    case 'M-PLN':
      return page('mpln');
    case 'MSG':
      return page('msg');
    case 'MAP':
      return s; // öffnet die Einsatzkarte (Oberfläche)
    case '◄':
    case '▲':
      return withFms(s, { scroll: Math.max(0, f.scroll - 1) });
    case '►':
    case '▼':
      return withFms(s, { scroll: Math.min(scrollLimit(f), f.scroll + 1) });
    case 'CLR':
      if (f.tmpy) return withFms(s, { tmpy: null });
      return { ...s, message: '', error: false };
    case 'RTB': {
      const tmpy = plan(s, HANGAR_APRON);
      if (!tmpy) return say(s, 'Keine begehbare Route zur Halle.', true);
      return withFms(s, { tmpy, page: 'mpln', scroll: 0 });
    }
    case 'AP':
      if (f.ap === 'off') return engage(s);
      return disengage(s, 'Autopilot aus.');
    case 'HOLD':
      if (f.ap === 'off') return say(s, 'HOLD nur mit eingeschaltetem Autopiloten.', true);
      return say(
        withFms(s, { ap: f.ap === 'hold' ? 'nav' : 'hold' }),
        f.ap === 'hold' ? 'Autopilot: Marsch fortgesetzt.' : 'Autopilot: HOLD, Mech hält an.',
      );
    case 'SPD 1':
    case 'SPD 2': {
      const gear = key === 'SPD 1' ? 1 : 2;
      return say(
        { ...withFms(s, { gear }), walk: { ...s.walk, gear } },
        gear === 2 ? 'Autopilot-Stufe 2: Eilmarsch.' : 'Autopilot-Stufe 1: Schritt.',
      );
    }
    case 'BRT':
      return withFms(s, { brightness: Math.min(1, f.brightness + 0.15) });
    case 'DIM':
      return withFms(s, { brightness: Math.max(0.25, f.brightness - 0.15) });
  }
  return lineSelect(s, action - LSK_ACTION);
}

function scrollLimit(f: FmsState) {
  if (f.page === 'dir') return Math.max(0, Math.ceil(destinations(f).length / DIR_PAGE) - 1);
  if (f.page === 'mpln') {
    const n = (f.tmpy ?? f.plan)?.points.length ?? 0;
    return Math.max(0, n - FPLN_ROWS);
  }
  if (f.page === 'msg') return Math.max(0, f.log.length - MSG_ROWS);
  return 0;
}

/** Zeilentaste 1–6 (Index 0–5) auf der aktuellen Seite. */
function lineSelect(s: MachineState, line: number): MachineState {
  const f = s.fms;
  if (f.page === 'dir') {
    if (line >= DIR_PAGE) return withFms(s, { scroll: (f.scroll + 1) % (scrollLimit(f) + 1) });
    const dest = destinations(f)[f.scroll * DIR_PAGE + line];
    if (!dest) return s;
    const tmpy = plan(s, dest);
    if (!tmpy) return say(s, 'Keine begehbare Route nach ' + dest.name + '.', true);
    return withFms(s, { tmpy, page: 'mpln', scroll: 0 });
  }
  if (f.page === 'mpln' && line === 5) {
    if (!f.tmpy) return s;
    // *INSERT: vorläufigen Plan übernehmen; ein laufender Autopilot folgt sofort dem neuen
    const next = withFms(s, { plan: f.tmpy, tmpy: null, leg: 1, replans: 0 });
    return f.ap === 'off'
      ? say(next, 'Marschplan nach ' + f.tmpy.dest.name + ' übernommen. AP zum Starten.')
      : engage(withFms(next, { ap: 'off' }));
  }
  if (f.page === 'perf') {
    if (line === 0)
      return fmsCommand(s, MCDU_KEY_ACTION + MCDU_KEYS.indexOf(f.gear === 1 ? 'SPD 2' : 'SPD 1'));
    if (line === 1) return withFms(s, { preferRoads: !f.preferRoads });
    if (line === 2)
      return withFms(s, {
        stopDistance:
          STOP_OPTIONS[(STOP_OPTIONS.indexOf(f.stopDistance) + 1) % STOP_OPTIONS.length],
      });
  }
  if (f.page === 'prog' && line === 5)
    return fmsCommand(s, MCDU_KEY_ACTION + MCDU_KEYS.indexOf('HOLD'));
  if (f.page === 'msg' && line === 5)
    return withFms({ ...s, message: '', error: false }, { log: [] });
  return s;
}

/** Meldung in den Verlauf übernehmen (von der Oberfläche bei jeder neuen Meldung). */
export function logMessage(s: MachineState): MachineState {
  if (!s.message || s.fms.log[0]?.text === s.message) return s;
  return withFms(s, { log: [{ text: s.message, error: s.error }, ...s.fms.log].slice(0, 20) });
}

/**
 * Ein Simulationsschritt des Autopiloten: setzt die Laufeingabe für advanceWalking.
 * Bahnführung nach "Pure Pursuit" mit Vorausschau, Tempo nach Kurskorrektur, nächster
 * Kurve und Restweg (Bremsweg der echten Laufsimulation).
 */
export function autopilotStep(s: MachineState, dt: number): MachineState {
  const f = s.fms;
  if (f.ap === 'off' || !f.plan) return s;
  const clock = f.clock + dt;
  const block = walkBlock(s);
  if (block) return disengage(s, 'Autopilot getrennt: ' + block, true);
  const pos = { x: s.walk.x, z: s.walk.z };
  const pts = f.plan.points;
  // Hängen geblieben (Hindernis oder Hang): Stelle sperren und neu planen
  if (s.walk.blocked && f.ap === 'nav') {
    if (f.replans >= MAX_REPLANS)
      return disengage(s, 'Autopilot getrennt: Weg blockiert (' + s.walk.blocked + ').', true);
    learnBlocked(pos.x - Math.sin(s.walk.yaw) * 7, pos.z - Math.cos(s.walk.yaw) * 7);
    const fresh = plan(s, f.plan.dest);
    if (!fresh) return disengage(s, 'Autopilot getrennt: keine Umgehung gefunden.', true);
    return say(
      withFms(s, { plan: fresh, leg: 1, replans: f.replans + 1, clock }),
      'Autopilot: ' + s.walk.blocked + ' – neue Route.',
    );
  }
  // Wegpunkt weiterschalten: nah genug oder schon am Ende der Strecke vorbei
  let leg = Math.min(Math.max(1, f.leg), pts.length - 1);
  while (leg < pts.length - 1) {
    const a = pts[leg - 1],
      b = pts[leg];
    const along =
      ((pos.x - a.x) * (b.x - a.x) + (pos.z - a.z) * (b.z - a.z)) / (dist(a, b) ** 2 || 1);
    if (dist(pos, b) < SWITCH_RADIUS || along > 1) leg++;
    else break;
  }
  const next = { ...f, leg, clock };
  const rest = remaining(next, pos);
  // Ziel erreicht
  if (rest <= f.stopDistance + 1.5) {
    if (Math.abs(s.walk.speed) < 0.05)
      // Plan ist abgeflogen: löschen, damit Karte und Radar keine alte Linie zeigen
      return disengage(
        withFms(s, { plan: null, leg: 1, clock }),
        'Ziel erreicht: ' + f.plan.dest.name + '.',
      );
  }
  // Fortschrittskontrolle
  let watch = f.watch;
  if (rest < watch.remaining - 3) watch = { remaining: rest, time: clock };
  else if (f.ap === 'nav' && clock - watch.time > STUCK_SECONDS)
    return disengage(s, 'Autopilot getrennt: kein Fortschritt.', true);
  if (f.ap === 'hold') watch = { remaining: rest, time: clock };
  const input = f.ap === 'hold' ? idleInput() : steer(s, next, pos, rest);
  return {
    ...s,
    fms: { ...next, watch },
    walk: { ...s.walk, input },
  };
}

/** Punkt auf der Route `ahead` Meter hinter der Projektion der aktuellen Position. */
function lookahead(pts: Point[], leg: number, pos: Point, ahead: number) {
  const a = pts[leg - 1],
    b = pts[leg];
  const l = dist(a, b) || 1;
  const t = Math.max(
    0,
    Math.min(1, ((pos.x - a.x) * (b.x - a.x) + (pos.z - a.z) * (b.z - a.z)) / l ** 2),
  );
  let x = a.x + (b.x - a.x) * t,
    z = a.z + (b.z - a.z) * t,
    left = ahead;
  for (let i = leg; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - x, pts[i].z - z);
    if (seg >= left) {
      const k = left / seg;
      return { x: x + (pts[i].x - x) * k, z: z + (pts[i].z - z) * k };
    }
    left -= seg;
    x = pts[i].x;
    z = pts[i].z;
  }
  return pts[pts.length - 1];
}

function steer(s: MachineState, f: FmsState, pos: Point, rest: number): WalkInput {
  const w = s.walk;
  const pts = f.plan!.points;
  const throttle = Math.max(0.01, s.throttle);
  const turnMax = WALK.turnSpeed * Math.sqrt(throttle);
  const top = (w.gear === 2 && fastAllowed(w.x, w.z) ? WALK.fastSpeed : WALK.maxSpeed) * throttle;
  const ahead = Math.max(9, Math.min(20, 6 + 3 * Math.abs(w.speed)));
  const aim = lookahead(pts, f.leg, pos, Math.min(ahead, rest));
  const want = Math.atan2(-(aim.x - pos.x), -(aim.z - pos.z));
  const error = wrap(want - w.yaw);
  // Drehen: proportional zur Kursabweichung, gedämpft durch die aktuelle Drehrate
  const rate = Math.max(-turnMax, Math.min(turnMax, 0.9 * error - 0.6 * w.turnRate));
  // Tempo: große Kursabweichung → erst auf der Stelle drehen
  let speed = top * Math.max(0, Math.min(1, 1.25 - Math.abs(error) / 0.7));
  if (Math.abs(error) > 1.0) speed = 0;
  // Nächste Kurve: Winkel am aktiven Wegpunkt, erreichbares Tempo dort und Bremsweg davor
  if (f.leg < pts.length - 1) {
    const a = pts[f.leg - 1],
      b = pts[f.leg],
      c = pts[f.leg + 1];
    const turn = Math.abs(
      wrap(Math.atan2(c.x - b.x, c.z - b.z) - Math.atan2(b.x - a.x, b.z - a.z)),
    );
    const corner = Math.max(0.9, Math.min(top, (turnMax * 22) / (turn + 0.25)));
    const toCorner = Math.max(0, dist(pos, b) - SWITCH_RADIUS);
    speed = Math.min(speed, Math.sqrt(corner ** 2 + 2 * WALK.brake * 0.7 * toCorner));
  }
  // Am Ziel: rechtzeitig mit der normalen Bremsverzögerung anhalten
  const toStop = Math.max(0, rest - f.stopDistance);
  speed = Math.min(speed, Math.sqrt(2 * WALK.brake * 0.75 * toStop));
  if (toStop < 0.5) speed = 0;
  const topForward =
    (w.gear === 2 && fastAllowed(w.x, w.z) ? WALK.fastSpeed : WALK.maxSpeed) * throttle;
  return {
    forward: Math.max(0, Math.min(1, speed / topForward)),
    turn: Math.max(-1, Math.min(1, rate / turnMax)),
    brake: false,
  };
}

/** Kurztext für Anzeigen: "NAV RAFFINERIE · 640 m". */
export function apSummary(s: MachineState) {
  const f = s.fms;
  if (f.ap === 'off' || !f.plan) return null;
  return {
    mode: f.ap === 'hold' ? 'HOLD' : 'NAV',
    dest: f.plan.dest.name,
    remaining: remaining(f, { x: s.walk.x, z: s.walk.z }),
  };
}
