import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MachineState } from './machine';

export function cabinLighting(s: MachineState) {
  const battery = s.overhead.battery1 || s.overhead.battery2;
  const work = s.stage > 0 && s.light;
  return {
    work,
    intensity: work ? 4.8 : battery ? 0.28 : 0,
    emission: work ? 2.4 : battery ? 0.28 : 0,
  };
}

// A local green reflection follows the instrument power and dimmer.
export function instrumentSpill(s: MachineState) {
  return s.stage > 0
    ? 3 * s.displayBrightness
    : s.overhead.battery1 || s.overhead.battery2
      ? 0.38
      : 0;
}

export function ceilingLighting(s: MachineState) {
  const powered = s.stage > 0 || s.overhead.battery1 || s.overhead.battery2;
  const level = powered ? Math.max(0, Math.min(1, s.ceilingBrightness)) : 0;
  // Useful room illumination, not merely a bright lens; the dimmer owns the level.
  return { intensity: 90 * Math.pow(level, 1.4), emission: level > 0 ? 1 + 4 * level : 0 };
}

export function braceLighting(s: MachineState) {
  const powered = s.stage > 0 || s.overhead.battery1 || s.overhead.battery2;
  // Alte, nachgedunkelte Röhren: schwächer als neu.
  return { intensity: powered ? 4.8 : 0, emission: powered ? 1.25 : 0 };
}

// Construction-time batching only. Moving controls and their children retain
// their original hierarchy; transparent labels retain their depth sorting.
export function batchStaticCockpit(
  scene: THREE.Object3D,
  moving: ReadonlySet<THREE.Object3D>,
  retainColliders = false,
) {
  scene.updateMatrixWorld(true);
  const picking: THREE.Mesh[] = [],
    groups = new Map<string, THREE.Mesh[]>(),
    geometries: THREE.BufferGeometry[] = [];
  const center = new THREE.Vector3();
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    picking.push(object);
    if (!(object.material instanceof THREE.Material) || object.material.transparent) return;
    for (let ancestor: THREE.Object3D | null = object; ancestor; ancestor = ancestor.parent) {
      if (moving.has(ancestor) || ancestor.userData.label) return;
    }
    center.setFromMatrixPosition(object.matrixWorld);
    // Keep batches local so looking away still culls unrelated parts of the cabin.
    const geometry: THREE.BufferGeometry = object.geometry;
    const attributes = Object.keys(geometry.attributes)
      .sort()
      .map((key) => {
        const a = geometry.getAttribute(key);
        return key + ':' + a.itemSize + ':' + a.normalized;
      })
      .join(',');
    const key = [
      object.material.uuid,
      object.castShadow,
      object.receiveShadow,
      Math.floor(center.x / 4),
      Math.floor(center.y / 3),
      Math.floor(center.z / 4),
      attributes,
    ].join('|');
    const group = groups.get(key) ?? [];
    group.push(object);
    groups.set(key, group);
  });
  const colliders = retainColliders ? new THREE.Group() : null;
  if (colliders) {
    colliders.name = 'Cockpit click colliders';
    colliders.visible = false;
  }
  let combined = 0;
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue;
    const parts = meshes.map((mesh) => {
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      return geometry.applyMatrix4(mesh.matrixWorld);
    });
    const geometry = mergeGeometries(parts, false);
    parts.forEach((part) => part.dispose());
    if (!geometry) continue;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const batch = new THREE.Mesh(geometry, meshes[0].material);
    batch.name = 'Static cockpit batch';
    batch.castShadow = meshes[0].castShadow;
    batch.receiveShadow = meshes[0].receiveShadow;
    scene.add(batch);
    geometries.push(geometry);
    combined += meshes.length - 1;
    // Keep the original, world-positioned meshes as pick colliders. This preserves
    // occlusion and precise switch selection without raycasting the large batches.
    meshes.forEach((mesh) => {
      if (colliders) colliders.attach(mesh);
      else mesh.removeFromParent();
    });
  }
  if (colliders) scene.add(colliders);
  scene.traverse((object) => {
    if (!moving.has(object)) {
      object.updateMatrix();
      object.matrixAutoUpdate = false;
    }
  });
  scene.updateMatrixWorld(true);
  return { picking, geometries, combined };
}

// At most one canvas redraw/upload per rendered frame; oldest visible display
// first. An offscreen monitor catches up as soon as it returns to view.
export function nextDisplay<T extends { lastDraw: number }>(
  screens: readonly T[],
  now: number,
  isVisible: (screen: T) => boolean,
): T | undefined {
  let next: T | undefined;
  for (const screen of screens) {
    if (
      now - screen.lastDraw >= 125 &&
      (!next || screen.lastDraw < next.lastDraw) &&
      isVisible(screen)
    )
      next = screen;
  }
  return next;
}

export function setCockpitInterior(
  cabin: THREE.Object3D,
  interior: THREE.Object3D,
  visible: boolean,
) {
  if (visible) {
    if (interior.parent !== cabin) cabin.add(interior);
  } else if (interior.parent) interior.removeFromParent();
}

export function cockpitPixelRatio(width: number, height: number, deviceRatio: number) {
  // A HiDPI laptop must not silently render almost three times its screen area.
  return Math.min(deviceRatio, 1.5, Math.sqrt(2_500_000 / Math.max(1, width * height)));
}
