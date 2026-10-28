// Bedienelemente: Konsole, Schalter, Overhead-Panel, Monitore, Sitz, Instrumente.
// Ausgelagert aus cockpit-scene.ts; `cs` ist die CockpitScene-Instanz.
import { SURROUND_VIEWS } from '../surround-cameras';
import { MOBILITY_CONTROLS } from '../mobility';
import { SERVICE_CONTROLS } from '../service-systems';
import * as THREE from 'three';
import { STEPS } from '../machine';
import { LSK_ACTION, MCDU_KEYS, MCDU_KEY_ACTION, MCDU_KEY_HINT } from '../autopilot';
import type { CockpitScene } from '../cockpit-scene';

export function screen(
  cs: CockpitScene,
  parent: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  kind: string,
  title: string,
) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  cs.box(g, 0, 0, 0, w + 0.2, h + 0.22, 0.16, cs.darkMat, 0.05);
  cs.box(g, 0, 0, 0.03, w + 0.14, h + 0.15, 0.14, cs.displayFrameMat, 0.035);
  cs.box(g, 0, 0, 0.11, w + 0.035, h + 0.035, 0.04, cs.darkMat, 0.015);
  const canvas = document.createElement('canvas');
  // MCDU: breiteres Bild (2:1 wie der Bildschirm) für scharfe Schrift
  canvas.width = kind === 'comm' ? 1440 : 960;
  canvas.height = 720;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  cs.textures.push(texture);
  const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  cs.materials.push(material);
  const display = cs.plane(g, 0, 0, 0.143, w, h, material);
  cs.target(display, -1, title + ' · anklicken zum Vergrößern', true);
  cs.screens.push({ canvas, ctx, texture, kind, material, mesh: display, lastDraw: -Infinity });
  if (kind === 'power' || kind === 'preflight') {
    const touchMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    cs.materials.push(touchMaterial);
    for (const b of kind === 'power' ? SERVICE_CONTROLS : MOBILITY_CONTROLS) {
      const touch = cs.plane(
        g,
        ((b.x + b.w / 2 - 480) / 960) * w,
        ((360 - b.y - b.h / 2) / 720) * h,
        0.145,
        (b.w / 960) * w,
        (b.h / 720) * h,
        touchMaterial,
      );
      cs.target(touch, b.action, b.label);
      touch.userData.displayControl = true;
      if (kind === 'power') touch.userData.servicePage = 'page' in b ? b.page : undefined;
      else {
        touch.userData.mobilityPage = 'page' in b ? b.page : undefined;
        touch.userData.mobilityControl = true;
      }
    }
  }
  cs.label(g, title, 0, h / 2 + 0.07, 0.113, w * 0.88, 0.052, '#c6ced4');
  for (let i = 0; i < 6; i++) {
    const button = cs.box(
      g,
      -w * 0.38 + i * w * 0.152,
      -h / 2 - 0.06,
      0.132,
      0.064,
      0.041,
      0.03,
      cs.labelMat,
      0.006,
    );
    if (kind === 'comm') {
      cs.target(button, LSK_ACTION + i, 'MCDU · Zeilentaste ' + (i + 1));
      cs.label(
        g,
        String(i + 1),
        -w * 0.38 + i * w * 0.152,
        -h / 2 - 0.06,
        0.149,
        0.033,
        0.028,
        '#102015',
      );
    }
    if (kind === 'cameras') {
      cs.target(button, 100 + i, 'Kamera ' + (i + 1) + ' · ' + SURROUND_VIEWS[i].label);
      cs.label(
        g,
        String(i + 1),
        -w * 0.38 + i * w * 0.152,
        -h / 2 - 0.06,
        0.149,
        0.033,
        0.028,
        '#102015',
      );
    }
  }
  if (kind === 'comm') {
    // Zeilen direkt antippen (vergrößerte Ansicht): gleiche Wirkung wie die Zeilentasten
    const touchMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    cs.materials.push(touchMat);
    for (let i = 0; i < 6; i++) {
      const touch = cs.plane(
        g,
        0,
        ((360 - (143 + i * 88)) / 720) * h,
        0.146,
        w * 0.96,
        (84 / 720) * h,
        touchMat,
      );
      cs.target(touch, LSK_ACTION + i, 'MCDU · Zeile ' + (i + 1));
      touch.userData.displayControl = true;
      // Nur in der vergrößerten Ansicht – sonst vergrößert ein Klick den Bildschirm
      touch.userData.zoomOnly = true;
    }
  }
  if (kind === 'cameras') {
    const touchMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    cs.materials.push(touchMat);
    for (const [action, x, label] of [
      [106, 654, 'Alle sechs Kameras anzeigen'],
      [107, 854, 'Bordsysteme anzeigen'],
    ] as const) {
      const touch = cs.plane(
        g,
        ((x - 480) / 960) * w,
        ((360 - 42) / 720) * h,
        0.146,
        (195 / 960) * w,
        (80 / 720) * h,
        touchMat,
      );
      cs.target(touch, action, label);
      touch.userData.displayControl = true;
    }
  }
  for (const s of [-1, 1]) {
    cs.bolt(g, s * (w / 2 + 0.067), h / 2 + 0.067, 0.112);
    cs.cylinder(g, s * (w / 2 + 0.06), -h / 2 - 0.045, 0.14, 0.029, 0.045, cs.darkMat);
  }
  return g;
}

export function buildConsole(cs: CockpitScene) {
  const main = new THREE.Group();
  main.position.set(0, 0.27, -0.27);
  main.rotation.x = -0.12;
  cs.scene.add(main);
  cs.box(main, 0, 0.03, -0.17, 3.7, 1.65, 0.42, cs.bodyMat, 0.1);
  cs.box(main, 0, 0.82, -0.11, 3.44, 0.12, 0.37, cs.edgeMat, 0.05);
  cs.screen(main, -1.11, 0.22, 0.075, 0.85, 0.65, 'armor', 'STRUCTURE / IV–04');
  cs.screen(main, 0, 0.26, 0.13, 0.9, 0.77, 'radar', 'TACTICAL / RADAR');
  cs.screen(main, 1.11, 0.22, 0.075, 0.85, 0.65, 'reactor', 'REACTOR');
  for (const s of [-1, 1]) {
    const p = cs.panel(main, s * 1.16, 0.77, 0.035, 0.98, 0.18);
    cs.label(p, s < 0 ? 'MASTER CAUTION' : 'AUXILIARY BUS', -0.05, 0, 0.057, 0.62, 0.04);
    for (let j = 0; j < 3; j++) {
      const led = cs.mat({ color: 0x6f7f32, emissive: 0x899643, emissiveIntensity: 0.25 });
      if (s < 0) cs.cautionLeds.push(led);
      cs.cylinder(p, s * 0.35 + (j - 1) * 0.065, 0, 0.068, 0.017, 0.017, led);
    }
  }
  const control = cs.panel(main, 0, -0.55, 0.1, 3.38, 0.43);
  for (let i = 0; i < 6; i++) cs.addSwitch(control, -1.4 + i * 0.56, 0.005, i, STEPS[i].label);
  // Breiter und höher als früher: Platz für den großen MCDU-Bildschirm (2:1)
  const lower = cs.panel(main, 0, -1.08, 0.07, 2.3, 0.6);
  cs.label(lower, 'COMM / NAVIGATION', -0.6, 0.235, 0.07, 0.9, 0.055);
  // MCDU-Tastenfeld: Seiten, Blättern, CLR, Autopilot, Stufe, Helligkeit
  for (let y = 0; y < 3; y++)
    for (let x = 0; x < 6; x++) {
      const i = x + y * 6,
        name = MCDU_KEYS[i];
      const key = cs.box(
        lower,
        -0.99 + x * 0.155,
        0.075 - y * 0.105,
        0.082,
        0.13,
        0.078,
        0.039,
        name === 'AP' ? cs.edgeMat : cs.darkMat,
        0.008,
      );
      cs.target(key, MCDU_KEY_ACTION + i, 'MCDU · ' + MCDU_KEY_HINT[name]);
      cs.label(
        lower,
        name,
        -0.99 + x * 0.155,
        0.075 - y * 0.105,
        0.108,
        0.112,
        0.05,
        name === 'AP' ? '#f2d58a' : '#d4caba',
      );
    }
  cs.screen(lower, 0.64, 0, 0.09, 0.74, 0.37, 'comm', 'MCDU / NAV');
  cs.addGauge(main, -1.43, -1.03, 0.12, 0.19, 0, 'BUS VOLT');
  cs.addGauge(main, 1.4, -1.03, 0.12, 0.19, 1, 'PRESSURE');
  cs.label(main, 'IRON VAULT / MK. IV', 0, 0.95, 0.05, 1.7, 0.085, '#c4cbd2');
  // Central, physically mounted head-up sight.
  const hud = new THREE.Group();
  hud.position.set(0, 1.72, -0.9);
  cs.scene.add(hud);
  cs.box(hud, 0, -0.21, 0, 0.61, 0.06, 0.18, cs.darkMat);
  cs.box(hud, -0.3, 0, 0, 0.035, 0.46, 0.045, cs.edgeMat);
  cs.box(hud, 0.3, 0, 0, 0.035, 0.46, 0.045, cs.edgeMat);
  cs.box(hud, 0, 0.23, 0, 0.61, 0.03, 0.045, cs.edgeMat);
  const glass = cs.mat({
    color: 0x77957c,
    transparent: true,
    opacity: 0.11,
    metalness: 0.1,
    roughness: 0.25,
    depthWrite: false,
  });
  cs.box(hud, 0, 0, 0, 0.56, 0.43, 0.014, glass, 0);
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 480;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cs.textures.push(t);
  const m = new THREE.MeshBasicMaterial({
    map: t,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  cs.materials.push(m);
  const display = cs.plane(hud, 0, 0, 0.016, 0.56, 0.43, m);
  cs.screens.push({
    canvas: c,
    ctx: c.getContext('2d')!,
    texture: t,
    kind: 'hud',
    material: m,
    mesh: display,
    lastDraw: -Infinity,
  });
}

export function addSwitch(
  cs: CockpitScene,
  parent: THREE.Object3D,
  x: number,
  y: number,
  index: number,
  title: string,
  push = false,
) {
  const g = new THREE.Group();
  g.position.set(x, y, 0.055);
  parent.add(g);
  const hint =
    index < 6 ? title + ' [' + (index + 1) + ']' : title + (push ? ' · drücken' : ' · umlegen');
  const face = cs.mat({ color: 0x202d39, metalness: 0.35, roughness: 0.63 });
  cs.box(g, 0, 0, -0.009, 0.444, 0.382, 0.034, cs.edgeMat, 0.018);
  const base = cs.box(g, 0, 0, 0.012, 0.426, 0.364, 0.028, face, 0.012);
  cs.target(base, index, hint);
  cs.label(
    g,
    index < 6 ? ['POWER', 'COOLANT', 'DIAG', 'REACTOR', 'GYRO', 'LINK'][index] : title,
    0,
    0.14,
    0.032,
    0.385,
    0.043,
    '#e0e7ea',
  );
  for (const sx of [-1, 1]) {
    cs.cylinder(g, sx * 0.187, -0.15, 0.032, 0.012, 0.009, cs.steelMat, 16);
    cs.box(g, sx * 0.187, -0.15, 0.039, 0.016, 0.0025, 0.002, cs.darkMat, 0);
  }
  const led = cs.mat({
    color: 0x354c38,
    emissive: 0xa8e765,
    emissiveIntensity: 0,
    roughness: 0.28,
  });
  cs.cylinder(g, 0.157, -0.081, 0.039, 0.022, 0.008, cs.darkMat, 24);
  cs.cylinder(g, 0.157, -0.081, 0.045, 0.016, 0.007, led, 24);
  const pivot = new THREE.Group();
  pivot.position.set(0, -0.014, 0.059);
  g.add(pivot);
  if (push) {
    cs.box(g, 0, -0.009, 0.048, 0.19, 0.18, 0.045, cs.darkMat, 0.018);
    cs.box(
      pivot,
      0,
      0,
      0.035,
      0.151,
      0.134,
      0.048,
      index === 43 ? cs.mat({ color: 0x567e7d, metalness: 0.2, roughness: 0.5 }) : cs.labelMat,
      0.012,
    );
    cs.label(pivot, index === 43 ? 'START' : 'TEST', 0, 0, 0.062, 0.126, 0.035, '#e8f6f4');
    cs.label(g, 'PUSH', 0, -0.132, 0.034, 0.12, 0.025, '#a9bac7');
  } else {
    // Washer, hex nut, threaded collar, stem and lathed insulated grip.
    cs.cylinder(g, 0, -0.014, 0.04, 0.066, 0.014, cs.darkMat, 32);
    cs.cylinder(g, 0, -0.014, 0.05, 0.058, 0.015, cs.steelMat, 32);
    cs.cylinder(g, 0, -0.014, 0.064, 0.048, 0.018, cs.edgeMat, 6);
    cs.cylinder(g, 0, -0.014, 0.076, 0.031, 0.017, cs.steelMat, 32);
    for (let j = 0; j < 3; j++)
      cs.cylinder(g, 0, -0.014, 0.078 + j * 0.006, 0.032, 0.002, cs.darkMat, 24);
    cs.cylinder(pivot, 0, 0, 0.053, 0.013, 0.106, cs.steelMat, 20);
    const key = 'toggle-grip';
    if (!cs.geometries.has(key))
      cs.geometries.set(
        key,
        new THREE.LatheGeometry(
          [
            [0.014, 0],
            [0.027, 0.008],
            [0.03, 0.023],
            [0.028, 0.051],
            [0.022, 0.066],
            [0, 0.071],
          ].map(([r, y]) => new THREE.Vector2(r, y)),
          24,
        ),
      );
    const critical = [0, 3, 48].includes(index),
      gripMat = cs.mat({
        color: critical ? 0xc55338 : 0xd5dcd5,
        metalness: 0.12,
        roughness: 0.37,
      });
    const grip = new THREE.Mesh(cs.geometries.get(key)!, gripMat);
    grip.rotation.x = Math.PI / 2;
    grip.position.z = 0.098;
    pivot.add(grip);
    const ringKey = 'toggle-grip-ring';
    if (!cs.geometries.has(ringKey))
      cs.geometries.set(ringKey, new THREE.TorusGeometry(0.0295, 0.0016, 5, 24));
    for (let j = 0; j < 3; j++) {
      const ring = new THREE.Mesh(cs.geometries.get(ringKey)!, cs.edgeMat);
      ring.position.z = 0.118 + j * 0.008;
      pivot.add(ring);
    }
    cs.label(g, 'ON', -0.134, 0.059, 0.036, 0.07, 0.03, '#a9dace');
    cs.label(g, 'OFF', -0.132, -0.09, 0.036, 0.095, 0.029, '#a1afbb');
    if (critical) {
      const guardMat = cs.mat({ color: 0xc5a363, metalness: 0.72, roughness: 0.33 });
      for (const sx of [-1, 1]) {
        cs.tube(
          g,
          [
            [sx * 0.087, -0.096, 0.039],
            [sx * 0.087, -0.083, 0.145],
            [sx * 0.087, 0.092, 0.145],
            [sx * 0.087, 0.102, 0.039],
          ],
          0.009,
          guardMat,
        );
      }
    }
    pivot.rotation.x = 0.6;
  }
  cs.target(pivot, index, hint);
  cs.switches.push({ pivot, led, index, push });
  // Decorative collars/guards must not swallow a click aimed at the switch
  // plate behind them. The plate and animated lever remain the actual targets.
  g.traverse((object) => {
    if (object instanceof THREE.Mesh) object.userData.switchDetail = true;
  });
}

export function buildOverhead(cs: CockpitScene) {
  const g = cs.panel(cs.scene, 0, 3.04, 0.55, 3.23, 1.75);
  g.rotation.x = 0.45;
  const face = cs.mat({ color: 0x18232e, metalness: 0.35, roughness: 0.69 });
  cs.box(g, 0, 0, 0.038, 3.12, 1.63, 0.028, face, 0.04);
  cs.label(g, 'IRON VAULT  /  OVERHEAD SYSTEMS', 0, 0.747, 0.064, 2.66, 0.07, '#d8e5ed');
  const groups = [
    {
      x: -1.035,
      title: '01  ELECTRICAL',
      controls: [
        [40, 'BAT 1'],
        [41, 'BAT 2'],
        [44, 'APU GEN'],
        [51, 'MAIN GEN'],
      ],
    },
    {
      x: 0,
      title: '02  AUXILIARY POWER',
      controls: [
        [50, 'FUEL PUMP'],
        [42, 'APU MASTER'],
        [43, 'APU START'],
        [49, 'LAMP TEST'],
      ],
    },
    {
      x: 1.035,
      title: '03  SYSTEM FEEDS',
      controls: [
        [45, 'COOLANT VALVE'],
        [46, 'HYD PUMP'],
        [47, 'AVIONICS'],
        [48, 'REACTOR ARM'],
      ],
    },
  ];
  for (const group of groups) {
    cs.box(g, group.x, 0.109, 0.058, 0.998, 1.047, 0.025, cs.darkMat, 0.022);
    cs.label(g, group.title, group.x, 0.543, 0.079, 0.91, 0.047, '#95c6d1');
    group.controls.forEach(([action, label], i) => {
      const x = group.x + (i % 2 ? 0.237 : -0.237),
        y = i < 2 ? 0.271 : -0.151;
      cs.addSwitch(g, x, y, action as number, label as string, [43, 49].includes(action as number));
    });
  }
  cs.box(g, 0, -0.619, 0.064, 2.985, 0.272, 0.036, cs.edgeMat, 0.018);
  cs.box(g, 0, -0.619, 0.087, 2.928, 0.225, 0.014, cs.darkMat, 0.012);
  const canvas = document.createElement('canvas');
  canvas.width = 1440;
  canvas.height = 140;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  cs.textures.push(texture);
  const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  cs.materials.push(material);
  const display = cs.plane(g, 0, -0.619, 0.097, 2.89, 0.194, material);
  cs.target(display, -1, 'Elektrische Versorgung · vergrößern', true);
  cs.screens.push({
    canvas,
    ctx,
    texture,
    material,
    kind: 'electrical',
    mesh: display,
    lastDraw: -Infinity,
  });
  for (const x of [-1.36, 1.36])
    cs.tube(
      g,
      [
        [x, 0.73, -0.08],
        [x, 0.88, -0.19],
        [x, 0.93, -0.4],
      ],
      0.045,
      cs.edgeMat,
    );
}

export function buildTopMonitor(cs: CockpitScene, side: number) {
  const g = new THREE.Group();
  g.position.set(side * 1.68, 2.08, -1.38);
  g.rotation.y = -side * 0.19;
  g.rotation.x = 0.055;
  cs.scene.add(g);
  cs.screen(
    g,
    0,
    0,
    0,
    0.91,
    0.63,
    side < 0 ? 'diagnostics' : 'cameras',
    side < 0 ? 'ENGINEERING' : 'SURROUND / CAMERAS',
  );
  cs.tube(
    g,
    [
      [-0.25, -0.39, -0.1],
      [-0.25, -0.61, -0.18],
      [0.15, -0.62, -0.3],
      [0.2, -0.42, -0.45],
    ],
    0.025,
    cs.darkMat,
  );
  cs.box(g, 0, 0.45, -0.15, 0.17, 0.24, 0.13, cs.edgeMat);
}

export function buildSideMonitor(cs: CockpitScene, side: number) {
  const g = new THREE.Group();
  g.position.set(side * 1.85, 1.17, 0.34);
  g.rotation.y = -side * 0.44;
  g.rotation.x = -0.035;
  g.scale.setScalar(0.94);
  cs.scene.add(g);
  cs.screen(
    g,
    0,
    0,
    0,
    0.81,
    0.6,
    side < 0 ? 'power' : 'preflight',
    side < 0 ? 'COOLING / ELECTRICAL' : 'PREFLIGHT / TEST',
  );
  cs.tube(
    g,
    [
      [0, -0.42, -0.09],
      [0, -0.61, -0.21],
      [side * 0.24, -0.69, -0.35],
    ],
    0.052,
    cs.edgeMat,
  );
  cs.tube(
    g,
    [
      [side * 0.26, -0.35, -0.13],
      [side * 0.31, -0.62, -0.19],
      [side * 0.4, -0.7, -0.3],
    ],
    0.02,
    cs.darkMat,
  );
  // The articulated display arm terminates at a bolted wall socket.
  g.updateMatrixWorld(true);
  const armEnd = g.localToWorld(new THREE.Vector3(side * 0.24, -0.69, -0.35));
  const socket = new THREE.Group();
  socket.position.set(side * 2.4, 0.5, 0.52);
  socket.rotation.y = (-side * Math.PI) / 2;
  cs.scene.add(socket);
  cs.panel(socket, 0, 0, 0, 0.32, 0.28);
  cs.tube(
    cs.scene,
    [armEnd.toArray(), [side * 2.2, 0.5, 0.46], [side * 2.35, 0.5, 0.52]],
    0.052,
    cs.edgeMat,
  );
  if (side > 0) {
    for (const [x, action, label] of [
      [-0.215, 30, 'TEST [T]'],
      [0.215, 35, 'SHUTDOWN [K]'],
    ] as const) {
      const button = cs.box(
        g,
        x,
        -0.46,
        0.06,
        0.37,
        0.12,
        0.065,
        action === 35 ? cs.bodyMat : cs.labelMat,
        0.017,
      );
      cs.label(g, label, x, -0.46, 0.099, 0.34, 0.045, action === 35 ? '#efd391' : '#d7f1ed');
      cs.target(
        button,
        action,
        action === 35 ? 'Geordnetes Herunterfahren [K]' : 'Systemtest starten / abbrechen [T]',
      );
    }
  }
}

export function buildSide(cs: CockpitScene, side: number) {
  const g = new THREE.Group();
  g.position.set(side * 1.83, -0.37, 1.27);
  g.rotation.x = -0.93;
  g.rotation.y = -side * 0.19;
  g.rotation.z = side * 0.035;
  cs.scene.add(g);
  cs.box(g, 0, 0, -0.16, 0.94, 2.45, 0.37, cs.bodyMat, 0.06);
  const p = cs.panel(g, 0, 0.43, 0.065, 0.82, 1.23);
  cs.label(p, side < 0 ? 'POWER / AUX' : 'FLIGHT / AUX', 0, 0.5, 0.063, 0.65, 0.075);
  const rows =
    side < 0
      ? [
          {
            label: 'FAN / KABINE',
            action: 20,
            minus: 26,
            hint: 'Lüfter · aus / Stufe 1 / 2 / 3',
          },
          {
            label: 'HYDRAULIC',
            action: 21,
            minus: 27,
            hint: 'Hydraulikdruck · 150 / 210 / 280 bar',
          },
          {
            label: 'DISPLAY DIM',
            action: 22,
            minus: 28,
            hint: 'Instrumentenhelligkeit · 40 / 70 / 100 %',
          },
          {
            label: 'RED LIGHT',
            action: 31,
            minus: 32,
            hint: 'Rote Deckenlampe · 0–100 % in 10-%-Schritten',
          },
        ]
      : [
          {
            label: 'RADAR RANGE',
            action: 23,
            minus: 29,
            hint: 'Radarreichweite · 125 / 250 / 500 / 1000 m',
          },
          {
            label: 'RADAR RUN / HOLD',
            action: 24,
            minus: 0,
            hint: 'Radarsuche anhalten / fortsetzen',
          },
          { label: 'HUD OFF / ON', action: 25, minus: 0, hint: 'HUD ausblenden / einblenden' },
          { label: 'COOLING', action: 33, minus: 34, hint: 'Reaktorkühlung · Stufe 1 / 2 / 3' },
        ];
  rows.forEach((row, j) => {
    const y = 0.23 - j * 0.22;
    cs.label(p, row.label, 0, y + 0.09, 0.07, 0.67, 0.052, '#c3c9cc');
    const knob = new THREE.Group();
    knob.position.set(0, y, 0.105);
    p.add(knob);
    cs.cylinder(knob, 0, 0, 0, 0.063, 0.062, cs.darkMat, 20);
    cs.cylinder(knob, 0, 0, 0.034, 0.05, 0.012, cs.labelMat, 20);
    cs.box(knob, 0, 0.032, 0.044, 0.012, 0.035, 0.008, cs.steelMat, 0.002);
    cs.target(knob, row.action, row.hint);
    cs.knobs.push({ pivot: knob, action: row.action });
    if (row.minus) {
      for (const direction of [-1, 1]) {
        const b = cs.box(p, direction * 0.24, y, 0.11, 0.105, 0.08, 0.045, cs.darkMat, 0.009);
        cs.target(
          b,
          direction < 0 ? row.minus : row.action,
          row.hint + (direction < 0 ? ' · zurück' : ' · weiter'),
        );
        cs.label(p, direction < 0 ? '−' : '+', direction * 0.24, y, 0.138, 0.067, 0.055);
      }
    } else {
      cs.label(p, 'OFF', -0.23, y, 0.07, 0.15, 0.04);
      cs.label(p, 'ON', 0.23, y, 0.07, 0.15, 0.04);
    }
  });

  const foot = cs.panel(g, 0, -0.63, 0.066, 0.82, 0.65);
  cs.label(foot, side < 0 ? 'THROTTLE / ENGINE' : 'CONTROL STICK', 0, 0.24, 0.075, 0.65, 0.05);
  if (side < 0) {
    for (const s of [-1, 1]) cs.box(foot, s * 0.11, -0.03, 0.09, 0.033, 0.38, 0.01, cs.darkMat);
    cs.throttle = new THREE.Group();
    cs.throttle.position.set(0, -0.12, 0.1);
    foot.add(cs.throttle);
    for (const s of [-1, 1])
      cs.box(cs.throttle, s * 0.09, 0, 0.13, 0.029, 0.035, 0.27, cs.steelMat);
    const handle = cs.box(cs.throttle, 0, 0, 0.27, 0.32, 0.105, 0.12, cs.darkMat, 0.04);
    cs.box(
      cs.throttle,
      -0.135,
      0,
      0.275,
      0.02,
      0.07,
      0.08,
      cs.mat({ color: 0xc25c2b, roughness: 0.45 }),
    );
    cs.target(handle, 11, 'Leistungshebel · 0 / 25 / 50 / 75 / 100 %');
    cs.target(foot, 11, 'Leistungshebel · Leistung ändern');
    cs.label(foot, 'IDLE              MAX', 0, -0.23, 0.07, 0.65, 0.043);
  } else {
    const stick = new THREE.Group();
    stick.position.set(0, -0.12, 0.09);
    foot.add(stick);
    cs.cylinder(stick, 0, 0, 0.035, 0.13, 0.07, cs.darkMat);
    for (let k = 0; k < 4; k++)
      cs.cylinder(stick, 0, 0, 0.095 + k * 0.028, 0.09 - k * 0.007, 0.025, cs.darkMat);
    cs.box(stick, 0, 0.04, 0.26, 0.092, 0.105, 0.3, cs.darkMat, 0.04);
    cs.box(stick, 0, 0.08, 0.43, 0.23, 0.14, 0.13, cs.bodyMat, 0.04);
    cs.cylinder(
      stick,
      -0.075,
      0.09,
      0.505,
      0.033,
      0.018,
      cs.mat({ color: 0xb83e29, roughness: 0.45 }),
    );
    cs.cylinder(stick, 0.05, 0.09, 0.505, 0.043, 0.023, cs.darkMat);
  }
  const lightY = -0.555;
  const lightButton = cs.box(p, 0.28, lightY, 0.09, 0.105, 0.09, 0.05, cs.labelMat);
  cs.target(lightButton, 10, 'Warmes Kabinenlicht [L]');
  cs.label(p, 'LIGHT', 0.02, lightY, 0.07, 0.27, 0.044);
  for (let i = 0; i < 5; i++)
    cs.box(g, 0, -1.06 + i * 0.035, 0.07, 0.55, 0.014, 0.025, cs.darkMat, 0.001);
}

/** Einfacher Sitz aus Grundformen (Ersatz, falls das Sitzmodell nicht lädt). */
export function buildSeat(cs: CockpitScene, parent: THREE.Object3D = cs.scene) {
  const seatmat = cs.seatMat,
    red = cs.leatherMat;
  cs.box(parent, 0, -1.02, 3.15, 1.15, 0.32, 1.3, seatmat, 0.09);
  cs.box(parent, 0, -0.12, 3.96, 1.19, 1.7, 0.27, seatmat, 0.1);
  for (const s of [-1, 1]) {
    cs.box(parent, s * 0.51, -0.12, 3.74, 0.17, 1.43, 0.19, red, 0.05);
    cs.box(parent, s * 0.72, -0.68, 2.65, 0.22, 0.2, 1.2, red, 0.04);
  }
  for (let i = 0; i < 10; i++)
    cs.box(parent, 0, -0.84, 2.62 + i * 0.1, 0.98, 0.015, 0.018, cs.darkMat, 0.003);
}
/** Pilotensitz aus Renes Kanzelmodell: Lage in Kanzelkoordinaten (Blick nach −z). */
export const SEAT = { scale: 2.6, x: 0.06, y: -1.18, z: 2.99 } as const;

export function buildMechanicalDetails(cs: CockpitScene) {
  for (const side of [-1, 1]) {
    const sideGroup = new THREE.Group();
    sideGroup.position.set(side * 1.83, -0.37, 1.27);
    sideGroup.rotation.set(-0.93, -side * 0.19, side * 0.035);
    cs.scene.add(sideGroup);
    // Padded wrist rest on the inner edge of each console.
    cs.box(sideGroup, -side * 0.33, -0.64, 0.16, 0.14, 0.49, 0.11, cs.leatherMat, 0.035);
    // Metal perimeter rail and replaceable faceplates.
    for (const x of [-0.435, 0.435])
      cs.box(sideGroup, x, 0, 0.055, 0.025, 2.26, 0.035, cs.edgeMat, 0.009);
    for (const y of [-0.03, 0.89]) {
      cs.box(sideGroup, 0, y, 0.11, 0.7, 0.012, 0.008, cs.steelMat, 0.002);
    }
    // Guarded auxiliary switch, distinct from the working startup controls.
    cs.box(sideGroup, -0.26, -1.055, 0.095, 0.19, 0.14, 0.06, cs.darkMat, 0.012);
    cs.box(
      sideGroup,
      -0.26,
      -1.055,
      0.131,
      0.125,
      0.065,
      0.02,
      cs.mat({ color: 0xa44a31, metalness: 0.3, roughness: 0.5 }),
      0.004,
    );
    cs.tube(
      sideGroup,
      [
        [-0.36, -1.12, 0.15],
        [-0.36, -1.02, 0.23],
        [-0.16, -1.02, 0.23],
        [-0.16, -1.12, 0.15],
      ],
      0.012,
      cs.steelMat,
    );
    for (const y of [-0.89, 0.91]) for (const x of [-0.38, 0.38]) cs.bolt(sideGroup, x, y, 0.09);
    // Floor wear plates with raised traction pattern from the supplied material.
    cs.box(cs.scene, side * 0.83, -1.36, 1.7, 0.66, 0.065, 1.4, cs.treadMat, 0.025);
    // Connection collars and hoses beneath the front display bank.
    cs.cylinder(cs.scene, side * 1.91, -0.37, -0.07, 0.078, 0.09, cs.steelMat, 12);
    cs.tube(
      cs.scene,
      [
        [side * 1.91, -0.37, 0.01],
        [side * 2.08, -0.66, 0.15],
        [side * 2.16, -0.74, 0.55],
        [side * 2.02, -0.49, 0.93],
      ],
      0.044,
      cs.darkMat,
    );
  }
}

export function addGauge(
  cs: CockpitScene,
  parent: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  r: number,
  kind: number,
  title: string,
) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  cs.cylinder(g, 0, 0, 0, r + 0.025, 0.08, cs.edgeMat, 32);
  cs.cylinder(g, 0, 0, 0.048, r, 0.025, cs.darkMat, 32);
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI * 0.8 + (i / 10) * Math.PI * 1.6;
    const mark = cs.box(
      g,
      Math.sin(a) * r * 0.8,
      Math.cos(a) * r * 0.8,
      0.07,
      0.009,
      0.025,
      0.003,
      cs.labelMat,
      0,
    );
    mark.rotation.z = -a;
  }
  const needle = new THREE.Group();
  needle.position.z = 0.078;
  g.add(needle);
  cs.box(
    needle,
    0,
    r * 0.31,
    0,
    0.009,
    r * 0.65,
    0.007,
    cs.mat({ color: 0xc4ed8c, emissive: 0x658a3b, emissiveIntensity: 0.5 }),
    0,
  );
  cs.cylinder(g, 0, 0, 0.084, 0.022, 0.009, cs.steelMat);
  cs.gauges.push({ needle, kind });
  cs.label(g, title, 0, -r * 0.4, 0.072, r * 1.3, 0.04, '#9fb586');
}
