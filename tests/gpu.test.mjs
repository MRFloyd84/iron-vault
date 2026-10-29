import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { classifyGpu, shortGpuName } from '../lib/gpu-info.ts';

const require = createRequire(import.meta.url);
const { primeOffloadEnv } = require('../electron/gpu.cjs');

const NV = '0x10de';
const INTEL = '0x8086';
const AMD = '0x1002';
const laptop = {
  platform: 'linux',
  nvidiaDriver: true,
  vendors: [INTEL, NV],
  eglVendorFile: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json',
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

test('Nur NVIDIA, kein Treiber, kein Linux oder IRON_VAULT_GPU=auto: nichts ändern', () => {
  assert.deepEqual(primeOffloadEnv({ ...laptop, vendors: [NV] }, {}), {});
  assert.deepEqual(primeOffloadEnv({ ...laptop, nvidiaDriver: false }, {}), {});
  assert.deepEqual(primeOffloadEnv({ ...laptop, platform: 'win32' }, {}), {});
  assert.deepEqual(primeOffloadEnv(laptop, { IRON_VAULT_GPU: 'auto' }), {});
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
