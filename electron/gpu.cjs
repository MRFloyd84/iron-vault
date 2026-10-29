// Grafikkarte wählen (Linux): Auf Laptops mit zwei Grafikchips (Intel/AMD + NVIDIA)
// läuft Electron sonst meist auf dem schwachen Chip – `powerPreference` allein reicht unter
// Linux nicht. Ist der NVIDIA-Treiber geladen und gibt es daneben einen zweiten Chip,
// setzen wir die Umgebungsvariablen für NVIDIA PRIME Render Offload, bevor Chromium
// seinen GPU-Prozess startet (er erbt die Umgebung). Dasselbe macht `prime-run`.
//
// IRON_VAULT_GPU=auto  → nichts erzwingen (System entscheidet)
// IRON_VAULT_GPU=nvidia → Offload auch ohne erkannten zweiten Chip setzen
// Selbst gesetzte Variablen (z. B. Start über prime-run) werden nie überschrieben.
const fs = require('node:fs');
const path = require('node:path');

const NVIDIA = '0x10de';
const EGL_NVIDIA = [
  '/usr/share/glvnd/egl_vendor.d/10_nvidia.json',
  '/etc/glvnd/egl_vendor.d/10_nvidia.json',
];

/** Hersteller-IDs aller Grafikchips aus /sys/class/drm (card0, card1 …). */
function gpuVendors(drm = '/sys/class/drm') {
  try {
    return fs
      .readdirSync(drm)
      .filter((n) => /^card\d+$/.test(n))
      .map((n) => {
        try {
          return fs.readFileSync(path.join(drm, n, 'device', 'vendor'), 'utf8').trim();
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Wirklich vorhandenes System abfragen. */
function probe() {
  return {
    platform: process.platform,
    nvidiaDriver: fs.existsSync('/proc/driver/nvidia/version'),
    vendors: gpuVendors(),
    eglVendorFile: EGL_NVIDIA.find((f) => fs.existsSync(f)) ?? null,
  };
}

/**
 * Welche Umgebungsvariablen gesetzt werden sollen (reine Funktion, testbar).
 * Gibt {} zurück, wenn nichts zu tun ist.
 */
function primeOffloadEnv(sys, env) {
  const mode = (env.IRON_VAULT_GPU || '').toLowerCase();
  if (sys.platform !== 'linux' || mode === 'auto') return {};
  if (!sys.nvidiaDriver) return {};
  const hasNvidia = sys.vendors.includes(NVIDIA);
  const hasOther = sys.vendors.some((v) => v !== NVIDIA);
  // Nur NVIDIA (Desktop-PC): Die Karte ist ohnehin die einzige – nichts nötig.
  if (mode !== 'nvidia' && !(hasNvidia && hasOther)) return {};
  const want = {
    __NV_PRIME_RENDER_OFFLOAD: '1',
    __GLX_VENDOR_LIBRARY_NAME: 'nvidia',
    __VK_LAYER_NV_optimus: 'NVIDIA_only',
  };
  if (sys.eglVendorFile) want.__EGL_VENDOR_LIBRARY_FILENAMES = sys.eglVendorFile;
  const out = {};
  for (const [k, v] of Object.entries(want)) if (env[k] === undefined) out[k] = v;
  return out;
}

/** Im Hauptprozess vor app.whenReady() aufrufen. Liefert die gesetzten Variablen. */
function preferDedicatedGpu() {
  const set = primeOffloadEnv(probe(), process.env);
  Object.assign(process.env, set);
  if (Object.keys(set).length) console.log('[GPU] NVIDIA-Grafikkarte angefordert (PRIME Offload)');
  return set;
}

module.exports = { primeOffloadEnv, gpuVendors, preferDedicatedGpu };
