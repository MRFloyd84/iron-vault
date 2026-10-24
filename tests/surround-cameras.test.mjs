import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {SurroundCameras,SURROUND_VIEWS,camerasPowered,nextCamera,cameraTile} from '../lib/surround-cameras.ts';
import {initialState} from '../lib/machine.ts';
const live=()=>{const s=initialState();return {...s,stage:2,overhead:{...s.overhead,avionics:true},service:{...s.service,groundConnected:true}};};
function fixture(){
 const labels=[];const canvas={width:0,height:0,getContext:()=>context};const context={canvas,save(){},restore(){},setTransform(){},clearRect(){},fillRect(){},strokeRect(){},fillText(s){labels.push(s);}};
 globalThis.document={createElement:()=>canvas};
 const world=new THREE.Scene(),cabin=new THREE.Group();world.add(cabin);cabin.position.set(12,2,-30);cabin.rotation.y=Math.PI/2;cabin.updateMatrixWorld(true);
 const renderer={target:null,autoClear:false,toneMappingExposure:.94,shadowMap:{autoUpdate:true},viewport:new THREE.Vector4(1,2,300,400),scissor:new THREE.Vector4(4,3,200,100),scissorTest:true,captures:[],
  getRenderTarget(){return this.target;},setRenderTarget(t){this.target=t;},getViewport(v){return v.copy(this.viewport);},setViewport(v){this.viewport.copy(v);},getScissor(v){return v.copy(this.scissor);},setScissor(v){this.scissor.copy(v);},getScissorTest(){return this.scissorTest;},setScissorTest(v){this.scissorTest=v;},
  render(scene,camera){if(scene===world){assert.equal(cabin.visible,false);this.captures.push(camera);assert.equal(this.shadowMap.autoUpdate,false);}if(this.fail)throw Error('capture failed');}};
 const monitor=new SurroundCameras(renderer,world,cabin);return {monitor,renderer,cabin,labels};
}
test('six cameras cover front and rear with left/right tied to mech sides',()=>{
 assert.equal(SURROUND_VIEWS.length,6);
 const {monitor,cabin}=fixture();monitor.update(0,live(),true);
 for(let i=0;i<6;i++){
  const v=SURROUND_VIEWS[i],direction=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(-.24,v.yaw,0,'YXZ'));
  assert.ok(direction.y<0);assert.ok(i<3?direction.z<0:direction.z>0);
  if(i%3===0)assert.ok(direction.x<0);if(i%3===2)assert.ok(direction.x>0);
 }
 const cam=monitor.cameras[0],expected=new THREE.Matrix4().multiplyMatrices(cabin.matrixWorld,cam.matrix);
 assert.ok(cam.matrixWorld.elements.every((v,i)=>Math.abs(v-expected.elements[i])<1e-12));
 cabin.scale.setScalar(.46);cabin.updateMatrixWorld(true);monitor.select(0);monitor.update(100,live(),true);
 const scaledMount=new THREE.Matrix4().multiplyMatrices(cabin.matrixWorld,cam.matrix);
 assert.ok(new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld).distanceTo(new THREE.Vector3().setFromMatrixPosition(scaledMount))<1e-12);
 assert.ok(new THREE.Vector3().setFromMatrixScale(cam.matrixWorld).distanceTo(new THREE.Vector3(1,1,1))<1e-12);
 assert.ok(cam.aspect>1);monitor.dispose();
});
test('round-robin capture updates all six without six world renders in one frame',()=>{
 const {monitor,renderer}=fixture();for(let i=0;i<6;i++){const count=renderer.captures.length;monitor.update(i*17,live(),true);assert.equal(renderer.captures.length,count+1);}
 assert.equal(new Set(renderer.captures).size,6);assert.equal(monitor.tiles.filter(t=>t.visible).length,6);
 const before=renderer.captures.length;monitor.update(86,live(),true);assert.equal(renderer.captures.length,before);
 monitor.update(10000,live(),false);assert.equal(renderer.captures.length,before);monitor.dispose();
});
test('single view has higher resolution, systems mode pauses capture, return restores grid',()=>{
 const {monitor,renderer}=fixture();monitor.select(4);monitor.update(0,live(),true);
 assert.equal(renderer.captures[0],monitor.cameras[4]);assert.equal(monitor.targets[4].width,960);assert.equal(monitor.tiles.filter(t=>t.visible).length,1);
 monitor.select(7);monitor.update(100,live(),true);assert.equal(renderer.captures.length,1);
 monitor.select(6);monitor.update(200,live(),true);assert.equal(monitor.systems,false);assert.equal(monitor.selected,-1);assert.equal(monitor.targets[4].width,480);monitor.dispose();
});
test('loss of camera supply hides every image rather than leaving a live-looking frozen frame',()=>{
 const {monitor,renderer,labels}=fixture();monitor.update(0,live(),true);assert.equal(monitor.tiles[0].visible,true);
 monitor.update(100,initialState(),true);assert.ok(monitor.tiles.every(t=>!t.visible));assert.ok(labels.includes('KAMERAS AUS'));assert.equal(renderer.captures.length,1);
 const s=live();assert.equal(camerasPowered({...s,overhead:{...s.overhead,avionics:false}}),false);
 monitor.update(200,live(),true);assert.equal(renderer.captures.length,2);monitor.dispose();
});
test('offscreen passes restore cabin visibility, render target, exposure and viewport even on failure',()=>{
 const {monitor,renderer,cabin}=fixture();const original=new THREE.WebGLRenderTarget(10,10);renderer.target=original;renderer.fail=true;
 assert.throws(()=>monitor.update(0,live(),true),/capture failed/);
 assert.equal(cabin.visible,true);assert.equal(renderer.target,original);assert.equal(renderer.autoClear,false);assert.equal(renderer.toneMappingExposure,.94);assert.equal(renderer.shadowMap.autoUpdate,true);assert.equal(renderer.scissorTest,true);
 assert.deepEqual(renderer.viewport.toArray(),[1,2,300,400]);monitor.dispose();original.dispose();
});
test('overview tiles fit on the monitor without overlap and selected scheduling is bounded',()=>{
 for(let i=0;i<6;i++){const a=cameraTile(i);assert.ok(a.x>=0&&a.y>=85&&a.x+a.w<=960&&a.y+a.h<660);for(let j=i+1;j<6;j++){const b=cameraTile(j);assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y);}}
 assert.equal(nextCamera([0,0,0,0,0,0],39,3),-1);assert.equal(nextCamera([0,0,0,0,0,0],40,3),3);
});

test('display power reset invalidates every old camera frame before the next boot',()=>{
 const {monitor}=fixture();for(let i=0;i<6;i++)monitor.update(i*17,live(),true);
 assert.equal(monitor.tiles.filter(t=>t.visible).length,6);monitor.reset();
 assert.equal(monitor.powered,false);assert.ok(monitor.tiles.every(t=>!t.visible));assert.ok(monitor.last.every(t=>!Number.isFinite(t)));
 monitor.update(200,live(),true);assert.equal(monitor.tiles.filter(t=>t.visible).length,1);monitor.dispose();
});
