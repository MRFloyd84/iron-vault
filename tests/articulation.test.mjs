import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialState,command} from '../lib/machine.ts';
import {advanceWalking,collisionAt} from '../lib/walking.ts';
import {hydraulicReadings} from '../lib/hydraulics.ts';
import {JOINTS,JOINT_LIMITS,RAD,ARM_RADIUS,neutralJoints,jointCommand,jointInput,stopArticulation,advanceArticulation,JointPresentation} from '../lib/articulation.ts';
const ready=()=>{const s=initialState();return {...s,stage:6,actualPressure:210,coolantFlow:42.8,testPhase:'passed',overhead:{...s.overhead,avionics:true,hydPump:true,mainGen:true},mobility:{...s.mobility,helmet:true,calibration:'ready',restraints:'released'},walk:{...s.walk,z:-75}};};
test('five joints clamp targets, rate-limit travel and hold on release/power loss',()=>{
 let s=ready();for(const k of JOINTS)s=jointCommand(s,k,500);
 let next=advanceArticulation(s,.1);for(const k of JOINTS){assert.equal(s.articulation.target[k],JOINT_LIMITS[k][1]*RAD);assert.ok(next.articulation.pose[k]>.001&&next.articulation.pose[k]<=2.40001*RAD);}
 for(let i=0;i<50;i++)next=advanceArticulation(next,.1);
 assert.deepEqual(next.articulation.pose,s.articulation.target);
 const lost=advanceArticulation({...next,actualPressure:0},.1);assert.deepEqual(lost.articulation.pose,next.articulation.pose);assert.deepEqual(lost.articulation.target,lost.articulation.pose);assert.equal(lost.articulation.effort,0);
 const off=command(next,0,1000);assert.deepEqual(off.articulation.pose,next.articulation.pose,'power off must not snap joints');
 assert.equal(jointCommand(initialState(),'torso',20).error,true);
 const stopped=stopArticulation(jointCommand(ready(),'torso',40));assert.deepEqual(stopped.articulation.target,stopped.articulation.pose);
});
test('torso input is independent of gait; arms reserve clearance and can retract',()=>{
 let s=ready();s=jointInput(s,{...neutralJoints(),torso:1});s=advanceArticulation(s,.1);
 assert.ok(s.articulation.pose.torso>0);assert.equal(s.walk.yaw,0);
 const released=advanceArticulation(jointInput(s,neutralJoints()),.1);assert.deepEqual(released.articulation.pose,s.articulation.pose);
 const hall={...ready(),walk:{...ready().walk,z:1.3}};assert.equal(jointCommand(hall,'leftShoulder',20).error,true);assert.equal(jointCommand(hall,'torso',30).error,false);
 let extended=advanceArticulation(jointCommand(ready(),'leftShoulder',30),.5);
 assert.ok(extended.articulation.pose.leftShoulder>0);assert.equal(extended.articulation.pose.rightShoulder,0);
 const cramped={...extended,walk:{...extended.walk,z:-22}};
 assert.equal(collisionAt(0,-22,1),null);assert.ok(collisionAt(0,-22,1,ARM_RADIUS));
 assert.equal(jointCommand(cramped,'leftShoulder',40).error,true);
 const retract=advanceArticulation(jointCommand(cramped,'neutral'),.5);assert.ok(retract.articulation.pose.leftShoulder<extended.articulation.pose.leftShoulder);
 const moving=advanceWalking({...cramped,throttle:1,walk:{...cramped.walk,speed:.5,input:{forward:1,turn:0,brake:false}}},.1);assert.equal(moving.walk.speed,0);
 assert.ok(hydraulicReadings(extended).demand>hydraulicReadings(ready()).demand);
});
test('joint interpolation matches walking delay and resets across suspension',()=>{
 for(const fps of [30,60,144]){
  const p=new JointPresentation(),out=neutralJoints();let sample=0;
  for(let i=0;i<fps*2;i++){const now=i*1000/fps;sample=Math.floor(now/70)*70;p.sample({...neutralJoints(),torso:sample/1000},sample,now,out);if(now>200)assert.ok(Math.abs(out.torso-(now-100)/1000)<1e-10);}
  p.sample({...neutralJoints(),torso:5},5000,5000,out);assert.equal(out.torso,5);
 }
});
