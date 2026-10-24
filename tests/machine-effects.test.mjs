import {checked,qualify} from './mobility-helpers.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate} from 'node:timers/promises';
import {MachineEffects} from '../lib/machine-effects.ts';
import {initialState,command,overheadCommand,tick} from '../lib/machine.ts';

const durations=[9,13.25,9.3,6.5,15.25];
const keys=['apuStart','apuRun','apuStop','powerDown','gyro'];
function setup(delayed=false){
 const sources=[],decodes=[];
 const param=()=>({value:0,setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;},setTargetAtTime(v){this.value=v;},cancelScheduledValues(){}});
 const output={name:'shared mute bus'};
 const ctx={currentTime:0,state:'running',
  createGain(){return {gain:param(),connect(node){this.output=node;},disconnect(){}};},
  createBufferSource(){const source={loop:false,stops:[],connect(node){this.output=node;},disconnect(){},start(when,offset){this.when=when;this.offset=offset;sources.push(this);},stop(when=0){this.stops.push(when);}};return source;},
  decodeAudioData(bytes){const effect=new Uint8Array(bytes)[0],buffer={effect,duration:durations[effect]};return delayed?new Promise(resolve=>decodes.push(()=>resolve(buffer))):Promise.resolve(buffer);},
 };
 const bytes=Object.fromEntries(keys.map((key,i)=>[key,Promise.resolve(new Uint8Array([i]).buffer)]));
 const effects=new MachineEffects(ctx,output,bytes);
 return {effects,ctx,sources,output,resolve(){decodes.forEach(resolve=>resolve());},of(index){return sources.filter(s=>s.buffer.effect===index);}};
}
const apu=(phase,progress=0,started=100)=>{
 const s=initialState();s.overhead={...s.overhead,battery1:true,battery2:true,fuelPump:true,apuMaster:true,apuPhase:phase,apuProgress:progress,apuStarted:started};return s;
};

test('APU preparation is silent; start plays once and hands over to its own running loop',async()=>{
 const f=setup();let s=initialState();f.effects.update(s);
 for(const action of [40,41,50,42]){s=overheadCommand(s,action,100);f.effects.update(s);}
 await setImmediate();assert.equal(f.sources.length,0);
 s=tick(s,2600);s=overheadCommand(s,43,2600);f.effects.update(s);await setImmediate();
 assert.equal(f.of(0).length,1);assert.equal(f.of(0)[0].loop,false);
 for(const time of [2700,4000,6000]){s=tick(s,time);f.effects.update(s);}await setImmediate();assert.equal(f.of(0).length,1);
 s=tick(s,11600);f.effects.update(s);await setImmediate();
 assert.equal(f.of(0)[0].stops.length,1);assert.equal(f.of(1).length,1);assert.equal(f.of(1)[0].loop,true);
 s=overheadCommand(s,44,11700);f.effects.update(s);await setImmediate();assert.equal(f.of(1).length,1);
 assert.equal(f.of(1)[0].output.output,f.output,'all sounds must use the shared mute bus');
});

test('a start aborted while decoding never plays a late startup sound',async()=>{
 const f=setup(true);f.effects.update(apu('starting',.2));await setImmediate();
 f.effects.update(initialState());f.resolve();await setImmediate();
 assert.equal(f.of(0).length,0);assert.equal(f.of(1).length,0);assert.equal(f.of(2).length,1);
});

test('rapid restart invalidates stale shutdown audio and seeks to the current startup progress',async()=>{
 const f=setup(true);f.effects.update(apu('starting',.1,100));await setImmediate();
 f.effects.update(initialState());f.effects.update(apu('starting',.4,12000));
 f.resolve();await setImmediate();
 assert.equal(f.of(0).length,1);assert.equal(f.of(0)[0].offset,3.6);assert.equal(f.of(2).length,0);
});

test('APU shutdown plays once; repeated ticks and a completed sound do not retrigger it',async()=>{
 const f=setup();f.effects.update(apu('running',1));await setImmediate();
 f.effects.update(initialState());await setImmediate();assert.equal(f.of(2).length,1);
 f.of(2)[0].onended();for(let i=0;i<50;i++)f.effects.update(initialState());await setImmediate();
 assert.equal(f.of(2).length,1);
});

test('cutting main power leaves a separately running APU audible and stops the gyro',async()=>{
 const f=setup(),s=apu('running',1);Object.assign(s,{stage:6});Object.assign(s.overhead,{apuGen:true,mainGen:true,coolantValve:true,hydPump:true,avionics:true,reactorArm:true});
 f.effects.update(s);await setImmediate();assert.equal(f.of(4).length,1);
 const off=command(s,0,1000);f.effects.update(off);await setImmediate();
 assert.equal(off.overhead.apuPhase,'running');assert.equal(f.of(1)[0].stops.length,0);assert.equal(f.of(2).length,0);
 assert.equal(f.of(3).length,1);assert.equal(f.of(4)[0].stops.length,1);
 f.effects.update(tick(off,1100));await setImmediate();assert.equal(f.of(3).length,1);
});

test('APU shutdown after generator handover does not play the main power-down effect',async()=>{
 const f=setup(),s=checked(apu('running',1));s.stage=6;Object.assign(s.overhead,{apuGen:true,mainGen:true,coolantValve:true,hydPump:true,avionics:true,reactorArm:true});
 f.effects.update(s);await setImmediate();
 const off=overheadCommand(s,42,1000);f.effects.update(off);await setImmediate();
 assert.equal(off.stage,6);assert.equal(f.of(2).length,1);assert.equal(f.of(3).length,0);assert.equal(f.of(4)[0].stops.length,0);
});

test('gyro loop starts during alignment, survives alignment completion, and fades when disabled',async()=>{
 const f=setup(),s=apu('running',1);s.stage=4;f.effects.update(s);await setImmediate();assert.equal(f.of(4).length,0);
 f.effects.update({...s,busy:4,progress:.4});await setImmediate();assert.equal(f.of(4).length,1);
 f.effects.update({...s,stage:5});await setImmediate();assert.equal(f.of(4).length,1);
 f.effects.update(s);assert.equal(f.of(4)[0].stops.length,1);
});

test('late-loaded shutdown clips are skipped after their time window and dispose cancels pending audio',async()=>{
 const f=setup(true);f.effects.update(apu('running',1));await setImmediate();f.effects.update(initialState());
 f.ctx.currentTime=20;f.effects.update(initialState());f.resolve();await setImmediate();assert.equal(f.sources.length,0);
 const g=setup(true);g.effects.update(apu('starting'));await setImmediate();g.effects.dispose();g.resolve();await setImmediate();assert.equal(g.sources.length,0);
});
