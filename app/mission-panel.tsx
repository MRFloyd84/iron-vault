import { useEffect, useRef, useState } from 'react';
import { tr } from '../lib/i18n';
import { useLang } from './language-menu';
import {
  MISSIONS,
  mission as missionById,
  objectivePosition,
  objectiveVisible,
  startMission,
} from '../lib/missions';
import { drawMap, fromMap, type MapOverlay } from '../lib/map-render';
import { sectorName } from '../lib/terrain';
import type { CockpitScene } from '../lib/cockpit-scene';

type Info = ReturnType<CockpitScene['missionInfo']>;

/** Einsatzleitung: Auftrag wählen, Lagekarte, Auftragstext, Ziele, Start/Abbruch. */
export default function MissionPanel({
  read,
  start,
  abort,
  close,
  nav,
  pick,
}: {
  read: () => Info | null;
  start: (id: string) => void;
  abort: () => void;
  close: () => void;
  /** Autopilot-Route und Kartenpunkt für die Karte */
  nav: () => Pick<MapOverlay, 'route' | 'mapPoint'>;
  /** Klick auf die Karte: Kartenpunkt für den Autopiloten setzen */
  pick: (x: number, z: number) => void;
}) {
  useLang();
  const [info, setInfo] = useState<Info | null>(read);
  const [selected, setSelected] = useState<string>(() => read()?.active?.id ?? MISSIONS[0].id);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const id = window.setInterval(() => setInfo(read()), 250);
    return () => clearInterval(id);
  }, [read]);
  const m = missionById(selected)!;
  const active = info?.active && info.active.id === selected ? info.active : null;
  // Ziele für die Karte: aktiver Einsatz mit Fortschritt, sonst Vorschau
  const preview = startMission(selected, 0);
  const objectives = active
    ? active.objectives
    : m.objectives.map((o) => ({
        ...objectivePosition(o),
        label: o.label,
        done: false,
        visible: o.kind !== 'return' && objectiveVisible(o, m, preview),
      }));
  useEffect(() => {
    const c = canvas.current?.getContext('2d');
    if (!c || !info) return;
    drawMap(
      c,
      {
        x: info.x,
        z: info.z,
        yaw: info.yaw,
        drone: info.drone,
        destroyed: info.destroyed,
        known: info.known,
        objectives,
        ...nav(),
      },
      performance.now() / 1000,
    );
  });
  const otherActive =
    info?.active && info.active.id !== selected && info.active.status === 'active';
  return (
    <aside className="mission-panel" aria-label={tr('Einsatzleitung')}>
      <div className="mission-heading">
        <strong>{tr('EINSATZLEITUNG / IV–04')}</strong>
        <span>{info ? tr('POSITION ' + sectorName(info.x, info.z)) : ''}</span>
        <button onClick={close} aria-label={tr('Einsatzleitung schließen')}>
          ×
        </button>
      </div>
      <div className="mission-body">
        <ul className="mission-list">
          {MISSIONS.map((mm) => {
            const done = info?.completed.includes(mm.id);
            const running = info?.active?.id === mm.id && info.active.status === 'active';
            return (
              <li key={mm.id}>
                <button aria-pressed={selected === mm.id} onClick={() => setSelected(mm.id)}>
                  <span className="mission-type">{tr(mm.type)}</span>
                  <span className="mission-title">{tr(mm.title)}</span>
                  <span className={'mission-state' + (running ? ' running' : done ? ' done' : '')}>
                    {tr(running ? 'LÄUFT' : done ? 'ERFÜLLT' : 'OFFEN')}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <canvas
          className="mission-map"
          ref={canvas}
          width={600}
          height={600}
          title={tr('Klick: Kartenpunkt für den Autopiloten')}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const w = fromMap(
              ((e.clientX - r.left) / r.width) * 600,
              ((e.clientY - r.top) / r.height) * 600,
            );
            pick(w.x, w.z);
          }}
        />
        <div className="mission-brief">
          <span className="mission-type">{tr(m.type)}</span>
          <h3>{tr(m.title)}</h3>
          <p>{tr(m.brief)}</p>
          <ol>
            {m.objectives.map((o) => {
              const done = active?.objectives.find((x) => x.id === o.id)?.done;
              return (
                <li key={o.id} className={done ? 'done' : ''}>
                  {tr(o.label)}
                </li>
              );
            })}
          </ol>
          {active?.status === 'complete' && <p className="mission-done">{tr('EINSATZ ERFÜLLT')}</p>}
          <div className="mission-actions">
            {active && active.status === 'active' ? (
              <button className="mission-abort" onClick={abort}>
                {tr('EINSATZ ABBRECHEN')}
              </button>
            ) : (
              <button className="mission-start" onClick={() => start(selected)}>
                {tr(
                  otherActive
                    ? 'STATT DESSEN STARTEN'
                    : active
                      ? 'ERNEUT STARTEN'
                      : 'EINSATZ STARTEN',
                )}
              </button>
            )}
          </div>
          <p className="mission-hint">
            {tr(
              'Karte: Norden oben, Planquadrate 250 m. Rote Punkte: aufgeklärte Ziele (Drohne oder in Mech-Nähe), gestrichelter Kreis: Suchgebiet.',
            )}
          </p>
          <p className="mission-hint">
            {tr(
              'Autopilot: Klick auf die Karte setzt einen Kartenpunkt, im MCDU unter DIR wählbar. Magenta: aktive Route.',
            )}
          </p>
        </div>
      </div>
    </aside>
  );
}
