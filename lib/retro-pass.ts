// Pixel-Look im Stil der Shooter der frühen 90er (Doom, Duke Nukem, Quake – und Mekkablood):
// Die Szene wird in sehr niedriger Auflösung gerendert (200 oder 270 Zeilen), danach ohne
// Glättung hochgezogen. Ein Vollbild-Shader drückt die Farben auf eine kleine Palette
// (je Kanal wenige Stufen, kräftiger gesättigt) mit geordnetem 4×4-Dithering – so entstehen
// die typischen Farbstufen statt weicher Verläufe.
//
// Texturen werden im Pixel-Look ohne Filterung vergrößert (sichtbare Texel aus der Nähe).
//
// Die Cockpit-Anzeigen bleiben lesbar: Nach dem Pixelbild werden nur die Bildschirmflächen
// noch einmal in voller Auflösung darübergelegt. Damit davor Liegendes (Zettel am Rahmen,
// Hebel, Hände) die Anzeige weiter verdeckt, schreibt zuerst die nahe Kanzel nur ihre Tiefe.
import * as THREE from 'three';
import type { RetroLook } from './graphics-settings';
/** Bildzeilen der inneren Auflösung (Breite folgt dem Seitenverhältnis). */
export const RETRO_LINES: Record<Exclude<RetroLook, 'normal'>, number> = { pixel: 270, coarse: 200 };
/** Farbstufen je Kanal (6 → 216 Farben wie eine 256er-Palette, 5 → 125 Farben). */
const RETRO_LEVELS: Record<Exclude<RetroLook, 'normal'>, number> = { pixel: 6, coarse: 5 };

/** Innere Auflösung für eine Bildschirmgröße: feste Zeilenzahl, Breite nach Seitenverhältnis. */
export function retroSize(look: Exclude<RetroLook, 'normal'>, width: number, height: number) {
  const lines = Math.min(RETRO_LINES[look], Math.max(1, Math.round(height)));
  return { width: Math.max(1, Math.round((lines * width) / Math.max(1, height))), height: lines };
}

const vertex = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const fragment = /* glsl */ `
uniform sampler2D tImage;
uniform vec2 uSize;
uniform float uLevels;
varying vec2 vUv;
float bayer4(vec2 p) {
  // 4×4-Bayer-Matrix, Werte 0…15 → −0,5…+0,5
  vec2 q = mod(floor(p), 4.0);
  float i = q.x + q.y * 4.0;
  float m = 0.0;
  if (i < 1.0) m = 0.0; else if (i < 2.0) m = 8.0; else if (i < 3.0) m = 2.0; else if (i < 4.0) m = 10.0;
  else if (i < 5.0) m = 12.0; else if (i < 6.0) m = 4.0; else if (i < 7.0) m = 14.0; else if (i < 8.0) m = 6.0;
  else if (i < 9.0) m = 3.0; else if (i < 10.0) m = 11.0; else if (i < 11.0) m = 1.0; else if (i < 12.0) m = 9.0;
  else if (i < 13.0) m = 15.0; else if (i < 14.0) m = 7.0; else if (i < 15.0) m = 13.0; else m = 5.0;
  return m / 16.0 - 0.5;
}
void main() {
  // Mitte des inneren Pixels abtasten: harte Kanten beim Hochziehen
  vec2 cell = (floor(vUv * uSize) + 0.5) / uSize;
  gl_FragColor = texture2D(tImage, cell);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  vec3 c = gl_FragColor.rgb;
  // Kräftigere Farben und etwas mehr Kontrast, wie die gesättigten 90er-Paletten
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, 1.35);
  c = clamp((c - 0.5) * 1.08 + 0.5, 0.0, 1.0);
  // Palette: wenige Stufen je Kanal, in den dunklen Tönen dichter (sonst zerfallen
  // Schatten in bunte Krümel); leichtes geordnetes Dithering zwischen den Stufen
  float steps = uLevels - 1.0;
  c = pow(c, vec3(0.6));
  c = floor(c * steps + 0.5 + bayer4(vUv * uSize) * 0.45) / steps;
  c = pow(clamp(c, 0.0, 1.0), vec3(1.0 / 0.6));
  gl_FragColor = vec4(c, 1.0);
}`;

/** Ebene der Bildschirmflächen für die scharfe Überlagerung im Pixel-Look. */
export const SCREEN_LAYER = 5;
/** Reichweite der Überlagerung: nur die Kanzel, die Welt draußen kann keine Anzeige verdecken. */
const SCREEN_RANGE = 8;

export class RetroPass {
  private target: THREE.WebGLRenderTarget | null = null;
  private readonly quadScene = new THREE.Scene();
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: THREE.ShaderMaterial;
  /** Ursprüngliche Vergrößerungsfilter der Texturen, solange der Pixel-Look aktiv ist. */
  private readonly filters = new Map<THREE.Texture, THREE.MagnificationTextureFilter>();
  look: RetroLook = 'normal';
  /** Anzeigen scharf über das Pixelbild legen (lesbar); aus = Anzeigen ebenfalls verpixelt */
  sharpScreens = true;
  private readonly depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false });
  /** Unsichtbare Flächen der Kanzel (Tastfelder, Glas): dürfen keine Tiefe schreiben. */
  private clear: THREE.Object3D[] | null = null;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tImage: { value: null },
        uSize: { value: new THREE.Vector2(1, 1) },
        uLevels: { value: 6 },
      },
      vertexShader: vertex,
      fragmentShader: fragment,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
  }

  get active() {
    return this.look !== 'normal';
  }

  /** Look wechseln; Texturfilter der Szene passend umstellen. */
  setLook(look: RetroLook, scene: THREE.Object3D) {
    if (look === this.look) return;
    this.look = look;
    if (look === 'normal') this.restoreFilters();
    else this.pixelateTextures(scene);
  }

  /** Neu geladene Teile (Mech, Drohne …) nachträglich auf ungefilterte Texturen stellen. */
  refresh(scene: THREE.Object3D) {
    if (this.active) this.pixelateTextures(scene);
  }

  private pixelateTextures(scene: THREE.Object3D) {
    scene.traverse((o) => {
      const mat = (o as THREE.Mesh).material;
      if (!mat) return;
      for (const m of [mat].flat()) {
        for (const value of Object.values(m)) {
          const t = value as THREE.Texture;
          if (!t || !t.isTexture || (t as THREE.CanvasTexture).isCanvasTexture) continue;
          if (this.filters.has(t)) continue;
          this.filters.set(t, t.magFilter);
          t.magFilter = THREE.NearestFilter;
          t.needsUpdate = true;
        }
      }
    });
  }

  private restoreFilters() {
    for (const [t, f] of this.filters) {
      t.magFilter = f;
      t.needsUpdate = true;
    }
    this.filters.clear();
  }

  /**
   * Bildschirmflächen (Ebene SCREEN_LAYER) in voller Auflösung über das Pixelbild legen.
   * `cabin`: die Kanzel; ihre Tiefe sorgt dafür, dass Davorliegendes verdeckt bleibt.
   */
  private overlayScreens(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    cabin: THREE.Object3D,
  ) {
    if (!this.clear) {
      this.clear = [];
      cabin.traverse((o) => {
        const mat = (o as THREE.Mesh).material;
        if (!mat || !(o as THREE.Mesh).isMesh) return;
        const mats = [mat].flat();
        if (mats.every((m) => !m.depthWrite || (m.transparent && m.opacity < 0.5)))
          this.clear!.push(o);
      });
    }
    const far = camera.far,
      layers = camera.layers.mask,
      background = scene.background,
      override = scene.overrideMaterial,
      autoClear = renderer.autoClear;
    camera.far = Math.min(far, SCREEN_RANGE);
    camera.updateProjectionMatrix();
    scene.background = null;
    renderer.autoClear = false;
    renderer.clearDepth();
    const hidden = this.clear.filter((o) => o.visible);
    for (const o of hidden) o.visible = false;
    scene.overrideMaterial = this.depthOnly;
    renderer.render(scene, camera);
    scene.overrideMaterial = override;
    for (const o of hidden) o.visible = true;
    camera.layers.set(SCREEN_LAYER);
    renderer.render(scene, camera);
    camera.layers.mask = layers;
    camera.far = far;
    camera.updateProjectionMatrix();
    scene.background = background;
    renderer.autoClear = autoClear;
  }

  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    /** Kanzel, wenn aus dem Cockpit geschaut wird (dann Anzeigen scharf darüberlegen) */
    cabin?: THREE.Object3D | null,
  ) {
    if (this.look === 'normal') return false;
    const canvas = renderer.getSize(new THREE.Vector2());
    const size = retroSize(this.look, canvas.x, canvas.y);
    if (!this.target || this.target.width !== size.width || this.target.height !== size.height) {
      this.target?.dispose();
      this.target = new THREE.WebGLRenderTarget(size.width, size.height, {
        type: THREE.HalfFloatType,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        generateMipmaps: false,
      });
    }
    const u = this.material.uniforms;
    u.uSize.value.set(size.width, size.height);
    u.uLevels.value = RETRO_LEVELS[this.look];
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    u.tImage.value = this.target.texture;
    const autoClear = renderer.autoClear;
    renderer.autoClear = true;
    renderer.render(this.quadScene, this.quadCamera);
    renderer.autoClear = autoClear;
    if (cabin && this.sharpScreens) this.overlayScreens(renderer, scene, camera, cabin);
    return true;
  }

  dispose() {
    this.restoreFilters();
    this.target?.dispose();
    this.material.dispose();
    this.depthOnly.dispose();
    (this.quadScene.children[0] as THREE.Mesh).geometry.dispose();
  }
}
