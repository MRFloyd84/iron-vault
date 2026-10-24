import { dcPowerAvailable, type MachineState } from './machine';
import { renderInstrument, type InstrumentAssets, type TelemetrySample } from './instruments';
import { drawDisplaySurface } from './display-surface';
import { drawDisplayAging } from './display-aging';

export const DISPLAY_BOOT_SECONDS = 13;
export type DisplayPhase = 'off' | 'boot' | 'ready';
export class DisplayBoot {
  phase: DisplayPhase = 'off';
  elapsed = 0;
  cycle = 0;
  private started: number | null = null;
  update(s: MachineState, now: number) {
    const previous = this.phase;
    if (!dcPowerAvailable(s)) {
      this.phase = 'off';
      this.elapsed = 0;
      this.started = null;
    } else {
      if (this.started === null || now < this.started) {
        this.started = now;
        this.cycle++;
      }
      this.elapsed = Math.min(DISPLAY_BOOT_SECONDS, Math.max(0, (now - this.started) / 1000));
      this.phase = this.elapsed < DISPLAY_BOOT_SECONDS ? 'boot' : 'ready';
    }
    return previous !== this.phase;
  }
}
export const coldCockpit = (s: MachineState) =>
  !dcPowerAvailable(s) &&
  s.stage === 0 &&
  s.shutdownPhase === 'idle' &&
  s.temperature <= 45 &&
  s.heatLoad <= 0.08;
export function batteryBeacon(s: MachineState, seconds: number, reducedMotion = false) {
  return coldCockpit(s) ? (reducedMotion ? 1.1 : seconds % 1.4 < 0.65 ? 1.6 : 0) : 0;
}
const TITLES: Record<string, string> = {
  armor: 'STRUKTUR / IV-04',
  radar: 'TAKTIK / RADAR',
  reactor: 'REAKTOR',
  comm: 'KOMMUNIKATION',
  diagnostics: 'ENGINEERING',
  cameras: 'UMGEBUNGSKAMERAS',
  power: 'VERSORGUNG',
  preflight: 'EINSATZPRÜFUNG',
  hud: 'HEAD-UP DISPLAY',
  electrical: 'ELEKTRISCHE VERSORGUNG',
};
const BOOT_LINES = [
  'Anzeigesteuerung initialisieren',
  'Bildspeicher vorbereiten',
  'Zeilenabgleich herstellen',
  'Schriftzeichensatz laden',
  'Instrumentenseite laden',
  'Datenkanäle zuordnen',
  'Anzeigenlayout aufbauen',
  'Bedienoberfläche vorbereiten',
  'Anzeige initialisiert',
];

function paintBoot(c: CanvasRenderingContext2D, kind: string, elapsed: number, reduced: boolean) {
  const progress = Math.min(1, elapsed / DISPLAY_BOOT_SECONDS),
    compact = kind === 'electrical';
  c.save();
  c.setTransform(
    c.canvas.width / (compact ? 1440 : 960),
    0,
    0,
    c.canvas.height / (compact ? 140 : 720),
    0,
    0,
  );
  c.shadowBlur = 0;
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  c.fillStyle = '#030800';
  c.fillRect(0, 0, compact ? 1440 : 960, compact ? 140 : 720);
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  const text = (s: string, x: number, y: number, size: number, color = '#b7ff87') => {
    c.fillStyle = color;
    c.font = '600 ' + size + 'px monospace';
    c.fillText(s, x, y);
  };
  if (compact) {
    text('IV-04 / POWER-ON', 24, 40, 28);
    text(Math.round(progress * 100) + ' %', 1240, 40, 28);
    text(BOOT_LINES[Math.min(8, Math.floor(progress * 9))], 24, 88, 25, '#91d762');
    c.fillStyle = '#204308';
    c.fillRect(24, 112, 1392, 10);
    c.fillStyle = '#adff77';
    c.fillRect(24, 112, 1392 * progress, 10);
  } else {
    text('IRON VAULT', 42, 85, 48);
    text('IV-04 / ANZEIGESYSTEM', 44, 127, 24, '#91d762');
    c.fillStyle = '#335f15';
    c.fillRect(42, 151, 876, 2);
    text(TITLES[kind] ?? kind.toUpperCase(), 44, 193, 27);
    const lines = Math.min(BOOT_LINES.length, Math.max(1, Math.floor((elapsed - 0.5) / 1.15) + 1));
    for (let i = 0; i < lines; i++)
      text(
        '> ' + BOOT_LINES[i] + (i < lines - 1 ? '  [OK]' : ''),
        48,
        255 + i * 33,
        22,
        i < lines - 1 ? '#91d762' : '#cdffac',
      );
    if (!reduced && elapsed % 1 < 0.6) text('_', 48, 255 + lines * 33, 24);
    c.fillStyle = '#204308';
    c.fillRect(44, 600, 872, 14);
    c.fillStyle = '#b0ff7b';
    c.fillRect(44, 600, 872 * progress, 14);
    text(
      'BOOT ' +
        Math.round(progress * 100)
          .toString()
          .padStart(3, '0') +
        ' %',
      44,
      655,
      30,
    );
    text(elapsed < 11 ? 'SYSTEM STARTET …' : 'ANZEIGE WIRD ÜBERGEBEN …', 44, 696, 21, '#91d762');
  }
  c.restore();
}

export function renderDisplay(
  c: CanvasRenderingContext2D,
  kind: string,
  s: MachineState,
  boot: DisplayBoot,
  seconds: number,
  index: number,
  reduced: boolean,
  angle = 0,
  history: TelemetrySample[] = [],
  assets: InstrumentAssets = {},
) {
  if (boot.phase === 'off') {
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.shadowBlur = 0;
    c.clearRect(0, 0, c.canvas.width, c.canvas.height);
    if (kind !== 'hud') {
      c.fillStyle = '#000000';
      c.fillRect(0, 0, c.canvas.width, c.canvas.height);
    }
    c.restore();
    return;
  }
  if (boot.phase === 'boot') paintBoot(c, kind, boot.elapsed, reduced);
  else {
    renderInstrument(
      c,
      kind === 'cameras' ? 'weapons' : kind,
      s,
      reduced ? 0 : seconds,
      angle,
      history,
      assets,
    );
    if (kind === 'cameras') {
      c.save();
      c.fillStyle = '#192f0a';
      c.fillRect(556, 4, 404, 74);
      c.fillStyle = '#98ff53';
      c.font = '600 24px Arial';
      c.fillText('6 BILDER', 574, 49);
      c.fillText('SYSTEME', 786, 49);
      c.restore();
    }
  }
  drawDisplaySurface(c, seconds, reduced, index);
  drawDisplayAging(c, boot.phase, boot.elapsed, seconds, index, reduced, kind === 'hud');
}
