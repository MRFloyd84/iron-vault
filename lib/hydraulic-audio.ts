// Hydraulikgeräusche beim Gehen (Aufnahmen: Rene, ElevenLabs; aufbereitet mit
// scripts/prepare-hydraulic-audio.py). Sie hängen am Gangzyklus jedes Beins, genau
// wie die Zylinder in mech-hydraulics.ts:
//   Abheben (Takt 0,56)     → Druckablass + Zylinder fährt ein (Bein winkelt an)
//   Vorschwingen (Takt 0,8) → Zylinder fährt aus (Bein streckt sich nach vorn)
//   Aufsetzen (Takt 0/1)    → Ventil schließt, Federn; manchmal knarzt das Knie
// Dazu läuft eine Hydraulikpumpe, die mit der Last lauter wird. In der Kanzel klingt
// alles dumpf durch den Rumpf, in den Außenansichten klar und links/rechts verteilt.
import { loadAudio, decodeAudio } from './audio-assets';
import { AUDIO_LEVELS as LEVEL } from './audio-mix';
import type { MachineState } from './machine';

export type HydraulicKind = 'extend' | 'retract' | 'vent' | 'settle' | 'creak';
export const HYDRAULIC_VARIANTS: Record<HydraulicKind, number> = {
  extend: 3,
  retract: 3,
  vent: 3,
  settle: 3,
  creak: 4,
};
export const HYDRAULIC_PUMP = 'hyd-pump-loop.ogg';
const file = (kind: HydraulicKind, i: number) => `hyd-${kind}-${i + 1}.ogg`;

export type HydraulicEvent = {
  kind: HydraulicKind;
  /** −1 links, +1 rechts (wie legCycle). */
  side: number;
  /** 0…1, aus der Gehgeschwindigkeit. */
  strength: number;
  variant: number;
  /** Versatz in Sekunden (Ventil klackt kurz nach dem Aufprall). */
  delay: number;
};
type Gait = { phase: number; speed: number; turnRate: number };

const LIFT = 0.56,
  REACH = 0.8;
// Deterministischer Zufall je Schritt und Bein: gleiche Schritte klingen gleich,
// aufeinanderfolgende verschieden.
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Welche Hydraulikgeräusche zwischen zwei Gangzuständen fällig sind. */
export function hydraulicEvents(previous: Gait, current: Gait, wet = 0): HydraulicEvent[] {
  // Sprünge (Zurücksetzen, Fortsetzen nach Pause) lösen keine Geräuschsalve aus.
  if (current.phase < previous.phase || current.phase - previous.phase > 0.45) return [];
  const strength = Math.min(1, Math.abs(current.speed) / 0.4 + Math.abs(current.turnRate) * 6);
  if (strength < 0.12) return [];
  const events: HydraulicEvent[] = [];
  for (const side of [-1, 1]) {
    const offset = side > 0 ? 0.5 : 0;
    const crossed = (mark: number) => {
      const n = Math.floor(current.phase + offset - mark);
      return n > Math.floor(previous.phase + offset - mark) ? n : null;
    };
    const add = (kind: HydraulicKind, n: number, delay: number, salt: number, scale = 1) =>
      events.push({
        kind,
        side,
        strength: strength * scale,
        variant: Math.floor(hash(n * 4 + salt + side * 0.5) * HYDRAULIC_VARIANTS[kind]),
        delay,
      });
    const lift = crossed(LIFT);
    if (lift !== null) {
      add('vent', lift, 0, 1);
      add('retract', lift, 0.06, 2);
    }
    const reach = crossed(REACH);
    if (reach !== null) add('extend', reach, 0, 3);
    const down = crossed(0);
    if (down !== null) {
      add('settle', down, 0.04, 4);
      // Altes Gelenk: knarzt gelegentlich, bei Nässe deutlich öfter.
      if (hash(down * 9.7 + side) < 0.1 + 0.3 * wet) add('creak', down, 0.12, 5, 0.9);
    }
  }
  return events;
}

export const preloadHydraulics = () => {
  const bytes = new Map<string, Promise<ArrayBuffer | null>>();
  for (const [kind, count] of Object.entries(HYDRAULIC_VARIANTS))
    for (let i = 0; i < count; i++) {
      const name = file(kind as HydraulicKind, i);
      bytes.set(name, loadAudio(name));
    }
  bytes.set(HYDRAULIC_PUMP, loadAudio(HYDRAULIC_PUMP));
  return bytes;
};

type Voice = { source: AudioBufferSourceNode; nodes: AudioNode[] };

export class HydraulicAudio {
  private buffers = new Map<string, AudioBuffer>();
  private voices = new Set<Voice>();
  private previous: Gait | null = null;
  private cabin = true;
  private wet = 0;
  private bus: GainNode;
  private muffle: BiquadFilterNode;
  private pumpGain: GainNode;
  private pump: AudioBufferSourceNode | null = null;
  private disposed = false;
  private ctx: AudioContext;
  constructor(
    ctx: AudioContext,
    output: AudioNode,
    bytes: Map<string, Promise<ArrayBuffer | null>>,
  ) {
    this.ctx = ctx;
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.Q.value = 0.5;
    this.bus = ctx.createGain();
    this.pumpGain = ctx.createGain();
    this.pumpGain.gain.value = 0;
    this.bus.connect(this.muffle);
    this.pumpGain.connect(this.muffle);
    this.muffle.connect(output);
    this.setCabin(true);
    for (const [name, data] of bytes)
      void data
        .then((b) => (!this.disposed ? decodeAudio(ctx, b, name) : null))
        .then((buffer) => {
          if (!buffer || this.disposed) return;
          this.buffers.set(name, buffer);
          if (name === HYDRAULIC_PUMP) this.startPump(buffer);
        })
        .catch(() => {});
  }
  private startPump(buffer: AudioBuffer) {
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(this.pumpGain);
    source.start(0, Math.random() * buffer.duration);
    this.pump = source;
  }
  /** Kanzel: gedämpft durch den Rumpf, kaum Stereo. Außen: hell und breit. */
  setCabin(cabin: boolean) {
    this.cabin = cabin;
    const t = this.ctx.currentTime;
    this.muffle.frequency.setTargetAtTime(cabin ? 900 : 16000, t, 0.08);
    this.bus.gain.setTargetAtTime(cabin ? 1.25 : 1, t, 0.08);
  }
  /** Nässe 0…1 (Regen): Gelenke knarzen öfter. */
  setWet(wet: number) {
    this.wet = wet;
  }
  update(s: MachineState) {
    const gait = { phase: s.walk.phase, speed: s.walk.speed, turnRate: s.walk.turnRate };
    const previous = this.previous;
    this.previous = gait;
    if (this.disposed || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    // Pumpe nur mit laufendem Antrieb; Last aus Gehen und Armbewegung.
    const powered = s.stage >= 4 ? 1 : 0;
    const load = Math.max(s.walk.effort, s.articulation.effort);
    this.pumpGain.gain.setTargetAtTime(powered * (0.18 + 0.82 * load) * LEVEL.hydPump, t, 0.35);
    if (this.pump) this.pump.playbackRate.setTargetAtTime(0.92 + 0.16 * load, t, 0.4);
    if (!previous || !powered) return;
    for (const e of hydraulicEvents(previous, gait, this.wet)) this.play(e, t);
  }
  private play(e: HydraulicEvent, now: number) {
    const buffer = this.buffers.get(file(e.kind, e.variant));
    if (!buffer) return;
    const ctx = this.ctx,
      at = now + e.delay;
    const source = ctx.createBufferSource(),
      gain = ctx.createGain(),
      pan = ctx.createStereoPanner();
    source.buffer = buffer;
    source.playbackRate.value = 0.94 + 0.12 * ((e.variant * 0.37 + (e.side > 0 ? 0.5 : 0)) % 1);
    gain.gain.value =
      LEVEL.hydraulics * (0.35 + 0.65 * e.strength) * (e.kind === 'creak' ? LEVEL.creak : 1);
    pan.pan.value = e.side * (this.cabin ? 0.15 : 0.45);
    source.connect(gain).connect(pan).connect(this.bus);
    const voice = { source, nodes: [gain, pan] as AudioNode[] };
    // Höchstens acht gleichzeitig; die älteste Stimme wird weich beendet.
    if (this.voices.size >= 8) {
      const old = this.voices.values().next().value!;
      (old.nodes[0] as GainNode).gain.setTargetAtTime(0, now, 0.02);
      old.source.stop(now + 0.08);
      this.voices.delete(old);
    }
    this.voices.add(voice);
    source.onended = () => {
      source.disconnect();
      for (const n of voice.nodes) n.disconnect();
      this.voices.delete(voice);
    };
    source.start(at);
  }
  dispose() {
    this.disposed = true;
    for (const v of this.voices) {
      v.source.stop();
      v.source.disconnect();
    }
    this.voices.clear();
    this.pump?.stop();
    this.pump?.disconnect();
    this.muffle.disconnect();
  }
}
