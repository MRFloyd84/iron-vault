import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js';
import type { CockpitScene } from './cockpit-scene';
import type { MachineState } from './machine';
import { groundHeight, WALK } from './walking';
import { neutralJoints, type JointPose } from './articulation';
import { applyWear, bakeRestPositions, buildWaistRing, MechLights } from './mech-details';
import { Hydraulics, type HydraulicShapes } from './mech-hydraulics';
import { DroneDock } from './drone-model';
import { assetUrl } from './asset-url';

// Authored cabin coordinates stay intact, uniformly scaled into the torso.
export const MECH = {
  cabinLift: 4.6,
  cabinScale: 0.46,
  modelScale: 9.5,
  floor: -2.6,
  orbitRadius: 15,
  orbitMin: 8,
  orbitMax: 27,
  orbitTargetY: 2.1,
} as const;
/**
 * IV-04 aus Renes Tripo-Teilen (scripts/assemble-mech.mjs): Rumpf mit Drehkranz und
 * Schulterringen, Antriebsblock als Becken, dreizehige Füße; Beine und Arme vorerst noch
 * aus dem ersten Modell (assets-src/mech-parts/iron-vault-rigged.glb). Knotennamen und Gelenkpunkte sind gleich.
 */
export const MECH_ASSET = assetUrl('models/iv-04-mech.glb');
/** Formen der Hydraulikzylinder (scripts/prepare-hydraulic.mjs) */
export const HYDRAULIC_ASSET = assetUrl('models/iv-04-hydraulic.glb');
/** Hüfthöhe im Modell (Modelleinheiten): Trennung Ober-/Unterkörper, Drehpunkt fürs Neigen. */
export const WAIST_Y = 0.565;
/** Hüfte in Kanzel-Koordinaten (Kanzel ist um cabinScale verkleinert). */
const WAIST_CABIN_Y =
  (MECH.floor - MECH.cabinLift) / MECH.cabinScale + (WAIST_Y * MECH.modelScale) / MECH.cabinScale;
type WalkPose = CockpitScene['walkPose'];
type Leg = {
  side: number;
  thigh: THREE.Object3D;
  calf: THREE.Object3D;
  foot: THREE.Object3D;
  upper: THREE.Vector3;
  lower: THREE.Vector3;
  restFoot: THREE.Vector3;
  upperLength: number;
  lowerLength: number;
  sole: THREE.Vector3[];
};
const clamp = THREE.MathUtils.clamp;
const smooth = (t: number) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
const gaitAmount = (walk: WalkPose) =>
  Math.min(1, Math.abs(walk.speed) / 0.4 + Math.abs(walk.turnRate) * 6);

export function bodyCompression(walk: WalkPose, motion = 1) {
  // Two compressions per stride, deepest at weight acceptance. No idle bob.
  return (
    (0.3 + 0.07 * (0.5 + 0.5 * Math.cos(walk.phase * Math.PI * 4)) * motion) * gaitAmount(walk) +
    0.15 * Math.min(1, (Math.abs(walk.pitch) + Math.abs(walk.roll)) / 0.1)
  );
}

export function applyMechBodyPose(
  cabin: THREE.Object3D,
  walk: WalkPose,
  motion = 1,
  updateChildren = true,
  torsoYaw = 0,
  torsoPitch = 0,
) {
  const amount = gaitAmount(walk) * motion,
    phase = walk.phase * Math.PI * 2;
  const sway = -Math.sin(phase) * 0.1 * amount;
  const yaw = walk.yaw + Math.cos(phase) * 0.02 * amount * clamp(walk.speed / 0.4, -1, 1);
  cabin.position.set(
    walk.x + Math.cos(walk.yaw) * sway - Math.sin(yaw) * WALK.originZ * MECH.cabinScale,
    walk.height + MECH.cabinLift - bodyCompression(walk, motion),
    walk.z - Math.sin(walk.yaw) * sway - Math.cos(yaw) * WALK.originZ * MECH.cabinScale,
  );
  cabin.rotation.set(
    walk.pitch * 0.55 - 0.018 * clamp(walk.speed / WALK.maxSpeed, -1, 1) * motion,
    yaw,
    walk.roll * 0.45 +
      Math.sin(phase) * 0.01 * amount -
      clamp(walk.turnRate, -0.28, 0.28) * 0.035 * motion,
    'YXZ',
  );
  // Turn around the waist axis, not around the pilot camera. Apply after the
  // base tilt so counter-rotation restores the entire pelvis pose on slopes too.
  if (torsoYaw) {
    cabin.position.add(
      new THREE.Vector3(
        -Math.sin(torsoYaw) * WALK.originZ,
        0,
        (1 - Math.cos(torsoYaw)) * WALK.originZ,
      )
        .multiplyScalar(MECH.cabinScale)
        .applyQuaternion(cabin.quaternion),
    );
    cabin.rotateY(torsoYaw);
  }
  // Oberkörper neigen: um die Hüfte (nicht um die Kanzel), nach oben positiv.
  if (torsoPitch) {
    const y = WAIST_CABIN_Y,
      z = WALK.originZ,
      c = Math.cos(torsoPitch),
      sn = Math.sin(torsoPitch);
    cabin.position.add(
      new THREE.Vector3(0, y - (y * c - z * sn), z - (y * sn + z * c))
        .multiplyScalar(MECH.cabinScale)
        .applyQuaternion(cabin.quaternion),
    );
    cabin.rotateX(torsoPitch);
  }
  if (updateChildren) cabin.updateMatrixWorld(true);
  else cabin.updateWorldMatrix(true, false);
}

// Split only index buffers once on load. Shared vertex/PBR data stays intact;
// the neutral silhouette retains every original triangle exactly once.
export function prepareTorsoRig(model: THREE.Object3D) {
  const existing = model.getObjectByName('PelvisFrame');
  if (existing) return existing;
  const torso = model.getObjectByName('Torso');
  if (!(torso instanceof THREE.Mesh)) throw new Error('Torso mesh missing');
  // Baukasten-Mech: Becken ist ein eigenes Teil, der Drehkranz gehört zum Rumpf.
  const supplied = model.getObjectByName('Pelvis');
  if (supplied) {
    const pelvis = new THREE.Group();
    pelvis.name = 'PelvisFrame';
    model.add(pelvis);
    pelvis.attach(supplied);
    for (const name of ['L_Thigh', 'R_Thigh']) {
      const leg = model.getObjectByName(name);
      if (!leg) throw new Error('Hip missing');
      pelvis.attach(leg);
    }
    return pelvis;
  }
  const geometry: THREE.BufferGeometry = torso.geometry,
    positions = geometry.attributes.position,
    index = geometry.index;
  if (!index) throw new Error('Indexed torso geometry required');
  const upper: number[] = [],
    lower: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i),
      b = index.getX(i + 1),
      c = index.getX(i + 2);
    ((positions.getY(a) + positions.getY(b) + positions.getY(c)) / 3 < 0.565 ? lower : upper).push(
      a,
      b,
      c,
    );
  }
  if (!lower.length || !upper.length) throw new Error('Waist partition empty');
  const section = (indices: number[]) => {
    const g = new THREE.BufferGeometry();
    for (const [key, value] of Object.entries(geometry.attributes)) g.setAttribute(key, value);
    g.setIndex(indices);
    g.computeBoundingSphere();
    return g;
  };
  torso.geometry = section(upper);
  const pelvis = new THREE.Group();
  pelvis.name = 'PelvisFrame';
  model.add(pelvis);
  const mesh = new THREE.Mesh(section(lower), torso.material);
  mesh.name = 'Pelvis';
  mesh.position.copy(torso.position);
  pelvis.add(mesh);
  for (const name of ['L_Thigh', 'R_Thigh']) {
    const leg = model.getObjectByName(name);
    if (!leg) throw new Error('Hip missing');
    pelvis.attach(leg);
  }
  // Mechanischer Drehkranz mit Zahnkranz, Schrauben und Schwenkantrieben.
  pelvis.add(buildWaistRing());
  geometry.dispose();
  return pelvis;
}

export function legCycle(phase: number, side: number, speed: number, turnRate: number) {
  const p = (((phase + (side > 0 ? 0.5 : 0)) % 1) + 1) % 1;
  const moving = Math.min(1, Math.abs(speed) / 0.4 + Math.abs(turnRate) * 6);
  const direction = Math.sign(speed + side * turnRate * 2.2) || 1;
  // A short double-support window sells the weight. Touchdown still occurs at
  // phase 0 / .5, matching the existing step sounds and simulation cadence.
  const stance = 0.56,
    swing = p >= stance,
    t = swing ? (p - stance) / (1 - stance) : p / stance;
  const reach = (WALK.stride * stance) / 2;
  // Swing starts/ends at the same velocity as the support foot, not at zero.
  const travel = swing
    ? reach + WALK.stride * (1 - stance) * t - WALK.stride * smooth(t)
    : -reach + WALK.stride * p;
  const pitch = swing
    ? 0.18 * (1 - smooth(t)) - 0.11 * smooth(t)
    : -0.11 * (1 - smooth(p / 0.1)) + 0.18 * smooth((p - (stance - 0.1)) / 0.1);
  return {
    offset: travel * direction * moving,
    lift: swing ? Math.sin(Math.PI * t) ** 2 * 0.56 * moving : 0,
    pitch: pitch * direction * moving,
    swing,
    progress: t,
  };
}

type FootTarget = { x: number; z: number; yaw: number };
type Plant = FootTarget & { locked: boolean; from: FootTarget; start: number };
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Foot-Locking: Ein Fuß, der den Boden trägt, bleibt an seiner Weltposition stehen,
 * auch wenn der Mech dabei dreht, bremst oder beschleunigt. In der Schwungphase
 * fliegt er von der Abhebestelle zum Aufsetzpunkt des Gangmusters.
 */
export class FootPlanting {
  /** Weiter als das darf ein stehender Fuß nicht vom Gangmuster abweichen (m). */
  static slip = 0.9;
  /** Größte Verdrehung des stehenden Fußes gegenüber dem Rumpf (rad). */
  static twist = 0.35;
  private feet = new Map<number, Plant>();
  private last: { x: number; z: number; phase: number } | null = null;
  reset() {
    this.feet.clear();
    this.last = null;
  }
  /** Einmal je Bild: Sprünge (Zurücksetzen, lange Pause der Außenansicht) lösen alle Füße. */
  begin(walk: WalkPose) {
    const l = this.last;
    if (!l || Math.hypot(walk.x - l.x, walk.z - l.z) > 1 || Math.abs(walk.phase - l.phase) > 0.25)
      this.feet.clear();
    this.last = { x: walk.x, z: walk.z, phase: walk.phase };
  }
  resolve(
    side: number,
    gait: FootTarget,
    cycle: { swing: boolean; progress: number },
    moving: number,
  ): FootTarget {
    const planted = !cycle.swing || moving < 0.05;
    let f = this.feet.get(side);
    if (!f) {
      f = { ...gait, locked: planted, from: { ...gait }, start: 0 };
      this.feet.set(side, f);
      return { ...gait };
    }
    if (planted) {
      f.locked = true;
      // Nur wenn das Gangmuster zu weit wegläuft, rutscht der Fuß nach.
      const dx = f.x - gait.x,
        dz = f.z - gait.z,
        d = Math.hypot(dx, dz);
      if (d > FootPlanting.slip) {
        f.x = gait.x + (dx * FootPlanting.slip) / d;
        f.z = gait.z + (dz * FootPlanting.slip) / d;
      }
      f.yaw = gait.yaw + clamp(wrap(f.yaw - gait.yaw), -FootPlanting.twist, FootPlanting.twist);
    } else {
      if (f.locked) {
        f.locked = false;
        f.from = { x: f.x, z: f.z, yaw: f.yaw };
        // Mitten im Schwung gelöst (Anfahren aus dem Stand): Rest des Schwungs nutzen.
        f.start = Math.min(cycle.progress, 0.95);
      }
      const k = smooth((cycle.progress - f.start) / (1 - f.start));
      f.x = f.from.x + (gait.x - f.from.x) * k;
      f.z = f.from.z + (gait.z - f.from.z) * k;
      f.yaw = f.from.yaw + wrap(gait.yaw - f.from.yaw) * k;
    }
    return { x: f.x, z: f.z, yaw: f.yaw };
  }
}

// Two-link IK with a bend pole and bounded reach: never stretch a solid link.
export function solveLeg(
  hip: THREE.Vector3,
  target: THREE.Vector3,
  upper: number,
  lower: number,
  pole: THREE.Vector3,
) {
  const axis = target.clone().sub(hip),
    distance = THREE.MathUtils.clamp(
      axis.length(),
      Math.abs(upper - lower) + 0.00001,
      upper + lower - 0.00001,
    );
  axis.normalize();
  const ankle = hip.clone().addScaledVector(axis, distance);
  const bend = pole.clone().addScaledVector(axis, -pole.dot(axis));
  if (bend.lengthSq() < 1e-8) bend.set(1, 0, 0).addScaledVector(axis, -axis.x);
  bend.normalize();
  const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
  const knee = hip
    .clone()
    .addScaledVector(axis, along)
    .addScaledVector(bend, Math.sqrt(Math.max(0, upper * upper - along * along)));
  return { knee, ankle };
}

export function prepareMechanicalRig(model: THREE.Object3D): Leg[] {
  model.updateMatrixWorld(true);
  const legs: Leg[] = [];
  for (const [prefix, side] of [
    ['L', -1],
    ['R', 1],
  ] as const) {
    const thigh = model.getObjectByName(prefix + '_Thigh'),
      calf = model.getObjectByName(prefix + '_Calf'),
      foot = model.getObjectByName(prefix + '_Foot');
    if (!thigh || !calf || !foot) throw new Error('Mechanical leg hierarchy missing: ' + prefix);
    const upper = calf.position.clone(),
      lower = foot.position.clone();
    // Cache only convex support vertices, not thousands of mesh vertices/frame.
    // They keep the actual rigid sole above the terrain during heel/toe rocking.
    const points: THREE.Vector3[] = [];
    const inverseFoot = foot.matrixWorld.clone().invert();
    foot.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const a = o.geometry.attributes.position,
          transform = new THREE.Matrix4().multiplyMatrices(inverseFoot, o.matrixWorld);
        for (let i = 0; i < a.count; i++)
          points.push(new THREE.Vector3().fromBufferAttribute(a, i).applyMatrix4(transform));
      }
    });
    const hull = new ConvexHull().setFromPoints(points),
      supports = new Set<THREE.Vector3>();
    for (const face of hull.faces) {
      let edge = face.edge;
      do {
        supports.add(edge.head().point);
        edge = edge.next;
      } while (edge !== face.edge);
    }
    legs.push({
      side,
      thigh,
      calf,
      foot,
      upper,
      lower,
      sole: [...supports].map((p) => p.clone().multiplyScalar(MECH.modelScale)),
      restFoot: model.worldToLocal(foot.getWorldPosition(new THREE.Vector3())),
      upperLength: upper.length() * MECH.modelScale,
      lowerLength: lower.length() * MECH.modelScale,
    });
  }
  return legs;
}

function aimJoint(joint: THREE.Object3D, rest: THREE.Vector3, target: THREE.Vector3) {
  const origin = joint.getWorldPosition(new THREE.Vector3());
  const inverse = joint.parent!.getWorldQuaternion(new THREE.Quaternion()).invert();
  const direction = target.clone().sub(origin).normalize().applyQuaternion(inverse);
  joint.quaternion.setFromUnitVectors(rest.clone().normalize(), direction);
  joint.updateMatrixWorld(true);
}

/**
 * Becken hebt Drehen und Neigen des Oberkörpers wieder auf: Beine bleiben stehen.
 * Im Modell zeigt +x zur anderen Seite (Modell um 180° gedreht) – daher +pitch.
 */
export function pelvisCounterPose(pelvis: THREE.Object3D, torso: number, pitch: number) {
  pelvis.rotation.set(pitch, -torso, 0, 'XYZ');
  pelvis.position.set(0, WAIST_Y - WAIST_Y * Math.cos(pitch), -WAIST_Y * Math.sin(pitch));
}

// Exposed separately for non-browser tests against the actual imported asset.
export function animateMechanicalRig(
  model: THREE.Object3D,
  legs: Leg[],
  walk: WalkPose,
  joints?: JointPose,
  planting?: FootPlanting,
) {
  planting?.begin(walk);
  const moving = gaitAmount(walk);
  const pelvis = model.getObjectByName('PelvisFrame');
  if (pelvis) {
    pelvisCounterPose(pelvis, joints?.torso ?? 0, joints?.pitch ?? 0);
    pelvis.updateMatrixWorld(true);
  }
  const pole = new THREE.Vector3(-Math.sin(walk.yaw), 0, -Math.cos(walk.yaw));
  for (const leg of legs) {
    const cycle = legCycle(walk.phase, leg.side, walk.speed, walk.turnRate);
    // Source faces +Z; simulation faces -Z.
    const localX = -leg.restFoot.x * MECH.modelScale,
      localZ = -leg.restFoot.z * MECH.modelScale + cycle.offset;
    const gait = {
      x: walk.x + Math.cos(walk.yaw) * localX + Math.sin(walk.yaw) * localZ,
      z: walk.z - Math.sin(walk.yaw) * localX + Math.cos(walk.yaw) * localZ,
      yaw: walk.yaw,
    };
    const { x, z, yaw } = planting ? planting.resolve(leg.side, gait, cycle, moving) : gait;
    const dz = Math.cos(yaw) * 0.5,
      dx = Math.sin(yaw) * 0.5;
    const pitch = -Math.atan2(groundHeight(x - dx, z - dz) - groundHeight(x + dx, z + dz), 1);
    const roll = Math.atan2(groundHeight(x - dz, z + dx) - groundHeight(x + dz, z - dx), 1);
    const orientation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(pitch + cycle.pitch, yaw + Math.PI, roll, 'YXZ'),
    );
    let contact = -Infinity;
    const sample = new THREE.Vector3();
    for (const point of leg.sole) {
      sample.copy(point).applyQuaternion(orientation);
      contact = Math.max(contact, MECH.floor + groundHeight(x + sample.x, z + sample.z) - sample.y);
    }
    const target = new THREE.Vector3(x, contact + 0.004 + cycle.lift, z);
    const hip = leg.thigh.getWorldPosition(new THREE.Vector3());
    const { knee, ankle } = solveLeg(hip, target, leg.upperLength, leg.lowerLength, pole);
    aimJoint(leg.thigh, leg.upper, knee);
    aimJoint(leg.calf, leg.lower, ankle);
    leg.foot.quaternion
      .copy(leg.foot.parent!.getWorldQuaternion(new THREE.Quaternion()).invert())
      .multiply(orientation);
    leg.foot.updateMatrixWorld(true);
  }
  const amount = moving,
    phase = walk.phase * Math.PI * 2;
  const direction = clamp(walk.speed / 0.4, -1, 1);
  for (const [prefix, sign] of [
    ['L', 1],
    ['R', -1],
  ] as const) {
    const shoulder = model.getObjectByName(prefix + '_Upperarm'),
      elbow = model.getObjectByName(prefix + '_Forearm');
    // Delayed counter-swing, inward shoulder carriage, and a flexing elbow keep
    // the weapon arms heavy. Rotation stays at actual imported joint pivots.
    const swing = Math.cos(phase - 0.22) * sign;
    const lift = joints?.[prefix === 'L' ? 'leftShoulder' : 'rightShoulder'] ?? 0;
    const bend = joints?.[prefix === 'L' ? 'leftElbow' : 'rightElbow'] ?? 0;
    const carried = amount * (1 - smooth((lift + bend) / 0.25));
    if (shoulder) {
      shoulder.rotation.set(
        -lift + (-0.04 + 0.12 * swing * direction) * carried,
        (-0.025 * Math.cos(phase) * direction + walk.turnRate * 0.12) * carried,
        -sign * 0.105 * amount,
        'YXZ',
      );
      shoulder.updateMatrixWorld(true);
    }
    if (elbow) {
      elbow.rotation.set(
        -bend - (0.11 + 0.095 * (1 - swing * direction)) * carried,
        0,
        sign * 0.008 * Math.sin(phase) * carried,
      );
      elbow.updateMatrixWorld(true);
    }
  }
}

export class MechExterior {
  root = new THREE.Group();
  model: THREE.Group | null = null;
  legs: Leg[] = [];
  /** Hält stehende Füße am Boden fest (siehe FootPlanting). */
  planting = new FootPlanting();
  /** Hydraulikzylinder an Knie und Sprunggelenk (siehe mech-hydraulics.ts). */
  hydraulics: Hydraulics | null = null;
  /** Halterung der Aufklärungsdrohne auf dem Rücken (drone-model.ts). */
  droneDock = new DroneDock();
  dockReady = false;
  ready: Promise<void>;
  shadow: THREE.Mesh;
  inspectionKey: THREE.DirectionalLight;
  inspectionFill: THREE.DirectionalLight;
  /** Scheinwerfer und Rundumleuchte; Lichtquellen liegen direkt in der Szene. */
  lights: MechLights;
  /** 0 = Tag, 1 = Nacht; dämpft die Inspektionsbeleuchtung der Außenansicht. */
  night = 0;
  /** Deckkraft des weichen Kontaktschattens (bei echtem Sonnenschatten schwächer). */
  contact = 1;
  /** Nässe der Panzerung 0…1 (trocknet langsam). */
  wetness = 0;
  /** Rückstoß der Armkanonen 0…1 (links, rechts), klingt in der Szene ab. */
  recoil: [number, number] = [0, 0];
  private wearMaterials: THREE.MeshStandardMaterial[] = [];
  private hydraulicShapes: HydraulicShapes | undefined;

  /** Wo der Fuß `side` beim Aufsetzen den Boden berührt (Weltkoordinaten, Sohlenmitte). */
  footprint(walk: WalkPose, side: number) {
    const leg = this.legs.find((l) => l.side === side);
    if (!leg) return null;
    const cycle = legCycle(Math.round(walk.phase * 2) / 2, side, walk.speed, walk.turnRate);
    const localX = -leg.restFoot.x * MECH.modelScale,
      localZ = -leg.restFoot.z * MECH.modelScale + cycle.offset;
    let x = walk.x + Math.cos(walk.yaw) * localX + Math.sin(walk.yaw) * localZ;
    let z = walk.z - Math.sin(walk.yaw) * localX + Math.cos(walk.yaw) * localZ;
    // Sohlenmitte: Mittel der Stützpunkte, mit der Fußausrichtung gedreht.
    let cx = 0,
      cz = 0;
    for (const p of leg.sole) {
      cx += p.x;
      cz += p.z;
    }
    cx /= leg.sole.length;
    cz /= leg.sole.length;
    const a = walk.yaw + Math.PI;
    x += Math.cos(a) * cx + Math.sin(a) * cz;
    z += -Math.sin(a) * cx + Math.cos(a) * cz;
    return { x, y: MECH.floor + groundHeight(x, z), z, yaw: walk.yaw };
  }
  private disposed = false;
  constructor(host: CockpitScene, manager?: THREE.LoadingManager) {
    this.root.name = 'IRON VAULT / supplied mechanical exterior';
    this.root.position.set(0, (MECH.floor - MECH.cabinLift) / MECH.cabinScale, WALK.originZ);
    this.root.scale.setScalar(MECH.modelScale / MECH.cabinScale);
    this.root.rotation.y = Math.PI;
    this.root.visible = false;
    // Mech-Geometrie ist mit EXT_meshopt_compression gepackt (assemble-mech.mjs)
    const loader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
    // Zylinderformen sind optional: fehlt die Datei, baut der Code einfache Zylinder.
    const shapes = loader
      .loadAsync(HYDRAULIC_ASSET)
      .then((g): HydraulicShapes | undefined => {
        const barrel = g.scene.getObjectByName('Barrel'),
          rod = g.scene.getObjectByName('Rod');
        return barrel instanceof THREE.Mesh && rod instanceof THREE.Mesh
          ? { barrel: barrel.geometry, rod: rod.geometry }
          : undefined;
      })
      .catch(() => undefined);
    this.ready = Promise.all([loader.loadAsync(MECH_ASSET), shapes]).then(([gltf, hydraulic]) => {
      if (this.disposed || host.disposed) {
        this.release(gltf.scene);
        return;
      }
      this.hydraulicShapes = hydraulic;
      this.model = gltf.scene;
      this.model.name = 'Tripo military mech / mechanical rig';
      prepareTorsoRig(this.model);
      this.legs = prepareMechanicalRig(this.model);
      bakeRestPositions(this.model);
      // Nach bakeRestPositions: Die Zylinder bekommen keinen Verschleiß-Shader.
      this.hydraulics = new Hydraulics(this.model, this.hydraulicShapes);
      this.lights.attach(this.model.getObjectByName('Torso')!);
      this.droneDock.attach(this.model.getObjectByName('Torso') as THREE.Mesh);
      this.dockReady = true;
      this.root.add(this.model);
      this.model.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          // Echte Schatten (Sonne/Mond); Lichtkegel werfen keinen Schatten.
          o.castShadow = !(o.material instanceof THREE.ShaderMaterial);
          o.receiveShadow = true;
          const materials = Array.isArray(o.material) ? o.material : [o.material];
          for (const material of materials)
            if (material instanceof THREE.MeshStandardMaterial && !material.userData.wear) {
              // Alt statt verchromt: weniger Spiegelung, Verschleiß-Shader (mech-details.ts).
              if (
                !o.geometry.getAttribute('aRest') ||
                o.parent?.name === 'Waist bearing' ||
                o.parent?.parent?.name === 'IV headlight'
              )
                continue;
              // Beidseitig: Das Modell ist in starre Teile zerlegt. Drehen Schulter, Ellbogen
              // oder Knie, öffnen sich an den Nähten kleine Spalte; einseitig sähe man dort
              // durch die Panzerung hindurch (helle, zackige Risse beim Gehen).
              material.side = THREE.DoubleSide;
              material.envMapIntensity = 0.4;
              material.roughness = 1;
              material.metalness = 0.8;
              applyWear(material);
              this.wearMaterials.push(material);
              for (const texture of [
                material.map,
                material.normalMap,
                material.roughnessMap,
                material.metalnessMap,
              ])
                if (texture)
                  texture.anisotropy = Math.min(4, host.renderer.capabilities.getMaxAnisotropy());
            }
        }
      });
    });
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const c = canvas.getContext('2d')!,
      gradient = c.createRadialGradient(64, 64, 5, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(0,0,0,.46)');
    gradient.addColorStop(0.6, 'rgba(0,0,0,.21)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gradient;
    c.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    host.textures.push(texture);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    host.materials.push(material);
    this.shadow = host.plane(host.scene, 0, MECH.floor + 0.025, WALK.originZ, 8.5, 6.2, material);
    this.shadow.rotation.x = -Math.PI / 2;
    this.lights = new MechLights(host.scene);
    host.cleanup.push(() => this.lights.dispose());
    this.inspectionKey = new THREE.DirectionalLight(0xe3eadf, 0);
    this.inspectionFill = new THREE.DirectionalLight(0x8aa5b1, 0);
    host.scene.add(
      this.inspectionKey,
      this.inspectionKey.target,
      this.inspectionFill,
      this.inspectionFill.target,
    );
    host.cleanup.push(() => {
      this.disposed = true;
      this.droneDock.dispose();
      if (this.model) this.release(this.model);
    });
  }
  private release(root: THREE.Object3D) {
    const textures = new Set<THREE.Texture>(),
      materials = new Set<THREE.Material>();
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
      }
    });
    for (const m of materials) {
      for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value);
      m.dispose();
    }
    for (const texture of textures) {
      texture.dispose();
      const source = texture.source.data;
      if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) source.close();
    }
  }
  update(
    _cabin: THREE.Group,
    _s: MachineState,
    walk: WalkPose,
    inspection: boolean,
    outside = inspection,
    joints: JointPose = neutralJoints(),
    /** Auch unsichtbar animieren (die Drohnenkamera zeigt den Mech von außen). */
    animateHidden = false,
  ) {
    // The supplied hull is opaque. Only the original interactive cabin is drawn
    // for the pilot; camera captures hide their common parent to avoid recursion.
    this.root.visible = outside;
    if (this.model && (outside || animateHidden)) {
      this.root.updateMatrixWorld(true);
      animateMechanicalRig(this.model, this.legs, walk, joints, this.planting);
      // Rückstoß: Unterarm schlägt kurz nach oben/hinten aus.
      for (const [name, k] of [
        ['L_Forearm', 0],
        ['R_Forearm', 1],
      ] as const) {
        if (this.recoil[k] < 0.01) continue;
        const arm = this.model.getObjectByName(name);
        if (!arm) continue;
        arm.rotation.x -= 0.07 * this.recoil[k];
        arm.updateMatrixWorld(true);
      }
      this.hydraulics?.update();
    }
    this.shadow.position.set(walk.x, MECH.floor + groundHeight(walk.x, walk.z) + 0.026, walk.z);
    this.shadow.rotation.z = -walk.yaw;
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = this.contact;
    for (const m of this.wearMaterials) m.userData.wet.value = this.wetness;
    // Nachts nur schwaches, bläuliches Mondlicht statt Inspektionsleuchten.
    const day = 1 - this.night;
    this.inspectionKey.intensity = inspection ? 2.4 * (0.12 + 0.88 * day) : 0;
    this.inspectionFill.intensity = inspection ? 0.85 * (0.1 + 0.9 * day) : 0;
    this.inspectionKey.color.setHex(0xe3eadf).lerp(new THREE.Color(0x8fa6d6), this.night);
    this.inspectionKey.position.set(walk.x - 7, walk.height + 9, walk.z - 9);
    this.inspectionFill.position.set(walk.x + 8, walk.height + 5, walk.z + 4);
    for (const light of [this.inspectionKey, this.inspectionFill])
      light.target.position.set(walk.x, walk.height + 2.8, walk.z);
  }
}
