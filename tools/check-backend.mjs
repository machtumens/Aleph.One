// Smoke test for the public backend, safe on the live site: no sign-in, files one brief named "check-backend <time>".
//   node tools/check-backend.mjs https://your-domain
// The full dashboard attack test (accounts, 2FA, roles) is tools/test-admin.mjs and only runs on a fresh local copy.
import assert from 'node:assert/strict';

const [base] = process.argv.slice(2);
if (!base) { console.error('usage: node tools/check-backend.mjs <site-url>'); process.exit(2); }
const url = p => new URL(p, base.replace(/\/?$/, '/')).href, origin = new URL(base).origin;
const lead = body => fetch(url('api/lead.php'), { method: 'POST', headers: { 'content-type': 'text/plain;charset=UTF-8', origin }, body });

assert.equal((await fetch(url('api/lead.php'))).status, 405, 'GET is refused');
assert.equal((await fetch(url('api/lead.php'), { method: 'POST', headers: { origin: 'https://evil.example' }, body: '{}' })).status, 403, 'other sites are refused');
assert.equal((await lead('not json')).status, 400, 'bad JSON is refused');
assert.equal((await lead(JSON.stringify({ name: ' ', business: 'x' }))).status, 422, 'a name is required');
assert.equal((await lead('x'.repeat(20001))).status, 413, 'huge bodies are refused');
assert.equal((await lead(JSON.stringify({ name: 'check-backend ' + Date.now(), business: 'smoke test', package: 'Medium', project_price: 2000000 }))).status, 201, 'a good brief is saved');
for (const p of ['api/config.php', 'api/config.php.bak', 'api/lib.php', 'api/config.sample.php', 'admin/_auth.php', 'admin/_inbox.php', 'admin/_apps.php',
  '.htaccess', 'api/.schema-x', 'error_log', 'api/error_log', 'admin/error_log', 'admin/php_errorlog', 'backup.zip', 'aleph-errors.log'])
  assert.equal((await fetch(url(p))).status, 403, p + ' is not reachable');

const home = await fetch(url(''));
for (const h of ['x-frame-options', 'permissions-policy', 'x-content-type-options', 'content-security-policy']) assert.ok(home.headers.get(h), 'site sends ' + h);
const admin = await fetch(url('admin/'));
assert.equal(admin.status, 200, 'dashboard sign-in page loads');
assert.match(admin.headers.get('content-security-policy') || '', /default-src 'none'/, 'dashboard allows no scripts');
assert.match(admin.headers.get('cache-control') || '', /no-store/, 'dashboard is never cached');
assert.equal(admin.headers.getSetCookie().length, 0, 'an anonymous visit makes no session');
assert.ok(!/frame-ancestors 'self'/.test(admin.headers.get('content-security-policy') || ''), 'dashboard gets only its own page policy');
assert.match(await admin.text(), /Sign in with Google/, 'dashboard shows the Google sign-in');
const forged = await fetch(url('admin/'), { method: 'POST', redirect: 'manual', body: new URLSearchParams({ do: 'sign_in', email: 'a@b.co', password: 'x' }) });
assert.equal(forged.status, 303, 'forms without a CSRF token are turned back to a fresh form');
console.log('backend ok:', base);
