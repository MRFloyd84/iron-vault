// Rotorsurren der Drohne, mit Web Audio erzeugt: vier leicht verstimmte Sägezähne um 150 Hz
// plus gefiltertes Rauschen (Luftstrom). Lautstärke nach Drehzahl und Entfernung; in der
// Kanzel dumpf durch den Rumpf.
export class DroneAudio {
  private ctx: AudioContext;
  private out: GainNode;
  private filter: BiquadFilterNode;
  private oscs: OscillatorNode[] = [];
  private noise: AudioBufferSourceNode;
  private running = false;
  constructor(ctx: AudioContext, output: AudioNode) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 3000;
    this.out.connect(this.filter).connect(output);
    const voice = ctx.createGain();
    voice.gain.value = 0.06;
    voice.connect(this.out);
    for (const detune of [0, 7, -9, 15]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 150;
      o.detune.value = detune;
      o.connect(voice);
      this.oscs.push(o);
    }
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noise = ctx.createBufferSource();
    this.noise.buffer = buf;
    this.noise.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 900;
    band.Q.value = 0.7;
    const air = ctx.createGain();
    air.gain.value = 0.12;
    this.noise.connect(band).connect(air).connect(this.out);
  }
  /** rotor 0…1, level 0…1 (Entfernung), cabin = in der Kanzel gehört */
  set(rotor: number, level: number, cabin: boolean) {
    const t = this.ctx.currentTime;
    if (rotor > 0.01 && !this.running) {
      this.running = true;
      for (const o of this.oscs) o.start();
      this.noise.start();
    }
    if (!this.running) return;
    for (const o of this.oscs) o.frequency.setTargetAtTime(60 + 120 * rotor, t, 0.3);
    this.out.gain.setTargetAtTime(rotor * level * 0.9, t, 0.15);
    this.filter.frequency.setTargetAtTime(cabin ? 700 : 4500, t, 0.1);
  }
  dispose() {
    if (this.running) {
      for (const o of this.oscs) o.stop();
      this.noise.stop();
    }
    this.out.disconnect();
  }
}
