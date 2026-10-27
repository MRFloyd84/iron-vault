// Sensoren im Sensorkopf der Drohne: Fernsehkamera (normal), Wärmebild und Nachtsicht.
//
// Wärmebild: Für ein Bild bekommen alle festen Körper ein Ersatzmaterial, das ihre
// Temperatur als Grauwert ausgibt (Mech und Fahrzeuge warm, Gelände kühl, tagsüber
// sonnenwarme Flächen etwas heller). Feuer, Funken und Rauch behalten ihr eigenes Bild und
// werden über die Helligkeit übernommen. Danach färbt ein Vollbild-Shader "weiß = heiß".
// Nachtsicht: normales Bild als Restlichtverstärker – stark aufgehellt, grün, verrauscht.
//
// Nur in der Drohnensicht aktiv; Kameramonitor und Cockpit bleiben unverändert.
import * as THREE from 'three';

export type SensorMode = 'tv' | 'thermal' | 'night';
export const SENSOR_MODES: SensorMode[] = ['tv', 'thermal', 'night'];
export const SENSOR_LABEL: Record<SensorMode, string> = {
  tv: 'TV',
  thermal: 'WÄRMEBILD',
  night: 'NACHTSICHT',
};

/** Temperatur 0…1 eines Objekts: eigener Wert oder der eines Elternteils, sonst Umgebung. */
export const HEAT_AMBIENT = 0.12;
export function heatOf(o: THREE.Object3D) {
  for (let p: THREE.Object3D | null = o; p; p = p.parent)
    if (typeof p.userData.heat === 'number') return p.userData.heat as number;
  return HEAT_AMBIENT;
}

const heatVertex = /* glsl */ `
#include <common>
#include <batching_pars_vertex>
#include <skinning_pars_vertex>
varying vec3 vNormalView;
varying float vDepth;
void main() {
  #include <batching_vertex>
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
  vNormalView = normalize(transformedNormal);
  vDepth = -mvPosition.z;
}`;
const heatFragment = /* glsl */ `
uniform float uHeat;
uniform vec3 uSun;
uniform float uDay;
varying vec3 vNormalView;
varying float vDepth;
void main() {
  vec3 n = normalize(vNormalView);
  if (!gl_FrontFacing) n = -n;
  // Sonnenwärme auf zugewandten Flächen, etwas Form durch die Neigung
  float sun = max(dot(n, uSun), 0.0) * uDay;
  float t = uHeat + sun * 0.08 + n.y * 0.02;
  // Ferne Flächen verschwimmen im Hintergrund (Luftfeuchte schluckt Wärmestrahlung)
  t = mix(t, 0.08, smoothstep(250.0, 1400.0, vDepth));
  gl_FragColor = vec4(vec3(clamp(t, 0.0, 1.0)), 1.0);
}`;

const quadVertex = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const quadFragment = /* glsl */ `
uniform sampler2D tImage;
uniform float uMode;
uniform float uTime;
uniform float uGain;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 c = texture2D(tImage, vUv).rgb;
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  float grain = hash(vUv * vec2(1931.0, 1171.0) + fract(uTime * 7.3)) - 0.5;
  vec2 d = vUv - 0.5;
  float vignette = 1.0 - smoothstep(0.35, 0.75, length(d * vec2(1.25, 1.0)));
  vec3 outc;
  if (uMode < 0.5) {
    // Wärmebild, weiß = heiß; leichte Kontrastkurve und Sensorrauschen
    // Gelände bleibt als dunkles Grau sichtbar, warme Körper hell mit erkennbarer Form
    float t = pow(clamp(lum, 0.0, 1.0), 0.85);
    t += grain * 0.04;
    outc = vec3(t) * vec3(0.96, 1.0, 1.02);
    outc *= mix(0.82, 1.0, vignette);
  } else {
    // Restlichtverstärker: aufhellen, sättigen in Grün, Rauschen und Zeilen
    float a = 1.0 - exp(-lum * uGain);
    a += grain * 0.09;
    a *= 0.92 + 0.08 * sin(vUv.y * 900.0);
    outc = vec3(0.16, 1.0, 0.32) * a + vec3(0.02, 0.05, 0.02);
    outc *= mix(0.35, 1.0, vignette);
  }
  // Werte sind Anzeigewerte: vor der sRGB-Umrechnung des Renderers zurückrechnen
  gl_FragColor = vec4(pow(clamp(outc, 0.0, 1.0), vec3(2.2)), 1.0);
  #include <colorspace_fragment>
}`;

export class DroneSensor {
  mode: SensorMode = 'tv';
  private target: THREE.WebGLRenderTarget | null = null;
  private quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private quadScene = new THREE.Scene();
  private quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private heatMaterials = new Map<string, THREE.ShaderMaterial>();
  private sunView = new THREE.Vector3();
  private swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
  private hidden: THREE.Object3D[] = [];

  constructor() {
    this.quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: {
          tImage: { value: null },
          uMode: { value: 0 },
          uTime: { value: 0 },
          uGain: { value: 6 },
        },
        vertexShader: quadVertex,
        fragmentShader: quadFragment,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  /** Nächster Sensor (TV → Wärmebild → Nachtsicht → TV). */
  cycle() {
    this.mode = SENSOR_MODES[(SENSOR_MODES.indexOf(this.mode) + 1) % SENSOR_MODES.length];
    return this.mode;
  }

  private heatMaterial(heat: number, side: THREE.Side) {
    const key = heat.toFixed(2) + '|' + side;
    let m = this.heatMaterials.get(key);
    if (!m) {
      m = new THREE.ShaderMaterial({
        uniforms: {
          uHeat: { value: heat },
          uSun: { value: this.sunView },
          uDay: { value: 1 },
        },
        vertexShader: heatVertex,
        fragmentShader: heatFragment,
        side,
        toneMapped: false,
      });
      this.heatMaterials.set(key, m);
    }
    return m;
  }

  /**
   * Drohnensicht rendern. Im TV-Modus `false` (der Aufrufer rendert normal), sonst wird das
   * Sensorbild direkt auf den Bildschirm gezeichnet.
   */
  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    time: number,
    night: number,
    sunWorld: THREE.Vector3,
  ) {
    if (this.mode === 'tv') return false;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    if (!this.target || this.target.width !== size.x || this.target.height !== size.y) {
      this.target?.dispose();
      this.target = new THREE.WebGLRenderTarget(size.x, size.y, {
        type: THREE.HalfFloatType,
        samples: 4,
      });
    }
    const u = this.quad.material.uniforms;
    u.uTime.value = time;
    if (this.mode === 'thermal') {
      // Sonne im Kameraraum für die Erwärmung zugewandter Flächen
      camera.updateMatrixWorld();
      this.sunView.copy(sunWorld).normalize().transformDirection(camera.matrixWorldInverse);
      const day = 1 - night;
      for (const m of this.heatMaterials.values()) m.uniforms.uDay.value = day;
      const background = scene.background,
        fog = scene.fog;
      // Himmel ist im Wärmebild kalt (dunkel)
      scene.background = new THREE.Color(0x050505);
      scene.fog = null;
      this.swap(scene);
      renderer.setRenderTarget(this.target);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      this.restore();
      scene.background = background;
      scene.fog = fog;
      u.uMode.value = 0;
    } else {
      renderer.setRenderTarget(this.target);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      u.uMode.value = 1;
      // Nachts stärker verstärken als am Tag (sonst nur ein weißes Bild)
      u.uGain.value = 2.5 + night * 22;
    }
    u.tImage.value = this.target.texture;
    const autoClear = renderer.autoClear;
    renderer.autoClear = true;
    renderer.render(this.quadScene, this.quadCamera);
    renderer.autoClear = autoClear;
    return true;
  }

  /** Feste Körper auf Wärmematerial; Glas, Strahlen und Linien ausblenden. */
  private swap(scene: THREE.Scene) {
    const visit = (o: THREE.Object3D, heat: number) => {
      if (!o.visible) return;
      if (typeof o.userData.heat === 'number') heat = o.userData.heat;
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && !(o as THREE.Sprite).isSprite) {
        const mats = ([] as THREE.Material[]).concat(mesh.material);
        const first = mats[0];
        const custom = mats.some((m) => (m as THREE.ShaderMaterial).isShaderMaterial);
        const clear = mats.every((m) => m.transparent && m.opacity < 0.95);
        if (clear) {
          o.visible = false;
          this.hidden.push(o);
          return;
        }
        if (!custom && first) {
          this.swapped.push([mesh, mesh.material]);
          mesh.material = this.heatMaterial(heat, first.side);
        }
      } else if ((o as THREE.Line).isLine) {
        o.visible = false;
        this.hidden.push(o);
        return;
      }
      for (const child of o.children) visit(child, heat);
    };
    visit(scene, HEAT_AMBIENT);
  }
  private restore() {
    for (const [mesh, material] of this.swapped) mesh.material = material;
    for (const o of this.hidden) o.visible = true;
    this.swapped.length = 0;
    this.hidden.length = 0;
  }

  dispose() {
    this.target?.dispose();
    this.quad.geometry.dispose();
    this.quad.material.dispose();
    for (const m of this.heatMaterials.values()) m.dispose();
  }
}
