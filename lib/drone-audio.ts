// Geräusche der Drohne (Aufnahmen: Rene, ElevenLabs; aufbereitet mit
// scripts/prepare-drone-audio.py):
//   Start      → Verriegelung öffnet, Motoren laufen hoch, dann Schwebeflug-Schleife
//   Flug       → Schleife, Tonhöhe leicht mit dem Tempo
//   Landung    → Kufen setzen auf, Klauen schließen, Motoren laufen aus
//   Markieren  → kurzes Einrasten des Lasers
//   Drohnensicht → Funkrauschen der Bildverbindung, stärker bei schwachem Signal
// Lautstärke nach Entfernung; in der Kanzel dumpf durch den Rumpf.
import { loadAudio, decodeAudio } from './audio-assets';
import type { DronePhase } from './drone';

export const DRONE_SOUNDS = {
  hover: 'drone-hover-loop.ogg',
  spinup: 'drone-spinup.ogg',
  spindown: 'drone-spindown.ogg',
  release: 'drone-release.ogg',
  dock: 'drone-dock.ogg',
  mark: 'drone-mark.ogg',
  noise: 'drone-static-loop.ogg',
} as const;
type Sound = keyof typeof DRONE_SOUNDS;

export type DroneSoundInput = {
  phase: DronePhase;
  rotor: number;
  /** Zahl der bisher gesetzten Markierungen (jede neue spielt den Einrast-Ton). */
  marks: number;
  signal: number;
  speed: number;
};
export type DroneEvent = 'spinup' | 'release' | 'dock' | 'spindown' | 'mark';

/** Welche Einzelgeräusche zwischen zwei Zuständen fällig sind (rein, für Tests). */
export function droneSoundEvents(
  previous: DroneSoundInput | null,
  current: DroneSoundInput,
): DroneEvent[] {
  if (!previous) return [];
  const events: DroneEvent[] = [];
  if (previous.phase === 'docked' && current.phase === 'spinup') events.push('spinup');
  if (previous.phase !== 'launch' && current.phase === 'launch') events.push('release');
  if (previous.phase !== 'docked' && current.phase === 'docked') {
    // Abgebrochener Start (Strom weg) landet nicht, die Motoren laufen nur aus.
    if (previous.phase !== 'spinup') events.push('dock');
    events.push('spindown');
  }
  if (current.marks > previous.marks) events.push('mark');
  return events;
}

export const preloadDroneAudio = () => {
  const bytes = new Map<string, Promise<ArrayBuffer | null>>();
  for (const name of Object.values(DRONE_SOUNDS)) bytes.set(name, loadAudio(name));
  return bytes;
};

export class DroneAudio {
  private ctx: AudioContext;
  private buffers = new Map<string, AudioBuffer>();
  private out: GainNode;
  private muffle: BiquadFilterNode;
  private hoverGain: GainNode;
  private noiseGain: GainNode;
  private hover: AudioBufferSourceNode | null = null;
  private noise: AudioBufferSourceNode | null = null;
  private previous: DroneSoundInput | null = null;
  /** Wann der Hochlauf-Ton begann – die Schleife setzt erst gegen dessen Ende ein. */
  private spinupAt = -1;
  private disposed = false;
  constructor(ctx: AudioContext, output: AudioNode, bytes: Map<string, Promise<ArrayBuffer | null>>) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.Q.value = 0.5;
    this.muffle.frequency.value = 16000;
    this.out.connect(this.muffle).connect(output);
    this.hoverGain = ctx.createGain();
    this.hoverGain.gain.value = 0;
    this.hoverGain.connect(this.out);
    // Funkrauschen gehört zur Bildverbindung, nicht zur Drohne: ohne Entfernungsdämpfung.
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0;
    this.noiseGain.connect(output);
    for (const [name, data] of bytes)
      void data
        .then((b) => (!this.disposed ? decodeAudio(ctx, b, name) : null))
        .then((buffer) => {
          if (!buffer || this.disposed) return;
          this.buffers.set(name, buffer);
          if (name === DRONE_SOUNDS.hover) this.hover = this.loop(buffer, this.hoverGain);
          if (name === DRONE_SOUNDS.noise) this.noise = this.loop(buffer, this.noiseGain);
        })
        .catch(() => {});
  }
  private loop(buffer: AudioBuffer, gain: GainNode) {
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    source.start(0, Math.random() * buffer.duration);
    return source;
  }
  private play(sound: Sound, gain = 1) {
    const buffer = this.buffers.get(DRONE_SOUNDS[sound]);
    if (!buffer) return;
    const source = this.ctx.createBufferSource(),
      g = this.ctx.createGain();
    source.buffer = buffer;
    g.gain.value = gain;
    source.connect(g).connect(this.out);
    source.onended = () => {
      source.disconnect();
      g.disconnect();
    };
    source.start();
  }
  /**
   * level 0…1 (Entfernung zum Hörer), cabin = in der Kanzel gehört,
   * feed = Drohnensicht aktiv (Funkrauschen hörbar).
   */
  set(d: DroneSoundInput, level: number, cabin: boolean, feed: boolean) {
    const previous = this.previous;
    this.previous = d;
    if (this.disposed) return;
    const t = this.ctx.currentTime;
    for (const e of droneSoundEvents(previous, d)) {
      if (e === 'spinup') this.spinupAt = t;
      this.play(e, e === 'mark' ? 0.9 : 1);
    }
    this.out.gain.setTargetAtTime(level, t, 0.15);
    this.muffle.frequency.setTargetAtTime(cabin ? 750 : 16000, t, 0.1);
    // Schleife: während des Hochlaufs erst gegen Ende einblenden, beim Auslaufen schnell weg.
    const sinceSpinup = this.spinupAt < 0 ? 99 : t - this.spinupAt;
    const hover =
      d.phase === 'docked'
        ? 0
        : d.phase === 'spinup'
          ? Math.max(0, (sinceSpinup - 1.6) / 0.6) * d.rotor
          : d.rotor;
    this.hoverGain.gain.setTargetAtTime(hover, t, d.phase === 'docked' ? 0.08 : 0.25);
    if (this.hover)
      this.hover.playbackRate.setTargetAtTime(0.96 + Math.min(1, d.speed / 9) * 0.1, t, 0.4);
    const noise = feed && d.phase !== 'docked' ? 0.12 + 0.88 * (1 - d.signal) : 0;
    this.noiseGain.gain.setTargetAtTime(noise, t, 0.2);
  }
  dispose() {
    this.disposed = true;
    this.hover?.stop();
    this.noise?.stop();
    this.out.disconnect();
    this.noiseGain.disconnect();
  }
}
