"""Build browser assets from the three supplied ZIPs and sunset EXR.
Usage: python scripts/prepare-yard-materials.py UPLOAD_DIR
Requires Pillow, NumPy and OpenEXR. Original uploads are never modified.
"""
from pathlib import Path
import io
import sys
import tempfile
import zipfile
import OpenEXR
import numpy as np
from PIL import Image

source = Path(sys.argv[1])
out = Path(__file__).resolve().parents[1] / 'public/materials'

def exr(path):
    with OpenEXR.File(str(path)) as f:
        channels = f.channels()
        a = channels['RGB' if 'RGB' in channels else 'RGBA' if 'RGBA' in channels else 'Y'].pixels.astype(np.float32)
    if a.ndim == 2:
        a = np.repeat(a[:, :, None], 3, axis=2)
    return a[:, :, :3]

def resize(a, size):
    return np.stack([np.asarray(Image.fromarray(a[:, :, i]).resize(size, Image.Resampling.BOX)) for i in range(3)], axis=-1)

for name, folder, metal in [('asphalt_02', 'yard-asphalt', 0), ('gravel_concrete_03', 'yard-concrete', 0), ('container_side', 'yard-container', 45)]:
    dest = out / folder
    dest.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(source / (name + '_2k.blend.zip')) as z, tempfile.TemporaryDirectory() as tmp:
        Image.open(io.BytesIO(z.read('textures/' + name + '_diff_2k.jpg'))).convert('RGB').save(dest / 'color.webp', quality=86, method=6)
        def linear(kind):
            base = 'textures/' + name + '_' + kind + '_2k'
            if base + '.exr' in z.namelist():
                p = Path(tmp) / (kind + '.exr')
                p.write_bytes(z.read(base + '.exr'))
                return resize(exr(p), (1024, 1024))
            return np.asarray(Image.open(io.BytesIO(z.read(base + '.jpg'))).convert('RGB').resize((1024, 1024), Image.Resampling.BOX), dtype=np.float32) / 255
        n = linear('nor_gl') * 2 - 1
        n /= np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-8)
        Image.fromarray(np.rint(np.clip(n * .5 + .5, 0, 1) * 255).astype('uint8')).save(dest / 'normal.png', optimize=True)
        rough = np.rint(np.clip(linear('rough')[:, :, 0], 0, 1) * 255).astype('uint8')
        Image.fromarray(np.stack([np.full_like(rough, 255), rough, np.full_like(rough, metal)], axis=-1)).save(dest / 'orm.png', optimize=True)
        assert np.isfinite(n).all()
    print(folder, '2K color / 1K normal and packed material')

sky = np.maximum(0, resize(exr(source / 'industrial_sunset_puresky_4k.exr'), (2048, 1024)))
assert np.isfinite(sky).all() and float(sky.max()) > 0.1
# Preserve scene-linear radiance, rather than baking a tonemapped photograph.
peak = np.max(sky, axis=2)
_, exponent = np.frexp(peak)
scale = np.ldexp(np.ones_like(peak), 8 - exponent)
rgbe = np.zeros((1024, 2048, 4), dtype=np.uint8)
rgbe[:, :, :3] = np.clip(sky * scale[:, :, None], 0, 255).astype('uint8')
rgbe[:, :, 3] = np.clip(exponent + 128, 0, 255).astype('uint8')
rgbe[peak < 1e-32] = 0
dest = out / 'yard-sky'
dest.mkdir(exist_ok=True)
with (dest / 'industrial-sunset-2k.hdr').open('wb') as f:
    f.write(b'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 1024 +X 2048\n')
    for row in rgbe:
        f.write(bytes([2, 2, 8, 0]))
        for channel in range(4):
            for start in range(0, 2048, 128):
                f.write(bytes([128]))
                f.write(row[start:start + 128, channel].tobytes())
print('HDR sky: 2048 x 1024, radiance range', float(sky.min()), float(sky.max()))

print('Hinweis: danach  node scripts/compress-material-maps.mjs  ausführen (PNG -> WebP).')
