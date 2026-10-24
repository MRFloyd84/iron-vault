import { loadAudio, decodeAudio } from './audio-assets';
import { AUDIO_LEVELS as LEVEL, ambientGain } from './audio-mix';
import type { MachineState } from './machine';

const FILES = {
  apuStart: 'apu-start.ogg',
  apuRun: 'apu-running-loop.ogg',
  apuStop: 'apu-shutdown.ogg',
  powerDown: 'systems-power-down.ogg',
  gyro: 'gyro-running-loop.ogg',
} as const;
type Effect = keyof typeof FILES;
type EffectBytes = Record<Effect, Promise<ArrayBuffer | null>>;
type Playback = {
  id: string;
  offset: number;
  volume: number;
  loop?: boolean;
  rate?: number;
  attack?: number;
  smoothing?: number;
};
type Voice = { source: AudioBufferSourceNode; gain: GainNode };

export function preloadMachineEffects(): EffectBytes {
  return Object.fromEntries(
    Object.entries(FILES).map(([key, file]) => [key, loadAudio(file)]),
  ) as EffectBytes;
}

// One voice per effect. A generation token invalidates asynchronous loads when
// a start is aborted, restarted, or the cockpit is closed.
export class EffectChannel {
  private desired: Playback | null = null;
  private voice: Voice | null = null;
  private retiring = new Set<Voice>();
  private generation = 0;
  private disposed = false;
  private ctx: AudioContext;
  private output: AudioNode;
  private buffer: Promise<AudioBuffer | null>;
  constructor(ctx: AudioContext, output: AudioNode, buffer: Promise<AudioBuffer | null>) {
    this.ctx = ctx;
    this.output = output;
    this.buffer = buffer;
  }

  set(next: Playback | null) {
    if (this.disposed) return;
    const changed = this.desired?.id !== next?.id;
    this.desired = next;
    if (!changed) {
      if (next && this.voice) {
        this.voice.gain.gain.setTargetAtTime(
          next.volume,
          this.ctx.currentTime,
          next.smoothing ?? 0.18,
        );
        if (next.rate !== undefined)
          this.voice.source.playbackRate.setTargetAtTime(next.rate, this.ctx.currentTime, 0.4);
      }
      return;
    }
    const generation = ++this.generation;
    this.stop();
    if (!next) return;
    void this.buffer
      .then((buffer) => {
        const desired = this.desired;
        if (
          !buffer ||
          this.disposed ||
          generation !== this.generation ||
          !desired ||
          this.ctx.state === 'closed'
        )
          return;
        // Seek to the current phase if decoding finished after the transition.
        if (!desired.loop && desired.offset >= buffer.duration) return;
        const source = this.ctx.createBufferSource(),
          gain = this.ctx.createGain();
        source.buffer = buffer;
        source.loop = !!desired.loop;
        gain.gain.setValueAtTime(0, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(
          desired.volume,
          this.ctx.currentTime + (desired.attack ?? 0.15),
        );
        if (desired.rate !== undefined)
          source.playbackRate.setValueAtTime(desired.rate, this.ctx.currentTime);
        source.connect(gain);
        gain.connect(this.output);
        const voice = { source, gain };
        this.voice = voice;
        source.onended = () => {
          source.disconnect();
          gain.disconnect();
          this.retiring.delete(voice);
          if (this.voice === voice) this.voice = null;
        };
        source.start(
          0,
          Math.max(0, desired.loop ? desired.offset % buffer.duration : desired.offset),
        );
      })
      .catch(() => {});
  }

  private stop() {
    const voice = this.voice;
    if (!voice) return;
    this.voice = null;
    this.retiring.add(voice);
    const current = voice.gain.gain.value;
    voice.gain.gain.cancelScheduledValues(this.ctx.currentTime);
    voice.gain.gain.setValueAtTime(current, this.ctx.currentTime);
    voice.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.045);
    voice.source.stop(this.ctx.currentTime + 0.25);
  }

  dispose() {
    this.disposed = true;
    this.generation++;
    this.desired = null;
    if (this.voice) this.retiring.add(this.voice);
    for (const voice of this.retiring) {
      voice.source.stop();
      voice.source.disconnect();
      voice.gain.disconnect();
    }
    this.retiring.clear();
    this.voice = null;
  }
}

export class MachineEffects {
  private channels: Record<Effect, EffectChannel>;
  private previous: MachineState | null = null;
  private apuStopAt: number | null = null;
  private powerDownAt: number | null = null;
  private apuStopVolume = 0.7;
  private serial = 0;
  private apuStopId = '';
  private powerDownId = '';
  private ctx: AudioContext;
  constructor(ctx: AudioContext, output: AudioNode, bytes: EffectBytes) {
    this.ctx = ctx;
    this.channels = Object.fromEntries(
      Object.keys(FILES).map((key) => {
        const effect = key as Effect;
        const buffer = bytes[effect]
          .then((data) => decodeAudio(this.ctx, data, FILES[effect]))
          .catch(() => null);
        return [effect, new EffectChannel(ctx, output, buffer)];
      }),
    ) as Record<Effect, EffectChannel>;
  }

  update(s: MachineState) {
    const previous = this.previous;
    this.previous = s;
    const phase = s.overhead.apuPhase,
      apuActive = phase === 'starting' || phase === 'running';
    const wasApuActive =
      previous &&
      (previous.overhead.apuPhase === 'starting' || previous.overhead.apuPhase === 'running');
    const reactorActive = s.stage >= 4 || s.busy === 3;
    const wasReactorActive = previous && (previous.stage >= 4 || previous.busy === 3);
    if (wasApuActive && !apuActive) {
      this.apuStopAt = this.ctx.currentTime;
      this.apuStopId = 'apu-stop-' + ++this.serial;
      this.apuStopVolume =
        previous.overhead.apuPhase === 'running'
          ? 0.7
          : 0.18 + 0.52 * previous.overhead.apuProgress;
    }
    if (apuActive) this.apuStopAt = null;
    if (
      previous &&
      ((wasReactorActive && !reactorActive) || (previous.stage > 0 && s.stage === 0))
    ) {
      this.powerDownAt = this.ctx.currentTime;
      this.powerDownId = 'power-down-' + ++this.serial;
    }
    if (reactorActive || s.busy === 0 || (previous?.stage === 0 && s.stage > 0))
      this.powerDownAt = null;

    this.channels.apuStart.set(
      phase === 'starting'
        ? {
            id: 'apu-start-' + s.overhead.apuStarted,
            offset: s.overhead.apuProgress * 9,
            volume: 0.75,
          }
        : null,
    );
    this.channels.apuRun.set(
      phase === 'running'
        ? {
            id: 'apu-run',
            offset: 0,
            volume: (s.overhead.apuGen ? LEVEL.apuLoaded : LEVEL.apuIdle) * ambientGain(s),
            loop: true,
          }
        : null,
    );
    this.channels.apuStop.set(
      this.apuStopAt === null
        ? null
        : {
            id: this.apuStopId,
            offset: this.ctx.currentTime - this.apuStopAt,
            volume: this.apuStopVolume,
          },
    );
    this.channels.powerDown.set(
      this.powerDownAt === null
        ? null
        : { id: this.powerDownId, offset: this.ctx.currentTime - this.powerDownAt, volume: 0.5 },
    );
    this.channels.gyro.set(
      s.stage >= 5 || s.busy === 4
        ? {
            id: 'gyro',
            offset: 0,
            volume: LEVEL.gyro * (s.stage >= 5 ? 1 : Math.max(0.1, s.progress)) * ambientGain(s),
            loop: true,
          }
        : null,
    );
  }

  dispose() {
    Object.values(this.channels).forEach((channel) => channel.dispose());
  }
}
