// Hangarhalle: Boden, Wände, Kran, Tor und Hallenbeleuchtung.
// Ausgelagert aus cockpit-scene.ts; `cs` ist die CockpitScene-Instanz.
import * as THREE from 'three';
import type { CockpitScene } from '../cockpit-scene';

export function buildHangar(cs: CockpitScene) {
  const hall = new THREE.Group();
  hall.name = 'Hangar 07';
  cs.scene.add(hall);
  const concrete = cs.mat({ color: 0x363f43, roughness: 0.95, metalness: 0.06 });
  const rib = cs.mat({ color: 0x647379, roughness: 0.72, metalness: 0.4 });
  const gate = cs.mat({ color: 0x526067, roughness: 0.82, metalness: 0.28 });
  const yellow = cs.mat({ color: 0xbc9850, roughness: 0.82, metalness: 0.1 });
  const lamp = cs.mat({
    color: 0xd9e7e8,
    emissive: 0xc8dce0,
    emissiveIntensity: 2.2,
    roughness: 0.5,
    toneMapped: false,
  });
  // Shared low-poly extrusions keep the larger hall inexpensive to batch.
  const block = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    m: THREE.Material = rib,
  ) => cs.box(hall, x, y, z, w, h, d, m, 0);
  const beam = (a: number[], b: number[], width: number, material: THREE.Material = rib) => {
    const start = new THREE.Vector3(...(a as [number, number, number])),
      end = new THREE.Vector3(...(b as [number, number, number]));
    const direction = end.clone().sub(start),
      center = start.add(end).multiplyScalar(0.5);
    const mesh = block(
      center.x,
      center.y,
      center.z,
      width,
      direction.length() + 0.04,
      width,
      material,
    );
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return mesh;
  };
  // Closed 36 x 46 hall: every column lands on the slab, the roof sits on the portals.
  block(0, -2.8, -12, 36, 0.4, 46, concrete);
  block(0, 10.6, -12, 36, 0.4, 46, concrete);
  for (const side of [-1, 1]) block(side * 12.45, 3.9, -34.8, 11.1, 13, 0.4, concrete);
  block(0, 9.5, -34.8, 13.8, 2, 0.4, concrete);
  block(0, 3.9, 10.8, 36, 13, 0.4, concrete);
  for (const s of [-1, 1]) block(s * 17.8, 3.9, -12, 0.4, 13, 46, concrete);
  for (const z of [-30, -20, -10, 0, 9.6]) {
    for (const s of [-1, 1]) {
      block(s * 12, 3.9, z, 0.34, 13, 0.65);
      for (const dz of [-0.35, 0.35]) block(s * 12, 3.9, z + dz, 0.8, 13, 0.09);
      block(s * 12, -2.5, z, 1.35, 0.2, 1.25);
      beam([s * 12, 7.3, z], [s * 9, 9.9, z], 0.22);
      block(s * 15, 9.9, z, 6, 0.45, 0.45);
    }
    block(0, 9.9, z, 24.8, 0.6, 0.22);
    for (const y of [9.6, 10.2]) block(0, y, z, 24.8, 0.1, 0.85);
  }
  for (const x of [-12, -6, 0, 6, 12]) block(x, 10.35, -12, 0.18, 0.12, 45);
  for (const s of [-1, 1]) {
    block(s * 12, 6.8, -12, 0.25, 0.45, 45);
    for (const [a, b] of [
      [-30, -20],
      [-20, -10],
    ])
      beam([s * 12, -2.4, a], [s * 12, 6.8, b], 0.14);
  }
  // Recessed segmented blast door and its own frame, beyond the service gantries.
  const gateSurface = cs.pbr('yard-container', 0x88999b, 0.9, 0.25, 0.32);
  cs.yardMaterials.push(gateSurface);
  for (const side of [-1, 1]) {
    const leaf = new THREE.Group();
    leaf.name = side < 0 ? 'Port sliding gate' : 'Starboard sliding gate';
    leaf.position.set(side * 3.45, 0, -34.45);
    hall.add(leaf);
    cs.gateLeaves.push(leaf);
    for (let i = 0; i < 16; i++)
      cs.box(leaf, 0, -2.25 + i * 0.66, 0, 6.9, 0.635, 0.24, gateSurface, 0);
    for (const x of [-3.38, 3.38]) cs.box(leaf, x, 2.95, 0.15, 0.12, 10.65, 0.09, rib, 0);
    cs.label(leaf, side < 0 ? '07' : 'EXIT', 0, 4.5, 0.17, 3.9, 1.4, '#d1d9cd');
    cs.label(
      leaf,
      side < 0 ? 'SERVICE HANGAR' : 'PROVING GROUND',
      0,
      2.8,
      0.17,
      5.5,
      0.35,
      '#bec9c5',
    );
  }
  for (const x of [-7.3, 7.3]) {
    block(x, 3, -33.95, 0.7, 11.2, 0.5);
    for (let i = 0; i < 11; i++)
      block(x, -2.2 + i * 0.9, -33.68, 0.71, 0.4, 0.035, i % 2 ? cs.darkMat : yellow);
  }
  block(0, 8.3, -33.95, 15.3, 0.7, 0.5);
  cs.label(hall, 'HANGAR 07 / TEST RANGE', 0, 8.3, -33.65, 12, 0.37, '#d3c797');
  // Two supported maintenance decks; stair stringers and guardrails share their joints.
  for (const s of [-1, 1]) {
    block(s * 7, 0.08, -22, 4.2, 0.3, 16, yellow);
    block(s * 7, 0.26, -22, 4, 0.08, 16, cs.darkMat);
    for (const z of [-29.7, -24.5, -19.3, -14.3])
      for (const x of [5.1, 8.9]) {
        block(s * x, -1.2, z, 0.22, 2.8, 0.22);
        block(s * x, -2.53, z, 0.55, 0.14, 0.55);
        block(s * x, 0.9, z, 0.065, 1.2, 0.065, yellow);
      }
    for (const x of [5.1, 8.9])
      for (const y of [0.85, 1.5]) block(s * x, y, -22, 0.075, 0.075, 15.5, yellow);
    block(s * 7, 1.5, -29.7, 3.85, 0.075, 0.075, yellow);
    for (let i = 0; i < 12; i++)
      block(s * 7, -2.48 + i * 0.23, -9.7 - i * 0.37, 2, 0.15, 0.4, gate);
    for (const x of [6, 8]) {
      beam([s * x, -2.6, -9.45], [s * x, 0.15, -14.15], 0.12);
      beam([s * x, -1.4, -9.45], [s * x, 1.5, -14.15], 0.075, yellow);
      for (const [y, z] of [
        [-2.48, -9.7],
        [-1.1, -11.92],
        [0.2, -14.14],
      ])
        block(s * x, y + 0.6, z, 0.07, 1.4, 0.07, yellow);
    }
    cs.label(
      hall,
      s < 0 ? '01 / POWER SERVICE' : '02 / ACTUATOR SERVICE',
      s * 7,
      -0.1,
      -13.82,
      3.7,
      0.24,
      '#201f1a',
    );
    // Utilities behind the decks, clear of the pilot's forward aperture.
    block(s * 10, -0.95, -24, 1.6, 3.3, 2.1, gate);
    block(s * 10, 0.05, -22.92, 1.25, 1.05, 0.045, cs.darkMat);
    cs.label(hall, s < 0 ? 'AUX POWER' : 'COOLANT', s * 10, 0.05, -22.88, 1.1, 0.2);
    for (let i = 0; i < 6; i++)
      block(s * 10, -1.6 + i * 0.14, -22.92, 1.25, 0.045, 0.04, cs.darkMat);
    beam([s * 10, 0.6, -25], [s * 10, 0.6, -30], 0.18);
    beam([s * 10, 0.6, -30], [s * 10, -2.5, -30], 0.18);
    for (const z of [-28, -24, -20, -16]) block(s * 4.6, -2.586, z, 0.13, 0.025, 2.4, yellow);
  }
  // Connected rear catwalk and an overhead bridge crane on longitudinal rails.
  // Side landings keep the entire gate lane clear at ground level.
  for (const side of [-1, 1]) {
    block(side * 8.8, 0.08, -31.3, 3.6, 0.3, 3.4, gate);
    for (const x of [7.1, 10.5]) {
      block(side * x, -1.2, -31.3, 0.22, 2.8, 0.22);
      block(side * x, 0.9, -32.9, 0.07, 1.2, 0.07, yellow);
    }
    for (const y of [0.85, 1.5]) block(side * 8.8, y, -32.9, 3.4, 0.075, 0.075, yellow);
  }
  for (const s of [-1, 1]) {
    block(s * 11.5, 7.25, -22, 0.5, 0.45, 24, yellow);
    for (const z of [-30, -20, -10]) block(s * 11.7, 6.92, z, 0.7, 0.3, 0.8);
  }
  block(0, 7.85, -27, 23.5, 0.8, 0.7, yellow);
  block(0, 7.85, -28.2, 23.5, 0.8, 0.7, yellow);
  for (const s of [-1, 1]) block(s * 11.5, 7.5, -27.6, 0.8, 0.3, 2.5, cs.darkMat);
  // Park the hoist beside the travel lane, clear of the full-height capsule.
  block(9.4, 7.35, -27.6, 1.9, 0.45, 1.8, cs.darkMat);
  for (const x of [9, 9.8]) block(x, 5.9, -27.6, 0.045, 2.6, 0.045, cs.steelMat);
  block(9.4, 4.65, -27.6, 1.1, 0.4, 0.55, yellow);
  beam([9.4, 4.45, -27.6], [9.4, 4, -27.6], 0.09);
  beam([9.4, 4, -27.6], [9.75, 4, -27.6], 0.09);
  cs.label(hall, 'IV / 40 T', -2.5, 7.85, -26.63, 3, 0.42, '#25251e');
  // Visible ceiling fixtures, independently powered by the hall. Their cones end
  // in the service area: no replacement light is placed inside or aimed at the cockpit.
  for (const s of [-1, 1])
    for (const z of [-30, -20, -10]) {
      for (const x of [s * 4.6, s * 6.6]) block(x, 8.85, z, 0.065, 2.1, 0.065);
      block(s * 5.6, 7.72, z, 2.6, 0.25, 0.65, cs.darkMat);
      block(s * 5.6, 7.57, z, 2.4, 0.05, 0.5, lamp);
      if (z === -20) {
        const light = new THREE.SpotLight(0xc8dce0, 125, 22, 1.0, 0.65, 1.35);
        light.name = s < 0 ? 'Port hall floodlight' : 'Starboard hall floodlight';
        light.position.set(s * 5.6, 7.5, z);
        light.target.position.set(s * 4, -0.5, -29);
        hall.add(light, light.target);
      }
    }
  // Dim gate markers read at a distance without another lighting pass.
  for (const x of [-7.8, 7.8]) block(x, 3.1, -33.66, 0.08, 8.8, 0.04, lamp);
}
