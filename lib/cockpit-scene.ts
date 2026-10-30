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
import { displayFlicker } from './display-aging';
import { createNightSky, dayNightParams, DAY_NIGHT_RATE } from './day-night';
import { beaconLevel, headlightLevel } from './mech-details';
import { detectFootfalls, footfallStrength, StepJolt } from './footfall';
import { DustPuffs, Footprints } from './ground-effects';
import { FiringRange } from './firing-range';
import { WeaponSystem } from './weapon-system';
import { drawWeaponHud } from './weapon-hud';
import {
  clampAim,
  initialWeapons,
  stepWeapons,
  torsoFollow,
  WEAPON,
  weaponBlock,
  type WeaponState,
} from './weapons';
import { hash } from './display-aging';
import { cabinWear, faultyTube, wearCabin } from './cabin-wear';
import { CabinClutter } from './scene/cabin-clutter';
import { SisterMech } from './sister-mech';
import {
  applyWetness,
  GlassRain,
  insideShelter,
  RAIN_RATE,
  RainField,
  Storm,
  weatherParams,
} from './weather';
import { DisplayBoot, renderDisplay, coldCockpit, batteryBeacon } from './display-boot';
import { STRUCTURE_ATLAS, type InstrumentAssets, type TelemetrySample } from './instruments';
import { actuatorMoving, dcPowerAvailable, overheadOn, type MachineState } from './machine';
import { MechExterior, MECH, applyMechBodyPose } from './mech-exterior';
import { serviceWarning, electricalReadings } from './service-systems';
import { CAPTURE, SurroundCameras } from './surround-cameras';
import { WalkPresentation } from './walk-presentation';
import { WALK, groundHeight } from './walking';
import { onLangChange, tr } from './i18n';
import {
  initialDrone,
  idleDroneInput,
  stepDrone,
  droneToggle as toggleDrone,
  droneFollowToggle,
  droneScoutToggle,
  DRONE,
  followRelaunchDue,
  droneOnStation,
  droneBlock,
  droneAirborne,
  droneHasControls,
  droneMark,
  droneLook,
  type DroneInput,
  type DroneState,
} from './drone';
import { DroneFeed, DroneRig, LASER_LAYER, TargetMarker } from './drone-model';
import { DroneSensor } from './drone-sensor';
import { RetroPass, SCREEN_LAYER } from './retro-pass';
import { DesertWorld } from './world-scene';
import { WorldTargets } from './world-targets';
import { PerfMonitor } from './perf-monitor';
import { MissionDirector } from './mission-director';
import { mission as missionById } from './missions';
import { STRUCTURES, TARGETS, structureTop } from './world-layout';
import { ROADS, sectorName } from './terrain';
import { camerasPowered } from './surround-cameras';
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
  SEAT,
  buildMechanicalDetails as buildMechanicalDetailsImpl,
  addGauge as addGaugeImpl,
} from './scene/cabin-controls';
import { assetUrl } from './asset-url';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
/** Pilotensitz (scripts/prepare-seat.mjs aus Renes Kanzelmodell) */
const SEAT_ASSET = assetUrl('models/iv-04-seat.glb');
import {
  FAR_PLANE,
  FULL_FAR,
  MONITOR_INTERVAL,
  getGraphics,
  minFogDensity,
  onGraphicsChange,
  shadowMapSize,
  type Graphics,
} from './graphics-settings';
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
  'front' | 'overhead' | 'left' | 'right' | 'panel' | 'hangar' | 'yard' | 'mech' | 'drone';

/** Hallentor (z): dahinter fliegt die Drohne im Begleitmodus nicht mit. */
const DRONE_HALL_Z = -36;

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
  camera = new THREE.PerspectiveCamera(60, 1, 0.08, 2600);
  world: DesertWorld | null = null;
  /** Leistungsmessung (Diagnosemodus F3) */
  perf: PerfMonitor;
  worldTargets: WorldTargets | null = null;
  /** Explosion: Entfernung zur Kamera (m) und Größe – für den Ton. */
  onExplosion: ((distance: number, size: number) => void) | null = null;
  /** Ziel zerstört (Missionen). */
  onTargetDestroyed: ((id: string) => void) | null = null;
  missions = new MissionDirector();
  private tacticalAt = -1;
  private droneForward = new THREE.Vector3();
  private droneEye = new THREE.Vector3();
  /** Radarechos: Bauwerke (ohne Leitungen) */
  private blips = STRUCTURES.filter((s) => s.kind !== 'pipe' && s.kind !== 'pylon').map((s) => ({
    x: s.x,
    z: s.z,
  }));
  renderer: THREE.WebGLRenderer;
  frame = 0;
  disposed = false;
  resizeObserver: ResizeObserver;
  /** Grafikeinstellungen (Menü oben rechts) */
  graphics: Graphics = getGraphics();
  private resizeView = () => {};
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
  braceLensFaulty: THREE.MeshStandardMaterial | null = null;
  surround: SurroundCameras | null = null;
  exterior: MechExterior | null = null;
  inMech = false;
  /** Vollbild-Drohnensicht */
  inDrone = false;
  drone: DroneState = initialDrone();
  droneInput: DroneInput = idleDroneInput();
  droneRig: DroneRig | null = null;
  droneFeed: DroneFeed | null = null;
  targetMarker: TargetMarker | null = null;
  private dockWorld = new THREE.Vector3();
  private dockForward = new THREE.Vector3();
  private droneCamWorld = new THREE.Vector3();
  private droneQuat = new THREE.Quaternion();
  /** Drohne hat gerade (per Taste) Ziel markiert/gelöscht – für die Meldung in der Oberfläche */
  droneNotice: string | null = null;
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
  /** Sensor im Drohnenkopf: TV, Wärmebild, Nachtsicht (Taste 8) */
  droneSensor!: DroneSensor;
  /** Pixel-Look (Grafikmenü „Look“) */
  readonly retro = new RetroPass();
  /** Bildwinkel der Drohnenkamera (Zoom 1–8× über das Mausrad bzw. + / −) */
  droneFov = 70;
  private sunDirection = new THREE.Vector3();
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
  /** Feste Beschriftungen (Texturen), die bei einem Sprachwechsel neu gezeichnet werden. */
  relabel: (() => void)[] = [];
  reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // ---- Tag/Nacht und Mech-Beleuchtung ----
  hemi = new THREE.HemisphereLight(0x91aea8, 0x10130e, 0.2);
  daySky: THREE.Texture | null = null;
  nightSky: THREE.Texture | null = null;
  yardLamp: THREE.MeshStandardMaterial | null = null;
  floodlights: { light: THREE.SpotLight; base: number }[] = [];
  nightTarget = 0;
  nightAmount = 0;
  baseEnvIntensity = 0.18;
  baseFogDensity = 0.0011;
  headlightsOn = false;
  headlightSince = -10;
  lastPowered = false;
  movingFor = 0;
  stoppedFor = 99;
  // ---- Schatten, Schrittgewicht, Regen ----
  sun = new THREE.DirectionalLight(0xffd9b0, 0);
  jolt = new StepJolt();
  lastPhase = NaN;
  dust: DustPuffs | null = null;
  footprints: Footprints | null = null;
  rain: RainField | null = null;
  glassRain = new GlassRain();
  glass: THREE.Mesh | null = null;
  rainTarget = 0;
  rainAmount = 0;
  wet = { value: 0 };
  // ---- Waffensystem ----
  weapons: WeaponState = initialWeapons();
  weaponSystem: WeaponSystem | null = null;
  trigger = false;
  aimNdc = new THREE.Vector2(0, 0);
  aimPoint = new THREE.Vector3(0, 0, -300);
  aimRange = 0;
  aimOnTarget = true;
  /** Gewünschter Torsowinkel (Grad), damit das Ziel im Schwenkbereich bleibt; null = passt. */
  torsoDemand: number | null = null;
  weaponMessage: string | null = null;
  onGunshot: ((cabin: boolean) => void) | null = null;
  onImpact: ((kind: 'steel' | 'wreck' | 'ground', distance: number) => void) | null = null;
  private aimRay = new THREE.Raycaster();
  private laserFrom = new THREE.Vector3();
  storm = new Storm();
  private flashing = false;
  /** Wird beim Donnerschlag aufgerufen (Audio hängt sich hier an). */
  onThunder: ((variant: number, distance: number) => void) | null = null;
  private camWorld = new THREE.Vector3();
  clutter: CabinClutter | null = null;
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
    // Sprachwechsel: Displays sofort neu zeichnen, feste Beschriftungen neu erzeugen.
    const offLang = onLangChange(() => {
      for (const screen of this.screens) screen.lastDraw = -Infinity;
      for (const draw of this.relabel) draw();
    });
    this.cleanup.push(() => {
      offLang();
      this.relabel.length = 0;
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
    this.perf = new PerfMonitor(this.renderer);
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
    this.scene.add(this.hemi);
    this.screenSpill = new THREE.PointLight(0x8cff3c, 0, 3.2, 2);
    this.screenSpill.position.set(0, 0.82, 0.55);
    this.scene.add(this.screenSpill);
    this.buildHangar();
    const yard = buildYard(this);
    this.yardMaterials.push(...yard.materials);
    this.yardLamp = yard.lamp;
    yard.root.traverse((o) => {
      if (o instanceof THREE.SpotLight) this.floodlights.push({ light: o, base: o.intensity });
    });
    this.nightSky = createNightSky();
    if (this.nightSky) this.textures.push(this.nightSky);
    for (const m of this.yardMaterials) applyWetness(m, this.wet);
    this.cleanup.push(() => {
      this.dust?.dispose();
      this.footprints?.dispose();
      this.rain?.dispose();
      this.glassRain.dispose();
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.loadYardSky(manager);
    // Halle und Testgelände: große Zellen (24 m) – deutlich weniger Zeichenaufrufe;
    // die Kanzel unten behält feine Zellen fürs genaue Ausblenden.
    const worldBatches = batchStaticCockpit(this.scene, new Set(this.gateLeaves), false, {
      x: 24,
      y: 12,
      z: 24,
    });
    const worldObjects = new Set(this.scene.children);
    worldObjects.delete(this.screenSpill);
    this.buildShell();
    this.buildConsole();
    this.buildSide(-1);
    this.buildSide(1);
    this.buildTopMonitor(-1);
    this.buildTopMonitor(1);
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
    // Verschleiß für alle Kanzelmaterialien (Kantenabrieb, Schmutz, Verblassen).
    wearCabin(this.cabin);
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
    // Gebrauchsspuren: Zettel, Band, Plakette, Ersatzrahmen, Kabelbündel, Foto, Anhänger.
    this.clutter = new CabinClutter(this, this.interior);
    // Pilotensitz mit Seitenkonsolen und Steuerknüppeln (Tripo-Modell); ohne Datei der alte Sitz
    new GLTFLoader(manager).load(
      SEAT_ASSET,
      (gltf) => {
        if (this.disposed) return;
        const seat = gltf.scene;
        seat.name = 'Pilot seat';
        seat.scale.setScalar(SEAT.scale);
        seat.position.set(SEAT.x, SEAT.y, SEAT.z);
        seat.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.castShadow = o.receiveShadow = true;
            const m = o.material as THREE.MeshStandardMaterial;
            m.envMapIntensity = 0.5;
            this.materials.push(m);
            this.cleanup.push(() => o.geometry.dispose());
            for (const t of [m.map, m.normalMap, m.roughnessMap, m.metalnessMap])
              if (t) this.textures.push(t);
          }
        });
        this.interior.add(seat);
        seat.updateMatrixWorld(true);
      },
      undefined,
      () => this.buildSeat(this.interior),
    );
    this.cleanup.push(() => this.clutter?.dispose());
    // Regentropfen auf der Frontscheibe (nur Pilotensicht, liegt im Innenraum).
    if (this.glassRain.texture) {
      const glassMat = new THREE.MeshBasicMaterial({
        map: this.glassRain.texture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this.materials.push(glassMat);
      this.glass = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 2.6), glassMat);
      this.glass.name = 'Rain on canopy';
      this.glass.position.set(0, 2.3, -1.6);
      this.glass.rotation.x = -0.377;
      this.glass.renderOrder = 7;
      this.glass.visible = false;
      this.interior.add(this.glass);
      this.cleanup.push(() => this.glass?.geometry.dispose());
    }
    this.camera.near = 0.08 * MECH.cabinScale;
    this.camera.updateProjectionMatrix();
    this.exterior = new MechExterior(this, manager);
    // Wärmebild: Reaktor, Hydraulik und Antriebe – der Mech ist das wärmste Objekt im Gelände
    this.exterior.root.userData.heat = 0.8;
    this.cabin.add(this.exterior.root);
    // Dynamische Weltobjekte erst nach dem Zusammenfassen der statischen Szene anlegen:
    // dort werden Matrizen eingefroren und neue Szenenkinder in die Kapsel verschoben.
    // Sonne bzw. Mond: wirft den echten Schatten des Mechs; folgt ihm mit engem Schattenkasten.
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -12;
    sc.right = sc.top = 12;
    sc.near = 1;
    sc.far = 90;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
    this.cleanup.push(() => this.sun.shadow.dispose());
    this.dust = new DustPuffs(this.scene);
    this.footprints = new Footprints(this.scene);
    this.rain = new RainField(this.scene);
    this.weaponSystem = new WeaponSystem(this.scene, new FiringRange(this));
    // Wüste mit Anlagen (1,5 × 1,5 km) um das Testgelände
    performance.mark('iv-world-start');
    this.world = new DesertWorld(this);
    performance.measure('iv-world', 'iv-world-start');
    this.worldTargets = new WorldTargets(this.scene, this.world);
    const targets = this.worldTargets;
    this.weaponSystem.range.destroyed = targets.destroyed;
    targets.onDestroyed = (id, point, size) => {
      this.camera.getWorldPosition(this.camWorld);
      this.onExplosion?.(point.distanceTo(this.camWorld), size);
      this.onTargetDestroyed?.(id);
    };
    this.cleanup.push(() => {
      this.worldTargets?.dispose();
      this.world?.dispose();
    });
    // IV-02: abgestelltes, ausgeschlachtetes Schwesterschiff vor der Werkstatt
    new SisterMech(this, this.wet);
    // Aufklärungsdrohne (Halterung am Rücken: mech-exterior.ts)
    this.droneRig = new DroneRig(this.scene, manager);
    this.droneRig.root.userData.heat = 0.7;
    this.droneSensor = new DroneSensor();
    this.cleanup.push(() => this.droneSensor.dispose());
    this.droneRig.root.visible = false;
    this.droneFeed = new DroneFeed();
    this.targetMarker = new TargetMarker(this.scene);
    this.cleanup.push(() => {
      this.droneRig?.dispose();
      this.droneFeed?.dispose();
      this.targetMarker?.dispose();
    });
    this.cleanup.push(() => this.weaponSystem?.dispose());
    void this.exterior.ready.then(() => {
      if (this.exterior?.model) this.weaponSystem?.attach(this.exterior.model);
    });
    this.ready = Promise.all([this.ready, this.exterior.ready]).then(() => {
      // Nachgeladene Modelle (Mech, Sitz, Drohne) auch ungefiltert zeigen
      this.retro.refresh(this.scene);
    });
    this.cleanup.push(() => this.retro.dispose());
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
      // Pixel-Look: Anzeigen werden scharf darübergelegt (retro-pass.ts)
      screen.mesh.layers.enable(SCREEN_LAYER);
      screen.texture.generateMipmaps = false;
      screen.texture.minFilter = THREE.LinearFilter;
      this.drawScreen(screen, this.getState(), 0);
    }
    const resize = () => {
      const w = Math.max(1, host.clientWidth),
        h = Math.max(1, host.clientHeight);
      // Pixel-Look: das Bild entsteht ohnehin in wenigen Zeilen, volle Pixeldichte wäre verschenkt
      this.renderer.setPixelRatio(
        this.graphics.look !== 'normal'
          ? 1
          : cockpitPixelRatio(w, h, window.devicePixelRatio) * this.graphics.resolution,
      );
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    };
    this.resizeView = resize;
    resize();
    this.applyGraphics(this.graphics, true);
    const offGraphics = onGraphicsChange((g) => this.applyGraphics(g));
    this.cleanup.push(offGraphics);
    this.resizeObserver = new ResizeObserver(resize);
    this.resizeObserver.observe(host);
    const c = this.renderer.domElement;
    const move = (e: PointerEvent) => {
      if (this.drag) {
        if (this.inDrone) {
          this.drone = droneLook(
            this.drone,
            (e.clientX - this.lastX) * 0.004,
            (e.clientY - this.lastY) * 0.003,
          );
        } else if (this.inMech) {
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
      const rect = c.getBoundingClientRect();
      this.aimNdc.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
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
      if (e.button === 0 && this.inDrone) {
        this.markFromDrone();
        return;
      }
      if (e.button === 0 && !this.inMech) {
        const hit = this.pick(e);
        const cockpit = !this.inHangar && !this.inYard;
        // Scharf geschaltet: Klick ins Freie (oder auf einen Monitor) feuert, Schalter bleiben bedienbar.
        if (this.weapons.armed && cockpit && (!hit || hit.userData.focus)) {
          this.trigger = true;
          c.setPointerCapture(e.pointerId);
        } else if (hit) {
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
      this.trigger = false;
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
      else if (this.inDrone) this.droneZoomBy(Math.exp(-delta * 0.0012));
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
    // three.js baut nach der Wiederherstellung alles neu auf; Displays neu zeichnen
    const restored = () => {
      for (const screen of this.screens) screen.lastDraw = -Infinity;
      this.surround?.reset();
      this.hover(null);
    };
    c.addEventListener('webglcontextrestored', restored);
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
      c.removeEventListener('webglcontextrestored', restored);
    });
    this.animate(0);
  }
  loadYardSky(manager: THREE.LoadingManager) {
    new HDRLoader(manager).load(
      assetUrl('materials/yard-sky/industrial-sunset-2k.hdr'),
      (texture) => {
        if (this.disposed) {
          texture.dispose();
          return;
        }
        texture.mapping = THREE.EquirectangularReflectionMapping;
        this.textures.push(texture);
        this.daySky = texture;
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
      },
    );
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
    const texture = new THREE.CanvasTexture(canvas);
    const draw = () => {
      const shown = tr(text);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (bg) {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      let size = Math.floor(canvas.height * 0.73);
      ctx.font = '600 ' + size + 'px monospace';
      const measured = ctx.measureText(shown).width;
      if (measured > 980) {
        size = Math.floor((size * 980) / measured);
        ctx.font = '600 ' + size + 'px monospace';
      }
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(shown, 512, canvas.height / 2);
      texture.needsUpdate = true;
    };
    draw();
    this.relabel.push(draw);
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
    const t = this.loader.load(assetUrl('materials/' + key), () => {
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
  buildSeat(parent?: THREE.Object3D) {
    return buildSeatImpl(this, parent);
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
    if (this.inHangar || this.inYard || this.inMech || this.inDrone) return null;
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
      if (hit.object.userData.zoomOnly && this.targetFov > 30) continue;
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
    const wasExterior = this.inHangar || this.inYard || this.inMech || this.inDrone;
    if (name === 'drone' && !droneAirborne(this.drone)) name = 'front';
    this.inHangar = name === 'hangar';
    this.inYard = name === 'yard';
    this.inMech = name === 'mech';
    this.inDrone = name === 'drone';
    const outside = this.inHangar || this.inYard || this.inMech || this.inDrone;
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
      drone: [0, 0, this.droneFov],
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
    this.renderer.toneMappingExposure =
      this.inMech || this.inDrone ? 1.05 : this.inYard ? 1.05 : this.inHangar ? 1.2 : 0.94;
    this.baseEnvIntensity = this.inMech ? 0.55 : 0.18;
    this.baseFogDensity = this.inYard ? 0.0016 : 0.0011;
    this.applyDayNight();
    this.camera.updateMatrixWorld();
    this.pendingPointer = null;
    this.hover(null);
  }
  /** Tag/Nacht umschalten; der Übergang läuft weich im Bildtakt. */
  setNight(on: boolean) {
    this.nightTarget = on ? 1 : 0;
  }
  setHeadlights(on: boolean) {
    if (on && !this.headlightsOn) this.headlightSince = this.lastTime / 1000;
    this.headlightsOn = on;
  }
  setWeaponsArmed(on: boolean) {
    this.weapons = { ...this.weapons, armed: on };
    if (!on) this.trigger = false;
  }
  setLaser(on: boolean) {
    this.weapons = { ...this.weapons, laser: on };
  }
  /** Zielpunkt: Strahl durch den Mauszeiger (Kanzel) bzw. geradeaus (Außenansichten). */
  private updateAim(outside: boolean) {
    const range = this.weaponSystem?.range;
    if (!range) return;
    let origin: THREE.Vector3, dir: THREE.Vector3;
    if (!outside) {
      this.camera.updateMatrixWorld();
      this.aimRay.setFromCamera(this.aimNdc, this.camera);
      origin = this.aimRay.ray.origin;
      dir = this.aimRay.ray.direction;
    } else {
      origin = this.cabin.localToWorld(new THREE.Vector3(0, 1.6, 3.85));
      dir = new THREE.Vector3(0, -0.06, -1).applyQuaternion(this.cabin.quaternion).normalize();
    }
    const far = origin.clone().addScaledVector(dir, 800);
    const hit = range.hitTest(origin, far);
    this.aimPoint.copy(hit ? hit.point : far);
    // Von der Drohne markiertes Ziel hat Vorrang: die Kanonen richten sich darauf aus.
    const mark = this.drone.mark;
    if (mark && droneAirborne(this.drone)) this.aimPoint.set(mark.x, mark.y, mark.z);
    this.laserFrom.copy(this.cabin.localToWorld(new THREE.Vector3(0, 0.15, -2.4)));
    this.aimRange = this.laserFrom.distanceTo(this.aimPoint);
  }
  /** Schussrichtung von Kanone `gun` zum Zielpunkt, begrenzt auf den Schwenkbereich. */
  private gunDirection(gun: number, seed: number) {
    const muzzle = this.weaponSystem?.muzzleWorld(gun, new THREE.Vector3());
    if (!muzzle) return null;
    const inv = this.cabin.quaternion.clone().invert();
    const d = this.aimPoint.clone().sub(muzzle).applyQuaternion(inv);
    const aim = clampAim(Math.atan2(-d.x, -d.z), Math.atan2(d.y, Math.hypot(d.x, d.z)));
    const yaw = aim.yaw + (hash(seed, 1) - 0.5) * 2 * WEAPON.spread,
      pitch = aim.pitch + (hash(seed, 2) - 0.5) * 2 * WEAPON.spread;
    return {
      dir: new THREE.Vector3(
        -Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        -Math.cos(yaw) * Math.cos(pitch),
      )
        .applyQuaternion(this.cabin.quaternion)
        .normalize(),
      onTarget: aim.onTarget,
      yaw: Math.atan2(-d.x, -d.z),
    };
  }
  updateWeapons(
    s: MachineState,
    walk: CockpitScene['walkPose'],
    dt: number,
    time: number,
    outside: boolean,
  ) {
    const ws = this.weaponSystem;
    if (!ws) return;
    const sheltered = insideShelter(walk.x, walk.z);
    const parked =
      sheltered &&
      s.mobility.restraints !== 'released' &&
      Math.hypot(walk.x, walk.z - WALK.originZ) < 3;
    const powered = dcPowerAvailable(s);
    if (this.weapons.armed || this.weapons.laser) this.updateAim(outside);
    const step = stepWeapons(
      this.weapons,
      s,
      dt,
      time,
      this.trigger && !outside,
      sheltered,
      parked,
    );
    this.weapons = step.w;
    this.weaponMessage = this.weapons.armed ? weaponBlock(s, this.weapons, sheltered) : null;
    for (const gun of step.shots) {
      const seed = this.weapons.shots * 7 + gun;
      const aim = this.gunDirection(gun, seed);
      if (!aim) continue;
      ws.fire(gun, aim.dir, time, seed, new THREE.Vector3());
      this.jolt.impulse(0.16, gun === 0 ? 1 : -1);
      if (this.exterior) this.exterior.recoil[gun] = 1;
      this.onGunshot?.(!outside);
    }
    if (this.exterior) for (const g of [0, 1]) this.exterior.recoil[g] *= Math.exp(-dt * 14);
    // Zielhilfe: ist das Ziel außerhalb des Schwenkbereichs, soll der Torso nachführen.
    const probe = this.weapons.armed ? this.gunDirection(0, 0) : null;
    this.aimOnTarget = probe?.onTarget ?? true;
    this.torsoDemand =
      probe && !outside ? torsoFollow((this.jointPose.torso * 180) / Math.PI, probe.yaw) : null;
    const laserOn = this.weapons.laser && powered;
    const events = ws.update(
      dt,
      time,
      this.renderer.domElement.height * 0.9,
      outside,
      laserOn ? this.laserFrom : null,
      laserOn ? this.aimPoint : null,
      this.reduced,
    );
    this.camera.getWorldPosition(this.camWorld);
    for (const e of events) {
      if (e.kind === 'steel' && e.plate !== undefined) {
        ws.range.knock(e.plate, time);
        this.weapons = { ...this.weapons, hits: this.weapons.hits + 1 };
      } else if (e.kind === 'wreck')
        this.weapons = { ...this.weapons, hits: this.weapons.hits + 1 };
      else if (e.kind === 'target' && e.target) {
        this.worldTargets?.hit(e.target, time);
        this.weapons = { ...this.weapons, hits: this.weapons.hits + 1 };
      }
      this.onImpact?.(
        e.kind === 'structure' ? 'wreck' : e.kind === 'target' ? 'steel' : e.kind,
        e.point.distanceTo(this.camWorld),
      );
      if (e.kind === 'ground')
        this.dust?.spawn(e.point.x, e.point.y, e.point.z, 0.35, time, Math.floor(time * 131));
    }
    ws.range.update(time);
  }
  /** Drohne: Halterung verfolgen, Zustand fortschreiben, Modell und Markierung zeichnen. */
  private updateDrone(s: MachineState, dt: number, time: number) {
    const rig = this.droneRig,
      dock = this.exterior?.dockReady ? this.exterior.droneDock : null;
    if (!rig || !dock) return;
    dock.world(this.dockWorld);
    // Blickrichtung des Rumpfs: lokale +z-Achse des Mech-Modells zeigt nach vorn.
    this.dockForward.set(0, 0, 1).transformDirection(dock.anchor.matrixWorld);
    const dockYaw = Math.atan2(-this.dockForward.x, -this.dockForward.z);
    const prev = this.drone.phase;
    const wp = this.walkPose;
    // Mech in der Halle: dort fliegt die Drohne nicht mit (Begleitmodus landet bzw. wartet)
    const mechInHall = wp.z > DRONE_HALL_Z;
    // Begleitmodus: nach dem Laden selbstständig wieder starten
    if (
      followRelaunchDue(this.drone) &&
      !mechInHall &&
      !droneBlock(s, this.drone) &&
      camerasPowered(s)
    ) {
      this.drone = { ...this.drone, phase: 'spinup', t: 0 };
      this.droneNotice = 'Begleitmodus: Drohne startet selbstständig.';
    }
    // In Teilschritten von höchstens 50 ms (stabil auch bei langsamen Bildern)
    const steps = Math.max(1, Math.ceil(dt / 0.05));
    for (let i = 0; i < steps; i++)
      this.drone = stepDrone(
        this.drone,
        droneHasControls(this.drone) ? this.droneInput : idleDroneInput(),
        dt / steps,
        {
          dock: { x: this.dockWorld.x, y: this.dockWorld.y, z: this.dockWorld.z },
          dockYaw,
          // Boden oder Dach: über Gebäuden hält die Drohne Abstand zur Oberkante
          ground: (x, z) => MECH.floor + Math.max(groundHeight(x, z), structureTop(x, z)),
          gate: s.hangar.position,
          wind: insideShelter(this.drone.pos.x, this.drone.pos.z) ? 0 : this.rainAmount,
          time,
          mech: {
            x: wp.x,
            z: wp.z,
            yaw: wp.yaw,
            speed: wp.speed,
            inHall: mechInHall,
            ahead: this.scoutPoint(s),
          },
        },
        camerasPowered(s),
      );
    if (prev === 'follow' && this.drone.phase === 'rtb')
      this.droneNotice =
        this.drone.rtbReason === 'battery'
          ? 'Begleitmodus: Akku schwach – Drohne landet zum Laden und startet danach wieder.'
          : this.drone.rtbReason === 'hall'
            ? 'Begleitmodus: Mech in der Halle – Drohne landet und wartet.'
            : 'Begleitmodus: Funk schwach – Drohne kehrt zurück.';
    // Gelandet: zurück ins Cockpit, falls die Vollbildsicht aktiv war.
    if (prev !== 'docked' && this.drone.phase === 'docked' && this.inDrone) {
      this.view('front');
      this.droneReturned = true;
    }
    rig.root.visible = true;
    // Zoom gilt auch für das Bild auf dem Kameramonitor im Cockpit
    if (rig.camera.fov !== this.droneFov) {
      rig.camera.fov = this.droneFov;
      rig.camera.updateProjectionMatrix();
    }
    rig.update(this.drone, time, this.nightAmount, dt);
    this.targetMarker?.update(this.drone, time);
    this.camera.layers[this.inDrone ? 'disable' : 'enable'](LASER_LAYER);
  }
  /** Für den Kamera-Monitor: Mech-Hülle kurz sichtbar machen, Drohne selbst ausblenden. */
  private showHullFor() {
    const hull = this.exterior?.root,
      rig = this.droneRig?.root;
    const hullWas = hull?.visible ?? false,
      rigWas = rig?.visible ?? false;
    if (hull) hull.visible = true;
    if (rig) rig.visible = false;
    return () => {
      if (hull) hull.visible = hullWas;
      if (rig) rig.visible = rigWas;
    };
  }
  /** Ziel markieren: Strahl durch den Mauszeiger der Drohnensicht. Ins Leere = löschen. */
  /** Einsatz: Erfassen, Fortschritt, Lagebild für das Taktik-Display. */
  private updateMissions(dt: number, time: number) {
    this.spotTargets(time);
    const walk = this.walkPose,
      rig = this.droneRig;
    const airborne = droneOnStation(this.drone);
    if (rig) {
      rig.camera.getWorldPosition(this.droneEye);
      rig.camera.getWorldDirection(this.droneForward);
    }
    const targets = this.worldTargets;
    this.missions.update(
      dt,
      walk,
      insideShelter(walk.x, walk.z),
      { airborne, position: this.droneEye, forward: this.droneForward, signal: this.drone.signal },
      (id) => targets?.destroyed(id) ?? false,
    );
    // Lagebild fürs Taktik-Display: das Display zeichnet höchstens 8× pro Sekunde neu,
    // daher reicht eine Aktualisierung alle 100 ms (spart Speicherbelegung pro Bild).
    if (time - this.tacticalAt < 0.1) return;
    this.tacticalAt = time;
    const info = this.missions.info(walk.x, walk.z);
    const objectiveIds = new Set(
      info.active
        ? (missionById(info.active.id)?.objectives ?? []).flatMap((o) =>
            o.kind === 'destroy' ? [o.target] : [],
          )
        : [],
    );
    const next = info.active?.next;
    this.instrumentAssets.tactical = {
      x: walk.x,
      z: walk.z,
      yaw: walk.yaw,
      drone: droneAirborne(this.drone) ? { x: this.drone.pos.x, z: this.drone.pos.z } : null,
      roads: ROADS,
      blips: this.blips,
      targets: TARGETS.map((t) => ({
        x: t.x,
        z: t.z,
        destroyed: targets?.destroyed(t.id) ?? false,
        objective: objectiveIds.has(t.id),
      })),
      objective: next
        ? {
            x: next.x,
            z: next.z,
            r: next.r,
            exact: next.exact,
            label: next.label,
            distance: next.distance,
          }
        : null,
      mission: info.active?.title ?? null,
      route: (() => {
        const f = this.getState().fms;
        if (!f.plan) return null;
        const active = f.ap !== 'off';
        return {
          points: active
            ? [{ x: walk.x, z: walk.z }, ...f.plan.points.slice(f.leg)]
            : f.plan.points,
          active,
        };
      })(),
    };
  }
  /**
   * Alle Shader vorab übersetzen (hinter dem Ladebildschirm), damit der erste Blick nach
   * draußen, auf den Kameramonitor oder die erste Explosion nicht ruckelt. Drei Durchgänge,
   * weil die Zahl der Lichter je Ansicht verschieden ist (Kanzel / außen / Monitor).
   */
  /** Grafikeinstellungen übernehmen (beim Start und bei jeder Änderung im Menü). */
  applyGraphics(g: Graphics, initial = false) {
    const old = this.graphics;
    this.graphics = g;
    if (initial || old.resolution !== g.resolution || old.look !== g.look) this.resizeView();
    this.retro.setLook(g.look, this.scene);
    // Schatten: Auflösung der Schattenkarten, ganz aus nur auf ausdrücklichen Wunsch
    if (initial || old.shadows !== g.shadows) {
      const enabled = g.shadows !== 'off';
      const lights: [THREE.DirectionalLight | THREE.SpotLight, number][] = [[this.sun, 2048]];
      for (const f of this.floodlights) if (f.light.castShadow) lights.push([f.light, 1024]);
      for (const [light, base] of lights) {
        const size = shadowMapSize(g.shadows, base);
        if (light.shadow.mapSize.x !== size) {
          light.shadow.mapSize.set(size, size);
          light.shadow.map?.dispose();
          light.shadow.map = null;
        }
        light.shadow.needsUpdate = true;
      }
      if (this.renderer.shadowMap.enabled !== enabled) {
        this.renderer.shadowMap.enabled = enabled;
        // Materialien mit/ohne Schattenempfang neu übersetzen (einmalig beim Umschalten)
        this.scene.traverse((o) => {
          const m = (o as THREE.Mesh).material;
          if (m) for (const mat of [m].flat()) mat.needsUpdate = true;
        });
      }
      this.renderer.shadowMap.needsUpdate = true;
    }
    if (initial || old.distance !== g.distance) {
      const ratio = FAR_PLANE[g.distance] / FULL_FAR;
      this.camera.far = FAR_PLANE[g.distance];
      this.camera.updateProjectionMatrix();
      for (const c of this.surround?.cameras ?? []) {
        c.far = 1200 * ratio;
        c.updateProjectionMatrix();
      }
      if (this.droneRig) {
        this.droneRig.camera.far = 1600 * ratio;
        this.droneRig.camera.updateProjectionMatrix();
      }
      // Dunstdichte hängt an der Sichtweite: Licht/Nebel sofort neu setzen
      if (!initial) this.applyDayNight();
    }
    CAPTURE.grid = MONITOR_INTERVAL[g.monitors].grid;
    CAPTURE.selected = MONITOR_INTERVAL[g.monitors].selected;
  }

  async precompile() {
    await new Promise((r) => setTimeout(r, 0));
    const pass = (skip: THREE.Object3D | null) => {
      const hidden: THREE.Object3D[] = [];
      this.scene.traverse((o) => {
        if (o.visible) return;
        for (let a: THREE.Object3D | null = o; a; a = a.parent) if (a === skip) return;
        // Keine Lichter einschalten: ihre Zahl gehört zum Shader (sonst falsche Variante)
        let light = false;
        o.traverse((c) => (light ||= (c as THREE.Light).isLight === true));
        if (light) return;
        hidden.push(o);
        o.visible = true;
      });
      try {
        // Der synchrone Teil erzeugt die Programme; Sichtbarkeit sofort zurücksetzen
        return this.renderer.compileAsync(this.scene, this.camera);
      } finally {
        for (const o of hidden) o.visible = false;
      }
    };
    const jobs: Promise<unknown>[] = [];
    try {
      jobs.push(pass(null));
      setCockpitInterior(this.cabin, this.interior, false);
      jobs.push(pass(this.interior));
      setCockpitInterior(this.cabin, this.interior, true);
      const cabinVisible = this.cabin.visible;
      this.cabin.visible = false;
      jobs.push(pass(this.cabin));
      this.cabin.visible = cabinVisible;
      await Promise.all(jobs);
    } catch (e) {
      console.warn('[IRON VAULT] Shader-Vorübersetzung unvollständig', e);
    } finally {
      setCockpitInterior(
        this.cabin,
        this.interior,
        !(this.inMech || this.inHangar || this.inYard || this.inDrone),
      );
    }
  }
  /** Einsatz beginnen (Ziele werden wieder aufgebaut). */
  startMission(id: string) {
    const ids = this.missions.start(id, this.lastTime / 1000);
    this.worldTargets?.restore(ids);
  }
  abortMission() {
    this.missions.abort();
  }
  missionInfo() {
    const w = this.walkPose;
    // Blickrichtung: in der Drohnensicht die Drohne, sonst Mech + Torso + Kopfdrehung
    const yaw = this.inDrone
      ? this.drone.yaw
      : w.yaw + this.jointPose.torso + (this.inMech ? 0 : this.yaw);
    return {
      ...this.missions.info(w.x, w.z),
      x: w.x,
      z: w.z,
      yaw: w.yaw,
      heading: ((((-yaw * 180) / Math.PI) % 360) + 360) % 360,
      drone: droneAirborne(this.drone) ? { x: this.drone.pos.x, z: this.drone.pos.z } : null,
      destroyed: TARGETS.filter((t) => this.worldTargets?.destroyed(t.id)).map((t) => t.id),
      known: [...this.knownTargets],
    };
  }
  markFromDrone() {
    const range = this.weaponSystem?.range;
    if (!this.droneRig || !range || !droneAirborne(this.drone)) return;
    this.camera.updateMatrixWorld();
    this.aimRay.setFromCamera(this.aimNdc, this.camera);
    const origin = this.aimRay.ray.origin,
      far = origin.clone().addScaledVector(this.aimRay.ray.direction, 600);
    const hit = range.hitTest(origin, far);
    const point = hit ? hit.point : null;
    this.drone = droneMark(this.drone, point ? { x: point.x, y: point.y, z: point.z } : null);
    // Laser-Entfernungsmesser im Sensorkopf: Schrägentfernung von der Drohne zum Punkt
    this.droneNotice = point
      ? 'Ziel markiert: ' +
        Math.round(point.distanceTo(this.droneEye)) +
        ' m, Planquadrat ' +
        sectorName(point.x, point.z) +
        '. Im MCDU unter DIR wählbar.'
      : 'Zielmarkierung gelöscht.';
    if (point) this.missions.markAt(point);
    if (point) this.droneMarks++;
  }
  /** Taste: starten bzw. zurückrufen. Meldung für das Kommunikationsdisplay. */
  droneToggle(s: MachineState): { message: string; error: boolean } | null {
    const block = droneBlock(s, this.drone);
    if (block) return { message: block, error: true };
    if (!this.exterior?.dockReady) return { message: 'Drohne noch nicht bereit.', error: true };
    const before = this.drone.phase;
    this.drone = toggleDrone(this.drone, s);
    if (before === 'docked' && this.drone.phase === 'spinup')
      return { message: 'Drohne startet. Rotoren laufen hoch.', error: false };
    if (this.drone.phase === 'rtb')
      return { message: 'Drohne kehrt zurück und landet auf der Halterung.', error: false };
    return null;
  }
  /**
   * Aufklärungspunkt: 150 m voraus auf dem Marschplan (Autopilot) bzw. in Blickrichtung.
   */
  private scoutPoint(s: MachineState) {
    const w = this.walkPose,
      f = s.fms,
      ahead = DRONE.scout.ahead;
    if (f.plan && f.ap !== 'off') {
      let left = ahead,
        x = w.x,
        z = w.z;
      for (let i = Math.max(1, f.leg); i < f.plan.points.length; i++) {
        const p = f.plan.points[i],
          seg = Math.hypot(p.x - x, p.z - z);
        if (seg >= left)
          return { x: x + ((p.x - x) * left) / seg, z: z + ((p.z - z) * left) / seg };
        left -= seg;
        x = p.x;
        z = p.z;
      }
      return { x, z };
    }
    return { x: w.x - Math.sin(w.yaw) * ahead, z: w.z - Math.cos(w.yaw) * ahead };
  }
  /** Von der Drohne oder in Mech-Nähe aufgeklärte Ziele (für die Einsatzkarte). */
  knownTargets = new Set<string>();
  private spotAt = 0;
  /** Aufklärung alle 0,5 s: Ziele in Sensorreichweite der Drohne oder nahe am Mech. */
  private spotTargets(time: number) {
    if (time - this.spotAt < 0.5) return;
    this.spotAt = time;
    const d = this.drone,
      w = this.walkPose,
      flying = droneOnStation(d);
    const found: string[] = [];
    for (const t of TARGETS) {
      if (this.knownTargets.has(t.id)) continue;
      const byDrone = flying && Math.hypot(t.x - d.pos.x, t.z - d.pos.z) < 170;
      if (byDrone || Math.hypot(t.x - w.x, t.z - w.z) < 220) {
        this.knownTargets.add(t.id);
        if (byDrone) found.push(t.label);
      }
    }
    if (found.length)
      this.droneNotice =
        found.length === 1
          ? 'Drohne: Ziel aufgeklärt – ' + found[0] + '.'
          : 'Drohne: ' + found.length + ' Ziele aufgeklärt.';
  }
  /** Taste 9: Vorausaufklärung an/aus (startet angedockt selbstständig). */
  droneScout(s: MachineState): { message: string; error: boolean } | null {
    if (!this.exterior?.dockReady) return { message: 'Drohne noch nicht bereit.', error: true };
    const before = this.drone;
    this.drone = droneScoutToggle(before, s);
    const d = this.drone;
    if (before.phase === 'docked' && d.phase === 'spinup')
      return { message: 'Vorausaufklärung: Drohne startet und fliegt voraus.', error: false };
    if (d.phase === 'follow')
      return {
        message: d.scout
          ? 'Vorausaufklärung: Drohne fliegt ' + DRONE.scout.ahead + ' m voraus.'
          : 'Begleitmodus: Drohne folgt dem Mech.',
        error: false,
      };
    if (d.phase === 'docked' && d.follow) {
      const block = droneBlock(s, d);
      return {
        message: 'Vorausaufklärung vorgemerkt' + (block ? ': ' + block : '.'),
        error: false,
      };
    }
    return {
      message: d.scout ? 'Vorausaufklärung vorgemerkt.' : 'Vorausaufklärung aus.',
      error: false,
    };
  }
  /** Zoom der Drohnenkamera (Faktor > 1 = näher), 1× bis 8×. */
  droneZoomBy(factor: number) {
    this.droneFov = THREE.MathUtils.clamp(this.droneFov / factor, 70 / 8, 70);
    if (this.inDrone) this.targetFov = this.droneFov;
  }
  /** Taste: Begleitmodus an/aus (startet angedockt selbstständig). */
  droneFollow(s: MachineState): { message: string; error: boolean } | null {
    if (!this.exterior?.dockReady) return { message: 'Drohne noch nicht bereit.', error: true };
    const before = this.drone;
    this.drone = droneFollowToggle(before, s);
    const d = this.drone;
    if (before.phase === 'docked' && d.phase === 'spinup')
      return { message: 'Begleitmodus: Drohne startet und folgt dem Mech.', error: false };
    if (d.phase === 'follow')
      return { message: 'Begleitmodus: Drohne folgt dem Mech.', error: false };
    if (before.phase === 'follow' && d.phase === 'flying')
      return { message: 'Drohne: Handsteuerung. W A S D fliegen die Drohne.', error: false };
    if (d.phase === 'docked' && d.follow) {
      const block = droneBlock(s, d);
      return {
        message: 'Begleitmodus vorgemerkt' + (block ? ': ' + block : '.'),
        error: false,
      };
    }
    return {
      message: d.follow ? 'Begleitmodus vorgemerkt.' : 'Begleitmodus aus.',
      error: false,
    };
  }
  setDroneInput(input: DroneInput) {
    this.droneInput = input;
  }
  /** Drohne hat angedockt, während die Drohnensicht aktiv war (Oberfläche schaltet zurück). */
  droneReturned = false;
  /** Zählt gesetzte Zielmarkierungen (für den Einrast-Ton). */
  private droneMarks = 0;
  /** Für die Oberfläche (~10 Hz). */
  droneInfo() {
    const d = this.drone;
    return {
      phase: d.phase,
      airborne: droneAirborne(d),
      controls: droneHasControls(d),
      battery: d.battery,
      signal: d.signal,
      altitude: Math.max(0, d.pos.y - MECH.floor - groundHeight(d.pos.x, d.pos.z)),
      distance: Math.hypot(d.pos.x - this.dockWorld.x, d.pos.z - this.dockWorld.z),
      marked: !!d.mark,
      /** Lasermarke: Weltposition, Schrägentfernung und Höhe über Grund */
      mark: d.mark
        ? {
            x: d.mark.x,
            z: d.mark.z,
            range: Math.hypot(d.mark.x - d.pos.x, d.mark.y - d.pos.y, d.mark.z - d.pos.z),
            height: d.mark.y - MECH.floor - groundHeight(d.mark.x, d.mark.z),
          }
        : null,
      zoom: 70 / this.droneFov,
      sensor: this.droneSensor?.mode ?? 'tv',
      rtbReason: d.rtbReason,
      follow: d.follow,
      scout: d.scout,
      rotor: d.rotor,
      marks: this.droneMarks,
      speed: Math.hypot(d.vel.x, d.vel.y, d.vel.z),
    };
  }
  /** Für die Oberfläche: Zustand des Waffensystems (wird mit ~10 Hz abgefragt). */
  weaponInfo() {
    const w = this.weapons;
    return {
      armed: w.armed,
      laser: w.laser,
      ammo: [Math.floor(w.ammo[0]), Math.floor(w.ammo[1])] as [number, number],
      heat: w.heat,
      overheated: w.overheated,
      shots: w.shots,
      hits: w.hits,
      reloading: w.reloading,
      range: this.aimRange,
      onTarget: this.aimOnTarget,
      block: this.weaponMessage,
      torsoDemand: this.torsoDemand,
    };
  }
  /** Aufsetzen erkennen: Kanzelstoß, Staub, Fußabdruck. */
  updateWeight(walk: CockpitScene['walkPose'], dt: number, time: number) {
    const sides = detectFootfalls(this.lastPhase, walk.phase);
    this.lastPhase = walk.phase;
    const moving = Math.abs(walk.speed) > 0.05 || Math.abs(walk.turnRate) > 0.02;
    if (moving)
      for (const side of sides) {
        const strength = footfallStrength(walk.speed, walk.turnRate);
        this.jolt.impulse(strength, side);
        const foot = this.exterior?.footprint(walk, side);
        if (!foot) continue;
        this.dust?.spawn(foot.x, foot.y, foot.z, strength, time, Math.floor(walk.phase * 2));
        this.footprints?.place(foot.x, foot.y, foot.z, foot.yaw, time);
      }
    this.jolt.step(dt);
    this.clutter?.update(
      dt,
      this.jolt.vRoll * 0.6 + this.jolt.vPitch * 0.3 + walk.turnRate * 0.05,
      this.reduced,
    );
  }
  /** Regen, Nässe, Sonnen-/Mondschatten und Tropfen auf der Scheibe. */
  updateWeather(
    walk: CockpitScene['walkPose'],
    dt: number,
    time: number,
    outside: boolean,
    headlight: number,
  ) {
    if (this.rainAmount !== this.rainTarget) {
      this.rainAmount += (this.rainTarget - this.rainAmount) * (1 - Math.exp(-dt * RAIN_RATE));
      if (Math.abs(this.rainTarget - this.rainAmount) < 0.002) this.rainAmount = this.rainTarget;
      this.applyDayNight();
    }
    const n = this.nightAmount,
      w = weatherParams(this.rainAmount);
    // Gewitter: Blitz erhellt Himmel und Umgebung, Donner folgt nach Entfernung.
    const storm = this.storm.update(time, this.rainAmount, this.reduced);
    for (const t of storm.thunder) this.onThunder?.(t.variant, t.distance);
    if (storm.flash > 0 || this.flashing) {
      this.applyDayNight();
      const f = storm.flash * (0.35 + 0.65 * n);
      this.hemi.intensity += f * 3;
      this.hemi.color.lerp(new THREE.Color(0xc8d4ff), Math.min(1, f));
      this.scene.backgroundIntensity += f * 1.4;
      this.flashing = storm.flash > 0;
    }
    const sheltered = insideShelter(walk.x, walk.z);
    // Sonne (tief, warm) bei Tag, Mond (hoch, kalt) bei Nacht; unter dem Hallendach aus.
    const open = THREE.MathUtils.smoothstep(-walk.z, 30, 37.5);
    this.sun.intensity = THREE.MathUtils.lerp(2.8, 0.3, n) * w.sun * open;
    this.sun.color.setHex(0xffd9b0).lerp(new THREE.Color(0x9fb4e0), n);
    const dir = new THREE.Vector3(-0.62, 0.42, -0.66)
      .lerp(new THREE.Vector3(0.35, 0.82, -0.45), n)
      .normalize();
    this.sun.target.position.set(walk.x, walk.height + 1, walk.z);
    this.sun.position.copy(this.sun.target.position).addScaledVector(dir, 45);
    // Schattenkarte nur neu zeichnen, wenn die Sonne wirkt – aber mindestens einmal anlegen,
    // sonst bleibt der Schatten-Sampler ohne Textur (WebGL-Fehler).
    this.sun.shadow.autoUpdate = this.sun.intensity > 0.01 || !this.sun.shadow.map;
    if (this.exterior) {
      this.exterior.contact = 1 - 0.55 * Math.min(1, this.sun.intensity / 1.5);
      // Panzerung wird im Regen nass und trocknet unter Dach langsam ab.
      const target = sheltered ? 0 : this.rainAmount;
      this.exterior.wetness +=
        (target - this.exterior.wetness) *
        (1 - Math.exp(-dt / (target > this.exterior.wetness ? 6 : 60)));
    }
    this.dust?.update(
      time,
      1 - 0.8 * n,
      sheltered ? 0 : this.rainAmount,
      this.renderer.domElement.height * 0.9,
    );
    this.footprints?.update(time, this.rainAmount);
    this.camera.getWorldPosition(this.camWorld);
    this.rain?.update(
      time,
      this.camWorld,
      this.rainAmount,
      THREE.MathUtils.lerp(0.55, 0.05, n),
      outside ? 0.4 : 3.2,
      this.exterior?.lights.spots ?? [],
      headlight,
      0.25 + 0.75 * n,
    );
    if (this.glass) {
      const cabin = !outside;
      this.glass.visible =
        cabin &&
        (this.rainAmount > 0.01 || (this.glass.material as THREE.MeshBasicMaterial).opacity > 0.01);
      const mat = this.glass.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.min(1, this.rainAmount * 1.4) * (sheltered ? 0.3 : 1);
      if (cabin)
        this.glassRain.update(
          time,
          sheltered ? 0 : this.rainAmount,
          0.35 + 0.65 * (1 - n) + headlight * 0.3,
        );
    }
  }
  setRain(on: boolean) {
    this.rainTarget = on ? 1 : 0;
  }
  applyDayNight() {
    const p = dayNightParams(this.nightAmount);
    const w = weatherParams(this.rainAmount);
    const sky = p.sky === 'day' ? this.daySky : this.nightSky;
    if (sky) {
      this.scene.background = sky;
      this.scene.backgroundRotation.y = p.sky === 'day' ? 0.35 : 0;
    }
    this.scene.backgroundIntensity = p.skyIntensity * w.sky;
    this.hemi.intensity = p.hemiIntensity * w.hemi;
    this.hemi.color.copy(p.hemiSky);
    this.hemi.groundColor.copy(p.hemiGround);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color
        .copy(p.fogColor)
        .lerp(new THREE.Color(0x4a5054).multiplyScalar(1 - 0.8 * p.n), w.fogGrey);
      this.scene.fog.density = Math.max(
        this.baseFogDensity * p.fogScale * w.fogDensity,
        minFogDensity(this.graphics.distance),
      );
    }
    for (const m of this.yardMaterials) if (m.envMap) m.envMapIntensity = p.yardEnv;
    this.scene.environmentIntensity = this.baseEnvIntensity * p.envScale;
    if (this.yardLamp) this.yardLamp.emissiveIntensity = p.lampGlow;
    for (const f of this.floodlights) f.light.intensity = f.base * p.floodScale;
    if (this.exterior) this.exterior.night = p.n;
    this.wet.value = w.wet;
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
  /** Bildschirm beim nächsten Bild neu zeichnen (z. B. nach einem MCDU-Tastendruck). */
  refreshScreen(kind: string) {
    for (const screen of this.screens) if (screen.kind === kind) screen.lastDraw = -Infinity;
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
    if (sc.kind === 'hud' && this.displayBoot.phase === 'ready' && s.stage >= 5)
      drawWeaponHud(sc.ctx, this.weaponInfo());
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
    // Drohnenflug in echter Zeit (bis 0,5 s wie die Laufsimulation), damit sie bei
    // langsamen Bildern nicht hinter dem gehenden Mech zurückbleibt
    const flightDt = Math.min((ms - this.lastTime) / 1000, 0.5) || 0.016;
    this.lastTime = ms;
    this.perf.frame(ms);
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
    // Alte Röhren: Helligkeit flackert beim Einschalten und bei gelegentlichen Störungen.
    const boot = this.displayBoot;
    for (let i = 0; i < this.screens.length; i++)
      this.screens[i].material.color.setScalar(
        1.2 * s.displayBrightness * displayFlicker(boot.phase, boot.elapsed, time, i, this.reduced),
      );
    if (this.screenSpill)
      this.screenSpill.intensity +=
        ((boot.phase === 'off'
          ? 0
          : instrumentSpill(s) * displayFlicker(boot.phase, boot.elapsed, time, 1, this.reduced)) *
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
    const outside = this.inMech || this.inHangar || this.inYard || this.inDrone;
    setCockpitInterior(this.cabin, this.interior, !outside);
    applyMechBodyPose(
      this.cabin,
      walk,
      outside ? 1 : this.reduced ? 0 : Math.min(1, s.walk.sway / 0.4),
      false,
      this.jointPose.torso,
      this.jointPose.pitch,
    );
    this.exterior?.update(
      this.cabin,
      s,
      walk,
      this.inMech,
      outside,
      this.jointPose,
      droneAirborne(this.drone),
    );
    this.updateDrone(s, flightDt, time);
    this.world?.update(time, dt);
    this.worldTargets?.update(
      dt,
      time,
      this.renderer.domElement.height * 0.9,
      this.scene.fog instanceof THREE.FogExp2 ? this.scene.fog : null,
      this.sun.color,
    );
    this.updateMissions(dt, time);
    // Tag/Nacht-Übergang
    if (this.nightAmount !== this.nightTarget) {
      this.nightAmount +=
        (this.nightTarget - this.nightAmount) * (1 - Math.exp(-dt * DAY_NIGHT_RATE));
      if (Math.abs(this.nightTarget - this.nightAmount) < 0.002)
        this.nightAmount = this.nightTarget;
      this.applyDayNight();
    }
    // Scheinwerfer (brauchen Bordstrom) und Rundumleuchte (dreht beim Gehen)
    const powered = dcPowerAvailable(s);
    if (powered && !this.lastPowered) this.headlightSince = time;
    this.lastPowered = powered;
    if (Math.abs(walk.speed) > 0.05 || Math.abs(walk.turnRate) > 0.02) {
      this.movingFor += dt;
      this.stoppedFor = 0;
    } else {
      this.movingFor = 0;
      this.stoppedFor += dt;
    }
    const headlight = headlightLevel(
      this.headlightsOn,
      powered,
      time - this.headlightSince,
      this.reduced,
    );
    this.exterior?.lights.update(
      headlight,
      powered ? beaconLevel(time, this.movingFor, this.stoppedFor) : 0,
      this.nightAmount,
      time,
      outside,
    );
    this.updateWeight(walk, dt, time);
    this.updateWeather(walk, dt, time, outside, headlight);
    this.updateWeapons(s, walk, dt, time, outside);
    const looking =
      this.drag ||
      Math.abs(this.targetYaw - this.yaw) + Math.abs(this.targetPitch - this.pitch) > 0.002;
    const vibration =
      !this.inHangar &&
      !this.inYard &&
      !this.inMech &&
      !this.inDrone &&
      !looking &&
      !this.reduced &&
      (s.stage >= 4 || s.busy === 3)
        ? Math.sin(time * 39) * (0.00055 + (actuatorMoving(s) ? 0.0009 : 0)) * (1 + s.throttle)
        : 0;
    this.camera.rotation.set(this.pitch + vibration, this.yaw, 0, 'YXZ');
    if (this.inMech) this.updateOrbit(damp);
    if (this.inDrone && this.droneRig) {
      // Die Hauptkamera sitzt in der Drohne (Kamera am Gimbal).
      this.droneRig.camera.getWorldPosition(this.droneCamWorld);
      this.droneRig.camera.getWorldQuaternion(this.droneQuat);
      this.camera.position.copy(this.droneCamWorld);
      this.camera.quaternion.copy(this.droneQuat);
    }
    if (!this.inHangar && !this.inYard && !this.inMech && !this.inDrone) {
      const visual = looking ? amplitude * 0.25 : amplitude;
      this.camera.position.set(
        Math.sin(phase) * 0.045 * visual,
        1.6 + (1 - Math.cos(phase * 2)) * 0.055 * visual,
        3.85,
      );
      this.camera.rotation.z += Math.sin(phase) * 0.012 * visual;
      // Aufsetzstoß: folgt der Einstellung SCHRITTBEWEGUNG (AUS = kein Stoß).
      const jolt = this.reduced ? 0 : Math.min(1, s.walk.sway / 0.4);
      this.camera.position.y += this.jolt.y * 3 * jolt;
      this.camera.rotation.x += this.jolt.pitch * 2 * jolt;
      this.camera.rotation.z += this.jolt.roll * jolt;
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
    if (this.braceLensFaulty && this.braceLens)
      this.braceLensFaulty.emissiveIntensity =
        this.braceLens.emissiveIntensity * faultyTube(time, this.reduced);
    for (const g of this.gauges) {
      const amount =
        g.kind === 0 ? Math.min(1, electricalReadings(s).voltage / 28) : s.actualPressure / 350;
      g.needle.rotation.z += (2.4 - amount * 4.3 - g.needle.rotation.z) * damp;
      // Nadeln zittern beim Aufsetzen nach.
      if (!this.reduced)
        g.needle.rotation.z += Math.sin(time * 63 + g.kind * 2.1) * 0.05 * this.jolt.shake;
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
    this.perf.section('update');
    const cameraScreen = this.screens.find((sc) => sc.kind === 'cameras');
    const ready = this.displayBoot.phase === 'ready';
    const feed = ready && droneAirborne(this.drone) && !this.surround?.systems && this.droneFeed;
    if (cameraScreen && feed && this.droneRig) {
      // Drohne in der Luft: der Kamera-Monitor zeigt ihr Bild.
      cameraScreen.material.map = feed.output.texture;
      if (!outside && this.screenFrustum.intersectsObject(cameraScreen.mesh))
        feed.update(
          this.renderer,
          this.scene,
          this.droneRig.camera,
          this.drone,
          ms,
          Math.hypot(this.drone.pos.x - this.dockWorld.x, this.drone.pos.z - this.dockWorld.z),
          !!this.drone.mark && this.weapons.armed,
          () => this.showHullFor(),
        );
    } else if (cameraScreen && this.surround) {
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
    this.perf.section('monitors');
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
    this.perf.section('displays');
    cabinWear.uCabinInv.value.copy(this.cabin.matrixWorld).invert();
    this.perf.gpuBegin();
    const sensed =
      this.inDrone &&
      this.droneSensor.render(
        this.renderer,
        this.scene,
        this.camera,
        time,
        this.nightAmount,
        this.sunDirection.subVectors(this.sun.position, this.sun.target.position),
      );
    if (
      !sensed &&
      !this.retro.render(this.renderer, this.scene, this.camera, outside ? null : this.cabin)
    )
      this.renderer.render(this.scene, this.camera);
    this.perf.gpuEnd();
    this.perf.section('render');
    this.perf.endFrame();
    this.perf.starved = this.walkPresentation.starved;
    if (this.pendingPointer && !this.drag && ms - this.lastHover >= 50) {
      const e = this.pendingPointer;
      this.pendingPointer = null;
      this.lastHover = ms;
      const hit = this.pick(e);
      this.hover(hit ? { text: hit.userData.label, x: e.clientX, y: e.clientY } : null);
      this.renderer.domElement.style.cursor = hit
        ? 'pointer'
        : (this.weapons.armed && !this.inHangar && !this.inYard && !this.inMech) || this.inDrone
          ? 'crosshair'
          : 'default';
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
