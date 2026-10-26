import type { WalkState } from './walking';

export type WalkPose = Pick<
  WalkState,
  'x' | 'z' | 'yaw' | 'height' | 'pitch' | 'roll' | 'phase' | 'speed' | 'turnRate'
>;
const fields = ['x', 'z', 'yaw', 'height', 'pitch', 'roll', 'phase', 'speed', 'turnRate'] as const;
type Sample = { time: number; pose: WalkPose };

// Render the authoritative 70-ms simulation samples on a smooth timeline.
// Do not repeatedly ease toward each sample (that introduces a 14-Hz speed
// pulse), and never predict past a wall or an emergency stop.
export class WalkPresentation {
  readonly delay = 100;
  /** Bilder, für die noch kein neuerer Simulationsstand vorlag (Darstellung stand still) */
  starved = 0;
  private samples: Sample[] = [];
  private lastFrame = -Infinity;
  sample(source: WalkPose, simAt: number, now: number, out: WalkPose) {
    const time = simAt < 0 ? now : simAt;
    const latest = this.samples[this.samples.length - 1];
    if (!latest || now - this.lastFrame > 500 || time < latest.time || time - latest.time > 500) {
      this.samples.length = 0;
      this.samples.push({ time, pose: this.copy(source) });
    } else if (time > latest.time) {
      this.samples.push({ time, pose: this.copy(source) });
      if (this.samples.length > 6) this.samples.shift();
    }
    this.lastFrame = now;
    const target = now - this.delay;
    let a = this.samples[0],
      b = a;
    for (let i = 1; i < this.samples.length; i++) {
      b = this.samples[i];
      if (b.time >= target) break;
      a = b;
    }
    const t = a === b ? 0 : Math.max(0, Math.min(1, (target - a.time) / (b.time - a.time)));
    if (target > b.time && Math.abs(source.speed) + Math.abs(source.turnRate) > 0.01)
      this.starved++;
    for (const field of fields) out[field] = a.pose[field] + (b.pose[field] - a.pose[field]) * t;
    return out;
  }
  private copy(source: WalkPose) {
    return {
      x: source.x,
      z: source.z,
      yaw: source.yaw,
      height: source.height,
      pitch: source.pitch,
      roll: source.roll,
      phase: source.phase,
      speed: source.speed,
      turnRate: source.turnRate,
    };
  }
}
