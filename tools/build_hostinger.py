"""Zips the site and its PHP backend for Hostinger: in File Manager, upload the zip to public_html and Extract.

Run from aleph-one/:  python -I tools/build_hostinger.py [out.zip]   (default: ../aleph-one-hostinger.zip)
Only files matching INCLUDE ship, so stray backups, configs and internal pages can't slip in. Each pattern must match
something, so a renamed file fails the build instead of quietly missing from the site.
"""
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / 'aleph-one-hostinger.zip'
INCLUDE = [
    'index.html', 'site.html', 'mission.html', 'robots.txt', 'sitemap.xml', '.htaccess',
    'support.js', 'aleph-prices.js', 'aleph-rocket.js', 'aleph-scene.js', 'vendor/three.module.min.js',
    'api/.htaccess', 'api/lead.php', 'api/lib.php', 'api/config.sample.php',
    'admin/.htaccess', 'admin/index.php', 'admin/_*.php',
    'worlds/*.html', 'assets/fonts/*.woff2', 'assets/space/*.webp', 'assets/space/*.jpg',
    'assets/work/*.webp', 'assets/work/*.jpg', 'assets/work/posters/*.webp', 'uploads/*.png', 'uploads/*.jpeg',
]
# Second guard on the result: real configs and copies, markers, logs, dumps.
PRIVATE = re.compile(r'^api/(config(?!\.sample\.php$).*|\.tables-.*|\.schema-.*)$|aleph-config|(\.bak|\.sql|\.log|\.env|\.zip|~)$|(^|/)\.env')

files = {}
for pattern in INCLUDE:
    found = [p for p in ROOT.glob(pattern) if p.is_file()]
    assert found, f'nothing matches {pattern}'
    files.update({p.relative_to(ROOT).as_posix(): p for p in found})

with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    for rel in sorted(files):
        z.write(files[rel], rel)

names = set(zipfile.ZipFile(OUT).namelist())
assert not [n for n in names if PRIVATE.search(n)], 'private file in zip'
assert all(PRIVATE.search(n) for n in ['api/config.php', 'api/config.php.bak', 'api/config - Copy.php', 'api/.schema-2-ab', 'aleph-config.php', 'x/.env']), 'filter self-check'
print(f'{OUT}  {OUT.stat().st_size / 1e6:.1f} MB, {len(names)} files')
