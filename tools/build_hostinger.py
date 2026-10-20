"""Zips the site and its PHP backend for Hostinger: in File Manager, upload the zip to public_html and Extract.

Run from aleph-one/:  python -I tools/build_hostinger.py [out.zip]   (default: ../aleph-one-hostinger.zip)
Leaves out dev-only files and never packs a real config (api/config.php or any copy of it), which holds the passwords.
"""
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / 'aleph-one-hostinger.zip'
SKIP_TOP = {'.git', 'tools', 'README.md', '.nojekyll', 'vercel.json', '.gitignore'}
# Real configs and their copies, local leftovers (backups, dumps, logs, env files) and the created-tables markers.
PRIVATE = re.compile(r'^api/(config(?!\.sample\.php$).*|\.tables-.*)$|(\.bak|\.sql|\.log|\.env|~)$|(^|/)\.env')

with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in sorted(ROOT.rglob('*')):
        rel = p.relative_to(ROOT).as_posix()
        if p.is_file() and rel.split('/')[0] not in SKIP_TOP and not PRIVATE.search(rel):
            z.write(p, rel)

names = set(zipfile.ZipFile(OUT).namelist())
need = {'index.html', '.htaccess', 'api/lead.php', 'api/lib.php', 'api/.htaccess', 'api/config.sample.php', 'admin/index.php', 'vendor/three.module.min.js'}
assert need <= names, f'missing from zip: {need - names}'
assert not [n for n in names if PRIVATE.search(n) or n.startswith('tools/')], 'private file in zip'
assert all(PRIVATE.search(n) for n in ['api/config.php', 'api/config.php.bak', 'api/config - Copy.php', 'api/.tables-ab12', 'x/.env']), 'filter self-check'
print(f'{OUT}  {OUT.stat().st_size / 1e6:.1f} MB, {len(names)} files')
