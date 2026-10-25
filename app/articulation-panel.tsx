import { useEffect, useState } from 'react';
import { tr } from '../lib/i18n';
import { useLang } from './language-menu';
import { articulationBlock, JOINT_LIMITS, RAD, type Joint } from '../lib/articulation';
import type { MachineState } from '../lib/machine';

export default function ArticulationPanel({
  read,
  command,
  close,
}: {
  read: () => MachineState;
  command: (joint: Joint | 'neutral', degrees?: number) => void;
  close: () => void;
}) {
  useLang();
  const [s, set] = useState(read),
    [side, setSide] = useState<'left' | 'right'>('left');
  useEffect(() => {
    const id = window.setInterval(() => set(read()), 125);
    return () => clearInterval(id);
  }, [read]);
  const block = articulationBlock(s),
    rows: [Joint, string][] = [
      ['torso', 'TORSO · LINKS / RECHTS'],
      [side === 'left' ? 'leftShoulder' : 'rightShoulder', 'SCHULTER · ANHEBEN'],
      [side === 'left' ? 'leftElbow' : 'rightElbow', 'ELLENBOGEN · BEUGEN'],
    ];
  return (
    <aside className="articulation-panel" aria-label={tr('Torso und Arme steuern')}>
      <div className="articulation-heading">
        <strong>{tr('ARTIKULATION / IV–04')}</strong>
        <button onClick={close} aria-label={tr('Gelenksteuerung schließen')}>
          ×
        </button>
      </div>
      <p className={block ? 'joint-locked' : 'joint-ready'}>
        {tr(block || 'FREIGEGEBEN · HYDRAULIK AKTIV')}
      </p>
      <div className="arm-select">
        <button aria-pressed={side === 'left'} onClick={() => setSide('left')}>
          {tr('LINKER ARM')}
        </button>
        <button aria-pressed={side === 'right'} onClick={() => setSide('right')}>
          {tr('RECHTER ARM')}
        </button>
      </div>
      {rows.map(([joint, label]) => (
        <label className="joint-control" key={joint}>
          <span>
            {tr(label)}
            <output>{Math.round(s.articulation.pose[joint] / RAD)}°</output>
          </span>
          <input
            type="range"
            min={JOINT_LIMITS[joint][0]}
            max={JOINT_LIMITS[joint][1]}
            step="1"
            value={Math.round(s.articulation.target[joint] / RAD)}
            disabled={!!block}
            onChange={(e) => {
              command(joint, Number(e.target.value));
              set(read());
            }}
          />
          <small>
            {tr('SOLL')} {Math.round(s.articulation.target[joint] / RAD)}
            {tr('° · IST oben')}
          </small>
        </label>
      ))}
      <button
        className="joint-reset"
        disabled={!!block}
        onClick={() => {
          command('neutral');
          set(read());
        }}
      >
        {tr('GRUNDSTELLUNG ANFAHREN [R]')}
      </button>
      <p>
        {tr('Q / E: Torso drehen · B: Bedienfeld')}
        <br />

        {tr('Arme im freien Testgelände bewegen. Vor engen Durchfahrten einfahren.')}
      </p>
      <p className="joint-note">
        {tr(
          'Die Arme tragen Waffenmodule, noch keine Greifer. Dieses Bedienfeld steuert Schulter und Ellenbogen.',
        )}
      </p>
      {s.error && (
        <p className="joint-locked" role="status">
          {tr(s.message)}
        </p>
      )}
    </aside>
  );
}
