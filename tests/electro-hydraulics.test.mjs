import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialState,tick,overheadCommand} from '../lib/machine.ts';
import {electricalReadings,apuStartAvailable,advanceService} from '../lib/service-systems.ts';
import {hydraulicReadings,advanceHydraulics} from '../lib/hydraulics.ts';
const battery=()=>{const s=initialState();return {...s,simAt:0,overhead:{...s.overhead,battery1:true,battery2:true,fuelPump:true}};};
const running=()=>{const s=battery();return {...s,stage:5,actualPressure:210,service:{...s.service,groundConnected:true},overhead:{...s.overhead,hydPump:true,avionics:true,coolantValve:true,reactorArm:true}};};
function hydraulicAdvance(s,seconds,dt=.1){for(let i=0;i<Math.round(seconds/dt);i++)s=advanceHydraulics(s,dt);return s;}
test('24 V batteries sag under starter load and recover when the starter disengages',()=>{
 const s=battery(),idle=electricalReadings(s),loaded=electricalReadings({...s,overhead:{...s.overhead,apuPhase:'starting'}});
 assert.ok(idle.voltage>25&&idle.voltage<26);assert.ok(loaded.voltage<idle.voltage-1);assert.ok(loaded.voltage>21);
 assert.ok(Math.abs(loaded.batteryAmps.reduce((a,b)=>a+b)*loaded.voltage-loaded.loadKW*1000)<.001);
 assert.equal(apuStartAvailable(s),true);
});
test('unequal isolated packs share current without charging each other',()=>{
 const s=battery();s.service.batteryAh=[50,25];
 const idle=electricalReadings(s);assert.equal(idle.batteryAmps[1],0);assert.ok(idle.batteryAmps[0]>0);
 const r=electricalReadings({...s,overhead:{...s.overhead,apuPhase:'starting'}});
 assert.ok(r.batteryAmps[0]>r.batteryAmps[1]);assert.ok(r.batteryAmps[1]>0);
 assert.ok(Math.abs(r.batteryAmps.reduce((a,b)=>a+b)*r.voltage-r.loadKW*1000)<.001);
});
test('weak batteries block start and cannot complete a pending start across a long tick',()=>{
 let s=battery();s.service.batteryAh=[8,8];s.overhead.apuMaster=true;s.overhead.apuPhase='ready';
 assert.equal(apuStartAvailable(s),false);const blocked=overheadCommand(s,43,0);assert.equal(blocked.error,true);assert.match(blocked.message,/21 V/);
 s.overhead.apuPhase='starting';s.overhead.apuStarted=0;s=tick(s,10000);
 assert.equal(s.overhead.apuPhase,'off');assert.match(s.message,/Start abgebrochen/);
});
test('generator regulates charging voltage and input power includes battery charging',()=>{
 const s=battery();s.service.groundConnected=true;s.service.batteryAh=[25,40];
 const r=electricalReadings(s);assert.ok(r.voltage>28&&r.voltage<=28.25);assert.ok(r.batteryAmps.every(a=>a<0));
 assert.ok(Math.abs(r.inputKW-r.loadKW+r.voltage*r.batteryAmps.reduce((a,b)=>a+b)/1000)<1e-8);
 const next=advanceService(s,60);assert.ok(next.service.batteryAh[0]>s.service.batteryAh[0]);
 assert.equal(r.batteryVoltage[0],r.voltage);
});
test('hydraulic pump builds pressure, unloads at rest and supplies actual movement',()=>{
 const cold={...running(),actualPressure:0},early=hydraulicAdvance(cold,.5),idle=hydraulicAdvance(early,10);
 assert.ok(early.actualPressure>0&&early.actualPressure<210);assert.ok(idle.actualPressure>209&&idle.actualPressure<=210);
 const moving=hydraulicAdvance({...idle,walk:{...idle.walk,speed:2.2}},3);
 const a=hydraulicReadings(idle),b=hydraulicReadings(moving);
 assert.ok(moving.actualPressure<idle.actualPressure-2);assert.ok(moving.actualPressure>200);
 assert.ok(b.pumpFlow>a.pumpFlow+5);assert.ok(b.powerKW>a.powerKW+2);
 assert.ok(Math.abs(b.powerKW-(.22+moving.actualPressure*b.pumpFlow/600/.8))<1e-8);
 assert.ok(hydraulicAdvance({...moving,walk:{...moving.walk,speed:0}},2).actualPressure>209);
});
test('accumulator supports temporary loss, draws down under motion, and vents on orderly shutdown',()=>{
 const s=running(),off={...s,overhead:{...s.overhead,hydPump:false}};
 const resting=hydraulicAdvance(off,3),moving=hydraulicAdvance({...off,walk:{...off.walk,speed:2.2}},3);
 assert.ok(resting.actualPressure>190);assert.ok(moving.actualPressure<resting.actualPressure-30);
 assert.ok(hydraulicReadings(moving).reserveLitres<hydraulicReadings(resting).reserveLitres);
 const shutdown=hydraulicAdvance({...off,stage:0,shutdownPhase:'isolate'},5);assert.ok(shutdown.actualPressure<5);
});
test('pressure compensation is independent of frame rate and lower setpoint drains excess pressure',()=>{
 const s={...running(),actualPressure:0};const a=hydraulicAdvance(s,8,1/30),b=hydraulicAdvance(s,8,1/120);
 assert.ok(Math.abs(a.actualPressure-b.actualPressure)<.1);
 const early=hydraulicAdvance({...a,hydraulicPressure:150},.5);assert.ok(early.actualPressure<210&&early.actualPressure>150);
 assert.ok(Math.abs(hydraulicAdvance(early,10).actualPressure-150)<1);
});
