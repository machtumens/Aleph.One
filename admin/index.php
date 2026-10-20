<?php
// Studio inbox: every brief sent from the site, newest first. The password is admin_password in api/config.php.
declare(strict_types=1);
require __DIR__ . '/../api/lib.php';

const MIN_PASSWORD = 16;
const SESSION_HOURS = 12;
const SHOWN = 500; // ponytail: newest 500 only; add paging or CSV export when the inbox outgrows that

$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
ini_set('session.use_strict_mode', '1');
session_name('aleph_admin');
session_set_cookie_params(['path' => rtrim(dirname($_SERVER['SCRIPT_NAME']), '/') . '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Strict']);
session_start();
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header('Cache-Control: no-store');

$csrf = $_SESSION['csrf'] ??= bin2hex(random_bytes(16));
$password = (string)(config()['admin_password'] ?? '');
$error = strlen($password) < MIN_PASSWORD ? 'Set admin_password in api/config.php (at least ' . MIN_PASSWORD . ' characters) to open the inbox.' : '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!hash_equals($csrf, (string)($_POST['csrf'] ?? ''))) { http_response_code(400); exit('This form expired. Reload the page.'); }
    if (isset($_POST['logout'])) { $_SESSION = []; session_destroy(); header('Location: ./', true, 303); exit; }
    if ($error === '') {
        if (over_limit('login', 8, 15)) $error = 'Too many sign-in attempts from this connection. Wait 15 minutes.';
        // Hashing both sides first keeps the comparison from hinting at the password's length.
        elseif (hash_equals(hash('sha256', $password), hash('sha256', (string)($_POST['password'] ?? '')))) {
            session_regenerate_id(true);
            $_SESSION['admin'] = true;
            $_SESSION['since'] = time();
            header('Location: ./', true, 303);
            exit;
        } else $error = 'Wrong password.';
    }
}

$in = ($_SESSION['admin'] ?? false) === true && time() - (int)($_SESSION['since'] ?? 0) < SESSION_HOURS * 3600 && strlen($password) >= MIN_PASSWORD;
$leads = $in ? db()->query('SELECT * FROM leads ORDER BY id DESC LIMIT ' . SHOWN)->fetchAll() : [];
$jakarta = new DateTimeZone('Asia/Jakarta');
$when = fn(string $utc) => (new DateTime($utc, new DateTimeZone('UTC')))->setTimezone($jakarta)->format('j M Y · H:i');
$rp = fn($n) => 'Rp ' . number_format((int)$n, 0, ',', '.');
// Links only for plain web addresses, always as https; anything else shows as text.
$site = fn(string $s) => preg_match('~^(https?://)?([a-z0-9-]+\.)+[a-z]{2,}(/[^\s"<>]*)?$~i', $s) ? 'https://' . preg_replace('~^https?://~i', '', $s) : '';
?><!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Inbox · Aleph One</title>
<link rel="icon" type="image/png" href="../uploads/aleph-icon.png">
<style>
@font-face{font-family:Inter;src:url(../assets/fonts/inter.woff2) format('woff2');font-weight:400 700}
@font-face{font-family:Lora;src:url(../assets/fonts/lora.woff2) format('woff2');font-weight:400 700}
:root{--bg:#070809;--card:#0E1012;--ink:#EDEFF0;--mute:#9BA1A4;--dim:#5C6367;--line:rgba(255,255,255,.13);--cy:#35D6F0;--tan:#C8A77C;--bad:#FF8A80}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--cy);text-decoration:none}a:hover{text-decoration:underline}
.k{font-size:10px;font-weight:650;letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}
.wrap{max-width:1080px;margin:0 auto;padding:28px 20px 64px}
header{display:flex;align-items:center;gap:14px;padding-bottom:22px;border-bottom:1px solid var(--line);margin-bottom:28px}
header img{height:30px}header h1{font:600 26px/1.1 Lora,Georgia,serif;margin:0;flex:1}header h1 small{display:block;margin-top:6px;font:12px Inter,sans-serif;color:var(--mute)}
button{font:inherit;cursor:pointer;border:0;border-radius:999px;min-height:42px;padding:0 18px;font-weight:650;letter-spacing:.06em}
.ghost{background:none;color:var(--mute);box-shadow:inset 0 0 0 1px var(--line)}.ghost:hover{color:var(--ink)}
.list{display:grid;gap:14px}
.lead{background:var(--card);border-radius:14px;box-shadow:inset 0 0 0 1px var(--line);padding:18px 20px;display:grid;gap:14px}
.top{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 14px}
.top h2{font:600 20px/1.2 Lora,Georgia,serif;margin:0}.top .biz{color:var(--mute)}.top .price{margin-left:auto;font-weight:650;color:var(--tan);font-variant-numeric:tabular-nums}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px 20px}
.grid div{min-width:0;overflow-wrap:anywhere}.grid .k{display:block;margin-bottom:2px}
.notes{white-space:pre-wrap;overflow-wrap:anywhere;color:var(--mute);border-top:1px solid var(--line);padding-top:12px}
details summary{cursor:pointer;color:var(--dim);font-size:12px}details pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 ui-monospace,monospace;color:var(--mute);margin:10px 0 0}
.empty{color:var(--mute);padding:48px 0;text-align:center}
.login{min-height:100vh;display:grid;place-items:center;padding:20px}
.login form{width:min(360px,100%);display:grid;gap:14px}.login img{height:44px;justify-self:start}
.login h1{font:600 28px/1.1 Lora,Georgia,serif;margin:6px 0 4px}
input{font:inherit;color:var(--ink);background:var(--card);border:0;box-shadow:inset 0 0 0 1px var(--line);border-radius:10px;min-height:46px;padding:0 14px;width:100%}
input:focus{outline:2px solid var(--cy);outline-offset:1px}
.go{background:var(--ink);color:var(--bg)}.go:hover{background:#fff}
.err{color:var(--bad);font-size:13px;margin:0}
</style>
</head>
<body>
<?php if (!$in): ?>
<main class="login">
  <form method="post" autocomplete="off">
    <img src="../uploads/aleph-mark.png" alt="Aleph One">
    <h1>Studio inbox</h1>
    <span class="k">Briefs sent from the website</span>
    <input type="hidden" name="csrf" value="<?= h($csrf) ?>">
    <input type="password" name="password" aria-label="Password" placeholder="Password" required autofocus>
    <?php if ($error !== ''): ?><p class="err" role="alert"><?= h($error) ?></p><?php endif ?>
    <button class="go">SIGN IN</button>
  </form>
</main>
<?php else: ?>
<div class="wrap">
  <header>
    <img src="../uploads/aleph-mark.png" alt="">
    <h1>Inbox<small><?= count($leads) ?> brief<?= count($leads) === 1 ? '' : 's' ?><?= count($leads) === SHOWN ? ' (newest ' . SHOWN . ')' : '' ?> · times in Jakarta</small></h1>
    <form method="post"><input type="hidden" name="csrf" value="<?= h($csrf) ?>"><button class="ghost" name="logout" value="1">SIGN OUT</button></form>
  </header>
  <main class="list">
  <?php if (!$leads): ?><p class="empty">No briefs yet. They land here when someone presses SEND ON WHATSAPP on the site.</p><?php endif ?>
  <?php foreach ($leads as $l): $url = $site($l['social']); ?>
    <article class="lead">
      <div class="top">
        <h2><?= h($l['name']) ?></h2><span class="biz"><?= h($l['business']) ?></span>
        <span class="price"><?= h($rp($l['project_price'])) ?></span>
      </div>
      <div class="grid">
        <div><span class="k">Received</span><?= h($when($l['created_at'])) ?></div>
        <div><span class="k">Wants to start</span><?= h($l['start_when'] ?: '—') ?></div>
        <div><span class="k">Package</span><?= h($l['package'] ?: '—') ?></div>
        <div><span class="k">Add-ons</span><?= h($l['addons'] ?: 'None') ?></div>
        <div><span class="k">Maintenance</span><?= h($l['maintenance'] ?: '—') ?></div>
        <div><span class="k">Email</span><?= $l['email'] !== '' ? '<a href="mailto:' . h(rawurlencode($l['email'])) . '">' . h($l['email']) . '</a>' : '—' ?></div>
        <div><span class="k">Instagram or website</span><?= $url !== '' ? '<a href="' . h($url) . '" target="_blank" rel="noopener noreferrer">' . h($l['social']) . '</a>' : h($l['social'] ?: '—') ?></div>
      </div>
      <?php if ($l['about'] !== '' || $l['other'] !== ''): ?><div class="notes"><?= h(trim($l['about'] . ($l['other'] !== '' ? "\n\nOther: " . $l['other'] : ''))) ?></div><?php endif ?>
      <?php if ($l['message'] !== ''): ?><details><summary>Message as sent to WhatsApp</summary><pre><?= h($l['message']) ?></pre></details><?php endif ?>
    </article>
  <?php endforeach ?>
  </main>
</div>
<?php endif ?>
</body>
</html>
