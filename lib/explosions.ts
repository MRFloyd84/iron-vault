// Explosionen und Brände: Feuerball, Lichtblitz, Rauchsäule, Trümmer, Brandfleck.
// Alles aus festen Pools (keine Objekte pro Bild); Rauch ist ein Punktwolken-Shader.
import * as THREE from 'three';
import { terrainHeight } from './terrain';

const FLOOR = -2.6;
const FIREBALLS = 14;
const SMOKE = 900;
const DEBRIS = 140;
const SCORCH = 16;

function radial(stops: [number, string][], size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) grad.addColorStop(o, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const rnd = (seed: number) => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

type Fireball = { sprite: THREE.Sprite; birth: number; size: number; life: number; rise: number };
type Debris = {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  size: number;
  birth: number;
};
type Emitter = {
  pos: THREE.Vector3;
  until: number;
  rate: number;
  carry: number;
  size: number;
  fire: THREE.Sprite[];
};

export class Explosions {
  private fireballs: Fireball[] = [];
  private nextFire = 0;
  private light: THREE.PointLight;
  private lightAge = 9;
  private lightPower = 0;
  private smoke: THREE.Points;
  private smokeMat: THREE.ShaderMaterial;
  private sPos: THREE.BufferAttribute;
  private sVel: THREE.BufferAttribute;
  private sBirth: THREE.BufferAttribute;
  private sSize: THREE.BufferAttribute;
  private nextSmoke = 0;
  private debris: Debris[] = [];
  private debrisMesh: THREE.InstancedMesh;
  private nextDebris = 0;
  private scorch: THREE.Mesh[] = [];
  private nextScorch = 0;
  private emitters: Emitter[] = [];
  private fireTex: THREE.Texture;
  private fireMat: THREE.SpriteMaterial;
  private disposables: { dispose(): void }[] = [];
  private dummy = new THREE.Object3D();
  private seed = 1;

  constructor(private scene: THREE.Scene) {
    this.fireTex = radial([
      [0, 'rgba(255,250,215,1)'],
      [0.25, 'rgba(255,190,80,0.95)'],
      [0.6, 'rgba(230,80,20,0.55)'],
      [1, 'rgba(120,20,0,0)'],
    ]);
    const ballMat = new THREE.SpriteMaterial({
      map: this.fireTex,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.fireMat = new THREE.SpriteMaterial({
      map: this.fireTex,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      opacity: 0.85,
    });
    this.disposables.push(this.fireTex, ballMat, this.fireMat);
    for (let i = 0; i < FIREBALLS; i++) {
      const sprite = new THREE.Sprite(ballMat.clone());
      sprite.visible = false;
      scene.add(sprite);
      this.disposables.push(sprite.material);
      this.fireballs.push({ sprite, birth: -1e9, size: 1, life: 1, rise: 0 });
    }
    this.light = new THREE.PointLight(0xffa850, 0, 160, 2);
    scene.add(this.light);
    // Rauch: weiche, dunkle Punkte, die steigen, wachsen und verblassen
    const g = new THREE.BufferGeometry();
    this.sPos = new THREE.BufferAttribute(new Float32Array(SMOKE * 3), 3);
    this.sVel = new THREE.BufferAttribute(new Float32Array(SMOKE * 3), 3);
    this.sBirth = new THREE.BufferAttribute(new Float32Array(SMOKE).fill(-1e5), 1);
    this.sSize = new THREE.BufferAttribute(new Float32Array(SMOKE).fill(1), 1);
    g.setAttribute('position', this.sPos);
    g.setAttribute('aVel', this.sVel);
    g.setAttribute('aBirth', this.sBirth);
    g.setAttribute('aSize', this.sSize);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const smokeTex = radial(
      [
        [0, 'rgba(255,255,255,0.9)'],
        [0.5, 'rgba(255,255,255,0.45)'],
        [1, 'rgba(255,255,255,0)'],
      ],
      64,
    );
    this.smokeMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: 400 },
        uMap: { value: smokeTex },
        uLight: { value: new THREE.Color(0.55, 0.52, 0.48) },
        uFogColor: { value: new THREE.Color() },
        uFogDensity: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute vec3 aVel; attribute float aBirth; attribute float aSize;
        uniform float uTime; uniform float uScale;
        varying float vAlpha; varying float vFog; varying float vHeat;
        uniform float uFogDensity;
        void main(){
          float age = uTime - aBirth;
          float life = 9.0 + aSize * 0.6;
          vec3 p = position + aVel * age * (1.0 - age / (life * 2.0)) + vec3(0.0, 1.2 * age, 0.0);
          p.x += sin(age * 0.7 + aBirth) * age * 0.25;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float t = clamp(age / life, 0.0, 1.0);
          vAlpha = age < 0.0 ? 0.0 : smoothstep(0.0, 0.08, t) * (1.0 - t);
          vHeat = clamp(1.0 - age / 0.9, 0.0, 1.0);
          float size = aSize * (1.0 + age * 0.55);
          gl_PointSize = vAlpha <= 0.0 ? 0.0 : min(900.0, size * uScale / -mv.z);
          float d = length(mv.xyz) * uFogDensity;
          vFog = 1.0 - exp(-d * d);
        }`,
      fragmentShader: `
        uniform sampler2D uMap; uniform vec3 uLight; uniform vec3 uFogColor;
        varying float vAlpha; varying float vFog; varying float vHeat;
        void main(){
          vec4 tex = texture2D(uMap, gl_PointCoord);
          vec3 col = mix(uLight * 0.22, vec3(1.0, 0.55, 0.2), vHeat * 0.8);
          col = mix(col, uFogColor, vFog);
          gl_FragColor = vec4(col, tex.a * vAlpha * 0.9);
        }`,
    });
    this.smoke = new THREE.Points(g, this.smokeMat);
    this.smoke.frustumCulled = false;
    this.smoke.renderOrder = 3;
    scene.add(this.smoke);
    this.disposables.push(g, this.smokeMat, smokeTex);
    // Trümmer
    const debrisGeo = new THREE.BoxGeometry(1, 0.35, 0.7);
    const debrisMat = new THREE.MeshStandardMaterial({
      color: 0x24211d,
      roughness: 0.9,
      metalness: 0.3,
    });
    this.debrisMesh = new THREE.InstancedMesh(debrisGeo, debrisMat, DEBRIS);
    this.debrisMesh.count = 0;
    this.debrisMesh.frustumCulled = false;
    this.debrisMesh.castShadow = true;
    scene.add(this.debrisMesh);
    this.disposables.push(debrisGeo, debrisMat);
    // Brandflecken
    const scorchTex = radial(
      [
        [0, 'rgba(0,0,0,0.95)'],
        [0.55, 'rgba(0,0,0,0.6)'],
        [1, 'rgba(0,0,0,0)'],
      ],
      64,
    );
    const scorchGeo = new THREE.PlaneGeometry(1, 1);
    scorchGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < SCORCH; i++) {
      const m = new THREE.MeshBasicMaterial({
        color: 0x0c0a08,
        alphaMap: scorchTex,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      });
      const mesh = new THREE.Mesh(scorchGeo, m);
      mesh.visible = false;
      scene.add(mesh);
      this.scorch.push(mesh);
      this.disposables.push(m);
    }
    this.disposables.push(scorchGeo, scorchTex);
  }

  private puff(p: THREE.Vector3, vx: number, vy: number, vz: number, size: number, time: number) {
    const k = this.nextSmoke;
    this.nextSmoke = (k + 1) % SMOKE;
    this.sPos.setXYZ(k, p.x, p.y, p.z);
    this.sVel.setXYZ(k, vx, vy, vz);
    this.sBirth.setX(k, time);
    this.sSize.setX(k, size);
  }
  private flagSmoke() {
    this.sPos.needsUpdate =
      this.sVel.needsUpdate =
      this.sBirth.needsUpdate =
      this.sSize.needsUpdate =
        true;
  }

  /** Explosion bei p; size ≈ Radius des Feuerballs in m. */
  explode(p: THREE.Vector3, size: number, time: number) {
    const s = this.seed++;
    for (let i = 0; i < 4; i++) {
      const f = this.fireballs[this.nextFire];
      this.nextFire = (this.nextFire + 1) % FIREBALLS;
      f.birth = time + i * 0.07;
      f.size = size * (0.7 + rnd(s + i) * 0.6);
      f.life = 0.9 + rnd(s * 3 + i) * 0.6;
      f.rise = 2 + rnd(s * 5 + i) * 4;
      f.sprite.position.set(
        p.x + (rnd(s * 7 + i) - 0.5) * size,
        p.y + (rnd(s * 11 + i) - 0.3) * size * 0.6,
        p.z + (rnd(s * 13 + i) - 0.5) * size,
      );
      f.sprite.userData.y0 = f.sprite.position.y;
      f.sprite.visible = true;
    }
    this.light.position.copy(p).y += size;
    this.lightAge = 0;
    this.lightPower = 9000 * size;
    for (let i = 0; i < 40; i++) {
      const a = rnd(s * 17 + i) * Math.PI * 2,
        sp = (1.5 + rnd(s * 19 + i) * 4) * Math.sqrt(size);
      this.puff(
        p,
        Math.cos(a) * sp,
        1 + rnd(s * 23 + i) * 3,
        Math.sin(a) * sp,
        size * (0.9 + rnd(s + i * 3)),
        time + rnd(s * 29 + i) * 0.4,
      );
    }
    this.flagSmoke();
    const n = Math.min(24, Math.round(6 + size * 3));
    for (let i = 0; i < n; i++) {
      const d: Debris = this.debris[this.nextDebris] ?? {
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        rot: new THREE.Euler(),
        spin: new THREE.Vector3(),
        size: 1,
        birth: 0,
      };
      this.debris[this.nextDebris] = d;
      this.nextDebris = (this.nextDebris + 1) % DEBRIS;
      const a = rnd(s * 31 + i) * Math.PI * 2,
        sp = 6 + rnd(s * 37 + i) * 10 * Math.sqrt(size / 3);
      d.pos.copy(p);
      d.vel.set(Math.cos(a) * sp, 6 + rnd(s * 41 + i) * 14, Math.sin(a) * sp);
      d.spin.set(rnd(i) * 9, rnd(i + 1) * 9, rnd(i + 2) * 9);
      d.size = 0.3 + rnd(s * 43 + i) * Math.min(1.6, size * 0.25);
      d.birth = time;
    }
    const sc = this.scorch[this.nextScorch];
    this.nextScorch = (this.nextScorch + 1) % SCORCH;
    sc.position.set(p.x, FLOOR + terrainHeight(p.x, p.z) + 0.06, p.z);
    sc.scale.setScalar(size * 4.5);
    sc.rotation.y = rnd(s) * 6;
    sc.visible = true;
    sc.updateMatrixWorld();
  }

  /** Brennt bei p für `seconds`: Flammen und dicke Rauchsäule. */
  burn(p: THREE.Vector3, seconds: number, size: number, time: number) {
    const fire: THREE.Sprite[] = [];
    for (let i = 0; i < 3; i++) {
      const sp = new THREE.Sprite(this.fireMat);
      sp.position.copy(p);
      sp.visible = true;
      this.scene.add(sp);
      fire.push(sp);
    }
    this.emitters.push({
      pos: p.clone(),
      until: time + seconds,
      rate: 3 + size,
      carry: 0,
      size,
      fire,
    });
  }

  update(
    dt: number,
    time: number,
    pixelScale: number,
    fog: THREE.FogExp2 | null,
    sunColor: THREE.Color,
  ) {
    for (const f of this.fireballs) {
      if (!f.sprite.visible) continue;
      const age = time - f.birth;
      if (age < 0) {
        f.sprite.scale.setScalar(0.001);
        continue;
      }
      const t = age / f.life;
      if (t >= 1) {
        f.sprite.visible = false;
        continue;
      }
      const s = f.size * (0.5 + 1.6 * Math.sqrt(t));
      f.sprite.scale.set(s * 2, s * 2, 1);
      f.sprite.position.y = (f.sprite.userData.y0 as number) + f.rise * t;
      (f.sprite.material as THREE.SpriteMaterial).opacity = (1 - t) ** 1.5;
      f.sprite.updateMatrixWorld();
    }
    this.lightAge += dt;
    this.light.intensity = this.lightPower * Math.max(0, 1 - this.lightAge / 0.7) ** 2;
    // Brände
    let spawned = false;
    this.emitters = this.emitters.filter((e) => {
      const left = e.until - time;
      if (left <= 0) {
        for (const sp of e.fire) sp.removeFromParent();
        return false;
      }
      const strength = Math.min(1, left / 20);
      e.carry += dt * e.rate * strength;
      while (e.carry >= 1) {
        e.carry -= 1;
        const s = this.seed++;
        this.puff(
          new THREE.Vector3(
            e.pos.x + (rnd(s) - 0.5) * e.size,
            e.pos.y + 1,
            e.pos.z + (rnd(s + 1) - 0.5) * e.size,
          ),
          (rnd(s + 2) - 0.5) * 0.8 + 0.6,
          2 + rnd(s + 3) * 1.5,
          (rnd(s + 4) - 0.5) * 0.8,
          e.size * 1.6 + rnd(s + 5) * 3,
          time,
        );
        spawned = true;
      }
      e.fire.forEach((sp, i) => {
        const f = (0.75 + 0.35 * Math.sin(time * (8 + i * 2.7) + i * 2)) * strength;
        sp.scale.set(e.size * 1.6 * f + 0.8, e.size * 2.4 * f + 0.8, 1);
        sp.position.set(e.pos.x + (i - 1) * e.size * 0.35, e.pos.y + e.size * 0.6 * f, e.pos.z);
        sp.updateMatrixWorld();
      });
      return true;
    });
    if (spawned) this.flagSmoke();
    this.smokeMat.uniforms.uTime.value = time;
    this.smokeMat.uniforms.uScale.value = pixelScale;
    (this.smokeMat.uniforms.uLight.value as THREE.Color).copy(sunColor);
    if (fog) {
      (this.smokeMat.uniforms.uFogColor.value as THREE.Color).copy(fog.color);
      this.smokeMat.uniforms.uFogDensity.value = fog.density;
    }
    // Trümmer mit Schwerkraft, liegen bleiben, nach 40 s weg
    let n = 0;
    for (const d of this.debris) {
      if (!d || time - d.birth > 40) continue;
      const ground = FLOOR + terrainHeight(d.pos.x, d.pos.z) + d.size * 0.15;
      if (d.pos.y > ground || d.vel.y > 0) {
        d.vel.y -= 9.81 * dt;
        d.pos.addScaledVector(d.vel, dt);
        d.rot.x += d.spin.x * dt;
        d.rot.y += d.spin.y * dt;
        d.rot.z += d.spin.z * dt;
        if (d.pos.y < ground) {
          d.pos.y = ground;
          d.vel.set(d.vel.x * 0.3, Math.abs(d.vel.y) * 0.2, d.vel.z * 0.3);
          d.spin.multiplyScalar(0.4);
          if (Math.abs(d.vel.y) < 1) d.vel.set(0, 0, 0);
        }
      }
      this.dummy.position.copy(d.pos);
      this.dummy.rotation.copy(d.rot);
      this.dummy.scale.set(d.size * 1.6, d.size, d.size * 1.2);
      this.dummy.updateMatrix();
      this.debrisMesh.setMatrixAt(n++, this.dummy.matrix);
    }
    this.debrisMesh.count = n;
    this.debrisMesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    for (const e of this.emitters) for (const sp of e.fire) sp.removeFromParent();
    for (const f of this.fireballs) f.sprite.removeFromParent();
    this.light.removeFromParent();
    this.smoke.removeFromParent();
    this.debrisMesh.removeFromParent();
    for (const s of this.scorch) s.removeFromParent();
    for (const d of this.disposables) d.dispose();
  }
}
