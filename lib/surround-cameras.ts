import * as THREE from 'three';
import type { MachineState } from './machine';
import { mainPowerAvailable } from './machine';
import { drawDisplaySurface } from './display-surface';

export const SURROUND_VIEWS = [
  { label: 'VORNE LINKS', yaw: Math.PI / 3, x: -1.5, z: -2.4 },
  { label: 'VORNE MITTE', yaw: 0, x: 0, z: -2.6 },
  { label: 'VORNE RECHTS', yaw: -Math.PI / 3, x: 1.5, z: -2.4 },
  { label: 'HINTEN LINKS', yaw: (Math.PI * 2) / 3, x: -1.5, z: 5.5 },
  { label: 'HINTEN MITTE', yaw: Math.PI, x: 0, z: 5.7 },
  { label: 'HINTEN RECHTS', yaw: (-Math.PI * 2) / 3, x: 1.5, z: 5.5 },
] as const;
export const camerasPowered = (s: MachineState) =>
  s.stage >= 1 && s.overhead.avionics && mainPowerAvailable(s);
export const cameraTile = (i: number) => ({
  x: 24 + (i % 3) * 310,
  y: 112 + Math.floor(i / 3) * 264,
  w: 292,
  h: 220,
});
export function nextCamera(last: number[], now: number, selected: number) {
  const interval = selected < 0 ? 90 : 40;
  if (selected >= 0) return now - last[selected] >= interval ? selected : -1;
  let index = 0;
  for (let i = 1; i < last.length; i++) if (last[i] < last[index]) index = i;
  return now - last[index] >= interval ? index : -1;
}

// Render-to-texture throughout: no synchronous GPU readback, no extra WebGL context.
export class SurroundCameras {
  renderer: THREE.WebGLRenderer;
  world: THREE.Scene;
  cabin: THREE.Group;
  selected = -1;
  systems = false;
  last = Array(6).fill(-Infinity);
  lastCapture = -Infinity;
  powered = false;
  reducedMotion = false;
  cameras = SURROUND_VIEWS.map((v) => {
    const c = new THREE.PerspectiveCamera(65, 1.6, 0.15, 440);
    c.position.set(v.x, 0.95, v.z);
    c.rotation.set(-0.24, v.yaw, 0, 'YXZ');
    c.updateMatrix();
    return c;
  });
  targets = SURROUND_VIEWS.map(
    () =>
      new THREE.WebGLRenderTarget(480, 300, {
        depthBuffer: true,
        type: THREE.HalfFloatType,
        generateMipmaps: false,
      }),
  );
  output = new THREE.WebGLRenderTarget(960, 720, { depthBuffer: false, generateMipmaps: false });
  composite = new THREE.Scene();
  ortho = new THREE.OrthographicCamera(-480, 480, 360, -360, 0.1, 10);
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  overlay: THREE.CanvasTexture;
  geometry = new THREE.PlaneGeometry(1, 1);
  tiles: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>[] = [];
  labelMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  savedViewport = new THREE.Vector4();
  savedScissor = new THREE.Vector4();
  constructor(renderer: THREE.WebGLRenderer, world: THREE.Scene, cabin: THREE.Group) {
    this.renderer = renderer;
    this.world = world;
    this.cabin = cabin;
    this.ortho.position.z = 2;
    this.composite.background = new THREE.Color('#050e07');
    this.canvas = document.createElement('canvas');
    this.canvas.width = 960;
    this.canvas.height = 720;
    this.context = this.canvas.getContext('2d')!;
    this.overlay = new THREE.CanvasTexture(this.canvas);
    this.overlay.colorSpace = THREE.SRGBColorSpace;
    this.overlay.generateMipmaps = false;
    this.overlay.minFilter = THREE.LinearFilter;
    for (const target of this.targets) {
      const material = new THREE.ShaderMaterial({
        toneMapped: false,
        uniforms: { image: { value: target.texture }, toneMappingExposure: { value: 1.2 } },
        vertexShader:
          'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
        fragmentShader: `uniform sampler2D image;
varying vec2 vUv;
#include <tonemapping_pars_fragment>
void main(){gl_FragColor=vec4(ACESFilmicToneMapping(texture2D(image,vUv).rgb),1.0);}`,
      });
      const tile = new THREE.Mesh(this.geometry, material);
      this.tiles.push(tile);
      this.composite.add(tile);
    }
    this.labelMesh = new THREE.Mesh(
      this.geometry,
      new THREE.MeshBasicMaterial({
        map: this.overlay,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.labelMesh.scale.set(960, 720, 1);
    this.labelMesh.renderOrder = 10;
    this.composite.add(this.labelMesh);
    this.layout();
  }
  select(index: number) {
    this.systems = index === 7;
    this.selected = index < 6 ? index : -1;
    this.last.fill(-Infinity);
    this.lastCapture = -Infinity;
    this.targets.forEach((t, i) =>
      t.setSize(i === this.selected ? 960 : 480, i === this.selected ? 600 : 300),
    );
    this.layout();
  }
  reset() {
    this.last.fill(-Infinity);
    this.lastCapture = -Infinity;
    this.powered = false;
    this.tiles.forEach((tile) => {
      tile.visible = false;
    });
  }
  layout() {
    this.tiles.forEach((tile, i) => {
      const r = this.selected < 0 ? cameraTile(i) : { x: 24, y: 112, w: 912, h: 530 };
      this.cameras[i].aspect = r.w / r.h;
      this.cameras[i].updateProjectionMatrix();
      tile.position.set(r.x + r.w / 2 - 480, 360 - r.y - r.h / 2, 0);
      tile.scale.set(r.w, r.h, 1);
      tile.visible =
        this.powered && (this.selected < 0 || this.selected === i) && Number.isFinite(this.last[i]);
    });
  }
  labels(now: number) {
    const c = this.context;
    c.clearRect(0, 0, 960, 720);
    c.fillStyle = '#142519';
    c.fillRect(0, 0, 960, 85);
    const text = (s: string, x: number, y: number, size = 24, color = '#c9ecb3') => {
      c.fillStyle = color;
      c.font = '600 ' + size + 'px Arial';
      c.fillText(s, x, y);
    };
    text('UMGEBUNG / KAMERAS', 24, 49, 29);
    text('6 BILDER', 574, 49, 24, this.selected < 0 ? '#a3e969' : '#83a773');
    text('SYSTEME', 786, 49, 24, '#83a773');
    if (!this.powered) {
      c.fillStyle = '#050e07';
      c.fillRect(0, 86, 960, 570);
      text('KAMERAS AUS', 250, 300, 44, '#efbd68');
      text('Hauptstrom und AVIONICS einschalten', 188, 354, 28);
    } else
      for (let i = 0; i < 6; i++) {
        if (this.selected >= 0 && i !== this.selected) continue;
        const r = this.selected < 0 ? cameraTile(i) : { x: 24, y: 112, w: 912, h: 530 };
        c.fillStyle = '#102316';
        c.fillRect(r.x, r.y - 25, r.w, 25);
        text(i + 1 + '  ' + SURROUND_VIEWS[i].label, r.x + 8, r.y - 6, 18);
        c.strokeStyle = '#6d9655';
        c.lineWidth = 2;
        c.strokeRect(r.x, r.y, r.w, r.h);
        if (!Number.isFinite(this.last[i]) || now - this.last[i] > 1200) {
          c.fillStyle = '#050e07';
          c.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
          text(
            'BILD WIRD AKTUALISIERT',
            r.x + 12,
            r.y + r.h / 2,
            this.selected < 0 ? 17 : 28,
            '#efbd68',
          );
        }
      }
    text(
      this.selected < 0
        ? '1–6 am Monitor: Einzelbild · Bild anklicken: vergrößern'
        : '6 BILDER: Übersicht · Tasten am Monitor: Kamera wählen',
      24,
      678,
      23,
    );
    text('RÜCKANSICHTEN UNGESPIEGELT · LINKS/RECHTS = MECHSEITE', 24, 706, 20, '#83a773');
    drawDisplaySurface(c, now / 1000, this.reducedMotion, 6, true);
    this.overlay.needsUpdate = true;
  }
  update(now: number, s: MachineState, visible: boolean) {
    if (this.systems) return;
    const power = camerasPowered(s),
      changed = power !== this.powered;
    this.powered = power;
    if (changed) this.last.fill(-Infinity);
    if (!visible && !changed) return;
    // At most one world capture per animation frame and 60 captures/s overall.
    const index =
      power && now - this.lastCapture >= 16 ? nextCamera(this.last, now, this.selected) : -1;
    if (index < 0 && !changed && this.lastCapture !== -Infinity) return;
    const r = this.renderer,
      oldTarget = r.getRenderTarget(),
      oldAuto = r.autoClear,
      oldExposure = r.toneMappingExposure,
      oldVisible = this.cabin.visible,
      oldShadows = r.shadowMap.autoUpdate;
    r.getViewport(this.savedViewport);
    r.getScissor(this.savedScissor);
    const oldScissor = r.getScissorTest();
    try {
      r.autoClear = true;
      r.setScissorTest(false);
      r.shadowMap.autoUpdate = false;
      if (index >= 0) {
        const cam = this.cameras[index];
        cam.matrixWorld.multiplyMatrices(this.cabin.matrixWorld, cam.matrix);
        // A camera inherits the mounting position, not the cabin's geometry scale.
        // Match THREE.Camera's scale-free view matrix for physical clipping/light.
        const scale = new THREE.Vector3().setFromMatrixScale(cam.matrixWorld);
        cam.matrixWorld.scale(scale.set(1 / scale.x, 1 / scale.y, 1 / scale.z));
        cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
        cam.matrixWorldAutoUpdate = false;
        this.cabin.visible = false;
        r.toneMappingExposure = 1.2;
        r.setRenderTarget(this.targets[index]);
        r.render(this.world, cam);
        this.last[index] = now;
        this.lastCapture = now;
      }
      this.layout();
      this.labels(now);
      r.setRenderTarget(this.output);
      r.render(this.composite, this.ortho);
      if (!power) this.lastCapture = now;
    } finally {
      this.cabin.visible = oldVisible;
      r.shadowMap.autoUpdate = oldShadows;
      r.toneMappingExposure = oldExposure;
      r.autoClear = oldAuto;
      r.setRenderTarget(oldTarget);
      r.setViewport(this.savedViewport);
      r.setScissor(this.savedScissor);
      r.setScissorTest(oldScissor);
    }
  }
  dispose() {
    this.targets.forEach((t) => t.dispose());
    this.output.dispose();
    this.overlay.dispose();
    this.geometry.dispose();
    this.tiles.forEach((t) => t.material.dispose());
    this.labelMesh.material.dispose();
  }
}
