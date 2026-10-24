// IV-02, das ausgeschlachtete Schwesterschiff: abgestellt vor der Werkstatt im
// Testgelände, ein Arm abmontiert und auf Holzbohlen daneben abgelegt. Teilespender
// für IV-04 (daher der rot grundierte Ersatzrahmen in der Kanzel).
// Das Modell hat keine Texturen; Lack, Rost und Schmutz entstehen im Shader.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CockpitScene } from './cockpit-scene';
import { applyWetness } from './weather';
import { YARD } from './yard-scene';
import { SISTER } from './walking';

export const SISTER_ASSET = '/models/iv-02-sister.glb';
/** Höhe in Metern (gleiche Klasse wie IV-04, ca. 9,3 m). */
export const SISTER_HEIGHT = 9.1;

function paint(material: THREE.MeshStandardMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;\nvarying vec3 vObjN;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvObj = position;\nvObjN = normal;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vObj; varying vec3 vObjN;
float sHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float sNoise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sHash(i), sHash(i + vec3(1,0,0)), f.x), mix(sHash(i + vec3(0,1,0)), sHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(sHash(i + vec3(0,0,1)), sHash(i + vec3(1,0,1)), f.x), mix(sHash(i + vec3(0,1,1)), sHash(i + vec3(1,1,1)), f.x), f.y), f.z); }
float sRust = 0.0; float sChip = 0.0; float sDirt = 0.0;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  vec3 p = vObj;
  float big = sNoise(p * 7.0), mid = sNoise(p * 31.0), fine = sNoise(p * 140.0);
  // Grundlack: verblasstes Oliv, großflächig ungleich ausgeblichen
  vec3 olive = mix(vec3(0.13, 0.15, 0.10), vec3(0.20, 0.21, 0.15), big);
  // Rot grundierte Flicken (Teile bereits ausgebaut oder neu beschafft und nie lackiert)
  float primer = smoothstep(0.66, 0.7, sNoise(p * 4.2 + 3.1));
  vec3 base = mix(olive, vec3(0.24, 0.10, 0.07), primer);
  // Kanten: echte Krümmung → abgeplatzter Lack, blankes Metall
  // (geglättete Vertex-Normalen der vereinfachten Geometrie)
  float curv = length(fwidth(normalize(vObjN))) / max(length(fwidth(vObj)), 1e-5);
  sChip = smoothstep(150.0, 450.0, curv) * smoothstep(0.5, 0.75, mid * 0.6 + fine * 0.4);
  // Rost: von oben nach unten gezogene Läufer, dazu Flecken
  float streak = sNoise(vec3(p.x * 160.0, p.y * 9.0, p.z * 160.0));
  sRust = clamp(smoothstep(0.72, 0.95, streak) * 0.6 + smoothstep(0.78, 0.95, mid) * 0.4, 0.0, 1.0);
  // Schmutz und Schlamm: unten dicht
  sDirt = (1.0 - smoothstep(0.02, 0.3 + 0.1 * big, p.y)) * 0.85;
  vec3 c = base;
  c = mix(c, vec3(0.22, 0.11, 0.05) * (0.8 + 0.3 * fine), sRust * 0.7);
  c = mix(c, vec3(0.08, 0.07, 0.055), sDirt);
  c = mix(c, vec3(0.38, 0.37, 0.34) * (0.85 + 0.2 * fine), sChip * 0.8);
  diffuseColor.rgb = c;
}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = clamp(0.78 + 0.15 * sRust + 0.1 * sDirt - 0.4 * sChip, 0.0, 1.0);`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
metalnessFactor = mix(0.35, 0.85, sChip) * (1.0 - 0.6 * sRust);`,
      );
  };
  material.customProgramCacheKey = () => 'iv02-paint';
}

function signTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#c9b48a';
  x.fillRect(0, 0, 512, 256);
  x.fillStyle = '#a3261d';
  x.fillRect(0, 0, 512, 56);
  x.fillStyle = '#f1e6cf';
  x.font = 'bold 40px monospace';
  x.fillText('AUSSER DIENST', 92, 42);
  x.fillStyle = '#2a2520';
  x.font = 'bold 54px monospace';
  x.fillText('IV-02', 182, 128);
  x.font = '26px monospace';
  x.fillText('TEILESPENDER FÜR IV-04', 82, 176);
  x.fillText('KEIN ZUTRITT · KEIN STROM', 70, 214);
  for (let i = 0; i < 90; i++) {
    x.fillStyle = `rgba(90,60,30,${0.05 + (i % 5) * 0.03})`;
    x.fillRect((i * 97) % 512, (i * 41) % 256, 3 + (i % 7), 2 + (i % 4));
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class SisterMech {
  root = new THREE.Group();
  ready: Promise<void>;

  constructor(host: CockpitScene, wet: { value: number }, manager?: THREE.LoadingManager) {
    this.root.name = 'IV-02 sister mech (parked, stripped)';
    this.root.position.set(SISTER.x, YARD.floor, SISTER.z);
    this.root.rotation.y = SISTER.angle;
    host.scene.add(this.root);
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
    paint(material);
    applyWetness(material, wet);
    host.materials.push(material);
    this.ready = new GLTFLoader(manager)
      .loadAsync(SISTER_ASSET)
      .then((gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(SISTER_HEIGHT);
        model.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.material = material;
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        const arm = model.getObjectByName('detached_arm');
        this.root.add(model);
        if (arm) {
          // Abmontierter Arm liegt auf Holzbohlen neben dem Mech.
          const holder = new THREE.Group();
          holder.position.set(-6.2, 0.55, 1.5);
          holder.rotation.set(0, 0.5, Math.PI / 2 - 0.08);
          this.root.add(holder);
          arm.removeFromParent();
          arm.scale.setScalar(SISTER_HEIGHT);
          // Arm-Mitte (Modellkoordinaten etwa x 0,29, y 0,76) in den Halter verschieben
          arm.position.set(-0.29 * SISTER_HEIGHT, -0.76 * SISTER_HEIGHT, 0);
          holder.add(arm);
        }
        host.cleanup.push(() =>
          model.traverse((o) => {
            if (o instanceof THREE.Mesh) o.geometry.dispose();
          }),
        );
        this.root.updateMatrixWorld(true);
      })
      .catch((e) => console.warn('[IV-02] Modell nicht geladen:', e));
    // Holzbohlen unter dem Arm, Warnschild, Absperrung
    const wood = host.mat({ color: 0x5b4330, roughness: 0.95 });
    for (const dz of [-1.6, 0, 1.6])
      host.box(this.root, -6.2, 0.15, 1.5 + dz, 3.6, 0.3, 0.5, wood, 0.02);
    const tex = signTexture();
    host.textures.push(tex);
    const signMat = host.mat({ map: tex, roughness: 0.85 });
    const post = host.mat({ color: 0x3a3c38, metalness: 0.6, roughness: 0.6 });
    host.box(this.root, 4.6, 1.0, 5.6, 0.08, 2.0, 0.08, post, 0);
    host.box(this.root, 5.8, 1.0, 5.6, 0.08, 2.0, 0.08, post, 0);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), signMat);
    sign.position.set(5.2, 1.7, 5.66);
    this.root.add(sign);
    // Absperrband zwischen Pfosten
    const tapeMat = host.mat({ color: 0xc8a032, roughness: 0.7 });
    for (const [x0, z0, x1, z1] of [
      [-8.5, 5.6, 4.6, 5.6],
      [5.8, 5.6, 8, 5.6],
    ]) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      host.box(this.root, (x0 + x1) / 2, 1.05, (z0 + z1) / 2, len, 0.06, 0.01, tapeMat, 0);
    }
    host.box(this.root, -8.5, 0.6, 5.6, 0.08, 1.2, 0.08, post, 0);
    host.box(this.root, 8, 0.6, 5.6, 0.08, 1.2, 0.08, post, 0);
    this.root.updateMatrixWorld(true);
  }
}
