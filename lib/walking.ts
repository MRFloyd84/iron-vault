import type { MachineState } from './machine';
import { releaseBlock } from './mobility';
import { articulationRadius } from './articulation';

export type WalkInput = { forward: number; turn: number; brake: boolean };
export type WalkState = {
  x: number;
  z: number;
  yaw: number;
  speed: number;
  turnRate: number;
  height: number;
  pitch: number;
  roll: number;
  distance: number;
  phase: number;
  step: number;
  effort: number;
  sway: number;
  blocked: string;
  input: WalkInput;
};
export const WALK = {
  radius: 4.65,
  originZ: 1.3,
  maxSpeed: 2.2,
  reverseSpeed: 1.1,
  turnSpeed: 0.28,
  accel: 0.65,
  brake: 1.3,
  emergencyBrake: 3.5,
  stride: 2.6,
};
export const idleInput = (): WalkInput => ({ forward: 0, turn: 0, brake: false });
export const initialWalk = (): WalkState => ({
  x: 0,
  z: WALK.originZ,
  yaw: 0,
  speed: 0,
  turnRate: 0,
  height: 0,
  pitch: 0,
  roll: 0,
  distance: 0,
  phase: 0,
  step: 0,
  effort: 0,
  sway: 0.4,
  blocked: '',
  input: idleInput(),
});
export const walkingStopped = (s: MachineState) =>
  Math.abs(s.walk.speed) < 0.02 && Math.abs(s.walk.turnRate) < 0.005;
export const atServiceBay = (s: MachineState) =>
  Math.hypot(s.walk.x, s.walk.z - WALK.originZ) < 2 && walkingStopped(s);
export const walkBlock = (s: MachineState) =>
  releaseBlock({ ...s, throttle: 0 }) ??
  (s.mobility.restraints !== 'released'
    ? 'Parkverriegelung zuerst lösen.'
    : s.throttle <= 0
      ? 'Leistungsbegrenzung auf mindestens 25 % stellen.'
      : null);
export const actualDriveLoad = (s: MachineState) =>
  s.mobility.restraints === 'locked' ? s.throttle : s.walk.effort;
export function walkInput(s: MachineState, input: WalkInput): MachineState {
  const clean = {
    forward: Math.max(-1, Math.min(1, input.forward)),
    turn: Math.max(-1, Math.min(1, input.turn)),
    brake: input.brake,
  };
  const reason = (clean.forward || clean.turn) && !clean.brake ? walkBlock(s) : null;
  return {
    ...s,
    walk: { ...s.walk, input: clean },
    ...(reason ? { error: true, message: 'Gehen gesperrt: ' + reason } : {}),
  };
}
export function walkSetting(s: MachineState, action: number): MachineState {
  if (action === 94)
    return {
      ...s,
      walk: { ...s.walk, sway: s.walk.sway === 0 ? 0.4 : s.walk.sway === 0.4 ? 0.8 : 0 },
      message:
        'Schrittbewegung: ' +
        (s.walk.sway === 0 ? 'DEZENT' : s.walk.sway === 0.4 ? 'STARK' : 'AUS'),
      error: false,
    };
  if (action === 93) return { ...s, mobility: { ...s.mobility, page: 'walk' }, error: false };
  return s;
}
// Conservative ground footprints, in metres; matched to the hall and yard geometry.
// Ramp tops are traversable. Solid sidewalls reject side entry via height continuity.
type Obstacle = { x: number; z: number; w: number; d: number; angle?: number; label: string };
/** IV-02, abgestelltes Schwesterschiff vor der Werkstatt (Grafik in sister-mech.ts). */
export const SISTER = { x: 37, z: -83, angle: -Math.PI / 2 } as const;
/** Fahrzeugwracks am Schießstand (Mittelpunkt, Drehung); Grafik in firing-range.ts. */
export const WRECKS = [
  { x: -31, z: -192, angle: 0.35 },
  { x: 30, z: -168, angle: -0.6 },
] as const;
export const WALK_OBSTACLES: Obstacle[] = [
  ...[-1, 1].flatMap((side) => [
    { x: side * 7, z: -22, w: 4.2, d: 16, label: 'Wartungsplattform' },
    { x: side * 7, z: -11.9, w: 2.2, d: 4.9, label: 'Wartungstreppe' },
    { x: side * 8.8, z: -31.3, w: 3.6, d: 3.4, label: 'Torplattform' },
    { x: side * 10, z: -24, w: 2, d: 3, label: 'Versorgung' },
    ...[-30, -20, -10, 0, 9.6].map((z) => ({
      x: side * 12,
      z,
      w: 1.4,
      d: 1.3,
      label: 'Hallensäule',
    })),
    ...[-65, -87, -109, -131, -153].map((z) => ({
      x: side * 9.7,
      z,
      w: 0.84,
      d: 3.1,
      label: 'Betonbarriere',
    })),
    ...[-59, -139].map((z) => ({ x: side * 19, z, w: 1.15, d: 1.15, label: 'Lichtmast' })),
  ]),
  ...[
    [-22, -67],
    [-29, -82],
    [24, -75],
    [25, -116],
  ].map(([x, z]) => ({ x, z, w: 6.06, d: 2.44, angle: x === 24 ? -0.3 : 0, label: 'Container' })),
  { x: 39, z: -104, w: 21, d: 21, label: 'Werkstatt' },
  { x: -35, z: -110, w: 3, d: 41, label: 'Rohrleitung' },
  ...[-6, -2, 2, 6].map((x) => ({ x, z: -228, w: 3.1, d: 0.84, label: 'Streckenende' })),
  ...[-85, -135, -185].map((z) => ({ x: 11, z, w: 0.3, d: 0.3, label: 'Entfernungsmarkierung' })),
  // Gehhindernis: gleiche Drehrichtung wie die Grafik (dort rotation.y = angle).
  ...WRECKS.map((w) => ({
    x: w.x,
    z: w.z,
    w: 3.4,
    d: 7.4,
    angle: w.angle,
    label: 'Fahrzeugwrack',
  })),
  // IV-02 mit abgelegtem Arm, Schild und Absperrung (lokal 17,5 × 9 m, Mitte leicht versetzt)
  {
    x: SISTER.x - 1.8,
    z: SISTER.z - 0.25,
    w: 17.5,
    d: 9,
    angle: SISTER.angle,
    label: 'IV-02 (abgestellt)',
  },
];
function circleBox(x: number, z: number, o: Obstacle, r: number) {
  const dx = x - o.x,
    dz = z - o.z,
    a = o.angle ?? 0,
    c = Math.cos(a),
    sn = Math.sin(a);
  const lx = c * dx - sn * dz,
    lz = sn * dx + c * dz;
  const ex = Math.max(0, Math.abs(lx) - o.w / 2),
    ez = Math.max(0, Math.abs(lz) - o.d / 2);
  return ex * ex + ez * ez < r * r;
}
export function collisionAt(x: number, z: number, gate: number, r = WALK.radius): string | null {
  if (z > 10.6 - r) return 'Hangarrückwand';
  if (z > -35 - r && Math.abs(x) > 17.6 - r) return 'Hangarseitenwand';
  if (Math.abs(z + 34.6) < r + 0.35) {
    if (Math.abs(x) + r > 6.9) return 'Torrahmen';
    if (Math.abs(x) + r > gate * 7.2) return 'Hangartor';
  }
  if (z < -225 || Math.abs(x) > 49) return 'Geländegrenze';
  for (const o of WALK_OBSTACLES) if (circleBox(x, z, o, r)) return o.label;
  return null;
}
export function groundHeight(x: number, z: number) {
  if (Math.abs(x) <= 5.5 && z <= -105 && z >= -137)
    return z >= -117 ? (-105 - z) * 0.15 : z >= -125 ? 1.8 : (z + 137) * 0.15;
  if (x >= -21.5 && x <= -12.5)
    for (let i = 0; i < 9; i++)
      if (Math.abs(z - (-105 - i * 1.65)) < 0.25) return 0.14 + (i % 3) * 0.06;
  return 0;
}
function floorPose(x: number, z: number, yaw: number) {
  // Two support regions smooth the step onto a ramp while retaining pitch and roll.
  const sx = Math.cos(yaw) * 1.8,
    sz = -Math.sin(yaw) * 1.8,
    fx = -Math.sin(yaw) * 1.6,
    fz = -Math.cos(yaw) * 1.6;
  const front =
    (groundHeight(x + fx + sx, z + fz + sz) + groundHeight(x + fx - sx, z + fz - sz)) / 2;
  const back =
    (groundHeight(x - fx + sx, z - fz + sz) + groundHeight(x - fx - sx, z - fz - sz)) / 2;
  const left =
    (groundHeight(x + fx - sx, z + fz - sz) + groundHeight(x - fx - sx, z - fz - sz)) / 2;
  const right =
    (groundHeight(x + fx + sx, z + fz + sz) + groundHeight(x - fx + sx, z - fz + sz)) / 2;
  return {
    height: (front + back) / 2,
    pitch: Math.atan2(front - back, 3.2),
    roll: Math.atan2(right - left, 3.6),
  };
}
const approach = (a: number, b: number, step: number) => a + Math.max(-step, Math.min(step, b - a));
export function advanceWalking(state: MachineState, dt: number): MachineState {
  if (dt <= 0) return state;
  const w = { ...state.walk };
  const permitted = !walkBlock(state),
    input = w.input;
  const demand = permitted && !input.brake;
  const forward = demand ? input.forward : 0,
    turn = demand ? input.turn : 0;
  const target = forward * (forward < 0 ? WALK.reverseSpeed : WALK.maxSpeed) * state.throttle;
  const targetTurn = turn * WALK.turnSpeed * Math.sqrt(state.throttle);
  const steps = Math.max(1, Math.ceil(Math.min(0.5, dt) / 0.025)),
    h = Math.min(0.5, dt) / steps;
  let obstruction = '';
  for (let i = 0; i < steps; i++) {
    const reversing = w.speed * target < 0,
      slowing = Math.abs(target) < Math.abs(w.speed) || reversing;
    w.speed = approach(
      w.speed,
      reversing ? 0 : target,
      (!permitted || input.brake ? WALK.emergencyBrake : slowing ? WALK.brake : WALK.accel) * h,
    );
    w.turnRate = approach(w.turnRate, targetTurn, h * (!permitted || input.brake ? 1.1 : 0.35));
    const yaw = w.yaw + w.turnRate * h,
      dx = -Math.sin(yaw) * w.speed * h,
      dz = -Math.cos(yaw) * w.speed * h;
    const x = w.x + dx,
      z = w.z + dz,
      pose = floorPose(x, z, yaw);
    const obstacle = collisionAt(
      x,
      z,
      state.hangar.position,
      articulationRadius(state.articulation.pose),
    );
    // Reject ramp sidewalls; entering via either graded end stays below this slope.
    const jump = Math.abs(groundHeight(x, z) - groundHeight(w.x, w.z));
    if ((Math.abs(w.speed) > 0.0001 || Math.abs(w.turnRate) > 0.0001) && (obstacle || jump > 0.3)) {
      obstruction = obstacle ?? 'Rampenseitenwand';
      w.speed = 0;
      w.turnRate = 0;
    } else {
      w.x = x;
      w.z = z;
      w.yaw = yaw;
      const distance = Math.hypot(dx, dz);
      w.distance += distance;
      const stepTravel = distance + Math.abs(w.turnRate) * h * 1.5;
      w.phase += stepTravel / WALK.stride;
      w.step = Math.floor(w.phase * 2);
      w.height = pose.height;
      w.pitch = pose.pitch;
      w.roll = pose.roll;
    }
  }
  w.effort = Math.min(
    1,
    (Math.abs(w.speed) / WALK.maxSpeed) * 0.72 +
      (Math.abs(w.turnRate) / WALK.turnSpeed) * 0.2 +
      Math.max(0, Math.sin(w.pitch) * Math.sign(w.speed)) * Math.abs(w.speed) * 0.8,
  );
  w.blocked = obstruction;
  const newBlock = obstruction && obstruction !== state.walk.blocked;
  return {
    ...state,
    walk: w,
    ...(newBlock
      ? {
          error: true,
          message: obstruction + ' – Bewegung angehalten. Zurücksetzen oder neu ausrichten.',
        }
      : {}),
  };
}
