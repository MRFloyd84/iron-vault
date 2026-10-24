import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialState,command,tick} from '../lib/machine.ts';
import {hangarCommand,advanceHangar} from '../lib/hangar.ts';
import {checked,advance} from './mobility-helpers.mjs';

function ready(){const s=initialState();return checked({...s,stage:6,simAt:0,mobility:{...s.mobility,restraints:'released',travel:1},overhead:{...s.overhead,battery1:true,mainGen:true,hydPump:true,avionics:true,coolantValve:true,reactorArm:true}});}
test('hangar opening requires power, full release, idle and healthy systems',()=>{
 const good=ready();assert.equal(hangarCommand(good,90).hangar.gate,'opening');
 for(const s of [initialState(),{...good,throttle:.25},{...good,stage:5},{...good,mobility:{...good.mobility,restraints:'locked'}},{...good,service:{...good.service,groundConnected:true}},{...good,service:{...good.service,coolantLeak:true}}]){
  const next=hangarCommand(s,90);assert.equal(next.error,true);assert.equal(next.hangar.gate,'closed');
 }
});
test('gate opens over ten simulated seconds and obeys stop, reverse and travel limits',()=>{
 let s=hangarCommand(ready(),90);s=advance(s,4);assert.ok(Math.abs(s.hangar.position-.4)<.01);
 s=hangarCommand(s,91);const pos=s.hangar.position;s=advance(s,8);assert.equal(s.hangar.position,pos);
 s=hangarCommand(s,92);s=advance(s,5);assert.equal(s.hangar.gate,'closed');assert.equal(s.hangar.position,0);
 s=hangarCommand(s,90);s=advance(s,11);assert.equal(s.hangar.gate,'open');assert.equal(s.hangar.position,1);
 assert.equal(hangarCommand(s,90).hangar.gate,'open');
 s=hangarCommand(s,92);s=advance(s,11);assert.equal(s.hangar.gate,'closed');
});
test('hangar supply retains position and continues travel when main Mech power is cut',()=>{
 let s=advance(hangarCommand(ready(),90),3);const before=s.hangar.position;s=command(s,0,s.simAt);assert.equal(s.hangar.position,before);assert.equal(s.stage,0);
 s=advance(s,8);assert.equal(s.hangar.gate,'open');assert.equal(s.mobility.restraints,'locked');
});
test('closing and stopping remain available without combat readiness; large clock gaps are capped',()=>{
 const cold=initialState();let s={...cold,simAt:0,overhead:{...cold.overhead,battery1:true},hangar:{gate:'open',position:1}};
 s=hangarCommand(s,92);assert.equal(s.error,false);s=tick(s,1e9);assert.ok(s.hangar.position>=.95);
 s=hangarCommand(s,91);assert.equal(s.hangar.gate,'stopped');assert.equal(advanceHangar(s,100).hangar.position,s.hangar.position);
});
