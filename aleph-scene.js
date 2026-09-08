import * as THREE from './vendor/three.module.min.js';

const DARK = new THREE.Color('#070809'), LIT = new THREE.Color('#E4E6E3'), CYAN = new THREE.Color('#35D6F0');
// camera pose per section: [cx,cy,cz, lx,ly,lz, objRotY]
const POSES = [
  [3.4, 2.6, 4.6, -1.6, 0.3, 0, 0.55],   // hero: object right
  [3.0, 2.0, 4.2, -3.2, 0.2, 0, 1.2],    // positioning: drifts to edge
  [1.2, 0.5, 3.4, 0, 0.3, 0, 2.2],       // problem: low, close
  [0.01, 5.2, 0.01, 0, 0, 0, 2.7],       // services: top-down
  [4.6, 0.9, 0.8, 0, 0.3, 0, 3.1],       // process: side
  [3.2, 2.8, 4.0, -1.5, 0.3, 0, 3.7],    // packages / configurator: right of ledger column
  [2.8, 2.2, 3.4, -1.6, 0.3, 0, 4.1],    // add-ons
  [0, 3.6, 8.0, 0, 0, 0, 4.7],           // work: far
  [2.6, 1.2, 3.8, 0, 0.4, 0, 5.3],       // why us
  [0, 0.7, 4.8, 0, 0.3, 0, 6.6],         // technology
  [0, 3.2, 7.4, 0, 0, 0, 7.1],           // testimonials
  [3.6, 1.6, 2.6, 0, 0.2, 0, 7.5],       // faq
  [3.2, 2.4, 4.4, -1.2, 0.2, 0, 8.0],    // final cta
  [3.2, 2.4, 4.4, -1.2, 0.2, 0, 8.3]];   // footer

let R, scene, cam, stack, planes = [], addonGroup, edge, label, labelTex, labelCv, ground, key, rim, fill;
let prog = 0, progS = 0, lit = 0, litS = 0, tier = 'standard', fps = 0, frames = 0, tPrev = performance.now(), tFps = tPrev;
let mouse = { x: 0, y: 0 }, mouseS = { x: 0, y: 0 }, cfg = { tier: 1, addons: [], lines: [] }, onFirst = null, first = false, mech = null;
const lerp = (a, b, t) => a + (b - a) * t, smooth = t => t * t * (3 - 2 * t);

function plateMat(i, n) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.55, 0.06, 0.05 + 0.035 * (i / Math.max(1, n - 1))), roughness: 0.55, metalness: 0.35 });
}
function buildStack(n) {
  planes.forEach(p => { stack.remove(p); p.geometry.dispose(); p.material.dispose(); }); planes = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.03, 2.2), plateMat(i, n));
    m.position.y = i * 0.11; m.castShadow = m.receiveShadow = true; stack.add(m); planes.push(m);
  }
  const top = (n - 1) * 0.11 + 0.016;
  edge.position.set(0, top, 1.1); label.position.y = top + 0.004;
  fill.position.y = top + 0.3;
  layoutAddons(top);
}
function layoutAddons(top) {
  while (addonGroup.children.length) { const c = addonGroup.children[0]; addonGroup.remove(c); c.geometry?.dispose(); c.material?.dispose(); }
  mech = null;
  cfg.addons.forEach((a, i) => {
    let m;
    if (a.material === 'metallic') { m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.34), new THREE.MeshStandardMaterial({ color: 0xC9CCCF, metalness: 1, roughness: 0.18 })); m.position.set(0.98, top * 0.5, -0.4); }
    else if (a.material === 'emissive') { m = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), new THREE.MeshStandardMaterial({ color: 0x0B0C0C, emissive: CYAN, emissiveIntensity: 1.6 })); m.position.set(0, top + 0.16, -1.25); }
    else if (a.material === 'mech') { m = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.045, 16, 48), new THREE.MeshStandardMaterial({ color: 0x9A9EA1, metalness: 0.9, roughness: 0.3 })); m.position.set(-0.98, top * 0.5 + 0.1, 0.4); m.rotation.y = Math.PI / 2; mech = m; }
    else if (a.material === 'plane') { m = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.02, 2.2), plateMat(planes.length, planes.length + 1)); m.position.set(0.18, top + 0.11 + 0.05 * i, 0.12); m.rotation.y = 0.08; }
    else { m = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.02, 0.16), new THREE.MeshStandardMaterial({ color: 0x1B1F22, roughness: 0.5, metalness: 0.4 })); const k = i % 6; m.position.set(-0.86 + (k % 3) * 0.6, Math.min(top, 0.03 + Math.floor(i / 3) * 0.11), k < 3 ? 1.2 : -1.2); }
    m.castShadow = true; addonGroup.add(m);
  });
}
function drawLabel() {
  const c = labelCv.getContext('2d'), W = labelCv.width, H = labelCv.height;
  c.clearRect(0, 0, W, H); c.fillStyle = 'rgba(14,16,18,0.92)'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#35D6F0'; c.fillRect(0, 0, W, 6);
  c.fillStyle = '#9BA1A4'; c.font = '500 40px "Instrument Sans", sans-serif'; c.textBaseline = 'top';
  c.fillText((cfg.lines[0] || '').toUpperCase(), 72, 90);
  c.fillStyle = '#EDEFF0'; c.font = '600 190px Archivo, sans-serif'; c.fillText(cfg.lines[1] || '', 64, 330);
  c.font = '500 56px Archivo, sans-serif'; c.fillStyle = '#EDEFF0'; c.fillText(cfg.lines[2] || '', 72, 600);
  c.fillStyle = '#9BA1A4'; c.font = '400 44px "Instrument Sans", sans-serif';
  (cfg.lines.slice(3)).forEach((l, i) => c.fillText(l, 72, 720 + i * 66));
  labelTex.needsUpdate = true;
}

window.AlephScene = {
  init(canvas, opts = {}) {
    tier = opts.tier || 'standard'; onFirst = opts.onFirstFrame || null;
    R = new THREE.WebGLRenderer({ canvas, antialias: tier === 'cinema', alpha: false, powerPreference: 'high-performance' });
    R.setPixelRatio(Math.min(window.devicePixelRatio, tier === 'cinema' ? 2 : 1.25));
    R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
    R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.05;
    scene = new THREE.Scene(); scene.background = DARK.clone(); scene.fog = new THREE.Fog(DARK.clone(), 8, 18);
    cam = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
    key = new THREE.DirectionalLight(0xFFFFFF, 2.2); key.position.set(4, 7, 3); key.castShadow = true;
    key.shadow.mapSize.set(tier === 'cinema' ? 2048 : 1024, tier === 'cinema' ? 2048 : 1024); key.shadow.camera.left = key.shadow.camera.bottom = -5; key.shadow.camera.right = key.shadow.camera.top = 5; key.shadow.bias = -0.0006; scene.add(key);
    rim = new THREE.PointLight(CYAN, 6, 9, 2); rim.position.set(-1.2, 0.6, 2.4); scene.add(rim);
    scene.add(new THREE.HemisphereLight(0x8A9BA8, 0x0A0B0C, 0.55));
    fill = new THREE.PointLight(0xFFFFFF, 0, 6, 2); scene.add(fill);
    ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true; scene.add(ground);
    stack = new THREE.Group(); scene.add(stack); addonGroup = new THREE.Group(); stack.add(addonGroup);
    edge = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.012, 0.012), new THREE.MeshBasicMaterial({ color: CYAN })); stack.add(edge);
    labelCv = document.createElement('canvas'); labelCv.width = 1024; labelCv.height = 1408; labelTex = new THREE.CanvasTexture(labelCv); labelTex.anisotropy = 4; labelTex.colorSpace = THREE.SRGBColorSpace;
    label = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.2), new THREE.MeshBasicMaterial({ map: labelTex, transparent: true })); label.rotation.x = -Math.PI / 2; stack.add(label);
    buildStack(cfg.tier); drawLabel();
    const resize = () => { const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight; R.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
    resize(); addEventListener('resize', resize);
    if (tier === 'cinema') addEventListener('pointermove', e => { mouse.x = e.clientX / innerWidth * 2 - 1; mouse.y = e.clientY / innerHeight * 2 - 1; }, { passive: true });
    R.setAnimationLoop(tick);
  },
  setProgress(p) { prog = Math.max(0, Math.min(1, p)); },
  setLit(v) { lit = v ? 1 : 0; },
  setConfig(c) {
    const rebuild = c.tier !== cfg.tier || JSON.stringify(c.addons.map(a => a.id)) !== JSON.stringify(cfg.addons.map(a => a.id));
    cfg = { ...cfg, ...c };
    if (!R) return;
    if (rebuild) buildStack(cfg.tier); drawLabel();
  },
  stats() { return { tier, fps, draws: R ? R.info.render.calls : 0 }; }
};

function tick(now) {
  if (tier === 'standard' && now - tPrev < 31) return; // 30 fps cap
  const dt = Math.min(0.05, (now - tPrev) / 1000); tPrev = now;
  frames++; if (now - tFps > 500) { fps = Math.round(frames * 1000 / (now - tFps)); frames = 0; tFps = now; }
  progS = lerp(progS, prog, 1 - Math.pow(0.001, dt)); litS = lerp(litS, lit, 1 - Math.pow(0.02, dt));
  mouseS.x = lerp(mouseS.x, mouse.x, 0.06); mouseS.y = lerp(mouseS.y, mouse.y, 0.06);
  const t = progS * (POSES.length - 1), i = Math.min(POSES.length - 2, Math.floor(t)), f = smooth(t - i), A = POSES[i], B = POSES[i + 1];
  const P = A.map((v, k) => lerp(v, B[k], f));
  cam.position.set(P[0] + mouseS.x * 0.25, P[1] - mouseS.y * 0.15, P[2]); cam.lookAt(P[3], P[4], P[5]);
  stack.rotation.y = P[6] + mouseS.x * 0.08; stack.rotation.x = -mouseS.y * 0.03;
  if (mech) mech.rotation.x += dt * 1.4;
  scene.background.lerpColors(DARK, LIT, litS); scene.fog.color.copy(scene.background);
  ground.material.opacity = 0.38 * litS; rim.intensity = 6 * (1 - litS) + 0.6; key.intensity = 2.2 + 1.6 * litS; fill.intensity = 3 * litS;
  edge.material.color.copy(CYAN).lerp(new THREE.Color('#0FB5D0'), litS);
  R.render(scene, cam);
  if (!first) { first = true; onFirst && onFirst(); }
}
