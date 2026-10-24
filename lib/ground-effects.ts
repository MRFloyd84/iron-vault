// Spuren am Boden: Staub- bzw. Spritzwolken beim Aufsetzen und Fußabdrücke,
// die langsam verblassen. Alles aus Pools – keine Neuanlage zur Laufzeit.
import * as THREE from 'three';
import { hash } from './display-aging';

const DUST_PER_STEP = 36;
const DUST_POOL = DUST_PER_STEP * 10;
const DUST_LIFE = 2.2;

export class DustPuffs {
  points: THREE.Points;
  private material: THREE.ShaderMaterial;
  private origin: THREE.BufferAttribute;
  private velocity: THREE.BufferAttribute;
  private birth: THREE.BufferAttribute;
  private next = 0;
  private count = 0;

  constructor(scene: THREE.Scene) {
    const g = new THREE.BufferGeometry();
    this.origin = new THREE.BufferAttribute(new Float32Array(DUST_POOL * 3), 3);
    this.velocity = new THREE.BufferAttribute(new Float32Array(DUST_POOL * 3), 3);
    this.birth = new THREE.BufferAttribute(new Float32Array(DUST_POOL).fill(-1e4), 1);
    for (const a of [this.origin, this.velocity, this.birth]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.origin);
    g.setAttribute('aVelocity', this.velocity);
    g.setAttribute('aBirth', this.birth);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0x8f8676) },
        uOpacity: { value: 0.5 },
        uRise: { value: 1 },
        uScale: { value: 300 },
      },
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute vec3 aVelocity; attribute float aBirth;
        uniform float uTime; uniform float uRise; uniform float uScale;
        varying float vFade;
        void main(){
          float age = uTime - aBirth;
          float t = clamp(age / ${DUST_LIFE.toFixed(1)}, 0.0, 1.0);
          // Schnell ausbreiten, dann in der Luft stehen bleiben und langsam steigen.
          float spread = 1.0 - exp(-age * 3.2);
          vec3 p = position + aVelocity * spread + vec3(0.0, uRise * (0.35 * spread + 0.25 * age), 0.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float size = 0.9 + 2.6 * spread;
          gl_PointSize = age < 0.0 || t >= 1.0 ? 0.0 : size * uScale / -mv.z;
          vFade = (1.0 - t) * smoothstep(0.0, 0.08, age);
        }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uOpacity; varying float vFade;
        void main(){
          vec2 d = gl_PointCoord - 0.5;
          float r = dot(d, d) * 4.0;
          if (r > 1.0) discard;
          float a = (1.0 - r) * (1.0 - r) * vFade * uOpacity;
          gl_FragColor = vec4(uColor, a);
        }`,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.name = 'Footfall dust';
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    scene.add(this.points);
  }

  /** Neue Wolke am Fuß. `wet`: statt Staub kurze, dunkle Wasserspritzer. */
  spawn(x: number, y: number, z: number, strength: number, time: number, seed: number) {
    for (let i = 0; i < DUST_PER_STEP; i++) {
      const k = this.next;
      this.next = (this.next + 1) % DUST_POOL;
      const a = hash(seed, i, 1) * Math.PI * 2,
        r = 0.9 + 1.4 * hash(seed, i, 2);
      this.origin.setXYZ(k, x + Math.cos(a) * 0.8, y + 0.1, z + Math.sin(a) * 0.8);
      const out = (1.2 + 2.4 * hash(seed, i, 3)) * strength;
      this.velocity.setXYZ(
        k,
        Math.cos(a) * out * r * 0.6,
        0.15 * hash(seed, i, 4),
        Math.sin(a) * out * r * 0.6,
      );
      this.birth.setX(k, time - hash(seed, i, 5) * 0.06);
    }
    for (const a of [this.origin, this.velocity, this.birth]) a.needsUpdate = true;
    this.count++;
  }

  update(time: number, light: number, wet: number, pixelScale: number) {
    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uScale.value = pixelScale;
    // Bei Nacht dunkler, bei Nässe dunkle, flache Spritzer statt hellem Staub.
    u.uColor.value
      .setRGB(0.56, 0.52, 0.46)
      .lerp(new THREE.Color(0.2, 0.2, 0.21), wet)
      .multiplyScalar(0.25 + 0.75 * light);
    u.uOpacity.value = THREE.MathUtils.lerp(0.5, 0.32, wet);
    u.uRise.value = 1 - 0.85 * wet;
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
    this.points.removeFromParent();
  }
}

// ---------- Fußabdrücke ----------

const PRINTS = 40;
/** Sekunden, bis ein Abdruck verschwunden ist. */
export const PRINT_LIFE = 120;

function footprintTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 192;
  const x = c.getContext('2d')!;
  // Graustufen-Alphamaske (weiß = Abdruck): Stahlsohle mit Fersenplatte und drei
  // gespreizten Zehenplatten, harte Kanten und Profilstollen – kein Tierpfoten-Look.
  const plate = (cx: number, cy: number, w: number, h: number, angle: number, r: number) => {
    x.save();
    x.translate(cx, cy);
    x.rotate(angle);
    x.beginPath();
    x.roundRect(-w / 2, -h / 2, w, h, r);
    x.fill();
    x.restore();
  };
  x.fillStyle = 'rgba(255,255,255,0.85)';
  plate(64, 148, 86, 66, 0, 10); // Fersenplatte
  plate(64, 104, 60, 30, 0, 4); // Mittelfuß
  x.fillStyle = 'rgba(255,255,255,0.8)';
  plate(30, 58, 26, 66, -0.2, 6); // Zehen
  plate(64, 46, 28, 76, 0, 6);
  plate(98, 58, 26, 66, 0.2, 6);
  // Eingedrückter Rand: etwas dunkler an den Kanten der Fersenplatte
  x.strokeStyle = 'rgba(255,255,255,1)';
  x.lineWidth = 3;
  x.strokeRect(22, 116, 84, 64);
  // Profilstollen ausschneiden
  x.globalCompositeOperation = 'destination-out';
  x.fillStyle = 'rgba(0,0,0,0.55)';
  for (let y = 124; y < 178; y += 12) x.fillRect(28, y, 72, 5);
  for (const [cx, a] of [
    [30, -0.2],
    [64, 0],
    [98, 0.2],
  ] as const) {
    x.save();
    x.translate(cx, 52);
    x.rotate(a);
    for (let y = -24; y < 28; y += 11) x.fillRect(-9, y, 18, 4);
    x.restore();
  }
  x.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export class Footprints {
  private meshes: THREE.Mesh[] = [];
  private materials: THREE.MeshStandardMaterial[] = [];
  private born: number[] = [];
  private next = 0;
  private texture: THREE.Texture | null;
  private geometry: THREE.PlaneGeometry;

  constructor(scene: THREE.Scene, width = 2.2, length = 3.1) {
    this.texture = footprintTexture();
    this.geometry = new THREE.PlaneGeometry(width, length);
    this.geometry.rotateX(-Math.PI / 2);
    for (let i = 0; i < PRINTS; i++) {
      const m = new THREE.MeshStandardMaterial({
        color: 0x241f19,
        roughness: 1,
        metalness: 0,
        alphaMap: this.texture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const mesh = new THREE.Mesh(this.geometry, m);
      mesh.name = 'Footprint';
      mesh.visible = false;
      mesh.receiveShadow = true;
      mesh.renderOrder = 1;
      scene.add(mesh);
      this.meshes.push(mesh);
      this.materials.push(m);
      this.born.push(-1e9);
    }
  }

  /** Abdruck auf den Boden legen; `yaw` = Blickrichtung des Mechs. */
  place(x: number, y: number, z: number, yaw: number, time: number) {
    const i = this.next;
    this.next = (this.next + 1) % PRINTS;
    const mesh = this.meshes[i];
    mesh.position.set(x, y + 0.03, z);
    mesh.rotation.set(0, yaw, 0);
    mesh.visible = true;
    this.born[i] = time;
  }

  update(time: number, wet: number) {
    for (let i = 0; i < PRINTS; i++) {
      const age = time - this.born[i];
      const m = this.materials[i];
      if (age > PRINT_LIFE || age < 0) {
        this.meshes[i].visible = false;
        continue;
      }
      // Kurz kräftig, dann über zwei Minuten verblassend. Nass: Wasser steht im Abdruck.
      m.opacity = 0.55 * Math.min(1, age * 4) * (1 - age / PRINT_LIFE) ** 1.5;
      m.roughness = 1 - 0.85 * wet;
      m.color.setHex(wet > 0.5 ? 0x15171a : 0x241f19);
    }
  }

  dispose() {
    for (const m of this.materials) m.dispose();
    for (const mesh of this.meshes) mesh.removeFromParent();
    this.geometry.dispose();
    this.texture?.dispose();
  }
}
