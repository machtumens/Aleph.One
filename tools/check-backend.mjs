// Smoke test for the PHP backend (api/lead.php and admin/). Works against the local Docker copy or the live Hostinger site:
//   node tools/check-backend.mjs https://your-domain <admin_password>
// It files one brief named "check-backend <time>" and makes one wrong sign-in. Delete that brief in phpMyAdmin if it matters.
import assert from 'node:assert/strict';

const [base, password] = process.argv.slice(2);
if (!base || !password) { console.error('usage: node tools/check-backend.mjs <site-url> <admin_password>'); process.exit(2); }
const url = p => new URL(p, base.replace(/\/?$/, '/')).href, origin = new URL(base).origin;
const lead = body => fetch(url('api/lead.php'), { method: 'POST', headers: { 'content-type': 'text/plain;charset=UTF-8', origin }, body });
const tag = 'check-backend ' + Date.now(), xss = '<img src=x onerror=alert(1)>';

assert.equal((await fetch(url('api/lead.php'))).status, 405, 'GET is refused');
assert.equal((await fetch(url('api/lead.php'), { method: 'POST', headers: { origin: 'https://evil.example' }, body: '{}' })).status, 403, 'other sites are refused');
assert.equal((await lead('not json')).status, 400, 'bad JSON is refused');
assert.equal((await lead(JSON.stringify({ name: ' ', business: 'x' }))).status, 422, 'a name is required');
assert.equal((await lead('x'.repeat(20001))).status, 413, 'huge bodies are refused');
assert.equal((await lead(JSON.stringify({ name: tag, business: xss, when: 'This week', email: 'a@b.co', social: 'javascript:alert(1)', package: 'Medium', project_price: 2000000 }))).status, 201, 'a good brief is saved');
for (const p of ['api/config.php', 'api/lib.php', 'api/config.sample.php']) assert.equal((await fetch(url(p))).status, 403, p + ' is not reachable');

// Admin: a cookie jar by hand (one session cookie), CSRF token read from the form.
const jar = {};
const keep = r => { for (const c of r.headers.getSetCookie()) { const [k, v] = c.split(';')[0].split('='); jar[k] = v; } return r; };
const cookie = () => Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
const page = async () => (keep(await fetch(url('admin/'), { headers: { cookie: cookie() } }))).text();
const post = async fields => keep(await fetch(url('admin/'), { method: 'POST', redirect: 'manual', headers: { cookie: cookie(), 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields) }));
const csrf = async () => (await page()).match(/name="csrf" value="([^"]+)"/)[1];

assert.equal((await post({ password })).status, 400, 'sign-in without the CSRF token is refused');
assert.match(await (await post({ csrf: await csrf(), password: 'wrong-' + Date.now() })).text(), /Wrong password/, 'a wrong password is refused');
assert.equal((await post({ csrf: await csrf(), password })).status, 303, 'the right password signs in');
const inbox = await page();
assert.ok(inbox.includes(tag), 'the saved brief shows in the inbox');
assert.ok(!inbox.includes(xss) && inbox.includes('&lt;img src=x'), 'brief text is escaped');
assert.ok(!/href="(https:\/\/)?javascript/i.test(inbox), 'no script links');
console.log('backend ok:', base);
