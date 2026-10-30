// Grafikeinstellungen: Voreinstellungen, Speicherung und Umrechnung in Renderwerte.
// "Hoch" entspricht genau dem bisherigen Bild; alles darunter ist eine bewusste Wahl.

export type ShadowLevel = 'high' | 'medium' | 'low' | 'off';
export type ViewDistance = 'far' | 'medium' | 'near';
export type MonitorRate = 'smooth' | 'saver';
/** Bildstil: normal oder Pixel-Look der frühen 90er (siehe retro-pass.ts) */
export type RetroLook = 'normal' | 'pixel' | 'coarse';
export const RETRO_LOOKS: RetroLook[] = ['normal', 'pixel', 'coarse'];

export type Graphics = {
  /** Anteil der Renderauflösung (1 = volle Auflösung, wie bisher) */
  resolution: number;
  shadows: ShadowLevel;
  distance: ViewDistance;
  monitors: MonitorRate;
  /** Bildstil: normal oder Pixel-Look der frühen 90er (unabhängig von der Voreinstellung) */
  look: RetroLook;
};

export type PresetId = 'high' | 'medium' | 'low';

export const PRESETS: Record<PresetId, Graphics> = {
  high: { resolution: 1, shadows: 'high', distance: 'far', monitors: 'smooth', look: 'normal' },
  medium: {
    resolution: 0.85,
    shadows: 'medium',
    distance: 'medium',
    monitors: 'smooth',
    look: 'normal',
  },
  low: { resolution: 0.7, shadows: 'low', distance: 'near', monitors: 'saver', look: 'normal' },
};

export const RESOLUTIONS = [1, 0.85, 0.7, 0.5] as const;
export const SHADOW_LEVELS: ShadowLevel[] = ['high', 'medium', 'low', 'off'];
export const DISTANCES: ViewDistance[] = ['far', 'medium', 'near'];
export const MONITOR_RATES: MonitorRate[] = ['smooth', 'saver'];

/** Sichtweite der Hauptkamera in Metern (Weit = bisherige 2,6 km). */
export const FAR_PLANE: Record<ViewDistance, number> = { far: 2600, medium: 1500, near: 900 };
export const FULL_FAR = FAR_PLANE.far;

/** Schattenauflösung relativ zur bisherigen (Sonne 2048, Flutlicht 1024). */
const SHADOW_SCALE: Record<ShadowLevel, number> = { high: 1, medium: 0.5, low: 0.25, off: 0 };
export function shadowMapSize(level: ShadowLevel, base: number) {
  return Math.max(256, Math.round(base * SHADOW_SCALE[level]));
}

/**
 * Mindestdichte des Nebels bei verkürzter Sichtweite: Am Ende der Sichtweite ist die Welt
 * dann im Dunst verschwunden (exp2-Nebel: Restsicht unter 0,2 %) – kein harter Rand.
 * Bei voller Sichtweite bleibt der Nebel wie bisher.
 */
export function minFogDensity(distance: ViewDistance) {
  return distance === 'far' ? 0 : 2.5 / FAR_PLANE[distance];
}

/** Aufnahmeabstände des Kameramonitors in ms (Flüssig = bisheriger Takt). */
export const MONITOR_INTERVAL: Record<MonitorRate, { grid: number; selected: number }> = {
  smooth: { grid: 180, selected: 40 },
  saver: { grid: 400, selected: 100 },
};

/** Voreinstellung erkennen; der Bildstil (look) zählt nicht dazu. */
export function matchPreset(g: Graphics): PresetId | null {
  for (const id of Object.keys(PRESETS) as PresetId[]) {
    const p = PRESETS[id];
    if (
      p.resolution === g.resolution &&
      p.shadows === g.shadows &&
      p.distance === g.distance &&
      p.monitors === g.monitors
    )
      return id;
  }
  return null;
}

const STORAGE_KEY = 'iron-vault.graphics';

/** Gespeicherte Werte prüfen; Unbekanntes fällt auf "Hoch" zurück. */
export function sanitize(raw: unknown): Graphics {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Graphics>;
  const d = PRESETS.high;
  return {
    resolution: (RESOLUTIONS as readonly number[]).includes(r.resolution as number)
      ? (r.resolution as number)
      : d.resolution,
    shadows: SHADOW_LEVELS.includes(r.shadows as ShadowLevel) ? r.shadows! : d.shadows,
    distance: DISTANCES.includes(r.distance as ViewDistance) ? r.distance! : d.distance,
    monitors: MONITOR_RATES.includes(r.monitors as MonitorRate) ? r.monitors! : d.monitors,
    look: RETRO_LOOKS.includes(r.look as RetroLook) ? r.look! : d.look,
  };
}

function load(): Graphics {
  try {
    const s = globalThis.localStorage?.getItem(STORAGE_KEY);
    return sanitize(s ? JSON.parse(s) : null);
  } catch {
    return { ...PRESETS.high };
  }
}

let current: Graphics | null = null;
const listeners = new Set<(g: Graphics) => void>();

export function getGraphics(): Graphics {
  if (!current) current = load();
  return current;
}

export function setGraphics(next: Partial<Graphics>) {
  const merged = sanitize({ ...getGraphics(), ...next });
  current = merged;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // ohne Speicher gilt die Wahl nur bis zum Neustart
  }
  for (const cb of listeners) cb(merged);
}

export function onGraphicsChange(cb: (g: Graphics) => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
