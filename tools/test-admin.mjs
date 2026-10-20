// Attack test for the dashboard: Google sign-in (against a fake Google run here), the admin list, Google identity binding,
// authenticator codes, connect codes, step-up, CSRF, sessions, switch-off, escaping, export.
// LOCAL ONLY, on a fresh database, with a test settings file:
//   site_url http://localhost:8080, google_client_id test-client, google_client_secret test-client-secret,
//   google_auth_url http://localhost:9999/auth, google_token_url http://host.docker.internal:9999/token,
//   admin_emails owner@example.test, second@example.test, third@example.test
//   node tools/test-admin.mjs http://localhost:8080 <setup_key>
import assert from 'node:assert/strict';
import { createHmac, createHash, randomBytes } from 'node:crypto';
import http from 'node:http';

const [base, setupKey] = process.argv.slice(2);
if (!base || !setupKey) { console.error('usage: node tools/test-admin.mjs <local-url> <setup_key>'); process.exit(2); }
const url = p => new URL(p, base.replace(/\/?$/, '/')).href, origin = new URL(base).origin;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- Fake Google: /auth bounces straight back with a code for `next`; /token checks client secret, redirect URI and PKCE ----
const codes = new Map();
let next = null;
const mock = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://mock');
  if (u.pathname === '/auth') {
    const q = Object.fromEntries(u.searchParams), code = randomBytes(16).toString('hex');
    codes.set(code, { ...q, who: next });
    const back = new URL(q.redirect_uri);
    back.searchParams.set('code', code);
    back.searchParams.set('state', q.state);
    return res.writeHead(302, { location: back.href }).end();
  }
  let body = '';
  req.on('data', d => (body += d)).on('end', () => {
    const f = new URLSearchParams(body), c = codes.get(f.get('code'));
    codes.delete(f.get('code'));
    const pkce = c && createHash('sha256').update(f.get('code_verifier') || '').digest('base64url') === c.code_challenge;
    if (!c || !pkce || f.get('client_secret') !== 'test-client-secret' || f.get('redirect_uri') !== c.redirect_uri) return res.writeHead(400).end('{"error":"invalid_grant"}');
    const now = Math.floor(Date.now() / 1000), w = c.who;
    const claims = { iss: 'https://accounts.google.com', aud: c.client_id, sub: w.sub ?? 'sub-' + w.email, iat: now, exp: now + 3600, nonce: c.nonce,
      email: w.email, email_verified: true, name: w.name, ...w.override };
    const jwt = [{ alg: 'RS256' }, claims].map(o => Buffer.from(JSON.stringify(o)).toString('base64url')).join('.') + '.sig';
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id_token: jwt, access_token: 'x' }));
  });
});
await new Promise(r => mock.listen(9999, '0.0.0.0', r));

// TOTP as the authenticator apps do it. Each account remembers its last step: the server takes each code once.
const b32 = s => { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = ''; for (const c of s.replace(/[^A-Z2-7]/g, '')) bits += A.indexOf(c).toString(2).padStart(5, '0');
  const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); };
const totp = (secret, step) => { const m = Buffer.alloc(8); m.writeBigUInt64BE(BigInt(step)); const h = createHmac('sha1', b32(secret)).update(m).digest();
  return String((h.readUInt32BE(h[19] & 15) & 0x7fffffff) % 1e6).padStart(6, '0'); };
const nowStep = () => Math.floor(Date.now() / 30000);
async function nextCode(acct) {
  const s = Math.max(acct.last + 1, nowStep() - 1);
  while (s > nowStep() + 1) await sleep(1000);
  acct.last = s;
  return totp(acct.secret, s);
}

// A browser with its own cookie jar. post() reads the CSRF token from the page first, like a real form.
class Browser {
  jar = {};
  async req(path, { method = 'GET', form, headers = {} } = {}) {
    const r = await fetch(url(path), { method, redirect: 'manual', body: form && new URLSearchParams(form),
      headers: { cookie: Object.entries(this.jar).map(([k, v]) => k + '=' + v).join('; '), ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}), ...headers } });
    for (const c of r.headers.getSetCookie()) { const kv = c.split(';')[0], i = kv.indexOf('='); this.jar[kv.slice(0, i)] = kv.slice(i + 1); }
    return r;
  }
  async follow(r, from, stopAt) {
    while (r.status === 302 || r.status === 303) {
      from = new URL(r.headers.get('location'), url(from)).href;
      if (stopAt && stopAt(from)) return { stoppedAt: from };
      r = await this.req(from);
    }
    return { status: r.status, html: await r.text(), headers: r.headers };
  }
  async page(path = 'admin/', stopAt) { return this.follow(await this.req(path), path, stopAt); }
  async post(fields, path = 'admin/', extra = {}) {
    const csrf = fields.csrf ?? (await this.page(path)).html.match(/name="csrf" value="([^"]+)"/)[1];
    const r = await this.req(path, { method: 'POST', form: { ...fields, csrf }, ...extra });
    return r.status === 303 ? this.follow(r, path) : { status: r.status, html: await r.text(), headers: r.headers };
  }
  google(who) { next = who; return this.page('admin/?login=1'); }
  async googleUntilCallback(who) { next = who; return new URL((await this.page('admin/?login=1', u => u.includes('/admin/?code='))).stoppedAt); }
}
const keyOf = html => html.match(/class="key"[^>]*>([^<]+)</)[1].replace(/\s/g, '');
const connectOf = html => html.match(/class="key copy">([A-Z2-7-]+)</)[1];
const apos = "(&#0?39;|')";
const lead = body => fetch(url('api/lead.php'), { method: 'POST', headers: { origin }, body: JSON.stringify(body) });
const OWNER = { email: 'owner@example.test', name: 'Owner <b>One</b>', last: 0 };
const SECOND = { email: 'second@example.test', name: 'Second Admin', last: 0 };
const tab = new Browser();

try {
  assert.match((await tab.page()).html, /Sign in with Google/, 'sign-in page offers Google');

  // Google answers the dashboard must refuse
  assert.match((await tab.google({ email: 'stranger@gmail.com', name: 'X' })).html, new RegExp('isn' + apos + 't on the admin list'), 'emails off the list are refused');
  for (const override of [{ email_verified: false }, { email_verified: 'true' }, { aud: 'someone-elses-client' }, { aud: ['test-client'] }, { iss: 'https://evil.example' }, { exp: 1 }, { nonce: 'replayed' }])
    assert.match((await tab.google({ ...OWNER, override })).html, new RegExp('didn' + apos + 't go through'), 'refused: ' + JSON.stringify(override));
  const leg1 = await tab.googleUntilCallback(OWNER);
  assert.match((await tab.page('admin/?code=' + leg1.searchParams.get('code') + '&state=forged')).html, /expired or came from another tab/, 'a forged state is refused');
  assert.match((await tab.page('admin/' + leg1.search)).html, /expired or came from another tab/, 'after a forged try, the real callback is dead too');

  // First admin: Google, then connect the authenticator with the setup key (nobody can make connect codes yet)
  let r = await tab.google(OWNER);
  assert.match(r.html, /Connect your authenticator/, 'first sign-in asks to connect an authenticator');
  OWNER.secret = keyOf(r.html);
  assert.match((await tab.post({ do: 'enroll', connect: 'WRONG-CODE-0000', code: totp(OWNER.secret, nowStep()) })).html, /connect code is wrong or expired/, 'connecting needs a connect code or the setup key');
  assert.match((await tab.post({ do: 'enroll', connect: setupKey, code: totp(OWNER.secret, nowStep() + 5) })).html, new RegExp('didn' + apos + 't match'), 'a wrong code is refused');
  r = await tab.post({ do: 'enroll', connect: setupKey, code: await nextCode(OWNER) });
  assert.match(r.html, /<h1>Briefs<\/h1>/, 'signed in after Google + code');
  assert.ok(!r.html.includes('<b>One</b>') && r.html.includes('&lt;b&gt;One&lt;/b&gt;'), 'names from Google are escaped');

  // Same email, different Google account (recycled address): refused
  assert.match((await new Browser().google({ ...OWNER, sub: 'someone-else' })).html, /belongs to a different Google account/, 'Google identity is bound to the account');

  // Replaying a finished Google callback does nothing
  const replay = new Browser();
  const leg = await replay.googleUntilCallback(OWNER);
  assert.match((await replay.page('admin/' + leg.search)).html, /Enter your code/, 'the callback works the first time');
  assert.match((await replay.page('admin/' + leg.search)).html, /expired or came from another tab/, 'and never again');

  // Each code works once; a second device needs a fresh one
  const tab2 = new Browser();
  assert.match((await tab2.google(OWNER)).html, /Enter your code/);
  assert.match((await tab2.post({ do: 'code', code: totp(OWNER.secret, OWNER.last) })).html, /Wrong code/, 'a used code is refused');
  assert.match((await tab2.post({ do: 'code', code: await nextCode(OWNER) })).html, /<h1>Briefs<\/h1>/, 'a fresh code works');

  // Hostile brief: script, formula, fake link, SQL
  const evil = { name: '=HYPERLINK("http://evil.example","x")', business: '<img src=x onerror=alert(1)>', email: 'a@b.co', social: 'javascript:alert(1)',
    about: "x'); DROP TABLE leads; --", package: 'Medium', project_price: 2000000 };
  assert.equal((await lead(evil)).status, 201);
  r = await tab.page();
  assert.ok(!r.html.includes('<img src=x') && r.html.includes('&lt;img src=x'), 'brief text is escaped');
  assert.ok(!/href="(https:\/\/)?javascript/i.test(r.html), 'no script links');
  assert.ok(r.html.includes('DROP TABLE leads'), 'SQL in a brief is stored as plain text');
  const id = r.html.match(/id="b(\d+)"/)[1];
  assert.match((await tab.page("admin/?q=' OR 1=1 --")).html, /Nothing matches/, 'search is not injectable');
  assert.match((await tab.post({ do: 'lead_save', id, status: 'contacted', notes: '<script>alert(1)</script> called', back: 'status=contacted' })).html, /Saved brief #/);
  assert.ok((await tab.page('admin/?status=contacted')).html.includes('&lt;script&gt;'), 'notes are escaped');
  assert.match((await tab.post({ do: 'lead_save', id, status: 'hacked', notes: '' })).html, /Nothing saved/, 'unknown status is refused');
  assert.match((await tab.post({ do: 'lead_save', 'id[]': id, status: 'won', notes: '' })).html, /Nothing saved/, 'list-shaped fields are refused, not read as 1');

  // Export needs a fresh code: locked after "Lock now", unlocked again with a new code
  await tab.post({ do: 'stepdown', view: 'inbox' });
  assert.match((await tab.post({ do: 'export' })).html, /Enter your current authenticator code/, 'export needs a fresh code');
  assert.match((await tab.post({ do: 'stepup', code: totp(OWNER.secret, OWNER.last), view: 'inbox' })).html, /Wrong code/, 'unlock refuses a used code');
  assert.match((await tab.post({ do: 'stepup', code: await nextCode(OWNER), view: 'inbox' })).html, /Unlocked for/);
  const exp = await tab.req('admin/', { method: 'POST', form: { do: 'export', csrf: (await tab.page()).html.match(/name="csrf" value="([^"]+)"/)[1] } });
  const csv = await exp.text();
  assert.ok(csv.includes("'=HYPERLINK") && !/(^|,|\n)"?=HYPERLINK/.test(csv), 'formulas are neutralised in the export');

  // CSRF and other sites: nothing changes
  const csrf = (await tab.page()).html.match(/name="csrf" value="([^"]+)"/)[1];
  assert.match((await tab.post({ do: 'lead_save', id, status: 'won', csrf: 'x'.repeat(64) })).html, /had expired, so nothing was saved/, 'wrong CSRF token is refused');
  for (const o of ['https://evil.example', 'null']) assert.match((await tab.post({ do: 'lead_save', id, status: 'won', csrf }, 'admin/', { headers: { origin: o } })).html, /had expired/, 'refused from origin ' + o);
  assert.match((await tab.page('admin/?status=won')).html, /Nothing matches/, 'none of those changed anything');

  // Session fixation: a planted session id is never adopted
  const fix = new Browser();
  fix.jar.aleph_admin = 'attackerchosen0123456789abcdefgh';
  await fix.page();
  assert.notEqual(fix.jar.aleph_admin, 'attackerchosen0123456789abcdefgh', 'planted session ids are replaced');

  // Second admin joins with a connect code the first one made; the code works once
  r = await tab.post({ do: 'connect', email: SECOND.email }, 'admin/?view=team');
  const code1 = connectOf(r.html);
  assert.match(r.html, /third@example\.test[\s\S]*?Not connected yet/, 'team lists admins who have not connected');
  const sec = new Browser();
  r = await sec.google(SECOND);
  SECOND.secret = keyOf(r.html);
  assert.match((await sec.post({ do: 'enroll', connect: code1.toLowerCase(), code: await nextCode(SECOND) })).html, /<h1>Briefs<\/h1>/, 'second admin joins with the connect code');
  assert.match((await tab.post({ do: 'toggle_active', email: SECOND.email }, 'admin/?view=team')).html, /can no longer sign in/);
  assert.match((await sec.page()).html, /Sign in with Google/, 'switched-off admin is signed out');
  assert.match((await sec.google(SECOND)).html, /switched off/, 'switched-off admin cannot sign in');
  await tab.post({ do: 'toggle_active', email: SECOND.email }, 'admin/?view=team');
  r = await tab.post({ do: 'reset_2fa', email: SECOND.email }, 'admin/?view=team');
  const code2 = connectOf(r.html);
  r = await sec.google(SECOND);
  assert.match(r.html, /Connect your authenticator/, 'after a reset they connect again');
  SECOND.secret = keyOf(r.html);
  SECOND.last = 0;
  assert.match((await sec.post({ do: 'enroll', connect: code1, code: await nextCode(SECOND) })).html, /connect code is wrong or expired/, 'a used connect code is dead');
  assert.match((await sec.post({ do: 'enroll', connect: code2, code: await nextCode(SECOND) })).html, /<h1>Briefs<\/h1>/, 'the new connect code works');
  assert.match((await tab.post({ do: 'toggle_active', email: OWNER.email }, 'admin/?view=team')).html, /someone else/, 'you cannot switch yourself off');
  assert.match((await tab.post({ do: 'connect', email: 'stranger@gmail.com' }, 'admin/?view=team')).html, /someone else on the admin list/, 'no connect codes for emails off the list');

  // Delete needs the confirm box
  assert.match((await tab.post({ do: 'lead_delete', id })).html, /Not deleted/);
  assert.match((await tab.post({ do: 'lead_delete', id, confirm: 'yes' })).html, /Deleted brief/);

  // AlephOS page renders (live GitHub, or the fallback link if offline)
  assert.match((await tab.page('admin/?view=apps')).html, /AlephOS-releases|Download/, 'AlephOS page shows downloads');

  // The activity log saw all of it; strangers' emails are masked
  const log = (await tab.page('admin/?view=activity')).html;
  for (const a of ['not on list', 'google failed', 'google other id', 'connect code wrong', 'code failed', 'connect code', 'brief saved', 'export', 'switched off', '2fa reset', 'brief deleted'])
    assert.ok(log.includes(a), 'activity log has ' + a);
  assert.ok(!log.includes('stranger@gmail.com') && log.includes('st***@gmail.com'), 'strangers are masked in the log');

  // Sign out everywhere ends the other device
  await tab2.post({ do: 'sign_out_all' }, 'admin/?view=account');
  assert.match((await tab.page()).html, /Sign in with Google/, 'sign out everywhere ends other sessions');

  // Lockout last (it uses up this connection's code attempts): guessing gets stopped
  const t3 = new Browser();
  await t3.google(OWNER);
  let stopped = false;
  for (let i = 0; i < 12 && !stopped; i++) stopped = /Too many attempts/.test((await t3.post({ do: 'code', code: String(100000 + i) })).html);
  assert.ok(stopped, 'guessing codes gets stopped');
  console.log('dashboard attack test ok:', base);
} finally {
  mock.close();
}
