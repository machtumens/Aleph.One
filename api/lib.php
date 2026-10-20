<?php
// Shared by the public endpoint (api/lead.php) and the dashboard (admin/): settings, database, rate limits, small helpers.
// Not a page: .htaccess blocks direct requests, and it prints nothing if one gets through.
declare(strict_types=1);

const SCHEMA_VERSION = 3;

ini_set('display_errors', '0');
// PHP's own error log goes next to the settings file, outside the website, when that folder is writable.
if (@is_writable(dirname(__DIR__, 2))) ini_set('error_log', dirname(__DIR__, 2) . '/aleph-errors.log');
set_exception_handler(function (Throwable $e): void {
    error_log('aleph: ' . $e->getMessage()); // details (database user, host) stay in the server log, never on the page
    if (!headers_sent()) http_response_code(503);
    echo 'Something went wrong on the server. The details are in the error log.';
});

// Settings live in aleph-config.php in the folder above public_html, where the web server can't serve them.
// api/config.php also works, for hosts that block reading outside the web root (.htaccess denies it).
// This checks what the public brief endpoint needs; the dashboard checks its own keys (admin_ready in admin/_auth.php).
function config(): array {
    static $c = null;
    if ($c !== null) return $c;
    $c = [];
    foreach ([dirname(__DIR__, 2) . '/aleph-config.php', __DIR__ . '/config.php'] as $f) {
        if (@is_file($f)) { $c = require $f; break; }
    }
    if (!is_array($c)) $c = [];
    $missing = [];
    foreach (['db_name', 'db_user'] as $k) if (trim((string)($c[$k] ?? '')) === '') $missing[] = $k;
    if (strlen((string)($c['secret'] ?? '')) < 24) $missing[] = 'secret';
    if ($missing) setup_needed($missing);
    return $c;
}

// Names the missing settings (never their values) and offers fresh random values to paste.
function setup_needed(array $missing): void {
    http_response_code(503);
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'");
    $r = fn() => rtrim(strtr(base64_encode(random_bytes(30)), '+/', '-_'), '=');
    echo '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Setup needed</title>',
        '<body style="font:16px/1.6 system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 20px">',
        '<h1>Setup needed</h1><p>The settings file <code>aleph-config.php</code> is missing these, or they are too short: <strong>',
        h(implode(', ', $missing)), '</strong>. The setup guide explains each one.</p>',
        '<p>Fresh random values for <code>secret</code> and <code>setup_key</code> (new ones every time this page loads):</p>',
        '<p><code>', $r(), '</code><br><code>', $r(), '</code></p>';
    exit;
}

// Local test copies (site_url on localhost) may point Google at a fake one over plain http. The live site never can.
function test_mode(): bool {
    return in_array(parse_url((string)(config()['site_url'] ?? ''), PHP_URL_HOST), ['localhost', '127.0.0.1'], true);
}

// A separate key per purpose, all derived from `secret`.
function key_for(string $purpose): string { return hash_hmac('sha256', $purpose, (string)config()['secret'], true); }

// A request value as text. Arrays (field[]=x) become '' rather than a warning, or the number 1 after an (int) cast.
function param(array $src, string $key): string {
    $v = $src[$key] ?? '';
    return is_string($v) ? $v : '';
}

// Server-to-server HTTPS call (Google sign-in, GitHub releases). URLs come from code and the settings file, never from visitors.
function http_json(string $url, ?array $form = null, array $headers = []): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_PROTOCOLS => test_mode() ? CURLPROTO_HTTPS | CURLPROTO_HTTP : CURLPROTO_HTTPS,
        CURLOPT_HTTPHEADER => array_merge(['Accept: application/json'], $headers),
    ]);
    if ($form !== null) curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => http_build_query($form)]);
    $body = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    if ($body === false) error_log('aleph: ' . parse_url($url, PHP_URL_HOST) . ' unreachable: ' . curl_error($ch));
    $data = is_string($body) ? json_decode($body, true) : null;
    return [$status, is_array($data) ? $data : []];
}

function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $c = config();
    $pdo = new PDO('mysql:host=' . ($c['db_host'] ?? 'localhost') . ';dbname=' . $c['db_name'] . ';charset=utf8mb4', $c['db_user'], (string)($c['db_pass'] ?? ''), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    // Tables are created and upgraded on first use, so Hostinger needs no install step. A marker file per database and
    // schema version skips the check afterwards. Dropped tables by hand? Delete api/.schema-* too.
    $mark = __DIR__ . '/.schema-' . SCHEMA_VERSION . '-' . md5(($c['db_host'] ?? '') . '/' . $c['db_name']);
    if (!is_file($mark)) { migrate($pdo); @touch($mark); }
    return $pdo;
}

function has_column(PDO $db, string $table, string $column): bool {
    $q = $db->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?');
    $q->execute([$table, $column]);
    return (int)$q->fetchColumn() > 0;
}

// Each step runs once, in order; the version reached is kept in `meta`. Every statement is safe to run again, so a step
// that stopped halfway finishes on the next visit. Never change a shipped step's effect; add a new step.
function migrate(PDO $db): void {
    $steps = [
        1 => fn() => [
            "CREATE TABLE IF NOT EXISTS leads (
                id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, created_at DATETIME NOT NULL,
                name VARCHAR(120) NOT NULL, business VARCHAR(160) NOT NULL, start_when VARCHAR(40) NOT NULL,
                email VARCHAR(160) NOT NULL, social VARCHAR(200) NOT NULL, about TEXT NOT NULL,
                package VARCHAR(60) NOT NULL, addons VARCHAR(400) NOT NULL, maintenance VARCHAR(60) NOT NULL,
                project_price INT UNSIGNED NOT NULL, other TEXT NOT NULL, message TEXT NOT NULL, KEY by_time (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
            'CREATE TABLE IF NOT EXISTS hits (ip_hash CHAR(64) NOT NULL, action VARCHAR(16) NOT NULL, at DATETIME NOT NULL,
                KEY by_visitor (ip_hash, action, at), KEY by_time (at)) ENGINE=InnoDB',
        ],
        2 => fn() => [
            has_column($db, 'leads', 'status') ? null : "ALTER TABLE leads ADD COLUMN status VARCHAR(12) NOT NULL DEFAULT 'new',
                ADD COLUMN notes TEXT NULL, ADD COLUMN updated_at DATETIME NULL, ADD COLUMN updated_by INT UNSIGNED NULL, ADD KEY by_status (status)",
            "CREATE TABLE IF NOT EXISTS users (
                id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, email VARCHAR(160) NOT NULL, name VARCHAR(80) NOT NULL,
                totp_secret VARCHAR(255) NULL, totp_step BIGINT NOT NULL DEFAULT 0, failed INT NOT NULL DEFAULT 0,
                strikes INT NOT NULL DEFAULT 0, locked_until DATETIME NULL, gen INT UNSIGNED NOT NULL DEFAULT 1,
                active TINYINT(1) NOT NULL DEFAULT 1, google_sub VARCHAR(64) NULL, enrol_hash CHAR(64) NULL, enrol_until DATETIME NULL,
                created_at DATETIME NOT NULL, last_login_at DATETIME NULL, UNIQUE KEY by_email (email)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
            "CREATE TABLE IF NOT EXISTS events (
                id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, at DATETIME NOT NULL, user_id INT UNSIGNED NULL,
                action VARCHAR(24) NOT NULL, detail VARCHAR(200) NOT NULL, ip_hash CHAR(64) NOT NULL, KEY by_time (at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        ],
        // Brings tables made by earlier drafts of step 2 to the same shape.
        3 => fn() => [
            has_column($db, 'users', 'pass_hash') ? 'ALTER TABLE users DROP COLUMN pass_hash' : null,
            has_column($db, 'users', 'role') ? 'ALTER TABLE users DROP COLUMN role' : null,
            has_column($db, 'users', 'google_sub') ? null : 'ALTER TABLE users ADD COLUMN google_sub VARCHAR(64) NULL',
            has_column($db, 'users', 'enrol_hash') ? null : 'ALTER TABLE users ADD COLUMN enrol_hash CHAR(64) NULL, ADD COLUMN enrol_until DATETIME NULL',
            has_column($db, 'users', 'strikes') ? null : 'ALTER TABLE users ADD COLUMN strikes INT NOT NULL DEFAULT 0',
            'ALTER TABLE users MODIFY totp_secret VARCHAR(255) NULL',
            'ALTER TABLE meta MODIFY v MEDIUMTEXT NOT NULL',
            'DROP TABLE IF EXISTS invites',
        ],
    ];
    $db->exec('CREATE TABLE IF NOT EXISTS meta (k VARCHAR(32) PRIMARY KEY, v MEDIUMTEXT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    // Two first visitors at once must not both upgrade; the second waits, then finds the work done.
    if ((int)$db->query("SELECT GET_LOCK('aleph_migrate', 20)")->fetchColumn() !== 1) throw new RuntimeException('database upgrade is busy');
    try {
        $at = (int)($db->query("SELECT v FROM meta WHERE k = 'schema'")->fetchColumn() ?: 0);
        foreach ($steps as $v => $sqls) {
            if ($v <= $at) continue;
            foreach (array_filter($sqls()) as $sql) $db->exec($sql);
            $db->prepare("REPLACE INTO meta (k, v) VALUES ('schema', ?)")->execute([(string)$v]);
        }
    } finally {
        $db->query("SELECT RELEASE_LOCK('aleph_migrate')");
    }
}

// Visitor IPs are only kept as a keyed hash, enough to count repeat requests. IPv6 counts per /64, the block one line gets;
// an IPv4 address written as IPv6 (::ffff:1.2.3.4) counts as the IPv4 address.
// ponytail: REMOTE_ADDR only; if the site goes behind Cloudflare, every visitor shares a few IPs and limits need CF-Connecting-IP.
function ip_hash(): string {
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    $bin = @inet_pton($ip);
    if ($bin !== false && strlen($bin) === 16) {
        $ip = str_starts_with($bin, str_repeat("\0", 10) . "\xff\xff") ? (string)inet_ntop(substr($bin, 12)) : (string)inet_ntop(substr($bin, 0, 8) . str_repeat("\0", 8));
    }
    return hash_hmac('sha256', $ip, key_for('ip'));
}

// Says whether this visitor has used up $max of $action in the last $minutes, recording this attempt if not.
function over_limit(string $action, int $max, int $minutes): bool {
    $db = db();
    $ip = ip_hash();
    $count = function () use ($db, $ip, $action, $minutes): int {
        $q = $db->prepare('SELECT COUNT(*) FROM hits WHERE ip_hash = ? AND action = ? AND at > UTC_TIMESTAMP() - INTERVAL ' . $minutes . ' MINUTE');
        $q->execute([$ip, $action]);
        return (int)$q->fetchColumn();
    };
    if ($count() >= $max) return true; // already over: refuse without writing, so a flood adds no rows
    $db->prepare('INSERT INTO hits (ip_hash, action, at) VALUES (?, ?, UTC_TIMESTAMP())')->execute([$ip, $action]);
    if (random_int(1, 50) === 1) {
        $db->exec('DELETE FROM hits WHERE at < UTC_TIMESTAMP() - INTERVAL 1 DAY');
        $db->exec('DELETE FROM events WHERE at < UTC_TIMESTAMP() - INTERVAL 1 YEAR');
        $db->exec("DELETE FROM leads WHERE status = 'held' AND created_at < UTC_TIMESTAMP() - INTERVAL 30 DAY");
    }
    return $count() > $max; // counted again after writing, so parallel requests can't all slip under the limit
}

// Activity log: who did what, when, from which (hashed) connection. Entries from people who aren't signed in are capped
// at 60 an hour, so a flood of refusals can't push the admins' own entries off the Activity page.
function log_event(?int $userId, string $action, string $detail = ''): void {
    if ($userId === null && (int)db()->query('SELECT COUNT(*) FROM events WHERE user_id IS NULL AND at > UTC_TIMESTAMP() - INTERVAL 1 HOUR')->fetchColumn() >= 60) return;
    db()->prepare('INSERT INTO events (at, user_id, action, detail, ip_hash) VALUES (UTC_TIMESTAMP(), ?, ?, ?, ?)')
        ->execute([$userId, $action, mb_substr($detail, 0, 200), ip_hash()]);
}

function reply(int $code, string $message): void {
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode(['ok' => $code < 300, 'message' => $message]);
    exit;
}

function h(?string $s): string {
    return htmlspecialchars((string)$s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

// True when the request carries an Origin from another site. Browsers send Origin on every POST.
function foreign_origin(): bool {
    $origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
    return $origin !== '' && parse_url($origin, PHP_URL_HOST) !== parse_url('//' . ($_SERVER['HTTP_HOST'] ?? ''), PHP_URL_HOST);
}
