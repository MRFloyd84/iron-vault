import type {MachineState} from './machine';
import {dcSupply,unacknowledgedServiceAlerts} from './service-systems';

// Different recordings have different source levels: the drive is about
// 16 dB quieter (RMS) than the coolant pump, so equal gains would mask it.
export const AUDIO_LEVELS={driveIdle:2.4,driveLoad:1,actuator:.8,apuIdle:.35,apuLoaded:.45,gyro:.52,pump:.58,gate:.8,step:.85,calibration:.65,warning:.9,switch:1.2,displayBoot:1} as const;
export function ambientGain(s:MachineState){
 const alert=dcSupply(s)&&unacknowledgedServiceAlerts(s).length>0;
 const calibration=dcSupply(s)&&s.overhead.avionics&&s.mobility.helmet&&s.mobility.calibration==='running';
 // Keep warnings and calibration intelligible without turning off running systems.
 return (alert||calibration)?.5:1;
}
