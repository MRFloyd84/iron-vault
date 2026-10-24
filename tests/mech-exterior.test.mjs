import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MECH,legCycle,solveLeg,prepareMechanicalRig,prepareTorsoRig,animateMechanicalRig,applyMechBodyPose} from '../lib/mech-exterior.ts';
import {neutralJoints,ARM_RADIUS,TORSO_RADIUS,RAD} from '../lib/articulation.ts';
import {WALK,groundHeight} from '../lib/walking.ts';
import {CABIN} from '../lib/cockpit-envelope.ts';

async function asset(){
 const b=fs.readFileSync(new URL('../public/models/iron-vault-rigged.glb',import.meta.url));
 const n=b.readUInt32LE(12),g=JSON.parse(b.subarray(20,20+n).toString());
 const data=structuredClone(g);for(const m of data.meshes)for(const p of m.primitives)delete p.material;
 delete data.materials;delete data.images;delete data.textures;
 data.buffers[0].uri='data:application/octet-stream;base64,'+b.subarray(28+n).toString('base64');
 globalThis.ProgressEvent??=class {};
 const {scene}=await new GLTFLoader().parseAsync(JSON.stringify(data),'');return {scene,g,bytes:b.length};
}
function rigPose(model,cabin,walk){
 applyMechBodyPose(cabin,walk);
}
test('waist separation preserves triangles; pelvis/feet stay aligned while cabin and arms articulate',async()=>{
 const {scene:model}=await asset(),torso=model.getObjectByName('Torso');
 const original=torso.geometry.index.count,pelvis=prepareTorsoRig(model);
 assert.equal(torso.geometry.index.count+model.getObjectByName('Pelvis').geometry.index.count,original);
 assert.equal(prepareTorsoRig(model),pelvis,'idempotent setup');
 const legs=prepareMechanicalRig(model),cabin=new THREE.Group(),root=new THREE.Group();
 cabin.scale.setScalar(MECH.cabinScale);root.position.set(0,(MECH.floor-MECH.cabinLift)/MECH.cabinScale,WALK.originZ);
 root.scale.setScalar(MECH.modelScale/MECH.cabinScale);root.rotation.y=Math.PI;cabin.add(root);root.add(model);
 const w={x:0,z:-75,yaw:.3,height:0,pitch:.12,roll:.05,phase:.3,speed:1,turnRate:.1};
 applyMechBodyPose(cabin,w);animateMechanicalRig(model,legs,w,neutralJoints());
 const baseline=legs.map(l=>[l.thigh.getWorldPosition(new THREE.Vector3()),l.foot.getWorldPosition(new THREE.Vector3())]);
 for(const angle of [-45,-20,20,45]){
  const pose={...neutralJoints(),torso:angle*RAD,leftShoulder:30*RAD,leftElbow:45*RAD};
  applyMechBodyPose(cabin,w,1,true,pose.torso);animateMechanicalRig(model,legs,w,pose);
  legs.forEach((l,i)=>{assert.ok(l.thigh.getWorldPosition(new THREE.Vector3()).distanceTo(baseline[i][0])<1e-8,'hip moved with torso');assert.ok(l.foot.getWorldPosition(new THREE.Vector3()).distanceTo(baseline[i][1])<1e-8,'foot moved with torso');});
  assert.ok(Math.abs(model.getObjectByName('L_Upperarm').rotation.x+30*RAD)<1e-8);
  assert.ok(Math.abs(model.getObjectByName('L_Forearm').rotation.x+45*RAD)<1e-8);
 }
 let radius=0,torsoRadius=0,min=Infinity,max=-Infinity;
 // Sweep shoulder/elbow independently, including intermediate extrema.
 Object.assign(w,{yaw:0,pitch:0,roll:0,speed:0,turnRate:0});
 for(const lift of [0,10,20,30,40])for(const bend of [0,11,22,33,44,55])for(const yaw of [-45,0,45]){
  const pose={torso:yaw*RAD,leftShoulder:lift*RAD,rightShoulder:lift*RAD,leftElbow:bend*RAD,rightElbow:bend*RAD};
  applyMechBodyPose(cabin,w,1,true,pose.torso);animateMechanicalRig(model,legs,w,pose);
  model.traverse(o=>{if(!o.isMesh)return;const a=o.geometry.attributes.position,index=o.geometry.index,p=new THREE.Vector3();
   for(let j=0;j<(index?.count??a.count);j++){p.fromBufferAttribute(a,index?index.getX(j):j).applyMatrix4(o.matrixWorld);radius=Math.max(radius,Math.hypot(p.x-w.x,p.z-w.z));min=Math.min(min,p.y);max=Math.max(max,p.y);}
  });
 }
 Object.assign(w,{speed:2.2,pitch:.15,roll:.05,turnRate:.28});
 for(let i=0;i<24;i++){
  w.phase=i/24;const pose={torso:Math.sin(i)*45*RAD,leftShoulder:40*RAD,rightShoulder:40*RAD,leftElbow:55*RAD,rightElbow:55*RAD};
  applyMechBodyPose(cabin,w,1,true,pose.torso);animateMechanicalRig(model,legs,w,pose);
  model.traverse(o=>{if(!o.isMesh)return;const a=o.geometry.attributes.position,index=o.geometry.index,p=new THREE.Vector3();
   for(let j=0;j<(index?.count??a.count);j++){p.fromBufferAttribute(a,index?index.getX(j):j).applyMatrix4(o.matrixWorld);radius=Math.max(radius,Math.hypot(p.x-w.x,p.z-w.z));}
  });
 }
 for(let i=0;i<24;i++)for(const yaw of [-45,45]){
  w.phase=i/24;const pose={...neutralJoints(),torso:yaw*RAD};
  applyMechBodyPose(cabin,w,1,true,pose.torso);animateMechanicalRig(model,legs,w,pose);
  model.traverse(o=>{if(!o.isMesh)return;const a=o.geometry.attributes.position,index=o.geometry.index,p=new THREE.Vector3();
   for(let j=0;j<(index?.count??a.count);j++){p.fromBufferAttribute(a,index?index.getX(j):j).applyMatrix4(o.matrixWorld);torsoRadius=Math.max(torsoRadius,Math.hypot(p.x-w.x,p.z-w.z));}
  });
 }
 assert.ok(torsoRadius<TORSO_RADIUS,`Twisted torso exceeds ${TORSO_RADIUS}: ${torsoRadius}`);
 console.log({articulationRadius:radius,articulationMin:min,articulationMax:max});
 assert.ok(radius<ARM_RADIUS,`Articulated reach ${radius} exceeds reserved envelope`);assert.ok(min>=MECH.floor-.01);assert.ok(max<7.45);
});
test('two-link solver preserves rigid link lengths including unreachable targets',()=>{
 for(const target of [new THREE.Vector3(0,-4,.5),new THREE.Vector3(1,-20,1),new THREE.Vector3(.01,-.01,0)]){
  const hip=new THREE.Vector3(),{knee,ankle}=solveLeg(hip,target,2.3,2.5,new THREE.Vector3(0,0,-1));
  assert.ok(Math.abs(hip.distanceTo(knee)-2.3)<1e-7);assert.ok(Math.abs(knee.distanceTo(ankle)-2.5)<1e-7);
 }
 for(const side of [-1,1])for(let i=0;i<100;i++){
  const c=legCycle(i/100,side,2,0);assert.ok(c.lift>=0&&c.lift<=.560001);
 }
});

test('actual GLB has rigid sections, unchanged PBR maps, bounded geometry and connected walking joints',async()=>{
 const {scene:model,g,bytes}=await asset();const legs=prepareMechanicalRig(model),cabin=new THREE.Group(),root=new THREE.Group();
 cabin.scale.setScalar(MECH.cabinScale);root.position.set(0,(MECH.floor-MECH.cabinLift)/MECH.cabinScale,WALK.originZ);
 root.scale.setScalar(MECH.modelScale/MECH.cabinScale);root.rotation.y=Math.PI;cabin.add(root);root.add(model);
 assert.equal(g.meshes.length,11);assert.equal(g.images.length,3);assert.ok(bytes<8e6);
 assert.ok(g.extras.ironVault.triangles<=160000);assert.ok(g.extras.ironVault.simplificationError<.001);
 assert.equal(model.getObjectByName('L_Upperarm').position.y,model.getObjectByName('R_Upperarm').position.y);
 let radius=0,min=Infinity,max=-Infinity,maxAnkleError=0,outermost='',ankleCase='';
 for(const [speed,turn,z,pitch]of [[0,0,1.3,0],[.1,0,1.3,0],[.4,0,1.3,0],[-.4,.28,1.3,0],[2.2,0,1.3,0],[-1.1,0,1.3,0],[-1.1,-.28,1.3,0],[0,.28,1.3,0],[2.2,.28,1.3,0],[2.2,-.28,1.3,0],[1,0,-111,.15],[1,0,-130,-.15]])for(let i=0;i<32;i++){
  const w={x:0,z,yaw:0,height:groundHeight(0,z),pitch,roll:0,phase:i/32,speed,turnRate:turn};
  rigPose(model,cabin,w);animateMechanicalRig(model,legs,w);
  for(const leg of legs){
   const hip=leg.thigh.getWorldPosition(new THREE.Vector3()),knee=leg.calf.getWorldPosition(new THREE.Vector3()),ankle=leg.foot.getWorldPosition(new THREE.Vector3());
   assert.ok(Math.abs(hip.distanceTo(knee)-leg.upperLength)<1e-6);assert.ok(Math.abs(knee.distanceTo(ankle)-leg.lowerLength)<1e-6);
   const cycle=legCycle(w.phase,leg.side,speed,turn);
   let clearance=Infinity;const orientation=leg.foot.getWorldQuaternion(new THREE.Quaternion());
   for(const support of leg.sole){const p=support.clone().applyQuaternion(orientation).add(ankle);
    clearance=Math.min(clearance,p.y-MECH.floor-groundHeight(p.x,p.z));}
   const error=Math.abs(clearance-cycle.lift-.004);if(error>maxAnkleError){maxAnkleError=error;ankleCase=JSON.stringify({phase:w.phase,z,side:leg.side,clearance,lift:cycle.lift});}
  }
  if(z===1.3)model.traverse(o=>{if(!o.isMesh)return;const a=o.geometry.attributes.position,p=new THREE.Vector3();
   for(let j=0;j<a.count;j++){p.fromBufferAttribute(a,j).applyMatrix4(o.matrixWorld);const r=Math.hypot(p.x,p.z-w.z);if(r>radius){radius=r;outermost=o.name+' / phase '+w.phase;}min=Math.min(min,p.y);max=Math.max(max,p.y);}
  });
 }
 console.log({radius,outermost,min,max,maxAnkleError,ankleCase,soleVertices:legs.map(l=>l.sole.length)});
 assert.ok(radius<WALK.radius,`Footprint ${radius} > ${WALK.radius}`);
 assert.ok(max<7.45,`Roof ${max} hits crane`);assert.ok(min>=MECH.floor-.04,`Sole below floor: ${min}`);
 assert.ok(maxAnkleError<1e-5,`Unreachable terrain contacts: ${maxAnkleError}`);
 assert.ok(CABIN.roofY*MECH.cabinScale+MECH.cabinLift<max);
 console.log({triangles:g.extras.ironVault.triangles,bytes,radius,height:max-min,maxAnkleError});
});

test('gait has double support, continuous foot roll, and stride-matched support travel',()=>{
 for(const direction of [-1,1])for(const side of [-1,1]){
  for(const boundary of [0,.56,1]){
   const p=boundary-(side>0?.5:0),a=legCycle(p-1e-7,side,direction*2,0),b=legCycle(p+1e-7,side,direction*2,0);
   for(const key of ['offset','lift','pitch'])assert.ok(Math.abs(a[key]-b[key])<1e-5,`${key} jumps at ${boundary}`);
  }
  const a=legCycle(.15-(side>0?.5:0),side,direction*2,0),b=legCycle(.35-(side>0?.5:0),side,direction*2,0);
  assert.ok(Math.abs(b.offset-a.offset-WALK.stride*.2*direction)<1e-8);
 }
 assert.equal(legCycle(.02,-1,2,0).lift,0);assert.equal(legCycle(.02,1,2,0).lift,0);
 for(const side of [-1,1])assert.equal(legCycle(.8,side,0,0).lift,0);
});

test('shoulders, elbows, hips, knees and ankles articulate and settle without an idle loop',async()=>{
 const {scene:model}=await asset(),legs=prepareMechanicalRig(model),cabin=new THREE.Group(),root=new THREE.Group();
 cabin.scale.setScalar(MECH.cabinScale);root.position.set(0,(MECH.floor-MECH.cabinLift)/MECH.cabinScale,WALK.originZ);
 root.scale.setScalar(MECH.modelScale/MECH.cabinScale);root.rotation.y=Math.PI;cabin.add(root);root.add(model);
 const w={x:0,z:-70,yaw:.65,height:0,pitch:0,roll:0,phase:0,speed:2.2,turnRate:0};
 const names=['L_Upperarm','R_Upperarm','L_Forearm','R_Forearm','L_Thigh','R_Thigh','L_Calf','R_Calf','L_Foot','R_Foot'];
 const first=new Map(),ranges=new Map(names.map(n=>[n,0]));
 for(let i=0;i<32;i++){
  w.phase=i/32;applyMechBodyPose(cabin,w);animateMechanicalRig(model,legs,w);
  for(const name of names){const q=model.getObjectByName(name).quaternion;if(!first.has(name))first.set(name,q.clone());ranges.set(name,Math.max(ranges.get(name),first.get(name).angleTo(q)));}
 }
 for(const [name,angle]of ranges)assert.ok(angle>.10,`${name} barely moves: ${angle}`);
 w.speed=0;w.turnRate=0;const poses=[];
 for(const phase of [.1,.7]){w.phase=phase;applyMechBodyPose(cabin,w);animateMechanicalRig(model,legs,w);poses.push(model.getObjectByName('L_Foot').matrixWorld.clone());
  for(const name of names.filter(n=>/arm/.test(n)))assert.ok(model.getObjectByName(name).quaternion.angleTo(new THREE.Quaternion())<1e-7);
 }
 assert.deepEqual(poses[0].elements,poses[1].elements);
 w.speed=2.2;const disabled=[];
 for(const phase of [.1,.7]){w.phase=phase;applyMechBodyPose(cabin,w,0);disabled.push(cabin.matrixWorld.clone());}
 assert.deepEqual(disabled[0].elements,disabled[1].elements,'motion-disabled cockpit must not sway');
 console.log('Joint angular travel (degrees)',Object.fromEntries([...ranges].map(([n,a])=>[n,Math.round(a*180/Math.PI)])));
});
