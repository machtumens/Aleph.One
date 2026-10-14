// Phone flow check: headless Edge as a 390x844 touch phone, real touch drags, so scroll-snap acts like a phone.
// Needs the site on :8000 (python -m http.server 8000). Run: node tools/phone-check.mjs. Exits 1 on any failure.
// Checks: page is exactly phone width, a swipe at the bottom of the hero starts the mission, each swipe moves one story
// beat with the card at a fixed height, PRICES cuts straight to the price list, no page errors.
// ponytail: raw touch drags do not fling, so skipped beats on hard flicks (scroll-snap-stop) can only be checked on a real phone.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = process.env.EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', PORT = 9333, URL = 'http://localhost:8000/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pages = async () => { try { return (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter(t => t.type === 'page' && !t.url.startsWith('edge://')); } catch { return null; } };
const own = !(await pages()); // reuse an Edge already on the port, else start one
if (own) spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + mkdtempSync(join(tmpdir(), 'phone-')), '--no-first-run', '--disable-extensions', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore', detached: true }).unref();
let target; for (let i = 0; i < 150 && !target; i++) { const p = await pages(); target = p && p[0]; if (!target) await sleep(200); }
if (!target) { console.error('Edge did not open port ' + PORT); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map(), errors = [];
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text); };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, d => d.error ? rej(new Error(method + ': ' + d.error.message)) : res(d.result)); ws.send(JSON.stringify({ id: i, method, params })); });
const run = async expr => { const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; };
const touch = (type, pts) => send('Input.dispatchTouchEvent', { type, touchPoints: pts });
const swipe = async (dist = 380, ms = 220) => { const n = Math.round(ms / 16); await touch('touchStart', [{ x: 195, y: 640 }]); for (let i = 1; i <= n; i++) { await sleep(16); await touch('touchMove', [{ x: 195, y: 640 - dist * i / n }]); } await touch('touchEnd', []); await sleep(1400); };
const tap = async sel => { const [x, y] = await run(`const r = document.querySelector('${sel}').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]`); await touch('touchStart', [{ x, y }]); await sleep(60); await touch('touchEnd', []); };

const fails = [], check = (ok, what, got) => { console.log((ok ? 'ok   ' : 'FAIL ') + what + (ok ? '' : '  (got ' + JSON.stringify(got) + ')')); if (!ok) fails.push(what); };
try {
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.navigate', { url: URL + '?t=' + Date.now() });
  for (let i = 0; i < 80; i++) { await sleep(250); if (String(await run(`return document.querySelector('.loader-pct')?.textContent`)).startsWith('100')) break; }
  await sleep(800); await touch('touchStart', [{ x: 195, y: 420 }]); await touch('touchEnd', []); await sleep(1800);

  const w = await run(`return [innerWidth, document.documentElement.scrollWidth]`);
  check(w[0] === 390 && w[1] === 390, 'page is exactly phone width (390)', w);
  const snaps = await run(`return [...document.querySelectorAll('.snap')].map(e => Math.round(e.getBoundingClientRect().top + scrollY))`);
  const st = () => run(`const c = document.querySelector('[data-sec="1"] .card'); return { y: Math.round(scrollY), hold: +getComputedStyle(document.querySelector('.hold')).opacity,
    beat: [...c.querySelectorAll('.beat')].findIndex(b => b.classList.contains('on')), h: Math.round(c.getBoundingClientRect().height) }`);
  await swipe(); let s = await st(); check(s.y === snaps[1] && s.hold === 1, 'first swipe reaches the bottom of the hero and shows the hint', s);
  await swipe(); s = await st(); check(s.y === snaps[2] && s.beat === 0, 'swipe at the bottom of the hero starts the mission (beat 01)', s);
  const h0 = s.h;
  for (let b = 1; b <= 4; b++) { await swipe(); s = await st(); check(s.y === snaps[2 + b] && s.beat === b && s.h === h0, `one swipe = one beat (beat 0${b + 1}), card height fixed`, s); }
  await tap('.pill'); await sleep(2000);
  const p = await run(`return [Math.round(scrollY), Math.round(document.querySelector('#prices').getBoundingClientRect().top + scrollY), document.querySelector('.cut').classList.contains('on'), +getComputedStyle(document.querySelector('.cut')).opacity]`);
  check(Math.abs(p[0] - p[1]) <= 2 && !p[2] && p[3] < .05, 'PRICES cuts straight to the price list and fades back in', p);
  // known and harmless: the raw template's iframe fires onload before the runtime replaces it (see STATE.md)
  const real = errors.filter(e => !/worldLoaded is not defined/.test(e));
  check(real.length === 0, 'no page errors', real);
} catch (e) { check(false, 'run finished', String(e)); }
if (own) await send('Browser.close').catch(() => {});
ws.close(); console.log(fails.length ? fails.length + ' failed' : 'all passed'); process.exit(fails.length ? 1 : 0);
