import {actualDriveLoad} from './walking';
import {hydraulicReadings} from './hydraulics';
import type {MachineState} from './machine';

// Engineering choices for this fictional machine, not BattleTech specifications.
// The 28 V service bus is separate from the reactor's high-power propulsion bus.
export const ELECTRICAL={batteryAh:50,minimumCharge:.03,chargeAmps:20,apuKW:12,groundKW:18,mainKW:30};
export type PowerSource='ground'|'main'|'apu'|'battery'|'off';
export type ServicePage='cooling'|'electrical'|'hydraulics'|'faults';
export type ServiceAlert='pumpA'|'groundTrip'|'mainTrip'|'apuTrip'|'battery'|'leak'|'coolantLow'|'hydraulic'|'sensor';
export type ServiceState={coolantLeak:boolean;leakIsolated:boolean;hydraulicFault:boolean;sensorFault:boolean;acknowledgedWarnings:ServiceAlert[];page:ServicePage;mode:'manual'|'auto';pump:'A'|'B';pumpAFault:boolean;faultAcknowledged:boolean;reservoirLitres:number;outletTemperature:number;pumpAFlow:number;pumpBFlow:number;batteryAh:[number,number];groundConnected:boolean;trips:{ground:boolean;main:boolean;apu:boolean};overloadSeconds:number};
export function initialService():ServiceState{return {coolantLeak:false,leakIsolated:false,hydraulicFault:false,sensorFault:false,acknowledgedWarnings:[],page:'cooling',mode:'manual',pump:'A',pumpAFault:false,faultAcknowledged:false,reservoirLitres:240,outletTemperature:18,pumpAFlow:0,pumpBFlow:0,batteryAh:[50,50],groundConnected:false,trips:{ground:false,main:false,apu:false},overloadSeconds:0};}
export const batteryUsable=(s:MachineState,i:number)=>s.service.batteryAh[i]>ELECTRICAL.batteryAh*ELECTRICAL.minimumCharge;
export function generatorSource(s:MachineState):'ground'|'main'|'apu'|null{
 if(s.overhead.mainGen&&s.stage>=4&&!s.service.trips.main)return 'main';
 if(s.service.groundConnected&&!s.service.trips.ground)return 'ground';
 if(s.overhead.apuGen&&s.overhead.apuPhase==='running'&&!s.service.trips.apu)return 'apu';
 return null;
}
export function dcSupply(s:MachineState){return !!generatorSource(s)||(s.overhead.battery1&&batteryUsable(s,0))||(s.overhead.battery2&&batteryUsable(s,1));}
export function apuStartAvailable(s:MachineState){
 if(generatorSource(s))return true;
 if(!s.overhead.battery1||!s.overhead.battery2||!batteryUsable(s,0)||!batteryUsable(s,1))return false;
 // Check the loaded bus, not just charge percentage, before engaging the starter.
 return electricalReadings({...s,overhead:{...s.overhead,fuelPump:true,apuPhase:'starting'}}).voltage>=21;
}
export const serviceCoolingEnabled=(s:MachineState)=>s.stage>=2&&s.overhead.coolantValve&&!!generatorSource(s);
export function selectedPump(s:MachineState):'A'|'B'|null{
 if(!serviceCoolingEnabled(s)||s.service.reservoirLitres<24)return null;
 if(s.service.pump==='B')return 'B';
 if(!s.service.pumpAFault)return 'A';
 return s.service.mode==='auto'?'B':null;
}
export function effectiveCoolingLevel(s:MachineState){
 // A proportional temperature controller; the pilot's manual setting is retained.
 return s.service.mode==='manual'?s.coolingLevel:Math.max(1,Math.min(3,1+(s.temperature-42)/18));
}
export function targetCoolantFlow(s:MachineState){
 if(!selectedPump(s))return 0;
 const level=effectiveCoolingLevel(s);
 const nominal=level<=2?24+(level-1)*18.8:42.8+(level-2)*19.2;
 return nominal*(s.service.leakIsolated?.7:1)*Math.min(1,s.service.reservoirLitres/72);
}
export function auxiliaryLoads(s:MachineState){
 const dc=dcSupply(s),main=!!generatorSource(s)&&(s.stage>0||s.busy===0);
 return [
  {label:'Steuerbus / Instrumente',kw:dc?.18+(main?.38:0):0},
  {label:'Kabinenbeleuchtung',kw:dc?.06+s.ceilingBrightness*.18+(s.light&&main?.18:0):0},
  {label:'APU / Starter',kw:dc&&s.overhead.fuelPump?.12+(s.overhead.apuPhase==='starting'?6.5:0):0},
  {label:'Kühlpumpe / Wärmetauscher',kw:main&&selectedPump(s)?.55+effectiveCoolingLevel(s)*.48:0},
  {label:'Hilfshydraulik',kw:hydraulicReadings(s).powerKW},
  {label:'Kabinenlüfter',kw:main?s.fanLevel*.12:0},
  {label:'Reaktorsteuerung / Gyro',kw:main?(s.stage>=4?1.1+actualDriveLoad(s)*5:s.busy===3?2:0)+(s.stage>=5?.65:0):0},
 ];
}
// Resting lead-acid voltage and resistance at room temperature. Tuned for the
// fictional 2 x 24 V / 50 Ah installation, not a certified aircraft battery model.
export function batteryOpenVoltage(soc:number){
 const points=[[0,22.8],[.1,23.6],[.25,24.1],[.5,24.6],[.75,25.1],[1,25.6]];
 const x=Math.max(0,Math.min(1,soc));
 for(let i=1;i<points.length;i++)if(x<=points[i][0]){const [a,v]=points[i-1],[b,w]=points[i];return v+(w-v)*(x-a)/(b-a);}
 return 25.6;
}
export function electricalReadings(s:MachineState){
 const generator=generatorSource(s),connected=[s.overhead.battery1,s.overhead.battery2];
 const live=connected.map((on,i)=>on&&batteryUsable(s,i));
 const source:PowerSource=generator??(live.some(Boolean)?'battery':'off');
 const loadKW=auxiliaryLoads(s).reduce((sum,row)=>sum+row.kw,0);
 const capacityKW=generator?({ground:ELECTRICAL.groundKW,main:ELECTRICAL.mainKW,apu:ELECTRICAL.apuKW}[generator]):0;
 const soc=s.service.batteryAh.map(ah=>Math.max(0,Math.min(1,ah/ELECTRICAL.batteryAh)));
 const openVoltage=soc.map(batteryOpenVoltage),resistance=soc.map(v=>.016+.06*(1-v)**3);
 let voltage=0,batteryAmps=[0,0];
 if(generator){
  voltage=28.25-.15*Math.min(1,loadKW/capacityKW);
  const charging=connected.map((on,i)=>on?Math.min(ELECTRICAL.chargeAmps,(1-soc[i])*200):0);
  const scale=Math.min(1,Math.max(0,capacityKW-loadKW)/Math.max(.001,charging.reduce((a,b)=>a+b,0)*voltage/1000));
  batteryAmps=charging.map(a=>-a*scale);
 }else if(live.some(Boolean)){
  // Parallel packs with reverse-current isolation. Remove a lower-voltage pack
  // if the solution would charge it from the other battery.
  let active=[...live];
  for(let pass=0;pass<2;pass++){
   const g=resistance.reduce((v,r,i)=>v+(active[i]?1/r:0),0);
   const e=openVoltage.reduce((v,u,i)=>v+(active[i]?u/resistance[i]:0),0)/g;
   const discriminant=e*e-4*loadKW*1000/g;
   voltage=discriminant>=0?(e+Math.sqrt(discriminant))/2:0;
   const filtered=active.map((on,i)=>on&&openVoltage[i]>=voltage);
   if(filtered.every((on,i)=>on===active[i]))break;
   active=filtered;
  }
  batteryAmps=live.map((on,i)=>on?Math.max(0,(openVoltage[i]-voltage)/resistance[i]):0);
 }
 const batteryVoltage=openVoltage.map((v,i)=>generator&&connected[i]?voltage:live[i]&&batteryAmps[i]>0?voltage:v);
 const chargingKW=generator?-batteryAmps.reduce((a,b)=>a+b,0)*voltage/1000:0;
 const availableAh=s.service.batteryAh.reduce((sum,ah,i)=>sum+(live[i]?Math.max(0,ah-ELECTRICAL.minimumCharge*ELECTRICAL.batteryAh):0),0);
 return {source,loadKW,capacityKW,voltage,batteryVoltage,batteryAmps,soc,inputKW:loadKW+chargingKW,remainingMinutes:source==='battery'&&loadKW>0?availableAh*voltage/(loadKW*1000)*60:null,lowBattery:source==='battery'&&(voltage<23||live.some((on,i)=>on&&soc[i]<.2)),overloaded:!!generator&&loadKW>capacityKW};
}
export function leakRate(s:MachineState){return s.service.coolantLeak&&!s.service.leakIsolated&&s.service.reservoirLitres>0?Math.min(1.5,s.coolantFlow*.025):0;}
export function advanceService(s:MachineState,dt:number):MachineState{
 const r=electricalReadings(s),service={...s.service,trips:{...s.service.trips},batteryAh:s.service.batteryAh.map((ah,i)=>Math.max(0,Math.min(ELECTRICAL.batteryAh,ah-r.batteryAmps[i]*dt/3600))) as [number,number]};
 service.reservoirLitres=Math.max(0,service.reservoirLitres-leakRate(s)*dt);
 service.overloadSeconds=r.overloaded?service.overloadSeconds+dt:0;
 let next={...s,service};
 if(service.overloadSeconds>=2&&['ground','main','apu'].includes(r.source)){
  service.trips[r.source as 'ground'|'main'|'apu']=true;service.overloadSeconds=0;
  next={...next,error:true,message:'Überlast: '+sourceLabel(r.source)+' getrennt. Last reduzieren; Schutz im Elektrikdisplay zurücksetzen.'};
 }
 service.acknowledgedWarnings=service.acknowledgedWarnings.filter(key=>serviceAlerts(next).includes(key));
 return next;
}
export function sourceLabel(source:PowerSource){return {ground:'HANGARSTROM',main:'MAIN GEN',apu:'APU GEN',battery:'BATTERIEBUS',off:'KEINE VERSORGUNG'}[source];}
export function serviceAlerts(s:MachineState):ServiceAlert[]{
 const alerts:ServiceAlert[]=[];
 if(s.service.pumpAFault)alerts.push('pumpA');
 if(s.service.coolantLeak)alerts.push('leak');
 if(s.service.reservoirLitres<72)alerts.push('coolantLow');
 if(s.service.hydraulicFault)alerts.push('hydraulic');
 if(s.service.sensorFault)alerts.push('sensor');
 for(const key of ['ground','main','apu'] as const)if(s.service.trips[key])alerts.push((key+'Trip') as ServiceAlert);
 if(electricalReadings(s).lowBattery)alerts.push('battery');
 return alerts;
}
export function unacknowledgedServiceAlerts(s:MachineState){return serviceAlerts(s).filter(key=>!(key==='pumpA'&&s.service.faultAcknowledged)&&!s.service.acknowledgedWarnings.includes(key));}
export function serviceWarning(s:MachineState){return unacknowledgedServiceAlerts(s).length>0;}


// These rectangles are shared by the canvas and the 3D picking planes.
export type ServiceControl={action:number;x:number;y:number;w:number;h:number;page?:ServicePage;label:string};
export const SERVICE_CONTROLS:ServiceControl[]=[
 {action:60,x:36,y:99,w:210,h:48,label:'Kühlung anzeigen'},
 {action:61,x:262,y:99,w:210,h:48,label:'Elektrik anzeigen'},
 {action:62,x:488,y:99,w:210,h:48,label:'Hydraulik anzeigen'},
 {action:70,x:714,y:99,w:210,h:48,label:'Übungsstörungen anzeigen'},
 {action:71,x:36,y:438,w:432,h:48,page:'faults',label:'Kühlmittelleck auslösen'},
 {action:72,x:492,y:438,w:432,h:48,page:'faults',label:'Leckzweig absperren / öffnen'},
 {action:73,x:36,y:493,w:432,h:48,page:'faults',label:'Leck im kalten Zustand reparieren'},
 {action:74,x:492,y:493,w:432,h:48,page:'faults',label:'Kühlmittel im kalten Zustand auffüllen'},
 {action:75,x:36,y:548,w:432,h:48,page:'faults',label:'Hydraulikausfall simulieren / zurücksetzen'},
 {action:76,x:492,y:548,w:432,h:48,page:'faults',label:'Lagesensorfehler simulieren / zurücksetzen'},
 {action:67,x:36,y:603,w:888,h:48,page:'faults',label:'Warnungen quittieren'},
 {action:63,x:36,y:536,w:284,h:48,page:'cooling',label:'Kühlregelung AUTO / HAND'},
 {action:64,x:338,y:536,w:284,h:48,page:'cooling',label:'Kühlmittelpumpe A wählen'},
 {action:65,x:640,y:536,w:284,h:48,page:'cooling',label:'Reservepumpe B wählen'},
 {action:66,x:36,y:602,w:432,h:48,page:'cooling',label:'Pumpenstörung A simulieren / zurücksetzen'},
 {action:67,x:492,y:602,w:432,h:48,page:'cooling',label:'Pumpenwarnung quittieren'},
 {action:68,x:36,y:602,w:284,h:48,page:'electrical',label:'Hangarstrom verbinden / trennen'},
 {action:67,x:338,y:602,w:284,h:48,page:'electrical',label:'Warnungen quittieren'},
 {action:69,x:640,y:602,w:284,h:48,page:'electrical',label:'Überlastschutz zurücksetzen'},
];
