import { createRequire } from 'node:module';
import path from 'node:path';
let factory = null;
try {
  factory = createRequire(import.meta.url)('@napi-rs/canvas').createCanvas;
} catch {
  if (process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES) {
    try {
      factory = createRequire(
        path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'canvas-test.cjs'),
      )('@napi-rs/canvas').createCanvas;
    } catch {}
  }
}
// Optional pixel QA without introducing a production dependency. State tests
// still run on hosts where the native canvas package is unavailable.
export const createCanvas = factory;
