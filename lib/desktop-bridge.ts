// Zugriff auf die Desktop-App (electron/preload.cjs). Im Browser gibt es die Brücke nicht.

export type GpuMode = 'auto' | 'nvidia' | 'integrated';
export const GPU_MODES: GpuMode[] = ['auto', 'nvidia', 'integrated'];

export type GpuDevice = { vendor: number; device: number; active: boolean };
export type GpuState = {
  /** Wahl, mit der die laufende App gestartet wurde */
  mode: GpuMode;
  /** gespeicherte Wahl für den nächsten Start */
  saved: GpuMode;
  /** NVIDIA-Offload beim Start gesetzt */
  offload: boolean;
  devices: GpuDevice[];
};

type Bridge = {
  gpu: {
    get(): Promise<GpuState>;
    set(mode: GpuMode): Promise<void>;
    restart(): Promise<void>;
  };
};

export function desktop(): Bridge | null {
  const b = (globalThis as { ironVault?: Bridge }).ironVault;
  return b && typeof b.gpu?.get === 'function' ? b : null;
}

const VENDORS: Record<number, string> = { 0x10de: 'NVIDIA', 0x8086: 'Intel', 0x1002: 'AMD' };

/** „NVIDIA“, „Intel“, „AMD“ oder die Hersteller-ID als Hex. */
export function vendorName(id: number): string {
  return VENDORS[id] ?? '0x' + id.toString(16).padStart(4, '0');
}
