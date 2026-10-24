// Sichtbare Hydraulik an den Beinen von IV-04: Zylinder und Kolbenstangen, die beim
// Gehen mitarbeiten. Jeder Zylinder hängt drehbar am oberen Segment und zeigt in jedem
// Bild auf seinen Anlenkpunkt am unteren Segment. Zylinder und Stange haben feste
// Längen und schieben sich nur ineinander, wie bei einem echten Hydraulikzylinder.
//
// Die Anlenkpunkte liegen auf der echten Oberfläche des Modells: Ein Strahl von außen
// sucht die Panzerung, damit nichts in der Luft schwebt oder im Blech steckt.
import * as THREE from 'three';

type Vec = readonly [number, number, number];
/** Anlenkpunkt: Segmentname ohne L_/R_, Punkt in Segmentkoordinaten, Richtung nach außen. */
type Mount = { segment: string; at: Vec; out: Vec };
type Spec = { name: string; a: Mount; b: Mount; radius: number };

// Koordinaten für das linke Bein (Modell blickt nach +Z, linkes Bein liegt bei +x);
// das rechte Bein wird an x gespiegelt.
export const ACTUATORS: readonly Spec[] = [
  {
    // Kniestrecker vorn: Oberschenkel → Schienbein, überspannt das Knie.
    name: 'Knie',
    a: { segment: 'Thigh', at: [0.035, -0.1, 0], out: [0, 0, 1] },
    b: { segment: 'Calf', at: [-0.01, -0.085, 0], out: [0, 0, 1] },
    radius: 0.0125,
  },
  {
    // Fersenzylinder hinten: Wade → Fußplatte, hebt und senkt die Fußspitze.
    name: 'Sprunggelenk',
    a: { segment: 'Calf', at: [-0.02, -0.06, 0], out: [0, 0, -1] },
    b: { segment: 'Foot', at: [0, 0.0, 0], out: [0, 0, -1] },
    radius: 0.011,
  },
];

const Y = new THREE.Vector3(0, 1, 0);

type Actuator = {
  name: string;
  side: 'L' | 'R';
  pivot: THREE.Group;
  rod: THREE.Mesh;
  childSegment: THREE.Object3D;
  /** Anlenkpunkt am unteren Segment (dessen Koordinaten). */
  childAnchor: THREE.Vector3;
  rest: number;
  barrel: number;
  stroke: number;
  length: number;
  /** Beide Anlenkpunkte liegen auf der Modelloberfläche. */
  seated: boolean;
};

function surfacePoint(segment: THREE.Object3D, mount: Mount, side: number, clearance: number) {
  const at = new THREE.Vector3(mount.at[0] * side, mount.at[1], mount.at[2]);
  const out = new THREE.Vector3(mount.out[0] * side, mount.out[1], mount.out[2]).normalize();
  const origin = segment.localToWorld(at.clone().addScaledVector(out, 0.5));
  const direction = segment
    .localToWorld(at.clone().sub(out))
    .sub(segment.localToWorld(at.clone()))
    .normalize();
  const hit = new THREE.Raycaster(origin, direction, 0, 1).intersectObject(segment, false)[0];
  const local = hit ? segment.worldToLocal(hit.point.clone()) : at;
  return { point: local.addScaledVector(out, clearance), seated: !!hit };
}

export class Hydraulics {
  readonly actuators: Actuator[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  readonly materials: THREE.MeshStandardMaterial[];
  private readonly scratch = new THREE.Vector3();

  constructor(model: THREE.Object3D) {
    const barrelMat = new THREE.MeshStandardMaterial({
      color: 0x4a4a40,
      metalness: 0.55,
      roughness: 0.72,
    });
    // Alte, nicht mehr spiegelblanke Kolbenstange mit Ölfilm.
    const rodMat = new THREE.MeshStandardMaterial({
      color: 0x9c9e98,
      metalness: 1,
      roughness: 0.4,
    });
    const lineMat = new THREE.MeshStandardMaterial({
      color: 0x2e2f2a,
      metalness: 0.6,
      roughness: 0.5,
    });
    this.materials = [barrelMat, rodMat, lineMat];
    model.updateMatrixWorld(true);
    for (const [prefix, side] of [
      ['L', 1],
      ['R', -1],
    ] as const)
      for (const spec of ACTUATORS) {
        const parent = model.getObjectByName(prefix + '_' + spec.a.segment),
          child = model.getObjectByName(prefix + '_' + spec.b.segment);
        if (!parent || !child) continue;
        const r = spec.radius;
        const top = surfacePoint(parent, spec.a, side, r + 0.004),
          bottom = surfacePoint(child, spec.b, side, r + 0.004);
        const a = top.point,
          childAnchor = bottom.point;
        const rest = parent.worldToLocal(child.localToWorld(childAnchor.clone())).distanceTo(a);
        // Zylinder und Stange je 62 % der Ruhelänge: Hub reicht von −20 % bis +24 %.
        const barrel = rest * 0.62,
          stroke = rest * 0.62;
        const pivot = new THREE.Group();
        pivot.name = `${prefix}_${spec.name}zylinder`;
        pivot.position.copy(a);
        parent.add(pivot);
        const cylinder = (radius: number, length: number, from: number, segments = 14) => {
          const g = new THREE.CylinderGeometry(radius, radius, length, segments, 1);
          g.translate(0, from + length / 2, 0);
          this.geometries.push(g);
          return g;
        };
        // Zylinderrohr mit Kopf- und Bodenring, Lagerauge am Boden
        pivot.add(new THREE.Mesh(cylinder(r, barrel, 0), barrelMat));
        pivot.add(new THREE.Mesh(cylinder(r * 1.22, barrel * 0.08, barrel * 0.92), barrelMat));
        pivot.add(new THREE.Mesh(cylinder(r * 1.22, barrel * 0.1, 0), barrelMat));
        const eye = new THREE.Mesh(cylinder(r * 0.9, r * 2.4, -r * 1.2, 10), barrelMat);
        eye.rotation.z = Math.PI / 2;
        pivot.add(eye);
        // Kolbenstange mit Lagerauge am Ende; ihre Lage setzt update().
        const rod = new THREE.Mesh(cylinder(r * 0.52, stroke, 0, 10), rodMat);
        const rodEye = new THREE.Mesh(cylinder(r * 0.8, r * 2.2, -r * 1.1, 10), barrelMat);
        rodEye.rotation.z = Math.PI / 2;
        rodEye.position.y = stroke;
        rod.add(rodEye);
        pivot.add(rod);
        // Zwei Hydraulikleitungen außen am Rohr, vom Kopf zum Boden und zurück ins Segment.
        for (const angle of [0.75, -0.75]) {
          const dx = Math.cos(angle),
            dz = Math.sin(angle),
            o = r * 1.45;
          const curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(dx * r * 1.05, barrel * 0.88, dz * r * 1.05),
            new THREE.Vector3(dx * o, barrel * 0.8, dz * o),
            new THREE.Vector3(dx * o, barrel * 0.3, dz * o),
            new THREE.Vector3(dx * o * 1.15, barrel * 0.05, dz * o * 1.15),
            new THREE.Vector3(dx * o * 0.8, -barrel * 0.1, dz * o * 0.8),
          ]);
          const g = new THREE.TubeGeometry(curve, 24, r * 0.2, 6, false);
          this.geometries.push(g);
          pivot.add(new THREE.Mesh(g, lineMat));
        }
        pivot.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        this.actuators.push({
          name: spec.name,
          side: prefix,
          pivot,
          rod,
          childSegment: child,
          childAnchor,
          rest,
          barrel,
          stroke,
          length: rest,
          seated: top.seated && bottom.seated,
        });
      }
    this.update();
  }

  /** Nach dem Stellen der Gelenke aufrufen: richtet Zylinder aus, fährt Stangen aus. */
  update() {
    for (const act of this.actuators) {
      const parent = act.pivot.parent!;
      const target = parent.worldToLocal(
        act.childSegment.localToWorld(this.scratch.copy(act.childAnchor)),
      );
      target.sub(act.pivot.position);
      act.length = target.length();
      act.pivot.quaternion.setFromUnitVectors(Y, target.normalize());
      act.rod.position.y = act.length - act.stroke;
      act.pivot.updateMatrixWorld(true);
    }
  }

  dispose() {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
