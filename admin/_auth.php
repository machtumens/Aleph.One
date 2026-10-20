<?php
// Dashboard sign-in, two steps for everyone: Google proves the email (only admin_emails get in), then a 6-digit code
// from an authenticator app (TOTP). Connecting an app needs a one-time connect code from another admin, or setup_key.
declare(strict_types=1);
defined('ALEPH_ADMIN') || exit;

const IDLE_MINUTES = 60;
const SESSION_HOURS = 12;
const STEPUP_MINUTES = 5;   // a fresh code unlocks export, delete and team changes for this long
const LOCK_AFTER = 10;      // attempts (codes, keys) since the last success before an account rests
const LOCK_MINUTES = 15;    // the third rest in a row lasts a day
const CONNECT_HOURS = 24;
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

// The dashboard's own settings, on top of what the public endpoint needs.
function admin_ready(): array {
    $c = config();
    $missing = [];
    if (strlen((string)($c['setup_key'] ?? '')) < 24) $missing[] = 'setup_key';
    foreach (['google_client_id', 'google_client_secret'] as $k) if (trim((string)($c[$k] ?? '')) === '') $missing[] = $k;
    if (!preg_match('~^https?://[^/\s]+$~', rtrim((string)($c['site_url'] ?? ''), '/'))) $missing[] = 'site_url';
    if (!admin_emails()) $missing[] = 'admin_emails';
    if ($missing) setup_needed($missing);
    return $c;
}

function admin_emails(): array {
    $list = config()['admin_emails'] ?? [];
    return is_array($list) ? array_values(array_filter(array_map(fn($e) => strtolower(trim((string)$e)), $list))) : [];
}

function allowed(string $email): bool { return in_array(strtolower(trim($email)), admin_emails(), true); }

// The fake-Google overrides in the settings only count on a localhost test copy.
function google_url(string $which): string {
    $c = config();
    $override = $which === 'auth' ? ($c['google_auth_url'] ?? null) : ($c['google_token_url'] ?? null);
    return test_mode() && is_string($override) ? $override : ($which === 'auth' ? GOOGLE_AUTH : GOOGLE_TOKEN);
}

// X-Forwarded-Proto counts so the site works behind a TLS proxy or CDN. A client faking it only changes its own cookie flag.
function is_https(): bool {
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
}

function admin_path(): string { return rtrim(dirname($_SERVER['SCRIPT_NAME']), '/') . '/'; }

// Must match the "Authorized redirect URI" in Google Cloud exactly. Built from site_url, never from the request's Host header.
function redirect_uri(): string { return rtrim((string)config()['site_url'], '/') . admin_path(); }

// No session (and no session file) until there is a cookie or someone starts signing in, so anonymous visits cost nothing.
function start_session(bool $create): void {
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    session_name(is_https() ? '__Secure-aleph' : 'aleph_admin');
    // Lax, not Strict: the session must survive the redirect back from Google. Every form still needs the CSRF token.
    session_set_cookie_params(['path' => admin_path(), 'secure' => is_https(), 'httponly' => true, 'samesite' => 'Lax']);
    if ($create || isset($_COOKIE[session_name()])) session_start();
}

function has_session(): bool { return session_status() === PHP_SESSION_ACTIVE; }

function csrf(): string { return $_SESSION['csrf'] ??= bin2hex(random_bytes(32)); }

// A post from another site, or a form from an old tab or an earlier session: do nothing, show a fresh form.
function check_csrf(): void {
    if (has_session() && !foreign_origin() && hash_equals(csrf(), param($_POST, 'csrf'))) return;
    if (has_session()) $_SESSION['flash'] = ['bad', 'That form had expired, so nothing was saved. Please try again.'];
    header('Location: ./', true, 303);
    exit;
}

function b64url(string $bin): string { return rtrim(strtr(base64_encode($bin), '+/', '-_'), '='); }

function mask_email(string $e): string {
    $at = strpos($e, '@');
    return $at === false ? '?' : mb_substr($e, 0, min(2, $at)) . '***' . substr($e, $at);
}

function user_by_id(int $id): ?array {
    $q = db()->prepare('SELECT * FROM users WHERE id = ? AND active = 1');
    $q->execute([$id]);
    return $q->fetch() ?: null;
}

// The signed-in person, re-read on every request: switching someone off, removing their email from admin_emails,
// or "sign out everywhere" (which bumps `gen`) ends their sessions at once.
function current_user(): ?array {
    if (!has_session()) return null;
    $id = (int)($_SESSION['uid'] ?? 0);
    if ($id < 1) return null;
    $now = time();
    $u = user_by_id($id);
    if (!$u || !allowed($u['email']) || (int)$u['gen'] !== (int)($_SESSION['gen'] ?? -1)
        || $now - (int)($_SESSION['auth_at'] ?? 0) > SESSION_HOURS * 3600 || $now - (int)($_SESSION['seen_at'] ?? 0) > IDLE_MINUTES * 60) {
        sign_out();
        return null;
    }
    $_SESSION['seen_at'] = $now;
    return $u;
}

function sign_in(array $u): void {
    session_regenerate_id(true);
    unset($_SESSION['pending'], $_SESSION['enroll'], $_SESSION['csrf']);
    $_SESSION['uid'] = (int)$u['id'];
    $_SESSION['gen'] = (int)$u['gen'];
    $_SESSION['auth_at'] = $_SESSION['seen_at'] = $_SESSION['stepup_at'] = time(); // a code was just typed
    db()->prepare('UPDATE users SET failed = 0, strikes = 0, locked_until = NULL, last_login_at = UTC_TIMESTAMP() WHERE id = ?')->execute([$u['id']]);
    log_event((int)$u['id'], 'sign_in');
}

function sign_out(): void {
    $_SESSION = [];
    session_regenerate_id(true);
}

function locked(array $u): bool {
    return $u['locked_until'] !== null && strtotime($u['locked_until'] . ' UTC') > time();
}

// Counts an attempt before checking it, so parallel requests can't each get a free guess. False = the account must rest.
function charge(array $u): bool {
    if (locked($u)) return false;
    db()->prepare('UPDATE users SET failed = failed + 1 WHERE id = ?')->execute([$u['id']]);
    $q = db()->prepare('SELECT failed, strikes FROM users WHERE id = ?');
    $q->execute([$u['id']]);
    $r = $q->fetch();
    if ((int)$r['failed'] <= LOCK_AFTER) return true;
    $minutes = (int)$r['strikes'] >= 2 ? 1440 : LOCK_MINUTES;
    db()->prepare('UPDATE users SET locked_until = UTC_TIMESTAMP() + INTERVAL ' . $minutes . ' MINUTE, failed = 0, strikes = strikes + 1 WHERE id = ? AND failed > ?')
        ->execute([$u['id'], LOCK_AFTER]);
    log_event((int)$u['id'], 'locked', 'resting ' . $minutes . ' minutes');
    return false;
}

// Authenticator secrets are stored encrypted (AES-256-GCM, key derived from `secret`): a leaked database dump alone can't make codes.
function seal(string $plain): string {
    $iv = random_bytes(12);
    $ct = openssl_encrypt($plain, 'aes-256-gcm', key_for('totp'), OPENSSL_RAW_DATA, $iv, $tag);
    return 'v1:' . base64_encode($iv . $tag . $ct);
}

function unseal(?string $box): string {
    $raw = is_string($box) && str_starts_with($box, 'v1:') ? base64_decode(substr($box, 3), true) : false;
    if ($raw === false || strlen($raw) < 29) return '';
    $plain = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', key_for('totp'), OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
    return $plain === false ? '' : $plain;
}

// Checks a code against the person's app and claims its time step, so the same code never works twice, even in parallel.
function claim_code(array $u, string $code): bool {
    $step = totp_match(unseal($u['totp_secret']), $code, (int)$u['totp_step']);
    if ($step === null) return false;
    $q = db()->prepare('UPDATE users SET totp_step = ?, failed = 0 WHERE id = ? AND totp_step < ?');
    $q->execute([$step, $u['id'], $step]);
    return $q->rowCount() === 1;
}

// Step 1a: send the browser to Google, with a one-time state (CSRF), nonce (replay) and PKCE verifier (code theft).
function google_start(): void {
    $c = admin_ready();
    if (over_limit('google', 20, LOCK_MINUTES)) { flash('Too many sign-in attempts from this connection. Wait 15 minutes.', 'bad'); go(); }
    $o = ['state' => b64url(random_bytes(32)), 'nonce' => b64url(random_bytes(32)), 'verifier' => b64url(random_bytes(32)), 'at' => time()];
    $_SESSION['oauth'] = $o;
    unset($_SESSION['pending'], $_SESSION['enroll']);
    go(google_url('auth') . '?' . http_build_query([
        'client_id' => $c['google_client_id'], 'redirect_uri' => redirect_uri(), 'response_type' => 'code',
        'scope' => 'openid email profile', 'state' => $o['state'], 'nonce' => $o['nonce'], 'prompt' => 'select_account',
        'code_challenge' => b64url(hash('sha256', $o['verifier'], true)), 'code_challenge_method' => 'S256',
    ]));
}

// Step 1b: Google sends the browser back with a code. Swap it for an ID token directly with Google (server to server,
// over TLS, which per OpenID Connect stands in for checking the token's signature), then check every claim.
function google_callback(): string {
    $o = $_SESSION['oauth'] ?? null;
    unset($_SESSION['oauth']); // one use, whatever happens next
    if (!$o || time() - $o['at'] > 600 || !hash_equals($o['state'], param($_GET, 'state'))) return 'That sign-in expired or came from another tab. Try again.';
    if (isset($_GET['error'])) return 'Google sign-in was cancelled.';
    $c = admin_ready();
    [$status, $tok] = http_json(google_url('token'), [
        'code' => param($_GET, 'code'), 'client_id' => $c['google_client_id'], 'client_secret' => $c['google_client_secret'],
        'redirect_uri' => redirect_uri(), 'grant_type' => 'authorization_code', 'code_verifier' => $o['verifier'],
    ]);
    $parts = explode('.', (string)($tok['id_token'] ?? ''));
    $claims = $status === 200 && count($parts) === 3 ? json_decode((string)base64_decode(strtr($parts[1], '-_', '+/')), true) : null;
    $ok = is_array($claims)
        && in_array($claims['iss'] ?? '', GOOGLE_ISSUERS, true)
        && ($claims['aud'] ?? '') === $c['google_client_id']
        && (int)($claims['exp'] ?? 0) > time()
        && hash_equals($o['nonce'], (string)($claims['nonce'] ?? ''))
        && ($claims['email_verified'] ?? false) === true
        && is_string($claims['email'] ?? null) && is_string($claims['sub'] ?? null) && $claims['sub'] !== '';
    if (!$ok) { log_event(null, 'google_failed', 'token refused, HTTP ' . $status); return 'Google sign-in didn\'t go through. Try again.'; }
    $email = strtolower($claims['email']);
    if (!allowed($email)) { log_event(null, 'not_on_list', mask_email($email)); return 'That Google account isn\'t on the admin list.'; }

    $q = db()->prepare('SELECT * FROM users WHERE email = ?');
    $q->execute([$email]);
    $u = $q->fetch() ?: null;
    if (!$u) {
        $name = mb_substr(trim((string)($claims['name'] ?? '')), 0, 80) ?: strstr($email, '@', true);
        db()->prepare('INSERT INTO users (email, name, google_sub, created_at) VALUES (?, ?, ?, UTC_TIMESTAMP())')->execute([$email, $name, $claims['sub']]);
        $q->execute([$email]);
        $u = $q->fetch();
    }
    // The account belongs to the Google identity (`sub`) that first used it, not just the address: a recycled or
    // re-registered address is a different identity and is refused.
    if ($u['google_sub'] === null) {
        db()->prepare('UPDATE users SET google_sub = ? WHERE id = ? AND google_sub IS NULL')->execute([$claims['sub'], $u['id']]);
    } elseif (!hash_equals($u['google_sub'], $claims['sub'])) {
        log_event((int)$u['id'], 'google_other_id', 'same email, different Google account');
        return 'This email now belongs to a different Google account, so it can\'t sign in. Ask another admin.';
    }
    if (!(int)$u['active']) { log_event((int)$u['id'], 'switched_off_tried'); return 'This account is switched off. Ask another admin.'; }
    if (locked($u)) return 'Too many attempts. Wait 15 minutes.';
    session_regenerate_id(true);
    if ($u['totp_secret'] === null) $_SESSION['enroll'] = ['uid' => (int)$u['id'], 'secret' => base32_encode(random_bytes(20)), 'at' => time()];
    else $_SESSION['pending'] = ['uid' => (int)$u['id'], 'at' => time()];
    log_event((int)$u['id'], 'google_ok');
    return '';
}

// Step 2: the code from the authenticator app, within 5 minutes of Google.
function try_code(string $code): string {
    $p = $_SESSION['pending'] ?? null;
    unset($_SESSION['pending']);
    if (!$p || time() - $p['at'] > 300) return 'That took too long. Sign in again.';
    $u = user_by_id((int)$p['uid']);
    if (!$u || !allowed($u['email'])) return 'Sign in again.';
    if (over_limit('code', 10, LOCK_MINUTES) || !charge($u)) return 'Too many attempts. Wait 15 minutes, or a day after repeated tries.';
    if (!claim_code($u, $code)) {
        log_event((int)$u['id'], 'code_failed');
        $_SESSION['pending'] = $p; // another try, same 5-minute window
        return 'Wrong code. Use the newest one, and check the time on your phone is set automatically.';
    }
    sign_in($u);
    return '';
}

// Connect codes: made by another admin for one person, one use, CONNECT_HOURS long, only their hash is stored.
function make_connect_code(int $by, string $email): string {
    $code = substr(base32_encode(random_bytes(10)), 0, 12);
    $q = db()->prepare('SELECT id FROM users WHERE email = ?');
    $q->execute([$email]);
    if (!$q->fetchColumn()) db()->prepare('INSERT INTO users (email, name, created_at) VALUES (?, ?, UTC_TIMESTAMP())')->execute([$email, strstr($email, '@', true)]);
    db()->prepare('UPDATE users SET enrol_hash = ?, enrol_until = UTC_TIMESTAMP() + INTERVAL ' . CONNECT_HOURS . ' HOUR WHERE email = ?')
        ->execute([hash('sha256', $code), $email]);
    log_event($by, 'connect_code', mask_email($email));
    return implode('-', str_split($code, 4));
}

// First sign-in, or after a reset: a connect code from another admin (or the server owner's setup_key), plus one code
// from the new app. A hijacked Gmail account alone therefore can't connect an attacker's app.
function try_enroll(string $key, string $code): string {
    $e = $_SESSION['enroll'] ?? null;
    if (!$e || time() - $e['at'] > 900) { unset($_SESSION['enroll']); return 'That took too long. Sign in again.'; }
    $u = user_by_id((int)$e['uid']);
    if (!$u || !allowed($u['email'])) { unset($_SESSION['enroll']); return 'Sign in again.'; }
    if (over_limit('code', 10, LOCK_MINUTES) || !charge($u)) return 'Too many attempts. Wait 15 minutes, or a day after repeated tries.';
    $keyHash = hash('sha256', strtoupper(preg_replace('/[\s-]+/', '', $key) ?? ''));
    $byConnect = $u['enrol_hash'] !== null && strtotime($u['enrol_until'] . ' UTC') > time() && hash_equals($u['enrol_hash'], $keyHash);
    $bySetup = hash_equals(hash('sha256', (string)admin_ready()['setup_key']), hash('sha256', $key));
    if (!$byConnect && !$bySetup) { log_event((int)$u['id'], 'connect_code_wrong'); return 'That connect code is wrong or expired. Ask another admin for a new one.'; }
    $step = totp_match($e['secret'], $code, 0);
    if ($step === null) return 'That code didn\'t match. Check the key was typed exactly, and the time on your phone is automatic.';
    $q = db()->prepare('UPDATE users SET totp_secret = ?, totp_step = ?, enrol_hash = NULL, enrol_until = NULL WHERE id = ? AND totp_secret IS NULL');
    $q->execute([seal($e['secret']), $step, $u['id']]);
    if ($q->rowCount() !== 1) { unset($_SESSION['enroll']); return 'Sign in again.'; }
    log_event((int)$u['id'], '2fa_on', $bySetup ? 'with the setup key' : 'with a connect code');
    sign_in($u);
    return '';
}

// Sensitive actions (export, delete, team changes) need a code typed in the last few minutes, so a stolen session alone can't do them.
function stepped_up(): bool { return time() - (int)($_SESSION['stepup_at'] ?? 0) < STEPUP_MINUTES * 60; }

function require_stepup(string $back): void {
    if (stepped_up()) return;
    flash('Enter your current authenticator code at the top first. It unlocks exports, deletes and team changes for ' . STEPUP_MINUTES . ' minutes.', 'bad');
    go($back);
}

function try_stepup(array $u, string $code): string {
    if (over_limit('code', 10, LOCK_MINUTES) || !charge($u)) return 'Too many attempts. Wait 15 minutes.';
    if (!claim_code($u, $code)) { log_event((int)$u['id'], 'code_failed', 'unlock'); return 'Wrong code. Use the newest one.'; }
    $_SESSION['stepup_at'] = time();
    return '';
}

// ---- TOTP (RFC 6238: 30-second steps, 6 digits, SHA-1), the scheme every authenticator app uses ----
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32_encode(string $bin): string {
    $bits = '';
    foreach (str_split($bin) as $c) $bits .= str_pad(decbin(ord($c)), 8, '0', STR_PAD_LEFT);
    $out = '';
    foreach (str_split($bits, 5) as $chunk) $out .= B32[bindec(str_pad($chunk, 5, '0'))];
    return $out;
}

function base32_decode(string $b32): string {
    $bits = '';
    foreach (str_split(strtoupper(preg_replace('/[^A-Za-z2-7]/', '', $b32) ?? '')) as $c) $bits .= str_pad(decbin(strpos(B32, $c)), 5, '0', STR_PAD_LEFT);
    $out = '';
    foreach (str_split($bits, 8) as $byte) if (strlen($byte) === 8) $out .= chr(bindec($byte));
    return $out;
}

function totp_code(string $key, int $step): string {
    $h = hash_hmac('sha1', pack('J', $step), $key, true);
    $o = ord($h[19]) & 15;
    return str_pad((string)((unpack('N', substr($h, $o, 4))[1] & 0x7fffffff) % 1000000), 6, '0', STR_PAD_LEFT);
}

// The step the code belongs to (one step of clock drift either way), if it is newer than $after; else null.
function totp_match(string $secret, string $code, int $after): ?int {
    $code = preg_replace('/\s+/', '', $code) ?? '';
    if ($secret === '' || !preg_match('/^\d{6}$/', $code)) return null;
    $key = base32_decode($secret);
    $now = intdiv(time(), 30);
    foreach ([0, -1, 1] as $d) {
        $s = $now + $d;
        if ($s > $after && hash_equals(totp_code($key, $s), $code)) return $s;
    }
    return null;
}
