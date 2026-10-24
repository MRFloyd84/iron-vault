import {checked,qualify} from './mobility-helpers.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialState,tick,command,overheadCommand,serviceCommand,startShutdown,mainPowerAvailable,dcPowerAvailable,coolingPowered} from '../lib/machine.ts';
import {advanceService,electricalReadings,selectedPump,generatorSource,SERVICE_CONTROLS} from '../lib/service-systems.ts';
const run=()=>{const s=initialState();return checked({...s,simAt:0,stage:6,temperature:35,heatLoad:.28,coolantFlow:42.8,actualPressure:210,service:{...s.service,pumpAFlow:42.8},overhead:{...s.overhead,battery1:true,battery2:true,fuelPump:true,apuMaster:true,apuPhase:'running',apuGen:true,mainGen:true,coolantValve:true,hydPump:true,avionics:true,reactorArm:true}});};
const advance=(s,seconds,dt=.1)=>{for(let i=0;i<Math.round(seconds/dt);i++)s=tick(s,Math.max(0,s.simAt)+dt*1000);return s;};

test('cooling runs without auxiliary hydraulics and the pumps can be selected independently',()=>{
 let s=overheadCommand(run(),46,0);assert.equal(s.stage,2);assert.equal(coolingPowered(s),true);
 s=advance(s,8);assert.ok(s.actualPressure>140&&s.actualPressure<210,'isolated accumulator retains pressure');assert.ok(s.coolantFlow>40);
 s=serviceCommand(s,65);assert.equal(selectedPump(s),'B');s=advance(s,8);
 assert.ok(s.service.pumpAFlow<1);assert.ok(s.service.pumpBFlow>40);
});
test('manual pump failure removes cooling, acknowledgement is not repair, reserve restores it',()=>{
 let s=serviceCommand(run(),66);assert.equal(selectedPump(s),null);
 s=advance(s,8);assert.ok(s.coolantFlow<1);const temp=s.temperature;
 s=serviceCommand(s,67);assert.equal(s.service.pumpAFault,true);assert.equal(s.service.faultAcknowledged,true);
 s=advance(s,5);assert.ok(s.temperature>temp);assert.equal(selectedPump(s),null);
 s=serviceCommand(s,65);s=advance(s,8);assert.ok(s.coolantFlow>40);
 s=serviceCommand(s,66);assert.equal(s.service.pumpAFault,false);assert.equal(s.service.pump,'B');
});
test('automatic cooling responds to heat and fails over without changing the manual setting',()=>{
 let s=serviceCommand(run(),63);s=serviceCommand(s,66);assert.equal(selectedPump(s),'B');
 s=advance({...s,throttle:1},180);assert.ok(s.temperature<85);assert.ok(s.coolantFlow>24);
 assert.equal(s.coolingLevel,2);assert.equal(s.service.pump,'A');
 const cold=advance({...s,stage:2,temperature:25,heatLoad:0},10);assert.ok(cold.coolantFlow<25);
 assert.ok(s.service.outletTemperature<s.temperature);assert.ok(s.service.outletTemperature>=18);
});
test('ground supply starts a cold machine with isolated batteries and preserves temperature on transfer',()=>{
 let s=serviceCommand(initialState(),68);assert.equal(mainPowerAvailable(s),true);assert.equal(dcPowerAvailable(s),true);
 s=advance({...s,simAt:0},.1);assert.equal(electricalReadings(s).source,'ground');
 for(let i=0;i<6;i++){
  if(i===1)s=overheadCommand(s,45,s.simAt);
  if(i===2){s=overheadCommand(s,46,s.simAt);s=overheadCommand(s,47,s.simAt);s=advance(s,5);}
  if(i===3)s=overheadCommand(s,48,s.simAt);
  if(i===4)s=overheadCommand(s,51,s.simAt);
  if(i===5)s=qualify(s);
  s=command(s,i,s.simAt);assert.equal(s.busy,i,s.message);s=advance(s,7);
 }
 assert.equal(s.stage,6);assert.equal(generatorSource(s),'main');
 const temp=s.temperature;s=overheadCommand(s,51,s.simAt);assert.equal(s.stage,6);assert.equal(generatorSource(s),'ground');assert.equal(s.temperature,temp);
 s=serviceCommand(s,68);assert.equal(s.stage,0);assert.equal(dcPowerAvailable(s),false);
});
test('batteries discharge only when connected and charge only with available source headroom',()=>{
 let s=overheadCommand(initialState(),40,0);s=advance({...s,simAt:0},120);
 assert.ok(s.service.batteryAh[0]<50);assert.equal(s.service.batteryAh[1],50);
 const before=[...s.service.batteryAh];s=serviceCommand(s,68);s=advance(s,60);
 assert.ok(s.service.batteryAh[0]>before[0]);assert.equal(s.service.batteryAh[1],50);
 s={...run(),service:{...run().service,batteryAh:[25,25]}};
 const low=electricalReadings(s),high=electricalReadings({...s,throttle:1});assert.ok(high.loadKW>low.loadKW+4);
 assert.ok(low.batteryAmps.every(a=>a<0));assert.ok(low.inputKW>low.loadKW);
 const off=command(s,0,0);assert.deepEqual(off.service.batteryAh,[25,25]);
});
test('battery depletion drops the essential bus, external power can recover and recharge',()=>{
 let s=initialState();s={...s,simAt:0,service:{...s.service,batteryAh:[1.501,0]},overhead:{...s.overhead,battery1:true}};
 s=advance(s,5);assert.equal(dcPowerAvailable(s),false);assert.equal(s.overhead.battery1,true);
 assert.equal(overheadCommand(s,42,s.simAt).error,true);
 s=serviceCommand(s,68);assert.equal(dcPowerAvailable(s),true);s=advance(s,60);
 assert.ok(s.service.batteryAh[0]>1.5);assert.ok(s.service.batteryAh[0]<50);
});
test('batteries can be isolated while a generator supplies the service bus',()=>{
 let s=overheadCommand(run(),40,0);s=overheadCommand(s,41,0);assert.equal(s.stage,6);assert.equal(dcPowerAvailable(s),true);
 assert.equal(s.overhead.apuPhase,'running');s=overheadCommand(s,51,0);assert.equal(generatorSource(s),'apu');
 s=overheadCommand(s,44,0);assert.equal(s.stage,0);assert.equal(dcPowerAvailable(s),false);
});
test('overloaded APU trips after sustained demand and does not reset itself',()=>{
 let s=run();s={...s,throttle:1,coolingLevel:3,fanLevel:3,light:true,hydraulicPressure:280,ceilingBrightness:1,overhead:{...s.overhead,mainGen:false}};
 assert.ok(electricalReadings(s).overloaded);
 // Hold hydraulic demand high to exercise sustained overload independently of the regulator.
 for(let i=0;i<10;i++)s=advanceService(s,.1);assert.equal(s.service.trips.apu,false);
 for(let i=0;i<12;i++)s=advanceService(s,.1);assert.equal(s.service.trips.apu,true);s=advance(s,.1);assert.equal(s.stage,0);
 s=advance(s,10);assert.equal(s.service.trips.apu,true);s=serviceCommand(s,69);assert.equal(s.service.trips.apu,false);assert.equal(mainPowerAvailable(s),true);assert.equal(s.stage,0);
});
test('ground power carries a complete orderly afterrun without an APU',()=>{
 let s=run();s={...s,service:{...s.service,groundConnected:true},overhead:{...s.overhead,apuGen:false,apuMaster:false,fuelPump:false,apuPhase:'off'}};
 s=startShutdown(s);s=command(s,5,0);s=command(s,4,0);s=overheadCommand(s,51,0);s=command(s,3,0);
 assert.equal(s.shutdownPhase,'cooldown',s.message);s=advance(s,100);assert.equal(s.shutdownPhase,'isolate');
 s=command(s,1,s.simAt);s=command(s,0,s.simAt);
 for(const a of [45,46,47,40,41])s=overheadCommand(s,a,s.simAt);
 s=advance(s,5);assert.equal(s.shutdownPhase,'isolate','external connection must be removed');
 s=serviceCommand(s,68);s=advance(s,1);assert.equal(s.shutdownPhase,'complete');
});
test('all page controls have non-overlapping visible hit rectangles within the screen',()=>{
 for(const page of ['cooling','electrical','hydraulics']){
  const buttons=SERVICE_CONTROLS.filter(b=>!b.page||b.page===page);
  for(const [i,b]of buttons.entries()){
   assert.ok(b.x>=0&&b.y>=0&&b.x+b.w<=960&&b.y+b.h<=720);
   for(const a of buttons.slice(i+1))assert.ok(b.x+b.w<=a.x||a.x+a.w<=b.x||b.y+b.h<=a.y||a.y+a.h<=b.y);
  }
 }
});
