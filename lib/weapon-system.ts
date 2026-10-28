// Darstellung und Ballistik der Armkanonen sowie der Laser-Entfernungsmesser.
// Geschosse fliegen mit Mündungsgeschwindigkeit und Schwerkraft; jede Strecke eines
// Bildes wird gegen Ziele, Wracks und Boden geprüft. Effekte stammen aus Pools.
import * as THREE from 'three';
import { hash } from './display-aging';
import { FiringRange, type Hit, type HitKind } from './firing-range';
import { WEAPON } from './weapons';
import { groundHeight } from './walking';

const ROUNDS = 96;
const SPARKS = 480;
const CASINGS = 60;
const MARKS = 70;

type Round = {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  alive: boolean;
  tracer: boolean;
};
type Casing = {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  rot: THREE.Euler;
  age: number;
};

function radialTexture(inner: string, outer: string, size = 64) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Mündungsfeuer: Stern aus zwei gekreuzten Flächen, additiv. */
function flashTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,250,220,1)');
  g.addColorStop(0.25, 'rgba(255,190,90,0.85)');
  g.addColorStop(1, 'rgba(255,120,30,0)');
  x.fillStyle = g;
  for (let i = 0; i < 7; i++) {
    x.save();
    x.translate(64, 64);
    x.rotate((i / 7) * Math.PI * 2);
    x.beginPath();
    x.moveTo(-10, 0);
    x.lineTo(0, -64);
    x.lineTo(10, 0);
    x.fill();
    x.restore();
  }
  x.beginPath();
  x.arc(64, 64, 26, 0, Math.PI * 2);
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export type ImpactEvent = { kind: HitKind; point: THREE.Vector3; plate?: number; target?: string };

export class WeaponSystem {
  range: FiringRange;
  /** Mündungen in Modellkoordinaten (am jeweiligen Unterarm befestigt). */
  muzzles: THREE.Object3D[] = [];
  flashLights: THREE.PointLight[] = [];
  private flashMeshes: THREE.Mesh[] = [];
  private flashAge = [9, 9];
  private rounds: Round[] = [];
  private tracerMesh: THREE.InstancedMesh;
  private sparks: THREE.Points;
  private sparkPos: THREE.BufferAttribute;
  private sparkVel: Float32Array;
  private sparkBirth: THREE.BufferAttribute;
  private sparkNext = 0;
  private sparkMat: THREE.ShaderMaterial;
  private casings: Casing[] = [];
  private casingMesh: THREE.InstancedMesh;
  private casingNext = 0;
  private marks: THREE.Mesh[] = [];
  private markBirth: number[] = [];
  private markNext = 0;
  private laserBeam: THREE.Mesh;
  private laserDot: THREE.Sprite;
  private disposables: { dispose(): void }[] = [];
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene, range: FiringRange) {
    this.range = range;
    for (let i = 0; i < ROUNDS; i++)
      this.rounds.push({
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        age: 0,
        alive: false,
        tracer: false,
      });
    // Leuchtspur: gestreckte, additive Quader (Instanzen).
    const tracerGeo = new THREE.BoxGeometry(0.07, 0.07, 1);
    tracerGeo.translate(0, 0, -0.5);
    const tracerMat = new THREE.MeshBasicMaterial({
      color: 0xffb066,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.tracerMesh = new THREE.InstancedMesh(tracerGeo, tracerMat, ROUNDS);
    this.tracerMesh.frustumCulled = false;
    this.tracerMesh.count = 0;
    scene.add(this.tracerMesh);
    // Funken
    const g = new THREE.BufferGeometry();
    this.sparkPos = new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3);
    this.sparkBirth = new THREE.BufferAttribute(new Float32Array(SPARKS).fill(-1e4), 1);
    this.sparkVel = new Float32Array(SPARKS * 3);
    g.setAttribute('position', this.sparkPos);
    g.setAttribute('aBirth', this.sparkBirth);
    g.setAttribute('aVel', new THREE.BufferAttribute(this.sparkVel, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.sparkMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uScale: { value: 400 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aBirth; attribute vec3 aVel; uniform float uTime; uniform float uScale;
        varying float vHeat;
        void main(){
          float age = uTime - aBirth;
          vec3 p = position + aVel * age + vec3(0.0, -4.9 * age * age, 0.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          vHeat = clamp(1.0 - age / 0.55, 0.0, 1.0);
          gl_PointSize = age < 0.0 || vHeat <= 0.0 ? 0.0 : (0.12 + 0.1 * vHeat) * uScale / -mv.z;
        }`,
      fragmentShader: `
        varying float vHeat;
        void main(){
          vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; if (r > 1.0) discard;
          gl_FragColor = vec4(mix(vec3(1.0, 0.35, 0.05), vec3(1.0, 0.95, 0.7), vHeat), (1.0 - r) * vHeat);
        }`,
    });
    this.sparks = new THREE.Points(g, this.sparkMat);
    this.sparks.frustumCulled = false;
    scene.add(this.sparks);
    // Hülsen
    const brass = new THREE.MeshStandardMaterial({
      color: 0xb08a3e,
      metalness: 0.9,
      roughness: 0.35,
    });
    const casingGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.17, 8);
    this.casingMesh = new THREE.InstancedMesh(casingGeo, brass, CASINGS);
    this.casingMesh.count = 0;
    this.casingMesh.frustumCulled = false;
    this.casingMesh.castShadow = true;
    scene.add(this.casingMesh);
    // Einschlagspuren
    const markTex = radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
    const markGeo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < MARKS; i++) {
      const m = new THREE.MeshStandardMaterial({
        color: 0x16130f,
        alphaMap: markTex,
        transparent: true,
        depthWrite: false,
        roughness: 1,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      });
      const mesh = new THREE.Mesh(markGeo, m);
      mesh.visible = false;
      scene.add(mesh);
      this.marks.push(mesh);
      this.markBirth.push(-1e9);
      this.disposables.push(m);
    }
    // Mündungsfeuer (Lichter bleiben immer in der Szene, aus = Intensität 0)
    const ftex = flashTexture();
    const fmat = new THREE.MeshBasicMaterial({
      map: ftex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const fgeo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < 2; i++) {
      const light = new THREE.PointLight(0xffb060, 0, 30, 2);
      scene.add(light);
      this.flashLights.push(light);
      const flash = new THREE.Group();
      for (const r of [0, Math.PI / 2]) {
        const m = new THREE.Mesh(fgeo, fmat);
        m.rotation.y = r;
        flash.add(m);
      }
      const front = new THREE.Mesh(fgeo, fmat);
      front.rotation.x = Math.PI / 2;
      flash.add(front);
      flash.visible = false;
      scene.add(flash);
      this.flashMeshes.push(flash as unknown as THREE.Mesh);
    }
    // Laser: dünner roter Strahl und Punkt am Ziel
    const laserMat = new THREE.MeshBasicMaterial({
      color: 0xff2a1a,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const laserGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 6, 1, true);
    laserGeo.rotateX(-Math.PI / 2);
    laserGeo.translate(0, 0, -0.5);
    this.laserBeam = new THREE.Mesh(laserGeo, laserMat);
    this.laserBeam.frustumCulled = false;
    this.laserBeam.visible = false;
    scene.add(this.laserBeam);
    const dotTex = radialTexture('rgba(255,90,70,1)', 'rgba(255,0,0,0)');
    this.laserDot = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: dotTex,
        color: 0xffffff,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.laserDot.visible = false;
    scene.add(this.laserDot);
    this.disposables.push(
      tracerGeo,
      tracerMat,
      g,
      this.sparkMat,
      brass,
      casingGeo,
      markGeo,
      fmat,
      fgeo,
      laserMat,
      laserGeo,
      this.laserDot.material,
    );
    for (const t of [markTex, ftex, dotTex]) if (t) this.disposables.push(t);
  }

  /** Mündungen an die Unterarme des geladenen Modells heften (Modellkoordinaten). */
  attach(model: THREE.Object3D) {
    for (const [name, x] of [
      ['L_Forearm', 0.415],
      ['R_Forearm', -0.415],
    ] as const) {
      const arm = model.getObjectByName(name);
      if (!arm) continue;
      const muzzle = new THREE.Object3D();
      muzzle.name = name + ' muzzle';
      arm.updateWorldMatrix(true, false);
      // Mündung aus dem Modell (assemble-mech.mjs legt sie als extras.muzzle in
      // Unterarm-Koordinaten ab); sonst der Modellpunkt vorne am Lauf des ersten Modells.
      const stored = arm.userData.muzzle as [number, number, number] | undefined;
      const local = stored
        ? new THREE.Vector3(...stored)
        : arm.worldToLocal(new THREE.Vector3(x, 0.36, 0.115).applyMatrix4(model.matrixWorld));
      muzzle.position.copy(local);
      arm.add(muzzle);
      this.muzzles.push(muzzle);
    }
  }

  muzzleWorld(gun: number, target: THREE.Vector3) {
    const m = this.muzzles[gun];
    if (!m) return null;
    m.updateWorldMatrix(true, false);
    return m.getWorldPosition(target);
  }

  /** Schuss aus Kanone `gun` in Richtung `dir` (Einheitsvektor, Welt). */
  fire(gun: number, dir: THREE.Vector3, time: number, seed: number, inherited: THREE.Vector3) {
    const origin = this.muzzleWorld(gun, this.tmp);
    if (!origin) return;
    const r = this.rounds.find((x) => !x.alive) ?? this.rounds[seed % ROUNDS];
    r.alive = true;
    r.age = 0;
    r.tracer = seed % 2 === 0; // jede zweite Patrone ist Leuchtspur
    r.pos.copy(origin);
    r.vel.copy(dir).multiplyScalar(WEAPON.muzzleVelocity).add(inherited);
    this.flashAge[gun] = 0;
    const flash = this.flashMeshes[gun] as unknown as THREE.Group;
    flash.position.copy(origin).addScaledVector(dir, 0.6);
    flash.lookAt(this.tmp2.copy(flash.position).add(dir));
    flash.rotation.z = hash(seed, 3) * Math.PI;
    this.flashLights[gun].position.copy(origin).addScaledVector(dir, 0.8);
    // Hülse seitlich aus dem Arm ausgeworfen
    const c: Casing = this.casings[this.casingNext] ?? {
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      spin: new THREE.Vector3(),
      rot: new THREE.Euler(),
      age: 0,
    };
    this.casings[this.casingNext] = c;
    this.casingNext = (this.casingNext + 1) % CASINGS;
    const side = gun === 0 ? 1 : -1;
    const right = this.tmp2.set(-dir.z, 0, dir.x).normalize().multiplyScalar(side);
    c.pos.copy(origin).addScaledVector(dir, -1.2).y -= 0.4;
    c.vel
      .copy(right)
      .multiplyScalar(3 + 2 * hash(seed, 4))
      .add(inherited);
    c.vel.y += 1.5 + hash(seed, 5) * 2;
    c.spin.set(hash(seed, 6) * 20, hash(seed, 7) * 20, hash(seed, 8) * 20);
    c.age = 0;
    void time;
  }

  private spawnSparks(
    p: THREE.Vector3,
    n: THREE.Vector3,
    count: number,
    time: number,
    seed: number,
  ) {
    for (let i = 0; i < count; i++) {
      const k = this.sparkNext;
      this.sparkNext = (this.sparkNext + 1) % SPARKS;
      this.sparkPos.setXYZ(k, p.x, p.y, p.z);
      const vx = (hash(seed, i, 1) - 0.5) * 2,
        vy = (hash(seed, i, 2) - 0.5) * 2,
        vz = (hash(seed, i, 3) - 0.5) * 2;
      const sp = 6 + 10 * hash(seed, i, 4);
      this.sparkVel[k * 3] = (vx + n.x * 1.5) * sp;
      this.sparkVel[k * 3 + 1] = (vy * 0.5 + n.y * 1.5 + 0.6) * sp;
      this.sparkVel[k * 3 + 2] = (vz + n.z * 1.5) * sp;
      this.sparkBirth.setX(k, time);
    }
    this.sparkPos.needsUpdate = true;
    this.sparkBirth.needsUpdate = true;
    (this.sparks.geometry.getAttribute('aVel') as THREE.BufferAttribute).needsUpdate = true;
  }

  private mark(hit: Hit, time: number) {
    const m = this.marks[this.markNext];
    this.markBirth[this.markNext] = time;
    this.markNext = (this.markNext + 1) % MARKS;
    m.position.copy(hit.point).addScaledVector(hit.normal, 0.02);
    m.lookAt(this.tmp.copy(m.position).add(hit.normal));
    m.scale.setScalar(hit.kind === 'ground' ? 0.9 + hash(time * 1000, 1) * 0.6 : 0.35);
    m.visible = true;
  }

  /**
   * Pro Bild: Geschosse bewegen und Treffer melden, Effekte altern lassen,
   * Laser ausrichten. `laserFrom`/`laserTo` null = Laser aus.
   */
  update(
    dt: number,
    time: number,
    pixelScale: number,
    outside: boolean,
    laserFrom: THREE.Vector3 | null,
    laserTo: THREE.Vector3 | null,
    reduced: boolean,
  ): ImpactEvent[] {
    dt = Math.min(dt, 0.05);
    const events: ImpactEvent[] = [];
    let n = 0;
    const next = new THREE.Vector3();
    for (const r of this.rounds) {
      if (!r.alive) continue;
      r.age += dt;
      next.copy(r.pos).addScaledVector(r.vel, dt);
      next.y -= 4.9 * dt * dt;
      r.vel.y -= 9.81 * dt;
      const hit = this.range.hitTest(r.pos, next);
      if (hit) {
        r.alive = false;
        const seed = Math.floor(time * 997) + n;
        this.spawnSparks(hit.point, hit.normal, hit.kind === 'ground' ? 10 : 22, time, seed);
        this.mark(hit, time);
        events.push({
          kind: hit.kind,
          point: hit.point.clone(),
          plate: hit.plate,
          target: hit.target,
        });
        continue;
      }
      if (r.age > 2.2) {
        r.alive = false;
        continue;
      }
      // Leuchtspur: Strecke hinter dem Geschoss
      if (r.tracer && n < ROUNDS) {
        const len = Math.min(r.age * WEAPON.muzzleVelocity, 9);
        this.dummy.position.copy(next);
        // lookAt richtet +Z auf die Flugrichtung; der Quader liegt auf -Z, also hinten.
        this.dummy.lookAt(this.tmp.copy(next).add(r.vel));
        this.dummy.scale.set(1, 1, len);
        this.dummy.updateMatrix();
        this.tracerMesh.setMatrixAt(n++, this.dummy.matrix);
      }
      r.pos.copy(next);
    }
    this.tracerMesh.count = n;
    this.tracerMesh.instanceMatrix.needsUpdate = true;
    // Mündungsfeuer: 2–3 Bilder kurz, Licht klingt schnell ab
    for (let g = 0; g < 2; g++) {
      this.flashAge[g] += dt;
      const a = this.flashAge[g];
      const on = a < 0.045;
      const flash = this.flashMeshes[g] as unknown as THREE.Group;
      flash.visible = on && outside;
      flash.scale.setScalar(1.6 + hash(Math.floor(time * 60), g) * 1.4);
      this.flashLights[g].intensity =
        (reduced ? 0.4 : 1) * (outside ? 900 : 260) * Math.max(0, 1 - a / 0.06);
    }
    // Hülsen: Schwerkraft, Aufprall auf Boden (grob), nach 6 s weg
    let cn = 0;
    for (const c of this.casings) {
      if (!c || c.age > 6) continue;
      c.age += dt;
      c.vel.y -= 9.81 * dt;
      c.pos.addScaledVector(c.vel, dt);
      const floor = -2.58 + groundHeight(c.pos.x, c.pos.z);
      if (c.pos.y < floor) {
        c.pos.y = floor;
        c.vel.y *= -0.3;
        c.vel.x *= 0.6;
        c.vel.z *= 0.6;
        c.spin.multiplyScalar(0.5);
      }
      c.rot.x += c.spin.x * dt;
      c.rot.y += c.spin.y * dt;
      c.rot.z += c.spin.z * dt;
      this.dummy.position.copy(c.pos);
      this.dummy.rotation.copy(c.rot);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.casingMesh.setMatrixAt(cn++, this.dummy.matrix);
    }
    this.casingMesh.count = cn;
    this.casingMesh.instanceMatrix.needsUpdate = true;
    this.sparkMat.uniforms.uTime.value = time;
    this.sparkMat.uniforms.uScale.value = pixelScale;
    // Einschlagspuren verblassen über drei Minuten
    for (let i = 0; i < MARKS; i++) {
      const age = time - this.markBirth[i];
      const m = this.marks[i];
      if (age > 180) m.visible = false;
      else (m.material as THREE.MeshStandardMaterial).opacity = 0.75 * (1 - age / 180);
    }
    // Laser
    const on = !!(laserFrom && laserTo);
    this.laserBeam.visible = on && outside;
    this.laserDot.visible = on;
    if (laserFrom && laserTo) {
      const len = laserFrom.distanceTo(laserTo);
      this.laserBeam.position.copy(laserFrom);
      this.laserBeam.lookAt(laserTo);
      this.laserBeam.rotateY(Math.PI);
      this.laserBeam.scale.set(1, 1, len);
      this.laserDot.position.copy(laserTo);
      this.laserDot.scale.setScalar(0.25 + len * 0.004);
    }
    return events;
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}
