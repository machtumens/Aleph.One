<?php
// Shared by api/lead.php and admin/: settings, database, rate limits. Not a page; .htaccess blocks direct requests.
declare(strict_types=1);

ini_set('display_errors', '0');
set_exception_handler(function (Throwable $e): void {
    error_log('aleph: ' . $e->getMessage()); // details (database user, host) stay in the server log, never on the page
    if (!headers_sent()) http_response_code(503);
    echo 'Something went wrong on the server. The details are in the error log.';
});

function config(): array {
    static $c = null;
    if ($c !== null) return $c;
    $f = __DIR__ . '/config.php';
    $c = is_file($f) ? require $f : [];
    foreach (['db_name', 'db_user', 'secret'] as $k) {
        if (!is_array($c) || trim((string)($c[$k] ?? '')) === '') {
            http_response_code(503);
            exit('Setup needed: copy api/config.sample.php to api/config.php and fill in every value.');
        }
    }
    return $c;
}

function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $c = config();
    $pdo = new PDO('mysql:host=' . ($c['db_host'] ?? 'localhost') . ';dbname=' . $c['db_name'] . ';charset=utf8mb4', $c['db_user'], (string)($c['db_pass'] ?? ''), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    // ponytail: tables are created on first use (so Hostinger needs no install step), then a marker file per database skips it.
    // Dropped the tables by hand? Delete api/.tables-* too. If the marker can't be written, creating again each time is harmless.
    $mark = __DIR__ . '/.tables-' . md5(($c['db_host'] ?? '') . '/' . $c['db_name']);
    if (!is_file($mark)) {
        $pdo->exec("CREATE TABLE IF NOT EXISTS leads (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, created_at DATETIME NOT NULL,
            name VARCHAR(120) NOT NULL, business VARCHAR(160) NOT NULL, start_when VARCHAR(40) NOT NULL,
            email VARCHAR(160) NOT NULL, social VARCHAR(200) NOT NULL, about TEXT NOT NULL,
            package VARCHAR(60) NOT NULL, addons VARCHAR(400) NOT NULL, maintenance VARCHAR(60) NOT NULL,
            project_price INT UNSIGNED NOT NULL, other TEXT NOT NULL, message TEXT NOT NULL, KEY by_time (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $pdo->exec('CREATE TABLE IF NOT EXISTS hits (ip_hash CHAR(64) NOT NULL, action VARCHAR(16) NOT NULL, at DATETIME NOT NULL,
            KEY by_visitor (ip_hash, action, at), KEY by_time (at)) ENGINE=InnoDB');
        @touch($mark);
    }
    return $pdo;
}

// Visitor IPs are only kept as a keyed hash, enough to count repeat requests. IPv6 counts per /64, the block one line gets.
// ponytail: REMOTE_ADDR only; if the site goes behind Cloudflare, every visitor shares a few IPs and limits need CF-Connecting-IP.
function ip_hash(): string {
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    $bin = @inet_pton($ip);
    if ($bin !== false && strlen($bin) === 16) $ip = inet_ntop(substr($bin, 0, 8) . str_repeat("\0", 8));
    return hash_hmac('sha256', $ip, (string)config()['secret']);
}

// Records one $action for this visitor, then says whether that went over $max in the last $minutes.
// Counting after the insert means parallel requests can't all slip under the limit.
function over_limit(string $action, int $max, int $minutes): bool {
    $db = db();
    $db->prepare('INSERT INTO hits (ip_hash, action, at) VALUES (?, ?, UTC_TIMESTAMP())')->execute([ip_hash(), $action]);
    if (random_int(1, 50) === 1) $db->exec('DELETE FROM hits WHERE at < UTC_TIMESTAMP() - INTERVAL 1 DAY');
    $q = $db->prepare('SELECT COUNT(*) FROM hits WHERE ip_hash = ? AND action = ? AND at > UTC_TIMESTAMP() - INTERVAL ' . $minutes . ' MINUTE');
    $q->execute([ip_hash(), $action]);
    return (int)$q->fetchColumn() > $max;
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
