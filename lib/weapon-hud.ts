// Waffenblock auf dem Head-up-Display (transparente HUD-Ebene an der Frontscheibe).
import type { CockpitScene } from './cockpit-scene';
import { WEAPON } from './weapons';

export function drawWeaponHud(
  c: CanvasRenderingContext2D,
  info: ReturnType<CockpitScene['weaponInfo']>,
) {
  if (!info.armed && !info.laser) return;
  c.save();
  c.setTransform(c.canvas.width / 960, 0, 0, c.canvas.height / 720, 0, 0);
  c.globalCompositeOperation = 'source-over';
  const green = '#9df07a',
    amber = '#f2b45a';
  c.font = '600 26px monospace';
  c.fillStyle = info.armed ? (info.block ? amber : green) : green;
  // Linke untere Ecke: Waffenstatus
  const x = 40,
    y = 470;
  c.fillText(info.armed ? (info.block ? info.block : 'WAFFEN SCHARF') : 'WAFFEN GESICHERT', x, y);
  c.fillStyle = green;
  ['L', 'R'].forEach((side, i) => {
    const yy = y + 42 + i * 40;
    c.fillText(side + ' ' + String(info.ammo[i]).padStart(3, ' '), x, yy);
    // Laufhitze-Balken
    c.strokeStyle = green;
    c.lineWidth = 2;
    c.strokeRect(x + 120, yy - 20, 160, 18);
    c.fillStyle = info.overheated[i] ? amber : info.heat[i] > 0.75 ? amber : green;
    c.fillRect(x + 122, yy - 18, 156 * Math.min(1, info.heat[i]), 14);
    c.fillStyle = green;
  });
  if (info.reloading) {
    c.fillStyle = amber;
    c.fillText('NACHLADEN …', x, y + 128);
  }
  // Rechte untere Ecke: Laserentfernung und Trefferbilanz
  c.textAlign = 'right';
  c.fillStyle = green;
  if (info.laser)
    c.fillText('RNG ' + Math.round(info.range).toString().padStart(4, '0') + ' m', 920, y);
  if (info.shots) c.fillText('TREFFER ' + info.hits + '/' + info.shots, 920, y + 42);
  c.fillText('MAG ' + WEAPON.magazine * 2, 920, y + 84);
  c.restore();
}
