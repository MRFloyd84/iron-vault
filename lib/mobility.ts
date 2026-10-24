import { walkingStopped } from './walking';
import type { MachineState } from './machine';

export type MobilityState = {
  page: 'release' | 'test' | 'hangar' | 'walk';
  helmet: boolean;
  calibration: 'idle' | 'running' | 'ready';
  elapsed: number;
  restraints: 'locked' | 'releasing' | 'released' | 'locking';
  travel: number;
};
export const initialMobility = (): MobilityState => ({
  page: 'release',
  helmet: false,
  calibration: 'idle',
  elapsed: 0,
  restraints: 'locked',
  travel: 0,
});
export function mobilityHealthy(s: MachineState) {
  return (
    s.stage >= 5 &&
    s.overhead.avionics &&
    s.overhead.hydPump &&
    !s.service.hydraulicFault &&
    !s.service.sensorFault &&
    s.actualPressure >= 140
  );
}
export function linkReady(s: MachineState) {
  return (
    mobilityHealthy(s) &&
    s.mobility.helmet &&
    s.mobility.calibration === 'ready' &&
    s.testPhase === 'passed'
  );
}
export function releaseBlock(s: MachineState): string | null {
  if (s.shutdownPhase !== 'idle') return 'Abschaltsequenz aktiv.';
  if (s.busy >= 0 || s.stage < 6) return 'Steuerfreigabe LINK [6] fehlt.';
  if (!linkReady(s)) return 'Neurohelm, Prüfungen und Systemzustand prüfen.';
  if (
    s.thermalWarning ||
    s.coolantFlow < 20 ||
    s.service.reservoirLitres < 72 ||
    s.service.coolantLeak
  )
    return 'Kühlung, Vorrat und Leckstatus prüfen.';
  if (s.throttle > 0) return 'Leistungshebel auf 0 % zurücknehmen.';
  if (s.service.groundConnected) return 'Hangarstrom im linken Elektrikdisplay trennen.';
  return null;
}
export function restraintLabel(s: MachineState) {
  return { locked: 'VERRIEGELT', releasing: 'LÖST …', released: 'GELÖST', locking: 'VERRIEGELT …' }[
    s.mobility.restraints
  ];
}
export function advanceMobility(state: MachineState, dt: number): MachineState {
  const m = { ...state.mobility };
  let s = { ...state, mobility: m };
  if (s.stage < 5 && s.testPhase === 'passed')
    s = {
      ...s,
      testPhase: 'aborted',
      testResults: [false, false, false],
      testMessage: 'Gyroversorgung unterbrochen. Vor neuer Freigabe Systemtest wiederholen.',
    };
  const calibrated = m.calibration === 'ready';
  if (!m.helmet || !mobilityHealthy(s)) {
    m.calibration = 'idle';
    m.elapsed = 0;
    if (calibrated) {
      s.error = true;
      s.message = 'Neurohelm-Abgleich ungültig. Ursache beheben und neu kalibrieren.';
    }
  } else if (m.calibration === 'running') {
    if (s.throttle > 0 || m.restraints !== 'locked') {
      m.calibration = 'idle';
      m.elapsed = 0;
      s.error = true;
      s.message = 'Kalibrierung abgebrochen: 0 % Leistung und verriegelter Prüfstand erforderlich.';
    } else {
      m.elapsed = Math.min(8, m.elapsed + dt);
      if (m.elapsed >= 8) {
        m.calibration = 'ready';
        s.error = false;
        s.message = 'Neurohelm kalibriert. Systemtest [T] ausführen, danach LINK [6].';
      }
    }
  }
  // Release solenoids drop out on lost readiness; spring-applied parking locks
  // close after the emergency brake has brought movement to rest.
  if ((s.stage === 6 || s.busy === 5) && !linkReady(s)) {
    s = {
      ...s,
      stage: Math.min(5, s.stage),
      busy: -1,
      progress: 0,
      throttle: 0,
      error: true,
      message: 'Steuerfreigabe entzogen. Systemzustand prüfen; Neurohelm und Prüfungen erneuern.',
    };
  }
  if (
    ['releasing', 'released'].includes(m.restraints) &&
    (s.stage < 6 ||
      !linkReady(s) ||
      s.service.groundConnected ||
      s.thermalWarning ||
      s.coolantFlow < 20 ||
      s.service.reservoirLitres < 72 ||
      s.service.coolantLeak)
  ) {
    m.restraints = 'locking';
    s.throttle = 0;
    s.error = true;
    s.message = 'Sicherheitsverriegelung schließt. Freigabebedingung verloren.';
  }
  if (m.restraints === 'releasing') {
    m.travel = Math.min(1, m.travel + dt / 2);
    if (m.travel >= 1) {
      m.restraints = 'released';
      s.message = 'Parkverriegelung gelöst. Tor öffnen, Leistungsbegrenzung wählen, mit W/S gehen.';
      s.error = false;
    }
  } else if (m.restraints === 'locking' && walkingStopped(s)) {
    m.travel = Math.max(0, m.travel - dt / 2);
    if (m.travel <= 0) {
      m.restraints = 'locked';
      s.message = 'Parkverriegelung geschlossen. Maschine im Stillstand gesichert.';
    }
  }
  return s;
}
export function mobilityCommand(state: MachineState, action: number): MachineState {
  const m = { ...state.mobility };
  const s = { ...state, mobility: m, error: false };
  const fail = (message: string) => ({ ...state, error: true, message });
  if (action === 80 || action === 81 || action === 85) {
    m.page = action === 80 ? 'release' : action === 81 ? 'test' : 'hangar';
    return s;
  }
  if (action === 82) {
    if (!state.overhead.avionics) return fail('Neurohelm benötigt AVIONICS.');
    m.helmet = !m.helmet;
    m.calibration = 'idle';
    m.elapsed = 0;
    s.message = m.helmet
      ? 'Neurohelm verbunden. Kalibrierung starten.'
      : 'Neurohelm getrennt. Steuerung wird gesperrt.';
  } else if (action === 83) {
    if (!m.helmet) return fail('Zuerst Neurohelm verbinden.');
    if (
      !mobilityHealthy(s) ||
      s.throttle > 0 ||
      s.busy >= 0 ||
      m.restraints !== 'locked' ||
      s.shutdownPhase !== 'idle'
    )
      return fail(
        'Kalibrierung: Gyro online, gesunde Systeme, 0 % Leistung und Verriegelung erforderlich.',
      );
    m.calibration = 'running';
    m.elapsed = 0;
    s.message = 'Neurohelm: Nullpunkt, Lageabgleich und Verbindung werden geprüft.';
  } else if (action === 84) {
    if (m.restraints === 'released' || m.restraints === 'releasing') {
      if (!walkingStopped(s)) return fail('Vor dem Verriegeln anhalten: Leertaste halten.');
      if (s.throttle > 0) return fail('Vor dem Verriegeln Leistung auf 0 % stellen.');
      m.restraints = 'locking';
      s.message = 'Parkverriegelung schließt …';
    } else {
      const blocked = releaseBlock(s);
      if (blocked) return fail('Entriegelung gesperrt: ' + blocked);
      if (m.restraints === 'locking') return fail('Verriegelung zuerst abschließen lassen.');
      m.restraints = 'releasing';
      s.message = 'Parkverriegelung wird gelöst …';
    }
  } else return fail('Unbekannte Freigabebedienung.');
  return advanceMobility(s, 0);
}
export const MOBILITY_CONTROLS = [
  {
    action: 95,
    x: 36,
    y: 470,
    w: 432,
    h: 48,
    page: 'walk',
    label: 'Leistungsbegrenzung senken [Bild ab]',
  },
  {
    action: 96,
    x: 492,
    y: 470,
    w: 432,
    h: 48,
    page: 'walk',
    label: 'Leistungsbegrenzung erhöhen [Bild auf]',
  },
  { action: 93, x: 714, y: 99, w: 210, h: 48, label: 'Gehinstrumente anzeigen' },
  {
    action: 94,
    x: 36,
    y: 534,
    w: 888,
    h: 48,
    page: 'walk',
    label: 'Schrittbewegung: Aus / Dezent / Stark',
  },
  { action: 80, x: 36, y: 99, w: 210, h: 48, label: 'Bewegungsfreigabe anzeigen' },
  { action: 81, x: 262, y: 99, w: 210, h: 48, label: 'Systemprüfung anzeigen' },
  { action: 85, x: 488, y: 99, w: 210, h: 48, label: 'Hangartorsteuerung anzeigen' },
  { action: 90, x: 36, y: 534, w: 284, h: 48, page: 'hangar', label: 'Hangartor öffnen' },
  { action: 91, x: 338, y: 534, w: 284, h: 48, page: 'hangar', label: 'Hangartor anhalten' },
  { action: 92, x: 640, y: 534, w: 284, h: 48, page: 'hangar', label: 'Hangartor schließen' },
  {
    action: 82,
    x: 36,
    y: 470,
    w: 432,
    h: 48,
    page: 'release',
    label: 'Neurohelm verbinden / trennen',
  },
  { action: 83, x: 492, y: 470, w: 432, h: 48, page: 'release', label: 'Neurohelm kalibrieren' },
  {
    action: 84,
    x: 36,
    y: 534,
    w: 888,
    h: 48,
    page: 'release',
    label: 'Parkverriegelung lösen / schließen',
  },
  { action: 30, x: 36, y: 602, w: 432, h: 48, label: 'Systemtest starten / abbrechen [T]' },
  { action: 35, x: 492, y: 602, w: 432, h: 48, label: 'Geordnetes Herunterfahren [K]' },
] as const;
