// Verschleiß für die Pilotenkanzel: ein Shader-Zusatz für alle undurchsichtigen
// Kanzelmaterialien. Er arbeitet in Kanzelkoordinaten (uCabinInv), damit Schmutz und
// Abrieb fest an der Kanzel kleben, auch wenn der Mech geht oder den Torso dreht.
//
//  - Kantenabrieb: abgerundete Kanten (starker Normalenwechsel) verlieren den Lack,
//    darunter blankes, leicht glänzendes Metall.
//  - Schmutz: unten in der Kanzel dichter, dazu fleckige Ablagerungen.
//  - Verblasste, leicht vergilbte Farben; feine Kratzer.
//  - Abgegriffene Bedienzone: auf Höhe der Konsolen vor dem Sitz blank gewetzt.
import * as THREE from 'three';

export const cabinWear = {
  uCabinInv: { value: new THREE.Matrix4() },
  uWear: { value: 1 },
};

export function applyCabinWear(material: THREE.MeshStandardMaterial) {
  if (material.userData.cabinWear) return;
  material.userData.cabinWear = true;
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    shader.uniforms.uCabinInv = cabinWear.uCabinInv;
    shader.uniforms.uCabWear = cabinWear.uWear;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform mat4 uCabinInv;\nvarying vec3 vCab;\nvarying vec3 vCabN;',
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
{
  mat4 toCab = uCabinInv * modelMatrix;
  vCab = (toCab * vec4(transformed, 1.0)).xyz;
  vCabN = normalize(mat3(toCab) * objectNormal);
}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uCabWear; varying vec3 vCab; varying vec3 vCabN;
float cwHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float cwNoise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(cwHash(i), cwHash(i + vec3(1,0,0)), f.x), mix(cwHash(i + vec3(0,1,0)), cwHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(cwHash(i + vec3(0,0,1)), cwHash(i + vec3(1,0,1)), f.x), mix(cwHash(i + vec3(0,1,1)), cwHash(i + vec3(1,1,1)), f.x), f.y), f.z); }
float cwChip = 0.0; float cwGrime = 0.0; float cwPolish = 0.0;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  float n1 = cwNoise(vCab * 2.2);
  float n2 = cwNoise(vCab * 13.0);
  float n3 = cwNoise(vCab * 47.0);
  // Kanten: echte Krümmung (Normalenänderung je Weglänge), unabhängig vom Abstand.
  // Abgerundete Kanten der Bauteile haben Radien von 1–5 cm (Krümmung > 15).
  float curv = length(fwidth(vCabN)) / max(length(fwidth(vCab)), 1e-4);
  float edge = smoothstep(12.0, 30.0, curv);
  cwChip = edge * smoothstep(0.58, 0.8, n2 * 0.55 + n3 * 0.45) * uCabWear;
  // Schmutz: unten dichter (Boden/Fußraum), dazu fleckige Ablagerungen
  float low = 1.0 - smoothstep(-1.3, 0.9, vCab.y);
  cwGrime = clamp(low * 0.75 + smoothstep(0.55, 0.85, n1) * 0.45 + (n3 - 0.5) * 0.15, 0.0, 1.0) * uCabWear;
  // Bedienzone vor dem Sitz: Hände wetzen Lack und Schmutz ab
  float reach = smoothstep(2.2, 0.6, length(vCab.xz - vec2(0.0, 1.9))) * smoothstep(-0.4, 0.6, vCab.y) * smoothstep(2.0, 1.0, vCab.y);
  cwPolish = reach * smoothstep(0.35, 0.65, n2) * uCabWear;
  float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum) * vec3(1.06, 1.0, 0.86), 0.32 * uCabWear);
  diffuseColor.rgb *= 1.0 - 0.36 * cwGrime * (1.0 - cwPolish);
  // feine Kratzer
  float sc = smoothstep(0.965, 1.0, cwNoise(vec3(vCab.x * 95.0 + vCab.y * 9.0, vCab.y * 3.5, vCab.z * 95.0)));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.45, 0.44, 0.41), sc * 0.3 * uCabWear);
  // abgeplatzter Lack: blankes Metall
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.41, 0.38) * (0.85 + 0.3 * n3), max(cwChip * 0.85, cwPolish * 0.25));
}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor + 0.22 * cwGrime, 0.0, 1.0);
roughnessFactor = mix(roughnessFactor, 0.38, max(cwChip, cwPolish * 0.5));`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
metalnessFactor = mix(metalnessFactor, 0.8, max(cwChip, cwPolish * 0.4));`,
      );
  };
  const key = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => key() + '|cabin-wear';
  material.needsUpdate = true;
}

/** Alle undurchsichtigen, nicht selbstleuchtenden Standardmaterialien unter `root`. */
export function wearCabin(root: THREE.Object3D) {
  const seen = new Set<THREE.Material>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (seen.has(m)) continue;
      seen.add(m);
      if (!(m instanceof THREE.MeshStandardMaterial) || m.transparent) continue;
      if (m.emissive.getHex() !== 0) continue; // Leuchtmittel
      applyCabinWear(m);
    }
  });
  return seen.size;
}

/**
 * Helligkeit der Röhre mit Wackelkontakt (0…1): meist an, zuckt gelegentlich,
 * fällt etwa alle 20–40 s für 1–3 s aus und flackert beim Wiederzünden.
 */
export function faultyTube(t: number, reduced = false) {
  if (reduced) return 0.85;
  const cycle = 30,
    k = Math.floor(t / cycle),
    phase = t - k * cycle;
  const outAt = 8 + 16 * hashF(k, 1),
    outLen = 1 + 2 * hashF(k, 2);
  if (phase > outAt && phase < outAt + outLen) {
    // Wiederzünden: letzte halbe Sekunde stotternd
    const restart = phase > outAt + outLen - 0.5;
    return restart && hashF(Math.floor(t * 25), 3) < 0.5 ? 0.9 : 0.03;
  }
  if (hashF(Math.floor(t * 14), 4) < 0.05) return 0.25; // kurzes Zucken
  return 0.82 + 0.06 * Math.sin(t * 50);
}
function hashF(a: number, b: number) {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
