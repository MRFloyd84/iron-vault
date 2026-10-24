// Reproducible offline derivative; never modifies the supplied high-resolution GLB.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {MeshoptSimplifier} from 'three/examples/jsm/libs/meshopt_simplifier.module.js';

const [source,destination]=process.argv.slice(2);
if(!source||!destination)throw new Error('Usage: node scripts/prepare-mech.mjs SOURCE.glb DESTINATION.glb');
const file=fs.readFileSync(source);
if(file.readUInt32LE(0)!==0x46546c67)throw new Error('Not a GLB');
const jsonLength=file.readUInt32LE(12),g=JSON.parse(file.subarray(20,20+jsonLength).toString());
const binary=file.subarray(28+jsonLength);
const types={5121:Uint8Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array};
const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
function read(index){
 const a=g.accessors[index],v=g.bufferViews[a.bufferView],Type=types[a.componentType],width=widths[a.type];
 if(!Type||a.sparse)throw new Error('Unsupported accessor');
 const out=new Type(a.count*width),stride=v.byteStride??width*Type.BYTES_PER_ELEMENT;
 for(let i=0;i<a.count;i++){
  const start=(v.byteOffset??0)+(a.byteOffset??0)+i*stride;
  new Uint8Array(out.buffer,i*width*Type.BYTES_PER_ELEMENT,width*Type.BYTES_PER_ELEMENT).set(binary.subarray(start,start+width*Type.BYTES_PER_ELEMENT));
 }
 return out;
}
const primitive=g.meshes[0].primitives[0],positions=read(primitive.attributes.POSITION),original=read(primitive.indices);
await MeshoptSimplifier.ready;
const uv=read(primitive.attributes.TEXCOORD_0),normal=read(primitive.attributes.NORMAL),attributes=new Float32Array(positions.length/3*5);
for(let i=0;i<positions.length/3;i++)attributes.set([normal[i*3],normal[i*3+1],normal[i*3+2],uv[i*2],uv[i*2+1]],i*5);
const [indices,error]=MeshoptSimplifier.simplifyWithAttributes(original,positions,3,attributes,5,[.05,.05,.05,.15,.15],null,160000*3,.003,['Permissive']);
// Collapse twist bones onto mechanical segments. Each triangle belongs entirely
// to one segment: armor stays rigid instead of stretching across a skinned joint.
const joints=read(primitive.attributes.JOINTS_0),weights=read(primitive.attributes.WEIGHTS_0);
const names=g.skins[0].joints.map(i=>g.nodes[i].name);
const segment=name=>/^[LR]_Thigh/.test(name)?name.slice(0,7):/^[LR]_Calf/.test(name)?name.slice(0,6):/^[LR]_(Foot|Toe)/.test(name)?name.slice(0,2)+'Foot':/^[LR]_Upperarm/.test(name)?name.slice(0,10):/^[LR]_(Forearm|Hand)/.test(name)?name.slice(0,2)+'Forearm':'Torso';
const pivots={Torso:[0,0,0],L_Thigh:[.1502,.5352,-.0184],L_Calf:[.2174,.3041,.0137],L_Foot:[.2447,.085,.0088],R_Thigh:[-.1413,.5374,-.0095],R_Calf:[-.2013,.3041,.0184],R_Foot:[-.2312,.085,.0111],L_Upperarm:[.2563,.7973,-.0021],L_Forearm:[.346,.6037,-.058],R_Upperarm:[-.2563,.7973,-.0021],R_Forearm:[-.3444,.5949,-.0737]};
const parent=name=>name==='Torso'?null:name.endsWith('Calf')?name.slice(0,2)+'Thigh':name.endsWith('Foot')?name.slice(0,2)+'Calf':name.endsWith('Forearm')?name.slice(0,2)+'Upperarm':'Torso';
const groups=Object.fromEntries(Object.keys(pivots).map(k=>[k,[]]));
for(let i=0;i<indices.length;i+=3){
 const votes={};for(let j=0;j<3;j++)for(let k=0;k<4;k++){
  const v=indices[i+j],name=segment(names[joints[v*4+k]]);votes[name]=(votes[name]??0)+weights[v*4+k];
 }
 let name=Object.keys(votes).sort((a,b)=>votes[b]-votes[a])[0];
 // Auto-rig calf weights extended into the sole. Put the whole ankle/sole
 // assembly below the visible ankle seam onto the rigid foot instead.
 const x=(positions[indices[i]*3]+positions[indices[i+1]*3]+positions[indices[i+2]*3])/3;
 const y=(positions[indices[i]*3+1]+positions[indices[i+1]*3+1]+positions[indices[i+2]*3+1])/3;
 // The auto-rig assigned small foot/chest islands to the weapon arms. Those
 // fragments must not swing away with the now-articulated elbows/shoulders.
 if(/^[LR]_(Upperarm|Forearm)$/.test(name)&&y<.35&&Math.abs(x)<.30)name=(x>0?'L_':'R_')+(y<.108?'Foot':'Calf');
 if(y>.62&&Math.abs(x)<.19)name='Torso';
 if(/^[LR]_(Calf|Foot)$/.test(name))name=name.slice(0,2)+(y<.108?'Foot':'Calf');
 groups[name].push(indices[i],indices[i+1],indices[i+2]);
}
const parts=[],views=[],accessors=[];let offset=0;
function view(bytes,target){
 const padding=(4-offset%4)%4;if(padding){parts.push(Buffer.alloc(padding));offset+=padding;}
 const id=views.length;views.push({buffer:0,byteOffset:offset,byteLength:bytes.byteLength,...(target?{target}:{})});parts.push(Buffer.from(bytes));offset+=bytes.byteLength;return id;
}
function accessor(array,template,target){
 const a={...template,bufferView:view(new Uint8Array(array.buffer,array.byteOffset,array.byteLength),target),byteOffset:0,count:array.length/widths[template.type]};
 delete a.sparse;const id=accessors.length;accessors.push(a);return id;
}
const meshes=[],nodes=[],nodeNames=Object.keys(groups);let count=0;
for(const [name,list]of Object.entries(groups)){
 const localIndices=new Uint32Array(list),[remap,size]=MeshoptSimplifier.compactMesh(localIndices),attrs={};count+=size;
 for(const attribute of ['POSITION','NORMAL','TEXCOORD_0']){
  const id=primitive.attributes[attribute],old=read(id),width=widths[g.accessors[id].type],out=new old.constructor(size*width);
  for(let i=0;i<remap.length;i++)if(remap[i]!==0xffffffff){
   for(let k=0;k<width;k++)out[remap[i]*width+k]=old[i*width+k]-(attribute==='POSITION'?pivots[name][k]:0);
  }
  const template={...g.accessors[id]};delete template.min;delete template.max;
  if(attribute==='POSITION'){
   template.min=[Infinity,Infinity,Infinity];template.max=[-Infinity,-Infinity,-Infinity];
   for(let i=0;i<out.length;i++) {const k=i%3;template.min[k]=Math.min(template.min[k],out[i]);template.max[k]=Math.max(template.max[k],out[i]);}
  }
  attrs[attribute]=accessor(out,template,34962);
 }
 const p=parent(name),base=p?pivots[p]:[0,0,0];
 nodes.push({name,translation:pivots[name].map((n,k)=>n-base[k]),mesh:meshes.length,children:nodeNames.flatMap((n,i)=>parent(n)===name?[i]:[])});
 meshes.push({name,primitives:[{attributes:attrs,indices:accessor(localIndices,{type:'SCALAR',componentType:5125},34963),material:primitive.material,mode:4}]});
}
for(const image of g.images){const v=g.bufferViews[image.bufferView];image.bufferView=view(binary.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength));}
g.nodes=nodes;g.meshes=meshes;g.scenes=[{nodes:[0]}];g.scene=0;delete g.skins;delete g.animations;
g.bufferViews=views;g.accessors=accessors;g.buffers=[{byteLength:offset}];
g.extras={...g.extras,ironVault:{sourceSha256:crypto.createHash('sha256').update(file).digest('hex'),sourceTriangles:original.length/3,triangles:indices.length/3,simplificationError:error,rig:'11 rigid sections derived from the uploaded skin; corrected symmetric shoulder pivots'}};
const json=Buffer.from(JSON.stringify(g)),padded=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(padded);
const bin=Buffer.concat(parts),binPadded=Buffer.alloc(Math.ceil(bin.length/4)*4);bin.copy(binPadded);
const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+padded.length+binPadded.length,8);header.writeUInt32LE(padded.length,12);header.writeUInt32LE(0x4e4f534a,16);
const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(binPadded.length,0);binHeader.writeUInt32LE(0x004e4942,4);
fs.mkdirSync(new URL('../public/models/',import.meta.url),{recursive:true});
fs.writeFileSync(destination,Buffer.concat([header,padded,binHeader,binPadded]));
console.log({triangles:indices.length/3,vertices:count,error,bytes:fs.statSync(destination).size});
