import {checked,qualify} from './mobility-helpers.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialState,tick,command,auxiliary,overheadCommand,startShutdown,startSystemTest,throttleCommand,shutdownChecklist,coolingPowered,cooldownSafe,THERMAL} from '../lib/machine.ts';

const running=(apu=true)=>{
 const s=initialState();
 return checked({...s,stage:6,simAt:0,temperature:35,heatLoad:.28,coolantFlow:42.8,actualPressure:210,
  overhead:{...s.overhead,battery1:true,battery2:true,fuelPump:apu,apuMaster:apu,apuPhase:apu?'running':'off',apuGen:apu,mainGen:true,coolantValve:true,hydPump:true,avionics:true,reactorArm:true}});
};
function advance(s,seconds,step=.1){for(let i=0;i<Math.round(seconds/step);i++)s=tick(s,s.simAt+step*1000);return s;}

test('reactor load and coolant flow determine heat; cabin fan is independent',()=>{
 const low=advance({...running(),throttle:1,coolingLevel:1},35);
 const high=advance({...running(),throttle:1,coolingLevel:3},35);
 const idle=advance({...running(),throttle:0,coolingLevel:1},35);
 assert.ok(low.temperature>high.temperature+15);
 assert.ok(low.temperature>idle.temperature+20);
 assert.ok(high.coolantFlow>61&&low.coolantFlow<25);
 const quiet=advance({...running(),fanLevel:0,throttle:.5},35);
 const loud=advance({...running(),fanLevel:3,throttle:.5},35);
 assert.equal(quiet.temperature,loud.temperature);assert.equal(quiet.coolantFlow,loud.coolantFlow);
 const fine=advance({...running(),throttle:1},30,.05),coarse=advance({...running(),throttle:1},30,.25);
 assert.ok(Math.abs(fine.temperature-coarse.temperature)<.3);
});

test('cooling regulator has three bounded levels and actual flow ramps gradually',()=>{
 assert.equal(auxiliary(initialState(),33).error,true);
 let s=running();for(let i=0;i<10;i++)s=auxiliary(s,33);assert.equal(s.coolingLevel,3);
 assert.equal(s.coolantFlow,42.8);
 const ramp=advance(s,.5);assert.ok(ramp.coolantFlow>42.8&&ramp.coolantFlow<62);
 for(let i=0;i<10;i++)s=auxiliary(s,34);assert.equal(s.coolingLevel,1);
});

test('overtemperature warns, limits output and holds the limit until cooled',()=>{
 let s={...running(),throttle:1,coolingLevel:1};let warned=false,limited=false;
 for(let i=0;i<1800;i++){
  s=advance(s,.1);warned ||= s.thermalWarning;
  if(s.thermalLimited){limited=true;assert.ok(s.throttle<=.25);break;}
 }
 assert.ok(warned&&limited);assert.ok(s.temperature>=THERMAL.limit);
 for(let i=0;i<8;i++){s=throttleCommand(s);assert.ok(s.throttle<=.25);}
 s=advance({...s,coolingLevel:3},2);assert.ok(s.thermalLimited);
 s=advance(s,90);assert.equal(s.thermalLimited,false);assert.equal(s.thermalWarning,false);
 assert.ok(s.temperature<=THERMAL.recover);
 const normal=advance({...running(),throttle:1,coolingLevel:2},180);assert.equal(normal.thermalWarning,false);
});

test('power loss preserves residual heat and cannot instantly create a cold machine',()=>{
 const hot={...running(),throttle:1,temperature:80,heatLoad:1};
 const off=command(hot,0,0);assert.equal(off.temperature,80);assert.equal(off.heatLoad,1);assert.equal(off.shutdownPhase,'interrupted');
 const later=advance(off,4);assert.ok(later.temperature>off.temperature);assert.ok(later.heatLoad>0&&later.heatLoad<1);
 assert.equal(coolingPowered(later),false);assert.equal(later.stage,0);
 const cold=advance(later,1800);assert.ok(cold.temperature<25);assert.equal(cold.shutdownPhase,'interrupted');
});

test('guided shutdown requires idle, control isolation and APU transfer',()=>{
 let s=startShutdown({...running(false),throttle:.75});assert.equal(s.shutdownPhase,'prepare');
 assert.equal(command(s,5,s.simAt).stage,6);assert.equal(command(s,4,s.simAt).stage,6);
 assert.equal(startSystemTest(s).error,true);
 s=throttleCommand(s);assert.equal(s.throttle,0);
 s=command(s,5,s.simAt);assert.equal(s.stage,5);
 s=command(s,4,s.simAt);assert.equal(s.stage,4);
 assert.equal(command(s,3,s.simAt).error,true);
 s=overheadCommand(s,50,s.simAt);s=overheadCommand(s,42,s.simAt);s=advance(s,2.6);
 s=overheadCommand(s,43,s.simAt);s=advance(s,9.1);s=overheadCommand(s,44,s.simAt);
 assert.equal(command(s,3,s.simAt).error,true,'MAIN GEN must be disconnected');
 s=overheadCommand(s,51,s.simAt);s=command(s,3,s.simAt);
 assert.equal(s.stage,3);assert.equal(s.shutdownPhase,'cooldown');assert.equal(coolingPowered(s),true);
 assert.equal(s.overhead.mainGen,false);assert.equal(s.overhead.reactorArm,false);
 const early=command(s,1,s.simAt);assert.equal(early.stage,3);assert.equal(early.error,true);
 const skipped=tick(s,s.simAt+1e9);assert.equal(skipped.shutdownPhase,'cooldown');assert.ok(skipped.cooldownElapsed<=.5);
 s=advance(s,90);assert.equal(s.shutdownPhase,'isolate');assert.ok(cooldownSafe(s));
 s=command(s,1,s.simAt);assert.equal(s.stage,1);
 s=command(s,0,s.simAt);assert.equal(s.stage,0);assert.equal(s.shutdownPhase,'isolate');
 for(const action of [45,46,47,44,42,50,40,41]){s=overheadCommand(s,action,s.simAt);assert.equal(s.error,false,s.message);}
 s=advance(s,5);assert.equal(s.shutdownPhase,'complete');assert.ok(shutdownChecklist(s).every(t=>t.done));
 const temp=s.temperature;s=overheadCommand(s,40,s.simAt);assert.equal(s.shutdownPhase,'idle');assert.equal(s.temperature,temp);
});

test('recovery after interrupted afterrun requires actual supply and a new cooling hold',()=>{
 let s=command({...startShutdown(running()),stage:4,overhead:{...running().overhead,mainGen:false}},3,0);
 s=advance(s,10);assert.ok(s.cooldownElapsed>9);
 s=overheadCommand(s,44,s.simAt);assert.equal(s.stage,0);assert.equal(s.shutdownPhase,'interrupted');assert.equal(s.cooldownElapsed,0);
 const waiting=advance(s,100);assert.equal(waiting.shutdownPhase,'interrupted');
 assert.equal(startShutdown(waiting).error,true);
 s=overheadCommand(waiting,44,waiting.simAt);s=advance(command(s,0,s.simAt),1.3);s=advance(command(s,1,s.simAt),2.6);
 s=startShutdown(s);assert.equal(s.shutdownPhase,'cooldown');assert.equal(s.cooldownElapsed,0);
 assert.equal(advance(s,10).shutdownPhase,'cooldown');
 s=advance(s,90);assert.equal(s.shutdownPhase,'isolate');
});

test('afterrun completion accounts for stored heat, not just current temperature',()=>{
 let s={...running(),stage:3,temperature:44,heatLoad:.4,shutdownPhase:'cooldown',cooldownElapsed:30,overhead:{...running().overhead,mainGen:false,reactorArm:false}};
 assert.equal(cooldownSafe(s),false);s=advance(s,.1);assert.equal(s.shutdownPhase,'cooldown');
 s=advance(s,90);assert.equal(s.shutdownPhase,'isolate');
 s=command(s,1,s.simAt);s=command(s,0,s.simAt);
 for(let i=0;i<900;i++){s=advance(s,.1);assert.ok(s.temperature<=THERMAL.release);}
});

test('shutdown cancellation is reversible only before reactor stop and never restarts systems',()=>{
 let s=command(startShutdown(running()),5,0);assert.equal(s.stage,5);
 s=startShutdown(s);assert.equal(s.shutdownPhase,'idle');assert.equal(s.stage,5);assert.equal(s.busy,-1);
 s=startShutdown(s);s=command(s,4,0);s=overheadCommand(s,51,0);s=command(s,3,0);
 assert.equal(startShutdown(s).shutdownPhase,'cooldown');assert.equal(startShutdown(s).stage,3);
 const hot={...running(),stage:3,temperature:70,heatLoad:.2,overhead:{...running().overhead,mainGen:false}};
 assert.equal(command(hot,3,0).error,true);
});
