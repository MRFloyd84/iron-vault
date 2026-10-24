// Kabinenhülle: Verkleidung, Deckenlampe, Streben und Seitenwände.
// Ausgelagert aus cockpit-scene.ts; `cs` ist die CockpitScene-Instanz.
import * as THREE from 'three';
import { CABIN, FRONT_FRAME, ROOF_FRAME } from '../cockpit-envelope';
import type { CockpitScene } from '../cockpit-scene';

export function buildShell(cs: CockpitScene) {
  const root = cs.scene;
  // Quiet powder-coated interior finish; supplied metal normal map adds fine relief.
  const lining = cs.mat({
    color: 0x344550,
    metalness: 0.28,
    roughness: 0.74,
    normalMap: cs.bodyMat.normalMap,
    normalScale: new THREE.Vector2(0.075, 0.075),
  });
  const sideLining = cs.pbr('shutter', 0xffffff, 0.96, 0.6, 1);
  // Compensate the side group's nonuniform scale: one material tile spans 1.45 units.
  for (const texture of [sideLining.map, sideLining.normalMap, sideLining.roughnessMap])
    texture!.repeat.set(CABIN.sideScaleX / 1.45, CABIN.sideScaleY / 1.45);
  const inset = cs.mat({ color: 0x25333d, metalness: 0.22, roughness: 0.81 });
  const diffuser = cs.mat({
    color: 0x283038,
    emissive: 0xffe4be,
    emissiveIntensity: 0,
    roughness: 0.5,
    metalness: 0,
    toneMapped: false,
  });
  cs.cabinFixtures.push(diffuser);
  cs.braceLens = cs.mat({
    color: 0x12351a,
    emissive: 0x77ed69,
    emissiveIntensity: 0,
    roughness: 0.48,
    metalness: 0,
    toneMapped: false,
  });
  cs.box(root, 0, CABIN.sideBottom - 0.11, 1.5, 5.3, 0.22, 5.36, cs.treadMat, 0.025);
  cs.shellPatch(
    [
      [-0.7, CABIN.roofY, -1.7],
      [0.7, CABIN.roofY, -1.7],
      [CABIN.roofHalfWidth, CABIN.roofY, CABIN.sideFront],
      [CABIN.roofHalfWidth, CABIN.roofY, CABIN.rearZ],
      [-CABIN.roofHalfWidth, CABIN.roofY, CABIN.rearZ],
      [-CABIN.roofHalfWidth, CABIN.roofY, CABIN.sideFront],
    ],
    inset,
    0.12,
  );
  cs.shellPatch(
    [
      [-CABIN.sideX, CABIN.sideBottom, CABIN.rearZ],
      [CABIN.sideX, CABIN.sideBottom, CABIN.rearZ],
      [CABIN.sideX, CABIN.sideTop, CABIN.rearZ],
      [CABIN.roofHalfWidth, CABIN.roofY, CABIN.rearZ],
      [-CABIN.roofHalfWidth, CABIN.roofY, CABIN.rearZ],
      [-CABIN.sideX, CABIN.sideTop, CABIN.rearZ],
    ],
    lining,
    0.1,
  );
  for (const x of [-1.65, 1.65])
    cs.box(root, x, 1.0, CABIN.rearZ - 0.055, 0.1, 4.65, 0.12, cs.edgeMat, 0.025);
  for (const s of [-1, 1]) {
    cs.buildInteriorSide(s, sideLining, inset, diffuser);
    cs.buildBraceLighting(s);
    const reflect = (points: number[][]) => points.map(([x, y, z]) => [s * x, y, z]);
    cs.tube(root, reflect(FRONT_FRAME), 0.15, cs.edgeMat);
    cs.tube(root, reflect(ROOF_FRAME), 0.13, cs.bodyMat);
    cs.buildShellTransitions(s, lining, inset);
    // Continuous frame legs land on bolted shoes, not in empty cabin space.
    for (const z of [1.3, 2]) {
      cs.box(root, s * 2.43, CABIN.sideBottom + 0.032, z, 0.36, 0.065, 0.42, cs.edgeMat, 0.018);
      for (const dz of [-0.14, 0.14]) {
        const bolt = cs.cylinder(
          root,
          s * 2.34,
          CABIN.sideBottom + 0.076,
          z + dz,
          0.026,
          0.02,
          cs.steelMat,
          6,
        );
        bolt.rotation.x = 0;
      }
    }
    // Two wall cleats hold the side leg of the roof hoop against the lining.
    for (const [y, x] of [
      [1.1, 2.48],
      [2.5, 2.45],
    ]) {
      const socket = new THREE.Group();
      socket.position.set(s * x, y, 2);
      socket.rotation.y = (-s * Math.PI) / 2;
      root.add(socket);
      cs.panel(socket, 0, 0, 0, 0.39, 0.33);
      cs.box(socket, 0, 0, 0.074, 0.16, 0.27, 0.1, cs.edgeMat, 0.025);
    }
    const light = new THREE.PointLight(0xffb45c, 0, 3.2, 2);
    light.position.set(s * 2.05, CABIN.sideY + 1.33 * CABIN.sideScaleY, CABIN.sideZ);
    root.add(light);
    cs.panelLights.push(light);
  }
  cs.tube(
    root,
    [
      [-0.7, CABIN.roofY, -1.7],
      [0, CABIN.roofY, -1.7],
      [0.7, CABIN.roofY, -1.7],
    ],
    0.15,
    cs.edgeMat,
  );
  cs.tube(
    root,
    [
      [-2.43, 1.03, -1.04],
      [-1.6, 1.22, -0.55],
      [0, 1.32, -0.4],
      [1.6, 1.22, -0.55],
      [2.43, 1.03, -1.04],
    ],
    0.095,
    cs.edgeMat,
  );
  cs.buildOverhead();
  cs.buildCeilingLamp();
}

export function buildCeilingLamp(cs: CockpitScene) {
  // The backplate intersects the roof underside; the guarded lens faces down.
  const fixture = new THREE.Group();
  fixture.name = 'Red ceiling utility lamp';
  fixture.position.set(0, CABIN.roofY - 0.075, 1.3);
  fixture.rotation.x = Math.PI / 2;
  cs.scene.add(fixture);
  cs.box(fixture, 0, 0, 0, 0.7, 0.48, 0.095, cs.edgeMat, 0.035);
  cs.box(fixture, 0, 0, 0.065, 0.54, 0.34, 0.1, cs.darkMat, 0.065);
  cs.ceilingLens = cs.mat({
    color: 0x580b0c,
    emissive: 0xff1925,
    emissiveIntensity: 0,
    roughness: 0.38,
    metalness: 0,
    toneMapped: false,
  });
  cs.box(fixture, 0, 0, 0.13, 0.43, 0.24, 0.07, cs.ceilingLens, 0.055);
  for (const x of [-0.28, 0.28]) for (const y of [-0.17, 0.17]) cs.bolt(fixture, x, y, 0.055);
  for (const x of [-0.14, 0, 0.14])
    cs.tube(
      fixture,
      [
        [x, -0.16, 0.08],
        [x, -0.12, 0.185],
        [x, 0.12, 0.185],
        [x, 0.16, 0.08],
      ],
      0.013,
      cs.steelMat,
    );
  // A diffused, nearly downward beam softens the nearby overhead hotspot.
  // Gentler distance falloff preserves useful light on the farther console/walls.
  cs.ceilingLight = new THREE.SpotLight(0xff2330, 0, 8, 1.38, 0.9, 1.4);
  cs.ceilingLight.position.set(0, CABIN.roofY - 0.31, 1.3);
  cs.ceilingLight.target.position.set(0, 0.8, 0.65);
  cs.scene.add(cs.ceilingLight, cs.ceilingLight.target);
}

export function buildBraceLighting(cs: CockpitScene, side: number) {
  // Two segments beside each side leg leave the cable raceway and warm bar clear.
  const rail = new THREE.Group();
  rail.name = side < 0 ? 'Port green brace light' : 'Starboard green brace light';
  rail.position.set(side * 2.4, 0, 1.48);
  rail.rotation.y = (-side * Math.PI) / 2;
  cs.scene.add(rail);
  for (const [y, height] of [
    [2.14, 0.44],
    [0.65, 0.54],
  ]) {
    cs.box(rail, 0, y, 0.01, 0.13, height + 0.12, 0.11, cs.edgeMat, 0.025);
    cs.box(rail, 0, y, 0.077, 0.093, height + 0.04, 0.045, cs.darkMat, 0.018);
    cs.box(rail, 0, y, 0.105, 0.052, height, 0.018, cs.braceLens!, 0.009);
    for (const end of [-1, 1]) cs.bolt(rail, 0, y + end * (height / 2 + 0.04), 0.07);
  }
  const light = new THREE.PointLight(0x77ed69, 0, 2.6, 1);
  light.position.set(side * 2.02, 1.8, 1.48);
  cs.scene.add(light);
  cs.braceLights.push(light);
}

export function buildShellTransitions(
  cs: CockpitScene,
  side: number,
  lining: THREE.Material,
  inset: THREE.Material,
) {
  const point = (x: number, y: number, z: number) => [side * x, y, z];
  const low = point(CABIN.sideX, CABIN.sideBottom, CABIN.sideFront),
    waist = point(CABIN.sideX, 0.8, CABIN.sideFront),
    shoulder = point(CABIN.sideX, CABIN.sideTop, CABIN.sideFront);
  const roof = point(CABIN.roofHalfWidth, CABIN.roofY, CABIN.sideFront),
    rearShoulder = point(CABIN.sideX, CABIN.sideTop, CABIN.rearZ),
    rearRoof = point(CABIN.roofHalfWidth, CABIN.roofY, CABIN.rearZ);
  const frameLow = point(2.47, 0.8, -0.8),
    frameMid = point(2.2, 2.1, -2),
    frameHigh = point(1.45, 3.55, -2.1),
    frameTop = point(0.7, CABIN.roofY, -1.7);
  cs.shellPatch([low, point(1.9, CABIN.sideBottom, -0.8), frameLow, waist], lining);
  cs.shellPatch([waist, frameLow, frameMid, shoulder], lining);
  cs.shellPatch([shoulder, frameMid, frameHigh], inset);
  cs.shellPatch([shoulder, frameHigh, frameTop, roof], inset);
  cs.shellPatch([shoulder, roof, rearRoof, rearShoulder], inset);
  // A common perimeter rail covers every lining/roof joint.
  cs.rail([shoulder, rearShoulder], 0.065, cs.edgeMat);
  cs.rail([frameTop, roof, rearRoof], 0.065, cs.edgeMat);
  cs.rail([low, waist, shoulder, roof], 0.065, cs.edgeMat);
  cs.rail(
    [point(CABIN.sideX, CABIN.sideBottom, CABIN.rearZ), rearShoulder, rearRoof],
    0.075,
    cs.edgeMat,
  );
}

export function buildInteriorSide(
  cs: CockpitScene,
  side: number,
  lining: THREE.Material,
  inset: THREE.Material,
  diffuser: THREE.Material,
) {
  const g = new THREE.Group();
  g.name = side < 0 ? 'Port interior lining' : 'Starboard interior lining';
  g.position.set(side * CABIN.sideX, CABIN.sideY, CABIN.sideZ);
  g.rotation.y = (-side * Math.PI) / 2;
  g.scale.set(CABIN.sideScaleX, CABIN.sideScaleY, 1);
  cs.scene.add(g);
  // Continuous backing closes the former roof gap; all local +Z faces point inward.
  cs.box(g, 0, 0, -0.025, 5.9, 5.3, 0.13, inset, 0.025);
  for (const x of [-2.82, -0.93, 0.93, 2.82]) {
    cs.box(g, x, 0, 0.067, 0.082, 5.13, 0.12, cs.darkMat, 0.018);
    cs.box(g, x, 0, 0.135, 0.024, 5.05, 0.018, cs.edgeMat, 0.006);
  }
  for (const y of [-2.48, -0.53, 1.05, 2.49])
    cs.box(g, 0, y, 0.09, 5.72, 0.072, 0.1, cs.edgeMat, 0.018);
  for (const x of [-1.86, 0, 1.86]) {
    for (const [y, h] of [
      [-1.49, 1.78],
      [0.24, 1.43],
      [1.81, 1.26],
    ]) {
      cs.box(g, x, y, 0.055, 1.75, h + 0.055, 0.045, cs.darkMat, 0.048);
      cs.box(g, x, y, 0.086, 1.66, h, 0.048, lining, 0.047);
      for (const sx of [-1, 1])
        for (const sy of [-1, 1]) cs.bolt(g, x + sx * 0.739, y + sy * (h / 2 - 0.09), 0.115);
    }
    // Recessed air-return grille above each bay.
    cs.box(g, x, 1.91, 0.122, 1.3, 0.33, 0.032, cs.darkMat, 0.027);
    for (let i = 0; i < 6; i++)
      cs.box(g, x, 1.785 + i * 0.047, 0.148, 1.21, 0.014, 0.023, cs.edgeMat, 0.003);
    // Three protected warm-white light bars share the same powered material.
    cs.box(g, x, 1.34, 0.14, 1.45, 0.14, 0.13, cs.darkMat, 0.023);
    cs.box(g, x, 1.33, 0.214, 1.32, 0.044, 0.014, diffuser, 0.007);
    cs.box(g, x, 1.39, 0.229, 1.48, 0.033, 0.1, inset, 0.011);
    // Shallow lower covers and a replaceable scuff plate complete the console base.
    cs.box(g, x, -1.41, 0.124, 1.3, 0.58, 0.033, inset, 0.035);
    for (let i = 0; i < 5; i++)
      cs.box(g, x, -1.55 + i * 0.07, 0.15, 1.15, 0.025, 0.026, cs.darkMat, 0.004);
    cs.box(g, x, -2.29, 0.15, 1.53, 0.23, 0.052, cs.treadMat, 0.018);
  }
  // Enclosed longitudinal cable raceway; brackets retain the two exposed looms.
  cs.box(g, 0, 0.86, 0.12, 5.53, 0.255, 0.06, cs.darkMat, 0.025);
  for (const y of [0.795, 0.9])
    cs.tube(
      g,
      [
        [-2.65, y, 0.16],
        [-1.3, y, 0.18],
        [1.3, y, 0.18],
        [2.65, y, 0.16],
      ],
      0.025,
      inset,
    );
  for (const x of [-2.45, -1.15, 1.15, 2.45])
    cs.box(g, x, 0.86, 0.201, 0.056, 0.28, 0.035, cs.edgeMat, 0.009);
  const front = -side * 1.86,
    rear = side * 1.86;
  cs.label(
    g,
    side < 0 ? 'COOLANT / SERVICE 04' : 'ELECTRICAL / SERVICE 09',
    front,
    0.6,
    0.128,
    1.43,
    0.075,
    '#bbcbd3',
  );
  cs.label(
    g,
    side < 0 ? 'SUPPLY / RETURN' : 'DC BUS / ISOLATION',
    front,
    0.46,
    0.129,
    1.1,
    0.045,
    '#81a2af',
  );
  // Flush service hatch with real hinges and a recessed pull handle.
  cs.box(g, front, 0.01, 0.131, 1.36, 0.7, 0.036, inset, 0.035);
  for (const y of [-0.2, 0.23])
    cs.box(g, front - 0.61, y, 0.16, 0.064, 0.19, 0.044, cs.edgeMat, 0.008);
  cs.box(g, front + 0.46, 0.015, 0.162, 0.14, 0.32, 0.025, cs.darkMat, 0.021);
  cs.tube(
    g,
    [
      [front + 0.46, -0.085, 0.169],
      [front + 0.46, -0.072, 0.22],
      [front + 0.46, 0.1, 0.22],
      [front + 0.46, 0.112, 0.169],
    ],
    0.016,
    cs.steelMat,
  );
  cs.label(g, 'SERVICE ACCESS', 0, 0.53, 0.128, 1.18, 0.065, '#bbcbd3');
  cs.label(
    g,
    side < 0 ? 'THERMAL MANAGEMENT' : 'POWER DISTRIBUTION',
    0,
    0.4,
    0.129,
    1.38,
    0.045,
    '#81a2af',
  );
  cs.box(g, 0, -0.08, 0.132, 1.21, 0.54, 0.035, inset, 0.025);
  for (const x of [-0.37, 0, 0.37]) {
    cs.cylinder(g, x, -0.08, 0.167, 0.064, 0.029, cs.edgeMat, 16);
    cs.cylinder(g, x, -0.08, 0.188, 0.04, 0.018, cs.darkMat, 16);
  }
  cs.label(g, 'CABIN / AIR RETURN', rear, 0.54, 0.128, 1.37, 0.068, '#bbcbd3');
  cs.box(g, rear, 0.01, 0.136, 1.32, 0.54, 0.04, cs.darkMat, 0.026);
  for (let i = 0; i < 8; i++)
    cs.box(g, rear, -0.205 + i * 0.06, 0.165, 1.2, 0.024, 0.027, inset, 0.005);
  // Padded shoulder rail, floor joint and coved roof connection.
  cs.box(g, 0, -0.47, 0.175, 5.56, 0.15, 0.15, cs.darkMat, 0.048);
  cs.box(g, 0, -2.57, 0.16, 5.8, 0.12, 0.24, cs.edgeMat, 0.023);
  const cove = cs.box(g, 0, 2.35, 0.13, 5.79, 0.35, 0.15, inset, 0.04);
  cove.rotation.x = -0.3;
  cs.label(
    g,
    side < 0 ? 'IV-04 / PORT' : 'IV-04 / STARBOARD',
    0,
    2.27,
    0.243,
    1.4,
    0.08,
    '#a5bac5',
  );
}
