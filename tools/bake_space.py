# Bake NASA source maps into the web textures in assets/space (used by aleph-rocket.js).
# Sources (public domain), download into one folder first:
#   https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_4k.tif  (LRO LROC colour)
#   https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_4_uint.tif          (LOLA elevation)
#   https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg
#   https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg
#   https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_01deg.jpg
# usage: python -I tools/bake_space.py <nasa_dir> assets/space   (needs pillow + numpy)
import sys, numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
src, out = sys.argv[1], sys.argv[2]

def save_jpg(a, name, w, q=86):
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    im = im.resize((w, w // 2), Image.LANCZOS)
    im.save(f'{out}/{name}', quality=q, subsampling=0, optimize=True, progressive=True)  # 4:4:4 keeps packed channels apart

# --- Moon colour (LRO WAC mosaic, lon 0 at centre) ---
moon = Image.open(f'{src}/lroc_color_poles_4k.tif').convert('RGB')
for w in (4096, 2048):
    moon.resize((w, w // 2), Image.LANCZOS).save(f'{out}/moon-{w // 1024}k.webp', quality=84, method=6)

# --- Moon normal map from LOLA elevation (ldem_4: 1440x720, uint16 half-metres) ---
h = np.asarray(Image.open(f'{src}/ldem_4_uint.tif'), dtype=np.float64) * 0.5  # metres (offset irrelevant for slopes)
hi = Image.fromarray(h.astype(np.float32), mode='F').resize((2048, 1024), Image.BICUBIC)
h = np.asarray(hi, dtype=np.float64)
H, W = h.shape
px = 10921e3 / W                                             # metres per pixel at the equator
lat = (0.5 - (np.arange(H) + 0.5) / H) * np.pi
coslat = np.maximum(np.cos(lat), 0.3)[:, None]
dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) / (2 * px * coslat)   # east slope, wraps at the date line
dn = (np.vstack([h[:1], h[:-1]]) - np.vstack([h[1:], h[-1:]])) / (2 * px)  # north slope (row 0 is the north pole)
EXAG = 5.0                                                   # ponytail: relief exaggeration, tuned by eye at the terminator
n = np.dstack([-dx * EXAG, -dn * EXAG, np.ones_like(h)])
n /= np.linalg.norm(n, axis=2, keepdims=True)
save_jpg((n * 0.5 + 0.5) * 255, 'moon-normal.jpg', 2048, q=90)

# --- Earth day (Blue Marble topo+bathy, Dec 2004) ---
e = np.asarray(Image.open(f'{src}/world.topo.bathy.200412.3x5400x2700.jpg').convert('RGB'), dtype=np.float64)
r, g, b = e[..., 0], e[..., 1], e[..., 2]
ocean = np.clip(((b - r) - 8) / 22, 0, 1)                    # blue-dominant pixels; ice and land stay 0
lum = (0.3 * r + 0.59 * g + 0.11 * b)
shallow = np.clip((lum - 70) / 50, 0, 1)                    # keep turquoise shelves, flatten deep-sea relief
deep = np.array([6, 18, 42], dtype=np.float64)
k = (ocean * (1 - shallow) * 0.55)[..., None]
day = e * (1 - k) + deep * k
for w in (4096, 2048):
    Image.fromarray(np.clip(day, 0, 255).astype(np.uint8)).resize((w, w // 2), Image.LANCZOS).save(f'{out}/earth-{w // 1024}k.webp', quality=84, method=6)

# --- Earth data: R clouds, G city lights, B ocean mask (one texture, three lookups) ---
def gray(path):
    return np.asarray(Image.open(path).convert('L').resize((2048, 1024), Image.LANCZOS), dtype=np.float64)
clouds = gray(f'{src}/cloud_combined_2048.jpg')
lights = gray(f'{src}/BlackMarble_2016_01deg.jpg')
lights = np.clip((lights - 18) * 1.6, 0, 255)               # drop the faint background glow
oc = np.asarray(Image.fromarray((ocean * 255).astype(np.uint8)).resize((2048, 1024), Image.LANCZOS), dtype=np.float64)
save_jpg(np.dstack([clouds, lights, oc]), 'earth-data.jpg', 2048, q=88)

# one runnable check: the near side of the Moon (centre column) must be darker in maria than highlands overall,
# and the normal map must point mostly outward
nm = np.asarray(Image.open(f'{out}/moon-normal.jpg'), dtype=np.float64) / 255 * 2 - 1
assert nm[..., 2].mean() > 0.9, nm[..., 2].mean()
assert 0.15 < oc.mean() / 255 < 0.85, oc.mean() / 255           # roughly 70% of Earth is ocean
print('ok', 'ocean frac %.2f' % (oc.mean() / 255), 'normal z %.3f' % nm[..., 2].mean())
