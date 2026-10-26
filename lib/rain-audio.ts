// Regen- und Gewitterklang.
// Grundlage ist die aufbereitete Regenaufnahme (rain-loop.ogg, 16-s-Schleife) und zwei
// Donnerschläge (thunder-1/2.ogg). Sie werden erst beim ersten Regen geladen.
// In der Kanzel klingt alles gedämpft (Tiefpass + leichtes Trommeln auf Blech),
// draußen offen. Ein leiser synthetischer Rauschteppich gibt starkem Regen Körper.
import { decodeAudio, loadAudio } from './audio-assets';

function noiseBuffer(ctx: BaseAudioContext, seconds: number) {
  const length = Math.round(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let b0 = 0,
      b1 = 0,
      b2 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.11;
    }
  }
  return buffer;
}

export const RAIN_FILES = ['rain-loop.ogg', 'thunder-1.ogg', 'thunder-2.ogg'] as const;

export class RainAudio {
  private ctx: AudioContext;
  private sources: AudioBufferSourceNode[] = [];
  private outside: GainNode;
  private inside: GainNode;
  private bed: GainNode;
  private thunderBus: GainNode;
  private thunderFilter: BiquadFilterNode;
  private thunder: (AudioBuffer | null)[] = [null, null];
  private cabin = true;
  private disposed = false;

  constructor(ctx: AudioContext, output: AudioNode) {
    this.ctx = ctx;
    // Zwei Wege für denselben Regen: offen (draußen) und gedämpft (Kanzel).
    this.outside = ctx.createGain();
    this.outside.gain.value = 0;
    this.outside.connect(output);
    const muffle = ctx.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.frequency.value = 1300;
    muffle.Q.value = 1.6;
    this.inside = ctx.createGain();
    this.inside.gain.value = 0;
    muffle.connect(this.inside).connect(output);
    // Leiser Rauschteppich (gibt Körper, besonders als Trommeln in der Kanzel).
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx, 3);
    noise.loop = true;
    const drum = ctx.createBiquadFilter();
    drum.type = 'lowpass';
    drum.frequency.value = 700;
    drum.Q.value = 2.4;
    this.bed = ctx.createGain();
    this.bed.gain.value = 0;
    noise.connect(drum).connect(this.bed).connect(output);
    noise.start();
    this.sources.push(noise);
    // Donner: eigener Weg mit Tiefpass (Entfernung, Kanzel).
    this.thunderFilter = ctx.createBiquadFilter();
    this.thunderFilter.type = 'lowpass';
    this.thunderFilter.frequency.value = 4000;
    this.thunderBus = ctx.createGain();
    this.thunderBus.gain.value = 1;
    this.thunderFilter.connect(this.thunderBus).connect(output);

    void loadAudio(RAIN_FILES[0])
      .then((bytes) => decodeAudio(ctx, bytes, RAIN_FILES[0]))
      .then((buffer) => {
        if (!buffer || this.disposed) return;
        const rain = ctx.createBufferSource();
        rain.buffer = buffer;
        rain.loop = true;
        rain.connect(this.outside);
        rain.connect(muffle);
        rain.start();
        this.sources.push(rain);
      })
      .catch(() => {});
    RAIN_FILES.slice(1).forEach((file, i) => {
      void loadAudio(file)
        .then((bytes) => decodeAudio(ctx, bytes, file))
        .then((buffer) => {
          if (!this.disposed) this.thunder[i] = buffer;
        })
        .catch(() => {});
    });
  }

  /** amount 0…1, cabin = Pilotensicht (gedämpft). */
  set(amount: number, cabin: boolean) {
    this.cabin = cabin;
    const t = this.ctx.currentTime;
    this.outside.gain.setTargetAtTime(cabin ? 0 : 1.6 * amount, t, 0.5);
    this.inside.gain.setTargetAtTime(cabin ? 2.2 * amount : 0, t, 0.5);
    this.bed.gain.setTargetAtTime((cabin ? 0.5 : 0.18) * amount, t, 0.5);
  }

  /**
   * Donnerschlag. `variant` 0 (ferner Roll) oder 1 (schwerer Schlag), `distance` 0…1
   * (0 = nah: laut und hell; 1 = fern: leise, dumpf, langsamer).
   */
  strike(variant: number, distance: number) {
    const buffer = this.thunder[variant % 2] ?? this.thunder[0] ?? this.thunder[1];
    if (!buffer || this.disposed) return;
    const t = this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 1.04 - 0.16 * distance;
    const gain = this.ctx.createGain();
    gain.gain.value = (1.25 - 0.75 * distance) * (this.cabin ? 0.8 : 1);
    this.thunderFilter.frequency.setTargetAtTime(
      (this.cabin ? 0.45 : 1) * (6500 - 5200 * distance),
      t,
      0.05,
    );
    source.connect(gain).connect(this.thunderFilter);
    source.start();
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
  }

  dispose() {
    this.disposed = true;
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* bereits gestoppt */
      }
      s.disconnect();
    }
  }
}
