// Grafikeinstellungen oben rechts: Voreinstellung plus einzelne Stellschrauben.
// Änderungen wirken sofort und werden im Browser gespeichert.
import { useEffect, useRef, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { tr } from '../lib/i18n';
import {
  DISTANCES,
  MONITOR_RATES,
  PRESETS,
  RESOLUTIONS,
  SHADOW_LEVELS,
  getGraphics,
  matchPreset,
  onGraphicsChange,
  setGraphics,
  type Graphics,
  type PresetId,
} from '../lib/graphics-settings';
import { useLang } from './language-menu';

const PRESET_LABEL: Record<PresetId, string> = {
  high: 'Hoch',
  medium: 'Mittel',
  low: 'Niedrig',
};
const SHADOW_LABEL = { high: 'Hoch', medium: 'Mittel', low: 'Niedrig', off: 'Aus' } as const;
const DISTANCE_LABEL = { far: 'Weit', medium: 'Mittel', near: 'Nah' } as const;
const DISTANCE_HINT = { far: '2,6 km', medium: '1,5 km', near: '0,9 km' } as const;
const MONITOR_LABEL = { smooth: 'Flüssig', saver: 'Sparsam' } as const;

function useGraphics(): Graphics {
  const [g, set] = useState(getGraphics());
  useEffect(() => onGraphicsChange(set), []);
  return g;
}

function Row<T extends string | number>({
  label,
  values,
  current,
  name,
  hint,
  pick,
}: {
  label: string;
  values: readonly T[];
  current: T;
  name: (v: T) => string;
  hint?: (v: T) => string;
  pick: (v: T) => void;
}) {
  return (
    <div className="graphics-row" role="radiogroup" aria-label={tr(label)}>
      <span>{tr(label)}</span>
      <div className="graphics-options">
        {values.map((v) => (
          <button
            key={String(v)}
            role="radio"
            aria-checked={v === current}
            title={hint?.(v)}
            onClick={() => pick(v)}
          >
            {name(v)}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function GraphicsMenu() {
  useLang();
  const g = useGraphics();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', key);
    };
  }, [open]);
  const preset = matchPreset(g);
  const presets = Object.keys(PRESETS) as PresetId[];
  return (
    <div className="graphics-menu" ref={root}>
      <button
        className="icon-button graphics-button"
        title={tr('Grafikeinstellungen')}
        aria-label={tr('Grafikeinstellungen')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <SlidersHorizontal size={15} />
        <span>{preset ? tr(PRESET_LABEL[preset]) : tr('Eigene')}</span>
      </button>
      {open && (
        <div className="graphics-panel" role="dialog" aria-label={tr('Grafikeinstellungen')}>
          <strong>{tr('GRAFIK')}</strong>
          <Row
            label="Voreinstellung"
            values={presets}
            current={preset ?? ('' as PresetId)}
            name={(v) => tr(PRESET_LABEL[v])}
            pick={(v) => setGraphics(PRESETS[v])}
          />
          <hr />
          <Row
            label="Auflösung"
            values={RESOLUTIONS}
            current={g.resolution as (typeof RESOLUTIONS)[number]}
            name={(v) => Math.round(v * 100) + ' %'}
            pick={(v) => setGraphics({ resolution: v })}
          />
          <Row
            label="Schatten"
            values={SHADOW_LEVELS}
            current={g.shadows}
            name={(v) => tr(SHADOW_LABEL[v])}
            pick={(v) => setGraphics({ shadows: v })}
          />
          <Row
            label="Sichtweite"
            values={DISTANCES}
            current={g.distance}
            name={(v) => tr(DISTANCE_LABEL[v])}
            hint={(v) => DISTANCE_HINT[v]}
            pick={(v) => setGraphics({ distance: v })}
          />
          <Row
            label="Kameramonitor"
            values={MONITOR_RATES}
            current={g.monitors}
            name={(v) => tr(MONITOR_LABEL[v])}
            pick={(v) => setGraphics({ monitors: v })}
          />
          <p>
            {tr(
              '„Hoch“ ist die volle Qualität. Wirkt sofort; mit F3 siehst du, was es bringt. Schatten an/aus kann beim Umschalten kurz stocken.',
            )}
          </p>
        </div>
      )}
    </div>
  );
}
