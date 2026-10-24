import { SurroundCameras, SURROUND_VIEWS } from './surround-cameras';
import { WALK } from './walking';
import { buildYard, YARD } from './yard-scene';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { MOBILITY_CONTROLS } from './mobility';
import { SERVICE_CONTROLS, serviceWarning, electricalReadings } from './service-systems';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  STEPS,
  actuatorMoving,
  dcPowerAvailable,
  mainPowerAvailable,
  overheadOn,
  type MachineState,
} from './machine';
import { STRUCTURE_ATLAS, type InstrumentAssets, type TelemetrySample } from './instruments';
import {
  batchStaticCockpit,
  cockpitPixelRatio,
  nextDisplay,
  cabinLighting,
  instrumentSpill,
  ceilingLighting,
  braceLighting,
} from './cockpit-rendering';
import { CABIN, FRONT_FRAME, ROOF_FRAME } from './cockpit-envelope';
import { MechExterior, MECH, applyMechBodyPose } from './mech-exterior';
import { WalkPresentation } from './walk-presentation';
import { JointPresentation, neutralJoints } from './articulation';
import { setCockpitInterior } from './cockpit-rendering';
import { DisplayBoot, renderDisplay, coldCockpit, batteryBeacon } from './display-boot';
type Hover = { text: string; x: number; y: number } | null;
type Screen = {
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
    const hall = new THREE.Group();
    hall.name = 'Hangar 07';
    this.scene.add(hall);
    const concrete = this.mat({ color: 0x363f43, roughness: 0.95, metalness: 0.06 });
    const rib = this.mat({ color: 0x647379, roughness: 0.72, metalness: 0.4 });
    const gate = this.mat({ color: 0x526067, roughness: 0.82, metalness: 0.28 });
    const yellow = this.mat({ color: 0xbc9850, roughness: 0.82, metalness: 0.1 });
    const lamp = this.mat({
      color: 0xd9e7e8,
      emissive: 0xc8dce0,
      emissiveIntensity: 2.2,
      roughness: 0.5,
      toneMapped: false,
    });
    // Shared low-poly extrusions keep the larger hall inexpensive to batch.
    const block = (
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
      m: THREE.Material = rib,
    ) => this.box(hall, x, y, z, w, h, d, m, 0);
    const beam = (a: number[], b: number[], width: number, material: THREE.Material = rib) => {
      const start = new THREE.Vector3(...(a as [number, number, number])),
        end = new THREE.Vector3(...(b as [number, number, number]));
      const direction = end.clone().sub(start),
        center = start.add(end).multiplyScalar(0.5);
      const mesh = block(
        center.x,
        center.y,
        center.z,
        width,
        direction.length() + 0.04,
        width,
        material,
      );
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
      return mesh;
    };
    // Closed 36 x 46 hall: every column lands on the slab, the roof sits on the portals.
    block(0, -2.8, -12, 36, 0.4, 46, concrete);
    block(0, 10.6, -12, 36, 0.4, 46, concrete);
    for (const side of [-1, 1]) block(side * 12.45, 3.9, -34.8, 11.1, 13, 0.4, concrete);
    block(0, 9.5, -34.8, 13.8, 2, 0.4, concrete);
    block(0, 3.9, 10.8, 36, 13, 0.4, concrete);
    for (const s of [-1, 1]) block(s * 17.8, 3.9, -12, 0.4, 13, 46, concrete);
    for (const z of [-30, -20, -10, 0, 9.6]) {
      for (const s of [-1, 1]) {
        block(s * 12, 3.9, z, 0.34, 13, 0.65);
        for (const dz of [-0.35, 0.35]) block(s * 12, 3.9, z + dz, 0.8, 13, 0.09);
        block(s * 12, -2.5, z, 1.35, 0.2, 1.25);
        beam([s * 12, 7.3, z], [s * 9, 9.9, z], 0.22);
        block(s * 15, 9.9, z, 6, 0.45, 0.45);
      }
      block(0, 9.9, z, 24.8, 0.6, 0.22);
      for (const y of [9.6, 10.2]) block(0, y, z, 24.8, 0.1, 0.85);
    }
    for (const x of [-12, -6, 0, 6, 12]) block(x, 10.35, -12, 0.18, 0.12, 45);
    for (const s of [-1, 1]) {
      block(s * 12, 6.8, -12, 0.25, 0.45, 45);
      for (const [a, b] of [
        [-30, -20],
        [-20, -10],
      ])
        beam([s * 12, -2.4, a], [s * 12, 6.8, b], 0.14);
    }
    // Recessed segmented blast door and its own frame, beyond the service gantries.
    const gateSurface = this.pbr('yard-container', 0x88999b, 0.9, 0.25, 0.32);
    this.yardMaterials.push(gateSurface);
    for (const side of [-1, 1]) {
      const leaf = new THREE.Group();
      leaf.name = side < 0 ? 'Port sliding gate' : 'Starboard sliding gate';
      leaf.position.set(side * 3.45, 0, -34.45);
      hall.add(leaf);
      this.gateLeaves.push(leaf);
      for (let i = 0; i < 16; i++)
        this.box(leaf, 0, -2.25 + i * 0.66, 0, 6.9, 0.635, 0.24, gateSurface, 0);
      for (const x of [-3.38, 3.38]) this.box(leaf, x, 2.95, 0.15, 0.12, 10.65, 0.09, rib, 0);
      this.label(leaf, side < 0 ? '07' : 'EXIT', 0, 4.5, 0.17, 3.9, 1.4, '#d1d9cd');
      this.label(
        leaf,
        side < 0 ? 'SERVICE HANGAR' : 'PROVING GROUND',
        0,
        2.8,
        0.17,
        5.5,
        0.35,
        '#bec9c5',
      );
    }
    for (const x of [-7.3, 7.3]) {
      block(x, 3, -33.95, 0.7, 11.2, 0.5);
      for (let i = 0; i < 11; i++)
        block(x, -2.2 + i * 0.9, -33.68, 0.71, 0.4, 0.035, i % 2 ? this.darkMat : yellow);
    }
    block(0, 8.3, -33.95, 15.3, 0.7, 0.5);
    this.label(hall, 'HANGAR 07 / TEST RANGE', 0, 8.3, -33.65, 12, 0.37, '#d3c797');
    // Two supported maintenance decks; stair stringers and guardrails share their joints.
    for (const s of [-1, 1]) {
      block(s * 7, 0.08, -22, 4.2, 0.3, 16, yellow);
      block(s * 7, 0.26, -22, 4, 0.08, 16, this.darkMat);
      for (const z of [-29.7, -24.5, -19.3, -14.3])
        for (const x of [5.1, 8.9]) {
          block(s * x, -1.2, z, 0.22, 2.8, 0.22);
          block(s * x, -2.53, z, 0.55, 0.14, 0.55);
          block(s * x, 0.9, z, 0.065, 1.2, 0.065, yellow);
        }
      for (const x of [5.1, 8.9])
        for (const y of [0.85, 1.5]) block(s * x, y, -22, 0.075, 0.075, 15.5, yellow);
      block(s * 7, 1.5, -29.7, 3.85, 0.075, 0.075, yellow);
      for (let i = 0; i < 12; i++)
        block(s * 7, -2.48 + i * 0.23, -9.7 - i * 0.37, 2, 0.15, 0.4, gate);
      for (const x of [6, 8]) {
        beam([s * x, -2.6, -9.45], [s * x, 0.15, -14.15], 0.12);
        beam([s * x, -1.4, -9.45], [s * x, 1.5, -14.15], 0.075, yellow);
        for (const [y, z] of [
          [-2.48, -9.7],
          [-1.1, -11.92],
          [0.2, -14.14],
        ])
          block(s * x, y + 0.6, z, 0.07, 1.4, 0.07, yellow);
      }
      this.label(
        hall,
        s < 0 ? '01 / POWER SERVICE' : '02 / ACTUATOR SERVICE',
        s * 7,
        -0.1,
        -13.82,
        3.7,
        0.24,
        '#201f1a',
      );
      // Utilities behind the decks, clear of the pilot's forward aperture.
      block(s * 10, -0.95, -24, 1.6, 3.3, 2.1, gate);
      block(s * 10, 0.05, -22.92, 1.25, 1.05, 0.045, this.darkMat);
      this.label(hall, s < 0 ? 'AUX POWER' : 'COOLANT', s * 10, 0.05, -22.88, 1.1, 0.2);
      for (let i = 0; i < 6; i++)
        block(s * 10, -1.6 + i * 0.14, -22.92, 1.25, 0.045, 0.04, this.darkMat);
      beam([s * 10, 0.6, -25], [s * 10, 0.6, -30], 0.18);
      beam([s * 10, 0.6, -30], [s * 10, -2.5, -30], 0.18);
      for (const z of [-28, -24, -20, -16]) block(s * 4.6, -2.586, z, 0.13, 0.025, 2.4, yellow);
    }
    // Connected rear catwalk and an overhead bridge crane on longitudinal rails.
    // Side landings keep the entire gate lane clear at ground level.
    for (const side of [-1, 1]) {
      block(side * 8.8, 0.08, -31.3, 3.6, 0.3, 3.4, gate);
      for (const x of [7.1, 10.5]) {
        block(side * x, -1.2, -31.3, 0.22, 2.8, 0.22);
        block(side * x, 0.9, -32.9, 0.07, 1.2, 0.07, yellow);
      }
      for (const y of [0.85, 1.5]) block(side * 8.8, y, -32.9, 3.4, 0.075, 0.075, yellow);
    }
    for (const s of [-1, 1]) {
      block(s * 11.5, 7.25, -22, 0.5, 0.45, 24, yellow);
      for (const z of [-30, -20, -10]) block(s * 11.7, 6.92, z, 0.7, 0.3, 0.8);
    }
    block(0, 7.85, -27, 23.5, 0.8, 0.7, yellow);
    block(0, 7.85, -28.2, 23.5, 0.8, 0.7, yellow);
    for (const s of [-1, 1]) block(s * 11.5, 7.5, -27.6, 0.8, 0.3, 2.5, this.darkMat);
    // Park the hoist beside the travel lane, clear of the full-height capsule.
    block(9.4, 7.35, -27.6, 1.9, 0.45, 1.8, this.darkMat);
    for (const x of [9, 9.8]) block(x, 5.9, -27.6, 0.045, 2.6, 0.045, this.steelMat);
    block(9.4, 4.65, -27.6, 1.1, 0.4, 0.55, yellow);
    beam([9.4, 4.45, -27.6], [9.4, 4, -27.6], 0.09);
    beam([9.4, 4, -27.6], [9.75, 4, -27.6], 0.09);
    this.label(hall, 'IV / 40 T', -2.5, 7.85, -26.63, 3, 0.42, '#25251e');
    // Visible ceiling fixtures, independently powered by the hall. Their cones end
    // in the service area: no replacement light is placed inside or aimed at the cockpit.
    for (const s of [-1, 1])
      for (const z of [-30, -20, -10]) {
        for (const x of [s * 4.6, s * 6.6]) block(x, 8.85, z, 0.065, 2.1, 0.065);
        block(s * 5.6, 7.72, z, 2.6, 0.25, 0.65, this.darkMat);
        block(s * 5.6, 7.57, z, 2.4, 0.05, 0.5, lamp);
        if (z === -20) {
          const light = new THREE.SpotLight(0xc8dce0, 125, 22, 1.0, 0.65, 1.35);
          light.name = s < 0 ? 'Port hall floodlight' : 'Starboard hall floodlight';
          light.position.set(s * 5.6, 7.5, z);
          light.target.position.set(s * 4, -0.5, -29);
          hall.add(light, light.target);
        }
      }
    // Dim gate markers read at a distance without another lighting pass.
    for (const x of [-7.8, 7.8]) block(x, 3.1, -33.66, 0.08, 8.8, 0.04, lamp);
  }
  buildShell() {
    const root = this.scene;
    // Quiet powder-coated interior finish; supplied metal normal map adds fine relief.
    const lining = this.mat({
      color: 0x344550,
      metalness: 0.28,
      roughness: 0.74,
      normalMap: this.bodyMat.normalMap,
      normalScale: new THREE.Vector2(0.075, 0.075),
    });
    const sideLining = this.pbr('shutter', 0xffffff, 0.96, 0.6, 1);
    // Compensate the side group's nonuniform scale: one material tile spans 1.45 units.
    for (const texture of [sideLining.map, sideLining.normalMap, sideLining.roughnessMap])
      texture!.repeat.set(CABIN.sideScaleX / 1.45, CABIN.sideScaleY / 1.45);
    const inset = this.mat({ color: 0x25333d, metalness: 0.22, roughness: 0.81 });
    const diffuser = this.mat({
      color: 0x283038,
      emissive: 0xffe4be,
      emissiveIntensity: 0,
      roughness: 0.5,
      metalness: 0,
      toneMapped: false,
    });
    this.cabinFixtures.push(diffuser);
    this.braceLens = this.mat({
      color: 0x12351a,
      emissive: 0x77ed69,
      emissiveIntensity: 0,
      roughness: 0.48,
      metalness: 0,
      toneMapped: false,
    });
    this.box(root, 0, CABIN.sideBottom - 0.11, 1.5, 5.3, 0.22, 5.36, this.treadMat, 0.025);
    this.shellPatch(
      [
        [-0.7, CABIN.roofY, -1.7],
        [0.7, CABIN.roofY, -1.7],
        [CABIN.roofHalfWidth, CABIN.roofY, CABIN.sideFront],
        [CABIN.roofHalfWidth, CABIN.roofY, CABIN.rearZ],
        [-CABIN.roofHalfWidth, CABIN.roofY, CABIN.rearZ],
        [-CABIN.roofHalfWidth, CABIN.roofY, CABIN.sideFront],
      ],
      inset,
      0.12,
    );
    this.shellPatch(
      [
        [-CABIN.sideX, CABIN.sideBottom, CABIN.rearZ],
        [CABIN.sideX, CABIN.sideBottom, CABIN.rearZ],
        [CABIN.sideX, CABIN.sideTop, CABIN.rearZ],
        [CABIN.roofHalfWidth, CABIN.roofY, CABIN.rearZ],
        [-CABIN.roofHalfWidth, CABIN.roofY, CABIN.rearZ],
        [-CABIN.sideX, CABIN.sideTop, CABIN.rearZ],
      ],
      lining,
      0.1,
    );
    for (const x of [-1.65, 1.65])
      this.box(root, x, 1.0, CABIN.rearZ - 0.055, 0.1, 4.65, 0.12, this.edgeMat, 0.025);
    for (const s of [-1, 1]) {
      this.buildInteriorSide(s, sideLining, inset, diffuser);
      this.buildBraceLighting(s);
      const reflect = (points: number[][]) => points.map(([x, y, z]) => [s * x, y, z]);
      this.tube(root, reflect(FRONT_FRAME), 0.15, this.edgeMat);
      this.tube(root, reflect(ROOF_FRAME), 0.13, this.bodyMat);
      this.buildShellTransitions(s, lining, inset);
      // Continuous frame legs land on bolted shoes, not in empty cabin space.
      for (const z of [1.3, 2]) {
        this.box(
          root,
          s * 2.43,
          CABIN.sideBottom + 0.032,
          z,
          0.36,
          0.065,
          0.42,
          this.edgeMat,
          0.018,
        );
        for (const dz of [-0.14, 0.14]) {
          const bolt = this.cylinder(
            root,
            s * 2.34,
            CABIN.sideBottom + 0.076,
            z + dz,
            0.026,
            0.02,
            this.steelMat,
            6,
          );
          bolt.rotation.x = 0;
        }
      }
      // Two wall cleats hold the side leg of the roof hoop against the lining.
      for (const [y, x] of [
        [1.1, 2.48],
        [2.5, 2.45],
      ]) {
        const socket = new THREE.Group();
        socket.position.set(s * x, y, 2);
        socket.rotation.y = (-s * Math.PI) / 2;
        root.add(socket);
        this.panel(socket, 0, 0, 0, 0.39, 0.33);
        this.box(socket, 0, 0, 0.074, 0.16, 0.27, 0.1, this.edgeMat, 0.025);
      }
      const light = new THREE.PointLight(0xffb45c, 0, 3.2, 2);
      light.position.set(s * 2.05, CABIN.sideY + 1.33 * CABIN.sideScaleY, CABIN.sideZ);
      root.add(light);
      this.panelLights.push(light);
    }
    this.tube(
      root,
      [
        [-0.7, CABIN.roofY, -1.7],
        [0, CABIN.roofY, -1.7],
        [0.7, CABIN.roofY, -1.7],
      ],
      0.15,
      this.edgeMat,
    );
    this.tube(
      root,
      [
        [-2.43, 1.03, -1.04],
        [-1.6, 1.22, -0.55],
        [0, 1.32, -0.4],
        [1.6, 1.22, -0.55],
        [2.43, 1.03, -1.04],
      ],
      0.095,
      this.edgeMat,
    );
    this.buildOverhead();
    this.buildCeilingLamp();
  }
  buildCeilingLamp() {
    // The backplate intersects the roof underside; the guarded lens faces down.
    const fixture = new THREE.Group();
    fixture.name = 'Red ceiling utility lamp';
    fixture.position.set(0, CABIN.roofY - 0.075, 1.3);
    fixture.rotation.x = Math.PI / 2;
    this.scene.add(fixture);
    this.box(fixture, 0, 0, 0, 0.7, 0.48, 0.095, this.edgeMat, 0.035);
    this.box(fixture, 0, 0, 0.065, 0.54, 0.34, 0.1, this.darkMat, 0.065);
    this.ceilingLens = this.mat({
      color: 0x580b0c,
      emissive: 0xff1925,
      emissiveIntensity: 0,
      roughness: 0.38,
      metalness: 0,
      toneMapped: false,
    });
    this.box(fixture, 0, 0, 0.13, 0.43, 0.24, 0.07, this.ceilingLens, 0.055);
    for (const x of [-0.28, 0.28]) for (const y of [-0.17, 0.17]) this.bolt(fixture, x, y, 0.055);
    for (const x of [-0.14, 0, 0.14])
      this.tube(
        fixture,
        [
          [x, -0.16, 0.08],
          [x, -0.12, 0.185],
          [x, 0.12, 0.185],
          [x, 0.16, 0.08],
        ],
        0.013,
        this.steelMat,
      );
    // A diffused, nearly downward beam softens the nearby overhead hotspot.
    // Gentler distance falloff preserves useful light on the farther console/walls.
    this.ceilingLight = new THREE.SpotLight(0xff2330, 0, 8, 1.38, 0.9, 1.4);
    this.ceilingLight.position.set(0, CABIN.roofY - 0.31, 1.3);
    this.ceilingLight.target.position.set(0, 0.8, 0.65);
    this.scene.add(this.ceilingLight, this.ceilingLight.target);
  }
  buildBraceLighting(side: number) {
    // Two segments beside each side leg leave the cable raceway and warm bar clear.
    const rail = new THREE.Group();
    rail.name = side < 0 ? 'Port green brace light' : 'Starboard green brace light';
    rail.position.set(side * 2.4, 0, 1.48);
    rail.rotation.y = (-side * Math.PI) / 2;
    this.scene.add(rail);
    for (const [y, height] of [
      [2.14, 0.44],
      [0.65, 0.54],
    ]) {
      this.box(rail, 0, y, 0.01, 0.13, height + 0.12, 0.11, this.edgeMat, 0.025);
      this.box(rail, 0, y, 0.077, 0.093, height + 0.04, 0.045, this.darkMat, 0.018);
      this.box(rail, 0, y, 0.105, 0.052, height, 0.018, this.braceLens!, 0.009);
      for (const end of [-1, 1]) this.bolt(rail, 0, y + end * (height / 2 + 0.04), 0.07);
    }
    const light = new THREE.PointLight(0x77ed69, 0, 2.6, 1);
    light.position.set(side * 2.02, 1.8, 1.48);
    this.scene.add(light);
    this.braceLights.push(light);
  }
  buildShellTransitions(side: number, lining: THREE.Material, inset: THREE.Material) {
    const point = (x: number, y: number, z: number) => [side * x, y, z];
    const low = point(CABIN.sideX, CABIN.sideBottom, CABIN.sideFront),
      waist = point(CABIN.sideX, 0.8, CABIN.sideFront),
      shoulder = point(CABIN.sideX, CABIN.sideTop, CABIN.sideFront);
    const roof = point(CABIN.roofHalfWidth, CABIN.roofY, CABIN.sideFront),
      rearShoulder = point(CABIN.sideX, CABIN.sideTop, CABIN.rearZ),
      rearRoof = point(CABIN.roofHalfWidth, CABIN.roofY, CABIN.rearZ);
    const frameLow = point(2.47, 0.8, -0.8),
      frameMid = point(2.2, 2.1, -2),
      frameHigh = point(1.45, 3.55, -2.1),
      frameTop = point(0.7, CABIN.roofY, -1.7);
    this.shellPatch([low, point(1.9, CABIN.sideBottom, -0.8), frameLow, waist], lining);
    this.shellPatch([waist, frameLow, frameMid, shoulder], lining);
    this.shellPatch([shoulder, frameMid, frameHigh], inset);
    this.shellPatch([shoulder, frameHigh, frameTop, roof], inset);
    this.shellPatch([shoulder, roof, rearRoof, rearShoulder], inset);
    // A common perimeter rail covers every lining/roof joint.
    this.rail([shoulder, rearShoulder], 0.065, this.edgeMat);
    this.rail([frameTop, roof, rearRoof], 0.065, this.edgeMat);
    this.rail([low, waist, shoulder, roof], 0.065, this.edgeMat);
    this.rail(
      [point(CABIN.sideX, CABIN.sideBottom, CABIN.rearZ), rearShoulder, rearRoof],
      0.075,
      this.edgeMat,
    );
  }
  buildInteriorSide(
    side: number,
    lining: THREE.Material,
    inset: THREE.Material,
    diffuser: THREE.Material,
  ) {
    const g = new THREE.Group();
    g.name = side < 0 ? 'Port interior lining' : 'Starboard interior lining';
    g.position.set(side * CABIN.sideX, CABIN.sideY, CABIN.sideZ);
    g.rotation.y = (-side * Math.PI) / 2;
    g.scale.set(CABIN.sideScaleX, CABIN.sideScaleY, 1);
    this.scene.add(g);
    // Continuous backing closes the former roof gap; all local +Z faces point inward.
    this.box(g, 0, 0, -0.025, 5.9, 5.3, 0.13, inset, 0.025);
    for (const x of [-2.82, -0.93, 0.93, 2.82]) {
      this.box(g, x, 0, 0.067, 0.082, 5.13, 0.12, this.darkMat, 0.018);
      this.box(g, x, 0, 0.135, 0.024, 5.05, 0.018, this.edgeMat, 0.006);
    }
    for (const y of [-2.48, -0.53, 1.05, 2.49])
      this.box(g, 0, y, 0.09, 5.72, 0.072, 0.1, this.edgeMat, 0.018);
    for (const x of [-1.86, 0, 1.86]) {
      for (const [y, h] of [
        [-1.49, 1.78],
        [0.24, 1.43],
        [1.81, 1.26],
      ]) {
        this.box(g, x, y, 0.055, 1.75, h + 0.055, 0.045, this.darkMat, 0.048);
        this.box(g, x, y, 0.086, 1.66, h, 0.048, lining, 0.047);
        for (const sx of [-1, 1])
          for (const sy of [-1, 1]) this.bolt(g, x + sx * 0.739, y + sy * (h / 2 - 0.09), 0.115);
      }
      // Recessed air-return grille above each bay.
      this.box(g, x, 1.91, 0.122, 1.3, 0.33, 0.032, this.darkMat, 0.027);
      for (let i = 0; i < 6; i++)
        this.box(g, x, 1.785 + i * 0.047, 0.148, 1.21, 0.014, 0.023, this.edgeMat, 0.003);
      // Three protected warm-white light bars share the same powered material.
      this.box(g, x, 1.34, 0.14, 1.45, 0.14, 0.13, this.darkMat, 0.023);
      this.box(g, x, 1.33, 0.214, 1.32, 0.044, 0.014, diffuser, 0.007);
      this.box(g, x, 1.39, 0.229, 1.48, 0.033, 0.1, inset, 0.011);
      // Shallow lower covers and a replaceable scuff plate complete the console base.
      this.box(g, x, -1.41, 0.124, 1.3, 0.58, 0.033, inset, 0.035);
      for (let i = 0; i < 5; i++)
        this.box(g, x, -1.55 + i * 0.07, 0.15, 1.15, 0.025, 0.026, this.darkMat, 0.004);
      this.box(g, x, -2.29, 0.15, 1.53, 0.23, 0.052, this.treadMat, 0.018);
    }
    // Enclosed longitudinal cable raceway; brackets retain the two exposed looms.
    this.box(g, 0, 0.86, 0.12, 5.53, 0.255, 0.06, this.darkMat, 0.025);
    for (const y of [0.795, 0.9])
      this.tube(
        g,
        [
          [-2.65, y, 0.16],
          [-1.3, y, 0.18],
          [1.3, y, 0.18],
          [2.65, y, 0.16],
        ],
        0.025,
        inset,
      );
    for (const x of [-2.45, -1.15, 1.15, 2.45])
      this.box(g, x, 0.86, 0.201, 0.056, 0.28, 0.035, this.edgeMat, 0.009);
    const front = -side * 1.86,
      rear = side * 1.86;
    this.label(
      g,
      side < 0 ? 'COOLANT / SERVICE 04' : 'ELECTRICAL / SERVICE 09',
      front,
      0.6,
      0.128,
      1.43,
      0.075,
      '#bbcbd3',
    );
    this.label(
      g,
      side < 0 ? 'SUPPLY / RETURN' : 'DC BUS / ISOLATION',
      front,
      0.46,
      0.129,
      1.1,
      0.045,
      '#81a2af',
    );
    // Flush service hatch with real hinges and a recessed pull handle.
    this.box(g, front, 0.01, 0.131, 1.36, 0.7, 0.036, inset, 0.035);
    for (const y of [-0.2, 0.23])
      this.box(g, front - 0.61, y, 0.16, 0.064, 0.19, 0.044, this.edgeMat, 0.008);
    this.box(g, front + 0.46, 0.015, 0.162, 0.14, 0.32, 0.025, this.darkMat, 0.021);
    this.tube(
      g,
      [
        [front + 0.46, -0.085, 0.169],
        [front + 0.46, -0.072, 0.22],
        [front + 0.46, 0.1, 0.22],
        [front + 0.46, 0.112, 0.169],
      ],
      0.016,
      this.steelMat,
    );
    this.label(g, 'SERVICE ACCESS', 0, 0.53, 0.128, 1.18, 0.065, '#bbcbd3');
    this.label(
      g,
      side < 0 ? 'THERMAL MANAGEMENT' : 'POWER DISTRIBUTION',
      0,
      0.4,
      0.129,
      1.38,
      0.045,
      '#81a2af',
    );
    this.box(g, 0, -0.08, 0.132, 1.21, 0.54, 0.035, inset, 0.025);
    for (const x of [-0.37, 0, 0.37]) {
      this.cylinder(g, x, -0.08, 0.167, 0.064, 0.029, this.edgeMat, 16);
      this.cylinder(g, x, -0.08, 0.188, 0.04, 0.018, this.darkMat, 16);
    }
    this.label(g, 'CABIN / AIR RETURN', rear, 0.54, 0.128, 1.37, 0.068, '#bbcbd3');
    this.box(g, rear, 0.01, 0.136, 1.32, 0.54, 0.04, this.darkMat, 0.026);
    for (let i = 0; i < 8; i++)
      this.box(g, rear, -0.205 + i * 0.06, 0.165, 1.2, 0.024, 0.027, inset, 0.005);
    // Padded shoulder rail, floor joint and coved roof connection.
    this.box(g, 0, -0.47, 0.175, 5.56, 0.15, 0.15, this.darkMat, 0.048);
    this.box(g, 0, -2.57, 0.16, 5.8, 0.12, 0.24, this.edgeMat, 0.023);
    const cove = this.box(g, 0, 2.35, 0.13, 5.79, 0.35, 0.15, inset, 0.04);
    cove.rotation.x = -0.3;
    this.label(
      g,
      side < 0 ? 'IV-04 / PORT' : 'IV-04 / STARBOARD',
      0,
      2.27,
      0.243,
      1.4,
      0.08,
      '#a5bac5',
    );
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
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    this.box(g, 0, 0, 0, w + 0.2, h + 0.22, 0.16, this.darkMat, 0.05);
    this.box(g, 0, 0, 0.03, w + 0.14, h + 0.15, 0.14, this.displayFrameMat, 0.035);
    this.box(g, 0, 0, 0.11, w + 0.035, h + 0.035, 0.04, this.darkMat, 0.015);
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 720;
    const ctx = canvas.getContext('2d')!;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    this.textures.push(texture);
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    this.materials.push(material);
    const display = this.plane(g, 0, 0, 0.143, w, h, material);
    this.target(display, -1, title + ' · anklicken zum Vergrößern', true);
    this.screens.push({ canvas, ctx, texture, kind, material, mesh: display, lastDraw: -Infinity });
    if (kind === 'power' || kind === 'preflight') {
      const touchMaterial = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      this.materials.push(touchMaterial);
      for (const b of kind === 'power' ? SERVICE_CONTROLS : MOBILITY_CONTROLS) {
        const touch = this.plane(
          g,
          ((b.x + b.w / 2 - 480) / 960) * w,
          ((360 - b.y - b.h / 2) / 720) * h,
          0.145,
          (b.w / 960) * w,
          (b.h / 720) * h,
          touchMaterial,
        );
        this.target(touch, b.action, b.label);
        touch.userData.displayControl = true;
        if (kind === 'power') touch.userData.servicePage = 'page' in b ? b.page : undefined;
        else {
          touch.userData.mobilityPage = 'page' in b ? b.page : undefined;
          touch.userData.mobilityControl = true;
        }
      }
    }
    this.label(g, title, 0, h / 2 + 0.07, 0.113, w * 0.88, 0.052, '#c6ced4');
    for (let i = 0; i < 6; i++) {
      const button = this.box(
        g,
        -w * 0.38 + i * w * 0.152,
        -h / 2 - 0.06,
        0.132,
        0.064,
        0.041,
        0.03,
        this.labelMat,
        0.006,
      );
      if (kind === 'cameras') {
        this.target(button, 100 + i, 'Kamera ' + (i + 1) + ' · ' + SURROUND_VIEWS[i].label);
        this.label(
          g,
          String(i + 1),
          -w * 0.38 + i * w * 0.152,
          -h / 2 - 0.06,
          0.149,
          0.033,
          0.028,
          '#102015',
        );
      }
    }
    if (kind === 'cameras') {
      const touchMat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      this.materials.push(touchMat);
      for (const [action, x, label] of [
        [106, 654, 'Alle sechs Kameras anzeigen'],
        [107, 854, 'Bordsysteme anzeigen'],
      ] as const) {
        const touch = this.plane(
          g,
          ((x - 480) / 960) * w,
          ((360 - 42) / 720) * h,
          0.146,
          (195 / 960) * w,
          (80 / 720) * h,
          touchMat,
        );
        this.target(touch, action, label);
        touch.userData.displayControl = true;
      }
    }
    for (const s of [-1, 1]) {
      this.bolt(g, s * (w / 2 + 0.067), h / 2 + 0.067, 0.112);
      this.cylinder(g, s * (w / 2 + 0.06), -h / 2 - 0.045, 0.14, 0.029, 0.045, this.darkMat);
    }
    return g;
  }
  buildConsole() {
    const main = new THREE.Group();
    main.position.set(0, 0.27, -0.27);
    main.rotation.x = -0.12;
    this.scene.add(main);
    this.box(main, 0, 0.03, -0.17, 3.7, 1.65, 0.42, this.bodyMat, 0.1);
    this.box(main, 0, 0.82, -0.11, 3.44, 0.12, 0.37, this.edgeMat, 0.05);
    this.screen(main, -1.11, 0.22, 0.075, 0.85, 0.65, 'armor', 'STRUCTURE / IV–04');
    this.screen(main, 0, 0.26, 0.13, 0.9, 0.77, 'radar', 'TACTICAL / RADAR');
    this.screen(main, 1.11, 0.22, 0.075, 0.85, 0.65, 'reactor', 'REACTOR');
    for (const s of [-1, 1]) {
      const p = this.panel(main, s * 1.16, 0.77, 0.035, 0.98, 0.18);
      this.label(p, s < 0 ? 'MASTER CAUTION' : 'AUXILIARY BUS', -0.05, 0, 0.057, 0.62, 0.04);
      for (let j = 0; j < 3; j++) {
        const led = this.mat({ color: 0x6f7f32, emissive: 0x899643, emissiveIntensity: 0.25 });
        if (s < 0) this.cautionLeds.push(led);
        this.cylinder(p, s * 0.35 + (j - 1) * 0.065, 0, 0.068, 0.017, 0.017, led);
      }
    }
    const control = this.panel(main, 0, -0.55, 0.1, 3.38, 0.43);
    for (let i = 0; i < 6; i++) this.addSwitch(control, -1.4 + i * 0.56, 0.005, i, STEPS[i].label);
    const lower = this.panel(main, 0, -1.05, 0.07, 1.8, 0.53);
    this.label(lower, 'COMM / NAVIGATION', 0, 0.18, 0.07, 1.24, 0.06);
    for (let y = 0; y < 3; y++)
      for (let x = 0; x < 6; x++) {
        this.box(
          lower,
          -0.7 + x * 0.15,
          0.065 - y * 0.09,
          0.082,
          0.115,
          0.064,
          0.039,
          this.darkMat,
          0.008,
        );
        this.label(
          lower,
          String(1 + x + y * 6),
          -0.7 + x * 0.15,
          0.065 - y * 0.09,
          0.108,
          0.08,
          0.045,
          '#d4caba',
        );
      }
    this.screen(lower, 0.54, -0.03, 0.09, 0.46, 0.23, 'comm', 'UPLINK');
    this.addGauge(main, -1.43, -1.03, 0.12, 0.19, 0, 'BUS VOLT');
    this.addGauge(main, 1.4, -1.03, 0.12, 0.19, 1, 'PRESSURE');
    this.label(main, 'IRON VAULT / MK. IV', 0, 0.95, 0.05, 1.7, 0.085, '#c4cbd2');
    // Central, physically mounted head-up sight.
    const hud = new THREE.Group();
    hud.position.set(0, 1.72, -0.9);
    this.scene.add(hud);
    this.box(hud, 0, -0.21, 0, 0.61, 0.06, 0.18, this.darkMat);
    this.box(hud, -0.3, 0, 0, 0.035, 0.46, 0.045, this.edgeMat);
    this.box(hud, 0.3, 0, 0, 0.035, 0.46, 0.045, this.edgeMat);
    this.box(hud, 0, 0.23, 0, 0.61, 0.03, 0.045, this.edgeMat);
    const glass = this.mat({
      color: 0x77957c,
      transparent: true,
      opacity: 0.11,
      metalness: 0.1,
      roughness: 0.25,
      depthWrite: false,
    });
    this.box(hud, 0, 0, 0, 0.56, 0.43, 0.014, glass, 0);
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = 480;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    this.textures.push(t);
    const m = new THREE.MeshBasicMaterial({
      map: t,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    this.materials.push(m);
    const display = this.plane(hud, 0, 0, 0.016, 0.56, 0.43, m);
    this.screens.push({
      canvas: c,
      ctx: c.getContext('2d')!,
      texture: t,
      kind: 'hud',
      material: m,
      mesh: display,
      lastDraw: -Infinity,
    });
  }
  addSwitch(
    parent: THREE.Object3D,
    x: number,
    y: number,
    index: number,
    title: string,
    push = false,
  ) {
    const g = new THREE.Group();
    g.position.set(x, y, 0.055);
    parent.add(g);
    const hint =
      index < 6 ? title + ' [' + (index + 1) + ']' : title + (push ? ' · drücken' : ' · umlegen');
    const face = this.mat({ color: 0x202d39, metalness: 0.35, roughness: 0.63 });
    this.box(g, 0, 0, -0.009, 0.444, 0.382, 0.034, this.edgeMat, 0.018);
    const base = this.box(g, 0, 0, 0.012, 0.426, 0.364, 0.028, face, 0.012);
    this.target(base, index, hint);
    this.label(
      g,
      index < 6 ? ['POWER', 'COOLANT', 'DIAG', 'REACTOR', 'GYRO', 'LINK'][index] : title,
      0,
      0.14,
      0.032,
      0.385,
      0.043,
      '#e0e7ea',
    );
    for (const sx of [-1, 1]) {
      this.cylinder(g, sx * 0.187, -0.15, 0.032, 0.012, 0.009, this.steelMat, 16);
      this.box(g, sx * 0.187, -0.15, 0.039, 0.016, 0.0025, 0.002, this.darkMat, 0);
    }
    const led = this.mat({
      color: 0x354c38,
      emissive: 0xa8e765,
      emissiveIntensity: 0,
      roughness: 0.28,
    });
    this.cylinder(g, 0.157, -0.081, 0.039, 0.022, 0.008, this.darkMat, 24);
    this.cylinder(g, 0.157, -0.081, 0.045, 0.016, 0.007, led, 24);
    const pivot = new THREE.Group();
    pivot.position.set(0, -0.014, 0.059);
    g.add(pivot);
    if (push) {
      this.box(g, 0, -0.009, 0.048, 0.19, 0.18, 0.045, this.darkMat, 0.018);
      this.box(
        pivot,
        0,
        0,
        0.035,
        0.151,
        0.134,
        0.048,
        index === 43
          ? this.mat({ color: 0x567e7d, metalness: 0.2, roughness: 0.5 })
          : this.labelMat,
        0.012,
      );
      this.label(pivot, index === 43 ? 'START' : 'TEST', 0, 0, 0.062, 0.126, 0.035, '#e8f6f4');
      this.label(g, 'PUSH', 0, -0.132, 0.034, 0.12, 0.025, '#a9bac7');
    } else {
      // Washer, hex nut, threaded collar, stem and lathed insulated grip.
      this.cylinder(g, 0, -0.014, 0.04, 0.066, 0.014, this.darkMat, 32);
      this.cylinder(g, 0, -0.014, 0.05, 0.058, 0.015, this.steelMat, 32);
      this.cylinder(g, 0, -0.014, 0.064, 0.048, 0.018, this.edgeMat, 6);
      this.cylinder(g, 0, -0.014, 0.076, 0.031, 0.017, this.steelMat, 32);
      for (let j = 0; j < 3; j++)
        this.cylinder(g, 0, -0.014, 0.078 + j * 0.006, 0.032, 0.002, this.darkMat, 24);
      this.cylinder(pivot, 0, 0, 0.053, 0.013, 0.106, this.steelMat, 20);
      const key = 'toggle-grip';
      if (!this.geometries.has(key))
        this.geometries.set(
          key,
          new THREE.LatheGeometry(
            [
              [0.014, 0],
              [0.027, 0.008],
              [0.03, 0.023],
              [0.028, 0.051],
              [0.022, 0.066],
              [0, 0.071],
            ].map(([r, y]) => new THREE.Vector2(r, y)),
            24,
          ),
        );
      const critical = [0, 3, 48].includes(index),
        gripMat = this.mat({
          color: critical ? 0xc55338 : 0xd5dcd5,
          metalness: 0.12,
          roughness: 0.37,
        });
      const grip = new THREE.Mesh(this.geometries.get(key)!, gripMat);
      grip.rotation.x = Math.PI / 2;
      grip.position.z = 0.098;
      pivot.add(grip);
      const ringKey = 'toggle-grip-ring';
      if (!this.geometries.has(ringKey))
        this.geometries.set(ringKey, new THREE.TorusGeometry(0.0295, 0.0016, 5, 24));
      for (let j = 0; j < 3; j++) {
        const ring = new THREE.Mesh(this.geometries.get(ringKey)!, this.edgeMat);
        ring.position.z = 0.118 + j * 0.008;
        pivot.add(ring);
      }
      this.label(g, 'ON', -0.134, 0.059, 0.036, 0.07, 0.03, '#a9dace');
      this.label(g, 'OFF', -0.132, -0.09, 0.036, 0.095, 0.029, '#a1afbb');
      if (critical) {
        const guardMat = this.mat({ color: 0xc5a363, metalness: 0.72, roughness: 0.33 });
        for (const sx of [-1, 1]) {
          this.tube(
            g,
            [
              [sx * 0.087, -0.096, 0.039],
              [sx * 0.087, -0.083, 0.145],
              [sx * 0.087, 0.092, 0.145],
              [sx * 0.087, 0.102, 0.039],
            ],
            0.009,
            guardMat,
          );
        }
      }
      pivot.rotation.x = 0.6;
    }
    this.target(pivot, index, hint);
    this.switches.push({ pivot, led, index, push });
    // Decorative collars/guards must not swallow a click aimed at the switch
    // plate behind them. The plate and animated lever remain the actual targets.
    g.traverse((object) => {
      if (object instanceof THREE.Mesh) object.userData.switchDetail = true;
    });
  }
  buildOverhead() {
    const g = this.panel(this.scene, 0, 3.04, 0.55, 3.23, 1.75);
    g.rotation.x = 0.45;
    const face = this.mat({ color: 0x18232e, metalness: 0.35, roughness: 0.69 });
    this.box(g, 0, 0, 0.038, 3.12, 1.63, 0.028, face, 0.04);
    this.label(g, 'IRON VAULT  /  OVERHEAD SYSTEMS', 0, 0.747, 0.064, 2.66, 0.07, '#d8e5ed');
    const groups = [
      {
        x: -1.035,
        title: '01  ELECTRICAL',
        controls: [
          [40, 'BAT 1'],
          [41, 'BAT 2'],
          [44, 'APU GEN'],
          [51, 'MAIN GEN'],
        ],
      },
      {
        x: 0,
        title: '02  AUXILIARY POWER',
        controls: [
          [50, 'FUEL PUMP'],
          [42, 'APU MASTER'],
          [43, 'APU START'],
          [49, 'LAMP TEST'],
        ],
      },
      {
        x: 1.035,
        title: '03  SYSTEM FEEDS',
        controls: [
          [45, 'COOLANT VALVE'],
          [46, 'HYD PUMP'],
          [47, 'AVIONICS'],
          [48, 'REACTOR ARM'],
        ],
      },
    ];
    for (const group of groups) {
      this.box(g, group.x, 0.109, 0.058, 0.998, 1.047, 0.025, this.darkMat, 0.022);
      this.label(g, group.title, group.x, 0.543, 0.079, 0.91, 0.047, '#95c6d1');
      group.controls.forEach(([action, label], i) => {
        const x = group.x + (i % 2 ? 0.237 : -0.237),
          y = i < 2 ? 0.271 : -0.151;
        this.addSwitch(
          g,
          x,
          y,
          action as number,
          label as string,
          [43, 49].includes(action as number),
        );
      });
    }
    this.box(g, 0, -0.619, 0.064, 2.985, 0.272, 0.036, this.edgeMat, 0.018);
    this.box(g, 0, -0.619, 0.087, 2.928, 0.225, 0.014, this.darkMat, 0.012);
    const canvas = document.createElement('canvas');
    canvas.width = 1440;
    canvas.height = 140;
    const ctx = canvas.getContext('2d')!;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    this.textures.push(texture);
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    this.materials.push(material);
    const display = this.plane(g, 0, -0.619, 0.097, 2.89, 0.194, material);
    this.target(display, -1, 'Elektrische Versorgung · vergrößern', true);
    this.screens.push({
      canvas,
      ctx,
      texture,
      material,
      kind: 'electrical',
      mesh: display,
      lastDraw: -Infinity,
    });
    for (const x of [-1.36, 1.36])
      this.tube(
        g,
        [
          [x, 0.73, -0.08],
          [x, 0.88, -0.19],
          [x, 0.93, -0.4],
        ],
        0.045,
        this.edgeMat,
      );
  }
  buildTopMonitor(side: number) {
    const g = new THREE.Group();
    g.position.set(side * 1.68, 2.08, -1.38);
    g.rotation.y = -side * 0.19;
    g.rotation.x = 0.055;
    this.scene.add(g);
    this.screen(
      g,
      0,
      0,
      0,
      0.91,
      0.63,
      side < 0 ? 'diagnostics' : 'cameras',
      side < 0 ? 'ENGINEERING' : 'SURROUND / CAMERAS',
    );
    this.tube(
      g,
      [
        [-0.25, -0.39, -0.1],
        [-0.25, -0.61, -0.18],
        [0.15, -0.62, -0.3],
        [0.2, -0.42, -0.45],
      ],
      0.025,
      this.darkMat,
    );
    this.box(g, 0, 0.45, -0.15, 0.17, 0.24, 0.13, this.edgeMat);
  }
  buildSideMonitor(side: number) {
    const g = new THREE.Group();
    g.position.set(side * 1.85, 1.17, 0.34);
    g.rotation.y = -side * 0.44;
    g.rotation.x = -0.035;
    g.scale.setScalar(0.94);
    this.scene.add(g);
    this.screen(
      g,
      0,
      0,
      0,
      0.81,
      0.6,
      side < 0 ? 'power' : 'preflight',
      side < 0 ? 'COOLING / ELECTRICAL' : 'PREFLIGHT / TEST',
    );
    this.tube(
      g,
      [
        [0, -0.42, -0.09],
        [0, -0.61, -0.21],
        [side * 0.24, -0.69, -0.35],
      ],
      0.052,
      this.edgeMat,
    );
    this.tube(
      g,
      [
        [side * 0.26, -0.35, -0.13],
        [side * 0.31, -0.62, -0.19],
        [side * 0.4, -0.7, -0.3],
      ],
      0.02,
      this.darkMat,
    );
    // The articulated display arm terminates at a bolted wall socket.
    g.updateMatrixWorld(true);
    const armEnd = g.localToWorld(new THREE.Vector3(side * 0.24, -0.69, -0.35));
    const socket = new THREE.Group();
    socket.position.set(side * 2.4, 0.5, 0.52);
    socket.rotation.y = (-side * Math.PI) / 2;
    this.scene.add(socket);
    this.panel(socket, 0, 0, 0, 0.32, 0.28);
    this.tube(
      this.scene,
      [armEnd.toArray(), [side * 2.2, 0.5, 0.46], [side * 2.35, 0.5, 0.52]],
      0.052,
      this.edgeMat,
    );
    if (side > 0) {
      for (const [x, action, label] of [
        [-0.215, 30, 'TEST [T]'],
        [0.215, 35, 'SHUTDOWN [K]'],
      ] as const) {
        const button = this.box(
          g,
          x,
          -0.46,
          0.06,
          0.37,
          0.12,
          0.065,
          action === 35 ? this.bodyMat : this.labelMat,
          0.017,
        );
        this.label(g, label, x, -0.46, 0.099, 0.34, 0.045, action === 35 ? '#efd391' : '#d7f1ed');
        this.target(
          button,
          action,
          action === 35 ? 'Geordnetes Herunterfahren [K]' : 'Systemtest starten / abbrechen [T]',
        );
      }
    }
  }
  buildSide(side: number) {
    const g = new THREE.Group();
    g.position.set(side * 1.83, -0.37, 1.27);
    g.rotation.x = -0.93;
    g.rotation.y = -side * 0.19;
    g.rotation.z = side * 0.035;
    this.scene.add(g);
    this.box(g, 0, 0, -0.16, 0.94, 2.45, 0.37, this.bodyMat, 0.06);
    const p = this.panel(g, 0, 0.43, 0.065, 0.82, 1.23);
    this.label(p, side < 0 ? 'POWER / AUX' : 'FLIGHT / AUX', 0, 0.5, 0.063, 0.65, 0.075);
    const rows =
      side < 0
        ? [
            {
              label: 'FAN / KABINE',
              action: 20,
              minus: 26,
              hint: 'Lüfter · aus / Stufe 1 / 2 / 3',
            },
            {
              label: 'HYDRAULIC',
              action: 21,
              minus: 27,
              hint: 'Hydraulikdruck · 150 / 210 / 280 bar',
            },
            {
              label: 'DISPLAY DIM',
              action: 22,
              minus: 28,
              hint: 'Instrumentenhelligkeit · 40 / 70 / 100 %',
            },
            {
              label: 'RED LIGHT',
              action: 31,
              minus: 32,
              hint: 'Rote Deckenlampe · 0–100 % in 10-%-Schritten',
            },
          ]
        : [
            {
              label: 'RADAR RANGE',
              action: 23,
              minus: 29,
              hint: 'Radarreichweite · 125 / 250 / 500 / 1000 m',
            },
            {
              label: 'RADAR RUN / HOLD',
              action: 24,
              minus: 0,
              hint: 'Radarsuche anhalten / fortsetzen',
            },
            { label: 'HUD OFF / ON', action: 25, minus: 0, hint: 'HUD ausblenden / einblenden' },
            { label: 'COOLING', action: 33, minus: 34, hint: 'Reaktorkühlung · Stufe 1 / 2 / 3' },
          ];
    rows.forEach((row, j) => {
      const y = 0.23 - j * 0.22;
      this.label(p, row.label, 0, y + 0.09, 0.07, 0.67, 0.052, '#c3c9cc');
      const knob = new THREE.Group();
      knob.position.set(0, y, 0.105);
      p.add(knob);
      this.cylinder(knob, 0, 0, 0, 0.063, 0.062, this.darkMat, 20);
      this.cylinder(knob, 0, 0, 0.034, 0.05, 0.012, this.labelMat, 20);
      this.box(knob, 0, 0.032, 0.044, 0.012, 0.035, 0.008, this.steelMat, 0.002);
      this.target(knob, row.action, row.hint);
      this.knobs.push({ pivot: knob, action: row.action });
      if (row.minus) {
        for (const direction of [-1, 1]) {
          const b = this.box(p, direction * 0.24, y, 0.11, 0.105, 0.08, 0.045, this.darkMat, 0.009);
          this.target(
            b,
            direction < 0 ? row.minus : row.action,
            row.hint + (direction < 0 ? ' · zurück' : ' · weiter'),
          );
          this.label(p, direction < 0 ? '−' : '+', direction * 0.24, y, 0.138, 0.067, 0.055);
        }
      } else {
        this.label(p, 'OFF', -0.23, y, 0.07, 0.15, 0.04);
        this.label(p, 'ON', 0.23, y, 0.07, 0.15, 0.04);
      }
    });

    const foot = this.panel(g, 0, -0.63, 0.066, 0.82, 0.65);
    this.label(foot, side < 0 ? 'THROTTLE / ENGINE' : 'CONTROL STICK', 0, 0.24, 0.075, 0.65, 0.05);
    if (side < 0) {
      for (const s of [-1, 1])
        this.box(foot, s * 0.11, -0.03, 0.09, 0.033, 0.38, 0.01, this.darkMat);
      this.throttle = new THREE.Group();
      this.throttle.position.set(0, -0.12, 0.1);
      foot.add(this.throttle);
      for (const s of [-1, 1])
        this.box(this.throttle, s * 0.09, 0, 0.13, 0.029, 0.035, 0.27, this.steelMat);
      const handle = this.box(this.throttle, 0, 0, 0.27, 0.32, 0.105, 0.12, this.darkMat, 0.04);
      this.box(
        this.throttle,
        -0.135,
        0,
        0.275,
        0.02,
        0.07,
        0.08,
        this.mat({ color: 0xc25c2b, roughness: 0.45 }),
      );
      this.target(handle, 11, 'Leistungshebel · 0 / 25 / 50 / 75 / 100 %');
      this.target(foot, 11, 'Leistungshebel · Leistung ändern');
      this.label(foot, 'IDLE              MAX', 0, -0.23, 0.07, 0.65, 0.043);
    } else {
      const stick = new THREE.Group();
      stick.position.set(0, -0.12, 0.09);
      foot.add(stick);
      this.cylinder(stick, 0, 0, 0.035, 0.13, 0.07, this.darkMat);
      for (let k = 0; k < 4; k++)
        this.cylinder(stick, 0, 0, 0.095 + k * 0.028, 0.09 - k * 0.007, 0.025, this.darkMat);
      this.box(stick, 0, 0.04, 0.26, 0.092, 0.105, 0.3, this.darkMat, 0.04);
      this.box(stick, 0, 0.08, 0.43, 0.23, 0.14, 0.13, this.bodyMat, 0.04);
      this.cylinder(
        stick,
        -0.075,
        0.09,
        0.505,
        0.033,
        0.018,
        this.mat({ color: 0xb83e29, roughness: 0.45 }),
      );
      this.cylinder(stick, 0.05, 0.09, 0.505, 0.043, 0.023, this.darkMat);
    }
    const lightY = -0.555;
    const lightButton = this.box(p, 0.28, lightY, 0.09, 0.105, 0.09, 0.05, this.labelMat);
    this.target(lightButton, 10, 'Warmes Kabinenlicht [L]');
    this.label(p, 'LIGHT', 0.02, lightY, 0.07, 0.27, 0.044);
    for (let i = 0; i < 5; i++)
      this.box(g, 0, -1.06 + i * 0.035, 0.07, 0.55, 0.014, 0.025, this.darkMat, 0.001);
  }
  buildSeat() {
    const seatmat = this.seatMat,
      red = this.leatherMat;
    this.box(this.scene, 0, -1.02, 3.15, 1.15, 0.32, 1.3, seatmat, 0.09);
    this.box(this.scene, 0, -0.12, 3.96, 1.19, 1.7, 0.27, seatmat, 0.1);
    for (const s of [-1, 1]) {
      this.box(this.scene, s * 0.51, -0.12, 3.74, 0.17, 1.43, 0.19, red, 0.05);
      this.box(this.scene, s * 0.72, -0.68, 2.65, 0.22, 0.2, 1.2, red, 0.04);
    }
    for (let i = 0; i < 10; i++)
      this.box(this.scene, 0, -0.84, 2.62 + i * 0.1, 0.98, 0.015, 0.018, this.darkMat, 0.003);
  }
  buildMechanicalDetails() {
    for (const side of [-1, 1]) {
      const sideGroup = new THREE.Group();
      sideGroup.position.set(side * 1.83, -0.37, 1.27);
      sideGroup.rotation.set(-0.93, -side * 0.19, side * 0.035);
      this.scene.add(sideGroup);
      // Padded wrist rest on the inner edge of each console.
      this.box(sideGroup, -side * 0.33, -0.64, 0.16, 0.14, 0.49, 0.11, this.leatherMat, 0.035);
      // Metal perimeter rail and replaceable faceplates.
      for (const x of [-0.435, 0.435])
        this.box(sideGroup, x, 0, 0.055, 0.025, 2.26, 0.035, this.edgeMat, 0.009);
      for (const y of [-0.03, 0.89]) {
        this.box(sideGroup, 0, y, 0.11, 0.7, 0.012, 0.008, this.steelMat, 0.002);
      }
      // Guarded auxiliary switch, distinct from the working startup controls.
      this.box(sideGroup, -0.26, -1.055, 0.095, 0.19, 0.14, 0.06, this.darkMat, 0.012);
      this.box(
        sideGroup,
        -0.26,
        -1.055,
        0.131,
        0.125,
        0.065,
        0.02,
        this.mat({ color: 0xa44a31, metalness: 0.3, roughness: 0.5 }),
        0.004,
      );
      this.tube(
        sideGroup,
        [
          [-0.36, -1.12, 0.15],
          [-0.36, -1.02, 0.23],
          [-0.16, -1.02, 0.23],
          [-0.16, -1.12, 0.15],
        ],
        0.012,
        this.steelMat,
      );
      for (const y of [-0.89, 0.91])
        for (const x of [-0.38, 0.38]) this.bolt(sideGroup, x, y, 0.09);
      // Floor wear plates with raised traction pattern from the supplied material.
      this.box(this.scene, side * 0.83, -1.36, 1.7, 0.66, 0.065, 1.4, this.treadMat, 0.025);
      // Connection collars and hoses beneath the front display bank.
      this.cylinder(this.scene, side * 1.91, -0.37, -0.07, 0.078, 0.09, this.steelMat, 12);
      this.tube(
        this.scene,
        [
          [side * 1.91, -0.37, 0.01],
          [side * 2.08, -0.66, 0.15],
          [side * 2.16, -0.74, 0.55],
          [side * 2.02, -0.49, 0.93],
        ],
        0.044,
        this.darkMat,
      );
    }
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
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    this.cylinder(g, 0, 0, 0, r + 0.025, 0.08, this.edgeMat, 32);
    this.cylinder(g, 0, 0, 0.048, r, 0.025, this.darkMat, 32);
    for (let i = 0; i <= 10; i++) {
      const a = -Math.PI * 0.8 + (i / 10) * Math.PI * 1.6;
      const mark = this.box(
        g,
        Math.sin(a) * r * 0.8,
        Math.cos(a) * r * 0.8,
        0.07,
        0.009,
        0.025,
        0.003,
        this.labelMat,
        0,
      );
      mark.rotation.z = -a;
    }
    const needle = new THREE.Group();
    needle.position.z = 0.078;
    g.add(needle);
    this.box(
      needle,
      0,
      r * 0.31,
      0,
      0.009,
      r * 0.65,
      0.007,
      this.mat({ color: 0xc4ed8c, emissive: 0x658a3b, emissiveIntensity: 0.5 }),
      0,
    );
    this.cylinder(g, 0, 0, 0.084, 0.022, 0.009, this.steelMat);
    this.gauges.push({ needle, kind });
    this.label(g, title, 0, -r * 0.4, 0.072, r * 1.3, 0.04, '#9fb586');
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
