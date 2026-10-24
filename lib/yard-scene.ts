import * as THREE from 'three';
import type {CockpitScene} from './cockpit-scene';

// Metres, sharing the existing hangar floor (-2.6) and gate plane (-34.45).
export const YARD={floor:-2.6,gateZ:-34.45,gateTravel:7.2,roadWidth:16,roadEnd:-225,camera:[13,5,-43] as const};
export function buildYard(host:CockpitScene){
 const root=new THREE.Group();root.name='Exterior test yard';host.scene.add(root);
 const concrete=host.pbr('yard-concrete',0xc5c4be,.96,.48,.27);
 const asphalt=host.pbr('yard-asphalt',0xb7bac0,.98,.5,.22);
 const container=host.pbr('yard-container',0xadc0a4,.86,.55,.32);
 const steel=host.mat({color:0x3d5159,metalness:.7,roughness:.46});
 const pale=host.mat({color:0xa2b3b1,metalness:.5,roughness:.54});
 const yellow=host.mat({color:0xc5a151,roughness:.78});
 const white=host.mat({color:0xc7c9b9,roughness:.85});
 const earth=host.mat({color:0x4b514c,roughness:1,map:concrete.map,normalMap:concrete.normalMap,normalScale:new THREE.Vector2(.55,.55)});
 const lamp=host.mat({color:0xffe6b3,emissive:0xffc876,emissiveIntensity:3,toneMapped:false});
 const cyan=host.mat({color:0x70adbc,emissive:0x4c909c,emissiveIntensity:.8});
 const materials=[concrete,asphalt,container,steel,pale,yellow,white,earth];
 const block=(x:number,y:number,z:number,w:number,h:number,d:number,m:THREE.Material=concrete)=>host.box(root,x,y,z,w,h,d,m,0);
 const mark=(x:number,z:number,w:number,d:number,m:THREE.Material=yellow)=>{const mesh=block(x,YARD.floor+.026,z,w,.018,d,m);mesh.castShadow=false;return mesh;};
 // Flat yard connects to the hall without a step; perimeter slopes rise outside it.
 block(0,-2.81,-104,110,.4,138);block(0,-2.8,-140,16,.4,210,asphalt);
 block(0,-2.81,-36.3,34,.4,4);
 const terrain=new THREE.PlaneGeometry(460,430,46,43);terrain.rotateX(-Math.PI/2);
 const points=terrain.getAttribute('position'),uv=terrain.getAttribute('uv');
 for(let i=0;i<points.count;i++){
  const x=points.getX(i),z=points.getZ(i)-125;
  uv.setXY(i,x,z);
  const edge=Math.max(0,Math.abs(x)-65,-z-247)/110;
  points.setXYZ(i,x,YARD.floor-.27+Math.min(1,edge)*Math.max(0,17+12*Math.sin(x*.029+z*.019)+8*Math.cos(z*.044-x*.012)),z);
 }
 terrain.computeVertexNormals();host.geometries.set('yard-terrain',terrain);const ground=new THREE.Mesh(terrain,earth);ground.receiveShadow=true;root.add(ground);
 for(const x of [-8.15,8.15])mark(x,-137,.16,200);
 for(let z=-47;z>-222;z-=12)mark(0,z,.15,4,white);
 for(let z=-48;z>-160;z-=17)for(const side of [-1,1]){
  mark(side*18,z,15,.11,white);mark(side*25.5,z+3,.11,6,white);
 }
 // Ground service zones, stop line and legible scale references.
 mark(0,-46,15,.42);for(const x of [-5,-3,-1,1,3,5])mark(x,-43.5,.7,2.8,white);
 for(const [text,z]of [['LANE 01',-58],['BRAKE TEST',-152],['END / 190 M',-218]] as const){
  const label=host.label(root,text,0,YARD.floor+.035,z,10,1.3,'#cfbd83');label.rotation.x=-Math.PI/2;
 }
 function barrier(x:number,z:number,angle=0){
  const g=new THREE.Group();g.position.set(x,YARD.floor,z);g.rotation.y=angle;root.add(g);
  host.box(g,0,.42,0,3.1,.84,.62,concrete,.04);host.box(g,0,.9,0,2.95,.17,.34,yellow,.02);
  for(const xx of [-1.1,0,1.1])host.box(g,xx,.88,.181,.32,.18,.014,steel,0);
 }
 for(const z of [-65,-87,-109,-131,-153]){barrier(-9.7,z,Math.PI/2);barrier(9.7,z,Math.PI/2);}
 for(const x of [-6,-2,2,6])barrier(x,-228);
 // Reinforced containers with actual door frames, locking rods and corner posts.
 function shippingContainer(x:number,z:number,level=0,rotation=0){
  const g=new THREE.Group();g.position.set(x,YARD.floor+level*2.66,z);g.rotation.y=rotation;root.add(g);
  host.box(g,0,1.3,0,6.06,2.6,2.44,container,.025);
  for(const sx of [-1,1])for(const sz of [-1,1])host.box(g,sx*2.98,1.3,sz*1.2,.12,2.65,.12,steel,0);
  for(const yy of [.07,2.55])host.box(g,0,yy,1.24,6.06,.12,.09,steel,0);
  for(const xx of [-2.1,-.85,.85,2.1]){
   host.box(g,xx,1.3,1.265,.055,2.38,.055,pale,0);
   host.box(g,xx+.13,1.05,1.31,.3,.045,.045,pale,0);
  }
  host.box(g,0,1.3,1.248,.065,2.48,.035,steel,0);
  host.label(g,'IV / FIELD SERVICE',-.95,1.9,1.28,2.8,.22,'#d4d5b5');host.label(g,'CAUTION',1.9,.45,1.28,1.2,.18,'#dcc27b');
 }
 shippingContainer(-22,-67);shippingContainer(-22,-67,1);shippingContainer(-29,-82);shippingContainer(24,-75,0,-.3);shippingContainer(25,-116);shippingContainer(25,-116,1);
 // Plant building and grounded utility pipes frame the testing lane.
 block(39,1.4,-104,21,8,21);block(39,5.48,-104,21.6,.2,21.6,steel);
 for(const x of [31,35,39,43,47]){block(x,1.4,-93.45,2.5,5.5,.13,container);block(x,4.68,-93.32,2.25,.11,.1,cyan);}
 host.label(root,'ACTUATOR LAB / 02',39,5,-93.29,17,.5,'#cbd6bd');
 for(const x of [32,37,42]){block(x,6.16,-102,3,1.2,3,steel);for(let i=0;i<7;i++)block(x,6.79,-103+i*.3,2.7,.045,.08,pale);}
 for(const x of [-34,-36]){
  const pipe=host.cylinder(root,x,-.3,-110,.42,40,steel,12);pipe.rotation.x=Math.PI/2;
  for(const z of [-94,-104,-114,-124]){block(x,-1.38,z,.7,2.4,.4);host.cylinder(root,x,-.3,z,.5,.14,pale,12);}
 }
 // A ramp with solid triangular sidewalls. Its low edge faces the hangar.
 const ramp=new THREE.Group();ramp.position.set(0,YARD.floor,-111);root.add(ramp);
 const rise=1.8,run=12,angle=Math.atan2(rise,run);
 const deck=host.box(ramp,0,rise/2-.11*Math.cos(angle),0,11,.22,Math.hypot(run,rise),concrete,0);deck.rotation.x=angle;
 const wedge=new THREE.BufferGeometry();wedge.setAttribute('position',new THREE.Float32BufferAttribute([-5.5,0,6,-5.5,0,-6,-5.5,rise,-6,5.5,0,6,5.5,0,-6,5.5,rise,-6],3));wedge.setIndex([0,2,1,3,4,5,0,3,5,0,5,2,1,2,5,1,5,4]);wedge.computeVertexNormals();wedge.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,0,1,1,1,0,0,0,1,1,1],2));host.geometries.set('yard-ramp',wedge);const support=new THREE.Mesh(wedge,concrete);support.castShadow=true;support.receiveShadow=true;ramp.add(support);
 for(const x of [-5.35,5.35]){const stripe=host.box(ramp,x,rise/2+.025,0,.18,.015,Math.hypot(run,rise),yellow,0);stripe.rotation.x=angle;}
 block(0,YARD.floor+rise/2,-121,11,rise,8);const descent=ramp.clone(true);descent.position.z=-131;descent.rotation.y=Math.PI;root.add(descent);for(const x of [-5.25,5.25])mark(x,-131,.2,8);
 // Alternate rough-surface lane beside the ramp.
 for(let i=0;i<9;i++)block(-17,YARD.floor+.06+(i%3)*.03,-105-i*1.65,9,.16+(i%3)*.06,.5,concrete);
 // Fence posts are linked by rails; perimeter remains clear of the exit.
 for(const side of [-1,1])for(let z=-42;z>=-178;z-=8){
  block(side*53,-1.05,z,.09,3.1,.09,steel);
  if(z>-178)for(const y of [-2.1,-.5,.45])block(side*53,y,z-4,.045,.045,8,steel);
 }
 for(const side of [-1,1])for(const z of [-59,-139]){
  const x=side*19;block(x,-2.24,z,1.15,.72,1.15);block(x,2.9,z,.19,10.4,.19,steel);
  block(x,8.12,z,3.4,.15,.22,steel);
  for(const xx of [-1.1,0,1.1]){block(x+xx,8.05,z-.1,.7,.25,.45,steel);block(x+xx,7.9,z-.1,.6,.035,.35,lamp);}
  if(side<0){
   const light=new THREE.SpotLight(0xffce96,z===-59?1900:1500,65,.92,.7,2);
   light.name='Yard floodlight '+z;light.position.set(x,7.88,z);light.target.position.set(0,YARD.floor,z-18);root.add(light,light.target);
   if(z===-59){light.castShadow=true;light.shadow.mapSize.set(1024,1024);light.shadow.bias=-.0002;light.shadow.normalBias=.08;light.shadow.autoUpdate=false;light.shadow.needsUpdate=true;host.cleanup.push(()=>light.shadow.dispose());}
  }
 }
 // Distance poles provide useful size cues from the pilot's seat.
 for(const [z,label]of [[-85,'50 M'],[-135,'100 M'],[-185,'150 M']] as const){
  block(11,-.5,z,.09,4.2,.09,steel);block(11,1.4,z,2,.9,.08,steel);host.label(root,label,11,1.4,z+.06,1.75,.6,'#d0d2b1');
 }
 host.label(root,'IRON VAULT / PROVING GROUND',0,3.5,-233.89,28,1.4,'#b9c5b8');
 for(const x of [-15,15])block(x,.5,-234,.3,6.2,.3,steel);block(0,3.6,-234,31,2,.18,steel);
 return {root,materials};
}
