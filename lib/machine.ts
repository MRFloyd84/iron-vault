import {initialArticulation,advanceArticulation,stopArticulation,type Articulation} from './articulation';
import {advanceHydraulics} from './hydraulics';
import {initialWalk,advanceWalking,actualDriveLoad,atServiceBay,walkingStopped,type WalkState} from './walking';
import {initialHangar,advanceHangar,type HangarState} from './hangar';
import {initialMobility,advanceMobility,linkReady,type MobilityState} from './mobility';
import {initialService,dcSupply,generatorSource,apuStartAvailable,batteryUsable,advanceService,selectedPump,targetCoolantFlow,serviceAlerts,type ServiceState} from './service-systems';
export const STEPS = [
  {name:'Hauptstrom',label:'MASTER POWER',seconds:1.2,ready:'VERSORGUNG AKTIV'},
  {name:'Kühlung',label:'COOLANT PUMP',seconds:2.5,ready:'KREISLAUF STABIL'},
  {name:'Diagnose',label:'SYSTEM CHECK',seconds:4,ready:'PRÜFUNG BESTANDEN'},
  {name:'Reaktor',label:'REACTOR START',seconds:6,ready:'REAKTOR ONLINE'},
  {name:'Stabilisierung',label:'GYRO ALIGN',seconds:3,ready:'GYRO SYNCHRON'},
  {name:'Steuerfreigabe',label:'CONTROL LINK',seconds:2,ready:'MASCHINE BEREIT'},
];
export type TestPhase='idle'|'hydraulics'|'actuators'|'sensors'|'passed'|'aborted';
export type ShutdownPhase='idle'|'prepare'|'cooldown'|'isolate'|'interrupted'|'complete';
export const testRunning=(s:MachineState)=>['hydraulics','actuators','sensors'].includes(s.testPhase);
export const actuatorMoving=(s:MachineState)=>s.testPhase==='actuators'&&s.stage>=5&&s.throttle===0&&s.hydraulicPressure===210&&Math.abs(s.actualPressure-210)<=5;
export type MachineState = {articulation:Articulation;walk:WalkState;hangar:HangarState;mobility:MobilityState;service:ServiceState;overhead:OverheadState;stage:number;busy:number;progress:number;started:number;message:string;error:boolean;light:boolean;throttle:number;fanLevel:number;displayBrightness:number;ceilingBrightness:number;hydraulicPressure:number;radarRange:number;radarPaused:boolean;hudEnabled:boolean;actualPressure:number;temperature:number;coolingLevel:number;coolantFlow:number;heatLoad:number;thermalWarning:boolean;thermalLimited:boolean;shutdownPhase:ShutdownPhase;cooldownElapsed:number;simAt:number;testPhase:TestPhase;testElapsed:number;testHold:number;testSensors:number;testResults:boolean[];testMessage:string};
export function initialState():MachineState{return {articulation:initialArticulation(),walk:initialWalk(),hangar:initialHangar(),mobility:initialMobility(),service:initialService(),overhead:initialOverhead(),stage:0,busy:-1,progress:0,started:0,message:'Kaltstart: Overhead öffnen [O], BAT 1 und BAT 2 einschalten.',error:false,light:false,throttle:0,fanLevel:2,displayBrightness:1,ceilingBrightness:.7,hydraulicPressure:210,radarRange:250,radarPaused:false,hudEnabled:true,actualPressure:0,temperature:18,coolingLevel:2,coolantFlow:0,heatLoad:0,thermalWarning:false,thermalLimited:false,shutdownPhase:'idle',cooldownElapsed:0,simAt:-1,testPhase:'idle',testElapsed:0,testHold:0,testSensors:0,testResults:[false,false,false],testMessage:'Bis GYRO [5] starten, dann Systemtest ausführen.'};}
export function command(state:MachineState,index:number,now:number):MachineState{
  if(index===0&&(state.stage>0||state.busy>=0)){
   const orderly=state.shutdownPhase==='isolate'&&state.stage<2;
   const interrupted=!orderly&&(shutdownActive(state)||state.stage>=4||state.busy===3||state.heatLoad>.08||state.temperature>45);
   return advanceMobility({...initialState(),articulation:stopArticulation(state).articulation,walk:state.walk,hangar:state.hangar,mobility:{...state.mobility,calibration:'idle',elapsed:0},service:state.service,ceilingBrightness:state.ceilingBrightness,coolingLevel:state.coolingLevel,overhead:{...state.overhead,mainGen:false,reactorArm:false},actualPressure:state.actualPressure,temperature:state.temperature,coolantFlow:state.coolantFlow,heatLoad:state.heatLoad,thermalWarning:state.thermalWarning,thermalLimited:state.thermalLimited,shutdownPhase:orderly?'isolate':interrupted?'interrupted':'idle',cooldownElapsed:orderly?state.cooldownElapsed:0,simAt:now,testPhase:testRunning(state)?'aborted':'idle',testResults:testRunning(state)?state.testResults:[false,false,false],testMessage:testRunning(state)?'Test abgebrochen: Hauptstrom getrennt.':'Bis GYRO [5] starten, dann Systemtest ausführen.',error:interrupted,message:interrupted?'Abschaltung unterbrochen. Restwärme bleibt: Hangar-/APU-Versorgung und Kühlung wiederherstellen, dann [K].':'Hauptstrom getrennt. Overhead und APU bleiben separat bedienbar.'},0);
  }
  const fail=(message:string)=>({...state,error:true,message});
  if(index<0||index>=STEPS.length)return fail('Unbekannter Startschalter.');
  if(state.busy>=0)return fail('Startvorgang läuft. Bitte Abschluss abwarten.');
  if(state.shutdownPhase==='prepare'){
   if(index===5&&state.stage===6){if(state.mobility.restraints!=='locked')return fail('Zuerst am rechten Display Parkverriegelung schließen.');if(state.throttle>0)return fail('Zuerst Leistungshebel auf 0 % zurücknehmen.');return {...state,stage:5,error:false,message:'Steuerung gesperrt. GYRO [5] ausschalten.'};}
   if(index===4&&state.stage===5&&state.mobility.restraints!=='locked')return fail('Vor GYRO AUS Parkverriegelung schließen.');
   if(index===4&&state.stage===5)return {...state,stage:4,error:false,message:'Gyro aus. Hangarstrom oder APU GEN für die Nachkühlung bereitstellen.'};
   if(index===3&&state.stage===4){
    if(state.throttle>0||!afterrunSupply(state)||!dcPowerAvailable(state))return fail('Reaktor AUS gesperrt: 0 % Leistung und APU GEN oder Hangarstrom für die Nachkühlung erforderlich.');
    if(state.overhead.mainGen)return fail('Nachkühlversorgung bereit. Jetzt MAIN GEN im Overhead trennen.');
    return {...state,stage:3,throttle:0,shutdownPhase:'cooldown',cooldownElapsed:0,overhead:{...state.overhead,reactorArm:false,mainGen:false},error:false,message:'Reaktor aus. Nachkühlung läuft – Strom und Kühlung eingeschaltet lassen.'};
   }
   return fail(shutdownInstruction(state));
  }
  if(state.shutdownPhase==='cooldown')return fail('Nachkühlung läuft. Freigabe im Abschaltdisplay abwarten.');
  if(state.shutdownPhase==='isolate'){
   if(index===1&&state.stage>=2)return {...state,stage:1,error:false,message:'Kühlkreislauf gestoppt. Hauptstrom [1] ausschalten.'};
   return fail(shutdownInstruction(state));
  }
  if(index<state.stage)return {...state,message:STEPS[index].name+' ist bereits aktiv.',error:false};
  if(index!==state.stage)return fail('Start gesperrt: zuerst '+STEPS[state.stage].name+' aktivieren.');
  const o=state.overhead;
  if(!mainPowerAvailable(state))return fail('Hauptstrom gesperrt: '+nextStartInstruction(state));
  if(index===1&&!o.coolantValve)return fail('Kühlung gesperrt: COOLANT VALVE im Overhead einschalten.');
  if(index===2&&!o.avionics)return fail('Diagnose gesperrt: AVIONICS im Overhead einschalten.');
  if(index===2&&!o.hydPump)return fail('Diagnose gesperrt: HYD PUMP im Overhead einschalten.');
  if(index===2&&state.actualPressure<140)return fail('Diagnose wartet auf Hydraulikdruck: mindestens 140 bar erforderlich.');
  if(index===3&&state.coolantFlow<20)return fail('Reaktor gesperrt: mindestens 20 L/s Kühlfluss erforderlich. Kühlpumpe prüfen.');
  if(index===3&&!o.reactorArm)return fail('Reaktor gesperrt: REACTOR ARM im Overhead einschalten.');
  if(index===3&&(state.temperature>60||state.heatLoad>.08||state.shutdownPhase==='interrupted'))return fail('Heißstart gesperrt: Nachkühlung über [K] abschließen.');
  if(index===4&&!o.mainGen)return fail('Stabilisierung gesperrt: MAIN GEN im Overhead zuschalten.');
  if(index===5&&!linkReady(state))return fail('LINK gesperrt: rechts Neurohelm verbinden und kalibrieren, Systemtest [T] bestehen; Systemzustand prüfen.');
  return {...state,busy:index,progress:0,started:now,error:false,message:STEPS[index].name+' wird gestartet …'};
}
export function startSystemTest(state:MachineState):MachineState{
 if(shutdownActive(state))return {...state,error:true,message:'Systemtest gesperrt: Abschaltsequenz aktiv.'};
 if(testRunning(state))return {...state,testPhase:'aborted',testMessage:'Systemtest manuell abgebrochen.',message:'Systemtest abgebrochen.',error:false};
 if(state.stage<5)return {...state,error:true,message:'Systemtest gesperrt: zuerst bis GYRO [5] starten.',testMessage:'Zuerst bis GYRO [5] starten.'};
 if(state.busy>=0||state.mobility.restraints!=='locked')return {...state,error:true,message:'Systemtest benötigt verriegelten Prüfstand und abgeschlossene Startschritte.'};
 if(state.service.hydraulicFault||state.service.sensorFault)return {...state,error:true,message:'Vor dem Systemtest Hydraulik- und Sensorstörungen beheben.'};
 if(state.throttle>0)return {...state,error:true,message:'Systemtest gesperrt: Leistungshebel auf 0 % stellen.',testMessage:'Leistungshebel auf 0 % stellen, dann Test starten.'};
 return {...state,stage:Math.min(state.stage,5),mobility:{...state.mobility,page:'test'},testPhase:'hydraulics',testElapsed:0,testHold:0,testSensors:0,testResults:[false,false,false],testMessage:'Hydraulik auf 210 bar einstellen. Druck wird stabilisiert.',message:'Systemtest gestartet. Folge dem rechten Zusatzdisplay.',error:false};
}
export function tick(state:MachineState,now:number):MachineState{
 const dt=state.simAt<0?0:Math.max(0,Math.min(.5,(now-state.simAt)/1000));
 let s=reconcilePower({...advanceHangar(state,dt),simAt:now,overhead:{...state.overhead}});
 const o=s.overhead;
 if(o.apuPhase==='preparing'||o.apuPhase==='starting'){
  const starting=o.apuPhase==='starting';o.apuProgress=Math.min(1,Math.max(0,(now-o.apuStarted)/(starting?9000:2500)));
  if(o.apuProgress>=1){o.apuPhase=starting?'running':'ready';o.apuProgress=starting?1:0;s.message=starting?'APU verfügbar. APU GEN im Overhead zuschalten.':'APU vorbereitet. START im Overhead drücken.';s.error=false;}
 }
 s=reconcilePower(advanceService(s,dt));
 s=advanceHydraulics(s,dt);
 s=advanceThermal(s,dt);
 if(s.busy>=0){
  const progress=Math.min(1,Math.max(0,(now-s.started)/(STEPS[s.busy].seconds*1000)));
  if(progress<1)s={...s,progress};
  else{const stage=s.busy+1;s={...s,stage,busy:-1,progress:0,error:false,light:stage===1?true:s.light,message:''};s.message=stage===6?'Alle Systeme online. Steuerfreigabe bereit; Parkverriegelung rechts bedienen.':nextStartInstruction(s);}
 }
 s=advanceArticulation(advanceWalking(advanceMobility(advanceShutdown(s,dt),dt),dt),dt);
 if(!testRunning(s))return s;
 if(s.stage<5||s.throttle>0||s.service.hydraulicFault||s.service.sensorFault)return {...s,testPhase:'aborted',testMessage:s.throttle>0?'Abbruch: Leistungshebel während des Tests betätigt.':'Abbruch: Systemversorgung oder Sensorik gestört.',message:'Systemtest abgebrochen. Ursache im Prüfdisplay.',error:true};
 if(s.testPhase==='hydraulics'){
  const stable=s.hydraulicPressure===210&&Math.abs(s.actualPressure-210)<3;
  s.testHold=stable?s.testHold+dt:0;
  s.testMessage=s.hydraulicPressure!==210?'Hydraulik links auf 210 bar einstellen.':stable?'Druck stabil. Halteprüfung '+Math.min(3,s.testHold).toFixed(1)+' / 3,0 s.':'Druckaufbau: '+Math.round(s.actualPressure)+' / 210 bar.';
  if(s.testHold>=3)s={...s,testPhase:'actuators',testElapsed:0,testHold:0,testResults:[true,false,false],testMessage:'Aktuatorprüfung: linker Arm.'};
 }else if(s.testPhase==='actuators'){
  if(!actuatorMoving(s)){s.testMessage='Prüfung pausiert. Hydraulik auf 210 bar stabilisieren.';return s;}
  s.testElapsed+=dt;const limb=Math.min(3,Math.floor(s.testElapsed/2.5));
  s.testMessage='Aktuatorprüfung: '+['linker Arm','rechter Arm','linkes Bein','rechtes Bein'][limb]+'.';
  if(s.testElapsed>=10)s={...s,testPhase:'sensors',testElapsed:0,testHold:0,testResults:[true,true,false],testMessage:'Sensor 1 / 3: Radar rechts auf 125 m einstellen.'};
 }else if(s.testPhase==='sensors'){
  const range=[125,250,500][s.testSensors];
  const stable=!s.radarPaused&&s.radarRange===range;
  s.testHold=stable?s.testHold+dt:0;
  s.testMessage=s.radarPaused?'Radarsuche rechts auf RUN stellen.':s.radarRange!==range?'Sensor '+(s.testSensors+1)+' / 3: Radar auf '+range+' m einstellen.':'Testkontakt '+(s.testSensors+1)+' wird erfasst … '+Math.min(100,Math.round(s.testHold/2.5*100))+' %';
  if(s.testHold>=2.5){s.testSensors++;s.testHold=0;if(s.testSensors===3)s={...s,testPhase:'passed',testResults:[true,true,true],testMessage:'Alle Prüfungen bestanden. Neurohelm prüfen, danach LINK [6].',message:'Systemtest bestanden: Hydraulik, Aktuatoren und Sensoren bereit.',error:false};else s.testMessage='Sensor '+(s.testSensors+1)+' / 3: Radar auf '+[125,250,500][s.testSensors]+' m einstellen.';}
 }
 return s;
}

export function auxiliary(state:MachineState,action:number):MachineState{
 const fail=(message:string)=>({...state,error:true,message});
 if(action===31||action===32){
  if(!dcPowerAvailable(state))return fail('Rotlicht benötigt BAT 1 oder BAT 2.');
  const ceilingBrightness=Math.max(0,Math.min(10,Math.round(state.ceilingBrightness*10)+(action===31?1:-1)))/10;
  return {...state,ceilingBrightness,error:false,message:'Rote Deckenlampe: '+Math.round(ceilingBrightness*100)+' %.'};
 }
 if(state.stage<1)return fail('Bedienung gesperrt: zuerst Hauptstrom einschalten [1].');
 if(action===33||action===34){
  const coolingLevel=Math.max(1,Math.min(3,state.coolingLevel+(action===33?1:-1)));
  return {...state,coolingLevel,service:{...state.service,mode:'manual'},error:false,message:'Reaktorkühlung HAND: Stufe '+coolingLevel+' / 3. Kabinenlüfter bleibt unabhängig.'};
 }
 if([23,24,25,29].includes(action)&&state.stage<5)return fail('Sensorbedienung gesperrt: zuerst Stabilisierung starten [5].');
 if([21,27].includes(action)&&(!state.overhead.hydPump||!mainPowerAvailable(state)))return fail('Hydraulik gesperrt: HYD PUMP und Hauptversorgung prüfen.');
 const cycle=(values:number[],value:number,back=false)=>values[(values.indexOf(value)+(back?values.length-1:1))%values.length];
 let next={...state,error:false};
 if(action===20||action===26){next.fanLevel=cycle([0,1,2,3],state.fanLevel,action===26);next.message='Kabinenlüfter: '+(next.fanLevel?'Stufe '+next.fanLevel+' / 3.':'ausgeschaltet.');}
 else if(action===21||action===27){next.hydraulicPressure=cycle([150,210,280],state.hydraulicPressure,action===27);next.message='Hydraulikdruck: '+next.hydraulicPressure+' bar. Aktuatoren im Hangar verriegelt.';}
 else if(action===22||action===28){next.displayBrightness=cycle([.4,.7,1],state.displayBrightness,action===28);next.message='Instrumentenhelligkeit: '+Math.round(next.displayBrightness*100)+' %.';}
 else if(action===23||action===29){next.radarRange=cycle([125,250,500,1000],state.radarRange,action===29);next.message='Radarreichweite: '+next.radarRange+' m.';}
 else if(action===24){next.radarPaused=!state.radarPaused;next.message=next.radarPaused?'Radarsuche angehalten. Letztes Lagebild bleibt sichtbar.':'Radarsuche fortgesetzt.';}
 else if(action===25){next.hudEnabled=!state.hudEnabled;next.message=next.hudEnabled?'HUD eingeblendet.':'HUD ausgeblendet.';}
 else return fail('Unbekanntes Bedienelement.');
 return next;
}

export function pressureReleased(previous:MachineState|null,next:MachineState):boolean{
 if(!previous||previous.stage<1||(previous.stage<2&&!previous.overhead.hydPump))return false;
 return next.stage<1||(!next.overhead.hydPump&&previous.overhead.hydPump)||(next.stage>=1&&next.hydraulicPressure<previous.hydraulicPressure);
}

// Fictional Mech thermal model. Cabinet ventilation is deliberately independent.
export const THERMAL={ambient:18,warning:85,limit:100,recover:78,release:45,minAfterrun:20} as const;
export function shutdownActive(s:MachineState){return !['idle','complete'].includes(s.shutdownPhase);}
export function coolingPowered(s:MachineState){return selectedPump(s)!==null;}
export function thermalRate(s:MachineState){return 3.6*s.heatLoad-(s.temperature-THERMAL.ambient)*(.003+s.coolantFlow/42.8*.06);}
export function cooldownSafe(s:MachineState){
 // Reserve for all remaining stored heat, even if the pump is stopped now.
 return s.heatLoad<=.08&&s.temperature+s.heatLoad*3.6*18<=THERMAL.release;
}
function advanceThermal(state:MachineState,dt:number):MachineState{
 const s={...state};
 if(s.thermalLimited&&s.stage>=4)s.throttle=Math.min(.25,s.throttle);
 const target=s.stage>=4?.28+actualDriveLoad(s)*.72:s.busy===3?s.progress*.28:0;
 s.heatLoad+=(target-s.heatLoad)*(1-Math.exp(-dt/(target>0?6:18)));
 const flowTarget=targetCoolantFlow(s);
 s.coolantFlow+=(flowTarget-s.coolantFlow)*(1-Math.exp(-dt/1.4));if(s.coolantFlow<.01)s.coolantFlow=0;
 const loss=.003+(state.coolantFlow+s.coolantFlow)/2/42.8*.06;
 const equilibrium=THERMAL.ambient+3.6*(state.heatLoad+s.heatLoad)/2/loss;
 s.temperature=Math.max(THERMAL.ambient,s.temperature+(equilibrium-s.temperature)*(1-Math.exp(-dt*loss)));
 const pump=selectedPump(s);
 const service={...s.service};
 service.pumpAFlow+=(pump==='A'?flowTarget-service.pumpAFlow:-service.pumpAFlow)*(1-Math.exp(-dt/1.4));
 service.pumpBFlow+=(pump==='B'?flowTarget-service.pumpBFlow:-service.pumpBFlow)*(1-Math.exp(-dt/1.4));
 // Equivalent heat-exchanger model: hotter return, cooled supply; no heat vanishes in the pump.
 const removed=Math.max(0,s.temperature-THERMAL.ambient)*(s.coolantFlow/42.8*.06)*900;
 const outlet=s.coolantFlow>.1?s.temperature-removed/(s.coolantFlow*4.18):s.temperature;
 service.outletTemperature=Math.max(THERMAL.ambient,outlet);s.service=service;
 s.thermalWarning=s.temperature>=THERMAL.warning||(state.thermalWarning&&s.temperature>THERMAL.recover);
 s.thermalLimited=s.temperature>=THERMAL.limit||(state.thermalLimited&&s.temperature>THERMAL.recover);
 if(s.thermalLimited&&s.stage>=4)s.throttle=Math.min(.25,s.throttle);
 if(s.thermalLimited&&!state.thermalLimited){s.error=true;s.message='Temperaturschutz: Leistung auf höchstens 25 % begrenzt. Reaktorkühlung rechts erhöhen.';}
 else if(s.thermalWarning&&!state.thermalWarning){s.error=true;s.message='Temperaturwarnung: Reaktorkühlung erhöhen oder Leistung zurücknehmen.';}
 else if(state.thermalWarning&&!s.thermalWarning){s.error=false;s.message='Temperatur wieder im Arbeitsbereich. Leistungsschutz aufgehoben.';}
 return s;
}
export function throttleCommand(state:MachineState,direction?:number):MachineState{
 if(state.stage<6)return {...state,error:true,message:'Leistungshebel gesperrt: Steuerfreigabe fehlt.'};
 const maximum=state.thermalLimited?.25:1;
 const throttle=shutdownActive(state)?0:direction!==undefined?Math.max(0,Math.min(maximum,state.throttle+Math.sign(direction)*.25)):state.throttle>=maximum?0:Math.min(maximum,state.throttle+.25);
 return {...state,throttle,error:false,message:shutdownActive(state)?'Leistung 0 %. Steuerung über LINK [6] sperren.':state.thermalLimited?'Temperaturschutz: '+Math.round(throttle*100)+' %, maximal 25 % bis unter 78 °C.':'Leistungsbegrenzung '+Math.round(throttle*100)+' %. '+(state.mobility.restraints==='locked'?'Verriegelt: stationärer Lasttest.':'W/S gehen, A/D drehen; Leertaste bremst.')};
}
export function startShutdown(state:MachineState):MachineState{
 if(!walkingStopped(state))return {...state,error:true,message:'Vor dem Abschalten anhalten: Leertaste halten.'};
 if(state.shutdownPhase==='complete')return {...state,shutdownPhase:'idle',error:false,message:'Abschaltung abgeschlossen. Neuer Kaltstart über die Batterien im Overhead.'};
 if(state.shutdownPhase==='prepare')return {...state,shutdownPhase:'idle',error:false,message:'Abschaltanleitung beendet. Bereits ausgeschaltete Systeme bei Bedarf erneut starten.'};
 if(state.shutdownPhase==='cooldown'||state.shutdownPhase==='isolate')return {...state,error:false,message:shutdownInstruction(state)};
 if(state.busy>=0)return {...state,error:true,message:'Laufenden Startschritt vor der Abschaltsequenz abschließen.'};
 if(state.stage<1||(state.shutdownPhase==='interrupted'&&state.stage<2))return {...state,error:true,message:state.shutdownPhase==='interrupted'?shutdownInstruction(state):'Keine Hauptsysteme aktiv. Overhead-Versorgung direkt ausschalten.'};
 const phase:ShutdownPhase=state.stage>=4?'prepare':state.stage>=2?'cooldown':cooldownSafe(state)?'isolate':'interrupted';
 const s={...state,shutdownPhase:phase,cooldownElapsed:0,error:false,testPhase:testRunning(state)?'aborted' as const:state.testPhase,testMessage:testRunning(state)?'Systemtest für Abschaltung beendet.':state.testMessage};
 s.message=shutdownInstruction(s);return s;
}
function advanceShutdown(state:MachineState,dt:number):MachineState{
 let s=state;
 if(s.shutdownPhase==='cooldown'){
  if(!coolingPowered(s))return {...s,shutdownPhase:'interrupted',cooldownElapsed:0,error:true,message:'Nachkühlung unterbrochen. Hangarstrom oder APU, Hauptstrom und Kühlkreis wiederherstellen, dann [K].'};
  s={...s,cooldownElapsed:s.coolantFlow>=20?s.cooldownElapsed+dt:0};
  if(s.cooldownElapsed>=THERMAL.minAfterrun&&cooldownSafe(s))s={...s,shutdownPhase:'isolate',error:false,message:'Nachkühlung abgeschlossen. COOLANT [2] ausschalten, danach Hauptstrom [1].'};
 }
 const o=s.overhead;
 if(s.shutdownPhase==='isolate'&&s.stage===0&&s.busy<0&&s.actualPressure<5&&cooldownSafe(s)&&!o.battery1&&!o.battery2&&!o.fuelPump&&!o.apuMaster&&!o.apuGen&&!o.mainGen&&!o.coolantValve&&!o.hydPump&&!o.avionics&&!o.reactorArm&&!s.service.groundConnected&&o.apuPhase==='off')return {...s,shutdownPhase:'complete',error:false,message:'Mech geordnet abgeschaltet. Nachkühlung beendet, Druck abgebaut, Versorgung getrennt.'};
 return s;
}
export function afterrunSupply(s:MachineState){return (s.service.groundConnected&&!s.service.trips.ground)||(s.overhead.apuGen&&s.overhead.apuPhase==='running'&&!s.service.trips.apu);}
function apuShutdownSupplyHint(s:MachineState){
 const o=s.overhead;
 if(!apuStartAvailable(s))return 'Hangarstrom im linken Elektrikdisplay verbinden oder beide geladenen Batterien einschalten.';
 if(!o.fuelPump)return 'Overhead: FUEL PUMP einschalten.';
 if(!o.apuMaster)return 'Overhead: APU MASTER einschalten.';
 if(o.apuPhase==='preparing')return 'APU-Vorbereitung abwarten (READY).';
 if(o.apuPhase==='ready')return 'Overhead: APU START drücken.';
 return 'APU-Hochlauf abwarten (AVAIL).';
}
export function shutdownChecklist(s:MachineState):StartTask[]{
 const o=s.overhead,task=(label:string,done:boolean,hint:string):StartTask=>({label,done,hint});
 if(s.shutdownPhase==='interrupted')return [
  task('Nachkühlversorgung',afterrunSupply(s),'Links ELEKTRIK: Hangarstrom verbinden; alternativ APU starten und APU GEN einschalten.'),
  task('Bus verfügbar',mainPowerAvailable(s),'APU GEN oder Hangarstrom einschalten.'),
  task('Hauptstrom EIN',s.stage>=1,'Hauptstrom [1] einschalten.'),
  task('Kühlversorgung EIN',o.coolantValve,'Overhead: COOLANT VALVE einschalten.'),
  task('Kühlung EIN',s.stage>=2,'COOLANT [2] einschalten.'),
  task('Nachkühlung fortsetzen',false,'Nachkühlung mit SHUTDOWN [K] fortsetzen.'),
 ];
 const stopped=['cooldown','isolate','complete'].includes(s.shutdownPhase),cooled=['isolate','complete'].includes(s.shutdownPhase);
 return [
  task('Leistung 0 %',stopped||s.throttle===0,'Leistungshebel links auf 0 % zurücknehmen.'),
  task('Parkverriegelung ZU',s.mobility.restraints==='locked','Am rechten Display Parkverriegelung schließen.'),
  task('Steuerung AUS [6]',stopped||s.stage<6,'LINK [6] ausschalten: Steuerung sperren.'),
  task('Gyro AUS [5]',stopped||s.stage<5,'GYRO [5] ausschalten.'),
  task('Nachkühlversorgung',stopped||afterrunSupply(s),'Links ELEKTRIK: Hangarstrom verbinden; alternativ APU GEN bereitstellen.'),
  task('Versorgung prüfen',stopped||afterrunSupply(s),'Hangarstrom oder APU GEN muss für die Nachkühlung verfügbar sein.'),
  task('MAIN GEN AUS',stopped||!o.mainGen,'Overhead: MAIN GEN trennen. APU GEN übernimmt.'),
  task('Reaktor AUS [4]',stopped,'REACTOR [4] ausschalten. Kühlung eingeschaltet lassen.'),
  task('Nachkühlung freigegeben',cooled,'Nachkühlen: mindestens 20 s Pumpenlauf und Restwärmefreigabe bis 45 °C abwarten.'),
  task('Kühlung AUS [2]',cooled&&s.stage<2,'COOLANT [2] ausschalten.'),
  task('Hauptstrom AUS [1]',cooled&&s.stage===0,'Hauptstrom [1] ausschalten.'),
  task('Versorgungszweige AUS',cooled&&!o.coolantValve&&!o.hydPump&&!o.avionics&&!o.reactorArm,'Overhead: COOLANT VALVE, HYD PUMP und AVIONICS ausschalten.'),
  task('APU-Versorgung AUS',cooled&&!o.apuGen&&!o.apuMaster&&!o.fuelPump,'Overhead: APU GEN, APU MASTER und FUEL PUMP ausschalten.'),
  task('Batterien / extern AUS',cooled&&!o.battery1&&!o.battery2&&!s.service.groundConnected,'BAT 1 und BAT 2 ausschalten; Hangarstrom im Elektrikdisplay trennen.'),
  task('Druck abgebaut',cooled&&s.actualPressure<5,'Automatische Speicherentlastung nach Hauptstrom AUS: unter 5 bar abwarten.'),
 ];
}
export function shutdownInstruction(s:MachineState){return shutdownChecklist(s).find(t=>!t.done)?.hint??'Geordnet abgeschaltet. Neuer Kaltstart über die Batterien.';}

export type ApuPhase='off'|'preparing'|'ready'|'starting'|'running';
export type OverheadState={battery1:boolean;battery2:boolean;fuelPump:boolean;apuMaster:boolean;apuPhase:ApuPhase;apuProgress:number;apuStarted:number;apuGen:boolean;mainGen:boolean;coolantValve:boolean;hydPump:boolean;avionics:boolean;reactorArm:boolean;lampUntil:number};
export function initialOverhead():OverheadState{return {battery1:false,battery2:false,fuelPump:false,apuMaster:false,apuPhase:'off',apuProgress:0,apuStarted:0,apuGen:false,mainGen:false,coolantValve:false,hydPump:false,avionics:false,reactorArm:false,lampUntil:0};}
export const dcPowerAvailable=dcSupply;
export const mainPowerAvailable=(s:MachineState)=>generatorSource(s)!==null;
export function overheadOn(s:MachineState,action:number):boolean{
 const o=s.overhead;const states:Record<number,boolean>={40:o.battery1,41:o.battery2,42:o.apuMaster,43:o.apuPhase==='starting',44:o.apuGen,45:o.coolantValve,46:o.hydPump,47:o.avionics,48:o.reactorArm,49:o.lampUntil>s.simAt,50:o.fuelPump,51:o.mainGen};return !!states[action];
}
export function overheadCommand(state:MachineState,action:number,now:number):MachineState{
 const s={...state,overhead:{...state.overhead},error:false};const o=s.overhead;
 const fail=(message:string)=>({...state,error:true,message});
 if(action===40||action===41){const key=action===40?'battery1':'battery2';o[key]=!o[key];s.message='BAT '+(action===40?'1':'2')+(o[key]?' verbunden · '+Math.round(s.service.batteryAh[action===40?0:1]/50*100)+' % Ladung.':' getrennt.');}
 else if(action===50){if(!dcPowerAvailable(s))return fail('FUEL PUMP gesperrt: zuerst Batterien einschalten.');o.fuelPump=!o.fuelPump;s.message=o.fuelPump?'Kraftstoffpumpe aktiv. APU MASTER einschalten.':'Kraftstoffpumpe aus. APU wird gestoppt.';}
 else if(action===42){
  if(o.apuMaster){o.apuMaster=false;s.message='APU MASTER aus. Hilfsaggregat wird gestoppt.';}
  else{if(!apuStartAvailable(s))return fail('APU benötigt zwei geladene Batterien oder eine Generator-/Hangarversorgung.');if(!o.fuelPump)return fail('APU benötigt FUEL PUMP.');o.apuMaster=true;o.apuPhase='preparing';o.apuStarted=now;o.apuProgress=0;s.message='APU-Luftklappe öffnet … START-Freigabe abwarten.';}
 }
 else if(action===43){if(o.apuPhase!=='ready')return fail(o.apuPhase==='preparing'?'APU-Luftklappe öffnet noch. READY abwarten.':'APU START gesperrt: Batterien, FUEL PUMP und APU MASTER prüfen.');if(!apuStartAvailable(s))return fail('APU START gesperrt: beide Batterien und mindestens 21 V unter Starterlast erforderlich. Hangarstrom verbinden.');o.apuPhase='starting';o.apuProgress=0;o.apuStarted=now;s.message='APU startet. Drehzahlaufbau abwarten.';}
 else if(action===44){if(!o.apuGen&&o.apuPhase!=='running')return fail('APU GEN gesperrt: APU noch nicht verfügbar.');o.apuGen=!o.apuGen;s.message=o.apuGen?'APU GEN verbunden. Hauptstrom [1] verfügbar.':'APU GEN vom Netz getrennt.';}
 else if(action===51){if(!o.mainGen&&s.stage<4)return fail('MAIN GEN gesperrt: zuerst Reaktor starten [4].');o.mainGen=!o.mainGen;s.message=o.mainGen?'MAIN GEN übernimmt. APU kann über MASTER ausgeschaltet werden.':'MAIN GEN getrennt. APU GEN muss die Versorgung übernehmen.';}
 else if([45,46,47,48].includes(action)){
  const key=({45:'coolantValve',46:'hydPump',47:'avionics',48:'reactorArm'} as const)[action as 45|46|47|48];
  if(!o[key]&&!mainPowerAvailable(s))return fail('Versorgungsfreigabe gesperrt: APU GEN oder Hangarstrom zuschalten.');
  o[key]=!o[key];const label=({45:'Kühlmittelventil',46:'Hydraulikpumpe',47:'Avionik',48:'Reaktorfreigabe'} as const)[action as 45|46|47|48];s.message=label+(o[key]?' eingeschaltet.':' ausgeschaltet.');
 }
 else if(action===49){if(!dcPowerAvailable(s))return fail('Lampentest benötigt Batteriestrom.');o.lampUntil=now+2200;s.message='Lampentest: Kontrollleuchten für 2 Sekunden eingeschaltet.';}
 else return fail('Unbekanntes Overhead-Bedienelement.');
 if(state.shutdownPhase==='complete'&&dcPowerAvailable(s)){s.shutdownPhase='idle';s.cooldownElapsed=0;}
 return advanceShutdown(reconcilePower(s),0);
}
function reconcilePower(state:MachineState):MachineState{
 let s={...state,overhead:{...state.overhead}};const o=s.overhead;
 const interrupt=(stage:number,reason:string)=>{const interrupted=shutdownActive(s)||s.stage>=4||s.busy===3||s.temperature>45||s.heatLoad>.08;s={...s,stage:Math.min(s.stage,stage),busy:-1,progress:0,throttle:0,shutdownPhase:interrupted?'interrupted':s.shutdownPhase,cooldownElapsed:interrupted?0:s.cooldownElapsed,error:true,message:reason+(interrupted?' Restwärme beachten; Nachkühlung über [K] wiederherstellen.':''),testPhase:s.testPhase==='idle'?'idle':'aborted',testMessage:'Prüfung ungültig: '+reason};if(stage===0)s.light=false;if(stage<4)o.mainGen=false;};
 if(!dcPowerAvailable(s)){o.fuelPump=false;o.apuMaster=false;o.coolantValve=false;o.hydPump=false;o.avionics=false;o.reactorArm=false;o.lampUntil=0;}
 if((o.apuPhase==='starting'||o.apuPhase==='preparing')&&!apuStartAvailable(s)){o.apuMaster=false;s.error=true;s.message='APU-Start abgebrochen: Batterien getrennt oder Startspannung unter 21 V. Hangarstrom verbinden.';}
 if(!o.apuMaster||!o.fuelPump){o.apuPhase='off';o.apuProgress=0;o.apuGen=false;}
 if(o.apuPhase!=='running')o.apuGen=false;
 if(s.stage<4)o.mainGen=false;
 const limit=!o.coolantValve?1:!o.avionics||!o.hydPump?2:!o.reactorArm?3:6;
 if(s.stage>limit||s.busy>=limit)interrupt(limit,limit===1?'Kühlmittelventil geschlossen. Kühlung und Folgesysteme gestoppt.':limit===2?'Avionik oder Hilfshydraulik getrennt. Diagnose und Folgesysteme zurückgesetzt.':'Reaktorfreigabe getrennt. Reaktor und Folgesysteme gestoppt.');
 if(!mainPowerAvailable(s)&&(s.stage>0||s.busy>=0))interrupt(0,'Generatorversorgung verloren. Hauptsysteme abgeschaltet; Overhead prüfen.');
 s.service={...s.service,acknowledgedWarnings:s.service.acknowledgedWarnings.filter(key=>serviceAlerts(s).includes(key))};
 return advanceMobility(s,0);
}
export type StartTask={label:string;done:boolean;fraction?:number;hint:string};
export function startChecklist(s:MachineState):StartTask[]{
 const o=s.overhead,transferred=o.mainGen&&s.stage>=4,external=s.service.groundConnected&&!s.service.trips.ground,bypass=transferred||external;
 const front=(i:number):StartTask=>({label:STEPS[i].name,done:s.stage>i,fraction:s.busy===i?s.progress:0,hint:s.busy===i?STEPS[i].name+' läuft …':STEPS[i].name+' einschalten ['+(i+1)+'].'});
 return [
  {label:'BAT 1',done:(o.battery1&&batteryUsable(s,0))||bypass,hint:'BAT 1 einschalten oder links ELEKTRIK → HANGARSTROM verbinden.'},
  {label:'BAT 2',done:(o.battery2&&batteryUsable(s,1))||bypass,hint:'Overhead [O]: BAT 2 einschalten.'},
  {label:'FUEL PUMP',done:o.fuelPump||bypass,hint:'Overhead: FUEL PUMP einschalten.'},
  {label:'APU MASTER',done:['ready','starting','running'].includes(o.apuPhase)||bypass,fraction:o.apuPhase==='preparing'?o.apuProgress:0,hint:o.apuPhase==='preparing'?'APU-Luftklappe öffnet. READY abwarten.':'Overhead: APU MASTER einschalten.'},
  {label:'APU START',done:o.apuPhase==='running'||bypass,fraction:o.apuPhase==='starting'?o.apuProgress:0,hint:o.apuPhase==='starting'?'APU fährt hoch. AVAIL abwarten.':'Overhead: APU START drücken.'},
  {label:'APU GEN',done:o.apuGen||bypass,hint:'Overhead: APU GEN zuschalten.'},front(0),
  {label:'COOLANT VALVE',done:o.coolantValve,hint:'Overhead: COOLANT VALVE öffnen.'},
  {label:'HYD PUMP',done:o.hydPump,hint:'Overhead: HYD PUMP einschalten.'},front(1),
  {label:'AVIONICS',done:o.avionics,hint:'Overhead: AVIONICS einschalten.'},front(2),
  {label:'REACTOR ARM',done:o.reactorArm,hint:'Overhead: REACTOR ARM einschalten.'},front(3),
  {label:'MAIN GEN',done:o.mainGen,hint:'Overhead: MAIN GEN zuschalten. Danach kann die APU aus.'},front(4),
  {label:'Neurohelm verbunden',done:s.mobility.helmet,hint:'Rechts FREIGABE → HELM VERBINDEN.'},
  {label:'Neurohelm kalibriert',done:s.mobility.calibration==='ready',fraction:s.mobility.calibration==='running'?s.mobility.elapsed/8:0,hint:'Rechts FREIGABE → KALIBRIEREN; acht Sekunden abwarten.'},
  {label:'Gelenke / Sensoren',done:s.testPhase==='passed',hint:'Systemtest [T]: 210 bar; danach Radar 125 / 250 / 500 m.'},front(5)
 ];
}
export function nextStartInstruction(s:MachineState):string{return startChecklist(s).find(t=>!t.done)?.hint??'LINK bereit. Hangarstrom trennen, rechts Parkverriegelung lösen.';}

export function serviceCommand(state:MachineState,action:number):MachineState{
 const service={...state.service,trips:{...state.service.trips}};let s={...state,service,error:false};
 const fail=(message:string)=>({...state,error:true,message});
 if(action===70){service.page='faults';return s;}
 if(action>=60&&action<=62){service.page=(['cooling','electrical','hydraulics'] as const)[action-60];return s;}
 if(action===68&&!service.groundConnected&&!atServiceBay(state))return fail('Hangarstrom nur am ursprünglichen Serviceplatz im Stillstand anschließen.');
 if(action===68&& !service.groundConnected&&state.mobility.restraints!=='locked')return fail('Hangarstrom erst bei geschlossener Parkverriegelung verbinden.');
 if(action===68){service.groundConnected=!service.groundConnected;s.message=service.groundConnected?'Hangarstrom verbunden. Hauptstrom [1] verfügbar; verbundene Batterien werden geladen.':'Hangarstrom getrennt. Verfügbare Generatoren übernehmen.';}
 else if(action===69){service.trips={ground:false,main:false,apu:false};service.overloadSeconds=0;service.acknowledgedWarnings=service.acknowledgedWarnings.filter(key=>!key.endsWith('Trip'));s.message='Überlastschutz zurückgesetzt. Hauptsysteme bei Bedarf erneut einschalten.';}
 else{
  if(!dcPowerAvailable(s))return fail('Bedienung benötigt Batteriestrom oder Hangarversorgung.');
  if(action===63){service.mode=service.mode==='manual'?'auto':'manual';s.message=service.mode==='auto'?'Kühlung AUTO: Temperaturregelung und Reservepumpe aktiv.':'Kühlung HAND: Pumpenwahl und COOLING-Stufe gelten.';}
  else if(action===64||action===65){service.pump=action===64?'A':'B';s.message='Kühlmittelpumpe '+service.pump+' vorgewählt.';}
  else if(action===66){service.pumpAFault=!service.pumpAFault;service.faultAcknowledged=false;service.acknowledgedWarnings=service.acknowledgedWarnings.filter(key=>key!=='pumpA');s.error=service.pumpAFault;s.message=service.pumpAFault?'Übungsstörung: Kühlpumpe A ausgefallen. AUTO übernimmt mit B; in HAND Pumpe B wählen.':'Übungsstörung zurückgesetzt. Kühlpumpe A wieder verfügbar.';}
  else if(action===71){if(service.coolantLeak)return fail('Leck bereits aktiv. Absperren, kalt reparieren und auffüllen.');service.coolantLeak=true;service.leakIsolated=false;service.acknowledgedWarnings=service.acknowledgedWarnings.filter(k=>k!=='leak');s.error=true;s.message='Übungsleck: Kühlmittelverlust. Leistung senken, Leckzweig absperren; reduziert nachkühlen.';}
  else if(action===72){service.leakIsolated=!service.leakIsolated;s.message=service.leakIsolated?'Leckzweig abgesperrt. Bypass kühlt mit 70 % Durchfluss; Vorrat bleibt erhalten.':'Leckzweig geöffnet. Bei unrepariertem Leck tritt wieder Kühlmittel aus.';}
  else if(action===73||action===74){
   if(s.stage>=4||s.busy===3||s.temperature>45||s.heatLoad>.08||s.coolantFlow>=1||s.mobility.restraints!=='locked')return fail('Wartung gesperrt: kalt nachkühlen, Reaktor und Kühlung stoppen, verriegelt; Restfluss unter 1 L/s abwarten.');
   if(action===73){service.coolantLeak=false;service.acknowledgedWarnings=service.acknowledgedWarnings.filter(k=>k!=='leak');s.message='Leck repariert. Vorrat auffüllen, Bypass danach zurück auf Normalbetrieb.';}
   else{if(service.coolantLeak)return fail('Vor dem Auffüllen Leck reparieren.');service.reservoirLitres=240;s.message='Kühlmittel auf 240 L aufgefüllt.';}
  }
  else if(action===75||action===76){const key=action===75?'hydraulicFault':'sensorFault';service[key]=!service[key];service.acknowledgedWarnings=service.acknowledgedWarnings.filter(k=>k!==(action===75?'hydraulic':'sensor'));s.testPhase='aborted';s.testResults=[false,false,false];s.testMessage='Prüfung ungültig. Störung beheben, Systemtest erneut ausführen.';s.error=service[key];s.message=(action===75?'Hilfshydraulik':'Lagesensor')+(service[key]?' ausgefallen. Steuerung wird gesperrt.':' wieder verfügbar. Neu kalibrieren und prüfen.');}
  else if(action===67){service.faultAcknowledged=true;service.acknowledgedWarnings=serviceAlerts(s);s.message=service.acknowledgedWarnings.length?'Warnungen quittiert. Störungen und ausgelöste Schutzschalter bleiben bestehen.':'Keine Systemwarnung vorhanden.';}
  else return fail('Unbekannte Systembedienung.');
 }
 if(state.shutdownPhase==='complete'&&dcPowerAvailable(s)){s.shutdownPhase='idle';s.cooldownElapsed=0;}
 return advanceShutdown(reconcilePower(s),0);
}
