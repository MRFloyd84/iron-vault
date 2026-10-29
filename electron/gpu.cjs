// Grafikkarte wählen (Linux): Auf Laptops mit zwei Grafikchips (Intel/AMD + NVIDIA)
// läuft Electron sonst meist auf dem schwachen Chip – `powerPreference` allein reicht unter
// Linux nicht. Vor dem Start des GPU-Prozesses (er erbt die Umgebung) setzen wir deshalb
// die Variablen für NVIDIA PRIME Render Offload – dasselbe, was `prime-run` macht.
//
// Wahl im Grafikmenü (gespeichert in <userData>/gpu.json, wirkt nach Neustart):
//   auto       → NVIDIA, wenn Treiber geladen und ein zweiter Chip erkannt wird
//   nvidia     → NVIDIA immer anfordern, sobald der Treiber geladen ist
//   integrated → den eingebauten Chip (Intel/AMD) nutzen
// Die Umgebungsvariable IRON_VAULT_GPU (auto/nvidia/integrated) hat Vorrang vor der Datei.
// Selbst gesetzte Variablen (z. B. Start über prime-run) werden nie überschrieben.
const fs = require('node:fs');
const path = require('node:path');

const NVIDIA = '0x10de';
const MODES = ['auto', 'nvidia', 'integrated'];
const EGL_NVIDIA = [
  '/usr/share/glvnd/egl_vendor.d/10_nvidia.json',
  '/etc/glvnd/egl_vendor.d/10_nvidia.json',
];
const EGL_MESA = [
  '/usr/share/glvnd/egl_vendor.d/50_mesa.json',
  '/etc/glvnd/egl_vendor.d/50_mesa.json',
];
// Merkt sich, welche Variablen wir selbst gesetzt haben – nach einem Neustart aus der App
// heraus erbt der neue Prozess sie, darf sie aber nicht für Nutzer-Einstellungen halten.
const MARK = 'IRON_VAULT_GPU_SET';

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
    eglMesaFile: EGL_MESA.find((f) => fs.existsSync(f)) ?? null,
  };
}

function sanitizeMode(m) {
  const v = String(m || '').toLowerCase();
  return MODES.includes(v) ? v : 'auto';
}

/** Gespeicherte Wahl lesen (fehlt die Datei → auto). */
function readMode(file) {
  try {
    return sanitizeMode(JSON.parse(fs.readFileSync(file, 'utf8')).mode);
  } catch {
    return 'auto';
  }
}

function writeMode(file, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ mode: sanitizeMode(mode) }) + '\n');
}

/**
 * Welche Umgebungsvariablen gesetzt werden sollen (reine Funktion, testbar).
 * `mode` ist die gespeicherte Wahl; IRON_VAULT_GPU in `env` hat Vorrang.
 * Gibt {} zurück, wenn nichts zu tun ist.
 */
function primeOffloadEnv(sys, env, mode = 'auto') {
  const m = env.IRON_VAULT_GPU ? sanitizeMode(env.IRON_VAULT_GPU) : sanitizeMode(mode);
  if (sys.platform !== 'linux') return {};
  let want;
  if (m === 'integrated') {
    want = { __GLX_VENDOR_LIBRARY_NAME: 'mesa', DRI_PRIME: '0' };
    if (sys.eglMesaFile) want.__EGL_VENDOR_LIBRARY_FILENAMES = sys.eglMesaFile;
  } else {
    if (!sys.nvidiaDriver) return {};
    const hasNvidia = sys.vendors.includes(NVIDIA);
    const hasOther = sys.vendors.some((v) => v !== NVIDIA);
    // Automatisch und nur NVIDIA (Desktop-PC): Die Karte ist ohnehin die einzige.
    if (m === 'auto' && !(hasNvidia && hasOther)) return {};
    want = {
      __NV_PRIME_RENDER_OFFLOAD: '1',
      __GLX_VENDOR_LIBRARY_NAME: 'nvidia',
      __VK_LAYER_NV_optimus: 'NVIDIA_only',
    };
    if (sys.eglVendorFile) want.__EGL_VENDOR_LIBRARY_FILENAMES = sys.eglVendorFile;
  }
  const out = {};
  for (const [k, v] of Object.entries(want)) if (env[k] === undefined) out[k] = v;
  return out;
}

/** Von uns gesetzte Variablen eines früheren Starts entfernen (Neustart aus der App). */
function clearOwnEnv(env) {
  for (const k of (env[MARK] || '').split(',').filter(Boolean)) delete env[k];
  delete env[MARK];
}

/**
 * Im Hauptprozess vor app.whenReady() aufrufen.
 * Liefert { mode, set } – die gewählte Einstellung und die gesetzten Variablen.
 */
function preferDedicatedGpu(settingsFile) {
  clearOwnEnv(process.env);
  const mode = settingsFile ? readMode(settingsFile) : 'auto';
  const set = primeOffloadEnv(probe(), process.env, mode);
  Object.assign(process.env, set);
  const keys = Object.keys(set);
  if (keys.length) {
    process.env[MARK] = keys.join(',');
    console.log('[GPU]', mode, '→', keys.join(', '));
  }
  return { mode, set };
}

module.exports = {
  primeOffloadEnv,
  gpuVendors,
  preferDedicatedGpu,
  readMode,
  writeMode,
  clearOwnEnv,
  sanitizeMode,
};
