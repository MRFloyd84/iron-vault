// Gebrauchsspuren in der Kanzel: Zettel, Gewebeband, Prüfplakette, ein Ersatzrahmen
// aus einem anderen Mech, ein nachgerüstetes Kabelbündel, ein altes Foto und ein
// Anhänger, der beim Gehen schwingt. Alles in Kanzelkoordinaten (vor der Skalierung).
import * as THREE from 'three';
import type { CockpitScene } from '../cockpit-scene';

const HAND = '"Segoe Print", "Bradley Hand", "Comic Sans MS", "Chalkboard SE", cursive';

function canvasTexture(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Vergilbter Zettel mit Handschrift, leicht zerknittert, Ecke eingerissen. */
function noteTexture(lines: string[], color = '#e9dfae') {
  return canvasTexture(256, 256, (x) => {
    x.fillStyle = color;
    x.beginPath();
    x.moveTo(6, 4);
    x.lineTo(250, 10);
    x.lineTo(246, 230);
    x.lineTo(220, 252);
    x.lineTo(10, 248);
    x.closePath();
    x.fill();
    // Knicke und Flecken
    x.strokeStyle = 'rgba(120,100,60,0.25)';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(0, 120);
    x.lineTo(256, 132);
    x.stroke();
    const g = x.createRadialGradient(190, 200, 5, 190, 200, 70);
    g.addColorStop(0, 'rgba(140,95,40,0.28)');
    g.addColorStop(1, 'rgba(140,95,40,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 256);
    x.fillStyle = '#1d2a6b';
    x.font = 'bold 34px ' + HAND;
    lines.forEach((l, i) => {
      x.save();
      x.translate(18, 62 + i * 52);
      x.rotate(-0.04 + i * 0.015);
      x.fillText(l, 0, 0);
      x.restore();
    });
  });
}

function tapeTexture(text = '') {
  return canvasTexture(256, 64, (x) => {
    x.fillStyle = 'rgba(150,150,140,0.92)';
    x.beginPath();
    x.moveTo(4, 6);
    for (let i = 0; i <= 8; i++) x.lineTo(i % 2 ? 0 : 6, 6 + i * 6.5); // ausgefranst
    x.lineTo(252, 58);
    for (let i = 0; i <= 8; i++) x.lineTo(i % 2 ? 256 : 249, 58 - i * 6.5);
    x.closePath();
    x.fill();
    x.strokeStyle = 'rgba(90,90,85,0.35)';
    for (let i = 0; i < 30; i++) {
      x.beginPath();
      x.moveTo(i * 9, 6);
      x.lineTo(i * 9 + 3, 58);
      x.stroke();
    }
    x.fillStyle = 'rgba(40,30,25,0.45)';
    x.fillRect(0, 44, 256, 14);
    if (text) {
      x.fillStyle = '#111';
      x.font = 'bold 30px ' + HAND;
      x.fillText(text, 40, 42);
    }
  });
}

function plaqueTexture() {
  return canvasTexture(256, 128, (x) => {
    x.fillStyle = '#9a9c94';
    x.fillRect(0, 0, 256, 128);
    x.strokeStyle = '#4b4d48';
    x.lineWidth = 6;
    x.strokeRect(4, 4, 248, 120);
    x.fillStyle = '#2a2b28';
    x.font = 'bold 22px monospace';
    x.fillText('WARTUNG GEPRÜFT', 20, 38);
    x.font = '18px monospace';
    x.fillText('IV-04  ·  11/2019', 20, 66);
    x.fillText('NÄCHSTE: 11/2020', 20, 92);
    // roter Prüfstempel, schief
    x.save();
    x.translate(196, 82);
    x.rotate(-0.35);
    x.strokeStyle = 'rgba(170,30,25,0.8)';
    x.lineWidth = 4;
    x.beginPath();
    x.arc(0, 0, 32, 0, Math.PI * 2);
    x.stroke();
    x.fillStyle = 'rgba(170,30,25,0.8)';
    x.font = 'bold 16px monospace';
    x.fillText('OK', -11, 6);
    x.restore();
    // Kratzer und Schmutz
    for (let i = 0; i < 40; i++) {
      x.strokeStyle = `rgba(40,40,35,${0.1 + (i % 4) * 0.05})`;
      x.beginPath();
      x.moveTo((i * 53) % 256, (i * 31) % 128);
      x.lineTo(((i * 53) % 256) + 20, ((i * 31) % 128) + 4);
      x.stroke();
    }
  });
}

function photoTexture() {
  return canvasTexture(192, 256, (x) => {
    x.fillStyle = '#e8e0cc';
    x.fillRect(0, 0, 192, 256);
    // ausgeblichenes Foto: Himmel, Hügel, zwei Silhouetten vor einem Mech-Bein
    const sky = x.createLinearGradient(0, 14, 0, 200);
    sky.addColorStop(0, '#b9a98a');
    sky.addColorStop(1, '#d8c9a8');
    x.fillStyle = sky;
    x.fillRect(12, 12, 168, 190);
    x.fillStyle = '#7d6e55';
    x.beginPath();
    x.moveTo(12, 150);
    x.quadraticCurveTo(80, 120, 180, 145);
    x.lineTo(180, 202);
    x.lineTo(12, 202);
    x.fill();
    x.fillStyle = '#4b4134';
    x.fillRect(120, 70, 34, 132); // Mech-Bein
    x.fillRect(112, 190, 50, 12);
    for (const px of [58, 84]) {
      x.beginPath();
      x.arc(px, 150, 7, 0, Math.PI * 2);
      x.fill();
      x.fillRect(px - 7, 157, 14, 38);
    }
    x.fillStyle = 'rgba(255,240,200,0.25)';
    x.fillRect(12, 12, 168, 190);
    x.fillStyle = '#3a3226';
    x.font = '18px ' + HAND;
    x.fillText('IV-04 · 1. Einsatz', 18, 236);
  });
}

function stencilTexture() {
  return canvasTexture(256, 64, (x) => {
    x.clearRect(0, 0, 256, 64);
    x.fillStyle = 'rgba(225,215,190,0.75)';
    x.font = 'bold 30px monospace';
    x.fillText('ERSATZ · IV-02', 12, 42);
  });
}

export class CabinClutter {
  private charm = new THREE.Group();
  private swing = 0;
  private swingV = 0;
  private disposables: { dispose(): void }[] = [];

  constructor(cs: CockpitScene, root: THREE.Object3D) {
    const screen = (kind: string) => cs.screens.find((s) => s.kind === kind)?.mesh;
    const paper = (tex: THREE.Texture, w: number, h: number) => {
      const m = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.95,
        alphaTest: 0.4,
        transparent: false,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
      this.disposables.push(m, mesh.geometry, tex);
      return mesh;
    };
    const stick = (
      target: THREE.Object3D | undefined,
      mesh: THREE.Mesh,
      x: number,
      y: number,
      rot: number,
    ) => {
      if (!target) return;
      const geo = (target as THREE.Mesh).geometry as THREE.PlaneGeometry;
      const p = geo.parameters;
      mesh.position.set(x * p.width * 0.5, y * p.height * 0.5, 0.012);
      mesh.rotation.z = rot;
      target.add(mesh);
    };
    // Zettel am Rahmen
    stick(
      screen('reactor'),
      paper(noteTexture(['NICHT ÜBER', '80 % !!', '— K.']), 0.24, 0.24),
      0.98,
      0.92,
      -0.12,
    );
    stick(
      screen('armor'),
      paper(noteTexture(['Schulter R', 'knackt –', 'beobachten']), 0.24, 0.24),
      -1.0,
      0.9,
      0.1,
    );
    stick(
      screen('diagnostics'),
      paper(noteTexture(['APU: 2x', 'starten!'], '#dfe3b8'), 0.2, 0.2),
      1.0,
      -0.85,
      0.18,
    );
    // Gewebeband über einem Riss im Radar-Rahmen und am Kamera-Monitor
    const tape = (text: string, w: number) => {
      const tex = tapeTexture(text);
      const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.75 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), m);
      this.disposables.push(m, mesh.geometry, tex);
      return mesh;
    };
    stick(screen('radar'), tape('', 0.34), -0.88, -1.03, 0.55);
    stick(screen('radar'), tape('', 0.3), -0.8, -1.05, -0.5);
    stick(screen('cameras'), tape('DEFEKT?', 0.38), 0.55, -1.08, -0.06);
    // Prüfplakette (abgelaufen) unter dem Einsatzprüfungs-Display
    stick(screen('preflight'), paper(plaqueTexture(), 0.26, 0.13), -0.55, -1.2, 0.0);
    // Altes Foto in die Ecke des Kommunikationsdisplays geklemmt
    stick(screen('comm'), paper(photoTexture(), 0.14, 0.19), -1.06, 0.55, 0.22);
    // Ersatzrahmen aus einem anderen Mech: Grundierungsrot statt Grün, Schablonenschrift
    const cam = screen('cameras');
    if (cam) {
      const p = ((cam as THREE.Mesh).geometry as THREE.PlaneGeometry).parameters;
      const primer = new THREE.MeshStandardMaterial({
        color: 0x6e3a2c,
        roughness: 0.85,
        metalness: 0.25,
      });
      this.disposables.push(primer);
      const t = 0.06,
        w = p.width + 0.13,
        h = p.height + 0.13;
      for (const [x, y, sx, sy] of [
        [0, h / 2 - t / 2, w, t],
        [0, -h / 2 + t / 2, w, t],
        [w / 2 - t / 2, 0, t, h],
        [-w / 2 + t / 2, 0, t, h],
      ]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, 0.03), primer);
        bar.position.set(x, y, -0.005);
        cam.add(bar);
        this.disposables.push(bar.geometry);
      }
      const stencil = stencilTexture();
      const sm = new THREE.MeshBasicMaterial({
        map: stencil,
        transparent: true,
        depthWrite: false,
      });
      const label = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.075), sm);
      label.position.set(-w / 2 + 0.2, -h / 2 + 0.03, 0.012);
      cam.add(label);
      this.disposables.push(stencil, sm, label.geometry);
    }
    // Nachgerüstetes Kabelbündel an der rechten Strebe, mit Kabelbindern
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(2.18, 3.1, 1.2),
      new THREE.Vector3(2.08, 2.3, 1.15),
      new THREE.Vector3(2.12, 1.4, 1.2),
      new THREE.Vector3(2.0, 0.55, 1.35),
      new THREE.Vector3(1.75, 0.05, 1.6),
    ]);
    const cableColors = [0x222222, 0x8a2a1e, 0x2b3c6b, 0x6b6a24];
    cableColors.forEach((color, i) => {
      const offset = new THREE.Vector3((i % 2) * 0.03 - 0.015, 0, Math.floor(i / 2) * 0.03 - 0.015);
      const pts = curve.getPoints(30).map((p) => p.clone().add(offset));
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.016, 6, false);
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
      const mesh = new THREE.Mesh(geo, mat);
      root.add(mesh);
      this.disposables.push(geo, mat);
    });
    const tieMat = new THREE.MeshStandardMaterial({ color: 0xd8d4c4, roughness: 0.7 });
    const tieGeo = new THREE.TorusGeometry(0.045, 0.008, 4, 12);
    this.disposables.push(tieMat, tieGeo);
    for (const t of [0.12, 0.35, 0.58, 0.8]) {
      const tie = new THREE.Mesh(tieGeo, tieMat);
      tie.position.copy(curve.getPoint(t));
      tie.lookAt(tie.position.clone().add(curve.getTangent(t)));
      root.add(tie);
    }
    // Anhänger (Erkennungsmarke an Kugelkette) am Dachrahmen, schwingt beim Gehen
    this.charm.position.set(-0.7, 3.05, -0.3);
    root.add(this.charm);
    const chainMat = new THREE.MeshStandardMaterial({
      color: 0x8d8c86,
      metalness: 0.9,
      roughness: 0.35,
    });
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.36, 4), chainMat);
    chain.position.y = -0.18;
    const tag = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.11, 0.006), chainMat);
    tag.position.y = -0.41;
    const tagTex = canvasTexture(64, 96, (x) => {
      x.fillStyle = '#9a9a92';
      x.fillRect(0, 0, 64, 96);
      x.fillStyle = '#3a3a36';
      x.font = 'bold 11px monospace';
      ['MÜLLER K.', 'BG 0+', '04-17-88', 'IV-04'].forEach((l, i) => x.fillText(l, 5, 22 + i * 18));
    });
    const tagFace = new THREE.Mesh(
      new THREE.PlaneGeometry(0.07, 0.105),
      new THREE.MeshStandardMaterial({ map: tagTex, metalness: 0.7, roughness: 0.4 }),
    );
    tagFace.position.set(0, -0.41, 0.0035);
    // Roter Stoffwimpel („REMOVE BEFORE FLIGHT“), ausgeblichen – gut sichtbar.
    const ribbonTex = canvasTexture(64, 256, (x) => {
      x.fillStyle = '#9b2a22';
      x.fillRect(0, 0, 64, 256);
      x.fillStyle = 'rgba(240,230,215,0.85)';
      x.font = 'bold 15px sans-serif';
      x.save();
      x.translate(40, 248);
      x.rotate(-Math.PI / 2);
      x.fillText('REMOVE BEFORE FLIGHT', 0, 0);
      x.restore();
      x.fillStyle = 'rgba(255,240,220,0.18)';
      x.fillRect(0, 0, 64, 256);
    });
    const ribbon = new THREE.Mesh(
      new THREE.PlaneGeometry(0.05, 0.2),
      new THREE.MeshStandardMaterial({ map: ribbonTex, roughness: 1, side: THREE.DoubleSide }),
    );
    ribbon.position.set(0.018, -0.57, 0.004);
    ribbon.rotation.z = 0.08;
    this.disposables.push(ribbonTex, ribbon.geometry, ribbon.material as THREE.Material);
    this.charm.add(chain, tag, tagFace, ribbon);
    this.disposables.push(
      chainMat,
      chain.geometry,
      tag.geometry,
      tagTex,
      tagFace.geometry,
      tagFace.material as THREE.Material,
    );
  }

  /** Pendel: angeregt von Schritten (Stoß) und Drehbewegung, gedämpft. */
  update(dt: number, push: number, reduced: boolean) {
    dt = Math.min(dt, 0.05);
    if (reduced) {
      this.charm.rotation.set(0, 0, 0);
      return;
    }
    this.swingV += (-28 * this.swing - 1.1 * this.swingV + push * 60) * dt;
    this.swing += this.swingV * dt;
    this.charm.rotation.z = this.swing;
    this.charm.rotation.x = this.swing * 0.4;
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}
