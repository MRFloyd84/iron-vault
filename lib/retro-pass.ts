// Bildstile aus dem Grafikmenü „Look“ (F4 schaltet zwischen normal und dem gewählten Stil):
//
// Pixel / Grob – Shooter der frühen 90er (Doom, Duke Nukem, Quake – und Mekkablood):
//   Die Szene entsteht in 270 bzw. 200 Zeilen und wird ohne Glättung hochgezogen. Ein
//   Vollbild-Shader drückt die Farben auf eine kleine Palette (wenige Stufen je Kanal,
//   kräftiger gesättigt) mit leichtem 4×4-Dithering. Texturen werden ungefiltert vergrößert.
//
// Comic – Tuschezeichnung: schwarze Konturen aus Tiefen- und Helligkeitssprüngen, flache
//   Farbflächen (wenige Helligkeitsstufen bei gleichem Farbton, kräftigere Farben) und
//   Rasterpunkte in den Schatten wie im Heftdruck.
//
// In allen Stilen bleiben Cockpit-Anzeigen und Schalterbeschriftungen lesbar: Sie werden
// nach dem stilisierten Bild noch einmal unverändert in voller Auflösung darübergelegt.
// Damit davor Liegendes (Zettel am Rahmen, Hebel) sie weiter verdeckt, schreibt zuerst die
// nahe Kanzel nur ihre Tiefe.
import * as THREE from 'three';
import type { RetroLook } from './graphics-settings';

type PixelLook = 'pixel' | 'coarse';
/** Bildzeilen der inneren Auflösung (Breite folgt dem Seitenverhältnis). */
export const RETRO_LINES: Record<PixelLook, number> = { pixel: 270, coarse: 200 };
/** Farbstufen je Kanal (6 → 216 Farben wie eine 256er-Palette, 5 → 125 Farben). */
const RETRO_LEVELS: Record<PixelLook, number> = { pixel: 6, coarse: 5 };
export const isPixelLook = (look: RetroLook): look is PixelLook =>
  look === 'pixel' || look === 'coarse';

/** Innere Auflösung für eine Bildschirmgröße: feste Zeilenzahl, Breite nach Seitenverhältnis. */
export function retroSize(look: PixelLook, width: number, height: number) {
  const lines = Math.min(RETRO_LINES[look], Math.max(1, Math.round(height)));
  return { width: Math.max(1, Math.round((lines * width) / Math.max(1, height))), height: lines };
}

/** Ebene der Bildschirmflächen und der Schalterbeschriftungen für die scharfe Überlagerung. */
export const SCREEN_LAYER = 5;
/** Beschriftungen in der Kanzel: nur auf dieser Ebene (im stilisierten Bild ausgeblendet). */
export const LABEL_LAYER = 6;
/** Reichweite der Überlagerung: nur die Kanzel, die Welt draußen kann nichts davon verdecken. */
const SCREEN_RANGE = 8;

const vertex = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const pixelFragment = /* glsl */ `
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

const comicFragment = /* glsl */ `
#include <packing>
uniform sampler2D tImage;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform float uNear;
uniform float uFar;
varying vec2 vUv;
float depthAt(vec2 uv) {
  return perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar) * -1.0;
}
float lumAt(vec2 uv) {
  vec3 c = texture2D(tImage, uv).rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  return l / (1.0 + l);
}
void main() {
  vec2 o = uTexel * 1.3;
  float d = depthAt(vUv);
  // Sobel auf Tiefe (relativ zur Entfernung) und auf Helligkeit
  float t00 = depthAt(vUv + vec2(-o.x, -o.y)), t10 = depthAt(vUv + vec2(0.0, -o.y)), t20 = depthAt(vUv + vec2(o.x, -o.y));
  float t01 = depthAt(vUv + vec2(-o.x, 0.0)), t21 = depthAt(vUv + vec2(o.x, 0.0));
  float t02 = depthAt(vUv + vec2(-o.x, o.y)), t12 = depthAt(vUv + vec2(0.0, o.y)), t22 = depthAt(vUv + vec2(o.x, o.y));
  float gx = (t20 + 2.0 * t21 + t22) - (t00 + 2.0 * t01 + t02);
  float gy = (t02 + 2.0 * t12 + t22) - (t00 + 2.0 * t10 + t20);
  float inkDepth = smoothstep(0.1, 0.25, length(vec2(gx, gy)) / max(d, 0.2));
  float l00 = lumAt(vUv + vec2(-o.x, -o.y)), l10 = lumAt(vUv + vec2(0.0, -o.y)), l20 = lumAt(vUv + vec2(o.x, -o.y));
  float l01 = lumAt(vUv + vec2(-o.x, 0.0)), l21 = lumAt(vUv + vec2(o.x, 0.0));
  float l02 = lumAt(vUv + vec2(-o.x, o.y)), l12 = lumAt(vUv + vec2(0.0, o.y)), l22 = lumAt(vUv + vec2(o.x, o.y));
  float hx = (l20 + 2.0 * l21 + l22) - (l00 + 2.0 * l01 + l02);
  float hy = (l02 + 2.0 * l12 + l22) - (l00 + 2.0 * l10 + l20);
  float inkLum = smoothstep(0.22, 0.45, length(vec2(hx, hy)));
  // In der Ferne weniger Linien (Dünen würden sonst zu Gekritzel)
  float ink = max(inkDepth, inkLum * 0.75) * (1.0 - smoothstep(250.0, 1100.0, d));

  gl_FragColor = texture2D(tImage, vUv);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  vec3 c = gl_FragColor.rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  // Flache Farbflächen: vier Helligkeitsstufen bei gleichem Farbton, kräftigere Farben
  float bands = 4.0;
  float lq = clamp((floor(l * bands) + 0.6) / bands, 0.06, 1.0);
  c = c * (lq / max(l, 0.03));
  float lc = dot(c, vec3(0.299, 0.587, 0.114));
  c = clamp(mix(vec3(lc), c, 1.45), 0.0, 1.0);
  // Rasterpunkte in den Schatten (45° gedrehtes Punktraster wie im Heftdruck)
  vec2 q = mat2(0.7071, -0.7071, 0.7071, 0.7071) * gl_FragCoord.xy / 7.0;
  float r = clamp((0.3 - l) * 1.4, 0.0, 0.42);
  float dots = 1.0 - smoothstep(r - 0.06, r + 0.06, length(fract(q) - 0.5));
  c *= 1.0 - 0.35 * dots;
  // Tusche
  c = mix(c, vec3(0.04, 0.035, 0.07), ink);
  gl_FragColor = vec4(c, 1.0);
}`;

export class RetroPass {
  private target: THREE.WebGLRenderTarget | null = null;
  private readonly quadScene = new THREE.Scene();
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh;
  private readonly pixelMaterial: THREE.ShaderMaterial;
  private readonly comicMaterial: THREE.ShaderMaterial;
  /** Ursprüngliche Vergrößerungsfilter der Texturen, solange der Pixel-Look aktiv ist. */
  private readonly filters = new Map<THREE.Texture, THREE.MagnificationTextureFilter>();
  look: RetroLook = 'normal';
  /** Anzeigen und Beschriftungen scharf darüberlegen (lesbar) */
  sharpScreens = true;
  private readonly depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false });
  /** Unsichtbare Flächen der Kanzel (Tastfelder, Glas): dürfen keine Tiefe schreiben. */
  private clear: THREE.Object3D[] | null = null;
  /** Lichter, die auch für die Überlagerung gelten (Beschriftungen sind beleuchtet). */
  private lit = new Set<THREE.Light>();

  constructor() {
    const quadMaterial = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) =>
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: vertex,
        fragmentShader,
        depthTest: false,
        depthWrite: false,
      });
    this.pixelMaterial = quadMaterial(pixelFragment, {
      tImage: { value: null },
      uSize: { value: new THREE.Vector2(1, 1) },
      uLevels: { value: 6 },
    });
    this.comicMaterial = quadMaterial(comicFragment, {
      tImage: { value: null },
      tDepth: { value: null },
      uTexel: { value: new THREE.Vector2(1, 1) },
      uNear: { value: 0.1 },
      uFar: { value: 1000 },
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.pixelMaterial);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  get active() {
    return this.look !== 'normal';
  }

  /** Look wechseln; Texturfilter der Szene passend umstellen. */
  setLook(look: RetroLook, scene: THREE.Object3D) {
    if (look === this.look) return;
    this.look = look;
    if (this.target) {
      this.target.dispose();
      this.target = null;
    }
    if (isPixelLook(look)) this.pixelateTextures(scene);
    else this.restoreFilters();
  }

  /** Nachgeladene Teile (Mech, Drohne …) und neue Lichter berücksichtigen. */
  refresh(scene: THREE.Object3D) {
    if (isPixelLook(this.look)) this.pixelateTextures(scene);
    this.lit.clear();
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
   * Bildschirmflächen und Beschriftungen in voller Auflösung über das stilisierte Bild legen.
   * `cabin`: die Kanzel; ihre Tiefe sorgt dafür, dass Davorliegendes verdeckt bleibt.
   */
  private overlay(
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
    // Beschriftungen sind beleuchtet: dieselben Lichter wie sonst (gleiche Shader-Variante)
    if (!this.lit.size)
      scene.traverse((o) => {
        const light = o as THREE.Light;
        if (!light.isLight) return;
        light.layers.enable(SCREEN_LAYER);
        light.layers.enable(LABEL_LAYER);
        this.lit.add(light);
      });
    const far = camera.far,
      layers = camera.layers.mask,
      background = scene.background,
      override = scene.overrideMaterial,
      autoClear = renderer.autoClear,
      shadows = renderer.shadowMap.autoUpdate;
    camera.far = Math.min(far, SCREEN_RANGE);
    camera.updateProjectionMatrix();
    scene.background = null;
    renderer.autoClear = false;
    // Schattenkarten sind für dieses Bild schon berechnet
    renderer.shadowMap.autoUpdate = false;
    renderer.clearDepth();
    const hidden = this.clear.filter((o) => o.visible);
    for (const o of hidden) o.visible = false;
    scene.overrideMaterial = this.depthOnly;
    renderer.render(scene, camera);
    scene.overrideMaterial = override;
    for (const o of hidden) o.visible = true;
    camera.layers.set(SCREEN_LAYER);
    camera.layers.enable(LABEL_LAYER);
    renderer.render(scene, camera);
    camera.layers.mask = layers;
    camera.far = far;
    camera.updateProjectionMatrix();
    scene.background = background;
    renderer.autoClear = autoClear;
    renderer.shadowMap.autoUpdate = shadows;
  }

  private ensureTarget(width: number, height: number, depth: boolean) {
    if (this.target && this.target.width === width && this.target.height === height) return;
    this.target?.dispose();
    const filter = depth ? THREE.LinearFilter : THREE.NearestFilter;
    // depthTexture nur angeben, wenn gebraucht: `undefined` bringt three.js zum Absturz
    this.target = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      minFilter: filter,
      magFilter: filter,
      generateMipmaps: false,
      ...(depth ? { depthTexture: new THREE.DepthTexture(width, height) } : {}),
    });
  }

  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    /** Kanzel, wenn aus dem Cockpit geschaut wird (dann Anzeigen/Beschriftungen scharf) */
    cabin?: THREE.Object3D | null,
  ) {
    if (this.look === 'normal') return false;
    let material: THREE.ShaderMaterial;
    if (isPixelLook(this.look)) {
      const canvas = renderer.getSize(new THREE.Vector2());
      const size = retroSize(this.look, canvas.x, canvas.y);
      this.ensureTarget(size.width, size.height, false);
      material = this.pixelMaterial;
      material.uniforms.uSize.value.set(size.width, size.height);
      material.uniforms.uLevels.value = RETRO_LEVELS[this.look];
    } else {
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      this.ensureTarget(size.x, size.y, true);
      material = this.comicMaterial;
      const u = material.uniforms;
      u.uTexel.value.set(1 / size.x, 1 / size.y);
      u.uNear.value = camera.near;
      u.uFar.value = camera.far;
      u.tDepth.value = this.target!.depthTexture;
    }
    // Beschriftungen der Kanzel kommen erst mit der scharfen Überlagerung
    const showLabels = camera.layers.isEnabled(LABEL_LAYER);
    if (cabin && this.sharpScreens) camera.layers.disable(LABEL_LAYER);
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    if (showLabels) camera.layers.enable(LABEL_LAYER);
    material.uniforms.tImage.value = this.target!.texture;
    this.quad.material = material;
    const autoClear = renderer.autoClear;
    renderer.autoClear = true;
    renderer.render(this.quadScene, this.quadCamera);
    renderer.autoClear = autoClear;
    if (cabin && this.sharpScreens) this.overlay(renderer, scene, camera, cabin);
    return true;
  }

  dispose() {
    this.restoreFilters();
    this.target?.dispose();
    this.pixelMaterial.dispose();
    this.comicMaterial.dispose();
    this.depthOnly.dispose();
    this.quad.geometry.dispose();
  }
}
