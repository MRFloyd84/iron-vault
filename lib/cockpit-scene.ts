import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { JointPresentation, neutralJoints } from './articulation';
import {
  batchStaticCockpit,
  braceLighting,
  cabinLighting,
  ceilingLighting,
  cockpitPixelRatio,
  instrumentSpill,
  nextDisplay,
  setCockpitInterior,
} from './cockpit-rendering';
import { DisplayBoot, renderDisplay, coldCockpit, batteryBeacon } from './display-boot';
import { STRUCTURE_ATLAS, type InstrumentAssets, type TelemetrySample } from './instruments';
import { actuatorMoving, dcPowerAvailable, overheadOn, type MachineState } from './machine';
import { MechExterior, MECH, applyMechBodyPose } from './mech-exterior';
import { serviceWarning, electricalReadings } from './service-systems';
import { SurroundCameras } from './surround-cameras';
import { WalkPresentation } from './walk-presentation';
import { WALK } from './walking';
import { buildYard, YARD } from './yard-scene';
import { buildHangar as buildHangarImpl } from './scene/hangar-build';
import {
  buildShell as buildShellImpl,
  buildCeilingLamp as buildCeilingLampImpl,
  buildBraceLighting as buildBraceLightingImpl,
  buildShellTransitions as buildShellTransitionsImpl,
  buildInteriorSide as buildInteriorSideImpl,
} from './scene/cabin-shell';
import {
  screen as screenImpl,
  buildConsole as buildConsoleImpl,
  addSwitch as addSwitchImpl,
  buildOverhead as buildOverheadImpl,
  buildTopMonitor as buildTopMonitorImpl,
  buildSideMonitor as buildSideMonitorImpl,
  buildSide as buildSideImpl,
  buildSeat as buildSeatImpl,
  buildMechanicalDetails as buildMechanicalDetailsImpl,
  addGauge as addGaugeImpl,
} from './scene/cabin-controls';
export type Hover = { text: string; x: number; y: number } | null;
export type Screen = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  kind: string;
  material: THREE.MeshBasicMaterial;
  mesh: THREE.Mesh;
  lastDraw: number;
};
export type CameraView =
  'front' | 'overhead' | 'left' | 'right' | 'panel' | 'hangar' | 'yard' | 'mech';

export class CockpitScene {
  walkPose = {
    x: 0,
    z: WALK.originZ,
    yaw: 0,
    height: 0,
    pitch: 0,
    roll: 0,
    phase: 0,
    speed: 0,
    turnRate: 0,
  };
  walkPresentation = new WalkPresentation();
  interior = new THREE.Group();
  jointPresentation = new JointPresentation();
  jointPose = neutralJoints();
  scene = new THREE.Scene();
  cabin = new THREE.Group();
  camera = new THREE.PerspectiveCamera(60, 1, 0.08, 440);
  renderer: THREE.WebGLRenderer;
  frame = 0;
  disposed = false;
  resizeObserver: ResizeObserver;
  getState: () => MachineState;
  onAction: (i: number) => void;
  hover: (h: Hover) => void;
  screens: Screen[] = [];
  textures: THREE.Texture[] = [];
  geometries = new Map<string, THREE.BufferGeometry>();
  materials: THREE.Material[] = [];
  displayBoot = new DisplayBoot();
  onDisplayBoot: (boot: DisplayBoot) => void;
  switches: {
    pivot: THREE.Group;
    led: THREE.MeshStandardMaterial;
    index: number;
    push: boolean;
  }[] = [];
  panelLights: THREE.PointLight[] = [];
  gauges: { needle: THREE.Group; kind: number }[] = [];
  cabinFixtures: THREE.MeshStandardMaterial[] = [];
  workLightColor = new THREE.Color(0xffb45c);
  standbyLightColor = new THREE.Color(0xff8f38);
  screenSpill: THREE.PointLight | null = null;
  cautionLeds: THREE.MeshStandardMaterial[] = [];
  gateLeaves: THREE.Group[] = [];
  yardMaterials: THREE.MeshStandardMaterial[] = [];
  inYard = false;
  ceilingLight: THREE.SpotLight | null = null;
  ceilingLens: THREE.MeshStandardMaterial | null = null;
  braceLights: THREE.PointLight[] = [];
  braceLens: THREE.MeshStandardMaterial | null = null;
  surround: SurroundCameras | null = null;
  exterior: MechExterior | null = null;
  inMech = false;
  orbitYaw = 0.65;
  orbitPitch = 0.18;
  orbitDistance: number = MECH.orbitRadius;
  targetOrbitYaw = 0.65;
  targetOrbitPitch = 0.18;
  targetOrbitDistance: number = MECH.orbitRadius;
  telemetry: TelemetrySample[] = [];
  instrumentAssets: InstrumentAssets = {};
  knobs: { pivot: THREE.Group; action: number }[] = [];
  radarAngle = 0;
  targets: THREE.Object3D[] = [];
  ray = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  drag = false;
  lastX = 0;
  lastY = 0;
  lastDraw = 0;
  pickMeshes: THREE.Mesh[] = [];
  pendingPointer: PointerEvent | null = null;
  lastHover = 0;
  screenFrustum = new THREE.Frustum();
  viewProjection = new THREE.Matrix4();
  yaw = 0;
  pitch = -0.12;
  targetYaw = 0;
  targetPitch = -0.12;
  targetFov = 60;
  lastTime = 0;
  throttle: THREE.Group | null = null;
  inHangar = false;
  ready: Promise<void>;
  loader: THREE.TextureLoader;
  textureCache = new Map<string, THREE.Texture>();
  wornMat: THREE.MeshStandardMaterial;
  treadMat: THREE.MeshStandardMaterial;
  seatMat: THREE.MeshStandardMaterial;
  leatherMat: THREE.MeshStandardMaterial;
  bodyMat: THREE.MeshStandardMaterial;
  edgeMat: THREE.MeshStandardMaterial;
  darkMat: THREE.MeshStandardMaterial;
  steelMat: THREE.MeshStandardMaterial;
  labelMat: THREE.MeshStandardMaterial;
  displayFrameMat: THREE.MeshStandardMaterial;
  cleanup: (() => void)[] = [];
  reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  constructor(
    host: HTMLElement,
    getState: () => MachineState,
    onAction: (i: number) => void,
    hover: (h: Hover) => void,
    onDisplayBoot: (boot: DisplayBoot) => void = () => {},
  ) {
    this.getState = getState;
    this.onAction = onAction;
    this.hover = hover;
    this.onDisplayBoot = onDisplayBoot;
    const manager = new THREE.LoadingManager();
    const failed: string[] = [];
    this.ready = new Promise<void>((resolve, reject) => {
      manager.onLoad = () =>
        failed.length
          ? reject(new Error('Materialdateien konnten nicht geladen werden: ' + failed.join(', ')))
          : resolve();
      manager.onError = (url) => failed.push(url);
    });
    this.loader = new THREE.TextureLoader(manager);
    new THREE.ImageLoader(manager).load(STRUCTURE_ATLAS, (image) => {
      if (this.disposed) return;
      this.instrumentAssets.structureAtlas = image;
      for (const screen of this.screens) if (screen.kind === 'armor') screen.lastDraw = -Infinity;
    });
    this.cleanup.push(() => {
      this.instrumentAssets = {};
    });
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.94;
    this.renderer.setClearColor(0x080c0b);
    host.appendChild(this.renderer.domElement);
    this.scene.fog = new THREE.FogExp2(0x39444a, 0.0025);
    this.camera.position.set(0, 1.6, 3.85);
    this.camera.rotation.order = 'YXZ';
    this.bodyMat = this.pbr('hull', 0x697683, 0.92, 0.27, 1.2);
    this.wornMat = this.pbr('paint', 0x777e83, 0.94, 0.35, 1.0);
    this.treadMat = this.pbr('tread', 0x7b838c, 0.9, 0.7, 2.1);
    this.seatMat = this.pbr('seat', 0x69554a, 0.94, 0.43, 1.7);
    this.leatherMat = this.pbr('leather', 0x8c786a, 0.88, 0.38, 2.5);
    this.edgeMat = this.mat({ color: 0x596966, metalness: 0.68, roughness: 0.43 });
    this.darkMat = this.mat({ color: 0x171b20, metalness: 0.04, roughness: 0.87 });
    this.steelMat = this.mat({ color: 0xaab0b6, metalness: 0.82, roughness: 0.36 });
    this.labelMat = this.mat({ color: 0x84909b, metalness: 0.15, roughness: 0.65 });
    this.displayFrameMat = this.mat({ color: 0x314a43, metalness: 0.42, roughness: 0.52 });
    // Neutral reflection environment makes bare metal readable without a green wash.
    const environment = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envTarget = pmrem.fromScene(environment, 0.04);
    this.scene.environment = envTarget.texture;
    this.scene.environmentIntensity = 0.18;
    environment.dispose();
    pmrem.dispose();
    this.cleanup.push(() => envTarget.dispose());
    this.scene.add(new THREE.HemisphereLight(0x91aea8, 0x10130e, 0.2));
    this.screenSpill = new THREE.PointLight(0x9bdf64, 0, 3.2, 2);
    this.screenSpill.position.set(0, 0.82, 0.55);
    this.scene.add(this.screenSpill);
    this.buildHangar();
    const yard = buildYard(this);
    this.yardMaterials.push(...yard.materials);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.loadYardSky(manager);
    const worldBatches = batchStaticCockpit(this.scene, new Set(this.gateLeaves));
    const worldObjects = new Set(this.scene.children);
    worldObjects.delete(this.screenSpill);
    this.buildShell();
    this.buildConsole();
    this.buildSide(-1);
    this.buildSide(1);
    this.buildTopMonitor(-1);
    this.buildTopMonitor(1);
    this.buildSeat();
    this.buildMechanicalDetails();
    this.buildSideMonitor(-1);
    this.buildSideMonitor(1);
    this.cabin.name = 'Moving pilot capsule';
    for (const child of [...this.scene.children])
      if (!worldObjects.has(child)) this.cabin.add(child);
    this.scene.add(this.cabin);
    const moving = new Set<THREE.Object3D>([
      ...this.switches.map((s) => s.pivot),
      ...this.knobs.map((k) => k.pivot),
      ...this.gauges.map((g) => g.needle),
      ...this.screens.map((s) => s.mesh),
    ]);
    if (this.throttle) moving.add(this.throttle);
    const cabinBatches = batchStaticCockpit(this.cabin, moving, true);
    this.cabin.matrixAutoUpdate = true;
    // Scale camera and all authored interior geometry together. At the pilot seat
    // screen size/FOV stay unchanged; the physical capsule now fits the torso.
    this.cabin.scale.setScalar(MECH.cabinScale);
    this.cabin.traverse((o) => {
      o.castShadow = false;
      if (o instanceof THREE.PointLight || o instanceof THREE.SpotLight) {
        o.distance *= MECH.cabinScale;
        o.intensity *= MECH.cabinScale ** o.decay;
      }
    });
    // The opaque exterior completely hides this subtree. Keep the controls alive,
    // but detach their render/matrix/light workload while viewing from outside.
    this.interior.name = 'Pilot interior / cockpit views only';
    this.interior.matrixAutoUpdate = false;
    for (const child of [...this.cabin.children]) this.interior.add(child);
    this.cabin.add(this.interior, this.camera);
    this.camera.near = 0.08 * MECH.cabinScale;
    this.camera.updateProjectionMatrix();
    this.exterior = new MechExterior(this, manager);
    this.cabin.add(this.exterior.root);
    this.ready = Promise.all([this.ready, this.exterior.ready]).then(() => {});
    this.pickMeshes = [...worldBatches.picking, ...cabinBatches.picking];
    this.cleanup.push(() =>
      [...worldBatches.geometries, ...cabinBatches.geometries].forEach((g) => g.dispose()),
    );
    this.surround = new SurroundCameras(this.renderer, this.scene, this.cabin);
    this.cleanup.push(() => this.surround?.dispose());
    // One explicit world update per frame serves both the main camera and the
    // monitor cameras; their renderer passes must not repeat this traversal.
    this.scene.matrixWorldAutoUpdate = false;
    for (const screen of this.screens) {
      screen.texture.generateMipmaps = false;
      screen.texture.minFilter = THREE.LinearFilter;
      this.drawScreen(screen, this.getState(), 0);
    }
    const resize = () => {
      const w = Math.max(1, host.clientWidth),
        h = Math.max(1, host.clientHeight);
      this.renderer.setPixelRatio(cockpitPixelRatio(w, h, window.devicePixelRatio));
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    };
    resize();
    this.resizeObserver = new ResizeObserver(resize);
    this.resizeObserver.observe(host);
    const c = this.renderer.domElement;
    const move = (e: PointerEvent) => {
      if (this.drag) {
        if (this.inMech) {
          this.targetOrbitYaw -= (e.clientX - this.lastX) * 0.006;
          this.targetOrbitPitch = THREE.MathUtils.clamp(
            this.targetOrbitPitch + (e.clientY - this.lastY) * 0.004,
            -0.12,
            0.7,
          );
        } else {
          this.targetYaw -= (e.clientX - this.lastX) * 0.003;
          this.targetPitch -= (e.clientY - this.lastY) * 0.0025;
          this.targetYaw = THREE.MathUtils.clamp(this.targetYaw, -1.03, 1.03);
          this.targetPitch = THREE.MathUtils.clamp(this.targetPitch, -0.85, 0.6);
        }
      } else this.pendingPointer = e;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    };
    const down = (e: PointerEvent) => {
      if (e.button === 2 || (this.inMech && e.button === 0)) {
        this.drag = true;
        this.pendingPointer = null;
        this.hover(null);
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        c.setPointerCapture(e.pointerId);
        c.style.cursor = 'grabbing';
      }
      if (e.button === 0 && !this.inMech) {
        const hit = this.pick(e);
        if (hit) {
          if (hit.userData.focus) {
            const p = hit.getWorldPosition(new THREE.Vector3());
            this.focus(p);
          } else if (!hit.userData.displayControl || this.displayBoot.phase === 'ready')
            this.onAction(hit.userData.action);
        }
      }
    };
    const up = () => {
      this.drag = false;
      c.style.cursor = 'default';
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? host.clientHeight : 1);
      if (this.inMech)
        this.targetOrbitDistance = THREE.MathUtils.clamp(
          this.targetOrbitDistance * Math.exp(delta * 0.001),
          MECH.orbitMin,
          MECH.orbitMax,
        );
      else this.targetFov = THREE.MathUtils.clamp(this.targetFov * Math.exp(delta * 0.001), 14, 70);
    };
    const context = (e: Event) => e.preventDefault();
    const leave = () => {
      this.pendingPointer = null;
      this.hover(null);
    };
    const lost = (e: Event) => {
      e.preventDefault();
      this.hover({ text: 'Grafikverbindung unterbrochen – bitte Seite neu laden.', x: 30, y: 180 });
    };
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('lostpointercapture', up);
    c.addEventListener('pointerleave', leave);
    c.addEventListener('wheel', wheel, { passive: false });
    c.addEventListener('contextmenu', context);
    c.addEventListener('webglcontextlost', lost);
    this.cleanup.push(() => {
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', up);
      c.removeEventListener('lostpointercapture', up);
      c.removeEventListener('pointerleave', leave);
      c.removeEventListener('wheel', wheel);
      c.removeEventListener('contextmenu', context);
      c.removeEventListener('webglcontextlost', lost);
    });
    this.animate(0);
  }
  loadYardSky(manager: THREE.LoadingManager) {
    new HDRLoader(manager).load('/materials/yard-sky/industrial-sunset-2k.hdr', (texture) => {
      if (this.disposed) {
        texture.dispose();
        return;
      }
      texture.mapping = THREE.EquirectangularReflectionMapping;
      this.textures.push(texture);
      this.scene.background = texture;
      this.scene.backgroundIntensity = 0.8;
      this.scene.backgroundRotation.y = 0.35;
      const pmrem = new THREE.PMREMGenerator(this.renderer),
        target = pmrem.fromEquirectangular(texture);
      pmrem.dispose();
      for (const material of this.yardMaterials) {
        material.envMap = target.texture;
        material.envMapIntensity = 0.85;
        material.envMapRotation.y = 0.35;
        material.needsUpdate = true;
      }
      this.cleanup.push(() => target.dispose());
    });
  }
  mat(p: THREE.MeshStandardMaterialParameters) {
    const m = new THREE.MeshStandardMaterial(p);
    this.materials.push(m);
    return m;
  }
  geo(w: number, h: number, d: number, round = 0.02) {
    const key = [w, h, d, round].join(',');
    if (!this.geometries.has(key)) {
      const g = round
        ? new RoundedBoxGeometry(w, h, d, 2, Math.min(round, w / 4, h / 4, d / 4))
        : new THREE.BoxGeometry(w, h, d);
      const pos = g.getAttribute('position'),
        norm = g.getAttribute('normal'),
        uv = g.getAttribute('uv');
      for (let i = 0; i < pos.count; i++) {
        const nx = norm.getX(i),
          ny = norm.getY(i),
          nz = norm.getZ(i);
        if (Math.abs(nz) >= Math.abs(nx) && Math.abs(nz) >= Math.abs(ny))
          uv.setXY(i, pos.getX(i) * Math.sign(nz), pos.getY(i));
        else if (Math.abs(nx) > Math.abs(ny))
          uv.setXY(i, -pos.getZ(i) * Math.sign(nx), pos.getY(i));
        else uv.setXY(i, pos.getX(i), -pos.getZ(i) * Math.sign(ny));
      }
      this.geometries.set(key, g);
    }
    return this.geometries.get(key)!;
  }
  box(
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    round = 0.02,
  ) {
    const m = new THREE.Mesh(this.geo(w, h, d, round), mat);
    m.position.set(x, y, z);
    m.castShadow = w * h * d > 0.001 && !mat.transparent;
    m.receiveShadow = !mat.transparent;
    parent.add(m);
    return m;
  }
  cylinder(
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    r: number,
    length: number,
    mat: THREE.Material,
    segments = 12,
  ) {
    const key = 'c' + [r, length, segments];
    if (!this.geometries.has(key))
      this.geometries.set(key, new THREE.CylinderGeometry(r, r, length, segments));
    const m = new THREE.Mesh(this.geometries.get(key)!, mat);
    m.rotation.x = Math.PI / 2;
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }
  tube(parent: THREE.Object3D, points: number[][], radius: number, mat: THREE.Material) {
    const curve = new THREE.CatmullRomCurve3(
      points.map((v) => new THREE.Vector3(...(v as [number, number, number]))),
    );
    const geo = new THREE.TubeGeometry(curve, 24, radius, 7, false);
    this.geometries.set('tube' + this.geometries.size, geo);
    const m = new THREE.Mesh(geo, mat);
    parent.add(m);
    return m;
  }
  rail(points: number[][], radius: number, material: THREE.Material) {
    // Straight extrusions follow the actual panel edges without spline overshoot.
    for (let i = 1; i < points.length; i++) {
      const a = new THREE.Vector3(...(points[i - 1] as [number, number, number])),
        b = new THREE.Vector3(...(points[i] as [number, number, number]));
      const direction = b.clone().sub(a),
        center = a.clone().add(b).multiplyScalar(0.5);
      const bar = this.cylinder(
        this.scene,
        center.x,
        center.y,
        center.z,
        radius,
        direction.length() + radius * 0.6,
        material,
        8,
      );
      bar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    }
  }
  shellPatch(points: number[][], material: THREE.Material, thickness = 0.065) {
    const vertices = points.map((p) => new THREE.Vector3(...(p as [number, number, number])));
    const normal = new THREE.Vector3()
      .subVectors(vertices[1], vertices[0])
      .cross(new THREE.Vector3().subVectors(vertices[2], vertices[0]))
      .normalize()
      .multiplyScalar(thickness / 2);
    const count = vertices.length,
      positions: number[] = [],
      indices: number[] = [];
    for (const direction of [1, -1])
      for (const vertex of vertices)
        positions.push(...vertex.clone().addScaledVector(normal, direction).toArray());
    for (let i = 1; i < count - 1; i++) indices.push(0, i, i + 1, count, count + i + 1, count + i);
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      indices.push(i, count + i, j, j, count + i, count + j);
    }
    const indexed = new THREE.BufferGeometry();
    indexed.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    indexed.setIndex(indices);
    const geometry = indexed.toNonIndexed();
    indexed.dispose();
    geometry.computeVertexNormals();
    const pos = geometry.getAttribute('position'),
      uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = pos.getX(i);
      uv[i * 2 + 1] = pos.getY(i) + pos.getZ(i);
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geometries.set('shell' + this.geometries.size, geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }
  bolt(parent: THREE.Object3D, x: number, y: number, z: number) {
    this.cylinder(parent, x, y, z, 0.023, 0.015, this.steelMat, 6);
    this.box(parent, x, y, z + 0.012, 0.026, 0.004, 0.003, this.darkMat, 0);
  }
  panel(parent: THREE.Object3D, x: number, y: number, z: number, w: number, h: number) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    this.box(g, 0, 0, -0.025, w + 0.025, h + 0.025, 0.07, this.edgeMat);
    this.box(g, 0, 0, 0.018, w, h, 0.055, this.bodyMat);
    for (const sx of [-1, 1])
      for (const sy of [-1, 1]) this.bolt(g, sx * (w / 2 - 0.05), sy * (h / 2 - 0.05), 0.06);
    return g;
  }
  label(
    parent: THREE.Object3D,
    text: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h = 0.045,
    color = '#c4cbd2',
    bg = '',
  ) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = Math.max(32, Math.round((1024 * h) / w));
    const ctx = canvas.getContext('2d')!;
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    let size = Math.floor(canvas.height * 0.73);
    ctx.font = '600 ' + size + 'px monospace';
    const measured = ctx.measureText(text).width;
    if (measured > 980) {
      size = Math.floor((size * 980) / measured);
      ctx.font = '600 ' + size + 'px monospace';
    }
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 512, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.textures.push(texture);
    const mat = new THREE.MeshStandardMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      roughness: 0.85,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.materials.push(mat);
    return this.plane(parent, x, y, z + 0.003, w, h, mat);
  }
  materialTexture(kind: string, file: string, repeat: number, color = false) {
    const key = kind + '/' + file;
    const cached = this.textureCache.get(key);
    if (cached) return cached;
    const t = this.loader.load('/materials/' + key, () => {
      if (this.disposed) t.dispose();
    });
    t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.textures.push(t);
    this.textureCache.set(key, t);
    return t;
  }
  pbr(kind: string, color: number, roughness: number, normal: number, repeat: number) {
    const map = this.materialTexture(kind, 'color.webp', repeat, true),
      normalMap = this.materialTexture(kind, 'normal.webp', repeat),
      orm = this.materialTexture(kind, 'orm.webp', repeat);
    return this.mat({
      color,
      map,
      normalMap,
      normalScale: new THREE.Vector2(normal, normal),
      roughnessMap: orm,
      metalnessMap: orm,
      aoMap: orm,
      aoMapIntensity: 0.65,
      metalness: 1,
      roughness,
    });
  }
  plane(
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    material: THREE.Material,
  ) {
    const key = 'plane:' + w + ':' + h;
    if (!this.geometries.has(key)) this.geometries.set(key, new THREE.PlaneGeometry(w, h));
    const mesh = new THREE.Mesh(this.geometries.get(key)!, material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }
  target(object: THREE.Object3D, action: number, label: string, focus = false) {
    object.userData = { action, label, focus };
    this.targets.push(object);
  }
  buildHangar() {
    return buildHangarImpl(this);
  }
  buildShell() {
    return buildShellImpl(this);
  }
  buildCeilingLamp() {
    return buildCeilingLampImpl(this);
  }
  buildBraceLighting(side: number) {
    return buildBraceLightingImpl(this, side);
  }
  buildShellTransitions(side: number, lining: THREE.Material, inset: THREE.Material) {
    return buildShellTransitionsImpl(this, side, lining, inset);
  }
  buildInteriorSide(
    side: number,
    lining: THREE.Material,
    inset: THREE.Material,
    diffuser: THREE.Material,
  ) {
    return buildInteriorSideImpl(this, side, lining, inset, diffuser);
  }
  screen(
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    kind: string,
    title: string,
  ) {
    return screenImpl(this, parent, x, y, z, w, h, kind, title);
  }
  buildConsole() {
    return buildConsoleImpl(this);
  }
  addSwitch(
    parent: THREE.Object3D,
    x: number,
    y: number,
    index: number,
    title: string,
    push = false,
  ) {
    return addSwitchImpl(this, parent, x, y, index, title, push);
  }
  buildOverhead() {
    return buildOverheadImpl(this);
  }
  buildTopMonitor(side: number) {
    return buildTopMonitorImpl(this, side);
  }
  buildSideMonitor(side: number) {
    return buildSideMonitorImpl(this, side);
  }
  buildSide(side: number) {
    return buildSideImpl(this, side);
  }
  buildSeat() {
    return buildSeatImpl(this);
  }
  buildMechanicalDetails() {
    return buildMechanicalDetailsImpl(this);
  }
  addGauge(
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    r: number,
    kind: number,
    title: string,
  ) {
    return addGaugeImpl(this, parent, x, y, z, r, kind, title);
  }
  pick(e: PointerEvent) {
    if (this.inHangar || this.inYard || this.inMech) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      (-(e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.ray.setFromCamera(this.pointer, this.camera);
    const hits = this.ray.intersectObjects(this.pickMeshes, false);
    for (const hit of hits) {
      if (hit.object.userData.mobilityControl) {
        const state = this.getState(),
          action = hit.object.userData.action;
        if (state.shutdownPhase !== 'idle') {
          if (![30, 35, 84].includes(action)) continue;
        } else if (
          hit.object.userData.mobilityPage &&
          hit.object.userData.mobilityPage !== state.mobility.page
        )
          continue;
      }
      if (
        hit.object.userData.servicePage &&
        hit.object.userData.servicePage !== this.getState().service.page
      )
        continue;
      let obj: THREE.Object3D | null = hit.object;
      while (obj) {
        if (obj.userData.label) return obj;
        obj = obj.parent;
      }
      if (hit.object.userData.switchDetail) continue;
      if (
        !(hit.object instanceof THREE.Mesh) ||
        !(hit.object.material instanceof THREE.Material) ||
        !hit.object.material.transparent
      )
        return null;
    }
    return null;
  }
  focus(p: THREE.Vector3) {
    const d = this.cabin.worldToLocal(p.clone()).sub(this.camera.position);
    this.targetYaw = Math.atan2(-d.x, -d.z);
    this.targetPitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    this.targetFov = 22;
    this.hover(null);
  }
  reset() {
    this.view('front');
  }
  view(name: CameraView) {
    const wasExterior = this.inHangar || this.inYard || this.inMech;
    this.inHangar = name === 'hangar';
    this.inYard = name === 'yard';
    this.inMech = name === 'mech';
    const outside = this.inHangar || this.inYard || this.inMech;
    this.cabin.visible = true;
    this.camera.near = outside ? 0.08 : 0.08 * MECH.cabinScale;
    (outside ? this.scene : this.cabin).add(this.camera);
    // Cut to a hall camera beyond the opaque capsule, never fly through its screens.
    // All cockpit presets restore the actual pilot position before aiming.
    if (this.inYard) this.camera.position.set(...YARD.camera);
    else this.camera.position.set(0, this.inHangar ? 2.5 : 1.6, this.inHangar ? -4.5 : 3.85);
    const presets: Record<CameraView, [number, number, number]> = {
      front: [0, -0.12, 60],
      overhead: [0, 0.365, 40],
      left: [0.42, -0.46, 52],
      right: [-0.42, -0.46, 52],
      panel: [0, -0.27, 41],
      hangar: [0, 0.035, 70],
      yard: [0.16, -0.12, 65],
      mech: [0, 0, 55],
    };
    [this.targetYaw, this.targetPitch, this.targetFov] = presets[name];
    if (wasExterior !== outside || outside) {
      this.yaw = this.targetYaw;
      this.pitch = this.targetPitch;
      this.camera.fov = this.targetFov;
      this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
      this.camera.updateProjectionMatrix();
    }
    if (this.inMech) {
      this.orbitPreset('front');
      this.orbitYaw = this.targetOrbitYaw;
      this.orbitPitch = this.targetOrbitPitch;
      this.orbitDistance = this.targetOrbitDistance;
      this.updateOrbit(1);
    }
    this.renderer.toneMappingExposure = this.inMech
      ? 1.05
      : this.inYard
        ? 1.05
        : this.inHangar
          ? 1.2
          : 0.94;
    this.scene.environmentIntensity = this.inMech ? 0.55 : 0.18;
    if (this.scene.fog instanceof THREE.FogExp2)
      this.scene.fog.density = this.inYard ? 0.0035 : 0.0025;
    this.camera.updateMatrixWorld();
    this.pendingPointer = null;
    this.hover(null);
  }
  orbitPreset(view: 'front' | 'rear' | 'side') {
    this.targetOrbitYaw = view === 'rear' ? Math.PI + 0.55 : view === 'side' ? Math.PI / 2 : 0.65;
    this.targetOrbitPitch = 0.18;
    this.targetOrbitDistance = MECH.orbitRadius;
  }
  updateOrbit(damp: number) {
    this.orbitYaw += (this.targetOrbitYaw - this.orbitYaw) * damp;
    this.orbitPitch += (this.targetOrbitPitch - this.orbitPitch) * damp;
    this.orbitDistance += (this.targetOrbitDistance - this.orbitDistance) * damp;
    const w = this.walkPose,
      angle = this.orbitYaw - w.yaw,
      target = new THREE.Vector3(w.x, w.height + MECH.orbitTargetY, w.z);
    const radius = this.orbitDistance * Math.cos(this.orbitPitch);
    this.camera.position.set(
      target.x + Math.sin(angle) * radius,
      target.y + Math.sin(this.orbitPitch) * this.orbitDistance,
      target.z - Math.cos(angle) * radius,
    );
    // Keep the inspection camera inside the hall when the Mech is in the hall.
    // Orbiting past its rear wall must not produce a view from outside an opaque wall.
    if (w.z > -30) {
      this.camera.position.x = THREE.MathUtils.clamp(this.camera.position.x, -16.7, 16.7);
      this.camera.position.z = THREE.MathUtils.clamp(this.camera.position.z, -32, 9.65);
      this.camera.position.y = Math.min(this.camera.position.y, 9.35);
    }
    this.camera.position.y = Math.max(this.camera.position.y, MECH.floor + 0.55 + w.height);
    this.camera.lookAt(target);
  }
  cameraAction(action: number) {
    if (!this.surround || this.displayBoot.phase !== 'ready') return;
    this.surround.select(action - 100);
    const screen = this.screens.find((sc) => sc.kind === 'cameras');
    if (screen) {
      screen.material.map = this.surround.systems ? screen.texture : this.surround.output.texture;
      screen.lastDraw = -Infinity;
      this.focus(screen.mesh.getWorldPosition(new THREE.Vector3()));
    }
  }
  drawScreen(sc: Screen, s: MachineState, time: number) {
    renderDisplay(
      sc.ctx,
      sc.kind,
      s,
      this.displayBoot,
      time,
      this.screens.indexOf(sc),
      this.reduced,
      this.radarAngle,
      this.telemetry,
      this.instrumentAssets,
    );
    sc.texture.needsUpdate = true;
  }

  animate = (ms: number) => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.animate);
    if (document.hidden) {
      this.lastTime = ms;
      return;
    }
    const dt = Math.min((ms - this.lastTime) / 1000, 0.1) || 0.016;
    this.lastTime = ms;
    const s = this.getState(),
      time = ms / 1000;
    const damp = 1 - Math.exp(-dt * 10);
    const cold = coldCockpit(s);
    if (this.displayBoot.update(s, ms)) {
      for (const sc of this.screens) {
        sc.lastDraw = -Infinity;
        if (this.displayBoot.phase === 'off') this.drawScreen(sc, s, time);
      }
      if (this.displayBoot.phase === 'off') this.surround?.reset();
    }
    this.onDisplayBoot(this.displayBoot);
    for (let i = 0; i < this.gateLeaves.length; i++)
      this.gateLeaves[i].position.x =
        (i === 0 ? -1 : 1) * (3.45 + s.hangar.position * YARD.gateTravel);
    if (s.stage >= 5 && !s.radarPaused && !this.reduced)
      this.radarAngle = (this.radarAngle + dt * 0.65) % (Math.PI * 2);
    for (const knob of this.knobs) {
      let value = 0;
      if (knob.action === 20) value = s.fanLevel / 3;
      if (knob.action === 21) value = [150, 210, 280].indexOf(s.hydraulicPressure) / 2;
      if (knob.action === 22) value = [0.4, 0.7, 1].indexOf(s.displayBrightness) / 2;
      if (knob.action === 31) value = s.ceilingBrightness;
      if (knob.action === 33) value = (s.coolingLevel - 1) / 2;
      if (knob.action === 23) value = [125, 250, 500, 1000].indexOf(s.radarRange) / 3;
      if (knob.action === 24) value = s.radarPaused ? 0 : 1;
      if (knob.action === 25) value = s.hudEnabled ? 1 : 0;
      knob.pivot.rotation.z += (1.9 - value * 3.8 - knob.pivot.rotation.z) * damp;
    }
    for (const sc of this.screens)
      sc.material.color.setScalar(this.displayBoot.phase === 'off' ? 0 : 1.2 * s.displayBrightness);
    if (this.screenSpill)
      this.screenSpill.intensity +=
        ((this.displayBoot.phase === 'off' ? 0 : instrumentSpill(s)) *
          MECH.cabinScale ** this.screenSpill.decay -
          this.screenSpill.intensity) *
        damp;
    this.yaw += (this.targetYaw - this.yaw) * damp;
    this.pitch += (this.targetPitch - this.pitch) * damp;
    if (this.camera.fov !== this.targetFov) {
      this.camera.fov =
        Math.abs(this.targetFov - this.camera.fov) < 0.005
          ? this.targetFov
          : this.camera.fov + (this.targetFov - this.camera.fov) * damp;
      this.camera.updateProjectionMatrix();
    }
    this.walkPresentation.sample(s.walk, s.simAt, ms, this.walkPose);
    this.jointPresentation.sample(s.articulation.pose, s.simAt, ms, this.jointPose);
    const walk = this.walkPose,
      walking = Math.min(1, Math.abs(walk.speed) / 0.8 + Math.abs(walk.turnRate) * 3);
    const phase = walk.phase * Math.PI * 2,
      amplitude = this.reduced ? 0 : s.walk.sway * walking;
    const outside = this.inMech || this.inHangar || this.inYard;
    setCockpitInterior(this.cabin, this.interior, !outside);
    applyMechBodyPose(
      this.cabin,
      walk,
      outside ? 1 : this.reduced ? 0 : Math.min(1, s.walk.sway / 0.4),
      false,
      this.jointPose.torso,
    );
    this.exterior?.update(this.cabin, s, walk, this.inMech, outside, this.jointPose);
    const looking =
      this.drag ||
      Math.abs(this.targetYaw - this.yaw) + Math.abs(this.targetPitch - this.pitch) > 0.002;
    const vibration =
      !this.inHangar &&
      !this.inYard &&
      !this.inMech &&
      !looking &&
      !this.reduced &&
      (s.stage >= 4 || s.busy === 3)
        ? Math.sin(time * 39) * (0.00055 + (actuatorMoving(s) ? 0.0009 : 0)) * (1 + s.throttle)
        : 0;
    this.camera.rotation.set(this.pitch + vibration, this.yaw, 0, 'YXZ');
    if (this.inMech) this.updateOrbit(damp);
    if (!this.inHangar && !this.inYard && !this.inMech) {
      const visual = looking ? amplitude * 0.25 : amplitude;
      this.camera.position.set(
        Math.sin(phase) * 0.045 * visual,
        1.6 + (1 - Math.cos(phase * 2)) * 0.055 * visual,
        3.85,
      );
      this.camera.rotation.z += Math.sin(phase) * 0.012 * visual;
    }
    for (const sw of this.switches) {
      const overhead = sw.index >= 40,
        on = overhead ? overheadOn(s, sw.index) : s.stage > sw.index || s.busy === sw.index;
      const busy = overhead
        ? (sw.index === 42 && s.overhead.apuPhase === 'preparing') ||
          (sw.index === 43 && s.overhead.apuPhase === 'starting')
        : s.busy === sw.index;
      if (sw.push) sw.pivot.position.z += ((on ? 0.05 : 0.059) - sw.pivot.position.z) * damp;
      else sw.pivot.rotation.x += ((on ? -0.6 : 0.6) - sw.pivot.rotation.x) * damp;
      const test = dcPowerAvailable(s) && s.overhead.lampUntil > s.simAt;
      const available = sw.index === 43 && s.overhead.apuPhase === 'ready';
      sw.led.emissiveIntensity = cold
        ? sw.index === 40
          ? batteryBeacon(s, time, this.reduced)
          : 0
        : test
          ? 1.6
          : busy
            ? 0.45 + 0.65 * (0.5 + 0.5 * Math.sin(time * 7))
            : on || available
              ? 1.3
              : 0;
    }
    for (const led of this.cautionLeds) {
      led.emissive.setHex(s.thermalLimited ? 0xf16d49 : 0xffb956);
      led.emissiveIntensity =
        !cold &&
        dcPowerAvailable(s) &&
        (s.thermalWarning || serviceWarning(s) || s.shutdownPhase === 'interrupted')
          ? 1.8
          : 0;
    }
    const lighting = cold ? { work: false, intensity: 0, emission: 0 } : cabinLighting(s),
      lightColor = lighting.work ? this.workLightColor : this.standbyLightColor;
    for (const light of this.panelLights) {
      light.intensity += (lighting.intensity * MECH.cabinScale ** 2 - light.intensity) * damp;
      light.color.lerp(lightColor, damp);
    }
    for (const material of this.cabinFixtures) {
      material.emissiveIntensity += (lighting.emission - material.emissiveIntensity) * damp;
      material.emissive.lerp(lightColor, damp);
    }
    const ceiling = cold ? { intensity: 0, emission: 0 } : ceilingLighting(s);
    if (this.ceilingLight)
      this.ceilingLight.intensity +=
        (ceiling.intensity * MECH.cabinScale ** this.ceilingLight.decay -
          this.ceilingLight.intensity) *
        damp;
    if (this.ceilingLens)
      this.ceilingLens.emissiveIntensity +=
        (ceiling.emission - this.ceilingLens.emissiveIntensity) * damp;
    const braces = cold ? { intensity: 0, emission: 0 } : braceLighting(s);
    for (const light of this.braceLights)
      light.intensity +=
        (braces.intensity * MECH.cabinScale ** light.decay - light.intensity) * damp;
    if (this.braceLens)
      this.braceLens.emissiveIntensity +=
        (braces.emission - this.braceLens.emissiveIntensity) * damp;
    for (const g of this.gauges) {
      const amount =
        g.kind === 0 ? Math.min(1, electricalReadings(s).voltage / 28) : s.actualPressure / 350;
      g.needle.rotation.z += (2.4 - amount * 4.3 - g.needle.rotation.z) * damp;
    }
    if (this.throttle)
      this.throttle.position.y += (-0.12 + s.throttle * 0.25 - this.throttle.position.y) * damp;
    if (ms - this.lastDraw > 125) {
      this.telemetry.push({ pressure: s.actualPressure, temperature: s.temperature });
      if (this.telemetry.length > 96) this.telemetry.shift();
      this.lastDraw = ms;
    }
    this.scene.updateMatrixWorld();
    this.camera.updateMatrixWorld();
    this.screenFrustum.setFromProjectionMatrix(
      this.viewProjection.multiplyMatrices(
        this.camera.projectionMatrix,
        this.camera.matrixWorldInverse,
      ),
    );
    const cameraScreen = this.screens.find((sc) => sc.kind === 'cameras');
    const ready = this.displayBoot.phase === 'ready';
    if (cameraScreen && this.surround) {
      cameraScreen.material.map =
        ready && !this.surround.systems ? this.surround.output.texture : cameraScreen.texture;
      if (ready) {
        this.surround.reducedMotion = this.reduced;
        this.surround.update(
          ms,
          s,
          !outside && this.screenFrustum.intersectsObject(cameraScreen.mesh),
        );
      }
    }
    const display =
      outside || this.displayBoot.phase === 'off'
        ? undefined
        : nextDisplay(
            this.screens,
            ms,
            (sc) =>
              (!ready || sc.kind !== 'cameras' || !!this.surround?.systems) &&
              this.screenFrustum.intersectsObject(sc.mesh),
          );
    if (display) {
      this.drawScreen(display, s, time);
      display.lastDraw = ms;
    }
    this.renderer.render(this.scene, this.camera);
    if (this.pendingPointer && !this.drag && ms - this.lastHover >= 50) {
      const e = this.pendingPointer;
      this.pendingPointer = null;
      this.lastHover = ms;
      const hit = this.pick(e);
      this.hover(hit ? { text: hit.userData.label, x: e.clientX, y: e.clientY } : null);
      this.renderer.domElement.style.cursor = hit ? 'pointer' : 'default';
    }
  };
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.cleanup.forEach((f) => f());
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.textures.forEach((t) => t.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
