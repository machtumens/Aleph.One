import * as THREE from './vendor/three.module.min.js';
// Procedural launch vehicle + launch complex. Every part is a named group with a `home` position and an `explode`
// vector, so a modelled GLTF vehicle can replace the primitives without touching the rig or the camera script.
const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v)), sm = t => { t = clamp(t); return t * t * (3 - 2 * t); };
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), TAU = Math.PI * 2;
const rnd = (() => { let s = 1337; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();

// ---------- procedural textures ----------
function noiseTex(size, base, amp, opts = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
  x.fillStyle = `rgb(${base},${base},${base})`; x.fillRect(0, 0, size, size);
  const img = x.getImageData(0, 0, size, size), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (rnd() - .5) * amp + (rnd() - .5) * amp * .5; d[i] = d[i + 1] = d[i + 2] = clamp(d[i] + n, 0, 255); }
  x.putImageData(img, 0, 0);
  if (opts.streaks) for (let i = 0; i < opts.streaks; i++) { x.fillStyle = `rgba(${rnd() > .5 ? 255 : 0},${rnd() > .5 ? 255 : 0},${rnd() > .5 ? 255 : 0},${.04 + rnd() * .08})`; x.fillRect(rnd() * size, 0, 1 + rnd() * 3, size * (.3 + rnd() * .7)); }
  if (opts.panels) { x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 2; for (let i = 0; i < opts.panels; i++) { const px = (i / opts.panels) * size; x.beginPath(); x.moveTo(px, 0); x.lineTo(px, size); x.stroke(); } for (let i = 0; i < 6; i++) { const py = (i / 6) * size; x.beginPath(); x.moveTo(0, py); x.lineTo(size, py); x.stroke(); } }
  if (opts.blotches) for (let i = 0; i < opts.blotches; i++) { x.fillStyle = `rgba(0,0,0,${.03 + rnd() * .1})`; x.beginPath(); x.ellipse(rnd() * size, rnd() * size, 4 + rnd() * 30, 4 + rnd() * 30, rnd() * 3, 0, TAU); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
function decalTex() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 1024; const x = c.getContext('2d');
  x.clearRect(0, 0, 1024, 1024); x.save(); x.translate(512, 512); x.rotate(-Math.PI / 2);
  x.fillStyle = '#0B0C0C'; x.font = '600 150px Archivo, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('ALEPH ONE', 0, 0);
  x.restore(); x.fillStyle = '#B5432F'; x.fillRect(300, 60, 424, 40); x.fillStyle = '#EDEFF0'; x.fillRect(300, 100, 424, 40);
  x.fillStyle = '#0B0C0C'; x.font = '500 34px "Instrument Sans", sans-serif'; x.textAlign = 'left'; x.fillText('LV-01  ·  SN 007', 300, 940); x.fillText('CREATIVE TECHNOLOGY', 300, 980);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 8; return t;
}
function earthTex() {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 1024; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 1024); g.addColorStop(0, '#0E2E5C'); g.addColorStop(.5, '#153F7A'); g.addColorStop(1, '#0E2E5C'); x.fillStyle = g; x.fillRect(0, 0, 2048, 1024);
  for (let i = 0; i < 70; i++) { const cx = rnd() * 2048, cy = 160 + rnd() * 700, r = 40 + rnd() * 170; x.fillStyle = ['#3B5B2E', '#4A6A34', '#6E6A3E', '#85704A', '#2F4D2A'][i % 5];
    x.beginPath(); for (let k = 0; k < 14; k++) { const a = k / 14 * TAU, rr = r * (.6 + rnd() * .7); x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * .7); } x.closePath(); x.fill(); }
  x.fillStyle = 'rgba(235,240,245,.95)'; x.fillRect(0, 0, 2048, 70); x.fillRect(0, 960, 2048, 64);
  for (let i = 0; i < 4000; i++) { x.fillStyle = `rgba(0,0,0,${rnd() * .12})`; x.fillRect(rnd() * 2048, rnd() * 1024, 3, 3); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function moonTex() {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 1024; const x = c.getContext('2d');
  x.fillStyle = '#8E8C86'; x.fillRect(0, 0, 2048, 1024);
  for (let i = 0; i < 26; i++) { const cx = rnd() * 2048, cy = 200 + rnd() * 620, r = 90 + rnd() * 260; x.fillStyle = `rgba(70,70,74,${.35 + rnd() * .3})`; x.beginPath(); for (let k = 0; k < 16; k++) { const a = k / 16 * TAU, rr = r * (.6 + rnd() * .7); x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * .8); } x.closePath(); x.fill(); }
  for (let i = 0; i < 900; i++) { const cx = rnd() * 2048, cy = rnd() * 1024, r = 3 + Math.pow(rnd(), 3) * 60; const g = x.createRadialGradient(cx, cy, r * .2, cx, cy, r); g.addColorStop(0, 'rgba(60,60,62,.55)'); g.addColorStop(.75, 'rgba(120,118,112,.15)'); g.addColorStop(.9, 'rgba(220,218,210,.5)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2); }
  for (let i = 0; i < 9000; i++) { x.fillStyle = `rgba(${rnd() < .5 ? 0 : 255},${rnd() < .5 ? 0 : 255},${rnd() < .5 ? 0 : 255},${rnd() * .07})`; x.fillRect(rnd() * 2048, rnd() * 1024, 3, 3); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function cloudTex() {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 1024; const x = c.getContext('2d'); x.clearRect(0, 0, 2048, 1024);
  for (let i = 0; i < 260; i++) { const cx = rnd() * 2048, cy = rnd() * 1024, r = 20 + rnd() * 120; const gr = x.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, 'rgba(255,255,255,.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.beginPath(); x.ellipse(cx, cy, r * 1.8, r * .6, rnd() * 3, 0, TAU); x.fill(); }
  return new THREE.CanvasTexture(c);
}
function softDisc() { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.4, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); }

const T = { paint: noiseTex(1024, 215, 22, { streaks: 60, panels: 12, blotches: 40 }), metal: noiseTex(512, 150, 60, { streaks: 120 }), concrete: noiseTex(1024, 120, 55, { blotches: 200 }), ground: noiseTex(1024, 90, 40, { blotches: 300 }) };
T.paint.repeat.set(3, 3); T.concrete.repeat.set(4, 4); T.ground.repeat.set(40, 40); T.metal.repeat.set(2, 2);
const M = {
  paint: new THREE.MeshPhysicalMaterial({ color: 0xDADCDB, roughness: .55, metalness: .1, clearcoat: .45, clearcoatRoughness: .4, roughnessMap: T.paint, bumpMap: T.paint, bumpScale: .012 }),
  paintDirty: new THREE.MeshStandardMaterial({ color: 0xA9ACAB, roughness: .75, metalness: .2, roughnessMap: T.paint, bumpMap: T.paint, bumpScale: .02 }),
  frost: new THREE.MeshStandardMaterial({ color: 0xF4F7F9, roughness: 1, metalness: 0, transparent: true, opacity: .85, bumpMap: T.paint, bumpScale: .03 }),
  carbon: new THREE.MeshStandardMaterial({ color: 0x121416, roughness: .38, metalness: .55, roughnessMap: T.metal }),
  steel: new THREE.MeshStandardMaterial({ color: 0x9AA0A4, roughness: .3, metalness: 1, roughnessMap: T.metal, bumpMap: T.metal, bumpScale: .006 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x2E3236, roughness: .55, metalness: .85, roughnessMap: T.metal }),
  darker: new THREE.MeshStandardMaterial({ color: 0x15171A, roughness: .7, metalness: .6 }),
  bell: new THREE.MeshStandardMaterial({ color: 0x5E5650, roughness: .32, metalness: 1, roughnessMap: T.metal, bumpMap: T.metal, bumpScale: .01 }),
  copper: new THREE.MeshStandardMaterial({ color: 0x8C5A3C, roughness: .35, metalness: 1 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x1B1D1F, roughness: .95, map: null, roughnessMap: T.concrete, bumpMap: T.concrete, bumpScale: .04 }),
  trench: new THREE.MeshStandardMaterial({ color: 0x07080A, roughness: 1 }),
  ground: new THREE.MeshStandardMaterial({ color: 0x0A0B0C, roughness: 1, bumpMap: T.ground, bumpScale: .3 }),
  lattice: new THREE.MeshStandardMaterial({ color: 0x3B3F43, roughness: .6, metalness: .7, roughnessMap: T.metal }),
  rust: new THREE.MeshStandardMaterial({ color: 0x4A3A30, roughness: .85, metalness: .4 }),
  rock: new THREE.MeshStandardMaterial({ color: 0x0B0D0F, roughness: 1 }),
  hazard: new THREE.MeshStandardMaterial({ color: 0xC9A227, roughness: .8 }),
  accent: new THREE.MeshStandardMaterial({ color: 0x0B0C0C, emissive: 0x35D6F0, emissiveIntensity: 1.8 }),
  lamp: new THREE.MeshStandardMaterial({ color: 0x222, emissive: 0xFFF1DC, emissiveIntensity: 3 }),
  redLamp: new THREE.MeshBasicMaterial({ color: 0xFF3B30 }),
  cone: new THREE.MeshBasicMaterial({ color: 0xFFE9CC, transparent: true, opacity: .045, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
};
const parts = {}, arms = [];
let R, scene, cam, rocket, fairA, fairB, earth, atmo, clouds, moon, stars, stars2, smoke, flame, flameCore, engLight, vapor, keyL, rimL, spot = [], beacons = [];
const S = { sec: 0, local: 0, launched: false, launchAt: 0, mouse: [0, 0] };
const A = { pos: V3(2.4, 4.2, 3.6), tgt: V3(0, 4, 0), fov: 42, alt: 0, thrust: 0, tilt: 0, bg: new THREE.Color('#070809'), fogFar: 220, stars: 0, earth: 0, arms: 0, open: 0, payY: 0, shake: 0, lunar: 0, drift: 0 };
let prMax = 1, fps = 0, frames = 0, tF = 0, tPrev = performance.now(), first = false, onFirst = null, quality = 'standard';

function mk(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = m.receiveShadow = true; return m; }
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d), cyl = (r1, r2, h, s = 48, open = false) => new THREE.CylinderGeometry(r1, r2, h, s, 1, open);
function inst(geo, mat, list) { const im = new THREE.InstancedMesh(geo, mat, list.length), d = new THREE.Object3D(); list.forEach((p, i) => { d.position.set(p[0], p[1], p[2]); d.rotation.set(p[3] || 0, p[4] || 0, p[5] || 0); d.scale.setScalar(p[6] || 1); d.updateMatrix(); im.setMatrixAt(i, d.matrix); }); im.instanceMatrix.needsUpdate = true; im.castShadow = im.receiveShadow = true; return im; }
function group(name, explode, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); g.userData = { home: g.position.clone(), explode, f: 0 }; parts[name] = g; return g; }
function seams(g, y0, y1, step, r) {
  const ring = new THREE.TorusGeometry(r + .01, .03, 8, 96), riv = [];
  for (let y = y0; y <= y1; y += step) { g.add(mk(ring, M.dark, 0, y, 0, Math.PI / 2)); for (let k = 0; k < 56; k++) { const a = k / 56 * TAU; riv.push([Math.cos(a) * (r + .02), y + .16, Math.sin(a) * (r + .02)]); riv.push([Math.cos(a) * (r + .02), y - .16, Math.sin(a) * (r + .02)]); } }
  g.add(inst(new THREE.SphereGeometry(.04, 6, 6), M.dark, riv));
}
function panelLines(g, y, h, r, n) { const l = []; for (let k = 0; k < n; k++) { const a = k / n * TAU + .13; l.push([Math.cos(a) * (r + .003), y, Math.sin(a) * (r + .003), 0, -a, 0]); } g.add(inst(box(.025, h, .03), M.darker, l)); }
function hatch(g, a, y, r, w = .5, h = .7) { const x = Math.cos(a) * (r + .03), z = Math.sin(a) * (r + .03); const hm = mk(box(.05, h, w), M.paintDirty, x, y, z, 0, -a, 0); g.add(hm); const b = []; [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([u, v]) => b.push([Math.cos(a) * (r + .06) - Math.sin(a) * v * (w / 2 - .06), y + u * (h / 2 - .06), Math.sin(a) * (r + .06) + Math.cos(a) * v * (w / 2 - .06)])); g.add(inst(new THREE.SphereGeometry(.03, 6, 6), M.steel, b)); }

function buildRocket() {
  rocket = new THREE.Group(); rocket.position.y = 3.6; scene.add(rocket);
  const Rr = 1.8;
  // BODY — brand
  const body = group('body', V3(-3, 0, 5)); rocket.add(body);
  body.add(mk(cyl(Rr, Rr, 20.4, 96), M.paint, 0, 11.8, 0)); seams(body, 2.6, 21, 2.3, Rr); panelLines(body, 11.8, 20, Rr, 16);
  body.add(mk(cyl(Rr + .005, Rr + .005, 1.1, 96), M.carbon, 0, 3.2, 0)); body.add(mk(cyl(Rr + .005, Rr + .005, .6, 96), M.carbon, 0, 21.6, 0));
  body.add(mk(cyl(Rr + .004, Rr + .004, 2.6, 96), M.frost, 0, 6.2, 0));
  const decal = mk(cyl(Rr + .012, Rr + .012, 6.4, 48, true), new THREE.MeshStandardMaterial({ map: decalTex(), transparent: true, roughness: .6, alphaTest: .05, side: THREE.DoubleSide }), 0, 14.5, 0); decal.geometry = new THREE.CylinderGeometry(Rr + .012, Rr + .012, 6.4, 48, 1, true, 2.1, 1.1); decal.castShadow = false; body.add(decal);
  body.add(mk(box(.34, 19, .26), M.dark, Rr + .1, 12, 0)); for (let y = 3; y < 21; y += 2.3) body.add(mk(box(.42, .3, .34), M.steel, Rr + .1, y, 0));
  [[.9, 5], [2.4, 9.5], [4.1, 14], [5.5, 18.5], [1.6, 17]].forEach(([a, y]) => hatch(body, a, y, Rr));
  const plates = []; for (let k = 0; k < 14; k++) { const a = k / 14 * TAU; plates.push([Math.cos(a) * (Rr + .06), 2.1, Math.sin(a) * (Rr + .06), 0, -a, 0]); } body.add(inst(box(.08, .55, .78), M.darker, plates));
  const finShape = new THREE.Shape(); finShape.moveTo(0, 0); finShape.lineTo(1.7, 0); finShape.lineTo(1.5, .5); finShape.lineTo(0, 4.4); finShape.lineTo(0, 0);
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: .09, bevelEnabled: false });
  for (let k = 0; k < 4; k++) { const h = new THREE.Group(); h.rotation.y = k * Math.PI / 2; h.add(mk(finGeo, M.carbon, Rr - .05, 1.8, -.045)); h.add(mk(box(.5, 4.2, .2), M.dark, Rr + .05, 4, 0)); body.add(h); }
  for (let k = 0; k < 4; k++) { const h = new THREE.Group(); h.rotation.y = k * Math.PI / 2 + Math.PI / 4; h.add(mk(box(.32, 9.5, .5), M.dark, Rr - .1, 6.4, 0, 0, 0, -.06)); h.add(mk(box(.5, .4, .7), M.steel, Rr + .15, 1.9, 0)); h.add(mk(cyl(.07, .07, 3.6, 10), M.steel, Rr + .32, 9.2, 0, 0, 0, -.28)); body.add(h); }
  // ENGINES — performance
  const eng = group('engines', V3(0, -7.5, 0)); rocket.add(eng);
  eng.add(mk(cyl(Rr, Rr + .12, 1.6, 96), M.dark, 0, .8, 0)); eng.add(mk(cyl(Rr - .05, Rr - .05, .12, 64), M.darker, 0, .06, 0));
  const bellGeo = new THREE.LatheGeometry([new THREE.Vector2(.22, 0), new THREE.Vector2(.2, -.3), new THREE.Vector2(.3, -.72), new THREE.Vector2(.46, -1.12), new THREE.Vector2(.58, -1.45)], 40);
  const bellPos = [[0, 0]]; for (let k = 0; k < 8; k++) bellPos.push([Math.cos(k / 8 * TAU) * 1.15, Math.sin(k / 8 * TAU) * 1.15]);
  const tori = new THREE.TorusGeometry(.31, .035, 8, 32), tori2 = new THREE.TorusGeometry(.5, .03, 8, 32);
  bellPos.forEach(([x, z], i) => { eng.add(mk(bellGeo, M.bell, x, 0, z)); eng.add(mk(box(.3, .5, .3), M.steel, x, .25, z)); eng.add(mk(tori, M.copper, x, -.3, z, Math.PI / 2)); eng.add(mk(tori2, M.dark, x, -1.05, z, Math.PI / 2));
    eng.add(mk(cyl(.15, .15, .55, 16), M.steel, x + .28, .5, z + .1)); eng.add(mk(new THREE.SphereGeometry(.14, 14, 10), M.dark, x - .25, .55, z - .12));
    eng.add(mk(cyl(.035, .035, 1.1, 8), M.copper, x + .26, -.55, z)); eng.add(mk(cyl(.035, .035, 1.1, 8), M.copper, x - .26, -.55, z));
    if (i) { eng.add(mk(cyl(.04, .04, 1.3, 8), M.steel, x * .6, .7, z * .6, Math.atan2(z, x) > 0 ? .5 : -.5, 0, .5)); } });
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + .2; eng.add(mk(cyl(.06, .06, 1.2, 10), M.steel, Math.cos(a) * 1.55, .7, Math.sin(a) * 1.55)); }
  eng.add(mk(new THREE.TorusGeometry(1.5, .06, 8, 64), M.copper, 0, .95, 0, Math.PI / 2));
  // GRID FINS — guidance
  const gf = group('gridfins', V3(8, 2.5, 0)); rocket.add(gf);
  for (let k = 0; k < 4; k++) { const h = new THREE.Group(); h.rotation.y = k * Math.PI / 2; const f = new THREE.Group(); f.position.set(Rr + .85, 21.2, 0);
    for (let i = 0; i <= 5; i++) f.add(mk(box(1.7, .07, .05), M.lattice, 0, 0, -.55 + i * .22)); for (let i = 0; i <= 6; i++) f.add(mk(box(.05, .07, 1.15), M.lattice, -.85 + i * .283, 0, 0));
    f.add(mk(box(.3, .18, .3), M.steel, -.95, 0, 0)); f.add(mk(cyl(.09, .09, .5, 12), M.dark, -1, 0, 0, Math.PI / 2)); f.add(mk(box(.22, .6, .32), M.dark, -1.05, -.3, 0)); h.add(f); gf.add(h); }
  // FUEL — conversion
  const fuel = group('fuel', V3(-8, -1.5, 0)); rocket.add(fuel);
  [.35, .62, 3.5, 3.9].forEach((a, i) => { const x = Math.cos(a) * (Rr + .12), z = Math.sin(a) * (Rr + .12); fuel.add(mk(cyl(.09, .09, 19, 12), M.steel, x, 12, z)); for (let y = 4; y < 21; y += 5.5) { fuel.add(mk(box(.3, .34, .3), M.dark, x, y + i, z)); fuel.add(mk(cyl(.13, .13, .12, 12), M.copper, x, y + i + .3, z)); } for (let y = 2.8; y < 21; y += 2.3) fuel.add(mk(box(.2, .12, .26), M.darker, x, y, z, 0, -a, 0)); });
  fuel.add(mk(box(.9, 1.4, .3), M.dark, Math.cos(.5) * Rr, 5.5, Math.sin(.5) * Rr, 0, -.5, 0));
  [[2.2, 9.5], [2.9, 15], [2.5, 19]].forEach(([a, y]) => { fuel.add(mk(new THREE.SphereGeometry(.42, 24, 16), M.steel, Math.cos(a) * (Rr + .3), y, Math.sin(a) * (Rr + .3))); fuel.add(mk(box(.2, .9, .5), M.dark, Math.cos(a) * (Rr + .05), y, Math.sin(a) * (Rr + .05), 0, -a, 0)); });
  [[7, .2, 1.4], [12.5, 3.3, 4.6], [17, .1, 1.2]].forEach(([y, a0, a1]) => fuel.add(mk(new THREE.TorusGeometry(Rr + .14, .05, 8, 48, a1 - a0), M.steel, 0, y, 0, Math.PI / 2, 0, a0)));
  // UPPER STAGE — managed experience
  const up = group('upper', V3(0, 3.5, 0)); rocket.add(up);
  up.add(mk(cyl(Rr, Rr, 2.2, 96), M.carbon, 0, 23.1, 0)); up.add(mk(cyl(Rr, Rr, 7.8, 96), M.paint, 0, 28.1, 0)); seams(up, 25, 31.5, 2.3, Rr); panelLines(up, 28.1, 7.6, Rr, 12);
  up.add(mk(box(.3, 7, .24), M.dark, -Rr - .08, 28, 0)); hatch(up, 1.2, 27, Rr, .4, .5); hatch(up, 4.4, 29.5, Rr, .4, .5);
  const vents = []; for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; vents.push([Math.cos(a) * (Rr + .02), 23.1, Math.sin(a) * (Rr + .02), 0, -a, 0]); } up.add(inst(box(.08, .9, .35), M.darker, vents));
  // FAIRING — 3D & motion
  const fair = group('fairing', V3(0, 9, 0), 0, 32, 0); rocket.add(fair);
  const prof = [[1.8, 0], [1.8, 2.2], [1.62, 3.8], [1.22, 5.4], [.72, 6.8], [.26, 7.8], [0, 8.1]].map(p => new THREE.Vector2(p[0], p[1]));
  fairA = new THREE.Group(); fairB = new THREE.Group();
  const fm = new THREE.MeshPhysicalMaterial({ color: 0xDADCDB, roughness: .55, metalness: .12, clearcoat: .5, clearcoatRoughness: .4, side: THREE.DoubleSide, roughnessMap: T.paint, bumpMap: T.paint, bumpScale: .01 });
  fairA.add(mk(new THREE.LatheGeometry(prof, 48, 0, Math.PI), fm)); fairB.add(mk(new THREE.LatheGeometry(prof, 48, Math.PI, Math.PI), fm));
  [fairA, fairB].forEach((h, i) => { const s = i ? -1 : 1; h.add(mk(box(.05, 7.6, .12), M.dark, 0, 3.9, s * 1.2, 0, 0, s * .22)); for (let y = .6; y < 6; y += 1.2) h.add(mk(box(.12, .2, .2), M.steel, 0, y, s * (1.72 - y * .17))); });
  fair.add(fairA, fairB); fair.add(mk(new THREE.TorusGeometry(Rr, .035, 8, 96), M.dark, 0, 2.2, 0, Math.PI / 2)); fair.add(mk(new THREE.TorusGeometry(Rr, .035, 8, 96), M.dark, 0, .05, 0, Math.PI / 2));
  // PAYLOAD — AI/automation
  const pay = group('payload', V3(0, 15, 0), 0, 32, 0); rocket.add(pay);
  pay.add(mk(cyl(.9, 1.4, .7, 32), M.dark, 0, .35, 0)); pay.add(mk(box(1.0, 1.7, 1.0), M.accent, 0, 1.6, 0));
  pay.add(mk(box(1.1, .08, 1.1), M.steel, 0, 2.5, 0)); pay.add(mk(box(1.1, .08, 1.1), M.steel, 0, .75, 0));
  [[.55, 1.6, 0], [-.55, 1.6, 0], [0, 1.6, .55], [0, 1.6, -.55]].forEach(([x, y, z]) => pay.add(mk(box(.14, 1.2, .14), M.steel, x, y, z)));
  // vapor + flame attached to vehicle
  const disc = softDisc();
  vapor = points(220, disc, 0xC9D3DA, 1.6, THREE.NormalBlending); rocket.add(vapor.pts);
  flame = points(quality === 'cinema' ? 900 : 450, disc, 0xFFB56A, 2.6, THREE.AdditiveBlending); rocket.add(flame.pts);
  flameCore = mk(new THREE.ConeGeometry(1.5, 10, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xFFE2B0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), 0, -6.5, 0, Math.PI); flameCore.castShadow = false; rocket.add(flameCore);
  engLight = new THREE.PointLight(0xFF9A4A, 0, 80, 1.6); engLight.position.set(0, -3, 0); rocket.add(engLight);
}
function points(n, tex, color, size, blending) {
  const pos = new Float32Array(n * 3), life = new Float32Array(n), vel = new Float32Array(n * 3);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ map: tex, color, size, transparent: true, opacity: 0, depthWrite: false, blending, sizeAttenuation: true });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.castShadow = false;
  return { pts, pos, vel, life, n, m, g };
}
function lightCone(from, to, r) { const d = from.distanceTo(to); const c = new THREE.Mesh(new THREE.ConeGeometry(r, d, 24, 1, true), M.cone); c.position.lerpVectors(from, to, .5); c.lookAt(to); c.rotateX(-Math.PI / 2); c.castShadow = c.receiveShadow = false; return c; }
function buildComplex() {
  scene.add(mk(new THREE.PlaneGeometry(1600, 1600), M.ground, 0, 0, 0, -Math.PI / 2));
  scene.add(mk(box(38, 2, 38), M.concrete, 0, 1, 0)); scene.add(mk(box(6.5, 2.2, 16), M.trench, 0, 1, 0));
  const joints = []; for (let i = -3; i <= 3; i++) { joints.push([i * 6, 2.01, 0, 0, 0, 0]); joints.push([0, 2.01, i * 6, 0, Math.PI / 2, 0]); } scene.add(inst(box(.08, .02, 38), M.trench, joints));
  scene.add(inst(box(.35, .015, 30), M.hazard, [[-18.5, 2.02, 0], [18.5, 2.02, 0], [0, 2.02, -18.5, 0, Math.PI / 2, 0], [0, 2.02, 18.5, 0, Math.PI / 2, 0]]));
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; scene.add(mk(box(.9, 1.8, .9), M.dark, Math.cos(a) * 2.6, 2.9, Math.sin(a) * 2.6)); scene.add(mk(box(1.3, .3, 1.3), M.steel, Math.cos(a) * 2.6, 2.1, Math.sin(a) * 2.6)); }
  scene.add(mk(new THREE.TorusGeometry(2.4, .16, 10, 64), M.steel, 0, 3.5, 0, Math.PI / 2));
  scene.add(mk(new THREE.TorusGeometry(4.6, .12, 10, 72), M.steel, 0, 2.3, 0, Math.PI / 2));
  const noz = []; for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; noz.push([Math.cos(a) * 4.6, 2.55, Math.sin(a) * 4.6, .6, -a, 0]); } scene.add(inst(cyl(.06, .1, .4, 8), M.copper, noz));
  // tower
  const tw = new THREE.Group(); tw.position.set(-8, 2, 0); scene.add(tw);
  [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]].forEach(([x, z]) => tw.add(mk(box(.42, 48, .42), M.lattice, x, 24, z)));
  const braces = [], steps = [];
  for (let y = 2; y <= 46; y += 4) { tw.add(mk(box(2.6, .26, .26), M.lattice, 0, y, -1.3)); tw.add(mk(box(2.6, .26, .26), M.lattice, 0, y, 1.3)); tw.add(mk(box(.26, .26, 2.6), M.lattice, -1.3, y, 0)); tw.add(mk(box(.26, .26, 2.6), M.lattice, 1.3, y, 0));
    braces.push([1.3, y + 2, 0, .55, 0, 0]); braces.push([-1.3, y + 2, 0, -.55, 0, 0]); braces.push([0, y + 2, -1.3, 0, 0, .55]); braces.push([0, y + 2, 1.3, 0, 0, -.55]);
    for (let s = 0; s < 8; s++) steps.push([-1.3 + (s % 2 ? .35 : -.35), y + s * .5, -1.0 + s * .28, 0, 0, 0]); }
  tw.add(inst(box(.12, 4.4, .12), M.lattice, braces)); tw.add(inst(box(.7, .06, .3), M.dark, steps));
  for (let y = 8; y <= 40; y += 8) { tw.add(mk(box(3.6, .14, 3.6), M.dark, 0, y, 0)); const rail = []; for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; rail.push([Math.cos(a) * 1.75, y + .55, Math.sin(a) * 1.75]); } tw.add(inst(box(.05, 1.1, .05), M.steel, rail)); tw.add(mk(new THREE.TorusGeometry(1.75, .03, 6, 32), M.steel, 0, y + 1.1, 0, Math.PI / 2)); }
  tw.add(mk(box(1.4, 46, 1.4), M.darker, -2.4, 23, 0)); tw.add(mk(box(.5, 46, .25), M.dark, 0, 23, -1.75));
  [9, 20.5, 31].forEach(y => { const p = new THREE.Group(); p.position.set(1.3, y, 0); p.add(mk(box(5.6, .55, .8), M.dark, 2.8, 0, 0)); p.add(mk(box(.5, .9, 1.2), M.steel, 5.5, 0, 0)); p.add(mk(cyl(.12, .12, 5.4, 12), M.steel, 2.8, -.5, .3, 0, 0, Math.PI / 2)); p.add(mk(cyl(.08, .08, 5.4, 10), M.copper, 2.8, -.5, -.3, 0, 0, Math.PI / 2)); p.add(mk(box(4.8, .08, .08), M.steel, 2.6, .9, 0, 0, 0, -.15)); p.add(mk(cyl(.2, .2, .9, 12), M.dark, .4, .5, 0)); tw.add(p); arms.push(p); });
  tw.add(mk(box(11, .6, .6), M.lattice, 4, 47.5, 0)); tw.add(mk(box(.6, .6, .6), M.dark, 9, 47.1, 0)); tw.add(mk(cyl(.02, .02, 12, 6), M.steel, 9, 41, 0)); tw.add(mk(box(.9, .5, .9), M.steel, 9, 35, 0));
  tw.add(mk(cyl(.1, .06, 8, 8), M.steel, 0, 52, 0)); tw.add(mk(box(2.8, .4, 2.8), M.dark, 0, 48.2, 0)); tw.add(mk(new THREE.SphereGeometry(.14, 8, 8), M.redLamp, 0, 56, 0)); beacons.push(tw.children[tw.children.length - 1]);
  [[-1.3, -1.3, 20], [1.3, 1.3, -24], [-1.3, 1.3, -20]].forEach(([x, z, dx]) => { const a = mk(cyl(.03, .03, 52, 6), M.steel, 0, 0, 0); a.position.set(x + dx * .5 - 8 + 8, 27, z + (dx > 0 ? 8 : -8)); a.lookAt(x, 54, z); a.rotateX(Math.PI / 2); tw.add(a); a.position.set(x + dx * .5, 26, z + (dx > 0 ? 10 : -10)); });
  // floodlight masts + volumetric cones
  [[17, 17], [-17, 17], [17, -17], [-19, -14]].forEach(([x, z], i) => {
    scene.add(mk(cyl(.16, .22, 17, 12), M.dark, x, 10.5, z)); scene.add(mk(box(1.4, .7, .9), M.dark, x, 19.2, z)); scene.add(mk(box(1.2, .4, .6), M.lamp, x * .97, 19.1, z * .97)); scene.add(mk(box(.5, .5, .5), M.dark, x, 2.3, z));
    scene.add(lightCone(V3(x * .96, 19, z * .96), V3(0, 16, 0), 5.5));
    if (i < (quality === 'cinema' ? 4 : 2)) { const sp = new THREE.SpotLight(0xFFF1DC, 900, 120, .42, .7, 1.4); sp.position.set(x, 19, z); sp.target.position.set(0, 16, 0); if (i === 0 && quality === 'cinema') { sp.castShadow = true; sp.shadow.mapSize.set(1024, 1024); } scene.add(sp, sp.target); spot.push(sp); }
  });
  [[24, 22], [-24, 22], [24, -22]].forEach(([x, z]) => { scene.add(mk(cyl(.14, .24, 60, 8), M.lattice, x, 30, z)); const b = mk(new THREE.SphereGeometry(.16, 8, 8), M.redLamp, x, 60.3, z); scene.add(b); beacons.push(b); });
  // ground plumbing, tank farm, buildings, fence, road
  for (let i = 0; i < 5; i++) { const z = -14 + i * 2.2; scene.add(mk(cyl(.24, .24, 22, 14), M.steel, 8, 2.35, z, 0, 0, Math.PI / 2)); if (i % 2 === 0) { scene.add(mk(new THREE.SphereGeometry(.5, 16, 12), M.dark, 8 + (i - 2) * 3, 2.5, z)); scene.add(mk(cyl(.06, .06, .8, 8), M.steel, 8 + (i - 2) * 3, 3.1, z)); scene.add(mk(new THREE.TorusGeometry(.3, .04, 6, 16), M.rust, 8 + (i - 2) * 3, 3.5, z)); } }
  const supports = []; for (let x = -2; x <= 18; x += 4) supports.push([x, 2.15, -12]); scene.add(inst(box(.2, .3, 10), M.dark, supports));
  for (let i = 0; i < 3; i++) scene.add(mk(cyl(.12, .12, 16, 10), M.dark, -4 + i * .5, 2.2, 6 + i * .6, 0, 0, Math.PI / 2));
  scene.add(mk(box(1.2, .25, 14), M.dark, 0, 2.12, 10));
  [[20, -12], [20, -18]].forEach(([x, z]) => { scene.add(mk(cyl(2.2, 2.2, 9, 48), M.paintDirty, x, 4.4, z, 0, 0, Math.PI / 2)); scene.add(mk(new THREE.SphereGeometry(2.2, 48, 24), M.paintDirty, x + 4.5, 4.4, z)); scene.add(mk(new THREE.SphereGeometry(2.2, 48, 24), M.paintDirty, x - 4.5, 4.4, z)); scene.add(mk(box(9, 2.2, 1), M.concrete, x, 1.1, z)); scene.add(mk(box(.6, .6, .6), M.dark, x, 6.8, z)); scene.add(mk(cyl(.08, .08, 3, 8), M.steel, x + 6.5, 4.4, z + 2.2)); scene.add(mk(new THREE.TorusGeometry(2.25, .06, 8, 48), M.dark, x + 2, 4.4, z, 0, Math.PI / 2, 0)); scene.add(mk(new THREE.TorusGeometry(2.25, .06, 8, 48), M.dark, x - 2, 4.4, z, 0, Math.PI / 2, 0)); });
  scene.add(mk(box(8, 4, 6), M.concrete, -22, 4, 12)); scene.add(mk(box(3, 6, 3), M.concrete, -18, 3, 20)); scene.add(mk(box(14, 5, 1.2), M.concrete, 0, 4.5, 16.5)); scene.add(mk(box(.4, 2, 3), M.dark, -22, 6.6, 15.2));
  scene.add(mk(box(8, .06, 220), M.trench, 40, .03, -60, 0, .5, 0));
  const fence = []; for (let k = 0; k < 64; k++) { const a = k / 64 * TAU; fence.push([Math.cos(a) * 30, 1.2, Math.sin(a) * 30]); } scene.add(inst(box(.1, 2.4, .1), M.dark, fence)); scene.add(mk(new THREE.TorusGeometry(30, .02, 4, 128), M.steel, 0, 2.3, 0, Math.PI / 2));
  const rl = []; for (let i = 0; i < 24; i++) rl.push([40 + Math.sin(.5) * i * 9 * 0 + i * 4.3, .4, -60 - i * 7.9]); scene.add(inst(new THREE.SphereGeometry(.15, 6, 6), M.lamp, rl));
  scene.add(mk(box(3.2, 1.6, 7), M.paintDirty, 14, 2.9, 12)); scene.add(mk(box(3, 1.2, 2.2), M.dark, 14, 3.2, 8)); scene.add(mk(box(2.6, 1.4, 5.5), M.rust, -12, 2.8, -16));
  [[-160, -200, 70, 26], [-40, -260, 90, 34], [110, -220, 80, 22], [220, -140, 60, 18], [-240, -80, 70, 24], [180, 120, 90, 20], [-120, 220, 80, 24], [60, 280, 120, 30]].forEach(([x, z, r, h]) => scene.add(mk(new THREE.ConeGeometry(r, h, 9), M.rock, x, h / 2 - 1, z)));
  // sky
  const mkStars = (n, size) => { const sp = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const v = V3(rnd() - .5, rnd() - .3, rnd() - .5).normalize().multiplyScalar(900); sp.set([v.x, v.y, v.z], i * 3); } const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); const p = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xDDE6F0, size, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: false })); p.frustumCulled = false; scene.add(p); return p; };
  stars = mkStars(3200, 1.4); stars2 = mkStars(600, 2.8);
  earth = new THREE.Mesh(new THREE.SphereGeometry(150, 96, 64), new THREE.MeshStandardMaterial({ map: earthTex(), roughness: .85, emissive: 0x08203F, emissiveIntensity: .35, transparent: true, opacity: 0 })); earth.visible = false; scene.add(earth);
  clouds = new THREE.Mesh(new THREE.SphereGeometry(152.5, 96, 64), new THREE.MeshStandardMaterial({ map: cloudTex(), transparent: true, opacity: 0, depthWrite: false, roughness: 1 })); clouds.visible = false; scene.add(clouds);
  atmo = new THREE.Mesh(new THREE.SphereGeometry(158, 64, 48), new THREE.MeshBasicMaterial({ color: 0x35D6F0, transparent: true, opacity: 0, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false })); atmo.visible = false; scene.add(atmo);
  moon = new THREE.Mesh(new THREE.SphereGeometry(110, 64, 40), new THREE.MeshStandardMaterial({ map: moonTex(), roughness: 1, metalness: 0, transparent: true, opacity: 0 })); moon.visible = false; scene.add(moon);
  smoke = points(quality === 'cinema' ? 1600 : 800, softDisc(), 0x9EA3A6, 7, THREE.NormalBlending); scene.add(smoke.pts);
}
function buildLights() {
  keyL = new THREE.DirectionalLight(0xB9C8D8, 1.5); keyL.position.set(-50, 70, 40); keyL.castShadow = true; keyL.shadow.mapSize.set(quality === 'cinema' ? 4096 : 2048, quality === 'cinema' ? 4096 : 2048);
  const c = keyL.shadow.camera; c.left = c.bottom = -45; c.right = c.top = 45; c.far = 220; keyL.shadow.bias = -.0006; keyL.shadow.normalBias = .02; scene.add(keyL);
  scene.add(new THREE.HemisphereLight(0x25313B, 0x050606, .55));
  rimL = new THREE.PointLight(0x35D6F0, 40, 60, 1.8); rimL.position.set(6, 30, -8); scene.add(rimL);
  const sodium = new THREE.PointLight(0xFFB36B, 30, 40, 1.8); sodium.position.set(-14, 6, 8); scene.add(sodium);
  const sun = new THREE.DirectionalLight(0xFFF6E8, 0); sun.position.set(200, 120, -100); scene.add(sun); buildLights.sun = sun;
}

const PROBLEM = ['body', 'engines', 'gridfins', 'fuel', 'fairing'], SOLUTION = ['body', 'fairing', 'engines', 'fuel', 'gridfins', 'payload', 'upper'];
const SIB = { fairing: ['fairing', 'payload', 'upper'] };
function pose(now) {
  const { sec, local: t } = S, T = { pos: V3(), tgt: V3(), fov: 36, alt: 0, thrust: 0, tilt: 0, bg: '#070809', fogFar: 220, stars: 0, earth: 0, arms: 0, open: 0, payY: 0, shake: 0, lunar: 0, drift: 0, ex: {} };
  for (const n in parts) T.ex[n] = 0;
  if (S.launched) {
    const L = (now - S.launchAt) / 1000;
    T.open = L < 1.5 ? sm(L / 1.5) : L < 3 ? 1 : 1 - sm((L - 3) / 1.5); T.payY = 10 * (1 - sm((L - 1) / 2)); T.thrust = sm((L - 4.5) / 1.5); T.arms = sm((L - 4) / 1.5);
    T.alt = L > 6 ? 520 * Math.pow(sm((L - 6) / 7), 1.7) : 0; T.shake = T.thrust * .35 * (T.alt < 300 ? 1 : 0);
    if (L < 4.5) { T.pos.set(12, 38, 16); T.tgt.set(0, 35, 0); T.fov = 34; } else { T.pos.set(34, 12, 52); T.tgt.set(0, 14 + T.alt * .8, 0); T.fov = 38; }
    return T;
  }
  switch (sec) {
    case 0: { const p = sm(t), e = S.enter === undefined ? 1 : S.enter, pre = 1 - e; T.pos.lerpVectors(V3(2.4, 4.4, 3.8), V3(46, 22, 58), p); T.pos.add(V3(-.9, .6, -1.1).multiplyScalar(pre)); T.tgt.lerpVectors(V3(.2, 4, 0), V3(0, 22, 0), p); T.fov = lerp(44, 34, p) + 26 * pre; break; }
    case 1: { const a = -.6 + t * 2.4, r = 30 - 6 * t; T.pos.set(Math.sin(a) * r, 12 + 12 * t, Math.cos(a) * r); T.tgt.set(0, 18, 0);
      PROBLEM.forEach((n, i) => { const f = sm(t * 5 - i); (SIB[n] || [n]).forEach(k => T.ex[k] = f); }); break; }
    case 2: { const a = 1.8 + t * 1.4, r = 34 - 8 * t; T.pos.set(Math.sin(a) * r, 26 - 8 * t, Math.cos(a) * r); T.tgt.set(0, 20, 0);
      SOLUTION.forEach((n, j) => T.ex[n] = 1 - sm(t * 7 - j)); break; }
    case 3: { T.pos.set(10 + 30 * t, 22 + 10 * t, 60 + 70 * t); T.tgt.set(0, 20, 0); T.arms = sm((t - .6) / .3); break; }
    case 4: { T.arms = 1; T.thrust = sm((t - .45) / .35); T.alt = 30 * sm((t - .8) / .2); T.shake = T.thrust * .3;
      if (t < .5) { T.pos.lerpVectors(V3(8, 4.5, 10), V3(9.5, 5, 12.5), t * 2); T.tgt.set(0, 3.5, 0); T.fov = 40; }
      else { T.pos.set(38, 8, 60); T.tgt.set(0, 12 + T.alt * .6, 0); T.fov = 36; } break; }
    case 5: { T.arms = 1; T.thrust = 1; T.alt = 30 + 800 * sm(t); T.tilt = -.55 * t; T.pos.set(14 + 6 * t, T.alt + 16, 30); T.tgt.set(-4 * t, T.alt + 14, 0);
      T.bg = t < .45 ? lerpHex('#070809', '#0B1B33', t / .45) : lerpHex('#0B1B33', '#02040A', (t - .45) / .55); T.fogFar = 220 + 3000 * t; T.stars = sm((t - .55) / .35); T.earth = sm((t - .6) / .3); T.shake = .12 * (1 - t); break; }
    case 6: { // trans-lunar coast: short burn, then Earth falls away and the Moon rises
      const alt = 830, p = sm(t); T.alt = alt; T.tilt = -1.35; T.arms = 1; T.lunar = p; T.thrust = .45 * sm(1 - t * 2.2);
      const a = .6 + t * .5, r = 44 + 14 * p; T.pos.set(Math.sin(a) * r, alt + 6 - 10 * p, Math.cos(a) * r); T.tgt.set(-6 * p, alt + 1 + 12 * p, -30 * p); T.bg = '#02040A'; T.fogFar = 5000; T.stars = 1; T.earth = 1; T.fov = lerp(34, 38, p); break; }
    default: { // lunar hold through mission select / payload / configurator; sec 10 adds friction and drift
      const alt = 830, late = sec >= 10, a = 1.0 + (sec - 7) * .1 + t * .1, r = sec >= 9 ? 56 : 50; T.alt = alt; T.tilt = -1.35; T.arms = 1; T.lunar = 1; T.drift = late ? 1 : 0;
      T.pos.set(Math.sin(a) * r, alt + 2, Math.cos(a) * r); T.tgt.set(sec >= 9 ? -8 : -4, alt + 6, -22); T.bg = '#02040A'; T.fogFar = 5000; T.stars = 1; T.earth = 1; T.fov = 38; }
  }
  return T;
}
function lerpHex(a, b, t) { return '#' + new THREE.Color(a).lerp(new THREE.Color(b), clamp(t)).getHexString(); }

function tick(now) {
  if (!rocket || !fairA) return;
  if (quality === 'standard' && now - tPrev < 31) return;
  const dt = Math.min(.05, (now - tPrev) / 1000); tPrev = now; frames++; if (now - tF > 500) { fps = Math.round(frames * 1000 / (now - tF)); frames = 0; tF = now;
    const pr = R.getPixelRatio(); if (fps < 40 && pr > .8) R.setPixelRatio(Math.max(.8, pr - .25)); else if (fps > 56 && pr < prMax) R.setPixelRatio(Math.min(prMax, pr + .1)); }
  const T = pose(now); A.drift = lerp(A.drift, T.drift, 1 - Math.pow(.01, dt));
  const k = 1 - Math.pow(lerp(.002, .12, A.drift), dt), kq = 1 - Math.pow(.0003, dt), kl = 1 - Math.pow(.02, dt);
  A.lunar = lerp(A.lunar, T.lunar, kl);
  A.pos.lerp(T.pos, k); A.tgt.lerp(T.tgt, k); A.fov = lerp(A.fov, T.fov, k); A.alt = lerp(A.alt, T.alt, kq); A.thrust = lerp(A.thrust, T.thrust, k); A.tilt = lerp(A.tilt, T.tilt, k);
  A.bg.lerp(new THREE.Color(T.bg), k); A.fogFar = lerp(A.fogFar, T.fogFar, k); A.stars = lerp(A.stars, T.stars, k); A.earth = lerp(A.earth, T.earth, k); A.arms = lerp(A.arms, T.arms, k); A.open = lerp(A.open, T.open, k); A.payY = lerp(A.payY, T.payY, k); A.shake = T.shake;
  for (const n in parts) { const g = parts[n]; g.userData.f = lerp(g.userData.f, T.ex[n], k); g.position.copy(g.userData.home).addScaledVector(g.userData.explode, g.userData.f); g.rotation.y = g.userData.f * (n === 'gridfins' ? -.5 : n === 'fuel' ? .4 : 0); }
  fairA.position.x = -A.open * 3.4; fairA.rotation.z = A.open * .5; fairB.position.x = A.open * 3.4; fairB.rotation.z = -A.open * .5;
  parts.payload.position.y += A.payY;
  arms.forEach(p => p.rotation.y = -A.arms * 1.25);
  rocket.position.y = 3.6 + A.alt; rocket.rotation.z = A.tilt;
  const dr = A.drift * .5; rocket.rotation.x = Math.sin(now / 9000) * .05 * dr; rocket.position.x = Math.sin(now / 7000) * 1.2 * dr; rocket.position.y += Math.cos(now / 8000) * .9 * dr;
  scene.background.copy(A.bg); scene.fog.color.copy(A.bg); scene.fog.far = A.fogFar;
  stars.material.opacity = A.stars; stars2.material.opacity = A.stars * .9; earth.visible = atmo.visible = clouds.visible = A.earth > .01; earth.material.opacity = A.earth; clouds.material.opacity = .9 * A.earth; atmo.material.opacity = .16 * A.earth;
  const ry = 3.6 + A.alt, L = A.lunar, es = 1 - .82 * L;
  earth.position.set(70 + 260 * L, ry - 235 - 320 * L, -170 - 900 * L); atmo.position.copy(earth.position); clouds.position.copy(earth.position); earth.scale.setScalar(es); clouds.scale.setScalar(es); atmo.scale.setScalar(es); earth.rotation.y += dt * .004; clouds.rotation.y += dt * .006;
  moon.visible = L > .01; moon.material.opacity = A.earth * clamp(L * 3); const ms = .35 + .65 * L; moon.scale.setScalar(ms); moon.position.set(-60 + 30 * L, ry + 30 - 120 * L, -700 + 470 * L); moon.rotation.y += dt * .002;
  buildLights.sun.intensity = 2.2 * A.earth; M.cone.opacity = .045 * (1 - A.earth);
  rimL.position.set(6, rocket.position.y + 26, -8); rimL.intensity = 40 * (1 - .6 * A.earth);
  const blink = (Math.sin(now / 600) > .6) ? 1 : .15; beacons.forEach(b => b.material.opacity = blink); M.redLamp.transparent = true; M.redLamp.opacity = blink;
  const sh = A.shake * .35, mx = S.mouse[0] * .5, my = S.mouse[1] * .3;
  cam.position.set(A.pos.x + (Math.random() - .5) * sh + mx, A.pos.y + (Math.random() - .5) * sh - my, A.pos.z + (Math.random() - .5) * sh);
  cam.lookAt(A.tgt); cam.fov = A.fov; cam.updateProjectionMatrix();
  const th = A.thrust, flick = .85 + Math.random() * .3;
  flameCore.material.opacity = .8 * th * flick; flameCore.scale.set(1 + .1 * Math.random(), .6 + th * flick, 1 + .1 * Math.random()); flameCore.position.y = -1.5 - 5 * flameCore.scale.y;
  engLight.intensity = 260 * th * flick;
  updateFlame(dt, th); updateSmoke(dt, th); updateVapor(dt, th);
  R.render(scene, cam);
  if (!first) { first = true; onFirst && onFirst(); }
}
function updateFlame(dt, th) {
  const { pos, vel, life, n, m } = flame; m.opacity = th;
  for (let i = 0; i < n; i++) { const j = i * 3;
    if (life[i] <= 0) { if (th < .05) continue; const a = Math.random() * TAU, r = Math.random() * 1.3; pos[j] = Math.cos(a) * r; pos[j + 1] = -1.4; pos[j + 2] = Math.sin(a) * r; vel[j] = Math.cos(a) * (2 + Math.random() * 3); vel[j + 1] = -(40 + Math.random() * 35); vel[j + 2] = Math.sin(a) * (2 + Math.random() * 3); life[i] = .15 + Math.random() * .25; }
    else { pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt; life[i] -= dt; } }
  flame.g.attributes.position.needsUpdate = true;
}
function updateSmoke(dt, th) {
  const { pos, vel, life, n, m } = smoke; m.opacity = .55 * clamp(th * 1.5) * clamp(1 - A.alt / 160) * (S.sec <= 5 || S.launched ? 1 : 0);
  for (let i = 0; i < n; i++) { const j = i * 3;
    if (life[i] <= 0) { if (th < .1 || A.alt > 120) continue; const a = Math.random() * TAU, s = 8 + Math.random() * 18; pos[j] = Math.cos(a) * 3; pos[j + 1] = 2.2 + Math.random(); pos[j + 2] = Math.sin(a) * 3; vel[j] = Math.cos(a) * s; vel[j + 1] = 1 + Math.random() * 4; vel[j + 2] = Math.sin(a) * s; life[i] = 2 + Math.random() * 3; }
    else { vel[j] *= .985; vel[j + 2] *= .985; vel[j + 1] += dt * 1.2; pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt; life[i] -= dt; } }
  smoke.g.attributes.position.needsUpdate = true;
}
function updateVapor(dt, th) {
  const { pos, vel, life, n, m } = vapor; m.opacity = .32 * (1 - th) * clamp(1 - A.alt / 5) * (S.sec <= 4 || S.launched ? 1 : 0);
  for (let i = 0; i < n; i++) { const j = i * 3;
    if (life[i] <= 0) { const a = Math.random() * TAU, lox = Math.random() < .6; pos[j] = Math.cos(a) * 1.9; pos[j + 1] = lox ? 4.5 + Math.random() * 4 : 3 + Math.random() * 27; pos[j + 2] = Math.sin(a) * 1.9; vel[j] = Math.cos(a) * .6; vel[j + 1] = -.6 - Math.random(); vel[j + 2] = Math.sin(a) * .6; life[i] = 1.5 + Math.random() * 2; }
    else { pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt; life[i] -= dt; } }
  vapor.g.attributes.position.needsUpdate = true;
}

window.AlephRocket = {
  init(canvas, opts = {}) {
    quality = opts.quality || 'standard'; onFirst = opts.onFirstFrame || null;
    R = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    prMax = Math.min(devicePixelRatio, quality === 'cinema' ? 1.5 : 1.1); R.setPixelRatio(prMax); R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
    R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.1;
    scene = new THREE.Scene(); scene.background = new THREE.Color('#070809'); scene.fog = new THREE.Fog(0x070809, 30, 220);
    cam = new THREE.PerspectiveCamera(42, 1, .1, 4000);
    buildLights(); buildRocket(); buildComplex();
    const resize = () => { const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight; R.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
    resize(); addEventListener('resize', resize);
    if (quality === 'cinema') addEventListener('pointermove', e => { S.mouse = [e.clientX / innerWidth * 2 - 1, e.clientY / innerHeight * 2 - 1]; }, { passive: true });
    let logged = 0; R.setAnimationLoop(now => { try { tick(now); } catch (e) { if (logged++ < 3) console.warn('AlephRocket tick: ' + (e && e.stack || e)); } });
  },
  set(o) { Object.assign(S, o); },
  setAccent(hex) { const c = new THREE.Color(hex); M.accent.emissive.copy(c); if (rimL) rimL.color.copy(c); if (atmo) atmo.material.color.copy(c); },
  launch() { S.launched = true; S.launchAt = performance.now(); },
  reset() { S.launched = false; },
  stats() { return { fps, alt: A.alt, thrust: A.thrust, draws: R ? R.info.render.calls : 0, quality }; }
};
