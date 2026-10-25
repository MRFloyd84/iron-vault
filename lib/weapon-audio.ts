// Klang der Armkanonen – synthetisch, bis eine Aufnahme vorliegt:
// kurzer Knall (gefiltertes Rauschen), tiefer Druckstoß, metallisches Klacken des
// Verschlusses. Einschläge: Stahl klingt hell nach, Boden dumpf; Schall kommt
// entfernungsabhängig verzögert an. In der Kanzel alles gedämpft und basslastiger.

export class WeaponAudio {
  private noise: AudioBuffer;
  private out: GainNode;
  private cabinFilter: BiquadFilterNode;
  private ctx: AudioContext;
  constructor(ctx: AudioContext, output: AudioNode) {
    this.ctx = ctx;
    const len = Math.round(ctx.sampleRate * 0.5);
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.cabinFilter = ctx.createBiquadFilter();
    this.cabinFilter.type = 'lowpass';
    this.cabinFilter.frequency.value = 20000;
    this.out = ctx.createGain();
    this.out.gain.value = 0.9;
    this.cabinFilter.connect(this.out).connect(output);
  }

  private burst(at: number, freq: number, q: number, gain: number, decay: number) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    src.connect(f).connect(g).connect(this.cabinFilter);
    src.start(at, Math.random() * 0.2, decay + 0.05);
    src.onended = () => src.disconnect();
  }

  private tone(
    at: number,
    from: number,
    to: number,
    gain: number,
    decay: number,
    type: OscillatorType = 'sine',
  ) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, at);
    o.frequency.exponentialRampToValueAtTime(to, at + decay);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    o.connect(g).connect(this.cabinFilter);
    o.start(at);
    o.stop(at + decay + 0.02);
    o.onended = () => o.disconnect();
  }

  setCabin(cabin: boolean) {
    this.cabinFilter.frequency.setTargetAtTime(cabin ? 1400 : 18000, this.ctx.currentTime, 0.05);
  }

  /** Ein Schuss. `side` -1/1 für leichte Stereoverschiebung entfällt hier bewusst (mono). */
  shot() {
    const t = this.ctx.currentTime + 0.005;
    this.burst(t, 1500, 0.7, 0.9, 0.09); // Knall
    this.tone(t, 95, 38, 1.1, 0.22); // Druckstoß
    this.burst(t + 0.035, 3200, 6, 0.18, 0.05); // Verschluss klackt
  }

  /** Einschlag in `distance` Metern (Schall kommt verzögert an). */
  impact(kind: 'steel' | 'wreck' | 'ground', distance: number) {
    const t = this.ctx.currentTime + Math.min(1.5, distance / 343);
    const far = Math.max(0.15, 1 - distance / 260);
    if (kind === 'ground') this.burst(t, 420, 0.8, 0.35 * far, 0.18);
    else {
      this.burst(t, 2400, 1.5, 0.3 * far, 0.06);
      this.tone(
        t,
        kind === 'steel' ? 1850 : 620,
        kind === 'steel' ? 1700 : 480,
        0.12 * far,
        kind === 'steel' ? 0.6 : 0.25,
        'triangle',
      );
    }
  }

  /**
   * Explosion in `distance` Metern, `size` ≈ Feuerballradius. Synthetisch: Knall,
   * tiefer Druckstoß, langes Grollen; der Schall kommt mit 343 m/s verzögert an.
   */
  explosion(distance: number, size: number) {
    const ctx = this.ctx;
    const t = ctx.currentTime + Math.min(5, distance / 343);
    const far = Math.max(0.06, 1 - distance / 1400),
      big = Math.min(1.6, 0.5 + size / 8);
    // Knall – hohe Anteile verlieren sich mit der Entfernung
    this.burst(t, 1600, 0.6, 0.9 * far * far * big, 0.14);
    this.tone(t, 72, 24, 1.5 * far * big, 1.1);
    // Grollen: tiefpassgefiltertes Rauschen, lang ausklingend
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = 0.5;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900 * far + 120, t);
    lp.frequency.exponentialRampToValueAtTime(140, t + 2.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9 * far * big, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2 + size * 0.35);
    src.connect(lp).connect(g).connect(this.cabinFilter);
    src.start(t);
    src.stop(t + 1.3 + size * 0.35);
    src.onended = () => src.disconnect();
  }
}
