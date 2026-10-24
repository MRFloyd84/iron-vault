import { createRequire } from 'node:module';

// Pixel-Prüfungen nutzen @napi-rs/canvas (devDependency). Fehlt das native Paket auf
// einem Rechner, werden nur diese Prüfungen übersprungen; Zustandstests laufen weiter.
let factory = null;
try {
  factory = createRequire(import.meta.url)('@napi-rs/canvas').createCanvas;
} catch {
  factory = null;
}
export const createCanvas = factory;
