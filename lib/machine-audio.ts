import { loadAudio, decodeAudio } from './audio-assets';
import { StepAudio, preloadStep } from './step-audio';
import { AUDIO_LEVELS as LEVEL, ambientGain } from './audio-mix';
import { actualDriveLoad } from './walking';
import { ServiceAudio, preloadServiceAudio } from './service-audio';
import { pressureReleased, actuatorMoving, dcPowerAvailable, type MachineState } from './machine';
import { MachineEffects, EffectChannel, preloadMachineEffects } from './machine-effects';
import type { DisplayPhase } from './display-boot';
export type AudioStatus = 'idle' | 'active' | 'muted' | 'blocked' | 'error';
import { RainAudio } from './rain-audio';

export class MachineAudio {
  private rain: RainAudio | null = null;
  private rainState = { amount: 0, cabin: true };
  /** Regengeräusch (synthetisch). Wird erst beim ersten Regen angelegt. */
  setRain(amount: number, cabin: boolean) {
    this.rainState = { amount, cabin };
    if (!this.ctx || !this.master || this.disposed) return;
    if (!this.rain && amount > 0) this.rain = new RainAudio(this.ctx, this.master);
    this.rain?.set(amount, cabin);
  }
  /** Donnerschlag (nur wenn das Regengeräusch läuft). */
  thunder(variant: number, distance: number) {
    this.rain?.strike(variant, distance);
  }
  private onStatus: (status: AudioStatus) => void;
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  hum: GainNode | null = null;
  fan: GainNode | null = null;
  osc: OscillatorNode | null = null;
  muted = false;
  disposed = false;
  private steps: StepAudio | null = null;
  private stepBytes = preloadStep();
  private effects: MachineEffects | null = null;
  private effectBytes = preloadMachineEffects();
  private driveBytes: Promise<ArrayBuffer | null>;
  private driveLoad: Promise<void> | null = null;
  private driveSource: AudioBufferSourceNode | null = null;
  private driveGain: GainNode | null = null;
  private airBytes: Promise<ArrayBuffer | null>;
  private airBuffer: Promise<AudioBuffer | null> | null = null;
  private airVoice: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  private airRequest = 0;
  private fanBytes: Promise<ArrayBuffer | null>;
  private fanLoad: Promise<void> | null = null;
  private fanSource: AudioBufferSourceNode | null = null;
  private lastState: MachineState | null = null;
  private fanVolumeTarget = NaN;
  private fanRateTarget = NaN;
  private serviceAudio: ServiceAudio | null = null;
  private serviceBytes = preloadServiceAudio();
  private switchBytes: Promise<ArrayBuffer | null>;
  private switchBuffer: Promise<AudioBuffer | null> | null = null;
  private bootBytes = loadAudio('display-boot.mp3');
  private bootSound: EffectChannel | null = null;
  private bootState: { phase: DisplayPhase; elapsed: number; cycle: number } = {
    phase: 'off',
    elapsed: 0,
    cycle: 0,
  };
  setDisplayBoot(phase: DisplayPhase, elapsed: number, cycle: number) {
    this.bootState = { phase, elapsed, cycle };
    this.bootSound?.set(
      phase === 'boot' && this.ctx?.state === 'running'
        ? {
            id: 'display-boot-' + cycle,
            offset: elapsed,
            volume: LEVEL.displayBoot * (this.lastState ? ambientGain(this.lastState) : 1),
            attack: 0.025,
          }
        : null,
    );
    this.syncFan();
  }
  private syncFan() {
    if (!this.ctx || !this.fan) return;
    const s = this.lastState,
      level = s && dcPowerAvailable(s) && this.bootState.phase === 'ready' ? s.fanLevel : 0,
      t = this.ctx.currentTime;
    const volume = [0, 1.1, 2.1, 3.4][level] * (s ? ambientGain(s) : 1),
      rate = [0.7, 0.78, 1, 1.18][level];
    if (volume !== this.fanVolumeTarget) {
      this.fan.gain.setTargetAtTime(volume, t, level ? 0.45 : 0.7);
      this.fanVolumeTarget = volume;
    }
    if (this.fanSource && rate !== this.fanRateTarget) {
      this.fanSource.playbackRate.setTargetAtTime(rate, t, 0.6);
      this.fanRateTarget = rate;
    }
  }
  constructor(onStatus: (status: AudioStatus) => void = () => {}) {
    this.onStatus = onStatus;
    this.driveBytes = loadAudio('main-drive-loop.ogg');
    this.airBytes = loadAudio('air-release.mp3');
    this.fanBytes = loadAudio('display-fan-loop.ogg');
    this.switchBytes = loadAudio('switch-flip.mp3');
  }
  private reportStatus() {
    if (!this.disposed)
      this.onStatus(
        this.muted
          ? 'muted'
          : !this.ctx
            ? 'idle'
            : this.ctx.state === 'running'
              ? 'active'
              : 'blocked',
      );
  }
  async toggleSound() {
    // The first click unlocks audio; only an already running, audible bus is muted.
    if (this.ctx?.state === 'running' && !this.muted) {
      this.setMuted(true);
      return;
    }
    this.setMuted(false);
    await this.enable();
    if (this.ctx?.state === 'running') this.beep();
  }
  async playSwitch() {
    if (this.disposed) return;
    await this.enable();
    const ctx = this.ctx;
    if (!ctx || this.disposed) return;
    if (!this.switchBuffer)
      this.switchBuffer = this.switchBytes
        .then((bytes) => decodeAudio(ctx, bytes, 'switch-flip.mp3'))
        .catch(() => null);
    const buffer = await this.switchBuffer;
    if (!buffer || this.disposed || this.ctx !== ctx || !this.master) return;
    const source = ctx.createBufferSource(),
      gain = ctx.createGain();
    source.buffer = buffer;
    gain.gain.value = LEVEL.switch;
    source.connect(gain);
    gain.connect(this.master);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    source.start();
  }
  async playAirRelease() {
    if (this.disposed) return;
    const request = ++this.airRequest;
    await this.enable();
    const c = this.ctx;
    if (!c || this.disposed) return;
    if (!this.airBuffer)
      this.airBuffer = this.airBytes
        .then((bytes) => decodeAudio(c, bytes, 'air-release.mp3'))
        .catch(() => null);
    const buffer = await this.airBuffer;
    if (!buffer || this.disposed || request !== this.airRequest || this.ctx !== c || !this.master)
      return;
    if (this.airVoice) {
      const old = this.airVoice;
      old.gain.gain.setTargetAtTime(0, c.currentTime, 0.012);
      old.source.stop(c.currentTime + 0.06);
    }
    const source = c.createBufferSource(),
      gain = c.createGain();
    source.buffer = buffer;
    gain.gain.value = 0.9;
    source.connect(gain);
    gain.connect(this.master);
    const voice = { source, gain };
    this.airVoice = voice;
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      if (this.airVoice === voice) this.airVoice = null;
    };
    source.start();
  }
  async enable() {
    if (this.disposed) return;
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        const c = this.ctx;
        c.onstatechange = () => {
          this.reportStatus();
          this.setDisplayBoot(this.bootState.phase, this.bootState.elapsed, this.bootState.cycle);
        };
        this.master = c.createGain();
        this.master.gain.value = this.muted ? 0 : 0.38;
        this.master.connect(c.destination);
        this.steps = new StepAudio(c, this.master, this.stepBytes);
        if (this.lastState) this.steps.update(this.lastState);
        this.hum = c.createGain();
        this.hum.gain.value = 0;
        this.hum.connect(this.master);
        this.osc = c.createOscillator();
        this.osc.type = 'sine';
        this.osc.frequency.value = 42;
        this.osc.connect(this.hum);
        this.osc.start();
        const upper = c.createOscillator();
        upper.type = 'triangle';
        upper.frequency.value = 84;
        const ug = c.createGain();
        ug.gain.value = 0.13;
        upper.connect(ug);
        ug.connect(this.hum);
        upper.start();
        this.driveGain = c.createGain();
        this.driveGain.gain.value = 0;
        this.driveGain.connect(this.master);
        this.effects = new MachineEffects(c, this.master, this.effectBytes);
        this.serviceAudio = new ServiceAudio(c, this.master, this.serviceBytes);
        if (this.lastState) this.serviceAudio.update(this.lastState);
        this.bootSound = new EffectChannel(
          c,
          this.master,
          this.bootBytes.then((bytes) => decodeAudio(c, bytes, 'display-boot.mp3')),
        );
        this.setDisplayBoot(this.bootState.phase, this.bootState.elapsed, this.bootState.cycle);
        if (!this.driveLoad)
          this.driveLoad = this.driveBytes
            .then(async (bytes) => {
              if (!bytes || this.disposed) return;
              const buffer = await decodeAudio(c, bytes, 'main-drive-loop.ogg');
              if (!buffer || this.disposed || this.ctx !== c) return;
              const source = c.createBufferSource();
              source.buffer = buffer;
              source.loop = true;
              source.connect(this.driveGain!);
              this.driveSource = source;
              source.start();
              if (this.lastState) this.update(this.lastState);
            })
            .catch(() => {});
        this.fan = c.createGain();
        this.fan.gain.value = 0;
        this.fan.connect(this.master);
        if (!this.fanLoad)
          this.fanLoad = this.fanBytes
            .then(async (bytes) => {
              if (!bytes || this.disposed) return;
              const buffer = await decodeAudio(c, bytes, 'display-fan-loop.ogg');
              if (!buffer || this.disposed || this.ctx !== c) return;
              const source = c.createBufferSource();
              source.buffer = buffer;
              source.loop = true;
              source.connect(this.fan!);
              this.fanSource = source;
              source.start();
              if (this.lastState) this.update(this.lastState);
            })
            .catch(() => {});
      }
      if (this.rainState.amount > 0) this.setRain(this.rainState.amount, this.rainState.cabin);
      if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') await this.ctx.resume();
      this.setDisplayBoot(this.bootState.phase, this.bootState.elapsed, this.bootState.cycle);
      this.reportStatus();
    } catch (error) {
      if (!this.disposed) this.onStatus(this.ctx ? 'blocked' : 'error');
      throw error;
    }
  }
  setMuted(m: boolean) {
    this.muted = m;
    this.master?.gain.setTargetAtTime(m ? 0 : 0.38, this.ctx!.currentTime, 0.08);
    this.reportStatus();
  }
  update(s: MachineState) {
    const release =
      pressureReleased(this.lastState, s) ||
      (!!this.lastState &&
        this.lastState.mobility.restraints !== s.mobility.restraints &&
        ['releasing', 'locking'].includes(s.mobility.restraints));
    this.lastState = s;
    if (release) void this.playAirRelease().catch(() => {});
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const p = s.stage >= 4 ? 1 : s.busy === 3 ? s.progress : 0;
    if (!dcPowerAvailable(s)) this.setDisplayBoot('off', 0, this.bootState.cycle);
    else this.setDisplayBoot(this.bootState.phase, this.bootState.elapsed, this.bootState.cycle);
    this.effects?.update(s);
    this.serviceAudio?.update(s);
    this.steps?.update(s);
    const load = actualDriveLoad(s),
      bed = ambientGain(s);
    this.hum!.gain.setTargetAtTime(p * 0.045 + (dcPowerAvailable(s) ? 0.006 : 0), t, 0.4);
    this.driveGain!.gain.setTargetAtTime(
      p *
        (LEVEL.driveIdle +
          load * LEVEL.driveLoad +
          Math.max(actuatorMoving(s) ? 1 : 0, s.articulation.effort) * LEVEL.actuator) *
        bed,
      t,
      p ? 0.5 : 0.8,
    );
    if (this.driveSource)
      this.driveSource.playbackRate.setTargetAtTime(0.75 + p * 0.25 + load * 0.18, t, 0.55);
    this.osc!.frequency.setTargetAtTime(37 + p * 10 + load * 9, t, 0.3);
  }

  beep(error = false) {
    if (!this.ctx || !this.master) return;
    const c = this.ctx,
      o = c.createOscillator(),
      g = c.createGain();
    o.type = error ? 'sawtooth' : 'sine';
    o.frequency.setValueAtTime(error ? 145 : 850, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(error ? 100 : 400, c.currentTime + 0.08);
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(error ? 0.045 : 0.09, c.currentTime + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.16);
    o.connect(g);
    g.connect(this.master);
    o.start();
    o.stop(c.currentTime + 0.18);
  }
  dispose() {
    this.disposed = true;
    if (this.ctx) this.ctx.onstatechange = null;
    this.airRequest++;
    this.bootSound?.dispose();
    this.steps?.dispose();
    this.rain?.dispose();
    this.effects?.dispose();
    this.serviceAudio?.dispose();
    this.fanSource?.stop();
    this.driveSource?.stop();
    this.airVoice?.source.stop();
    void this.ctx?.close();
    this.ctx = null;
  }
}
