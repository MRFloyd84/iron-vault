import { walkingStopped, WALK } from './walking';
import type { MachineState } from './machine';
import { dcSupply } from './service-systems';
import { releaseBlock } from './mobility';
export type HangarState = {
  gate: 'closed' | 'opening' | 'open' | 'closing' | 'stopped';
  position: number;
};
export const initialHangar = (): HangarState => ({ gate: 'closed', position: 0 });
export const gateLabel = (s: MachineState) =>
  ({
    closed: 'GESCHLOSSEN',
    opening: 'ÖFFNET …',
    open: 'OFFEN',
    closing: 'SCHLIESST …',
    stopped: 'ANGEHALTEN',
  })[s.hangar.gate];
export function hangarCommand(state: MachineState, action: number): MachineState {
  const fail = (message: string) => ({ ...state, error: true, message });
  if (!dcSupply(state))
    return fail('Torsteuerung benötigt Batteriestrom oder eine Generatorversorgung.');
  if (action === 91)
    return {
      ...state,
      hangar: {
        ...state.hangar,
        gate:
          state.hangar.position === 0 ? 'closed' : state.hangar.position === 1 ? 'open' : 'stopped',
      },
      error: false,
      message: 'Hangartor angehalten.',
    };
  if (state.throttle > 0) return fail('Vor der Torbedienung Leistungshebel auf 0 % stellen.');
  if (!walkingStopped(state)) return fail('Vor der Torbedienung anhalten.');
  if (action === 90) {
    const block = releaseBlock(state);
    if (block || state.mobility.restraints !== 'released')
      return fail('Torfreigabe fehlt: ' + (block ?? 'Parkverriegelung zuerst lösen.'));
    if (state.hangar.position >= 1)
      return { ...state, error: false, message: 'Hangartor ist bereits offen.' };
    return {
      ...state,
      hangar: { ...state.hangar, gate: 'opening' },
      error: false,
      message:
        'Hangartor öffnet. Torfreigabe abwarten, dann Leistungsbegrenzung wählen und mit W gehen.',
    };
  }
  if (
    action === 92 &&
    Math.abs(state.walk.z + 34.45) < WALK.radius + 0.9 &&
    Math.abs(state.walk.x) < 18
  )
    return fail('Torbereich belegt. Erst vollständig durchfahren.');
  if (action === 92)
    return {
      ...state,
      hangar: { ...state.hangar, gate: state.hangar.position <= 0 ? 'closed' : 'closing' },
      error: false,
      message:
        state.hangar.position <= 0 ? 'Hangartor ist bereits geschlossen.' : 'Hangartor schließt.',
    };
  return fail('Unbekannte Torbedienung.');
}
export function advanceHangar(state: MachineState, dt: number): MachineState {
  const h = state.hangar;
  if (
    h.gate === 'closing' &&
    Math.abs(state.walk.z + 34.45) < WALK.radius + 0.9 &&
    Math.abs(state.walk.x) < 18
  )
    return {
      ...state,
      hangar: { ...h, gate: 'stopped' },
      error: true,
      message: 'Tor angehalten: Durchfahrt belegt.',
    };
  if (h.gate !== 'opening' && h.gate !== 'closing') return state;
  // The independently supplied hall drive completes travel even if Mech power is lost.
  const position = Math.max(
    0,
    Math.min(1, h.position + ((h.gate === 'opening' ? 1 : -1) * dt) / 10),
  );
  const gate: HangarState['gate'] = position === 1 ? 'open' : position === 0 ? 'closed' : h.gate;
  return {
    ...state,
    hangar: { gate, position },
    ...(gate !== h.gate
      ? {
          message:
            gate === 'open'
              ? 'Hangartor offen. Durchfahrt zum Testgelände frei.'
              : 'Hangartor geschlossen.',
          error: false,
        }
      : {}),
  };
}
