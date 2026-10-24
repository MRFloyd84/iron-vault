// Wandelt die linearen Datentexturen (normal.png / orm.png) in public/materials in
// WebP um. "near-lossless" verändert Pixel nur minimal (Abweichung je Kanal sehr klein),
// spart aber ca. 45 % gegenüber PNG. Farbtexturen (color.webp) bleiben unverändert.
//
// Aufruf nach prepare-yard-materials.py / prepare-shutter-material.py:
//   node scripts/compress-material-maps.mjs            -> konvertiert und löscht PNG
//   node scripts/compress-material-maps.mjs --keep-png -> PNG zusätzlich behalten
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'materials');
const keep = process.argv.includes('--keep-png');
let before = 0;
let after = 0;

for (const dir of fs.readdirSync(root, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  for (const name of ['normal', 'orm']) {
    const png = path.join(root, dir.name, name + '.png');
    if (!fs.existsSync(png)) continue;
    const webp = path.join(root, dir.name, name + '.webp');
    // Exakte Pixel ohne Farbprofil-Umrechnung: Daten, keine Farbe.
    await sharp(png).webp({ nearLossless: true, quality: 60, effort: 6 }).toFile(webp);
    before += fs.statSync(png).size;
    after += fs.statSync(webp).size;
    if (!keep) fs.rmSync(png);
    console.log(path.relative(root, webp));
  }
}
console.log(`PNG ${(before / 1048576).toFixed(1)} MB -> WebP ${(after / 1048576).toFixed(1)} MB`);
