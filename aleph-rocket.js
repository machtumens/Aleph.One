import * as THREE from './vendor/three.module.min.js';
// The launch, end to end: an orbital-class rocket on a night pad, ignition, staging, and a coast to the Moon.
// Vehicle and pad are procedural. Moon and Earth use NASA maps baked into assets/space (public domain:
// LRO LROC colour + LOLA elevation, Blue Marble, Black Marble).
// Every vehicle part is a named group with a `home` position and an `explode` vector; sections 01-02 pull it apart.
// Framing is phone-first: poses are composed for a tall screen, and setViewOffset slides the subject clear of the UI
// (up on a phone, right on a laptop).

const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v)), sm = t => { t = clamp(t); return t * t * (3 - 2 * t); };
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), TAU = Math.PI * 2;
const rnd = (() => { let s = 1337; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();

// Vehicle in metres; y = 0 is the base of the first-stage engine section.
const R = 1.85, RF = 2.6, BASE = 6.5, PIV = 26, Y1 = 30, YI = 34.5, Y2 = 41;
const RE = 3000, RM = 800, ALT1 = 1340;
const EDIR = V3(.12, -1, -.42).normalize();                         // from the upper stage towards Earth's centre
const UP = V3(0, 1, 0), MDIR = V3(-.62, .34, -.7).normalize();       // from the upper stage towards the Moon
const MSIDE = V3().crossVectors(MDIR, UP).normalize(), MUP = V3().crossVectors(MSIDE, MDIR);   // screen right / up when looking at the Moon
const SUN_ASC = V3(.4, .17, -.9).normalize(), SUN_LUN = V3().addScaledVector(MSIDE, .9).addScaledVector(MUP, .25).addScaledVector(MDIR, -.25).normalize();
// tilt/yaw that point the vehicle's nose along n (rotation order: tilt about z, then yaw about y)
const aim = n => { const h = Math.sqrt(Math.max(1e-6, 1 - n.y * n.y)); return { tilt: -Math.acos(clamp(n.y, -1, 1)), yaw: Math.atan2(-n.z / h, n.x / h) }; };
const LUN = aim(V3().addScaledVector(MDIR, .35).addScaledVector(MUP, .55).addScaledVector(MSIDE, -.6).normalize());
const LUN_CAM = V3().addScaledVector(MDIR, -54).addScaledVector(MUP, 11).addScaledVector(MSIDE, -2);
const JKT = (() => { const lon = 106.8, lat = -6.2, p = (lon + 180) / 360 * TAU, t = (90 - lat) * Math.PI / 180; return V3(-Math.cos(p) * Math.sin(t), Math.cos(t), Math.sin(p) * Math.sin(t)); })();

let gl, scene, cam, rocket, stack, s1, fairA, fairB, plume, vplume, flameL, padKey, sunL, hemi, rimL, sky, stars, earth, atmo, moon, sun, complex, smoke, vapor, envPad, envSpace, loop, canvasEl;
let quality = 'standard', CINEMA = false, PPM = 34, ANISO = 4, onFirst = null, first = false;
const parts = {}, arms = [], fins = [], wings = [], glows = [], beacons = [], beams = [], spots = [], M = {}, MARK = { img: new Image(), ok: false };
const S = { sec: 0, local: 0, enter: 1, launched: false, launchAt: 0, snap: false, mouse: [0, 0] };
const KEYS = ['fov', 'alt', 'tilt', 'yaw', 'thrust', 'arms', 'open', 'payY', 'sep', 'fsep', 'mvac', 'vac', 'space', 'egap', 'efade', 'lunar', 'deploy', 'drift', 'vapor', 'fx', 'fy'];
const A = { pos: V3(11, 2.2, 15), tgt: V3(0, 28, 0) }; KEYS.forEach(k => A[k] = 0); A.fov = 70; A.vapor = 1; A.egap = 300;
let prMax = 1, fps = 0, frames = 0, tF = 0, tPrev = performance.now(), buzzed = false;
const _o = new THREE.Object3D(), _v = V3(), _w = V3(), focus = V3(), flamePos = V3();

// ---------- canvas textures ----------
function cv(w, h) { const c = document.createElement('canvas'); c.width = Math.max(2, Math.round(w)); c.height = Math.max(2, Math.round(h)); return [c, c.getContext('2d')]; }
function tx(c, srgb, wrap = true) { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = ANISO; return t; }
function grain(x, amp, mask = [1, 1, 1]) { const { width: w, height: h } = x.canvas, img = x.getImageData(0, 0, w, h), d = img.data; for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - .5) * amp; d[i] += n * mask[0]; d[i + 1] += n * mask[1]; d[i + 2] += n * mask[2]; } x.putImageData(img, 0, 0); }
function blobs(x, n, W, H, rx, ry, fill, y0 = 0, y1 = H) { for (let i = 0; i < n; i++) { x.fillStyle = fill(); x.beginPath(); x.ellipse(rnd() * W, y0 + rnd() * (y1 - y0), (.3 + rnd()) * rx, (.3 + rnd()) * ry, rnd() * .3, 0, TAU); x.fill(); } }

// A painted skin with square pixels: colour map plus a data map (R = bump height, G = roughness).
// u runs around the body from +Z towards +X, so u ~ .13 faces the hero camera.
function skin(o) {
  const p = PPM, W = o.circ * p, H = o.len * p, [c, x] = cv(W, H), [d, y] = cv(W, H), at = m => H - m * p, K = { x, y, W, H, p, at };
  x.fillStyle = o.base; x.fillRect(0, 0, W, H); y.fillStyle = `rgb(128,${o.rough * 255 | 0},0)`; y.fillRect(0, 0, W, H);
  blobs(x, 70, W, H, 1.6 * p, 3.5 * p, () => `rgba(${rnd() < .5 ? '0,0,0' : '255,255,255'},${.012 + rnd() * .022})`);
  blobs(y, 50, W, H, 1.2 * p, 2 * p, () => `rgba(128,${rnd() < .5 ? 60 : 200},0,${.1 + rnd() * .15})`);
  for (let i = 0; i < (o.streaks || 0); i++) { const sx = rnd() * W, sy = rnd() * H, l = (1 + rnd() * 7) * p, g = x.createLinearGradient(0, sy, 0, sy + l); g.addColorStop(0, 'rgba(70,64,56,0)'); g.addColorStop(.25, `rgba(70,64,56,${.04 + rnd() * .07})`); g.addColorStop(1, 'rgba(70,64,56,0)'); x.fillStyle = g; x.fillRect(sx, sy, .5 + rnd() * 2, l); }
  (o.seams || []).forEach(m => { const s = at(m); x.fillStyle = 'rgba(60,64,68,.5)'; x.fillRect(0, s - 1, W, 1.6); x.fillStyle = 'rgba(255,255,255,.3)'; x.fillRect(0, s + .6, W, 1); y.fillStyle = 'rgb(40,150,0)'; y.fillRect(0, s - 1.5, W, 3); });
  (o.vlines || []).forEach(u => { x.fillStyle = 'rgba(30,32,34,.65)'; x.fillRect(u * W - 1.2, 0, 2.4, H); y.fillStyle = 'rgb(20,150,0)'; y.fillRect(u * W - 2, 0, 4, H); });
  if (o.decals) o.decals(K);
  if (o.frost) { const [a, b] = o.frost.map(at); blobs(x, 110, W, H, 1.2 * p, .7 * p, () => `rgba(238,245,250,${.18 + rnd() * .25})`, b, a); blobs(y, 110, W, H, 1.2 * p, .7 * p, () => 'rgba(150,250,0,.5)', b, a); }
  if (o.soot) {
    const top = at(o.soot), g = x.createLinearGradient(0, H, 0, top); g.addColorStop(0, 'rgba(16,13,10,.96)'); g.addColorStop(.35, 'rgba(32,26,20,.6)'); g.addColorStop(1, 'rgba(50,42,34,0)'); x.fillStyle = g; x.fillRect(0, top, W, H - top);
    for (let i = 0; i < W * 1.2; i++) { const l = o.soot * p * (.3 + rnd() * 1.4); x.fillStyle = `rgba(22,18,14,${.04 + rnd() * .12})`; x.fillRect(rnd() * W, H - l, .6 + rnd() * 3, l); }
    const r = y.createLinearGradient(0, H, 0, top); r.addColorStop(0, 'rgba(128,220,0,1)'); r.addColorStop(1, 'rgba(128,220,0,0)'); y.fillStyle = r; y.fillRect(0, top, W, H - top);
  }
  grain(x, 7); grain(y, 16, [1, 1, 0]);
  return { map: tx(c, true), data: tx(d, false) };
}
function words(K, text, u, m, size, color, vertical, weight = 600) { const { x, W, p, at } = K; x.save(); x.translate(u * W, at(m)); if (vertical) x.rotate(-Math.PI / 2); x.fillStyle = color; x.font = `${weight} ${size * p}px Archivo, "Instrument Sans", sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 0, 0); x.restore(); }
function mark(K, u, m, hM, color) { if (!MARK.ok) return; const { x, W, p, at } = K, h = hM * p, w = h * MARK.img.width / MARK.img.height, [c, k] = cv(w, h); k.drawImage(MARK.img, 0, 0, c.width, c.height); k.globalCompositeOperation = 'source-in'; k.fillStyle = color; k.fillRect(0, 0, c.width, c.height); x.drawImage(c, u * W - w / 2, at(m) - h / 2, w, h); }
function flag(K, u, m, wM) { const { x, W, p, at } = K, w = wM * p, h = w * 2 / 3, x0 = u * W - w / 2, y0 = at(m) - h / 2; x.fillStyle = '#C8102E'; x.fillRect(x0, y0, w, h / 2); x.fillStyle = '#F4F4F2'; x.fillRect(x0, y0 + h / 2, w, h / 2); x.strokeStyle = 'rgba(0,0,0,.25)'; x.lineWidth = 1; x.strokeRect(x0, y0, w, h); }
function skins() {
  const circ = TAU * R;
  return {
    s1: skin({ circ, len: Y1, base: '#E8EAEB', rough: .36, streaks: 160, seams: [2.2, 5.1, 8, 10.9, 13.8, 16.7, 18.2, 21.1, 24, 26.9, 29.6], soot: 10.5, frost: [19, 29.2],
      decals: K => { words(K, 'ALEPH ONE', .13, 16.4, 2.7, '#0C0D0E', true); mark(K, .13, 27.4, 1.7, '#0C0D0E'); flag(K, .13, 25.1, 1.25); words(K, 'LV-01 · B1007', .3, 11.6, .3, '#2A2C2E', false, 500); words(K, 'NO STEP', .62, 28.4, .22, '#B4302A', false, 600); } }),
    inter: skin({ circ, len: YI - Y1, base: '#151618', rough: .48, streaks: 30, seams: [.4, 4.1], decals: K => { mark(K, .13, 2.5, 1.4, '#E9EBEC'); words(K, 'aleph.one', .3, 2.4, .7, '#E9EBEC', false); } }),
    s2: skin({ circ, len: Y2 - YI, base: '#E9EBEC', rough: .34, streaks: 50, seams: [.3, 2.6, 4.4, 6.3], frost: [3.2, 6.1], decals: K => { words(K, 'ALEPH ONE', .13, 2.3, .5, '#0C0D0E', false); words(K, 'S2 · LV-01', .62, 1.4, .25, '#2A2C2E', false, 500); } }),
    fair: skin({ circ: Math.PI * RF, len: 12.6, base: '#ECEEEF', rough: .32, streaks: 60, seams: [1.5], vlines: [.004, .996],
      decals: K => { mark(K, .3, 7.1, 2.8, '#0C0D0E'); words(K, 'aleph.one', .3, 4.6, .85, '#0C0D0E', false); words(K, 'CREATIVE TECHNOLOGY · JAKARTA', .3, 3.8, .2, '#3A3C3E', false, 500); } })
  };
}
function lineTex(w, h, draw, srgb = true) { const [c, x] = cv(w, h); draw(x, w, h); return tx(c, srgb); }
function puffTex() { // a cauliflower cloud: overlapping soft lobes, lit from above
  const [c, x] = cv(128, 128);
  for (let i = 0; i < 70; i++) { const a = rnd() * TAU, d = Math.sqrt(rnd()) * 30, cx = 64 + Math.cos(a) * d, cy = 66 + Math.sin(a) * d * .85, r = 10 + rnd() * 24, g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, 'rgba(255,255,255,.22)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); }
  x.globalCompositeOperation = 'source-atop'; const s = x.createLinearGradient(0, 20, 0, 110); s.addColorStop(0, '#ffffff'); s.addColorStop(1, '#5d5f62'); x.fillStyle = s; x.fillRect(0, 0, 128, 128);
  return tx(c, false, false);
}
function glowTex(streaks = 0) {
  const [c, x] = cv(256, 256), g = x.createRadialGradient(128, 128, 0, 128, 128, 128); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.08, 'rgba(255,250,240,.85)'); g.addColorStop(.25, 'rgba(255,235,210,.22)'); g.addColorStop(1, 'rgba(255,230,200,0)'); x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < streaks; i++) { x.save(); x.translate(128, 128); x.rotate(i / streaks * Math.PI + .3); const l = x.createLinearGradient(-128, 0, 128, 0); l.addColorStop(0, 'rgba(255,255,255,0)'); l.addColorStop(.5, 'rgba(255,255,255,.5)'); l.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = l; x.fillRect(-128, -.8, 256, 1.6); x.restore(); }
  return tx(c, true, false);
}

// ---------- geometry batching: static parts become one draw call per material ----------
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
function batch() {
  const by = new Map();
  return {
    add(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) {
      _m4.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _w.set(s, s, s));
      const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(_m4); if (!by.has(mat)) by.set(mat, []); by.get(mat).push(g); return this;
    },
    into(parent, cast = true) { by.forEach((list, mat) => { const m = new THREE.Mesh(merge(list), mat); m.castShadow = cast; m.receiveShadow = true; parent.add(m); }); by.clear(); return parent; }
  };
}
function merge(list) {
  const out = new THREE.BufferGeometry();
  [['position', 3], ['normal', 3], ['uv', 2]].forEach(([k, n]) => { const a = list.map(g => g.attributes[k].array), arr = new Float32Array(a.reduce((t, x) => t + x.length, 0)); let o = 0; a.forEach(x => { arr.set(x, o); o += x.length; }); out.setAttribute(k, new THREE.BufferAttribute(arr, n)); });
  out.computeBoundingSphere(); return out;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d), cyl = (r1, r2, h, s = 24, open = false) => new THREE.CylinderGeometry(r1, r2, h, s, 1, open);
function mesh(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = m.receiveShadow = true; return m; }
function group(name, explode, parent) { const g = new THREE.Group(); g.name = name; g.userData = { home: V3(), explode, f: 0 }; parts[name] = g; parent.add(g); return g; }
// Lathe profile resampled by arc length, so a texture's v runs at constant metres along the surface.
function lathe(pts, n, segs, phi0 = 0, phiL = TAU) {
  const d = [0]; for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const out = [], L = d[d.length - 1]; for (let k = 0, j = 0; k < n; k++) { const s = k / (n - 1) * L; while (j < d.length - 2 && d[j + 1] < s) j++; const t = (s - d[j]) / Math.max(1e-6, d[j + 1] - d[j]); out.push(new THREE.Vector2(lerp(pts[j][0], pts[j + 1][0], t), lerp(pts[j][1], pts[j + 1][1], t))); }
  return new THREE.LatheGeometry(out, segs, phi0, phiL);
}

// ---------- materials ----------
function materials() {
  const std = (color, roughness, metalness, o = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...o });
  const grime = lineTex(256, 256, (x, w, h) => { x.fillStyle = 'rgb(128,128,0)'; x.fillRect(0, 0, w, h); blobs(x, 120, w, h, 30, 30, () => `rgba(128,${rnd() < .5 ? 60 : 210},0,${.08 + rnd() * .12})`); grain(x, 40, [1, 1, 0]); }, false);
  const conc = lineTex(512, 512, (x, w, h) => { x.fillStyle = '#7A7C7E'; x.fillRect(0, 0, w, h); blobs(x, 260, w, h, 26, 26, () => `rgba(${rnd() < .6 ? '20,20,20' : '160,160,160'},${.04 + rnd() * .1})`); x.strokeStyle = 'rgba(0,0,0,.5)'; x.lineWidth = 2; for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * w / 4, 0); x.lineTo(i * w / 4, h); x.stroke(); x.beginPath(); x.moveTo(0, i * h / 4); x.lineTo(w, i * h / 4); x.stroke(); } grain(x, 30); });
  const wet = lineTex(512, 512, (x, w, h) => { x.fillStyle = 'rgb(128,235,0)'; x.fillRect(0, 0, w, h); blobs(x, 40, w, h, 70, 50, () => `rgba(128,${40 + rnd() * 60 | 0},0,.55)`); grain(x, 30, [1, 1, 0]); }, false);
  conc.repeat.set(10, 10); wet.repeat.set(3, 3);
  const bell = lineTex(64, 256, (x, w, h) => { const g = x.createLinearGradient(0, h, 0, 0); g.addColorStop(0, '#7A6250'); g.addColorStop(.25, '#4B4038'); g.addColorStop(.7, '#2A2828'); g.addColorStop(.97, '#3A3836'); g.addColorStop(1, '#8A8784'); x.fillStyle = g; x.fillRect(0, 0, w, h); for (let i = 0; i < w; i += 2) { x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(i, 0, 1, h * .45); } grain(x, 14); });
  const hot = lineTex(16, 256, (x, w, h) => { const g = x.createLinearGradient(0, h, 0, 0); g.addColorStop(0, '#FFE2B0'); g.addColorStop(.3, '#FF7A2A'); g.addColorStop(.75, '#7A1A08'); g.addColorStop(1, '#100302'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
  const mli = lineTex(256, 256, (x, w, h) => { x.fillStyle = '#80807f'; x.fillRect(0, 0, w, h); for (let i = 0; i < 260; i++) { x.strokeStyle = `rgba(${rnd() < .5 ? 0 : 255},${rnd() < .5 ? 0 : 255},0,.25)`; x.lineWidth = 1 + rnd() * 3; x.beginPath(); const sx = rnd() * w, sy = rnd() * h; x.moveTo(sx, sy); x.lineTo(sx + (rnd() - .5) * 60, sy + (rnd() - .5) * 60); x.stroke(); } grain(x, 30, [1, 1, 0]); }, false);
  const cells = lineTex(256, 512, (x, w, h) => { x.fillStyle = '#0A1430'; x.fillRect(0, 0, w, h); for (let i = 0; i < 8; i++) for (let j = 0; j < 16; j++) { x.fillStyle = `rgb(${14 + rnd() * 8},${26 + rnd() * 10},${62 + rnd() * 18})`; x.fillRect(i * 32 + 2, j * 32 + 2, 28, 28); } x.fillStyle = '#9AA0A8'; x.fillRect(0, 0, w, 3); x.fillRect(0, h - 3, w, 3); });
  Object.assign(M, {
    carbon: std(0x151618, .48, .25, { roughnessMap: grime }), steel: std(0x9AA0A5, .3, 1, { roughnessMap: grime }), alu: std(0xB9BDC1, .4, .9, { roughnessMap: grime }),
    dark: std(0x2A2D31, .55, .7, { roughnessMap: grime }), darker: std(0x121315, .7, .4), titanium: std(0x77797B, .5, .85, { roughnessMap: grime }),
    bell: std(0xFFFFFF, .45, .9, { map: bell, side: THREE.DoubleSide }), copper: std(0xA0683F, .35, 1),
    mvac: std(0x2B2B2D, .5, .8, { side: THREE.DoubleSide, emissive: 0xFFFFFF, emissiveMap: hot, emissiveIntensity: 0 }),
    boot: std(0xC9C6BE, .9, 0), gold: std(0xD6A84E, .3, 1, { roughnessMap: mli, bumpMap: mli, bumpScale: 2 }), solar: std(0xFFFFFF, .25, .35, { map: cells }),
    white: std(0xE6E8E9, .42, 0, { roughnessMap: grime }), concrete: std(0x9A9C9E, 1, 0, { map: conc, roughnessMap: wet }), trench: new THREE.MeshBasicMaterial({ color: 0x030303 }),
    ground: std(0x121314, 1, 0), lattice: std(0x4A4E52, .55, .75, { roughnessMap: grime }), rust: std(0x6A4A34, .85, .3), hazard: std(0xC9A227, .7, 0),
    lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5.6, 5) }), window: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.3, .9) }),
    red: new THREE.MeshBasicMaterial({ color: new THREE.Color(5, .3, .2), transparent: true }),
    accent: std(0x0B0C0C, .4, .2, { emissive: 0x35D6F0, emissiveIntensity: 2.6 })
  });
  const sk = skins(), skinMat = s => new (CINEMA ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial)({ map: s.map, roughnessMap: s.data, bumpMap: s.data, bumpScale: 1, roughness: 1, metalness: 0, ...(CINEMA ? { clearcoat: .2, clearcoatRoughness: .35 } : {}) });
  ['s1', 'inter', 's2', 'fair'].forEach(k => M[k] = skinMat(sk[k])); M.fair.side = THREE.DoubleSide;
}
// Fonts and the mark arrive after the first frame; repaint the skins once they have.
function repaint() { const sk = skins(); ['s1', 'inter', 's2', 'fair'].forEach(k => { const m = M[k]; m.map.dispose(); m.roughnessMap.dispose(); m.map = sk[k].map; m.roughnessMap = m.bumpMap = sk[k].data; m.needsUpdate = true; }); }

// ---------- vehicle ----------
function buildRocket() {
  rocket = new THREE.Group(); scene.add(rocket); stack = new THREE.Group(); stack.position.y = -PIV; rocket.add(stack);
  s1 = new THREE.Group(); s1.position.y = 15; stack.add(s1); const s1in = new THREE.Group(); s1in.position.y = -15; s1.add(s1in);
  const segs = CINEMA ? 96 : 64;
  // BODY (brand): first-stage tank, interstage, landing legs
  const body = group('body', V3(-5, 0, 7), s1in);
  body.add(mesh(cyl(R, R, Y1, segs, true), M.s1, 0, Y1 / 2, 0)); body.add(mesh(cyl(R, R, YI - Y1, segs, true), M.inter, 0, (Y1 + YI) / 2, 0));
  const b = batch();
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4, c = Math.cos(a), s = Math.sin(a), r = R + .17;
    b.add(box(.72, 10, .3), M.carbon, s * r, 5.6, c * r, 0, a, 0); b.add(box(.5, 9.4, .08), M.darker, s * (r + .16), 5.7, c * (r + .16), 0, a, 0);
    b.add(box(.9, .5, .42), M.dark, s * r, .55, c * r, 0, a, 0); b.add(cyl(.09, .09, 6, 10), M.steel, s * (r + .3), 7.6, c * (r + .3), 0, 0, 0);
    b.add(box(.6, .35, .5), M.dark, s * (r + .1), 10.6, c * (r + .1), 0, a, 0); }
  b.add(cyl(R + .02, R + .02, .5, segs, true), M.darker, 0, .25, 0); b.add(cyl(R - .02, R - .02, .06, segs), M.darker, 0, Y1, 0); b.into(body);
  // ENGINES (performance): octaweb, nine sea-level bells, thermal boots
  const eng = group('engines', V3(0, -9, 0), s1in); const e = batch();
  e.add(cyl(R - .02, R - .02, .3, segs), M.dark, 0, .15, 0); e.add(cyl(R - .1, R - .1, .06, segs), M.boot, 0, -.02, 0);
  const prof = [[.2, 0], [.19, -.18], [.24, -.45], [.33, -.85], [.41, -1.3], [.46, -1.75]].map(p => new THREE.Vector2(p[0], p[1]));
  const bellGeo = new THREE.LatheGeometry(prof, 40), pos = [[0, 0]]; for (let k = 0; k < 8; k++) pos.push([Math.cos(k / 8 * TAU) * 1.24, Math.sin(k / 8 * TAU) * 1.24]);
  pos.forEach(([x, z]) => { e.add(bellGeo, M.bell, x, -.12, z); e.add(cyl(.27, .23, .16, 20), M.boot, x, -.08, z); e.add(new THREE.TorusGeometry(.46, .02, 6, 40), M.dark, x, -1.87, z, Math.PI / 2); glows.push([x, -2, z]); });
  e.into(eng);
  // GRID FINS (guidance): four titanium lattices stowed flat on the interstage
  const gf = group('gridfins', V3(0, 3, 0), s1in); gf.userData.radialFins = true;
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2, f = new THREE.Group(), fb = batch(); f.rotation.y = a; f.position.set(Math.sin(a) * (R + .14), 33.4, Math.cos(a) * (R + .14)); f.userData = { home: f.position.clone(), dir: V3(Math.sin(a), .25, Math.cos(a)) };
    for (let i = 0; i <= 7; i++) fb.add(box(1.5, .04, .14), M.titanium, 0, -.7 + i * .2, 0); for (let i = 0; i <= 7; i++) fb.add(box(.04, 1.44, .14), M.titanium, -.7 + i * .2, 0, 0);
    fb.add(box(1.6, .1, .2), M.titanium, 0, .76, 0); fb.add(box(1.6, .1, .2), M.titanium, 0, -.76, 0); fb.add(box(.1, 1.6, .2), M.titanium, .78, 0, 0); fb.add(box(.1, 1.6, .2), M.titanium, -.78, 0, 0);
    fb.add(box(.4, .4, .3), M.dark, 0, -.95, -.05); fb.into(f); gf.add(f); fins.push(f); }
  // FUEL (conversion): raceway, pressurisation lines, T-0 umbilical plate
  const fuel = group('fuel', V3(-10, -2, 0), s1in), fl = batch(), ra = 1.75, rs = Math.sin(ra), rc = Math.cos(ra);
  fl.add(box(.34, Y1 - 2.6, .2), M.white, rs * (R + .1), Y1 / 2 + 1.1, rc * (R + .1), 0, ra, 0); fl.add(box(.22, YI - Y1, .14), M.darker, rs * (R + .07), (Y1 + YI) / 2, rc * (R + .07), 0, ra, 0);
  for (let y = 3; y < Y1; y += 1.6) fl.add(box(.44, .1, .26), M.dark, rs * (R + .1), y, rc * (R + .1), 0, ra, 0);
  [-.16, .16].forEach(o => fl.add(cyl(.05, .05, Y1 - 3, 8), M.alu, Math.sin(ra + o) * (R + .08), Y1 / 2, Math.cos(ra + o) * (R + .08)));
  fl.add(box(1.1, 1.3, .2), M.dark, -(R + .08), 1.7, 0, 0, Math.PI / 2, 0); fl.add(cyl(.12, .12, 1.5, 12), M.steel, -(R + .5), 1.6, .3, 0, 0, Math.PI / 2); fl.add(cyl(.12, .12, 1.5, 12), M.copper, -(R + .5), 1.6, -.3, 0, 0, Math.PI / 2);
  fl.into(fuel);
  // UPPER STAGE (managed experience): second stage tank and the vacuum engine hidden in the interstage
  const up = group('upper', V3(0, 6, 0), stack); up.add(mesh(cyl(R, R, Y2 - YI, segs, true), M.s2, 0, (YI + Y2) / 2, 0));
  const u = batch(); u.add(box(.22, Y2 - YI - .4, .14), M.white, rs * (R + .07), (YI + Y2) / 2, rc * (R + .07), 0, ra, 0);
  [0, Math.PI].forEach(a => u.add(box(.36, .5, .3), M.dark, Math.sin(a + .5) * (R + .12), Y2 - .6, Math.cos(a + .5) * (R + .12), 0, a + .5, 0));
  u.add(cyl(R - .05, .6, .9, 32), M.dark, 0, YI - .45, 0); u.into(up);
  up.add(mesh(new THREE.LatheGeometry([[.38, 0], [.42, -.4], [.7, -1.35], [1.1, -2.7], [1.48, -3.9]].map(p => new THREE.Vector2(p[0], p[1])), 48), M.mvac, 0, YI - .55, 0));
  // FAIRING (3D & motion): two halves with a boattail; seams face the camera
  const fair = group('fairing', V3(0, 12, 0), stack); fair.position.y = Y2; fair.userData.home.y = Y2;
  const fp = [[R, 0], [2.2, .55], [RF, 1.5]]; for (let i = 0; i <= 3; i++) fp.push([RF, 1.5 + i * 1.2]); for (let i = 1; i <= 14; i++) { const s = i / 14; fp.push([RF * Math.pow(1 - s * s, .55) + (i === 14 ? .14 : 0), 5.1 + 7.3 * s]); } fp.push([0, 12.5]);
  fairA = new THREE.Group(); fairB = new THREE.Group();
  fairA.add(mesh(lathe(fp, 60, 36, 0, Math.PI), M.fair)); fairB.add(mesh(lathe(fp, 60, 36, Math.PI, Math.PI), M.fair)); fair.add(fairA, fairB);
  // PAYLOAD (AI / automation): gold-foil spacecraft with folding solar wings and an accent-lit core
  const pay = group('payload', V3(0, 20, 0), stack); pay.position.y = Y2; pay.userData.home.y = Y2;
  const pb = batch(); pb.add(cyl(1.3, .8, 1.1, 32), M.dark, 0, .55, 0); pb.add(box(1.7, 2.6, 1.7), M.gold, 0, 2.4, 0); pb.add(cyl(.12, .12, .8, 10), M.alu, 0, 4.1, 0);
  pb.add(box(1.76, .08, 1.76), M.alu, 0, 1.12, 0); pb.add(box(1.76, .08, 1.76), M.alu, 0, 3.7, 0); pb.into(pay);
  pay.add(mesh(box(.12, 1.6, .12), M.accent, .86, 2.4, .86)); pay.add(mesh(box(.12, 1.6, .12), M.accent, -.86, 2.4, .86));
  const dish = mesh(new THREE.SphereGeometry(.7, 24, 8, 0, TAU, 0, .9), M.alu, 0, 4.4, 0, Math.PI); pay.add(dish);
  [-1, 1].forEach(s => { const w = new THREE.Group(); w.position.set(s * .9, 1.2, 0); const pnl = mesh(box(.05, 2.4, 1.5), M.solar, s * .04, 1.2, 0); w.add(pnl); w.userData = { s, pnl }; pay.add(w); wings.push(w); }); // hinged at the bottom edge, stowed flat on the bus
  // exhaust
  plume = plumeMesh({ len: 32, r0: 1.75, r1: 3.4, core: 0xFFF4DC, hot: 0xFFC060, cool: 0xFF5A14 }); plume.position.y = -1.9; eng.add(plume);
  vplume = plumeMesh({ len: 30, r0: 1.45, r1: 4.5, core: 0xFFEBD6, hot: 0xC9D4FF, cool: 0x4A5C9A }); vplume.position.y = YI - 4.45; up.add(vplume); vplume.material.uniforms.uVac.value = 1;
  const gt = glowTex(); glows.forEach((g, i) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, color: 0xFFD9A0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 })); s.position.set(...g); s.scale.setScalar(1.4); eng.add(s); glows[i] = s; });
  flameL = new THREE.PointLight(0xFF9440, 0, 180, 1.25); flameL.position.y = -6; eng.add(flameL);
  vapor = puffs(CINEMA ? 160 : 70, puffTex(), 0xEEF2F5); stack.add(vapor.mesh);
}
function plumeMesh(o) {
  const g = new THREE.CylinderGeometry(1, 1, 1, 40, 28, true); g.translate(0, -.5, 0);
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uThrust: { value: 0 }, uVac: { value: 0 }, uLen: { value: o.len }, uR0: { value: o.r0 }, uR1: { value: o.r1 }, uCore: { value: new THREE.Color(o.core) }, uHot: { value: new THREE.Color(o.hot) }, uCool: { value: new THREE.Color(o.cool) } },
    vertexShader: `uniform float uLen, uR0, uR1, uVac; varying float vY; varying vec3 vN, vV;
      void main(){ float y = clamp(-position.y, 0., 1.);
        float r = mix(uR0, uR1 * (1. + 2.5 * uVac), pow(y, mix(.6, .32, uVac)));
        vec4 w = modelMatrix * vec4(position.x * r, -y * uLen * (1. + uVac), position.z * r, 1.);
        vY = y; vN = normalize(mat3(modelMatrix) * vec3(position.x, 0., position.z)); vV = cameraPosition - w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime, uThrust, uVac; uniform vec3 uCore, uHot, uCool; varying float vY; varying vec3 vN, vV;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h(i), h(i + vec2(1., 0.)), f.x), mix(h(i + vec2(0., 1.)), h(i + 1.), f.x), f.y); }
      void main(){
        float f = abs(dot(normalize(vN), normalize(vV)));
        float ang = atan(vN.z, vN.x);
        float turb = .55 * n(vec2(ang * 2.5, vY * 9. - uTime * 16.)) + .45 * n(vec2(ang * 6., vY * 26. - uTime * 31.));
        float body = pow(f, 1.4) * (1. - smoothstep(.05, 1., vY)) * (.45 + .75 * turb);
        float shock = mix(.78 + .22 * cos(vY * 48.) * exp(-vY * 3.), 1., uVac);
        float core = pow(f, 5.) * exp(-vY * mix(8., 3., uVac));
        float a = (body * shock * 1.5 + core * 3.2) * uThrust * mix(1., .38, uVac);
        vec3 col = mix(uCool, uHot, exp(-vY * 3.)); col = mix(col, uCore, clamp(core * 1.6, 0., 1.));
        gl_FragColor = vec4(col * a, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  const p = new THREE.Mesh(g, m); p.frustumCulled = false; p.renderOrder = 3; p.visible = false; return p;
}

// ---------- billboard particles (instanced quads: no point-size cap on phones) ----------
function puffs(n, map, color) {
  const q = new THREE.PlaneGeometry(1, 1), g = new THREE.InstancedBufferGeometry(); g.index = q.index; g.setAttribute('position', q.attributes.position); g.setAttribute('uv', q.attributes.uv);
  const a = new Float32Array(n * 4), b = new Float32Array(n * 3), A4 = new THREE.InstancedBufferAttribute(a, 4).setUsage(THREE.DynamicDrawUsage), B3 = new THREE.InstancedBufferAttribute(b, 3).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('iA', A4); g.setAttribute('iB', B3); g.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, uColor: { value: new THREE.Color(color) }, uHeat: { value: new THREE.Color(0xFF7A30) }, uLight: { value: 1 } },
    vertexShader: `attribute vec4 iA; attribute vec3 iB; varying vec2 vUv; varying float vA, vH;
      void main(){ vUv = uv; vA = iB.x; vH = iB.z; vec4 mv = modelViewMatrix * vec4(iA.xyz, 1.); float c = cos(iB.y), s = sin(iB.y);
        mv.xy += mat2(c, s, -s, c) * position.xy * iA.w; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 uColor, uHeat; uniform float uLight; varying vec2 vUv; varying float vA, vH;
      void main(){ vec4 t = texture2D(map, vUv); float a = t.a * vA; if (a < .004) discard;
        gl_FragColor = vec4(uColor * uLight * (.4 + .6 * t.r) + uHeat * vH * (.4 + t.r), a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false
  });
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 2;
  const f = () => new Float32Array(n);
  return { mesh: m, mat, n, a, b, A4, B3, pos: new Float32Array(n * 3), vel: new Float32Array(n * 3), life: f(), max: f(), s0: f(), s1: f(), rot: f(), spin: f(), cur: 0 };
}
function emit(p, x, y, z, vx, vy, vz, life, s0, s1) { const i = p.cur, j = i * 3; p.cur = (i + 1) % p.n; p.pos[j] = x; p.pos[j + 1] = y; p.pos[j + 2] = z; p.vel[j] = vx; p.vel[j + 1] = vy; p.vel[j + 2] = vz; p.life[i] = p.max[i] = life; p.s0[i] = s0; p.s1[i] = s1; p.rot[i] = Math.random() * TAU; p.spin[i] = (Math.random() - .5) * .35; }
function step(p, dt, alpha, drag, lift, heat) {
  const dr = Math.exp(-drag * dt);
  for (let i = 0; i < p.n; i++) { const j = i * 3, k = i * 4;
    if (p.life[i] <= 0) { p.a[k + 3] = 0; p.b[j] = 0; continue; }
    p.life[i] -= dt; const age = 1 - Math.max(0, p.life[i]) / p.max[i];
    p.vel[j] *= dr; p.vel[j + 1] = p.vel[j + 1] * dr + lift * dt; p.vel[j + 2] *= dr;
    p.pos[j] += p.vel[j] * dt; p.pos[j + 1] += p.vel[j + 1] * dt; p.pos[j + 2] += p.vel[j + 2] * dt; p.rot[i] += p.spin[i] * dt;
    p.a[k] = p.pos[j]; p.a[k + 1] = p.pos[j + 1]; p.a[k + 2] = p.pos[j + 2]; p.a[k + 3] = lerp(p.s0[i], p.s1[i], 1 - Math.pow(1 - age, 2.4));
    p.b[j] = alpha * Math.min(1, age * 7) * Math.pow(1 - age, 1.3); p.b[j + 1] = p.rot[i]; p.b[j + 2] = heat ? heat(p.pos[j], p.pos[j + 1], p.pos[j + 2]) : 0; }
  p.A4.needsUpdate = p.B3.needsUpdate = true;
}

// ---------- launch complex ----------
function buildComplex() {
  complex = new THREE.Group(); scene.add(complex); const b = batch();
  const gnd = mesh(new THREE.PlaneGeometry(6000, 6000), M.ground, 0, 0, 0, -Math.PI / 2); gnd.castShadow = false; complex.add(gnd);
  b.add(box(70, 1.5, 70), M.concrete, 0, .75, 0); b.add(box(9, .02, 34), M.trench, 0, 1.51, -15); b.add(box(12, 4, 2), M.concrete, 0, 2, -33);
  // launch mount: four pillars, a steel table, hold-down clamps, deluge ring
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; b.add(box(2, 4.6, 2), M.concrete, Math.cos(a) * 4.4, 3.8, Math.sin(a) * 4.4); b.add(box(2.4, .5, 2.4), M.dark, Math.cos(a) * 4.2, 6.1, Math.sin(a) * 4.2); }
  b.add(new THREE.TorusGeometry(3.6, .38, 12, 64), M.dark, 0, 6.05, 0, Math.PI / 2); b.add(new THREE.TorusGeometry(2.3, .16, 10, 48), M.steel, 0, 6.25, 0, Math.PI / 2);
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + .2; b.add(box(.5, .9, .5), M.steel, Math.cos(a) * 2.15, 6.6, Math.sin(a) * 2.15, 0, -a, 0); }
  b.add(new THREE.TorusGeometry(6.4, .16, 10, 72), M.steel, 0, 2, 0, Math.PI / 2); for (let k = 0; k < 18; k++) { const a = k / 18 * TAU; b.add(cyl(.07, .12, .45, 8), M.copper, Math.cos(a) * 6.4, 2.3, Math.sin(a) * 6.4, .6, -a, 0); }
  b.add(box(.3, .02, 60), M.hazard, -30, 1.51, 0); b.add(box(.3, .02, 60), M.hazard, 30, 1.51, 0); b.add(box(60, .02, .3), M.hazard, 0, 1.51, 30);
  // fixed service tower with three swing arms
  const TX = -13, TH = 74;
  [[-2, -2], [2, -2], [-2, 2], [2, 2]].forEach(([x, z]) => b.add(box(.5, TH, .5), M.lattice, TX + x, 1.5 + TH / 2, z));
  for (let y = 3; y < TH; y += 3) { b.add(box(4.4, .22, .22), M.lattice, TX, y, -2); b.add(box(4.4, .22, .22), M.lattice, TX, y, 2); b.add(box(.22, .22, 4.4), M.lattice, TX - 2, y, 0); b.add(box(.22, .22, 4.4), M.lattice, TX + 2, y, 0);
    b.add(box(.1, 4.2, .1), M.lattice, TX + 2, y + 1.5, 0, .76, 0, 0); b.add(box(.1, 4.2, .1), M.lattice, TX - 2, y + 1.5, 0, -.76, 0, 0); b.add(box(.1, 4.2, .1), M.lattice, TX, y + 1.5, -2, 0, 0, .76); b.add(box(.1, 4.2, .1), M.lattice, TX, y + 1.5, 2, 0, 0, -.76); }
  for (let y = 12; y < TH; y += 12) { b.add(box(5.4, .18, 5.4), M.dark, TX, y, 0); for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; b.add(box(.05, 1.1, .05), M.steel, TX + Math.cos(a) * 2.7, y + .6, Math.sin(a) * 2.7); } }
  b.add(box(2, TH, 2), M.darker, TX - 3.4, 1.5 + TH / 2, 0); b.add(box(3.6, 1, 3.6), M.dark, TX, TH + 1.8, 0); b.add(cyl(.18, .08, 14, 8), M.steel, TX, TH + 9, 0);
  const beacon = mesh(new THREE.SphereGeometry(.3, 10, 8), M.red, TX, TH + 16.2, 0); complex.add(beacon); beacons.push([TX, TH + 16.2, 0]);
  [[14.5, 9.4], [43.5, 9.4], [55.5, 9.4]].forEach(([y, len]) => { const p = new THREE.Group(), ab = batch(); p.position.set(TX + 2, BASE + y - 6.5, 0);
    ab.add(box(len, .5, .9), M.dark, len / 2, 0, 0); ab.add(box(len, .08, .08), M.steel, len / 2, .9, .45); ab.add(box(len, .08, .08), M.steel, len / 2, .9, -.45);
    for (let x = .5; x < len; x += 1.2) ab.add(box(.06, .9, .06), M.steel, x, .45, .45); ab.add(cyl(.14, .14, len, 10), M.steel, len / 2, -.45, .3, 0, 0, Math.PI / 2); ab.add(cyl(.1, .1, len, 10), M.copper, len / 2, -.45, -.3, 0, 0, Math.PI / 2);
    if (y > 50) ab.add(box(2.2, 2.6, 2.4), M.white, len - .9, 1.1, 0); ab.into(p); complex.add(p); arms.push(p); });
  // lightning-protection masts with catenary wires
  const wires = [], tops = [[48, 96, -24], [-36, 96, 40], [-40, 96, -38]];
  tops.forEach(([x, h, z]) => { b.add(box(1, h, 1), M.lattice, x, h / 2, z); b.add(cyl(.12, .05, 10, 6), M.steel, x, h + 5, z); });
  const cat = (p, q) => { for (let i = 0; i < 24; i++) { const t0 = i / 24, t1 = (i + 1) / 24; [t0, t1].forEach(t => wires.push(lerp(p[0], q[0], t), lerp(p[1], q[1], t) - Math.sin(t * Math.PI) * 9, lerp(p[2], q[2], t))); } };
  tops.forEach(t => cat([t[0], t[1] + 8, t[2]], [TX, TH + 15, 0])); cat([tops[0][0], 104, tops[0][2]], [tops[1][0], 104, tops[1][2]]);
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3)); complex.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x3A3F44, transparent: true, opacity: .55 })));
  // floodlight masts, beams and lamps
  const gt = glowTex(6);
  [[28, 22], [-24, 28], [27, -26], [-30, -18]].forEach(([x, z], i) => {
    b.add(cyl(.2, .3, 22, 10), M.dark, x, 11, z); b.add(box(2.4, 1.6, 1), M.dark, x, 22.6, z, 0, Math.atan2(-x, -z), 0); b.add(box(2, 1.2, .2), M.lamp, x * .975, 22.6, z * .975, 0, Math.atan2(-x, -z), 0);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, color: 0xFFF1DC, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .9 })); s.position.set(x * .96, 22.6, z * .96); s.scale.setScalar(7); complex.add(s);
    beams.push(beam(V3(x * .96, 22.4, z * .96), V3(0, 22, 0), 8));
    if (i < (CINEMA ? 4 : 2)) { const sp = new THREE.SpotLight(0xFFF1DC, 1600, 170, .36, .65, 1.3); sp.position.set(x, 22.6, z); sp.target.position.set(0, 24, 0); complex.add(sp, sp.target); spots.push(sp); }
  });
  // tank farm, water tower, hangar, fence, road
  [[56, 8, -46, 8], [38, 6.2, -64, 6]].forEach(([x, y, z, r]) => { complex.add(mesh(new THREE.SphereGeometry(r, 40, 24), M.white, x, y + 4, z)); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; b.add(cyl(.3, .3, y + 4, 8), M.dark, x + Math.cos(a) * r * .8, (y + 4) / 2, z + Math.sin(a) * r * .8); } });
  [[-46, -60], [-56, -52]].forEach(([x, z]) => { b.add(cyl(2.6, 2.6, 16, 32), M.white, x, 5.2, z, 0, 0, Math.PI / 2); b.add(box(16, 2.6, 1.6), M.concrete, x, 1.3, z); });
  for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + .4; b.add(box(.9, 80, .9), M.lattice, -86 + Math.cos(a) * 5, 40, -30 + Math.sin(a) * 5, Math.cos(a) * .06, 0, -Math.sin(a) * .06); }
  b.add(cyl(7, 7, 16, 40), M.white, -86, 88, -30); b.add(cyl(7.2, 7.2, .6, 40), M.dark, -86, 96.3, -30);
  beacons.push([-86, 97.2, -30]); complex.add(mesh(new THREE.SphereGeometry(.4, 8, 6), M.red, -86, 97.2, -30));
  b.add(box(64, 28, 44), M.concrete, -120, 14, 92); b.add(box(30, 20, .2), M.window, -120, 11, 69.9); b.add(box(64, .8, .2), M.window, -120, 25, 69.9);
  for (let k = 0; k < 90; k++) { const a = k / 90 * TAU; b.add(box(.1, 2.6, .1), M.dark, Math.cos(a) * 44, 1.3, Math.sin(a) * 44); }
  b.add(box(10, .05, 600), M.darker, 60, .03, -300, 0, .35, 0);
  b.into(complex);
  // distant lights: road, causeway, the town across the water
  const dl = []; for (let i = 0; i < 700; i++) { const a = rnd() * TAU, r = 300 + Math.pow(rnd(), .6) * 2600; dl.push(Math.cos(a) * r, .5 + rnd() * 3, Math.sin(a) * r); }
  for (let i = 0; i < 40; i++) dl.push(60 + Math.sin(.35) * i * 15, .6, -300 + i * -15 * .94 + 270);
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.Float32BufferAttribute(dl, 3));
  complex.add(new THREE.Points(dg, new THREE.PointsMaterial({ color: new THREE.Color(2.4, 1.6, .9), size: 1.6, sizeAttenuation: false, transparent: true, opacity: .9, depthWrite: false })));
  smoke = puffs(CINEMA ? 380 : 120, puffTex(), 0xD9DDE1); scene.add(smoke.mesh);
}
// A floodlight's beam in hazy air: brightest at the lamp, soft at the edges.
const beamMat = new THREE.ShaderMaterial({
  uniforms: { uI: { value: .06 } },
  vertexShader: `varying float vT; varying vec3 vN, vV; void main(){ vT = uv.y; vec4 mv = modelViewMatrix * vec4(position, 1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform float uI; varying float vT; varying vec3 vN, vV; void main(){ float f = pow(abs(dot(vN, vV)), 2.); gl_FragColor = vec4(vec3(1., .95, .86) * f * pow(vT, 1.8) * uI, 1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
});
function beam(from, to, r) { const d = from.distanceTo(to), g = new THREE.ConeGeometry(r, d, 32, 1, true); g.translate(0, -d / 2, 0); const m = new THREE.Mesh(g, beamMat); m.position.copy(from); m.lookAt(to); m.rotateX(-Math.PI / 2); complex.add(m); return m; }

// ---------- sky, stars, Earth, Moon, Sun ----------
const PLANET_VS = `varying vec2 vUv; varying vec3 vN, vP; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.); vP = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
function buildSpace() {
  sky = new THREE.Mesh(new THREE.SphereGeometry(150000, 32, 16), new THREE.ShaderMaterial({
    uniforms: { uTop: { value: new THREE.Color(0x03060C) }, uHor: { value: new THREE.Color(0x111820) }, uGlow: { value: new THREE.Color(0x2A2016) }, uSpace: { value: 0 } },
    vertexShader: `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform vec3 uTop, uHor, uGlow; uniform float uSpace; varying vec3 vD;
      void main(){ float h = normalize(vD).y; vec3 c = mix(uHor, uTop, smoothstep(0., .5, h)) + uGlow * exp(-abs(h) * 16.); if (h < 0.) c = mix(c, uHor * .5, smoothstep(0., -.08, h));
        gl_FragColor = vec4(c * (1. - uSpace), 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false
  })); sky.renderOrder = -2; scene.add(sky);
  const n = CINEMA ? 5200 : 2600, sp = new Float32Array(n * 3), sc = new Float32Array(n * 3), ss = new Float32Array(n), col = new THREE.Color();
  for (let i = 0; i < n; i++) { const u = rnd() * 2 - 1, a = rnd() * TAU, r = Math.sqrt(1 - u * u); sp.set([Math.cos(a) * r * 100000, u * 100000, Math.sin(a) * r * 100000], i * 3); col.setHSL(rnd() < .7 ? .6 : .08, .25 + rnd() * .35, .75 + rnd() * .2); sc.set([col.r, col.g, col.b], i * 3); ss[i] = .7 + Math.pow(rnd(), 9) * 3.2; }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('color', new THREE.BufferAttribute(sc, 3)); sg.setAttribute('size', new THREE.BufferAttribute(ss, 1));
  stars = new THREE.Points(sg, new THREE.ShaderMaterial({
    uniforms: { uOp: { value: 0 }, uPx: { value: 1 } },
    vertexShader: `attribute float size; attribute vec3 color; uniform float uPx; varying vec3 vC; void main(){ vC = color; gl_PointSize = size * uPx; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform float uOp; varying vec3 vC; void main(){ float d = length(gl_PointCoord - .5); gl_FragColor = vec4(vC * 1.6, smoothstep(.5, .1, d) * uOp);
      #include <colorspace_fragment>
    }`,
    transparent: true, depthWrite: false
  })); stars.frustumCulled = false; stars.renderOrder = -1; scene.add(stars);
  const blank = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1); blank.needsUpdate = true;
  earth = new THREE.Mesh(new THREE.SphereGeometry(RE, CINEMA ? 256 : 192, CINEMA ? 128 : 96), new THREE.ShaderMaterial({
    uniforms: { dayMap: { value: blank }, dataMap: { value: blank }, uSun: { value: SUN_ASC.clone() }, uTime: { value: 0 }, uFade: { value: 0 } },
    vertexShader: PLANET_VS,
    fragmentShader: `uniform sampler2D dayMap, dataMap; uniform vec3 uSun; uniform float uTime, uFade; varying vec2 vUv; varying vec3 vN, vP;
      void main(){
        vec3 N = normalize(vN), V = normalize(cameraPosition - vP), L = uSun; float NL = dot(N, L), diff = max(NL, 0.);
        vec2 cu = vUv + vec2(uTime * .0015, 0.); vec4 d = texture2D(dataMap, vUv); float cl = texture2D(dataMap, cu).r, csh = texture2D(dataMap, cu + vec2(.0012, .0006)).r;
        vec3 day = texture2D(dayMap, vUv).rgb;
        vec3 surf = day * (1. - .5 * csh) * diff * 2.6;
        vec3 H = normalize(L + V); surf += vec3(1., .9, .75) * pow(max(dot(N, H), 0.), 70.) * d.b * (1. - cl) * 2.2 * step(0., NL);
        vec3 col = mix(surf, vec3(1.) * max(NL + .06, 0.) * 2.4, cl * .9);
        float night = 1. - smoothstep(-.2, .04, NL);
        col += vec3(1., .62, .28) * pow(d.g, 1.7) * night * (1. - cl * .85) * 1.6;
        float fres = pow(1. - max(dot(N, V), 0.), 2.4);
        vec3 air = mix(vec3(1., .42, .16), vec3(.28, .56, 1.), smoothstep(-.05, .4, NL));
        col = col * .9 + vec3(.03, .08, .18) * diff * .5 + air * pow(fres, 6.) * smoothstep(-.25, .3, NL) * 1.4;
        gl_FragColor = vec4(col, uFade);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true
  })); earth.visible = false; earth.quaternion.setFromUnitVectors(JKT, EDIR.clone().negate()); scene.add(earth);
  atmo = new THREE.Mesh(new THREE.SphereGeometry(RE * 1.035, 192, 96), new THREE.ShaderMaterial({
    uniforms: { uSun: { value: SUN_ASC.clone() }, uFade: { value: 0 } },
    vertexShader: PLANET_VS,
    fragmentShader: `uniform vec3 uSun; uniform float uFade; varying vec3 vN, vP;
      void main(){ vec3 N = normalize(vN), V = normalize(cameraPosition - vP); float rim = smoothstep(0., .42, -dot(N, V)); float sunSide = smoothstep(-.35, .45, dot(N, uSun));
        vec3 c = mix(vec3(1., .45, .18), vec3(.32, .6, 1.), sunSide) * rim * (.08 + sunSide) * 1.5 * uFade;
        gl_FragColor = vec4(c, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  })); atmo.visible = false; scene.add(atmo);
  moon = new THREE.Mesh(new THREE.SphereGeometry(RM, CINEMA ? 160 : 112, CINEMA ? 96 : 64), new THREE.ShaderMaterial({
    uniforms: { map: { value: blank }, nmap: { value: blank }, uSun: { value: SUN_LUN.clone() }, uUp: { value: V3(0, 1, 0) }, uFade: { value: 0 } },
    vertexShader: PLANET_VS,
    // Lommel-Seeliger: the Moon's regolith scatters light so its disc looks flat, not like a shaded ball.
    fragmentShader: `uniform sampler2D map, nmap; uniform vec3 uSun, uUp; uniform float uFade; varying vec2 vUv; varying vec3 vN, vP;
      void main(){
        vec3 N = normalize(vN), V = normalize(cameraPosition - vP);
        vec3 east = normalize(cross(uUp, N) + vec3(1e-5, 0., 0.)), north = cross(N, east);
        vec3 t = texture2D(nmap, vUv).xyz * 2. - 1.; vec3 P = normalize(east * t.x * 1.6 + north * t.y * 1.6 + N * t.z);
        float mu0 = max(dot(P, uSun), 0.), mu = max(dot(N, V), 0.);
        float br = mix(mu0, 2. * mu0 / (mu0 + mu + 1e-4), .62);
        vec3 alb = texture2D(map, vUv).rgb;
        gl_FragColor = vec4(alb * br * 2.4 + alb * .01, uFade);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true
  })); moon.visible = false; moon.quaternion.setFromUnitVectors(V3(1, 0, 0), MDIR.clone().negate()); moon.material.uniforms.uUp.value.set(0, 1, 0).applyQuaternion(moon.quaternion); scene.add(moon);
  sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(8), color: 0xFFF6EA, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 })); sun.material.fog = false; sun.scale.setScalar(9000); scene.add(sun);
}
// NASA maps load after the first frame so the hero never waits on them.
function loadSpace() {
  const L = new THREE.TextureLoader(), k = CINEMA ? '4k' : '2k', set = (u, url, srgb) => L.load(url, t => { if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ANISO; u.value = t; });
  set(earth.material.uniforms.dayMap, `assets/space/earth-${k}.webp`, true); set(earth.material.uniforms.dataMap, 'assets/space/earth-data.jpg', false);
  set(moon.material.uniforms.map, `assets/space/moon-${k}.webp`, true); set(moon.material.uniforms.nmap, 'assets/space/moon-normal.jpg', false);
}

// ---------- lighting and reflections ----------
function envMap(build) { const s = new THREE.Scene(); build(s); const pm = new THREE.PMREMGenerator(gl), t = pm.fromScene(s, .02, .1, 200).texture; pm.dispose(); return t; }
function panel(s, color, x, y, z, w, h) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m); }
function buildLights() {
  envPad = envMap(s => { s.background = new THREE.Color(0x030406); [[40, 12, 34], [-34, 12, 40], [38, 12, -38], [-42, 12, -26]].forEach(p => panel(s, new THREE.Color(14, 12.5, 11), ...p, 6, 3)); panel(s, new THREE.Color(.05, .05, .055), 0, -30, 0, 200, 200); panel(s, new THREE.Color(.12, .09, .06), 0, 4, -90, 260, 10); panel(s, new THREE.Color(.1, .08, .05), 0, 4, 90, 260, 10); });
  envSpace = envMap(s => { s.background = new THREE.Color(0); panel(s, new THREE.Color(80, 76, 70), SUN_LUN.x * 80, SUN_LUN.y * 80, SUN_LUN.z * 80, 4, 4); panel(s, new THREE.Color(.03, .07, .14), 0, -60, 0, 220, 220); });
  scene.environment = envPad;
  padKey = new THREE.DirectionalLight(0xFFE7CE, 1.6); padKey.position.set(34, 44, 56); padKey.target.position.set(0, 26, 0); padKey.castShadow = true;
  padKey.shadow.mapSize.set(CINEMA ? 2048 : 1024, CINEMA ? 2048 : 1024); const c = padKey.shadow.camera; c.left = -34; c.right = 26; c.top = 46; c.bottom = -30; c.near = 1; c.far = 200; c.updateProjectionMatrix(); padKey.shadow.bias = -.0005; padKey.shadow.normalBias = .03;
  scene.add(padKey, padKey.target);
  hemi = new THREE.HemisphereLight(0x1E2A38, 0x070707, .7); scene.add(hemi);
  rimL = new THREE.PointLight(0x35D6F0, 40, 90, 1.5); rimL.position.set(10, 46, -16); scene.add(rimL);
  const sodium = new THREE.PointLight(0xFFB070, 60, 60, 1.6); sodium.position.set(-11, 8, 6); complex.add(sodium);
  sunL = new THREE.DirectionalLight(0xFFF3E4, 0); scene.add(sunL, sunL.target);
}

// ---------- choreography ----------
function onRocket(y, alt, tilt, yaw = 0) { _o.position.set(0, BASE + PIV + alt, 0); _o.rotation.set(0, yaw, tilt); _o.updateMatrix(); return V3(0, y - PIV, 0).applyMatrix4(_o.matrix); }
const PROBLEM = ['body', 'engines', 'gridfins', 'fuel', 'fairing'], SOLUTION = ['body', 'fairing', 'engines', 'fuel', 'gridfins', 'payload', 'upper'], SIB = { fairing: ['fairing', 'payload', 'upper'] };
const orbit = (a, r, y) => V3(Math.sin(a) * r, y, Math.cos(a) * r);
function pose(now) {
  const { sec, local: t } = S, T = { pos: V3(), tgt: V3(), fov: 52, fp: [0, .1], fl: [.2, 0], shake: 0, ex: {} };
  KEYS.forEach(k => { if (!(k in T)) T[k] = 0; }); T.fov = 52; T.egap = 300;
  if (S.launched) { // a fresh vehicle on the pad for the visitor's own mission
    const L = (now - S.launchAt) / 1000;
    T.open = L < 1.5 ? sm(L / 1.5) : L < 3 ? 1 : 1 - sm((L - 3) / 1.5); T.payY = 12 * (1 - sm((L - 1) / 2)); T.thrust = sm((L - 4.5) / 1.5); T.arms = sm((L - 4) / 1.5); T.vapor = 1 - T.thrust;
    T.alt = L > 6 ? 600 * Math.pow(sm((L - 6) / 7), 1.7) : 0; T.shake = T.thrust * .4 * (T.alt < 300 ? 1 : 0);
    if (L < 4.5) { T.pos.set(16, 58, 22); T.tgt.set(0, 52, 0); T.fov = 40; } else { T.pos.set(60, 14, 96); T.tgt.set(0, 26 + T.alt * .85, 0); T.fov = 50; }
    T.fp = [0, .2]; T.fl = [0, 0]; return T;
  }
  switch (sec) {
    case 0: { const p = sm(t), pre = 1 - (S.enter === undefined ? 1 : S.enter);
      T.pos.lerpVectors(V3(22, 3.4, 31), V3(46, 16, 70), p).add(V3(-11, -1.2, -16).multiplyScalar(pre)); T.tgt.lerpVectors(V3(0, 29, 0), V3(0, 31, 0), p);
      T.fov = 58 - 4 * p + 16 * pre; T.vapor = 1; T.fp = [0, .1]; T.fl = [.2, 0]; break; }
    case 1: { T.pos.copy(orbit(-.5 + t * 2.2, 60 - 8 * t, 22 + 12 * t)); T.tgt.set(0, 31, 0); T.fov = 54; T.vapor = .6; T.fp = [0, .02]; T.fl = [0, 0];
      PROBLEM.forEach((n, i) => { const f = sm(t * 5 - i); (SIB[n] || [n]).forEach(k => T.ex[k] = f); }); break; }
    case 2: { T.pos.copy(orbit(1.7 + t * 1.3, 62 - 8 * t, 36 - 10 * t)); T.tgt.set(0, 32, 0); T.fov = 54; T.vapor = .6; T.fp = [0, .02]; T.fl = [0, 0];
      SOLUTION.forEach((n, j) => T.ex[n] = 1 - sm(t * 7 - j)); break; }
    case 3: { T.pos.set(30 + 40 * t, 24 + 10 * t, 80 + 60 * t); T.tgt.set(0, 30, 0); T.fov = 50; T.arms = sm((t - .6) / .3); T.vapor = 1; T.fp = [0, .16]; T.fl = [.22, 0]; break; }
    case 4: { T.arms = 1; T.thrust = sm((t - .45) / .35); T.alt = 40 * Math.pow(sm((t - .8) / .2), 1.6); T.shake = T.thrust * .35; T.vapor = 1 - T.thrust;
      if (t < .5) { T.pos.lerpVectors(V3(13, 5.6, 17), V3(15.5, 6.2, 21), t * 2); T.tgt.set(0, 8, 0); T.fov = 58; T.fp = [0, .04]; T.fl = [-.18, 0]; }
      else { T.pos.set(44, 9, 72); T.tgt.set(0, 26 + T.alt * .75, 0); T.fov = 52; T.fp = [0, .1]; T.fl = [-.2, 0]; } break; }
    case 5: { const alt = 40 + (ALT1 - 40) * sm(t * 1.04), tilt = -.62 * sm(t), sc = sm((t - .44) / .12);
      T.alt = alt; T.tilt = tilt; T.arms = 1; T.thrust = 1 - sm((t - .4) / .04); T.sep = sm((t - .45) / .45); T.mvac = sm((t - .52) / .05) * (1 - sm((t - .97) / .03));
      T.fsep = sm((t - .7) / .22); T.vac = sm((t - .2) / .45); T.space = sm((t - .1) / .4); T.efade = sm((t - .2) / .3); T.egap = lerp(80, 460, sm(t)); T.shake = .1 * (1 - t);
      const f = onRocket(lerp(24, 45, sc), alt, tilt); T.tgt.copy(f); T.pos.copy(f).add(V3(lerp(40, 23, sc), lerp(3, 3, sc), lerp(80, 44, sc)));
      T.fov = 50; T.fp = [0, .2]; T.fl = [.24, 0]; break; }
    case 6: { const p = sm(t), tilt = lerp(-.62, LUN.tilt, p), yaw = lerp(0, LUN.yaw, p), f = onRocket(45, ALT1, tilt, yaw);
      Object.assign(T, { alt: ALT1, tilt, yaw, arms: 1, sep: 1, fsep: 1, mvac: 1 - sm((t - .4) / .15), space: 1, efade: 1, egap: lerp(460, 9000, p), lunar: p, deploy: sm((t - .55) / .4), fov: 48 });
      T.tgt.copy(f).addScaledVector(MDIR, 60 * p).addScaledVector(MUP, 4 * p); T.pos.copy(f).add(V3(23, 3, 44).lerp(LUN_CAM, p)); T.fp = [0, lerp(.2, .12, p)]; T.fl = [.24, 0]; break; }
    default: { const late = sec >= 9, f = onRocket(45, ALT1, LUN.tilt, LUN.yaw), a = (sec - 7) * .9 + t * .9;
      Object.assign(T, { alt: ALT1, tilt: LUN.tilt, yaw: LUN.yaw, arms: 1, sep: 1, fsep: 1, space: 1, efade: 1, egap: 12000, lunar: 1, deploy: 1, drift: late ? 1 : 0, fov: 46 });
      T.tgt.copy(f).addScaledVector(MDIR, 60).addScaledVector(MUP, 4); T.pos.copy(f).add(LUN_CAM).addScaledVector(MSIDE, Math.sin(a) * 2.5).addScaledVector(MUP, Math.cos(a) * 1.5); T.fp = [0, .12]; T.fl = [.26, 0]; }
  }
  return T;
}

function tick(now) {
  if (!rocket) return;
  const calm = S.sec >= 7 && !S.launched && quality !== 'cinema'; if (calm && now - tPrev < 38) return; // static sections: ~26 fps saves the battery
  const dt = clamp((now - tPrev) / 1000, 0, .05); tPrev = Math.max(tPrev, now); frames++;
  if (now - tF > 600) { fps = Math.round(frames * 1000 / (now - tF)); frames = 0; tF = now; const pr = gl.getPixelRatio(); if (calm) {} else if (fps < 42 && pr > .75) gl.setPixelRatio(Math.max(.75, pr - .2)); else if (fps > 56 && pr < prMax) gl.setPixelRatio(Math.min(prMax, pr + .1)); }
  const w = canvasEl.clientWidth || innerWidth, h = canvasEl.clientHeight || innerHeight; fit(w, h);
  const T = pose(now), aspect = w / h, land = sm((aspect - .8) / .5);
  T.fx = lerp(T.fp[0], T.fl[0], land); T.fy = lerp(T.fp[1], T.fl[1], land);
  if (S.snap) { A.pos.copy(T.pos); A.tgt.copy(T.tgt); KEYS.forEach(k => A[k] = T[k]); for (const n in parts) parts[n].userData.f = 0; S.snap = false; }
  A.drift = lerp(A.drift, T.drift, 1 - Math.pow(.01, dt));
  const k = 1 - Math.pow(lerp(.002, .12, A.drift), dt), kq = 1 - Math.pow(.0004, dt);
  A.pos.lerp(T.pos, k); A.tgt.lerp(T.tgt, k); KEYS.forEach(n => { if (n !== 'drift') A[n] = lerp(A[n], T[n], n === 'alt' || n === 'tilt' || n === 'yaw' ? kq : k); });
  // vehicle: exploded view, staging, fairing, payload
  for (const n in parts) { const g = parts[n], u = g.userData; u.f = lerp(u.f, T.ex[n] || 0, k); g.position.copy(u.home).addScaledVector(u.explode, u.f); g.rotation.y = u.f * (n === 'fuel' ? .4 : n === 'body' ? -.3 : 0); }
  fins.forEach(f => f.position.copy(f.userData.home).addScaledVector(f.userData.dir, parts.gridfins.userData.f * 3.2));
  const sp = A.sep; s1.position.set(sp * 9, 15 - Math.pow(sp, 1.7) * 150, 0); s1.rotation.z = sp * .9; s1.visible = sp < .985;
  const o = Math.max(A.open, parts.fairing.userData.f * .35), fs = A.fsep;
  fairA.position.set(o * 3.4 + fs * 26, -fs * 8, 0); fairA.rotation.z = -(o * .5 + fs * 1.5); fairB.position.set(-o * 3.4 - fs * 26, -fs * 8, 0); fairB.rotation.z = o * .5 + fs * 1.5; parts.fairing.visible = fs < .985;
  parts.payload.position.y += A.payY; wings.forEach(wg => { wg.rotation.z = -wg.userData.s * sm(A.deploy * 1.4) * Math.PI / 2; wg.userData.pnl.scale.z = 1 + 1.3 * sm((A.deploy - .5) / .5); });
  arms.forEach(p => p.rotation.y = A.arms * 1.3);
  rocket.position.set(0, BASE + PIV + A.alt, 0); rocket.rotation.set(0, A.yaw, A.tilt);
  const dr = A.drift * .5; rocket.position.x += Math.sin(now / 7000) * 1.2 * dr; rocket.position.y += Math.cos(now / 8000) * .9 * dr; rocket.rotation.x = Math.sin(now / 9000) * .05 * dr;
  rocket.updateMatrixWorld(); focus.set(0, 45 - PIV, 0).applyMatrix4(rocket.matrixWorld);
  // environment
  const sp2 = A.space; sky.material.uniforms.uSpace.value = sp2; scene.fog.density = .0028 * (1 - sp2); scene.fog.color.setRGB(.0055, .0085, .012).multiplyScalar(1 - sp2);
  complex.visible = A.alt < 700; smoke.mesh.visible = complex.visible; beamMat.uniforms.uI.value = .07 * (1 - sp2);
  stars.material.uniforms.uOp.value = lerp(.22, 1, sp2); stars.material.uniforms.uPx.value = gl.getPixelRatio();
  const sunDir = _w.copy(SUN_ASC).lerp(SUN_LUN, A.lunar).normalize();
  earth.visible = atmo.visible = A.efade > .01; earth.position.copy(focus).addScaledVector(EDIR, RE + A.egap); atmo.position.copy(earth.position);
  const eu = earth.material.uniforms; eu.uFade.value = A.efade; eu.uSun.value.copy(sunDir); eu.uTime.value = now / 1000; atmo.material.uniforms.uSun.value.copy(sunDir); atmo.material.uniforms.uFade.value = A.efade;
  moon.visible = A.lunar > .01; moon.position.copy(focus).addScaledVector(MDIR, 5200 * Math.pow(30, 1 - A.lunar)); moon.material.uniforms.uFade.value = clamp(A.lunar * 4); moon.material.uniforms.uSun.value.copy(sunDir);
  sun.visible = sp2 > .2; sun.material.opacity = sp2; sun.position.copy(cam.position).addScaledVector(sunDir, 60000);
  sunL.intensity = 3.4 * sp2; sunL.position.copy(focus).addScaledVector(sunDir, 200); sunL.target.position.copy(focus); padKey.intensity = 1.6 * (1 - sp2); spots.forEach(s => s.intensity = 1050 * (1 - sp2));
  hemi.color.setRGB(.012, .016, .022).multiplyScalar(1 - sp2); hemi.groundColor.setRGB(lerp(.002, .006, sp2), lerp(.002, .014, sp2), lerp(.002, .03, sp2)); hemi.intensity = 7 + 4 * sp2;
  const env = sp2 > .5 ? envSpace : envPad; if (scene.environment !== env) scene.environment = env;
  rimL.position.set(rocket.position.x + 10, rocket.position.y + 20, -16); rimL.intensity = 40 * (1 - .7 * sp2);
  M.red.opacity = Math.sin(now / 600) > .6 ? 1 : .12;
  // camera
  const sh = T.shake * .35, mx = S.mouse[0] * .6, my = S.mouse[1] * .4;
  cam.position.set(A.pos.x + (Math.random() - .5) * sh + mx, A.pos.y + (Math.random() - .5) * sh - my, A.pos.z + (Math.random() - .5) * sh);
  cam.lookAt(A.tgt); cam.fov = A.fov * (aspect > 1 ? .9 : 1); cam.setViewOffset(w, h, -A.fx * w, A.fy * h, w, h); cam.updateProjectionMatrix(); sky.position.copy(cam.position); stars.position.copy(cam.position);
  // exhaust, light, smoke, vapour
  const th = A.thrust, flick = .88 + Math.random() * .24, tm = now / 1000;
  plume.visible = th > .01; plume.material.uniforms.uThrust.value = th * flick; plume.material.uniforms.uVac.value = A.vac; plume.material.uniforms.uTime.value = tm;
  glows.forEach(g => { g.material.opacity = clamp(th * 3) * flick; g.scale.setScalar(1.2 + th * 1.6); });
  flameL.intensity = 900 * th * flick * (1 - sp2 * .8);
  vplume.visible = A.mvac > .01; vplume.material.uniforms.uThrust.value = A.mvac * (.32 + Math.random() * .03); vplume.material.uniforms.uTime.value = tm; M.mvac.emissiveIntensity = A.mvac * 3.2;
  if (th > .5 && !buzzed && S.sec === 4) { buzzed = true; try { if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) navigator.vibrate([40, 30, 80]); } catch (e) {} } if (th < .1) buzzed = false;
  updateSmoke(dt, th); updateVapor(dt);
  gl.render(scene, cam);
  if (!first) { first = true; onFirst && onFirst(); setTimeout(loadSpace, 1200); }
}
// Resize on width changes only: a phone's address bar showing/hiding changes the height and must not re-allocate the buffer.
let lw = 0, lh = 0; function fit(w, h) { if (w === lw && Math.abs(h - lh) < 120) return; lw = w; lh = h; gl.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
function updateSmoke(dt, th) {
  flameL.getWorldPosition(flamePos);
  const on = th > .08 && A.alt < 180 && (S.sec <= 5 || S.launched), rate = (CINEMA ? 70 : 24) * th * dt;
  if (on) for (let i = 0; i < rate + Math.random() - .5; i++) { const r = Math.random();
    if (r < .45) emit(smoke, (Math.random() - .5) * 8, 3 + Math.random() * 2, -30 - Math.random() * 4, (Math.random() - .5) * 10, 4 + Math.random() * 6, -(14 + Math.random() * 18), 4 + Math.random() * 3, 6, 24 + Math.random() * 14);
    else if (r < .85 || A.alt < 6) { const a = Math.random() * TAU, v = 9 + Math.random() * 16; emit(smoke, Math.cos(a) * 6, 2.4 + Math.random() * 2, Math.sin(a) * 6, Math.cos(a) * v, 1.5 + Math.random() * 4, Math.sin(a) * v, 3.5 + Math.random() * 3, 5, 18 + Math.random() * 12); }
    else emit(smoke, flamePos.x + (Math.random() - .5) * 3, flamePos.y - 8, flamePos.z + (Math.random() - .5) * 3, (Math.random() - .5) * 3, -6, (Math.random() - .5) * 3, 3 + Math.random() * 2, 4, 12 + Math.random() * 8); }
  smoke.mat.uniforms.uLight.value = .5 * (1 - A.space);
  step(smoke, dt, .85, .55, 1.4, (x, y, z) => clamp(1 - Math.hypot(x - flamePos.x, y - flamePos.y, z - flamePos.z) / 42) * th * 1.6);
}
function updateVapor(dt) {
  const v = A.vapor * (1 - A.space) * (A.sep < .01 ? 1 : 0), n = (CINEMA ? 40 : 18) * v * dt;
  for (let i = 0; i < n + Math.random() - .5; i++) { const a = Math.random() * TAU, top = Math.random() < .35, y = top ? Y2 - 1.2 + Math.random() : 27.2 + Math.random() * 2.4;
    emit(vapor, Math.sin(a) * (R + .1), y, Math.cos(a) * (R + .1), Math.sin(a) * .9, -1 - Math.random() * 2, Math.cos(a) * .9, 1.6 + Math.random() * 1.4, .5, 2.4 + Math.random() * 1.6); }
  vapor.mat.uniforms.uLight.value = .7; step(vapor, dt, .2 * clamp(A.vapor * 2) * (1 - A.space), .4, -.6, null);
}

window.AlephRocket = {
  init(canvas, opts = {}) {
    quality = opts.quality || 'standard'; CINEMA = quality === 'cinema'; onFirst = opts.onFirstFrame || null; canvasEl = canvas;
    gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); ANISO = Math.min(CINEMA ? 8 : 4, gl.capabilities.getMaxAnisotropy()); PPM = CINEMA ? 68 : 34;
    prMax = Math.min(devicePixelRatio, CINEMA ? 2 : 1.5); gl.setPixelRatio(Math.min(prMax, CINEMA ? 1.5 : 1.25)); gl.shadowMap.enabled = true; gl.shadowMap.type = THREE.PCFSoftShadowMap;
    gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.05;
    scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x000000, .0028);
    cam = new THREE.PerspectiveCamera(60, 1, .5, 400000);
    MARK.img.src = 'uploads/aleph-mark.png';
    materials(); buildRocket(); buildComplex(); buildSpace(); buildLights();
    Promise.all([document.fonts.load('600 40px Archivo').catch(() => {}), new Promise(r => { MARK.img.onload = () => { MARK.ok = true; r(); }; MARK.img.onerror = r; if (MARK.img.complete && MARK.img.naturalWidth) { MARK.ok = true; r(); } })]).then(repaint);
    if (CINEMA) addEventListener('pointermove', e => { S.mouse = [e.clientX / innerWidth * 2 - 1, e.clientY / innerHeight * 2 - 1]; }, { passive: true });
    let logged = 0; loop = now => { try { tick(now); } catch (e) { if (logged++ < 3) console.warn('AlephRocket tick: ' + (e && e.stack || e)); } };
    gl.setAnimationLoop(loop);
  },
  // Stops drawing while a full-screen world covers the canvas, so the iframe gets the GPU.
  pause(on) { if (gl) gl.setAnimationLoop(on ? null : loop); },
  set(o) { Object.assign(S, o); },
  setAccent(hex) { const c = new THREE.Color(hex); if (M.accent) M.accent.emissive.copy(c); if (rimL) rimL.color.copy(c); },
  launch() { S.launched = true; S.launchAt = performance.now(); S.snap = true; },
  reset() { S.launched = false; S.snap = true; },
  // Altitude for the HUD in km: ascent maps to a ~210 km parking orbit, then the coast counts up to lunar distance.
  stats() { return { fps, alt: A.alt * .157 + A.lunar * 384190, thrust: Math.max(A.thrust, A.mvac), draws: gl ? gl.info.render.calls : 0, quality }; }
};
