// Packs index.html and everything it loads (scripts, three.js, React, fonts, logo, posters, NASA maps, sample
// sites) into one self-contained HTML file that uploads to any host or opens from disk.
// Run from aleph-one/: node tools/build-single.mjs [out.html]   (default: ../single-file/index.html)
// React comes from the same unpkg URL support.js uses and must match its SRI hash, so this needs the network.
// ponytail: 2k Earth/Moon maps only, so 'cinema' gets 2k here (~6 MB file; the 4k pair adds ~2.4 MB). Add them if big screens need it.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] || resolve(ROOT, '../single-file/index.html'));
const read = p => readFileSync(resolve(ROOT, p));
const text = p => read(p).toString('utf8');
const MIME = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png', woff2: 'font/woff2', js: 'text/javascript' };
const dataUri = p => `data:${MIME[p.split('.').pop()]};base64,${read(p).toString('base64')}`;
// Every swap must hit, so an edit to the source fails the build instead of shipping a page with a dead path.
const swap = (s, from, to) => { if (!s.includes(from)) throw new Error('build-single: not found: ' + from.slice(0, 90)); return s.split(from).join(to); };
const inline = js => js.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

const support = text('support.js');
async function cdn(name) {
  const url = support.match(new RegExp(`var ${name}_URL = "([^"]+)"`))[1], sri = support.match(new RegExp(`var ${name}_SRI = "([^"]+)"`))[1];
  const res = await fetch(url); if (!res.ok) throw new Error(`build-single: ${url} returned ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  if ('sha384-' + createHash('sha384').update(body).digest('base64') !== sri) throw new Error('build-single: integrity mismatch: ' + url);
  return body.toString('utf8');
}

// Paths the page builds at run time. Images stay data URIs; sample sites become same-origin blob pages (peekWorld reads them).
const A = {};
for (const f of readdirSync(resolve(ROOT, 'assets/work/posters'))) A['assets/work/posters/' + f] = dataUri('assets/work/posters/' + f);
for (const f of ['earth-2k.webp', 'earth-data.jpg', 'moon-2k.webp', 'moon-normal.jpg']) A['assets/space/' + f] = dataUri('assets/space/' + f);
for (const f of readdirSync(resolve(ROOT, 'worlds'))) A['worlds/' + f] = text('worlds/' + f);
const assets = `<script>(() => { const A = ${JSON.stringify(A).replace(/</g, '\\u003c')}, B = {};
window.__A = p => !(p in A) ? p : !p.endsWith('.html') ? A[p] : B[p] || (B[p] = URL.createObjectURL(new Blob([A[p]], { type: 'text/html' }))); })();</script>`;

const mark = dataUri('uploads/aleph-mark.png');
let rocket = text('aleph-rocket.js');
rocket = swap(rocket, "k = CINEMA ? '4k' : '2k'", "k = '2k'");
rocket = swap(rocket, '`assets/space/earth-${k}.webp`', '__A(`assets/space/earth-${k}.webp`)');
rocket = swap(rocket, '`assets/space/moon-${k}.webp`', '__A(`assets/space/moon-${k}.webp`)');
rocket = swap(rocket, "'assets/space/earth-data.jpg'", "__A('assets/space/earth-data.jpg')");
rocket = swap(rocket, "'assets/space/moon-normal.jpg'", "__A('assets/space/moon-normal.jpg')");
rocket = swap(rocket, 'uploads/aleph-mark.png', mark);

let html = text('index.html');
const preloads = html.match(/<link rel="preload"[^>]*>\r?\n/g) || [];
if (preloads.length !== 3) throw new Error('build-single: expected 3 preload links, found ' + preloads.length);
for (const l of preloads) html = swap(html, l, ''); // they only help when files arrive separately
html = swap(html, './uploads/aleph-icon.png', dataUri('uploads/aleph-icon.png'));
html = swap(html, 'url(./assets/fonts/inter.woff2)', `url(${dataUri('assets/fonts/inter.woff2')})`);
html = swap(html, 'url(./assets/fonts/lora.woff2)', `url(${dataUri('assets/fonts/lora.woff2')})`);
html = swap(html, 'uploads/aleph-mark.png', mark);
html = swap(html, "'./assets/work/posters/' + w.slug + (narrow ? '-m' : '') + '.webp'", "__A('assets/work/posters/' + w.slug + (narrow ? '-m' : '') + '.webp')");
html = swap(html, "'./worlds/' + w.slug + '.html'", "__A('worlds/' + w.slug + '.html')");
html = swap(html, "'./worlds/' + v.slug + '.html'", "__A('worlds/' + v.slug + '.html')");
// Both move from <helmet> to <head>: the runtime rewrites template text before use and breaks inlined JS there.
// The page already polls for window.AlephRocket, so running earlier is fine.
html = swap(html, '<script src="./aleph-prices.js"></script>\n', '');
html = swap(html, '<script type="module" src="./aleph-rocket.js"></script>\n', '');

// The import map keeps aleph-rocket.js's own `import './vendor/three.module.min.js'`; React already on window stops support.js fetching it.
// Head scripts load from base64 data: URLs because support.js re-reads this page's text and takes the first "<x-dc" it finds
// as the template; support.js's own source contains that string.
const [react, reactDom] = await Promise.all([cdn('REACT'), cdn('REACT_DOM')]);
const importMap = `<script type="importmap">${JSON.stringify({ imports: { './vendor/three.module.min.js': dataUri('vendor/three.module.min.js') } })}</script>`;
const hidden = js => `<script src="data:text/javascript;base64,${Buffer.from(js).toString('base64')}"></script>`;
html = swap(html, '<script src="./support.js"></script>',
  [importMap, hidden(react), hidden(reactDom), assets, hidden(text('aleph-prices.js')), `<script type="module">${inline(rocket)}</script>`, hidden(support)].join('\n'));
if (html.indexOf('<x-dc') !== html.indexOf('<x-dc>\n<helmet>')) throw new Error('build-single: something before the template contains "<x-dc"');

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);
console.log(`${OUT}  ${(Buffer.byteLength(html) / 1e6).toFixed(1)} MB`);
