import { loadAudio, decodeAudio } from './audio-assets';
import { AUDIO_LEVELS as LEVEL, ambientGain } from './audio-mix';
import type { MachineState } from './machine';
import { EffectChannel } from './machine-effects';
import { batteryUsable, dcSupply, unacknowledgedServiceAlerts, leakRate } from './service-systems';

const FILES = {
  pump: 'coolant-pump-loop.ogg',
  on: 'contactor-on.ogg',
  off: 'contactor-off.ogg',
  warning: 'service-warning-loop.ogg',
  leak: 'coolant-leak-loop.ogg',
  calibration: 'neuro-calibration-loop.ogg',
  lock: 'parking-lock-latch.ogg',
  gate: 'hangar-door-loop.ogg',
} as const;
type Sound = keyof typeof FILES;
type Bytes = Record<Sound, Promise<ArrayBuffer | null>>;
export function preloadServiceAudio(): Bytes {
  return Object.fromEntries(
    Object.entries(FILES).map(([key, file]) => [key, loadAudio(file)]),
  ) as Bytes;
}
function contacts(s: MachineState) {
  return [
    s.overhead.battery1 && batteryUsable(s, 0),
    s.overhead.battery2 && batteryUsable(s, 1),
    s.service.groundConnected && !s.service.trips.ground,
    s.overhead.apuGen && s.overhead.apuPhase === 'running' && !s.service.trips.apu,
    s.overhead.mainGen && s.stage >= 4 && !s.service.trips.main,
    s.stage > 0 || s.busy === 0,
  ];
}
export class ServiceAudio {
  private channels: Record<
    'pumpA' | 'pumpB' | 'on' | 'off' | 'warning' | 'leak' | 'calibration' | 'lock' | 'gate',
    EffectChannel
  >;
  private previous: MachineState | null = null;
  private event: { id: string; at: number; kind: 'on' | 'off' } | null = null;
  private lockEvent: { id: string; at: number } | null = null;
  private calibrationSerial = 0;
  private serial = 0;
  private ctx: AudioContext;
  constructor(ctx: AudioContext, output: AudioNode, bytes: Bytes) {
    this.ctx = ctx;
    const buffers = Object.fromEntries(
      Object.keys(FILES).map((key) => [
        key,
        bytes[key as Sound]
          .then((data) => decodeAudio(ctx, data, FILES[key as Sound]))
          .catch(() => null),
      ]),
    ) as Record<Sound, Promise<AudioBuffer | null>>;
    this.channels = {
      pumpA: new EffectChannel(ctx, output, buffers.pump),
      pumpB: new EffectChannel(ctx, output, buffers.pump),
      on: new EffectChannel(ctx, output, buffers.on),
      off: new EffectChannel(ctx, output, buffers.off),
      warning: new EffectChannel(ctx, output, buffers.warning),
      leak: new EffectChannel(ctx, output, buffers.leak),
      calibration: new EffectChannel(ctx, output, buffers.calibration),
      lock: new EffectChannel(ctx, output, buffers.lock),
      gate: new EffectChannel(ctx, output, buffers.gate),
    };
  }
  update(s: MachineState) {
    const previous = this.previous;
    this.previous = s;
    if (previous) {
      const old = contacts(previous),
        now = contacts(s);
      if (now.some((closed, i) => closed !== old[i])) {
        const kind = now.some((closed, i) => closed && !old[i]) ? 'on' : 'off';
        this.event = { id: 'contactor-' + ++this.serial, at: this.ctx.currentTime, kind };
      }
    }
    for (const kind of ['on', 'off'] as const) {
      const e = this.event,
        offset = e ? this.ctx.currentTime - e.at : 0;
      this.channels[kind].set(
        e?.kind === kind && offset < 0.6 ? { id: e.id, offset, volume: 1.2, attack: 0.002 } : null,
      );
    }
    const m = s.mobility,
      old = previous?.mobility;
    const calibrating =
      m.calibration === 'running' && m.helmet && dcSupply(s) && s.overhead.avionics;
    if (calibrating && (!old || old.calibration !== 'running' || m.elapsed < old.elapsed))
      this.calibrationSerial++;
    this.channels.calibration.set(
      calibrating
        ? {
            id: 'calibration-' + this.calibrationSerial,
            offset: m.elapsed,
            loop: true,
            volume: LEVEL.calibration,
            attack: 0.06,
            smoothing: 0.1,
          }
        : null,
    );
    // Latch only on completion, including spring-applied emergency closure.
    // A rejected command or initial cold state never produces a locking sound.
    if (
      old &&
      ((old.restraints === 'releasing' && m.restraints === 'released') ||
        (old.restraints === 'locking' && m.restraints === 'locked'))
    ) {
      this.lockEvent = { id: 'parking-latch-' + ++this.serial, at: this.ctx.currentTime };
    } else if (old && old.restraints !== m.restraints) this.lockEvent = null;
    const latch = this.lockEvent,
      latchOffset = latch ? this.ctx.currentTime - latch.at : 0;
    this.channels.lock.set(
      latch && latchOffset < 1
        ? { id: latch.id, offset: latchOffset, volume: 1.05, attack: 0.002 }
        : null,
    );
    for (const [id, flow, offset] of [
      ['pumpA', s.service.pumpAFlow, 0],
      ['pumpB', s.service.pumpBFlow, 2.1],
    ] as const) {
      const speed = Math.max(0, Math.min(1, flow / 62));
      this.channels[id].set(
        flow > 0.08
          ? {
              id,
              offset,
              loop: true,
              volume: speed * LEVEL.pump * ambientGain(s),
              rate: 0.72 + speed * 0.3,
              attack: 0.25,
              smoothing: 0.3,
            }
          : null,
      );
    }
    const gate = s.hangar;
    this.channels.gate.set(
      gate.gate === 'opening' || gate.gate === 'closing'
        ? {
            id: 'gate-' + gate.gate,
            offset: (gate.gate === 'opening' ? gate.position : 1 - gate.position) * 10,
            loop: true,
            rate: 1,
            volume: LEVEL.gate,
            attack: 0.3,
          }
        : null,
    );
    const loss = leakRate(s);
    this.channels.leak.set(
      loss > 0.01
        ? {
            id: 'coolant-leak',
            offset: 0,
            loop: true,
            volume: Math.min(0.8, loss * 0.6),
            rate: 1,
            attack: 0.25,
            smoothing: 0.3,
          }
        : null,
    );
    const alerts = unacknowledgedServiceAlerts(s);
    this.channels.warning.set(
      dcSupply(s) && alerts.length
        ? {
            id: 'warning-' + alerts.join('-'),
            offset: 0,
            loop: true,
            volume: LEVEL.warning,
            attack: 0.015,
          }
        : null,
    );
  }
  dispose() {
    Object.values(this.channels).forEach((channel) => channel.dispose());
    this.event = null;
    this.lockEvent = null;
  }
}
