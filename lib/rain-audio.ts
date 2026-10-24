// Regengeräusch ohne Audiodatei: gefiltertes Rauschen aus der Web-Audio-API.
// In der Kanzel dumpfes Trommeln auf dem Dach, draußen helles Rauschen.

function noiseBuffer(ctx: BaseAudioContext, seconds: number) {
  const length = Math.round(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    // Rosa-ähnliches Rauschen (Paul Kellet, vereinfacht) mit vereinzelten Tropfen-Knacksern.
    let b0 = 0,
      b1 = 0,
      b2 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      let v = (b0 + b1 + b2 + white * 0.1848) * 0.11;
      if (Math.random() < 0.0009) v += (Math.random() - 0.5) * 0.9;
      data[i] = v;
    }
  }
  return buffer;
}

export class RainAudio {
  private source: AudioBufferSourceNode;
  private outside: GainNode;
  private inside: GainNode;
  private insideFilter: BiquadFilterNode;
  private ctx: AudioContext;

  constructor(ctx: AudioContext, output: AudioNode) {
    this.ctx = ctx;
    this.source = ctx.createBufferSource();
    this.source.buffer = noiseBuffer(ctx, 4);
    this.source.loop = true;
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 350;
    const air = ctx.createBiquadFilter();
    air.type = 'lowpass';
    air.frequency.value = 7000;
    this.outside = ctx.createGain();
    this.outside.gain.value = 0;
    this.source.connect(high).connect(air).connect(this.outside).connect(output);
    // Kanzel: Tropfen trommeln auf Blech – tiefpass plus leichte Resonanz.
    this.insideFilter = ctx.createBiquadFilter();
    this.insideFilter.type = 'lowpass';
    this.insideFilter.frequency.value = 900;
    this.insideFilter.Q.value = 2.2;
    this.inside = ctx.createGain();
    this.inside.gain.value = 0;
    this.source.connect(this.insideFilter).connect(this.inside).connect(output);
    this.source.start();
  }

  /** amount 0…1, cabin = Pilotensicht (gedämpft). */
  set(amount: number, cabin: boolean) {
    const t = this.ctx.currentTime;
    this.outside.gain.setTargetAtTime(cabin ? 0 : 0.55 * amount, t, 0.4);
    this.inside.gain.setTargetAtTime(cabin ? 0.9 * amount : 0, t, 0.4);
  }

  dispose() {
    try {
      this.source.stop();
    } catch {
      /* bereits gestoppt */
    }
    this.source.disconnect();
  }
}
