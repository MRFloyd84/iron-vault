// Zerstörbare Ziele in der Szene: Treffer zählen, bei 0 Trefferpunkten explodieren,
// verkohlen und einstürzen (Mast kippt, Radarschüssel fällt), Druckwelle auf Ziele in
// der Nähe. Für einen neuen Einsatz werden Ziele wieder aufgebaut.
import * as THREE from 'three';
import { Explosions } from './explosions';
import type { DesertWorld, TargetVisual } from './world-scene';
import { TARGETS, target as targetById } from './world-layout';
import {
  initialDamage,
  damageTarget,
  blastDamage,
  restoreTargets,
  isDestroyed,
  type TargetDamage,
} from './targets';

/** Explosionsgröße (Feuerball-Radius m) und Branddauer (s) je Zielart. */
const BLAST = {
  tank: { size: 9, burn: 150, fire: 6 },
  truck: { size: 3.5, burn: 70, fire: 2.5 },
  valve: { size: 3, burn: 45, fire: 2 },
  radar: { size: 4, burn: 50, fire: 2 },
  mast: { size: 3.5, burn: 30, fire: 1.5 },
} as const;

type Pending = { id: string; amount: number; at: number };
type Collapse = { visual: TargetVisual; start: number; dir: number };

export class WorldTargets {
  damage: TargetDamage = initialDamage();
  explosions: Explosions;
  /** Ereignis: Ziel zerstört (Missionen, Ton). */
  onDestroyed: ((id: string, point: THREE.Vector3, size: number) => void) | null = null;
  private pending: Pending[] = [];
  private collapses: Collapse[] = [];
  private charred: THREE.MeshStandardMaterial;
  private world: DesertWorld;

  constructor(scene: THREE.Scene, world: DesertWorld) {
    this.world = world;
    this.explosions = new Explosions(scene);
    this.charred = new THREE.MeshStandardMaterial({
      color: 0x1d1a17,
      roughness: 1,
      metalness: 0.15,
    });
  }

  destroyed = (id: string) => isDestroyed(this.damage, id);

  /** Ein Geschosstreffer auf Ziel `id`. */
  hit(id: string, time: number, amount = 1) {
    this.apply(id, amount, time);
  }

  private apply(id: string, amount: number, time: number) {
    const r = damageTarget(this.damage, id, amount, time);
    this.damage = r.damage;
    for (const d of r.destroyed) this.destroy(d, time);
  }

  private destroy(id: string, time: number) {
    const t = targetById(id),
      visual = this.world.targets.get(id);
    const fx = BLAST[t.kind];
    const point = new THREE.Vector3(t.x, -2.6 + t.y, t.z);
    this.explosions.explode(point, fx.size, time);
    const ground = visual ? visual.base.clone() : point.clone();
    this.explosions.burn(ground.setY(ground.y + 0.5), fx.burn, fx.fire, time);
    for (const b of blastDamage(t))
      this.pending.push({ id: b.id, amount: b.amount, at: time + 0.15 + b.distance * 0.02 });
    if (visual) this.wreck(visual, time);
    this.onDestroyed?.(id, point, fx.size);
  }

  /** Aussehen nach der Zerstörung: verkohlt, eingesackt, umgestürzt. */
  private wreck(v: TargetVisual, time: number) {
    v.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.userData.intact ??= o.material;
        // Beschriftungen verbrennen ganz
        if ((o.material as THREE.MeshStandardMaterial).transparent) o.visible = false;
        else o.material = this.charred;
      }
    });
    const kind = v.target.kind;
    if (kind === 'tank') {
      v.group.scale.set(1.04, 0.5, 1.04);
      v.group.rotation.set(0.04, 0, -0.05);
    } else if (kind === 'truck' || kind === 'valve') {
      v.group.scale.set(1, 0.75, 1);
      v.group.rotation.set(0.05, 0, 0.12);
      v.group.position.y = v.base.y - 0.25;
    }
    if (v.moving) {
      v.moving.userData.stopped = true;
      // Kippt vom Mittelpunkt der Anlage weg (sieht nach Treffer aus)
      this.collapses.push({ visual: v, start: time, dir: Math.atan2(v.target.z, v.target.x) });
    }
    v.group.updateMatrixWorld(true);
  }

  /** Ziele für einen neuen Einsatz wieder herstellen. */
  restore(ids: readonly string[]) {
    this.damage = restoreTargets(this.damage, ids);
    this.pending = this.pending.filter((p) => !ids.includes(p.id));
    this.collapses = this.collapses.filter((c) => !ids.includes(c.visual.target.id));
    for (const id of ids) {
      const v = this.world.targets.get(id);
      if (!v) continue;
      v.group.traverse((o) => {
        if (o instanceof THREE.Mesh && o.userData.intact) {
          o.material = o.userData.intact as THREE.Material;
          o.visible = true;
        } else if (o instanceof THREE.Mesh) o.visible = true;
      });
      v.group.scale.set(1, 1, 1);
      v.group.rotation.set(0, 0, 0);
      v.group.position.copy(v.base);
      if (v.moving) {
        v.moving.rotation.set(0, v.moving.rotation.y, 0);
        v.moving.position.set(
          0,
          v.target.kind === 'radar' ? (v.moving.userData.y0 ?? v.moving.position.y) : 0,
          0,
        );
        v.moving.userData.stopped = false;
        v.moving.userData.landed = false;
      }
      v.group.updateMatrixWorld(true);
    }
  }

  update(
    dt: number,
    time: number,
    pixelScale: number,
    fog: THREE.FogExp2 | null,
    sun: THREE.Color,
  ) {
    const due = this.pending.filter((p) => p.at <= time);
    if (due.length) {
      this.pending = this.pending.filter((p) => p.at > time);
      for (const p of due) this.apply(p.id, p.amount, time);
    }
    for (const c of this.collapses) {
      const age = time - c.start,
        m = c.visual.moving!;
      if (c.visual.target.kind === 'mast') {
        // Fällt beschleunigt um den Fuß, schlägt bei ~84° auf
        const a = Math.min(1.47, 0.12 * age * age * 4);
        m.rotation.set(0, 0, 0);
        m.rotateOnWorldAxis(new THREE.Vector3(Math.sin(c.dir), 0, -Math.cos(c.dir)), a);
        if (a >= 1.47 && !m.userData.landed) {
          m.userData.landed = true;
          const tip = new THREE.Vector3(Math.cos(c.dir), 0, Math.sin(c.dir))
            .multiplyScalar(30)
            .add(c.visual.base);
          this.explosions.explode(tip.setY(c.visual.base.y + 1), 2.5, time);
        }
      } else {
        // Radarschüssel kippt ab und fällt neben den Turm
        m.userData.y0 ??= m.position.y;
        const k = Math.min(1, age / 1.4);
        m.rotation.x = -1.3 * k;
        m.position.y = (m.userData.y0 as number) * (1 - k * k * 0.92);
        m.position.x = 3 * k;
      }
      m.updateMatrixWorld(true);
    }
    this.collapses = this.collapses.filter((c) => time - c.start < 6);
    this.explosions.update(dt, time, pixelScale, fog, sun);
  }

  /** Alle Ziele (für Radar und Karte) mit Zustand. */
  list() {
    return TARGETS.map((t) => ({ ...t, destroyed: this.destroyed(t.id) }));
  }

  dispose() {
    this.explosions.dispose();
    this.charred.dispose();
  }
}
