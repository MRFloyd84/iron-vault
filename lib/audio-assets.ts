import { assetUrl } from './asset-url';
// Keep the existing recordings and Web Audio graph. Report failures instead of
// turning a failed early request into unexplained, permanently silent playback.
const failures = new Map<string, string>();
// A fresh URL for the explicit reimport; retain normal caching afterwards.
export const audioUrl = (file: string) => assetUrl('audio/' + file) + '?v=reimport-20261018';
export const audioAssetErrors = () => Object.fromEntries(failures);
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
function failed(key: string, error: unknown) {
  const detail = message(error);
  failures.set(key, detail);
  console.warn('[IRON VAULT audio] ' + key + ': ' + detail);
}
export async function loadAudio(file: string): Promise<ArrayBuffer | null> {
  let error: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(audioUrl(file), attempt ? { cache: 'reload' } : undefined);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const bytes = await response.arrayBuffer();
      if (!bytes.byteLength) throw new Error('Leere Audiodatei');
      failures.delete('load:' + file);
      return bytes;
    } catch (e) {
      error = e;
    }
  }
  failed('load:' + file, error);
  return null;
}
export async function decodeAudio(
  ctx: AudioContext,
  bytes: ArrayBuffer | null,
  file: string,
): Promise<AudioBuffer | null> {
  if (!bytes || ctx.state === 'closed') return null;
  try {
    const buffer = await ctx.decodeAudioData(bytes.slice(0));
    failures.delete('decode:' + file);
    return buffer;
  } catch (error) {
    failed('decode:' + file, error);
    return null;
  }
}
