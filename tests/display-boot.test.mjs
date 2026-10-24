import test from 'node:test';
import assert from 'node:assert/strict';
import {DisplayBoot,renderDisplay,batteryBeacon,coldCockpit} from '../lib/display-boot.ts';
import {initialState,overheadCommand} from '../lib/machine.ts';
import {createCanvas} from './canvas-fixture.mjs';
const supplied=()=>{const s=initialState();return {...s,stage:1,service:{...s.service,groundConnected:true}};};
export const displayKinds=['armor','radar','reactor','comm','diagnostics','cameras','power','preflight','hud','electrical'];

test('unpowered cold cockpit stays black with only the battery locator',()=>{
 const s=initialState(),boot=new DisplayBoot();
 boot.update(s,1000);assert.equal(boot.phase,'off');
 assert.equal(batteryBeacon(s,0),1.6);assert.equal(batteryBeacon(s,.8),0);assert.equal(batteryBeacon(s,.8,true),1.1);
 assert.equal(coldCockpit({...s,temperature:65}),false);assert.equal(batteryBeacon(supplied(),0),0);
});

test('either real battery switch starts boot immediately without advancing the machine',()=>{
 for(const action of [40,41]){
  const s=overheadCommand(initialState(),action,1000),boot=new DisplayBoot(),original=JSON.stringify(s);
  boot.update(s,1000);assert.equal(boot.phase,'boot');assert.equal(coldCockpit(s),false);assert.equal(batteryBeacon(s,0),0);
  boot.update(s,13999);assert.equal(boot.phase,'boot');boot.update(s,14000);assert.equal(boot.phase,'ready');
  assert.equal(s.stage,0);assert.equal(JSON.stringify(s),original);
 }
});

test('empty batteries cannot boot; a live second battery or source transfer preserves progress',()=>{
 const empty=initialState();empty.service.batteryAh=[0,0];
 const boot=new DisplayBoot();boot.update(overheadCommand(empty,40,0),0);assert.equal(boot.phase,'off');
 let s=overheadCommand(initialState(),40,0);boot.update(s,1000);
 s=overheadCommand(s,41,2000);s=overheadCommand(s,40,3000);boot.update(s,5000);assert.equal(boot.elapsed,4);
 s={...s,service:{...s.service,groundConnected:true}};s=overheadCommand(s,41,6000);
 boot.update(s,9000);assert.equal(boot.elapsed,8);
 s={...s,service:{...s.service,groundConnected:false}};boot.update(s,10000);assert.equal(boot.phase,'off');
 s=overheadCommand(s,40,11000);boot.update(s,11000);assert.equal(boot.phase,'boot');assert.equal(boot.elapsed,0);
});

test('main power starts a 13 second display boot and then hands over',()=>{
 const boot=new DisplayBoot(),s=supplied(),original=JSON.stringify(s);
 assert.equal(boot.update(s,1000),true);assert.equal(boot.phase,'boot');
 boot.update(s,13999);assert.equal(boot.phase,'boot');assert.ok(boot.elapsed<13);
 assert.equal(boot.update(s,14000),true);assert.equal(boot.phase,'ready');assert.equal(boot.elapsed,13);
 assert.equal(JSON.stringify(s),original,'presentation must not change the technical startup state');
});

test('power loss clears old progress; source transfer and camera changes do not restart boot',()=>{
 const boot=new DisplayBoot(),s=supplied();boot.update(s,0);boot.update(s,9000);
 const transfer={...s,service:{...s.service,groundConnected:false},overhead:{...s.overhead,apuMaster:true,fuelPump:true,apuPhase:'running',apuGen:true}};
 boot.update(transfer,10000);assert.equal(boot.elapsed,10);
 boot.update({...s,service:{...s.service,groundConnected:false}},10500);assert.equal(boot.phase,'off');
 boot.update(s,11000);assert.equal(boot.elapsed,0);boot.update(s,23999);assert.equal(boot.phase,'boot');boot.update(s,24000);assert.equal(boot.phase,'ready');
 boot.update(initialState(),25000);assert.equal(boot.phase,'off');assert.equal(boot.elapsed,0);
});

test('all ten displays have black cold pixels and rendered boot content', {skip:!createCanvas},()=>{
 for(const [i,kind]of displayKinds.entries()){
  const [w,h]=kind==='electrical'?[1440,140]:kind==='hud'?[640,480]:[960,720];
  const c=createCanvas(w,h).getContext('2d'),boot=new DisplayBoot();c.fillStyle='white';c.fillRect(0,0,w,h);
  renderDisplay(c,kind,initialState(),boot,0,i,false);
  let pixels=c.getImageData(0,0,w,h).data;
  for(let p=0;p<pixels.length;p+=4){assert.equal(pixels[p]+pixels[p+1]+pixels[p+2],0,kind+' must be black');assert.equal(pixels[p+3],kind==='hud'?0:255);}
  const battery=overheadCommand(initialState(),40,0);
  boot.update(battery,0);boot.update(battery,6000);renderDisplay(c,kind,battery,boot,6,i,false);
  pixels=c.getImageData(0,0,w,h).data;let lit=0;for(let p=0;p<pixels.length;p+=4)if(pixels[p+1]>70)lit++;
  assert.ok(lit>300,kind+' has real boot text/progress pixels');
  boot.update(initialState(),6100);renderDisplay(c,kind,initialState(),boot,6.1,i,false);
  pixels=c.getImageData(0,0,w,h).data;assert.ok(pixels.every((v,p)=>p%4===3||v===0),kind+' clears on power loss');
 }
});

test('all normal instrument pages render after boot without replacing their system state', {skip:!createCanvas},()=>{
 const s=supplied(),boot=new DisplayBoot();boot.update(s,0);boot.update(s,13000);
 for(const [i,kind]of displayKinds.entries()){
  const c=createCanvas(kind==='electrical'?1440:960,kind==='electrical'?140:720).getContext('2d');
  assert.doesNotThrow(()=>renderDisplay(c,kind,s,boot,13,i,true));
 }
});
