// Die Drohne in der Szene: Modell (prozedural, geflickt), Halterung auf dem Mech-Rücken,
// Kamera mit Bild für den Cockpit-Monitor, Lichtkegel und Zielmarkierung.
import * as THREE from 'three';
import type { DroneState } from './drone';
import { drawDisplaySurface } from './display-surface';
import { hash } from './display-aging';
import { tr } from './i18n';

const RAD = Math.PI / 180;
/** Halterung oben auf dem Rücken des Rumpfs (Modellkoordinaten, neben der Rundumleuchte). */
export const DRONE_DOCK = { x: -0.045, z: -0.14 } as const;
/** Mech-Modell: 1 Modelleinheit = 9,5 m */
const MODEL_TO_M = 9.5;

function tapeTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const x = c.getContext('2d')!;
  x.fillStyle = '#4b4f45';
  x.fillRect(0, 0, 128, 64);
  for (let i = 0; i < 260; i++) {
    x.fillStyle = `rgba(${20 + hash(i, 1) * 40},${20 + hash(i, 2) * 30},${15},${0.25 * hash(i, 3)})`;
    x.fillRect(hash(i, 4) * 128, hash(i, 5) * 64, 1 + hash(i, 6) * 6, 1 + hash(i, 7) * 3);
  }
  // Gewebeband quer über dem Rumpf
  x.fillStyle = 'rgba(165,165,152,0.9)';
  x.fillRect(46, 0, 22, 64);
  x.strokeStyle = 'rgba(90,90,80,0.6)';
  for (let i = 0; i < 8; i++) {
    x.beginPath();
    x.moveTo(46, i * 8 + 2);
    x.lineTo(68, i * 8 + 4);
    x.stroke();
  }
  x.fillStyle = '#c8a032';
  x.fillRect(0, 54, 128, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Maßstab der Drohne und ihrer Halterung (Grundmaße 0,9 m → rund 1,6 m Spannweite). */
const DRONE_SCALE = 1.8;
/** Ebene des Markierlasers; nur Außenkameras schalten sie ein. */
export const LASER_LAYER = 2;

/** Quadrocopter, ca. 1,6 m Spannweite. Ursprung = Unterseite der Kufen. */
export class DroneRig {
  root = new THREE.Group();
  camera = new THREE.PerspectiveCamera(70, 1.6, 0.05, 600);
  light: THREE.SpotLight;
  private gimbal = new THREE.Group();
  private rotors: THREE.Group[] = [];
  private discs: THREE.MeshBasicMaterial;
  private led: THREE.MeshStandardMaterial;
  private disposables: { dispose(): void }[] = [];
  constructor(scene: THREE.Scene) {
    this.root.name = 'IV-04 recon drone';
    this.root.scale.setScalar(DRONE_SCALE);
    const tape = tapeTexture();
    const body = new THREE.MeshStandardMaterial({ map: tape, roughness: 0.75, metalness: 0.35 });
    const dark = new THREE.MeshStandardMaterial({
      color: 0x24261f,
      roughness: 0.6,
      metalness: 0.5,
    });
    const blade = new THREE.MeshStandardMaterial({ color: 0x1c1d19, roughness: 0.5 });
    this.discs = new THREE.MeshBasicMaterial({
      color: 0x3a3d36,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.led = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2a1a });
    this.disposables.push(tape, body, dark, blade, this.discs, this.led);
    const add = (
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      parent: THREE.Object3D = this.root,
    ) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      parent.add(m);
      this.disposables.push(geo);
      return m;
    };
    const hull = add(new THREE.BoxGeometry(0.34, 0.1, 0.26), body);
    hull.position.y = 0.16;
    const top = add(new THREE.BoxGeometry(0.2, 0.05, 0.16), dark);
    top.position.y = 0.235;
    // Antenne
    const antenna = add(new THREE.CylinderGeometry(0.004, 0.004, 0.16, 6), dark);
    antenna.position.set(-0.08, 0.32, 0.06);
    // Kufen
    for (const sx of [-1, 1]) {
      const skid = add(new THREE.BoxGeometry(0.02, 0.02, 0.3), dark);
      skid.position.set(sx * 0.13, 0.01, 0);
      for (const sz of [-1, 1]) {
        const leg = add(new THREE.BoxGeometry(0.015, 0.11, 0.015), dark);
        leg.position.set(sx * 0.12, 0.065, sz * 0.09);
      }
    }
    // Arme und Rotoren
    const blades = new THREE.BoxGeometry(0.34, 0.006, 0.035);
    const disc = new THREE.CircleGeometry(0.18, 24);
    disc.rotateX(-Math.PI / 2);
    this.disposables.push(blades, disc);
    for (const [ax, az] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]) {
      const arm = add(new THREE.BoxGeometry(0.03, 0.025, 0.32), dark);
      arm.position.set(ax * 0.15, 0.18, az * 0.15);
      arm.rotation.y = Math.atan2(ax, az);
      const motor = add(new THREE.CylinderGeometry(0.028, 0.032, 0.05, 12), dark);
      motor.position.set(ax * 0.27, 0.205, az * 0.27);
      const rotor = new THREE.Group();
      rotor.position.set(ax * 0.27, 0.235, az * 0.27);
      const b = new THREE.Mesh(blades, blade);
      b.castShadow = true;
      rotor.add(b);
      const d = new THREE.Mesh(disc, this.discs);
      rotor.add(d);
      this.root.add(rotor);
      this.rotors.push(rotor);
    }
    // Positionslicht hinten
    const led = add(new THREE.SphereGeometry(0.012, 8, 6), this.led);
    led.position.set(0, 0.17, 0.135);
    // Kamera-Gimbal vorn unten
    this.gimbal.position.set(0, 0.1, -0.12);
    this.root.add(this.gimbal);
    const ball = add(new THREE.SphereGeometry(0.035, 12, 10), dark, this.gimbal);
    ball.position.set(0, 0, 0);
    const lens = add(
      new THREE.CylinderGeometry(0.014, 0.014, 0.02, 10),
      new THREE.MeshStandardMaterial({ color: 0x0a0d10, roughness: 0.1, metalness: 0.9 }),
      this.gimbal,
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.z = -0.035;
    this.gimbal.add(this.camera);
    this.camera.position.set(0, 0, -0.05);
    // Suchscheinwerfer am Gimbal (für Nachtflüge)
    this.light = new THREE.SpotLight(0xfff1d6, 0, 70, 0.42, 0.55, 1.6);
    this.light.position.set(0, -0.02, -0.04);
    this.light.target.position.set(0, 0, -5);
    this.gimbal.add(this.light, this.light.target);
    scene.add(this.root);
  }
  /** Pro Bild: Lage aus dem Zustand, Rotoren drehen, Licht. */
  update(d: DroneState, time: number, night: number, dt: number) {
    this.root.position.set(d.pos.x, d.pos.y, d.pos.z);
    // Leichte Neigung in Flugrichtung, wie bei echten Multikoptern
    const sin = Math.sin(d.yaw),
      cos = Math.cos(d.yaw);
    const fwd = -(d.vel.x * -sin + d.vel.z * -cos);
    const side = d.vel.x * cos - d.vel.z * sin;
    this.root.rotation.set(-fwd * 0.03, d.yaw, -side * 0.03, 'YXZ');
    this.gimbal.rotation.x = d.camPitch;
    for (let i = 0; i < 4; i++) this.rotors[i].rotation.y += (i % 2 ? -1 : 1) * d.rotor * 95 * dt;
    this.discs.opacity = Math.max(0, d.rotor - 0.35) * 0.45;
    this.led.emissiveIntensity = d.phase === 'docked' ? 0.3 : Math.sin(time * 9) > 0 ? 3 : 0.2;
    this.light.intensity = d.phase === 'docked' ? 0 : 80 * night + 6;
    this.root.updateMatrixWorld(true);
  }
  dispose() {
    this.root.removeFromParent();
    for (const d of this.disposables) d.dispose();
    this.light.dispose();
  }
}

/** Halterung am Rücken: Gummipuffer, Bügel und Verriegelungsklauen. */
export class DroneDock {
  anchor = new THREE.Object3D();
  private disposables: { dispose(): void }[] = [];
  attach(torso: THREE.Mesh) {
    torso.updateWorldMatrix(true, false);
    const hit = new THREE.Raycaster(
      torso.localToWorld(new THREE.Vector3(DRONE_DOCK.x, 1.4, DRONE_DOCK.z)),
      new THREE.Vector3(0, -1, 0).transformDirection(torso.matrixWorld),
      0,
      1,
    ).intersectObject(torso, false)[0];
    const base = new THREE.Group();
    if (hit) base.position.copy(torso.worldToLocal(hit.point.clone()));
    else base.position.set(DRONE_DOCK.x, 0.945, DRONE_DOCK.z);
    base.scale.setScalar(DRONE_SCALE / MODEL_TO_M); // ab hier in Metern (Drohnenmaßstab)
    torso.add(base);
    const steel = new THREE.MeshStandardMaterial({
      color: 0x3b3f36,
      roughness: 0.7,
      metalness: 0.6,
    });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x151512, roughness: 0.95 });
    this.disposables.push(steel, rubber);
    const add = (
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      x: number,
      y: number,
      z: number,
    ) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      base.add(m);
      this.disposables.push(geo);
      return m;
    };
    add(new THREE.BoxGeometry(0.62, 0.04, 0.5), steel, 0, 0.02, 0);
    for (const sx of [-1, 1]) {
      add(new THREE.BoxGeometry(0.06, 0.06, 0.4), rubber, sx * 0.13, 0.07, 0);
      // Klauen, die die Kufen halten
      for (const sz of [-1, 1])
        add(new THREE.BoxGeometry(0.05, 0.09, 0.04), steel, sx * 0.17, 0.085, sz * 0.12);
    }
    // Ladekontakt
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 10), steel, 0, 0.065, 0.16);
    this.anchor.position.set(0, 0.1, 0);
    base.add(this.anchor);
  }
  /** Weltlage der Halterung (Kufen-Unterseite) und Blickrichtung des Mechs. */
  world(out: THREE.Vector3) {
    this.anchor.updateWorldMatrix(true, false);
    return this.anchor.getWorldPosition(out);
  }
  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}

/** Zielmarkierung im Gelände: pulsierender Ring und Lichtsäule, Laserstrahl von der Drohne. */
export class TargetMarker {
  root = new THREE.Group();
  private ring: THREE.Mesh;
  private beam: THREE.Mesh;
  private laser: THREE.Mesh;
  private mats: THREE.Material[] = [];
  private geos: THREE.BufferGeometry[] = [];
  constructor(scene: THREE.Scene) {
    const red = new THREE.MeshBasicMaterial({
      color: 0xff3020,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const glow = red.clone();
    glow.opacity = 0.18;
    glow.blending = THREE.AdditiveBlending;
    const laserMat = red.clone();
    laserMat.opacity = 0.55;
    laserMat.blending = THREE.AdditiveBlending;
    this.mats.push(red, glow, laserMat);
    const ringGeo = new THREE.RingGeometry(0.7, 0.85, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const beamGeo = new THREE.CylinderGeometry(0.06, 0.06, 1, 8, 1, true);
    beamGeo.translate(0, 0.5, 0);
    const laserGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 6, 1, true);
    laserGeo.translate(0, 0.5, 0);
    laserGeo.rotateX(Math.PI / 2);
    this.geos.push(ringGeo, beamGeo, laserGeo);
    this.ring = new THREE.Mesh(ringGeo, red);
    this.beam = new THREE.Mesh(beamGeo, glow);
    this.beam.scale.y = 18;
    this.root.add(this.ring, this.beam);
    this.laser = new THREE.Mesh(laserGeo, laserMat);
    // Eigene Ebene: Aus der Drohnenkamera selbst wäre der Strahl nur ein roter Keil im Bild.
    this.laser.layers.set(LASER_LAYER);
    this.laser.frustumCulled = false;
    this.root.visible = false;
    this.laser.visible = false;
    for (const m of [this.ring, this.beam, this.laser]) m.renderOrder = 6;
    scene.add(this.root, this.laser);
  }
  update(d: DroneState, time: number) {
    const mark = d.mark;
    this.root.visible = !!mark;
    this.laser.visible = !!mark && d.phase !== 'docked';
    if (!mark) return;
    this.root.position.set(mark.x, mark.y + 0.05, mark.z);
    const pulse = 1 + 0.25 * Math.sin(time * 6);
    this.ring.scale.set(pulse, 1, pulse);
    const from = new THREE.Vector3(d.pos.x, d.pos.y + 0.1, d.pos.z);
    const to = new THREE.Vector3(mark.x, mark.y, mark.z);
    this.laser.position.copy(from);
    this.laser.lookAt(to);
    this.laser.scale.set(1, 1, from.distanceTo(to));
    this.root.updateMatrixWorld(true);
    this.laser.updateMatrixWorld(true);
  }
  dispose() {
    this.root.removeFromParent();
    this.laser.removeFromParent();
    for (const m of this.mats) m.dispose();
    for (const g of this.geos) g.dispose();
  }
}

/** Drohnenbild für den Kamera-Monitor im Cockpit: Bild + Anzeige + Rauschen bei schwachem Funk. */
export class DroneFeed {
  target = new THREE.WebGLRenderTarget(960, 600, { depthBuffer: true, type: THREE.HalfFloatType });
  output = new THREE.WebGLRenderTarget(960, 720, { depthBuffer: false, generateMipmaps: false });
  private composite = new THREE.Scene();
  private ortho = new THREE.OrthographicCamera(-480, 480, 360, -360, 0.1, 10);
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private overlay: THREE.CanvasTexture;
  private tile: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private label: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private geometry = new THREE.PlaneGeometry(1, 1);
  private lastCapture = -Infinity;
  private viewport = new THREE.Vector4();
  constructor() {
    this.canvas.width = 960;
    this.canvas.height = 720;
    this.ctx = this.canvas.getContext('2d')!;
    this.overlay = new THREE.CanvasTexture(this.canvas);
    this.overlay.colorSpace = THREE.SRGBColorSpace;
    this.ortho.position.z = 2;
    this.composite.background = new THREE.Color('#081201');
    this.tile = new THREE.Mesh(
      this.geometry,
      new THREE.ShaderMaterial({
        toneMapped: false,
        uniforms: {
          image: { value: this.target.texture },
          noise: { value: 0 },
          time: { value: 0 },
        },
        vertexShader:
          'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
        // Grünstichiges Monitorbild, bei schwachem Funk Rauschen und Zeilenversatz
        fragmentShader: `uniform sampler2D image; uniform float noise; uniform float time;
varying vec2 vUv;
#include <tonemapping_pars_fragment>
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + time*43.0) * 43758.5453); }
void main(){
  vec2 uv = vUv;
  float band = step(0.985 - noise*0.25, h(vec2(floor(uv.y*90.0), floor(time*14.0))));
  uv.x += band * (h(vec2(uv.y, time)) - 0.5) * 0.08 * noise;
  vec3 c = ACESFilmicToneMapping(texture2D(image, uv).rgb);
  float l = dot(c, vec3(0.3, 0.59, 0.11));
  c = mix(c, vec3(l*0.75, l*1.05, l*0.65), 0.55);
  float n = h(uv*vec2(960.0,600.0));
  c = mix(c, vec3(n*0.8, n, n*0.7), clamp(noise*0.85, 0.0, 0.9));
  c *= 0.92 + 0.08*sin(uv.y*900.0);
  gl_FragColor = vec4(c, 1.0);
}`,
      }),
    );
    this.tile.position.set(0, -10, 0);
    this.tile.scale.set(912, 570, 1);
    this.label = new THREE.Mesh(
      this.geometry,
      new THREE.MeshBasicMaterial({
        map: this.overlay,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.label.scale.set(960, 720, 1);
    this.label.renderOrder = 10;
    this.composite.add(this.tile, this.label);
  }
  private drawOverlay(d: DroneState, now: number, dockDistance: number, aimed: boolean) {
    const c = this.ctx;
    c.clearRect(0, 0, 960, 720);
    c.fillStyle = '#192f0a';
    c.fillRect(0, 0, 960, 70);
    c.fillRect(0, 650, 960, 70);
    const text = (s: string, x: number, y: number, size = 24, color = '#c6ffa0') => {
      c.fillStyle = color;
      c.font = '600 ' + size + 'px Arial';
      c.fillText(tr(s), x, y);
    };
    text('DROHNE / AUFKLÄRUNG', 24, 44, 28);
    const status =
      d.phase === 'rtb'
        ? 'RÜCKKEHR'
        : d.phase === 'landing'
          ? 'LANDUNG'
          : d.phase === 'spinup' || d.phase === 'launch'
            ? 'START'
            : 'FLUG';
    text(status, 760, 44, 26, d.phase === 'rtb' ? '#efbd68' : '#98ff53');
    // Fadenkreuz
    c.strokeStyle = aimed ? '#ff5a40' : '#9fe03a';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(450, 365);
    c.lineTo(470, 365);
    c.moveTo(490, 365);
    c.lineTo(510, 365);
    c.moveTo(480, 335);
    c.lineTo(480, 355);
    c.moveTo(480, 375);
    c.lineTo(480, 395);
    c.stroke();
    const alt = Math.max(0, d.pos.y + 2.6);
    const lines = [
      'HÖHE ' + alt.toFixed(0) + ' m',
      'ABSTAND ' + dockDistance.toFixed(0) + ' m',
      'AKKU ' + Math.round(d.battery * 100) + ' %',
      'FUNK ' + Math.round(d.signal * 100) + ' %',
    ];
    lines.forEach((l, i) =>
      text(
        l,
        24 + i * 236,
        695,
        23,
        (i === 2 && d.battery < 0.2) || (i === 3 && d.signal < 0.35) ? '#efbd68' : '#c6ffa0',
      ),
    );
    if (d.mark) text('ZIEL MARKIERT · KANONEN AUSGERICHTET', 24, 96, 22, '#ff8a70');
    if (d.rtbReason === 'battery')
      text('AKKU LEER – AUTOMATISCHE RÜCKKEHR', 24, 128, 22, '#efbd68');
    if (d.rtbReason === 'signal')
      text('FUNK VERLOREN – AUTOMATISCHE RÜCKKEHR', 24, 128, 22, '#efbd68');
    drawDisplaySurface(c, now / 1000, false, 6, true);
    this.overlay.needsUpdate = true;
  }
  /** Rendert höchstens 30 Bilder/s, nur wenn der Monitor sichtbar ist. */
  update(
    renderer: THREE.WebGLRenderer,
    world: THREE.Scene,
    camera: THREE.Camera,
    d: DroneState,
    now: number,
    dockDistance: number,
    aimed: boolean,
    hide: () => () => void,
  ) {
    if (now - this.lastCapture < 33) return;
    this.lastCapture = now;
    const oldTarget = renderer.getRenderTarget(),
      oldAuto = renderer.autoClear,
      oldShadows = renderer.shadowMap.autoUpdate;
    renderer.getViewport(this.viewport);
    const restore = hide();
    try {
      renderer.autoClear = true;
      renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(this.target);
      renderer.render(world, camera);
      this.tile.material.uniforms.noise.value =
        Math.max(0, 1 - d.signal * 1.6) + (d.phase === 'spinup' ? 0.5 : 0);
      this.tile.material.uniforms.time.value = now / 1000;
      this.drawOverlay(d, now, dockDistance, aimed);
      renderer.setRenderTarget(this.output);
      renderer.render(this.composite, this.ortho);
    } finally {
      restore();
      renderer.shadowMap.autoUpdate = oldShadows;
      renderer.autoClear = oldAuto;
      renderer.setRenderTarget(oldTarget);
      renderer.setViewport(this.viewport);
    }
  }
  dispose() {
    this.target.dispose();
    this.output.dispose();
    this.overlay.dispose();
    this.geometry.dispose();
    this.tile.material.dispose();
    this.label.material.dispose();
  }
}
export const DRONE_FOV = 70 * RAD;
