// Äußere Details des Mechs, ohne die GLB-Datei zu verändern:
//  - Drehkranz zwischen Oberkörper und Becken (ersetzt den schlichten schwarzen Zylinder)
//  - Verschleiß-Shader: matte, verwitterte Panzerung mit Staub, Schmutz und Regenschlieren
//  - Scheinwerfer an der Kanzel und eine Rundumleuchte auf dem Rücken
//
// Koordinaten hier sind Modellkoordinaten der GLB (1 Einheit ≈ 9,5 m, vorne = +Z).

import * as THREE from 'three';
import { hash } from './display-aging';

// ---------- Drehkranz ----------

function hazardTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 32;
  const x = c.getContext('2d')!;
  x.fillStyle = '#b58a2c';
  x.fillRect(0, 0, 256, 32);
  x.fillStyle = '#1c1c19';
  for (let i = -2; i < 18; i++) {
    x.beginPath();
    x.moveTo(i * 16, 32);
    x.lineTo(i * 16 + 8, 32);
    x.lineTo(i * 16 + 24, 0);
    x.lineTo(i * 16 + 16, 0);
    x.fill();
  }
  // abgeplatzte, verschmutzte Farbe
  for (let i = 0; i < 260; i++) {
    x.fillStyle = `rgba(40,36,30,${0.15 + 0.4 * hash(i, 1)})`;
    x.fillRect(hash(i, 2) * 256, hash(i, 3) * 32, 1 + hash(i, 4) * 5, 1 + hash(i, 5) * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(6, 1);
  return t;
}

/**
 * Mechanischer Drehkranz an der Hüfte. Etwas schlanker als das bisherige Lager (Radius 0,14
 * statt 0,166), damit er nicht wie ein Teller absteht. Höhe 0,08 um y = 0,565 deckt die Hüftfuge.
 */
export function buildWaistRing(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Waist bearing';
  const steel = new THREE.MeshStandardMaterial({
    color: 0x5a5f58,
    metalness: 0.65,
    roughness: 0.6,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x24282a,
    metalness: 0.55,
    roughness: 0.72,
  });
  const oily = new THREE.MeshStandardMaterial({ color: 0x3a3a34, metalness: 0.7, roughness: 0.42 });
  const stripes = hazardTexture();
  const hazard = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: stripes,
    metalness: 0.2,
    roughness: 0.8,
  });
  const cyl = (r: number, h: number, y: number, m: THREE.Material, seg = 48) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);
    mesh.position.y = y;
    group.add(mesh);
    return mesh;
  };
  // Kern mit Warnstreifen-Band, darüber/darunter Flansche.
  cyl(0.118, 0.056, 0, dark);
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1195, 0.1195, 0.014, 48, 1, true),
    hazard,
  );
  group.add(band);
  cyl(0.138, 0.012, 0.034, steel);
  cyl(0.13, 0.006, 0.025, oily);
  cyl(0.138, 0.012, -0.034, steel);
  cyl(0.13, 0.006, -0.025, oily);

  const dummy = new THREE.Object3D();
  const instanced = (
    geometry: THREE.BufferGeometry,
    m: THREE.Material,
    count: number,
    place: (i: number, d: THREE.Object3D) => void,
  ) => {
    const mesh = new THREE.InstancedMesh(geometry, m, count);
    for (let i = 0; i < count; i++) {
      dummy.position.set(0, 0, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      place(i, dummy);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    group.add(mesh);
  };
  // Zahnkranz am unteren Flansch.
  instanced(new THREE.BoxGeometry(0.009, 0.012, 0.012), oily, 64, (i, d) => {
    const a = (i / 64) * Math.PI * 2;
    d.position.set(Math.sin(a) * 0.139, -0.021, Math.cos(a) * 0.139);
    d.rotation.y = a;
  });
  // Schraubenkränze oben und unten.
  const bolt = new THREE.CylinderGeometry(0.0035, 0.0035, 0.004, 6);
  for (const y of [0.0405, -0.0405])
    instanced(bolt, steel, 32, (i, d) => {
      const a = ((i + 0.5) / 32) * Math.PI * 2;
      d.position.set(Math.sin(a) * 0.131, y, Math.cos(a) * 0.131);
    });
  // Sechs Schwenkantriebe rund um den Kern.
  const motor = new THREE.CylinderGeometry(0.011, 0.011, 0.04, 12);
  const cap = new THREE.CylinderGeometry(0.013, 0.013, 0.008, 12);
  const capMat = new THREE.MeshStandardMaterial({
    color: 0x8d4a22,
    metalness: 0.3,
    roughness: 0.7,
  });
  const motorPlace = (y: number) => (i: number, d: THREE.Object3D) => {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    d.position.set(Math.sin(a) * 0.125, y, Math.cos(a) * 0.125);
  };
  instanced(motor, dark, 6, motorPlace(0));
  instanced(cap, capMat, 6, motorPlace(0.02));
  group.position.y = 0.565;
  group.userData.textures = stripes ? [stripes] : [];
  return group;
}

// ---------- Verschleiß-Shader ----------

/** Merkt sich für jeden Vertex seine Ruheposition im Modell (für stillstehenden Schmutz). */
export function bakeRestPositions(model: THREE.Object3D) {
  model.updateMatrixWorld(true);
  const toModel = new THREE.Matrix4();
  const inverseModel = model.matrixWorld.clone().invert();
  const v = new THREE.Vector3();
  model.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh) return;
    const g = o.geometry as THREE.BufferGeometry;
    if (g.getAttribute('aRest')) return;
    const p = g.getAttribute('position');
    if (!p) return;
    toModel.multiplyMatrices(inverseModel, o.matrixWorld);
    const rest = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(toModel);
      rest[i * 3] = v.x;
      rest[i * 3 + 1] = v.y;
      rest[i * 3 + 2] = v.z;
    }
    g.setAttribute('aRest', new THREE.BufferAttribute(rest, 3));
  });
}

/**
 * Macht das importierte Material matt und alt: weniger Spiegelung, verblasste Farbe,
 * Staub/Schlamm an Beinen und Füßen, dunkle Regenschlieren unter Kanten.
 * `amount` 0…1 steuert die Stärke (Uniform, zur Laufzeit änderbar).
 */
export function applyWear(material: THREE.MeshStandardMaterial, amount = 1) {
  const uniforms = { uWear: { value: amount } };
  material.userData.wear = uniforms.uWear;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWear = uniforms.uWear;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aRest;\nvarying vec3 vRest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = aRest;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uWear;
varying vec3 vRest;
float ivHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float ivNoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(ivHash(i), ivHash(i + vec3(1,0,0)), f.x), mix(ivHash(i + vec3(0,1,0)), ivHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(ivHash(i + vec3(0,0,1)), ivHash(i + vec3(1,0,1)), f.x), mix(ivHash(i + vec3(0,1,1)), ivHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float ivMud = 0.0; float ivGrime = 0.0;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  float big = ivNoise(vRest * 9.0);
  float fine = ivNoise(vRest * 46.0);
  // Schlamm und Staub: unten dicht, nach oben ausgefranst auslaufend (Modellhöhe 0…1).
  ivMud = (1.0 - smoothstep(0.02, 0.26 + 0.12 * big, vRest.y + 0.05 * fine)) * uWear;
  // Regenschlieren: in der Höhe lang gezogenes Rauschen.
  float streak = ivNoise(vec3(vRest.x * 70.0, vRest.y * 4.0, vRest.z * 70.0));
  ivGrime = (0.25 + 0.55 * smoothstep(0.55, 0.9, streak) + 0.3 * smoothstep(0.6, 0.85, big)) * uWear;
  float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum) * vec3(1.02, 1.0, 0.94), 0.22 * uWear);
  diffuseColor.rgb *= 1.0 - 0.28 * ivGrime;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.10, 0.075) * (0.75 + 0.5 * fine), ivMud * 0.7);
}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = clamp(max(roughnessFactor, 0.48) + 0.22 * ivGrime + 0.45 * ivMud, 0.0, 1.0);`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
metalnessFactor *= 1.0 - 0.45 * ivMud - 0.15 * ivGrime;`,
      );
  };
  material.customProgramCacheKey = () => 'iron-vault-wear';
  material.needsUpdate = true;
}

// ---------- Scheinwerfer und Rundumleuchte ----------

/** Zwei Doppelscheinwerfer an den Flanken der Kanzel, leicht nach unten geneigt. */
export const HEADLIGHT_MOUNTS = [
  { x: -0.128, y: 0.705, z: 0.135 },
  { x: 0.128, y: 0.705, z: 0.135 },
] as const;
export const HEADLIGHT_TILT = 0.28; // rad nach unten: Lichtfleck ca. 20 m vor dem Mech
/** Rundumleuchte: auf einem Winkelhalter an der Rückenplatte (Platte liegt bei z ≈ -0,25). */
export const BEACON_MOUNT = { x: 0.06, y: 0.888, z: -0.276 } as const;

/**
 * Helligkeit der Scheinwerfer 0…1. Alte Lampen: beim Einschalten kurz unruhig,
 * dann ruhig. Ohne Bordstrom aus.
 */
export function headlightLevel(
  on: boolean,
  powered: boolean,
  sinceSwitch: number,
  reduced: boolean,
) {
  if (!on || !powered) return 0;
  if (reduced || sinceSwitch > 0.9) return 1;
  const frame = Math.floor(sinceSwitch * 24);
  const ramp = Math.min(1, 0.35 + sinceSwitch / 0.9);
  return hash(frame, 91) < 0.45 ? 0.1 * ramp : ramp;
}

/** Rundumleuchte: dreht, solange sich der Mech bewegt, und läuft 2 s nach. */
export function beaconLevel(seconds: number, movingFor: number, stoppedFor: number) {
  if (movingFor <= 0 && stoppedFor > 2) return 0;
  const fade = movingFor > 0 ? Math.min(1, movingFor / 0.3) : Math.max(0, 1 - stoppedFor / 2);
  // Umlaufender Spiegel: zwei kurze helle Durchgänge pro Umdrehung.
  const a = (seconds * 1.6) % 1;
  return fade * (0.15 + 0.85 * Math.pow(Math.abs(Math.cos(a * Math.PI * 2)), 6));
}

function beamMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uStrength: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: `
      varying float vAlong; varying vec3 vN; varying vec3 vV;
      void main(){
        vAlong = uv.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uStrength; varying float vAlong; varying vec3 vN; varying vec3 vV;
      void main(){
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
        float a = clamp(uStrength * pow(vAlong, 1.8) * edge * 0.45, 0.0, 1.0);
        gl_FragColor = vec4(1.0, 0.92, 0.75, a);
      }`,
  });
}

export class MechLights {
  /** Echte Lichtquellen in der Szene (bleiben immer drin; aus = Intensität 0, kein Shader-Neubau). */
  spots: THREE.SpotLight[] = [];
  beaconLight: THREE.PointLight;
  private anchors: THREE.Object3D[] = [];
  private beaconAnchor = new THREE.Object3D();
  private beaconSpinner = new THREE.Group();
  private lens: THREE.MeshStandardMaterial;
  private beaconDome: THREE.MeshStandardMaterial;
  private beam: THREE.ShaderMaterial;
  private tmp = new THREE.Vector3();
  private dir = new THREE.Vector3();
  disposables: { dispose(): void }[] = [];

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < 2; i++) {
      const spot = new THREE.SpotLight(0xffe4b8, 0, 95, 0.4, 0.55, 1.6);
      spot.name = 'Mech headlight ' + i;
      scene.add(spot, spot.target);
      this.spots.push(spot);
    }
    this.beaconLight = new THREE.PointLight(0xffa21f, 0, 22, 1.6);
    this.beaconLight.name = 'Mech beacon';
    scene.add(this.beaconLight);
    this.lens = new THREE.MeshStandardMaterial({
      color: 0x2a2c28,
      emissive: 0xfff0d2,
      emissiveIntensity: 0,
      metalness: 0.2,
      roughness: 0.25,
      toneMapped: false,
    });
    this.beaconDome = new THREE.MeshStandardMaterial({
      color: 0x6a3d08,
      emissive: 0xffa21f,
      emissiveIntensity: 0,
      roughness: 0.3,
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
    });
    this.beam = beamMaterial();
    this.disposables.push(this.lens, this.beaconDome, this.beam);
  }

  /** Hängt Gehäuse, Linsen und Lichtkegel an den Oberkörper des geladenen Modells. */
  attach(torso: THREE.Object3D) {
    const housing = new THREE.MeshStandardMaterial({
      color: 0x34372f,
      metalness: 0.55,
      roughness: 0.62,
    });
    const box = new THREE.BoxGeometry(0.052, 0.03, 0.03);
    const bracket = new THREE.BoxGeometry(0.012, 0.012, 0.03);
    const lensGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.004, 20);
    lensGeo.rotateX(Math.PI / 2);
    const ringGeo = new THREE.TorusGeometry(0.0118, 0.0018, 6, 20);
    // Lichtkegel: Spitze im Ursprung, öffnet sich nach +Z.
    const length = 2.4;
    const beamGeo = new THREE.ConeGeometry(Math.tan(0.36) * length, length, 32, 1, true);
    beamGeo.translate(0, -length / 2, 0);
    beamGeo.rotateX(-Math.PI / 2);
    this.disposables.push(housing, box, bracket, lensGeo, ringGeo, beamGeo);
    for (const m of HEADLIGHT_MOUNTS) {
      const mount = new THREE.Group();
      mount.position.set(m.x, m.y, m.z);
      mount.rotation.x = HEADLIGHT_TILT;
      torso.add(mount);
      mount.add(new THREE.Mesh(box, housing));
      const arm = new THREE.Mesh(bracket, housing);
      arm.position.set(-Math.sign(m.x) * 0.024, 0, -0.022);
      mount.add(arm);
      for (const dx of [-0.0125, 0.0125]) {
        const lens = new THREE.Mesh(lensGeo, this.lens);
        lens.position.set(dx, 0, 0.0155);
        const ring = new THREE.Mesh(ringGeo, housing);
        ring.position.set(dx, 0, 0.0158);
        mount.add(lens, ring);
      }
      const beam = new THREE.Mesh(beamGeo, this.beam);
      beam.position.z = 0.018;
      beam.renderOrder = 5;
      beam.frustumCulled = false;
      mount.add(beam);
      const anchor = new THREE.Object3D();
      anchor.position.z = 0.02;
      mount.add(anchor);
      this.anchors.push(anchor);
    }
    // Rundumleuchte
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.01, 16), housing);
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.0125, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      this.beaconDome,
    );
    dome.position.y = 0.005;
    const mirror = new THREE.Mesh(
      new THREE.BoxGeometry(0.016, 0.009, 0.002),
      new THREE.MeshBasicMaterial({ color: 0xffd28a, toneMapped: false }),
    );
    mirror.position.y = 0.009;
    this.beaconSpinner.add(mirror);
    this.beaconAnchor.position.set(BEACON_MOUNT.x, BEACON_MOUNT.y, BEACON_MOUNT.z);
    // Winkelhalter: Plattform unter der Leuchte plus Stützblech an der Rückenplatte.
    const platform = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.005, 0.034), housing);
    platform.position.set(0, -0.0075, 0.012);
    const gusset = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.034, 0.005), housing);
    gusset.position.set(0, -0.024, 0.0265);
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.005, 0.034), housing);
    strut.position.set(0, -0.022, 0.012);
    strut.rotation.x = -0.75;
    this.beaconAnchor.add(platform, gusset, strut, base, dome, this.beaconSpinner);
    this.disposables.push(platform.geometry, gusset.geometry, strut.geometry);
    torso.add(this.beaconAnchor);
    this.disposables.push(
      base.geometry,
      dome.geometry,
      mirror.geometry,
      mirror.material as THREE.Material,
    );
  }

  /**
   * Pro Bild: Lichtquellen an die Gehäuse heften und Helligkeiten setzen.
   * `night` 0…1 macht die Lichtkegel in der Luft sichtbar.
   */
  update(level: number, beacon: number, night: number, seconds: number, outside: boolean) {
    for (let i = 0; i < this.spots.length; i++) {
      const spot = this.spots[i],
        anchor = this.anchors[i];
      spot.intensity = 5200 * level;
      if (!anchor) continue;
      anchor.updateWorldMatrix(true, false);
      anchor.getWorldPosition(this.tmp);
      spot.position.copy(this.tmp);
      this.dir.set(0, 0, 1).transformDirection(anchor.matrixWorld);
      spot.target.position.copy(this.tmp).addScaledVector(this.dir, 30);
    }
    this.lens.emissiveIntensity = 0.15 + 5.5 * level;
    this.beam.uniforms.uStrength.value = outside ? level * (0.12 + 0.88 * night) : 0;
    this.beaconDome.emissiveIntensity = 0.1 + 6 * beacon;
    this.beaconSpinner.rotation.y = seconds * 1.6 * Math.PI * 2;
    this.beaconLight.intensity = 60 * beacon;
    this.beaconAnchor.updateWorldMatrix(true, false);
    this.beaconAnchor.getWorldPosition(this.beaconLight.position);
    this.beaconLight.position.y += 0.4;
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}
