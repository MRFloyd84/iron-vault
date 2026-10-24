import {checked,qualify} from './mobility-helpers.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialState, command, tick, STEPS, startSystemTest, actuatorMoving, overheadCommand, mainPowerAvailable, startChecklist, dcPowerAvailable} from '../lib/machine.ts';
const supplied=()=>{const s=initialState();return {...s,simAt:0,actualPressure:210,overhead:{...s.overhead,battery1:true,battery2:true,fuelPump:true,apuMaster:true,apuPhase:'running',apuProgress:1,apuGen:true,coolantValve:true,hydPump:true,avionics:true,reactorArm:true}};};
test('front startup requires all six timed phases after overhead supply',()=>{let s=supplied(),now=100;for(let i=0;i<6;i++){if(i===2){s=advance(s,5);now=s.simAt;}if(i===4)s=overheadCommand(s,51,now);if(i===5){s=qualify(s);now=s.simAt;}s=command(s,i,now);assert.equal(s.busy,i);const halfway=tick(s,now+STEPS[i].seconds*500);assert.equal(halfway.stage,i);assert.equal(halfway.progress,.5);now+=STEPS[i].seconds*1000;s=tick(halfway,now);assert.equal(s.stage,i+1);assert.equal(s.busy,-1);}assert.equal(s.stage,6);assert.match(s.message,/Steuerfreigabe/);});
test('out of order commands never enable a system',()=>{let s=supplied(),now=1;for(let i=0;i<5;i++){if(i===2){s=advance(s,5);now=s.simAt;}if(i===4)s=overheadCommand(s,51,now);if(i===5){s=qualify(s);now=s.simAt;}for(let j=i+1;j<6;j++){const invalid=command(s,j,now);assert.equal(invalid.stage,i);assert.equal(invalid.busy,-1);assert.equal(invalid.error,true);}s=command(s,i,now);now+=STEPS[i].seconds*1000;s=tick(s,now);}});
test('cutting master power cancels every startup phase without later resurrection',()=>{let s=supplied(),now=1;for(let i=0;i<6;i++){if(i===2){s=advance(s,5);now=s.simAt;}if(i===4)s=overheadCommand(s,51,now);if(i===5){s=qualify(s);now=s.simAt;}const boot=command(s,i,now);const off=command(boot,0,now+1);assert.equal(off.stage,0);assert.equal(off.busy,-1);assert.equal(tick(off,1e9).stage,0);assert.equal(off.light,false);assert.equal(off.throttle,0);now+=STEPS[i].seconds*1000;s=tick(boot,now);}const off=command({...s,throttle:1},0,now);assert.equal(off.stage,0);assert.equal(off.throttle,0);});
test('repeated input cannot skip a running phase',()=>{let s=command(supplied(),0,100);s=command(s,3,300);assert.equal(s.busy,0);assert.equal(s.started,100);assert.equal(s.error,true);s=tick(s,1300);assert.equal(s.stage,1);assert.equal(s.error,false);});

test('auxiliary controls obey power and subsystem prerequisites',async()=>{const {auxiliary}=await import('../lib/machine.ts');let s=initialState();for(const a of [20,21,22,23,24,25]){const n=auxiliary(s,a);assert.equal(n.error,true);assert.equal(n.fanLevel,2);}s={...s,stage:1};assert.equal(auxiliary(s,20).fanLevel,3);assert.equal(auxiliary(s,21).error,true);assert.equal(auxiliary(s,23).error,true);assert.equal(auxiliary({...supplied(),stage:1},21).hydraulicPressure,280);assert.equal(auxiliary({...s,stage:5},23).radarRange,500);});
test('rotary controls cycle in both directions and toggles retain state',async()=>{const {auxiliary}=await import('../lib/machine.ts');const s={...supplied(),stage:6};for(const [forward,back,field]of [[20,26,'fanLevel'],[21,27,'hydraulicPressure'],[22,28,'displayBrightness'],[23,29,'radarRange']]){assert.equal(auxiliary(auxiliary(s,forward),back)[field],s[field]);}assert.equal(auxiliary({...s,fanLevel:3},20).fanLevel,0);assert.equal(auxiliary(s,24).radarPaused,true);assert.equal(auxiliary(s,25).hudEnabled,false);assert.equal(auxiliary(auxiliary(s,25),25).hudEnabled,true);});
test('master power reset clears auxiliary settings and interrupted start retains controls',async()=>{const {auxiliary}=await import('../lib/machine.ts');let s={...initialState(),stage:6,fanLevel:0,radarPaused:true,hudEnabled:false,throttle:1};const reset=command(s,0,10);assert.equal(reset.stage,0);assert.equal(reset.fanLevel,2);assert.equal(reset.radarPaused,false);assert.equal(reset.hudEnabled,true);s=command({...supplied(),stage:1},1,100);s=auxiliary(s,22);assert.equal(s.busy,1);assert.equal(s.displayBrightness,.4);assert.equal(tick(s,2600).stage,2);});

test('pressure release triggers once on real reductions and shutdown, never on polling',async()=>{const {pressureReleased}=await import('../lib/machine.ts');const off=initialState(),on={...off,stage:6,hydraulicPressure:210};assert.equal(pressureReleased(null,on),false);assert.equal(pressureReleased(off,on),false);assert.equal(pressureReleased(on,{...on}),false);assert.equal(pressureReleased(on,{...on,hydraulicPressure:280}),false);assert.equal(pressureReleased(on,{...on,hydraulicPressure:150}),true);assert.equal(pressureReleased(on,off),true);assert.equal(pressureReleased(off,{...off}),false);assert.equal(pressureReleased({...off,stage:1},off),false);});

const ready=()=>{const s=supplied();return checked({...s,stage:6,overhead:{...s.overhead,mainGen:true}});};
test('blocked master power names the missing overhead step and becomes available after APU GEN',()=>{
 let s=initialState(),now=100;
 assert.match(command(s,0,now).message,/BAT 1/);
 s=overheadCommand(s,40,now);assert.match(command(s,0,now).message,/BAT 2/);
 s=overheadCommand(s,41,now);assert.match(command(s,0,now).message,/FUEL PUMP/);
 s=overheadCommand(s,50,now);assert.match(command(s,0,now).message,/APU MASTER/);
 s=overheadCommand(s,42,now);assert.match(command(s,0,now).message,/READY/);
 now+=2500;s=tick(s,now);assert.match(command(s,0,now).message,/APU START/);
 s=overheadCommand(s,43,now);assert.match(command(s,0,now).message,/AVAIL/);
 now+=9000;s=tick(s,now);assert.match(command(s,0,now).message,/APU GEN/);
 s=overheadCommand(s,44,now);s=command(s,0,now);assert.equal(s.busy,0);
 s=tick(s,now+1200);assert.equal(s.stage,1);assert.equal(s.error,false);
});
function advance(state,seconds){let s=state,now=Math.max(0,s.simAt);s=tick(s,now);for(let i=0;i<Math.round(seconds*10);i++){now+=100;s=tick(s,now);}return s;}

test('pressure and temperature respond gradually and power loss retains thermal inertia',()=>{
 let s=advance({...ready(),actualPressure:0},.5);
 assert.ok(s.actualPressure>0&&s.actualPressure<210);
 assert.ok(s.temperature>18&&s.temperature<47);
 s=advance(s,10);assert.ok(Math.abs(s.actualPressure-210)<1);
 s=advance({...s,hydraulicPressure:150},.5);assert.ok(s.actualPressure>150&&s.actualPressure<210);
 s=advance({...s,throttle:1},5);assert.ok(s.temperature>25&&s.temperature<85);
 const off=command(s,0,s.simAt);assert.equal(off.actualPressure,s.actualPressure);assert.equal(off.temperature,s.temperature);
 const cooling=advance(off,1);assert.ok(cooling.actualPressure<off.actualPressure&&cooling.actualPressure>0);assert.ok(cooling.temperature>18);assert.ok(cooling.heatLoad>0&&cooling.heatLoad<off.heatLoad);
 assert.ok(advance(cooling,20).actualPressure>0,'accumulator retains pressure after an interrupted shutdown');
});

test('preflight cannot start before gyro alignment or with nonzero power',()=>{
 for(let stage=0;stage<5;stage++){const s=startSystemTest({...initialState(),stage});assert.equal(s.error,true);assert.equal(s.testPhase,'idle');assert.match(s.testMessage,/GYRO/);}
 const s=startSystemTest({...ready(),testPhase:'idle',throttle:.25});assert.equal(s.error,true);assert.equal(s.testPhase,'idle');assert.match(s.testMessage,/0 %/);
});

test('complete preflight requires stable pressure, all actuator tests and each radar range',()=>{
 let s=startSystemTest(ready());s=advance(s,3.1);assert.equal(s.testPhase,'actuators');assert.deepEqual(s.testResults,[true,false,false]);
 s=advance(s,5);assert.equal(s.testPhase,'actuators');assert.equal(s.testResults[1],false);
 s=advance(s,5.1);assert.equal(s.testPhase,'sensors');assert.deepEqual(s.testResults,[true,true,false]);
 for(const [i,radarRange]of [125,250,500].entries()){
  s=advance({...s,radarRange},2.6);assert.equal(s.testSensors,i+1);
  if(i<2){assert.equal(s.testPhase,'sensors');assert.equal(s.testResults[2],false);}
 }
 assert.equal(s.testPhase,'passed');assert.deepEqual(s.testResults,[true,true,true]);assert.equal(s.error,false);
 const again=startSystemTest(s);assert.equal(again.testPhase,'hydraulics');assert.deepEqual(again.testResults,[false,false,false]);assert.equal(again.testSensors,0);
});

test('hydraulic hold must be consecutive and actuator work pauses at the wrong setpoint',()=>{
 let s=advance(startSystemTest(ready()),2);assert.equal(s.testPhase,'hydraulics');assert.ok(s.testHold>=1.9);
 s=advance({...s,hydraulicPressure:150},.1);assert.equal(s.testHold,0);
 s=advance({...s,hydraulicPressure:210},2);assert.equal(s.testPhase,'hydraulics');
 s=advance(s,3);assert.equal(s.testPhase,'actuators');assert.equal(actuatorMoving(s),true);
 const elapsed=s.testElapsed;s=advance({...s,hydraulicPressure:280},4);assert.equal(s.testElapsed,elapsed);assert.equal(s.testPhase,'actuators');assert.equal(actuatorMoving(s),false);assert.match(s.testMessage,/pausiert/);
 s=advance({...s,hydraulicPressure:210},7);assert.equal(actuatorMoving(s),true);assert.ok(s.testElapsed>elapsed);
});

test('paused scans and incorrect radar ranges cannot complete a sensor checkpoint',()=>{
 let s=advance(startSystemTest(ready()),13.2);assert.equal(s.testPhase,'sensors');
 s=advance({...s,radarRange:125},1);assert.ok(s.testHold>0);
 s=advance({...s,radarPaused:true},10);assert.equal(s.testHold,0);assert.equal(s.testSensors,0);
 s=advance({...s,radarPaused:false,radarRange:1000},10);assert.equal(s.testHold,0);assert.equal(s.testSensors,0);assert.equal(s.testPhase,'sensors');
 s=advance({...s,radarRange:125},2.6);assert.equal(s.testSensors,1);
 s=advance(s,10);assert.equal(s.testSensors,1);assert.equal(s.testResults[2],false);
});

test('manual cancellation, power cut and power lever abort a running test permanently',()=>{
 for(const phase of ['hydraulics','actuators','sensors']){
  const running={...ready(),stage:5,testPhase:phase,testResults:[true,false,false]};
  for(const abort of [s=>startSystemTest(s),s=>command(s,0,s.simAt),s=>advance({...s,throttle:.25},.1)]){
   const stopped=abort(running);assert.equal(stopped.testPhase,'aborted');assert.equal(actuatorMoving(stopped),false);
   const later=advance({...stopped,throttle:0},30);assert.equal(later.testPhase,'aborted');assert.equal(later.testResults[2],false);
  }
 }
});


test('a true cold start requires the overhead chain and allows a clean generator handover',()=>{
 let s=initialState();const use=a=>{s=overheadCommand(s,a,Math.max(0,s.simAt));assert.equal(s.error,false,s.message);};
 assert.equal(command(s,0,0).error,true);assert.equal(mainPowerAvailable(s),false);
 use(40);assert.equal(dcPowerAvailable(s),true);assert.equal(mainPowerAvailable(s),false);
 use(41);use(50);use(42);assert.equal(s.overhead.apuPhase,'preparing');
 assert.equal(overheadCommand(s,43,0).error,true);
 s=advance(s,2);assert.equal(s.overhead.apuPhase,'preparing');s=advance(s,.6);assert.equal(s.overhead.apuPhase,'ready');
 use(43);s=advance(s,4);assert.equal(s.overhead.apuPhase,'starting');assert.equal(overheadCommand(s,44,s.simAt).error,true);
 s=advance(s,5);assert.equal(s.overhead.apuPhase,'running');use(44);assert.equal(mainPowerAvailable(s),true);
 s=advance(command(s,0,s.simAt),1.3);assert.equal(s.stage,1);
 assert.equal(command(s,1,s.simAt).error,true);use(45);use(46);
 s=advance(command(s,1,s.simAt),2.6);assert.equal(s.stage,2);
 assert.equal(command(s,2,s.simAt).error,true);use(47);assert.equal(command({...s,actualPressure:0},2,s.simAt).error,true);
 s=advance(s,3);s=advance(command(s,2,s.simAt),4.1);assert.equal(s.stage,3);
 assert.equal(command(s,3,s.simAt).error,true);use(48);s=advance(command(s,3,s.simAt),6.1);assert.equal(s.stage,4);
 assert.equal(command(s,4,s.simAt).error,true);use(51);
 use(42);use(50);assert.equal(s.overhead.apuPhase,'off');assert.equal(s.overhead.apuGen,false);assert.equal(mainPowerAvailable(s),true);assert.equal(s.stage,4);
 s=advance(command(s,4,s.simAt),3.1);s=qualify(s);s=advance(command(s,5,s.simAt),2.1);assert.equal(s.stage,6);
 assert.equal(startChecklist(s).length,20);assert.equal(startChecklist(s).every(t=>t.done),true);
});

test('APU and generator controls cannot bypass battery, fuel or reactor prerequisites',()=>{
 const cold=initialState();for(const a of [42,43,44,45,46,47,48,49,50,51]){const s=overheadCommand(cold,a,0);assert.equal(s.error,true);assert.deepEqual(s.overhead,cold.overhead);}
 let s=overheadCommand(cold,40,0);s=overheadCommand(s,50,0);assert.equal(overheadCommand(s,42,0).error,true);
 s=overheadCommand(s,41,0);s=overheadCommand(s,50,0);assert.equal(overheadCommand(s,42,0).error,true);
 assert.equal(overheadCommand(supplied(),51,0).error,true);
});

test('interrupting an APU start never resurrects it later',()=>{
 for(const phase of ['preparing','starting'])for(const action of [40,41,42,50]){
  const s0=supplied();const starting={...s0,actualPressure:0,overhead:{...s0.overhead,apuPhase:phase,apuStarted:0,apuProgress:.4,apuGen:false}};
  const off=overheadCommand(starting,action,500);assert.equal(off.overhead.apuPhase,'off');assert.equal(off.overhead.apuGen,false);
  const later=tick(off,999999);assert.equal(later.overhead.apuPhase,'off');assert.equal(later.stage,0);assert.equal(later.busy,-1);
 }
});

test('losing the last generator shuts down but another connected generator carries the load',()=>{
 let s=ready();s=overheadCommand(s,44,0);assert.equal(s.stage,6);assert.equal(mainPowerAvailable(s),true);
 s=overheadCommand(s,51,0);assert.equal(s.stage,0);assert.equal(s.busy,-1);assert.equal(s.error,true);assert.equal(s.overhead.battery1,true);
 assert.equal(advance(s,30).stage,0);
 const apuOnly={...ready(),overhead:{...ready().overhead,mainGen:false}};
 const stopped=overheadCommand(apuOnly,42,0);assert.equal(stopped.stage,0);assert.equal(stopped.overhead.apuPhase,'off');
 const running=overheadCommand(ready(),51,0);assert.equal(running.stage,6);assert.equal(mainPowerAvailable(running),true);
});

test('feed isolation cancels dependent startup phases and running preflight tests',()=>{
 for(const [action,stage]of [[45,1],[46,2],[47,2],[48,3]]){
  const s=overheadCommand(startSystemTest(ready()),action,0);assert.equal(s.stage,stage);assert.equal(s.overhead.mainGen,false);assert.equal(s.testPhase,'aborted');assert.equal(s.throttle,0);
  assert.equal(advance(s,20).stage,stage);
 }
 const s0=supplied(),boot=command({...s0,stage:3},3,0),off=overheadCommand(boot,48,1000);assert.equal(off.busy,-1);assert.equal(advance(off,20).stage,3);
});

test('batteries remain independent and lamp test expires without changing switch positions',()=>{
 let s=overheadCommand(ready(),40,0);assert.equal(s.stage,6);assert.equal(s.overhead.battery1,false);assert.equal(s.overhead.battery2,true);
 const before={...s.overhead};s=overheadCommand(s,49,0);assert.ok(s.overhead.lampUntil>0);assert.deepEqual({...s.overhead,lampUntil:0},{...before,lampUntil:0});
 s=advance(s,3);assert.ok(s.simAt>s.overhead.lampUntil);
 s=overheadCommand(s,41,s.simAt);assert.equal(s.stage,6);assert.equal(s.overhead.apuPhase,'running');assert.equal(dcPowerAvailable(s),true);
 s=overheadCommand(s,51,s.simAt);s=overheadCommand(s,44,s.simAt);assert.equal(s.stage,0);assert.equal(s.overhead.apuPhase,'off');assert.equal(s.overhead.lampUntil,0);
});

test('red lamp dimmer works on either battery, clamps at its stops, and survives power cycling',async()=>{
 const {auxiliary}=await import('../lib/machine.ts');
 const cold=initialState();assert.equal(auxiliary(cold,31).error,true);
 let s=overheadCommand(cold,40,100);s=auxiliary(s,32);
 assert.equal(s.ceilingBrightness,.6);assert.equal(s.stage,0);assert.equal(s.error,false);
 for(let i=0;i<15;i++)s=auxiliary(s,32);assert.equal(s.ceilingBrightness,0);
 for(let i=0;i<15;i++)s=auxiliary(s,31);assert.equal(s.ceilingBrightness,1);
 s=auxiliary(s,32);const off=overheadCommand(s,40,200);
 assert.equal(off.ceilingBrightness,.9);assert.equal(auxiliary(off,32).ceilingBrightness,.9);
 assert.equal(auxiliary(overheadCommand(off,41,300),32).ceilingBrightness,.8);
 assert.equal(command({...s,stage:1},0,400).ceilingBrightness,.9);
});
