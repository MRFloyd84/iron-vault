// Einsatzleitung in der Szene: aktiver Einsatz, Erfassen mit der Drohnenkamera,
// Meldungen, abgeschlossene Einsätze (im Browser gespeichert).
import * as THREE from 'three';
import {
  MISSIONS,
  mission,
  startMission,
  stepMission,
  nextObjective,
  objectiveVisible,
  objectivePosition,
  missionTargets,
  missionScans,
  bearing,
  type MissionProgress,
} from './missions';
import { scanPoint } from './world-layout';

const STORE = 'iron-vault.missions.done';
/** Sekunden, die ein Objekt im Bild sein muss, bis es erfasst ist. */
export const SCAN_TIME = 1.6;

export type ScanView = {
  airborne: boolean;
  position: THREE.Vector3;
  forward: THREE.Vector3;
  signal: number;
};

export class MissionDirector {
  progress: MissionProgress | null = null;
  completed = new Set<string>();
  /** Erfassungsfortschritt je Aufklärungspunkt 0…1 */
  private scans = new Map<string, number>();
  /** Meldungen für das Kommunikationsdisplay (Oberfläche holt sie ab). */
  notices: { text: string; done?: boolean }[] = [];
  constructor() {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) for (const id of JSON.parse(raw) as string[]) this.completed.add(id);
    } catch {
      /* ohne Speicher: nur für diese Sitzung */
    }
  }
  private save() {
    try {
      localStorage.setItem(STORE, JSON.stringify([...this.completed]));
    } catch {
      /* ignorieren */
    }
  }

  /** Einsatz beginnen; liefert die Ziele, die wieder aufgebaut werden müssen. */
  start(id: string, time: number) {
    const m = mission(id);
    if (!m) return [];
    this.progress = startMission(id, time);
    this.scans.clear();
    this.notices.push({ text: 'Einsatz begonnen: ' + m.title });
    return missionTargets(m);
  }
  abort() {
    const m = this.progress && mission(this.progress.id);
    this.progress = null;
    this.scans.clear();
    if (m) this.notices.push({ text: 'Einsatz abgebrochen: ' + m.title });
  }

  /** Markierung der Drohne bei `point`: erfasst ein Missionsobjekt in der Nähe sofort. */
  markAt(point: THREE.Vector3) {
    const m = this.progress && mission(this.progress.id);
    if (!m) return;
    for (const id of missionScans(m)) {
      const p = scanPoint(id);
      if (Math.hypot(point.x - p.x, point.z - p.z) < p.size * 1.2 + 3) this.scans.set(id, 1);
    }
  }

  update(
    dt: number,
    mech: { x: number; z: number },
    inHangar: boolean,
    view: ScanView,
    destroyed: (id: string) => boolean,
  ) {
    const p = this.progress;
    const m = p && mission(p.id);
    if (!p || !m || p.status !== 'active') return;
    // Erfassen: Objekt nah genug, mittig im Drohnenbild, Funk ausreichend
    const dir = new THREE.Vector3();
    for (const id of missionScans(m)) {
      let v = this.scans.get(id) ?? 0;
      if (v >= 1) continue;
      const sp = scanPoint(id);
      dir.set(sp.x - view.position.x, sp.y - 2.6 - view.position.y, sp.z - view.position.z);
      const dist = dir.length();
      const range = 45 + sp.size * 9;
      const inView =
        view.airborne &&
        view.signal > 0.25 &&
        dist < range &&
        dir.normalize().dot(view.forward) > Math.cos(0.42);
      v = inView ? Math.min(1, v + dt / SCAN_TIME) : Math.max(0, v - dt * 0.25);
      this.scans.set(id, v);
    }
    const r = stepMission(p, {
      x: mech.x,
      z: mech.z,
      inHangar,
      scanned: (id) => (this.scans.get(id) ?? 0) >= 1,
      destroyed,
    });
    this.progress = r.progress;
    for (const e of r.events) {
      if (e.type === 'objective') this.notices.push({ text: 'Erledigt: ' + e.label });
      else {
        this.completed.add(p.id);
        this.save();
        this.notices.push({ text: 'Einsatz erfüllt: ' + e.title, done: true });
      }
    }
  }

  /** Für Oberfläche, Radar und Karte. */
  info(x: number, z: number) {
    const p = this.progress;
    const m = p && mission(p.id);
    const next = p ? nextObjective(p, x, z) : null;
    let scanning: { label: string; progress: number } | null = null;
    if (m)
      for (const id of missionScans(m)) {
        const v = this.scans.get(id) ?? 0;
        if (v > 0.02 && v < 1 && (!scanning || v > scanning.progress))
          scanning = { label: scanPoint(id).label, progress: v };
      }
    return {
      completed: [...this.completed],
      missions: MISSIONS.map((mm) => ({ id: mm.id, title: mm.title, type: mm.type })),
      active:
        p && m
          ? {
              id: m.id,
              title: m.title,
              type: m.type,
              status: p.status,
              objectives: m.objectives.map((o) => ({
                id: o.id,
                label: o.label,
                done: !!p.done[o.id],
                visible: objectiveVisible(o, m, p),
                ...objectivePosition(o),
              })),
              next: next
                ? {
                    label: next.objective.label,
                    distance: next.distance,
                    bearing: bearing(
                      x,
                      z,
                      objectivePosition(next.objective).x,
                      objectivePosition(next.objective).z,
                    ),
                    ...objectivePosition(next.objective),
                  }
                : null,
              scanning,
            }
          : null,
    };
  }
}
