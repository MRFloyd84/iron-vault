// CPU-only repeatable rig check; this does not measure browser/GPU FPS.
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {
  MECH,
  prepareMechanicalRig,
  prepareTorsoRig,
  animateMechanicalRig,
  applyMechBodyPose,
} from '../lib/mech-exterior.ts';
import { neutralJoints } from '../lib/articulation.ts';
import { WALK } from '../lib/walking.ts';
const b = fs.readFileSync(new URL('../public/models/iv-04-mech.glb', import.meta.url));
const n = b.readUInt32LE(12),
  g = JSON.parse(b.subarray(20, 20 + n));
for (const mesh of g.meshes) for (const p of mesh.primitives) delete p.material;
delete g.materials;
delete g.images;
delete g.textures;
g.buffers[0].uri = 'data:application/octet-stream;base64,' + b.subarray(28 + n).toString('base64');
globalThis.ProgressEvent ??= class {};
const { scene: model } = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(JSON.stringify(g), '');
prepareTorsoRig(model);
const joints = { ...neutralJoints(), torso: 0.7, leftShoulder: 0.5, leftElbow: 0.7 };
const legs = prepareMechanicalRig(model),
  cabin = new THREE.Group(),
  root = new THREE.Group();
cabin.scale.setScalar(MECH.cabinScale);
root.position.set(0, (MECH.floor - MECH.cabinLift) / MECH.cabinScale, WALK.originZ);
root.scale.setScalar(MECH.modelScale / MECH.cabinScale);
root.rotation.y = Math.PI;
cabin.add(root);
root.add(model);
const walk = {
  x: 0,
  z: -70,
  yaw: 0.5,
  height: 0,
  pitch: 0,
  roll: 0,
  phase: 0,
  speed: 2.2,
  turnRate: 0,
};
let calls = 0;
const update = THREE.Object3D.prototype.updateWorldMatrix;
THREE.Object3D.prototype.updateWorldMatrix = function (...args) {
  calls++;
  return update.apply(this, args);
};
const run = (i) => {
  walk.phase = i / 600;
  applyMechBodyPose(cabin, walk, 1, true, joints.torso);
  animateMechanicalRig(model, legs, walk, joints);
};
for (let i = 0; i < 1000; i++) run(i);
calls = 0;
const start = performance.now();
for (let i = 0; i < 10000; i++) run(i);
console.log({
  iterations: 10000,
  msPerRigFrame: (performance.now() - start) / 10000,
  worldMatrixCallsPerFrame: calls / 10000,
});
THREE.Object3D.prototype.updateWorldMatrix = update;
