import type { MachineState } from './machine';
import { generatorSource } from './service-systems';

// Auxiliary pilot/control circuit; the reactor's main actuators use a separate
// high-power drive. Bar, litres, L/min. A 1 L gas accumulator, 100 bar precharge,
// polytropic compression (n=1.2), plus hose/fluid compliance.
const PRECHARGE = 100,
  VOLUME = 1,
  N = 1.2,
  COMPLIANCE = 0.0005;
export function accumulatorOil(pressure: number) {
  return pressure <= PRECHARGE ? 0 : VOLUME * (1 - (PRECHARGE / pressure) ** (1 / N));
}
function storedOil(p: number) {
  return p * COMPLIANCE + accumulatorOil(p);
}
function pressureFromOil(oil: number) {
  let low = 0,
    high = 310;
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2;
    if (storedOil(mid) > oil) high = mid;
    else low = mid;
  }
  return (low + high) / 2;
}
export function hydraulicReadings(s: MachineState) {
  const powered =
    s.stage >= 1 && s.overhead.hydPump && !s.service.hydraulicFault && !!generatorSource(s);
  const motion = Math.min(
    1,
    Math.abs(s.walk.speed) / 2.2 +
      (Math.abs(s.walk.turnRate) / 0.28) * 0.4 +
      s.articulation.effort * 0.35,
  );
  const test = s.testPhase === 'actuators' ? 1 : 0;
  const leakage = 0.12 * Math.sqrt(Math.max(0, s.actualPressure) / 210);
  const demand = leakage + (motion * 6 + test * 1.2) * Math.min(1, s.actualPressure / 140);
  // Pressure-compensated variable displacement pump; reserve flow responds to
  // pressure droop. No full delivery / full electrical load while idling.
  const pumpFlow = powered
    ? Math.min(12, Math.max(0, (s.hydraulicPressure - s.actualPressure) * 2))
    : 0;
  const dumping = s.shutdownPhase === 'isolate' && s.stage === 0 && !powered;
  const relief =
    (dumping ? s.actualPressure * 0.08 : 0) +
    Math.max(0, s.actualPressure - s.hydraulicPressure) * 0.3 +
    (s.service.hydraulicFault ? 8 : 0);
  const powerKW = powered ? 0.22 + (s.actualPressure * pumpFlow) / 600 / 0.8 : 0;
  return {
    powered,
    dumping,
    pumpFlow,
    demand,
    relief,
    powerKW,
    motion,
    reserveLitres: Math.max(0, accumulatorOil(s.actualPressure) - accumulatorOil(140)),
    accumulatorLitres: accumulatorOil(s.actualPressure),
  };
}
export function advanceHydraulics(s: MachineState, dt: number): MachineState {
  // Fixed substeps keep fast pressure compensation stable at 30/60/120 Hz.
  let next = s,
    remaining = dt;
  while (remaining > 1e-8) {
    const step = Math.min(0.01, remaining),
      r = hydraulicReadings(next);
    const oil = Math.max(
      0,
      storedOil(next.actualPressure) + ((r.pumpFlow - r.demand - r.relief) * step) / 60,
    );
    const pressure = pressureFromOil(oil);
    next = { ...next, actualPressure: pressure < 0.05 ? 0 : pressure };
    remaining -= step;
  }
  return next;
}
