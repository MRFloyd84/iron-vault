// Regen: Regenschleier um die Kamera (im Scheinwerferkegel hell), nasse Oberflächen
// mit Pfützen, Tropfen auf der Kanzelscheibe und Wetter-Multiplikatoren für Licht/Nebel.
import * as THREE from 'three';
import { hash } from './display-aging';

/** Überdachter Bereich (Halle): dort regnet es nicht und es bleibt trocken. */
export const SHELTER = { minX: -18, maxX: 18, minZ: -34.9, maxZ: 11, top: 10.8 } as const;

export const insideShelter = (x: number, z: number) =>
  x > SHELTER.minX && x < SHELTER.maxX && z > SHELTER.minZ && z < SHELTER.maxZ;

/** Übergang ca. 3 s. */
export const RAIN_RATE = 1.2;

/** Multiplikatoren für die Szene bei Regenstärke r (0 = trocken wie bisher). */
export function weatherParams(r: number) {
  r = THREE.MathUtils.clamp(r, 0, 1);
  return {
    r,
    fogDensity: 1 + 1.6 * r,
    fogGrey: 0.45 * r,
    sky: 1 - 0.45 * r,
    hemi: 1 - 0.2 * r,
    sun: 1 - 0.8 * r,
    wet: r,
  };
}

// ---------- Regenschleier ----------

const DROPS = 9000;
const BOX = new THREE.Vector3(60, 26, 60);

export class RainField {
  lines: THREE.LineSegments;
  material: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene) {
    const seed = new Float32Array(DROPS * 2 * 3),
      end = new Float32Array(DROPS * 2);
    for (let i = 0; i < DROPS; i++) {
      for (let k = 0; k < 2; k++) {
        seed.set([hash(i, 1), hash(i, 2), hash(i, 3)], (i * 2 + k) * 3);
        end[i * 2 + k] = k;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(seed, 3));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCenter: { value: new THREE.Vector3() },
        uAmount: { value: 0 },
        uAmbient: { value: 0.35 },
        uMinDist: { value: 0.5 },
        uSpotPos: { value: [new THREE.Vector3(), new THREE.Vector3()] },
        uSpotDir: { value: [new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, -1)] },
        uSpotLevel: { value: 0 },
        uFloods: { value: [new THREE.Vector3(-19, 7.9, -59), new THREE.Vector3(-19, 7.9, -139)] },
        uFloodLevel: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute float aEnd;
        uniform float uTime; uniform vec3 uCenter; uniform float uAmount; uniform float uAmbient;
        uniform float uMinDist;
        uniform vec3 uSpotPos[2]; uniform vec3 uSpotDir[2]; uniform float uSpotLevel;
        uniform vec3 uFloods[2]; uniform float uFloodLevel;
        varying float vAlpha;
        const vec3 BOX = vec3(${BOX.x.toFixed(1)}, ${BOX.y.toFixed(1)}, ${BOX.z.toFixed(1)});
        const vec3 VEL = vec3(-1.6, -11.0, 0.9);
        void main(){
          // Tropfen fallen in einem Kasten, der mit der Kamera mitwandert (Wrap-around).
          vec3 p = position * BOX + VEL * uTime * (0.85 + 0.3 * position.y);
          p = mod(p - uCenter + BOX * 0.5, BOX) - BOX * 0.5 + uCenter;
          p += VEL * 0.045 * aEnd; // Länge des Streifens = Bewegungsunschärfe
          float lit = uAmbient;
          for (int i = 0; i < 2; i++) {
            vec3 d = p - uSpotPos[i];
            float dist = length(d);
            float cone = smoothstep(0.86, 0.95, dot(d / max(dist, 0.001), uSpotDir[i]));
            lit += uSpotLevel * cone * 9.0 / (1.0 + dist * 0.12);
            vec3 f = p - uFloods[i];
            lit += uFloodLevel * 1.5 / (1.0 + dot(f, f) * 0.006);
          }
          float near = length(p - cameraPosition);
          // Kein Regen in der Kanzel / unter dem Hallendach / im Boden.
          bool sheltered = p.x > ${SHELTER.minX.toFixed(1)} && p.x < ${SHELTER.maxX.toFixed(1)}
            && p.z > ${SHELTER.minZ.toFixed(1)} && p.z < ${SHELTER.maxZ.toFixed(1)} && p.y < ${SHELTER.top.toFixed(1)};
          float keep = step(fract(position.y * 7.31 + position.z * 3.77), uAmount * 1.0001) * step(uMinDist, near) * (sheltered ? 0.0 : 1.0)
            * step(-2.9, p.y);
          vAlpha = keep * min(1.0, lit) * (0.15 + 0.35 * aEnd) * smoothstep(30.0, 6.0, near);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        varying float vAlpha;
        void main(){
          if (vAlpha <= 0.002) discard;
          gl_FragColor = vec4(0.78, 0.82, 0.88, vAlpha);
        }`,
    });
    this.lines = new THREE.LineSegments(g, this.material);
    this.lines.name = 'Rain';
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 6;
    scene.add(this.lines);
  }

  update(
    time: number,
    camera: THREE.Vector3,
    amount: number,
    ambient: number,
    minDist: number,
    spots: THREE.SpotLight[],
    spotLevel: number,
    floodLevel: number,
  ) {
    const u = this.material.uniforms;
    this.lines.visible = amount > 0.001;
    u.uTime.value = time;
    u.uCenter.value.copy(camera);
    u.uAmount.value = amount;
    u.uAmbient.value = ambient;
    u.uMinDist.value = minDist;
    u.uSpotLevel.value = spotLevel;
    u.uFloodLevel.value = floodLevel;
    for (let i = 0; i < 2 && i < spots.length; i++) {
      u.uSpotPos.value[i].copy(spots[i].position);
      u.uSpotDir.value[i].copy(spots[i].target.position).sub(spots[i].position).normalize();
    }
  }

  dispose() {
    this.lines.geometry.dispose();
    this.material.dispose();
    this.lines.removeFromParent();
  }
}

// ---------- Nasse Oberflächen ----------

/**
 * Macht ein Bodenmaterial bei Regen nass: dunkler, glänzender, Pfützen in Senken
 * (Rauschmaske in Weltkoordinaten). Unter dem Hallendach bleibt es trocken.
 */
export function applyWetness(material: THREE.MeshStandardMaterial, wet: { value: number }) {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    shader.uniforms.uWet = wet;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vWetPos;\nvarying float vWetUp;',
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
vWetPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWetUp = normalize(mat3(modelMatrix) * objectNormal).y;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uWet; varying vec3 vWetPos; varying float vWetUp;
float wetHash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float wetNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wetHash(i), wetHash(i + vec2(1,0)), f.x), mix(wetHash(i + vec2(0,1)), wetHash(i + vec2(1,1)), f.x), f.y); }
float wetAmount = 0.0; float puddle = 0.0;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  bool dry = vWetPos.x > ${SHELTER.minX.toFixed(1)} && vWetPos.x < ${SHELTER.maxX.toFixed(1)}
    && vWetPos.z > ${SHELTER.minZ.toFixed(1)} && vWetPos.z < ${SHELTER.maxZ.toFixed(1)};
  wetAmount = dry ? 0.0 : uWet;
  float n = wetNoise(vWetPos.xz * 0.11) * 0.65 + wetNoise(vWetPos.xz * 0.43) * 0.35;
  puddle = wetAmount * smoothstep(0.6, 0.7, n) * smoothstep(0.9, 0.98, vWetUp);
  diffuseColor.rgb *= 1.0 - 0.38 * wetAmount - 0.3 * puddle;
}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.22, 0.75 * wetAmount);
roughnessFactor = mix(roughnessFactor, 0.02, puddle);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
normal = normalize(mix(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz), puddle));`,
      );
  };
  const key = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => key() + '|wet';
  material.needsUpdate = true;
}

// ---------- Tropfen auf der Kanzelscheibe ----------

type Drop = { x: number; y: number; r: number; vy: number; trail: number };

export class GlassRain {
  texture: THREE.CanvasTexture | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private drops: Drop[] = [];
  private last = 0;
  private seed = 1;

  constructor() {
    if (typeof document === 'undefined') return;
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = 400;
    this.ctx = c.getContext('2d');
    this.texture = new THREE.CanvasTexture(c);
    this.texture.colorSpace = THREE.SRGBColorSpace;
  }

  private rand() {
    return hash(this.seed++, 77);
  }

  /** Mit ~20 Hz neu zeichnen; `amount` 0…1; `light` hellt die Lichtreflexe auf. */
  update(time: number, amount: number, light: number) {
    if (!this.ctx || !this.texture || time - this.last < 0.05) return;
    const dt = Math.min(0.2, time - this.last);
    this.last = time;
    const c = this.ctx,
      w = c.canvas.width,
      h = c.canvas.height;
    // Neue Tropfen schlagen auf; große laufen ab, kleine bleiben haften.
    const spawn = Math.round(amount * 8 * this.rand() + amount * 2);
    for (let i = 0; i < spawn && this.drops.length < 380; i++)
      this.drops.push({
        x: this.rand() * w,
        y: this.rand() * h,
        r: 1 + this.rand() * this.rand() * 3.4,
        vy: 0,
        trail: 0,
      });
    // Ohne Regen trocknet die Scheibe langsam ab.
    if (amount < 0.05) this.drops.splice(0, Math.ceil(this.drops.length * 0.08));
    c.clearRect(0, 0, w, h);
    for (const d of this.drops) {
      if (d.r > 3.3) {
        d.vy = Math.min(90, d.vy + 160 * dt);
        d.y += d.vy * dt;
        d.x += (this.rand() - 0.5) * 2;
        d.trail = Math.min(28, d.trail + d.vy * dt);
      }
    }
    this.drops = this.drops.filter((d) => d.y < h + 10);
    const a = Math.min(0.9, 0.45 + 0.45 * light);
    for (const d of this.drops) {
      if (d.trail > 0) {
        c.strokeStyle = `rgba(200,215,230,${0.12 * a})`;
        c.lineWidth = d.r * 0.5;
        c.beginPath();
        c.moveTo(d.x, d.y - d.trail);
        c.lineTo(d.x, d.y);
        c.stroke();
      }
      const g = c.createRadialGradient(d.x - d.r * 0.3, d.y - d.r * 0.35, 0, d.x, d.y, d.r);
      // Tropfen bricht das Licht: heller Glanzpunkt, dunkler Rand.
      g.addColorStop(0, `rgba(245,250,255,${0.95 * a})`);
      g.addColorStop(0.35, `rgba(170,185,205,${0.45 * a})`);
      g.addColorStop(0.8, `rgba(10,14,20,${0.6 * a})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      c.fill();
    }
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture?.dispose();
  }
}

// ---------- Gewitter ----------

/** Helligkeit eines Blitzes `age` Sekunden nach dem Einschlag (0…1, Doppelflackern). */
export function lightningFlash(age: number, reduced: boolean) {
  if (age < 0 || age > 0.6) return 0;
  if (reduced) return 0.45 * (1 - age / 0.6); // ohne Flackern, nur sanft
  if (age < 0.05) return 1;
  if (age < 0.11) return 0.25;
  if (age < 0.19) return 0.85;
  return 0.85 * Math.pow(1 - (age - 0.19) / 0.41, 2);
}

export type Thunder = { variant: number; distance: number };

/**
 * Plant Blitze bei starkem Regen: der erste 6–14 s nach Regenbeginn, danach alle
 * 15–45 s. Der Donner folgt verzögert nach Entfernung (nah: 0,6 s, fern: ~5,6 s).
 * Deterministisch über einen Zähler – keine Zufallswerte im Zustand.
 */
export class Storm {
  private count = 0;
  private next = Infinity;
  private strikeAt = -1e9;
  private pending: (Thunder & { at: number })[] = [];

  update(time: number, rain: number, reduced = false): { flash: number; thunder: Thunder[] } {
    if (rain < 0.6) {
      this.next = Infinity;
    } else if (this.next === Infinity) {
      this.next = time + 6 + 8 * hash(this.count, 301);
    } else if (time >= this.next) {
      const distance = hash(this.count, 302);
      this.strikeAt = time;
      this.pending.push({
        at: time + 0.6 + 5 * distance,
        variant: distance < 0.45 ? 1 : 0,
        distance,
      });
      this.count++;
      this.next = time + 15 + 30 * hash(this.count, 303);
    }
    const thunder: Thunder[] = [];
    this.pending = this.pending.filter((p) => {
      if (time < p.at) return true;
      thunder.push({ variant: p.variant, distance: p.distance });
      return false;
    });
    return { flash: lightningFlash(time - this.strikeAt, reduced), thunder };
  }
}
