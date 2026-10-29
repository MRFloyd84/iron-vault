import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { classifyGpu, shortGpuName } from '../lib/gpu-info.ts';

const require = createRequire(import.meta.url);
const { primeOffloadEnv, clearOwnEnv, readMode, writeMode } = require('../electron/gpu.cjs');
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const NV = '0x10de';
const INTEL = '0x8086';
const AMD = '0x1002';
const laptop = {
  platform: 'linux',
  nvidiaDriver: true,
  vendors: [INTEL, NV],
  eglVendorFile: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json',
  eglMesaFile: '/usr/share/glvnd/egl_vendor.d/50_mesa.json',
};

test('Laptop mit Intel + NVIDIA: PRIME-Offload wird gesetzt', () => {
  assert.deepEqual(primeOffloadEnv(laptop, {}), {
    __NV_PRIME_RENDER_OFFLOAD: '1',
    __GLX_VENDOR_LIBRARY_NAME: 'nvidia',
    __VK_LAYER_NV_optimus: 'NVIDIA_only',
    __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json',
  });
  const amd = primeOffloadEnv({ ...laptop, vendors: [AMD, NV], eglVendorFile: null }, {});
  assert.equal(amd.__NV_PRIME_RENDER_OFFLOAD, '1');
  assert.equal(amd.__EGL_VENDOR_LIBRARY_FILENAMES, undefined);
});

test('Automatisch bei nur NVIDIA, ohne Treiber oder ohne Linux: nichts ändern', () => {
  assert.deepEqual(primeOffloadEnv({ ...laptop, vendors: [NV] }, {}), {});
  assert.deepEqual(primeOffloadEnv({ ...laptop, nvidiaDriver: false }, {}), {});
  assert.deepEqual(primeOffloadEnv({ ...laptop, platform: 'win32' }, {}), {});
});

test('Wahl im Menü: nvidia erzwingt, integrated nutzt Mesa, Umgebung hat Vorrang', () => {
  const desktop = { ...laptop, vendors: [NV] };
  assert.equal(primeOffloadEnv(desktop, {}, 'nvidia').__NV_PRIME_RENDER_OFFLOAD, '1');
  assert.deepEqual(primeOffloadEnv(laptop, {}, 'integrated'), {
    __GLX_VENDOR_LIBRARY_NAME: 'mesa',
    DRI_PRIME: '0',
    __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/50_mesa.json',
  });
  assert.equal(primeOffloadEnv(laptop, { IRON_VAULT_GPU: 'integrated' }, 'nvidia').DRI_PRIME, '0');
  assert.equal(primeOffloadEnv(laptop, {}, 'quatsch').__NV_PRIME_RENDER_OFFLOAD, '1');
});

test('Wahl wird gespeichert; Neustart räumt eigene Variablen weg', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'iv-gpu-')), 'sub', 'gpu.json');
  assert.equal(readMode(file), 'auto');
  writeMode(file, 'integrated');
  assert.equal(readMode(file), 'integrated');
  const env = {
    __NV_PRIME_RENDER_OFFLOAD: '1',
    __GLX_VENDOR_LIBRARY_NAME: 'nvidia',
    IRON_VAULT_GPU_SET: '__NV_PRIME_RENDER_OFFLOAD,__GLX_VENDOR_LIBRARY_NAME',
    HOME: '/home/rene',
  };
  clearOwnEnv(env);
  assert.deepEqual(env, { HOME: '/home/rene' });
  assert.equal(primeOffloadEnv(laptop, env, 'integrated').__GLX_VENDOR_LIBRARY_NAME, 'mesa');
});

test('IRON_VAULT_GPU=nvidia erzwingt Offload auch ohne erkannten Zweitchip', () => {
  const env = primeOffloadEnv({ ...laptop, vendors: [] }, { IRON_VAULT_GPU: 'nvidia' });
  assert.equal(env.__NV_PRIME_RENDER_OFFLOAD, '1');
});

test('Selbst gesetzte Variablen (prime-run) werden nicht überschrieben', () => {
  const env = primeOffloadEnv(laptop, {
    __NV_PRIME_RENDER_OFFLOAD: '1',
    __GLX_VENDOR_LIBRARY_NAME: 'mesa',
  });
  assert.equal(env.__NV_PRIME_RENDER_OFFLOAD, undefined);
  assert.equal(env.__GLX_VENDOR_LIBRARY_NAME, undefined);
  assert.equal(env.__VK_LAYER_NV_optimus, 'NVIDIA_only');
});

test('Grafikkarte einordnen', () => {
  const rtx = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070/PCIe/SSE2, OpenGL 4.5.0 NVIDIA 550.54)';
  assert.equal(classifyGpu(rtx), 'dedicated');
  assert.equal(shortGpuName(rtx), 'NVIDIA GeForce RTX 4070');
  assert.equal(
    classifyGpu('ANGLE (Intel, Mesa Intel(R) UHD Graphics 620 (KBL GT2), OpenGL 4.6)'),
    'integrated',
  );
  assert.equal(
    classifyGpu('ANGLE (AMD, AMD Radeon Graphics (radeonsi, renoir), OpenGL 4.6)'),
    'integrated',
  );
  assert.equal(
    classifyGpu('ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics, OpenGL 4.6)'),
    'dedicated',
  );
  assert.equal(
    classifyGpu(
      'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
    ),
    'software',
  );
  assert.equal(
    classifyGpu('ANGLE (Mesa, llvmpipe (LLVM 17.0.6, 256 bits), OpenGL 4.5)'),
    'software',
  );
  assert.equal(classifyGpu(null), 'unknown');
  assert.equal(shortGpuName(null), null);
});
