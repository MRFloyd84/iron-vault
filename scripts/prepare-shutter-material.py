"""Convert the supplied PBR archive into browser textures (Pillow, NumPy, OpenEXR)."""
import io
import pathlib
import sys
import tempfile
import zipfile

import numpy as np
import OpenEXR
from PIL import Image

destination = pathlib.Path(__file__).resolve().parents[1] / 'public/materials/shutter'
destination.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(sys.argv[1]) as archive, tempfile.TemporaryDirectory() as temporary:
    def source(name):
        return archive.read('textures/worn_shutter_' + name + '_2k' + ('.jpg' if name == 'diff' else '.exr'))

    Image.open(io.BytesIO(source('diff'))).convert('RGB').save(destination / 'color.webp', quality=88, method=6)

    def linear_map(name):
        path = pathlib.Path(temporary) / (name + '.exr')
        path.write_bytes(source(name))
        with OpenEXR.File(str(path)) as image:
            channels = image.channels()
            rgb = channels['RGB' if 'RGB' in channels else 'Y'].pixels.astype(np.float32)
        if rgb.ndim == 2:
            rgb = np.repeat(rgb[:, :, None], 3, axis=-1)
        return np.stack([
            np.asarray(Image.fromarray(rgb[:, :, channel]).resize((1024, 1024), Image.Resampling.BOX))
            for channel in range(3)
        ], axis=-1)

    normal = linear_map('nor_gl') * 2 - 1
    normal /= np.maximum(np.linalg.norm(normal, axis=-1, keepdims=True), 1e-8)
    normal_rgb = np.rint(np.clip(normal * .5 + .5, 0, 1) * 255).astype(np.uint8)
    Image.fromarray(normal_rgb).save(destination / 'normal.png', optimize=True)
    roughness = np.rint(np.clip(linear_map('rough')[:, :, 0], 0, 1) * 255).astype(np.uint8)
    # No AO or metalness map is supplied: neutral AO, restrained constant metalness.
    orm = np.stack([np.full_like(roughness, 255), roughness, np.full_like(roughness, 64)], axis=-1)
    Image.fromarray(orm).save(destination / 'orm.png', optimize=True)
    assert np.isfinite(normal).all() and roughness.max() > roughness.min()
    print('Prepared shutter: 2K color, 1K linear normal/ORM; roughness range', int(roughness.min()), int(roughness.max()))

print('Hinweis: danach  node scripts/compress-material-maps.mjs  ausführen (PNG -> WebP).')
