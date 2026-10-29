// Welche Grafikkarte rendert? Liest den Gerätenamen aus WebGL (WEBGL_debug_renderer_info;
// Chromium/Electron liefert z. B. „ANGLE (NVIDIA, NVIDIA GeForce RTX 4070/PCIe/SSE2, …)“)
// und ordnet ihn grob ein – vor allem, um Software-Rendering ohne Grafikkarte zu erkennen.

export type GpuKind = 'dedicated' | 'integrated' | 'software' | 'unknown';

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render|lavapipe/i;
const DEDICATED = /nvidia|geforce|rtx|quadro|radeon rx|radeon pro|arc(\(tm\))? a\d/i;
const INTEGRATED = /intel|uhd|iris|apple|radeon(\(tm\))? graphics|vega \d+ graphics|mali|adreno/i;

export function classifyGpu(name: string | null): GpuKind {
  if (!name) return 'unknown';
  if (SOFTWARE.test(name)) return 'software';
  if (DEDICATED.test(name)) return 'dedicated';
  if (INTEGRATED.test(name)) return 'integrated';
  return 'unknown';
}

/** Kurzer Anzeigename: „ANGLE (NVIDIA, NVIDIA GeForce RTX 4070/PCIe/SSE2, …)“ → „NVIDIA GeForce RTX 4070“. */
export function shortGpuName(name: string | null): string | null {
  if (!name) return null;
  const angle = /^ANGLE \(([^,]*),\s*([^,]*)/.exec(name);
  const core = angle ? angle[2] : name;
  return (
    core
      .replace(/\/(PCIe|SSE2|AGP)[^,)]*/gi, '')
      .replace(/\s*\(0x[0-9a-f]+\)/gi, '')
      .replace(/\s+Direct3D.*$/i, '')
      .trim() || name
  );
}

/** Gerätename des WebGL-Kontexts oder null, wenn der Browser ihn nicht verrät. */
export function rendererName(gl: WebGLRenderingContext | WebGL2RenderingContext): string | null {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const v = gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
    return typeof v === 'string' && v ? v : null;
  } catch {
    return null;
  }
}
