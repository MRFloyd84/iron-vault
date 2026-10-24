import { audioAssetErrors, loadAudio, decodeAudio } from './audio-assets';

type AudioBus = {
  ctx: AudioContext | null;
  master: GainNode | null;
  muted: boolean;
  disposed: boolean;
};
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
function bounded<T>(task: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Zeitlimit bei Audio-Laden/Decodierung')), ms);
    task.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
export async function measureAudioBus(audio: AudioBus, pause = wait) {
  const { ctx, master } = audio;
  if (!ctx || !master || audio.disposed) throw new Error('Audiograph nicht bereit');
  const analyser = ctx.createAnalyser(),
    tone = ctx.createOscillator(),
    gain = ctx.createGain();
  analyser.fftSize = 512;
  gain.gain.value = 0.18;
  tone.frequency.value = 660;
  const samples = new Float32Array(analyser.fftSize),
    started = ctx.currentTime;
  let peak = 0,
    startedTone = false;
  try {
    // The meter is a temporary side branch; the existing speaker connection stays.
    master.connect(analyser);
    tone.connect(gain);
    gain.connect(master);
    tone.start();
    startedTone = true;
    tone.stop(started + 1);
    for (let i = 0; i < 8; i++) {
      await pause(120);
      if (audio.disposed || ctx.state === 'closed') throw new Error('Audioprüfung unterbrochen');
      analyser.getFloatTimeDomainData(samples);
      for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
    }
    return {
      context: ctx.state,
      clockSeconds: Number((ctx.currentTime - started).toFixed(3)),
      muted: audio.muted,
      masterGain: master.gain.value,
      signalPeak: Number(peak.toFixed(5)),
      signalDetected: peak > 0.0001,
    };
  } finally {
    if (startedTone) tone.stop();
    tone.disconnect();
    gain.disconnect();
    master.disconnect(analyser);
    analyser.disconnect();
  }
}
export async function inspectAudio(audio: AudioBus) {
  const signal = await measureAudioBus(audio),
    ctx = audio.ctx!;
  const codecs = await Promise.all(
    ['switch-flip.mp3', 'apu-running-loop.ogg'].map(async (file) => {
      try {
        const buffer = await bounded(
          loadAudio(file).then((bytes) => decodeAudio(ctx, bytes, file)),
          8000,
        );
        return {
          file,
          decoded: !!buffer,
          duration: buffer?.duration ?? 0,
          channels: buffer?.numberOfChannels ?? 0,
        };
      } catch (error) {
        return {
          file,
          decoded: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );
  return {
    version: 'audio-audit-2026-10-18',
    ...signal,
    codecs,
    assetErrors: audioAssetErrors(),
    note: 'Gemessen vor dem Systemausgang. Hörbarkeit und Ausgabegerät sind damit nicht bestätigt.',
  };
}
