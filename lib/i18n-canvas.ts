// Feste Canvas-Texturen mit Text (Zettel, Schilder): Text wird beim Zeichnen übersetzt,
// und bei einem Sprachwechsel wird die Textur neu gezeichnet.
import * as THREE from 'three';
import { onLangChange, tr } from './i18n';

/** Leitet fillText/strokeText/measureText dieses Kontexts durch tr(). */
export function translateContext(ctx: CanvasRenderingContext2D) {
  const fill = ctx.fillText.bind(ctx),
    stroke = ctx.strokeText.bind(ctx),
    measure = ctx.measureText.bind(ctx);
  ctx.fillText = (text, x, y, max) => fill(tr(text), x, y, max);
  ctx.strokeText = (text, x, y, max) => stroke(tr(text), x, y, max);
  ctx.measureText = (text) => measure(tr(text));
  return ctx;
}

/**
 * Zeichnet `draw` in eine neue Canvas-Textur und wiederholt das bei jedem Sprachwechsel.
 * `release()` meldet die Textur ab (beim Aufräumen der Szene).
 */
export function translatedCanvasTexture(
  w: number,
  h: number,
  draw: (x: CanvasRenderingContext2D) => void,
) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = translateContext(c.getContext('2d')!);
  draw(ctx);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  const off = onLangChange(() => {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.restore();
    draw(ctx);
    texture.needsUpdate = true;
  });
  const dispose = texture.dispose.bind(texture);
  texture.dispose = () => {
    off();
    dispose();
  };
  return texture;
}
