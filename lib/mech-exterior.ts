import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {ConvexHull} from 'three/examples/jsm/math/ConvexHull.js';
import type {CockpitScene} from './cockpit-scene';
import type {MachineState} from './machine';
import {groundHeight,WALK} from './walking';
import {neutralJoints,type JointPose} from './articulation';

// Authored cabin coordinates stay intact, uniformly scaled into the torso.
export const MECH={cabinLift:4.6,cabinScale:.46,modelScale:9.5,floor:-2.6,
 orbitRadius:15,orbitMin:8,orbitMax:27,orbitTargetY:2.1} as const;
export const MECH_ASSET='/models/iron-vault-rigged.glb';
type WalkPose=CockpitScene['walkPose'];
type Leg={side:number;thigh:THREE.Object3D;calf:THREE.Object3D;foot:THREE.Object3D;
 upper:THREE.Vector3;lower:THREE.Vector3;restFoot:THREE.Vector3;upperLength:number;lowerLength:number;sole:THREE.Vector3[]};
const clamp=THREE.MathUtils.clamp;
const smooth=(t:number)=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const gaitAmount=(walk:WalkPose)=>Math.min(1,Math.abs(walk.speed)/.4+Math.abs(walk.turnRate)*6);

export function bodyCompression(walk:WalkPose,motion=1){
 // Two compressions per stride, deepest at weight acceptance. No idle bob.
 return (.30+.07*(.5+.5*Math.cos(walk.phase*Math.PI*4))*motion)*gaitAmount(walk)+.15*Math.min(1,(Math.abs(walk.pitch)+Math.abs(walk.roll))/.1);
}

export function applyMechBodyPose(cabin:THREE.Object3D,walk:WalkPose,motion=1,updateChildren=true,torsoYaw=0){
 const amount=gaitAmount(walk)*motion,phase=walk.phase*Math.PI*2;
 const sway=-Math.sin(phase)*.10*amount;
 const yaw=walk.yaw+Math.cos(phase)*.020*amount*clamp(walk.speed/.4,-1,1);
 cabin.position.set(walk.x+Math.cos(walk.yaw)*sway-Math.sin(yaw)*WALK.originZ*MECH.cabinScale,
  walk.height+MECH.cabinLift-bodyCompression(walk,motion),
  walk.z-Math.sin(walk.yaw)*sway-Math.cos(yaw)*WALK.originZ*MECH.cabinScale);
 cabin.rotation.set(walk.pitch*.55-.018*clamp(walk.speed/WALK.maxSpeed,-1,1)*motion,yaw,
  walk.roll*.45+Math.sin(phase)*.010*amount-clamp(walk.turnRate,-.28,.28)*.035*motion,'YXZ');
 // Turn around the waist axis, not around the pilot camera. Apply after the
 // base tilt so counter-rotation restores the entire pelvis pose on slopes too.
 if(torsoYaw){cabin.position.add(new THREE.Vector3(-Math.sin(torsoYaw)*WALK.originZ,0,
  (1-Math.cos(torsoYaw))*WALK.originZ).multiplyScalar(MECH.cabinScale).applyQuaternion(cabin.quaternion));cabin.rotateY(torsoYaw);}
 if(updateChildren)cabin.updateMatrixWorld(true);else cabin.updateWorldMatrix(true,false);
}

// Split only index buffers once on load. Shared vertex/PBR data stays intact;
// the neutral silhouette retains every original triangle exactly once.
export function prepareTorsoRig(model:THREE.Object3D){
 const existing=model.getObjectByName('PelvisFrame');if(existing)return existing;
 const torso=model.getObjectByName('Torso');if(!(torso instanceof THREE.Mesh))throw new Error('Torso mesh missing');
 const geometry:THREE.BufferGeometry=torso.geometry,positions=geometry.attributes.position,index=geometry.index;
 if(!index)throw new Error('Indexed torso geometry required');
 const upper:number[]=[],lower:number[]=[];
 for(let i=0;i<index.count;i+=3){
  const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);
  ((positions.getY(a)+positions.getY(b)+positions.getY(c))/3<.565?lower:upper).push(a,b,c);
 }
 if(!lower.length||!upper.length)throw new Error('Waist partition empty');
 const section=(indices:number[])=>{const g=new THREE.BufferGeometry();for(const [key,value]of Object.entries(geometry.attributes))g.setAttribute(key,value);g.setIndex(indices);g.computeBoundingSphere();return g;};
 torso.geometry=section(upper);
 const pelvis=new THREE.Group();pelvis.name='PelvisFrame';model.add(pelvis);
 const mesh=new THREE.Mesh(section(lower),torso.material);mesh.name='Pelvis';mesh.position.copy(torso.position);pelvis.add(mesh);
 for(const name of ['L_Thigh','R_Thigh']){const leg=model.getObjectByName(name);if(!leg)throw new Error('Hip missing');pelvis.attach(leg);}
 const bearing=new THREE.Mesh(new THREE.CylinderGeometry(.166,.166,.08,16),new THREE.MeshStandardMaterial({color:0x252b28,roughness:.65,metalness:.7}));
 bearing.name='Waist bearing';bearing.position.y=.565;pelvis.add(bearing);
 geometry.dispose();return pelvis;
}

export function legCycle(phase:number,side:number,speed:number,turnRate:number){
 const p=((phase+(side>0?.5:0))%1+1)%1;
 const moving=Math.min(1,Math.abs(speed)/.4+Math.abs(turnRate)*6);
 const direction=Math.sign(speed+side*turnRate*2.2)||1;
 // A short double-support window sells the weight. Touchdown still occurs at
 // phase 0 / .5, matching the existing step sounds and simulation cadence.
 const stance=.56,swing=p>=stance,t=swing?(p-stance)/(1-stance):p/stance;
 const reach=WALK.stride*stance/2;
 // Swing starts/ends at the same velocity as the support foot, not at zero.
 const travel=swing?reach+WALK.stride*(1-stance)*t-WALK.stride*smooth(t):-reach+WALK.stride*p;
 const pitch=swing?.18*(1-smooth(t))-.11*smooth(t):-.11*(1-smooth(p/.10))+.18*smooth((p-(stance-.10))/.10);
 return {offset:travel*direction*moving,lift:swing?Math.sin(Math.PI*t)**2*.56*moving:0,
  pitch:pitch*direction*moving,swing,progress:t};
}

// Two-link IK with a bend pole and bounded reach: never stretch a solid link.
export function solveLeg(hip:THREE.Vector3,target:THREE.Vector3,upper:number,lower:number,pole:THREE.Vector3){
 const axis=target.clone().sub(hip),distance=THREE.MathUtils.clamp(axis.length(),Math.abs(upper-lower)+.00001,upper+lower-.00001);
 axis.normalize();const ankle=hip.clone().addScaledVector(axis,distance);
 const bend=pole.clone().addScaledVector(axis,-pole.dot(axis));
 if(bend.lengthSq()<1e-8)bend.set(1,0,0).addScaledVector(axis,-axis.x);
 bend.normalize();const along=(upper*upper-lower*lower+distance*distance)/(2*distance);
 const knee=hip.clone().addScaledVector(axis,along).addScaledVector(bend,Math.sqrt(Math.max(0,upper*upper-along*along)));
 return {knee,ankle};
}

export function prepareMechanicalRig(model:THREE.Object3D):Leg[]{
 model.updateMatrixWorld(true);const legs:Leg[]=[];
 for(const [prefix,side]of [['L',-1],['R',1]] as const){
  const thigh=model.getObjectByName(prefix+'_Thigh'),calf=model.getObjectByName(prefix+'_Calf'),foot=model.getObjectByName(prefix+'_Foot');
  if(!thigh||!calf||!foot)throw new Error('Mechanical leg hierarchy missing: '+prefix);
  const upper=calf.position.clone(),lower=foot.position.clone();
  // Cache only convex support vertices, not thousands of mesh vertices/frame.
  // They keep the actual rigid sole above the terrain during heel/toe rocking.
  const points:THREE.Vector3[]=[];
  const inverseFoot=foot.matrixWorld.clone().invert();
  foot.traverse(o=>{if(o instanceof THREE.Mesh){const a=o.geometry.attributes.position,transform=new THREE.Matrix4().multiplyMatrices(inverseFoot,o.matrixWorld);
   for(let i=0;i<a.count;i++)points.push(new THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(transform));
  }});
  const hull=new ConvexHull().setFromPoints(points),supports=new Set<THREE.Vector3>();
  for(const face of hull.faces){let edge=face.edge;do{supports.add(edge.head().point);edge=edge.next;}while(edge!==face.edge);}
  legs.push({side,thigh,calf,foot,upper,lower,sole:[...supports].map(p=>p.clone().multiplyScalar(MECH.modelScale)),restFoot:model.worldToLocal(foot.getWorldPosition(new THREE.Vector3())),upperLength:upper.length()*MECH.modelScale,lowerLength:lower.length()*MECH.modelScale});
 }
 return legs;
}

function aimJoint(joint:THREE.Object3D,rest:THREE.Vector3,target:THREE.Vector3){
 const origin=joint.getWorldPosition(new THREE.Vector3());
 const inverse=joint.parent!.getWorldQuaternion(new THREE.Quaternion()).invert();
 const direction=target.clone().sub(origin).normalize().applyQuaternion(inverse);
 joint.quaternion.setFromUnitVectors(rest.clone().normalize(),direction);
 joint.updateMatrixWorld(true);
}

// Exposed separately for non-browser tests against the actual imported asset.
export function animateMechanicalRig(model:THREE.Object3D,legs:Leg[],walk:WalkPose,joints?:JointPose){
 const pelvis=model.getObjectByName('PelvisFrame');
 if(pelvis){pelvis.rotation.y=-(joints?.torso??0);pelvis.updateMatrixWorld(true);}
 const pole=new THREE.Vector3(-Math.sin(walk.yaw),0,-Math.cos(walk.yaw));
 for(const leg of legs){
  const cycle=legCycle(walk.phase,leg.side,walk.speed,walk.turnRate);
  // Source faces +Z; simulation faces -Z.
  const localX=-leg.restFoot.x*MECH.modelScale,localZ=-leg.restFoot.z*MECH.modelScale+cycle.offset;
  const x=walk.x+Math.cos(walk.yaw)*localX+Math.sin(walk.yaw)*localZ;
  const z=walk.z-Math.sin(walk.yaw)*localX+Math.cos(walk.yaw)*localZ;
  const dz=Math.cos(walk.yaw)*.5,dx=Math.sin(walk.yaw)*.5;
  const pitch=-Math.atan2(groundHeight(x-dx,z-dz)-groundHeight(x+dx,z+dz),1);
  const roll=Math.atan2(groundHeight(x-dz,z+dx)-groundHeight(x+dz,z-dx),1);
  const orientation=new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch+cycle.pitch,walk.yaw+Math.PI,roll,'YXZ'));
  let contact=-Infinity;const sample=new THREE.Vector3();
  for(const point of leg.sole){sample.copy(point).applyQuaternion(orientation);
   contact=Math.max(contact,MECH.floor+groundHeight(x+sample.x,z+sample.z)-sample.y);
  }
  const target=new THREE.Vector3(x,contact+.004+cycle.lift,z);
  const hip=leg.thigh.getWorldPosition(new THREE.Vector3());
  const {knee,ankle}=solveLeg(hip,target,leg.upperLength,leg.lowerLength,pole);
  aimJoint(leg.thigh,leg.upper,knee);aimJoint(leg.calf,leg.lower,ankle);
  leg.foot.quaternion.copy(leg.foot.parent!.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(orientation);
  leg.foot.updateMatrixWorld(true);
 }
 const amount=gaitAmount(walk),phase=walk.phase*Math.PI*2;
 const direction=clamp(walk.speed/.4,-1,1);
 for(const [prefix,sign]of [['L',1],['R',-1]] as const){
  const shoulder=model.getObjectByName(prefix+'_Upperarm'),elbow=model.getObjectByName(prefix+'_Forearm');
  // Delayed counter-swing, inward shoulder carriage, and a flexing elbow keep
  // the weapon arms heavy. Rotation stays at actual imported joint pivots.
  const swing=Math.cos(phase-.22)*sign;
  const lift=joints?.[prefix==='L'?'leftShoulder':'rightShoulder']??0;
  const bend=joints?.[prefix==='L'?'leftElbow':'rightElbow']??0;
  const carried=amount*(1-smooth((lift+bend)/.25));
  if(shoulder){shoulder.rotation.set(-lift+(-.04+.12*swing*direction)*carried,
   (-.025*Math.cos(phase)*direction+walk.turnRate*.12)*carried,-sign*.105*amount,'YXZ');shoulder.updateMatrixWorld(true);}
  if(elbow){elbow.rotation.set(-bend-(.11+.095*(1-swing*direction))*carried,0,sign*.008*Math.sin(phase)*carried);elbow.updateMatrixWorld(true);}
 }
}

export class MechExterior{
 root=new THREE.Group();model:THREE.Group|null=null;legs:Leg[]=[];ready:Promise<void>;
 shadow:THREE.Mesh;inspectionKey:THREE.DirectionalLight;inspectionFill:THREE.DirectionalLight;
 private disposed=false;
 constructor(host:CockpitScene,manager?:THREE.LoadingManager){
  this.root.name='IRON VAULT / supplied mechanical exterior';
  this.root.position.set(0,(MECH.floor-MECH.cabinLift)/MECH.cabinScale,WALK.originZ);
  this.root.scale.setScalar(MECH.modelScale/MECH.cabinScale);this.root.rotation.y=Math.PI;
  this.root.visible=false;
  this.ready=new GLTFLoader(manager).loadAsync(MECH_ASSET).then(gltf=>{
   if(this.disposed||host.disposed){this.release(gltf.scene);return;}
   this.model=gltf.scene;this.model.name='Tripo military mech / mechanical rig';
   prepareTorsoRig(this.model);this.legs=prepareMechanicalRig(this.model);this.root.add(this.model);
   this.model.traverse(o=>{if(o instanceof THREE.Mesh){
    o.castShadow=false;o.receiveShadow=true;
    const materials=Array.isArray(o.material)?o.material:[o.material];
    for(const material of materials)if(material instanceof THREE.MeshStandardMaterial){
     material.envMapIntensity=.65;material.roughness=.85;material.needsUpdate=true;
     for(const texture of [material.map,material.normalMap,material.roughnessMap,material.metalnessMap])if(texture)texture.anisotropy=Math.min(4,host.renderer.capabilities.getMaxAnisotropy());
    }
   }});
  });
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
  const c=canvas.getContext('2d')!,gradient=c.createRadialGradient(64,64,5,64,64,64);
  gradient.addColorStop(0,'rgba(0,0,0,.46)');gradient.addColorStop(.6,'rgba(0,0,0,.21)');gradient.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=gradient;c.fillRect(0,0,128,128);
  const texture=new THREE.CanvasTexture(canvas);host.textures.push(texture);
  const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});host.materials.push(material);
  this.shadow=host.plane(host.scene,0,MECH.floor+.025,WALK.originZ,8.5,6.2,material);this.shadow.rotation.x=-Math.PI/2;
  this.inspectionKey=new THREE.DirectionalLight(0xe3eadf,0);this.inspectionFill=new THREE.DirectionalLight(0x8aa5b1,0);
  host.scene.add(this.inspectionKey,this.inspectionKey.target,this.inspectionFill,this.inspectionFill.target);
  host.cleanup.push(()=>{this.disposed=true;if(this.model)this.release(this.model);});
 }
 private release(root:THREE.Object3D){
  const textures=new Set<THREE.Texture>(),materials=new Set<THREE.Material>();
  root.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});
  for(const m of materials){for(const value of Object.values(m))if(value instanceof THREE.Texture)textures.add(value);m.dispose();}
  for(const texture of textures){texture.dispose();const source=texture.source.data;if(typeof ImageBitmap!=='undefined'&&source instanceof ImageBitmap)source.close();}
 }
 update(_cabin:THREE.Group,_s:MachineState,walk:WalkPose,inspection:boolean,outside=inspection,joints:JointPose=neutralJoints()){
  // The supplied hull is opaque. Only the original interactive cabin is drawn
  // for the pilot; camera captures hide their common parent to avoid recursion.
  this.root.visible=outside;
  if(this.model&&outside){this.root.updateMatrixWorld(true);animateMechanicalRig(this.model,this.legs,walk,joints);}
  this.shadow.position.set(walk.x,MECH.floor+groundHeight(walk.x,walk.z)+.026,walk.z);this.shadow.rotation.z=-walk.yaw;
  this.inspectionKey.intensity=inspection?2.4:0;this.inspectionFill.intensity=inspection?.85:0;
  this.inspectionKey.position.set(walk.x-7,walk.height+9,walk.z-9);this.inspectionFill.position.set(walk.x+8,walk.height+5,walk.z+4);
  for(const light of [this.inspectionKey,this.inspectionFill])light.target.position.set(walk.x,walk.height+2.8,walk.z);
 }
}
