import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialState,command,tick,serviceCommand,overheadCommand,startSystemTest,startShutdown,throttleCommand} from '../lib/machine.ts';
import {mobilityCommand,releaseBlock} from '../lib/mobility.ts';
import {leakRate,serviceAlerts,unacknowledgedServiceAlerts,targetCoolantFlow} from '../lib/service-systems.ts';
import {checked,qualify,advance} from './mobility-helpers.mjs';
function gyro(){const s=initialState();return {...s,stage:5,simAt:0,actualPressure:210,coolantFlow:42.8,temperature:35,heatLoad:.28,overhead:{...s.overhead,battery1:true,battery2:true,fuelPump:true,apuMaster:true,apuPhase:'running',apuGen:true,mainGen:true,hydPump:true,coolantValve:true,avionics:true,reactorArm:true}};}
function online(){return checked({...gyro(),stage:6});}

test('link requires helmet calibration and all physical checks; full sequence can reach release',()=>{
 let s=gyro();assert.equal(command(s,5,0).error,true);
 assert.equal(mobilityCommand(s,83).error,true);
 s=mobilityCommand(s,82);s=mobilityCommand(s,83);s=advance(s,7.5);assert.equal(s.mobility.calibration,'running');
 assert.equal(command(s,5,s.simAt).error,true);s=advance(s,.6);assert.equal(s.mobility.calibration,'ready');
 assert.equal(command(s,5,s.simAt).error,true);
 s=startSystemTest(s);s=advance(s,13.2);for(const radarRange of [125,250,500])s=advance({...s,radarRange},2.6);
 assert.equal(s.testPhase,'passed');s=advance(command(s,5,s.simAt),2.1);assert.equal(s.stage,6);
 s=mobilityCommand(s,84);assert.equal(s.mobility.restraints,'releasing');s=advance(s,1);assert.ok(s.mobility.travel>.4&&s.mobility.travel<.6);
 s=advance(s,1.1);assert.equal(s.mobility.restraints,'released');assert.match(s.message,/Parkverriegelung gelöst/);
});
test('calibration measures simulated elapsed time and interruption cannot finish in the background',()=>{
 let s=mobilityCommand(mobilityCommand(gyro(),82),83);s=tick(s,1e9);assert.equal(s.mobility.elapsed,.5);
 s=mobilityCommand(s,82);s=advance(s,20);assert.equal(s.mobility.calibration,'idle');
 s=mobilityCommand(s,82);s=mobilityCommand(s,83);s=serviceCommand(s,76);s=advance(s,20);assert.equal(s.mobility.calibration,'idle');
 s=serviceCommand(s,76);assert.equal(s.mobility.calibration,'idle');assert.equal(command(s,5,s.simAt).error,true);
});
test('release requires zero load, disconnected ground power and healthy cooling',()=>{
 const good=online();assert.equal(releaseBlock(good),null);
 for(const s of [{...good,throttle:.25},{...good,service:{...good.service,groundConnected:true}},{...good,thermalWarning:true},{...good,coolantFlow:10},{...good,service:{...good.service,reservoirLitres:30}},{...good,service:{...good.service,coolantLeak:true}}]){
  assert.equal(mobilityCommand(s,84).error,true);assert.equal(mobilityCommand(s,84).mobility.restraints,'locked');
 }
 const released=advance(mobilityCommand(good,84),2.1);assert.equal(serviceCommand(released,68).error,true);assert.equal(startSystemTest(released).error,true);
});
test('helmet loss and hydraulic or sensor fault revoke link and close parking locks gradually',()=>{
 for(const interrupt of [s=>mobilityCommand(s,82),s=>serviceCommand(s,75),s=>serviceCommand(s,76),s=>command(s,0,s.simAt)]){
  let s=advance(mobilityCommand(online(),84),2.1);s=interrupt(s);
  assert.ok(s.stage<6);assert.equal(s.throttle,0);assert.equal(s.mobility.restraints,'locking');assert.equal(s.mobility.travel,1);
  s=advance(s,2.1);assert.equal(s.mobility.restraints,'locked');assert.equal(s.mobility.travel,0);
  assert.equal(s.mobility.calibration,'idle');
 }
});
test('shutdown waits for park locks; no hidden auto-release or clamp at nonzero load',()=>{
 let s=advance(mobilityCommand(online(),84),2.1);s=throttleCommand(s);assert.equal(s.throttle,.25);
 s=advance(s,1);assert.equal(s.mobility.restraints,'released');assert.equal(mobilityCommand(s,84).error,true);
 s=startShutdown(s);s=throttleCommand(s);assert.equal(s.throttle,0);assert.equal(command(s,5,s.simAt).error,true);
 s=mobilityCommand(s,84);assert.equal(s.mobility.restraints,'locking');s=advance(s,2.1);s=command(s,5,s.simAt);assert.equal(s.stage,5);s=command(s,4,s.simAt);assert.equal(s.stage,4);
});
test('leak consumes inventory; ack is not repair; isolation stops loss with reduced flow',()=>{
 let s=serviceCommand(online(),71);const before=s.service.reservoirLitres;
 assert.ok(leakRate(s)>0);s=advance(s,10);assert.ok(s.service.reservoirLitres<before-8);
 s=serviceCommand(s,67);assert.equal(s.service.coolantLeak,true);assert.deepEqual(unacknowledgedServiceAlerts(s),[]);
 const volume=s.service.reservoirLitres;s=advance(s,2);assert.ok(s.service.reservoirLitres<volume);
 s=serviceCommand(s,72);const isolated=s.service.reservoirLitres;assert.equal(leakRate(s),0);assert.equal(targetCoolantFlow(s),42.8*.7);
 s=advance(s,10);assert.equal(s.service.reservoirLitres,isolated);assert.ok(s.coolantFlow>29&&s.coolantFlow<31);
 s=serviceCommand(s,72);s=advance(s,1);assert.ok(s.service.reservoirLitres<isolated);
});
test('inventory cannot underflow; low coolant is a new warning after acknowledged leak',()=>{
 let s=serviceCommand(online(),71);s=serviceCommand(s,67);s={...s,service:{...s.service,reservoirLitres:72.01}};s=advance(s,1);
 assert.ok(unacknowledgedServiceAlerts(s).includes('coolantLow'));assert.equal(s.service.coolantLeak,true);
 s={...s,service:{...s.service,reservoirLitres:.001}};s=advance(s,2);assert.equal(s.service.reservoirLitres,0);assert.equal(targetCoolantFlow(s),0);
});
test('repair and refill preserve heat and demand cold, stopped and secured conditions',()=>{
 const hot=serviceCommand(online(),71);for(const action of [73,74])assert.equal(serviceCommand(hot,action).error,true);
 let s=initialState();s=serviceCommand(s,68);s={...s,service:{...s.service,coolantLeak:true,reservoirLitres:80,leakIsolated:true}};
 assert.equal(serviceCommand(s,74).error,true);assert.equal(serviceCommand({...s,coolantFlow:2},73).error,true);assert.equal(serviceCommand({...s,temperature:65},73).error,true);
 s=serviceCommand(s,73);assert.equal(s.service.coolantLeak,false);assert.equal(s.service.reservoirLitres,80);
 s=serviceCommand(s,74);assert.equal(s.service.reservoirLitres,240);assert.equal(s.temperature,18);assert.equal(s.service.leakIsolated,true);
 s=serviceCommand(s,72);assert.equal(s.service.leakIsolated,false);assert.deepEqual(serviceAlerts(s),[]);
});
test('fault recovery needs fresh calibration and tests; hydraulics loses and rebuilds pressure',()=>{
 let s=serviceCommand(online(),75);assert.equal(s.testPhase,'aborted');s=advance(s,6);assert.ok(s.actualPressure<2);assert.equal(s.stage,5);
 s=serviceCommand(s,75);s=advance(s,10);assert.ok(s.actualPressure>209);assert.equal(s.testPhase,'aborted');assert.equal(s.mobility.calibration,'idle');assert.equal(command(s,5,s.simAt).error,true);
 s=mobilityCommand(s,83);s=advance(s,8.1);s=startSystemTest(s);s=advance(s,2);s=serviceCommand(s,76);s=advance(s,20);assert.equal(s.testPhase,'aborted');
});

test('a gyro power cycle invalidates prior checks and cannot reuse stale readiness',()=>{
 let s=startShutdown(online());s=command(s,5,0);s=command(s,4,0);s=advance(s,.1);
 assert.equal(s.testPhase,'aborted');assert.deepEqual(s.testResults,[false,false,false]);assert.equal(s.mobility.calibration,'idle');
});
