import type { MachineState } from './machine';
import { dcSupply, unacknowledgedServiceAlerts } from './service-systems';

// Different recordings have different source levels: the drive is about
// 16 dB quieter (RMS) than the coolant pump, so equal gains would mask it.
export const AUDIO_LEVELS = {
  driveIdle: 2.4,
  driveLoad: 1,
  actuator: 0.8,
  apuIdle: 0.35,
  apuLoaded: 0.45,
  gyro: 0.52,
  pump: 0.58,
  gate: 0.8,
  step: 0.85,
  calibration: 0.65,
  warning: 0.9,
  switch: 1.2,
  displayBoot: 1,
} as const;
export function ambientGain(s: MachineState) {
  const alert = dcSupply(s) && unacknowledgedServiceAlerts(s).length > 0;
  const calibration =
    dcSupply(s) && s.overhead.avionics && s.mobility.helmet && s.mobility.calibration === 'running';
  // Keep warnings and calibration intelligible without turning off running systems.
  return alert || calibration ? 0.5 : 1;
}
