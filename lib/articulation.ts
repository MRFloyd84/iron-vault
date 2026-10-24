import type { MachineState } from './machine';
import { releaseBlock } from './mobility';
import { collisionAt } from './walking';

export const JOINTS = [
  'torso',
  'leftShoulder',
  'leftElbow',
  'rightShoulder',
  'rightElbow',
] as const;
export type Joint = (typeof JOINTS)[number];
export type JointPose = Record<Joint, number>;
export const JOINT_LIMITS: Record<Joint, readonly [number, number]> = {
  torso: [-45, 45],
  leftShoulder: [0, 40],
  rightShoulder: [0, 40],
  leftElbow: [0, 55],
  rightElbow: [0, 55],
};
export const RAD = Math.PI / 180;
export const neutralJoints = (): JointPose => ({
  torso: 0,
  leftShoulder: 0,
  leftElbow: 0,
  rightShoulder: 0,
  rightElbow: 0,
});
export type Articulation = { pose: JointPose; target: JointPose; input: JointPose; effort: number };
export const initialArticulation = (): Articulation => ({
  pose: neutralJoints(),
  target: neutralJoints(),
  input: neutralJoints(),
  effort: 0,
});
export const armsExtended = (pose: JointPose) =>
  JOINTS.some((k) => k !== 'torso' && pose[k] > 0.00001);
// Conservative swept arm envelope, verified against the actual GLB. Reserve
// it before extending, so an arm cannot start moving through a nearby wall.
export const ARM_RADIUS = 7.2;
export const TORSO_RADIUS = 5.2;
export const articulationRadius = (pose: JointPose) =>
  armsExtended(pose) ? ARM_RADIUS : Math.abs(pose.torso) > 0.00001 ? TORSO_RADIUS : 4.65;
export function articulationBlock(s: MachineState) {
  return (
    releaseBlock({ ...s, throttle: 0 }) ??
    (s.mobility.restraints !== 'released' ? 'Parkverriegelung zuerst lösen.' : null)
  );
}
export function stopArticulation(s: MachineState): MachineState {
  return {
    ...s,
    articulation: {
      ...s.articulation,
      input: neutralJoints(),
      target: { ...s.articulation.pose },
      effort: 0,
    },
  };
}
export function jointCommand(s: MachineState, joint: Joint | 'neutral', degrees = 0): MachineState {
  const block = articulationBlock(s);
  if (block) return { ...s, error: true, message: 'Gelenksteuerung gesperrt: ' + block };
  if (joint !== 'neutral' && !Number.isFinite(degrees)) return s;
  const target = { ...s.articulation.target };
  if (joint === 'neutral') Object.assign(target, neutralJoints());
  else {
    const [min, max] = JOINT_LIMITS[joint];
    target[joint] = Math.max(min, Math.min(max, degrees)) * RAD;
  }
  if (
    joint === 'torso' &&
    Math.abs(target.torso) > Math.abs(s.articulation.pose.torso) &&
    collisionAt(s.walk.x, s.walk.z, s.hangar.position, articulationRadius(target))
  )
    return {
      ...s,
      error: true,
      message:
        'Torso-Schwenkbereich blockiert. Grundstellung wählen oder mehr Abstand zu Hindernissen halten.',
    };
  if (
    joint !== 'torso' &&
    joint !== 'neutral' &&
    target[joint] > s.articulation.pose[joint] &&
    (s.walk.z > -45 || collisionAt(s.walk.x, s.walk.z, s.hangar.position, ARM_RADIUS))
  )
    return {
      ...s,
      error: true,
      message:
        'Arme nur im freien Testgelände anheben. Abstand zu Tor, Wänden und Hindernissen halten.',
    };
  return {
    ...s,
    articulation: { ...s.articulation, target, input: neutralJoints() },
    error: false,
    message:
      joint === 'neutral'
        ? 'Torso und Arme fahren kontrolliert in Grundstellung.'
        : 'Gelenkziel übernommen. Torso und Arme bewegen sich unabhängig von den Beinen.',
  };
}
export function jointInput(s: MachineState, input: JointPose): MachineState {
  const clean = neutralJoints();
  for (const k of JOINTS)
    clean[k] = Number.isFinite(input[k]) ? Math.max(-1, Math.min(1, input[k])) : 0;
  if (JOINTS.some((k) => clean[k]) && articulationBlock(s))
    return {
      ...stopArticulation(s),
      error: true,
      message: 'Gelenksteuerung gesperrt: ' + articulationBlock(s),
    };
  return { ...s, articulation: { ...s.articulation, input: clean } };
}
export function advanceArticulation(s: MachineState, dt: number): MachineState {
  if (dt <= 0) return s;
  if (articulationBlock(s)) return stopArticulation(s);
  const a = s.articulation,
    pose = { ...a.pose },
    target = { ...a.target };
  let effort = 0;
  for (const k of JOINTS) {
    const [min, max] = JOINT_LIMITS[k],
      rate = (k === 'torso' ? 18 : 24) * RAD * Math.min(1, s.actualPressure / 210),
      step = rate * Math.min(dt, 0.5);
    if (a.input[k])
      target[k] = Math.max(min * RAD, Math.min(max * RAD, pose[k] + a.input[k] * step));
    if (
      k === 'torso' &&
      Math.abs(target[k]) > Math.abs(pose[k]) &&
      collisionAt(s.walk.x, s.walk.z, s.hangar.position, articulationRadius(target))
    )
      target[k] = pose[k];
    if (
      k !== 'torso' &&
      target[k] > pose[k] &&
      (s.walk.z > -45 || collisionAt(s.walk.x, s.walk.z, s.hangar.position, ARM_RADIUS))
    )
      target[k] = pose[k];
    const delta = Math.max(-step, Math.min(step, target[k] - pose[k]));
    pose[k] += delta;
    effort += Math.abs(delta) / Math.max(step, 0.000001);
  }
  return { ...s, articulation: { pose, target, input: a.input, effort: Math.min(1, effort / 3) } };
}

// Same 100-ms timeline as walking; no new physics loop or frame-rate-dependent motion.
export class JointPresentation {
  private samples: { time: number; pose: JointPose }[] = [];
  private lastFrame = -Infinity;
  sample(source: JointPose, simAt: number, now: number, out: JointPose) {
    const time = simAt < 0 ? now : simAt,
      last = this.samples.at(-1);
    if (!last || now - this.lastFrame > 500 || time < last.time || time - last.time > 500)
      this.samples = [{ time, pose: { ...source } }];
    else if (time > last.time) {
      this.samples.push({ time, pose: { ...source } });
      if (this.samples.length > 6) this.samples.shift();
    }
    this.lastFrame = now;
    let a = this.samples[0],
      b = a;
    for (let i = 1; i < this.samples.length; i++) {
      b = this.samples[i];
      if (b.time >= now - 100) break;
      a = b;
    }
    const t = a === b ? 0 : Math.max(0, Math.min(1, (now - 100 - a.time) / (b.time - a.time)));
    for (const k of JOINTS) out[k] = a.pose[k] + (b.pose[k] - a.pose[k]) * t;
    return out;
  }
}
