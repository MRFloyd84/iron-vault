import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialState,command,tick,serviceCommand,startShutdown} from '../lib/machine.ts';
import {walkInput,idleInput,advanceWalking,walkingStopped,collisionAt,groundHeight,actualDriveLoad,WALK,walkSetting} from '../lib/walking.ts';
import {mobilityCommand} from '../lib/mobility.ts';
import {hangarCommand,advanceHangar} from '../lib/hangar.ts';
import {checked,advance} from './mobility-helpers.mjs';
function ready(){const s=initialState();return checked({...s,stage:6,simAt:0,throttle:1,hangar:{gate:'open',position:1},mobility:{...s.mobility,restraints:'released',travel:1},overhead:{...s.overhead,battery1:true,mainGen:true,hydPump:true,avionics:true,coolantValve:true,reactorArm:true}});}
const input=(s,f=1,t=0,brake=false)=>walkInput(s,{forward:f,turn:t,brake});
function travel(s,seconds){for(let i=0;i<seconds*40;i++)s=advanceWalking(s,.025);return s;}

test('cold, locked, unqualified, tethered or zero-power machines cannot walk',()=>{
 const r=ready();for(const s of [initialState(),{...r,stage:5},{...r,throttle:0},{...r,mobility:{...r.mobility,restraints:'locked'}},{...r,service:{...r.service,groundConnected:true}},{...r,service:{...r.service,coolantLeak:true}}]){
  const n=travel(input(s),3);assert.equal(n.walk.distance,0);assert.equal(n.walk.speed,0);
 }
});
test('acceleration, capped speed, backwards speed and reversal pass through a stop',()=>{
 let s=input(ready());s=travel(s,1);assert.ok(s.walk.speed>.5&&s.walk.speed<.8);s=travel(s,5);assert.equal(s.walk.speed,WALK.maxSpeed);
 const before=s.walk.z;s=input(s,-1);s=travel(s,.5);assert.ok(s.walk.speed>0);assert.ok(s.walk.z<before);
 s=travel(s,6);assert.equal(s.walk.speed,-WALK.reverseSpeed);
 const limited=travel(input({...ready(),throttle:.25}),8);assert.equal(limited.walk.speed,WALK.maxSpeed*.25);
});
test('released keys stop smoothly; held brake overrides all directional inputs',()=>{
 const moving=travel(input(ready()),5),released=travel(walkInput(moving,idleInput()),.4);assert.ok(released.walk.speed>0&&released.walk.speed<moving.walk.speed);
 const stop=travel(walkInput(moving,idleInput()),3);assert.ok(walkingStopped(stop));assert.ok(stop.walk.distance>moving.walk.distance);
 const braked=travel(input(moving,1,1,true),1);assert.ok(walkingStopped(braked));assert.ok(braked.walk.distance<stop.walk.distance);
});
test('A/D turn independently of viewing direction and steps include pivoting',()=>{
 const r=ready(),turned=travel(input(r,0,1),4);assert.ok(turned.walk.yaw>.8);assert.equal(turned.walk.distance,0);assert.ok(turned.walk.step>0);
 const forward=travel(input(turned),2);assert.ok(forward.walk.x<turned.walk.x);assert.ok(forward.walk.z<turned.walk.z);
});
test('closed and partly open gates block traversal; open gate permits the complete ramp route',()=>{
 for(const position of [0,.35]){const r=ready(),s=travel(input({...r,hangar:{gate:'stopped',position}}),25);assert.ok(s.walk.z>-31.6);assert.equal(s.walk.speed,0);assert.equal(s.walk.blocked,'Hangartor');}
 let s=input(ready());let maxHeight=0,maxPitch=0,minPitch=0;
 for(let i=0;i<2900;i++){s=advanceWalking(s,.025);maxHeight=Math.max(maxHeight,s.walk.height);maxPitch=Math.max(maxPitch,s.walk.pitch);minPitch=Math.min(minPitch,s.walk.pitch);}
 assert.ok(s.walk.z<-145,s.walk.blocked);assert.ok(maxHeight>1.79);assert.ok(maxPitch>.14&&minPitch<-.14);assert.equal(s.walk.height,0);
});
test('ramp sidewalls, containers, walls, barriers and outer limits are solid',()=>{
 assert.equal(collisionAt(-22,-67,1),'Container');assert.equal(collisionAt(39,-104,1),'Werkstatt');assert.equal(collisionAt(9.7,-87,1),'Betonbarriere');assert.equal(collisionAt(17,0,1),'Hangarseitenwand');assert.equal(collisionAt(0,9,1),'Hangarrückwand');assert.equal(collisionAt(0,-226,1),'Geländegrenze');
 const r=ready();let s=input({...r,walk:{...r.walk,x:-6,z:-121,yaw:-Math.PI/2}});s=travel(s,5);assert.ok(s.walk.x< -5.5);assert.equal(s.walk.blocked,'Rampenseitenwand');
 assert.equal(groundHeight(0,-121),1.8);assert.equal(groundHeight(0,-137),0);
});
test('emergency power cut retains location, brakes before parking and never teleports',()=>{
 let s=advance(input(ready()),8);const z=s.walk.z;assert.ok(s.walk.speed>1);
 s=command(s,0,s.simAt);assert.equal(s.walk.z,z);assert.equal(s.mobility.restraints,'locking');assert.equal(s.mobility.travel,1);
 s=tick(s,s.simAt+100);assert.ok(s.walk.speed>0);assert.equal(s.mobility.travel,1);
 s=advance(s,3);assert.ok(walkingStopped(s));assert.equal(s.mobility.restraints,'locked');assert.ok(s.walk.z<z&&s.walk.z>z-2);
});
test('parking and shutdown reject movement; remote power connects only at service bay',()=>{
 let s=travel(input(ready()),6);s={...s,throttle:0};assert.equal(mobilityCommand(s,84).error,true);assert.equal(startShutdown(s).error,true);
 const r=initialState();const elsewhere={...r,walk:{...r.walk,z:-55}};assert.equal(serviceCommand(elsewhere,68).error,true);assert.equal(serviceCommand(r,68).service.groundConnected,true);
});
test('gate obstruction stops the closing drive and refuses closing on the Mech',()=>{
 const r=ready(),occupied={...r,throttle:0,walk:{...r.walk,z:-34.5}};assert.equal(hangarCommand(occupied,92).error,true);
 const stopped=advanceHangar({...occupied,hangar:{gate:'closing',position:.9}},.1);assert.equal(stopped.hangar.gate,'stopped');assert.equal(stopped.hangar.position,.9);
});
test('walking consumes more actual power and produces more heat than standing unlocked',()=>{
 const r=ready(),standing=advance(r,35),moving=advance(input(r),35);assert.ok(moving.heatLoad>standing.heatLoad+.3);assert.ok(moving.temperature>standing.temperature+5);assert.equal(actualDriveLoad(standing),0);assert.ok(actualDriveLoad(moving)>.6);
 const locked={...r,mobility:{...r.mobility,restraints:'locked'}};assert.equal(actualDriveLoad(locked),1);
});
test('sway setting cycles independently and large time gaps cannot tunnel through a gate',()=>{
 let s=ready();for(const expected of [.8,0,.4]){s=walkSetting(s,94);assert.equal(s.walk.sway,expected);assert.equal(s.walk.z,WALK.originZ);}
 s=input({...s,hangar:{gate:'closed',position:0},walk:{...s.walk,z:-30.5,speed:2.2}});s=advanceWalking(s,100);assert.ok(s.walk.z>-31);assert.equal(s.walk.blocked,'Hangartor');
});
