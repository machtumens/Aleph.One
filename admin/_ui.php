<?php
// Dashboard look and small HTML helpers. No JavaScript anywhere: the page policy allows none, so injected text can't run.
declare(strict_types=1);
defined('ALEPH_ADMIN') || exit;

function flash(string $msg, string $kind = 'ok'): void { $_SESSION['flash'] = [$kind, $msg]; }

function go(string $to = './'): void { header('Location: ' . $to, true, 303); exit; }

// Opens a POST form carrying the CSRF token and the action name.
function form(string $do, string $attrs = ''): string {
    return '<form method="post"' . $attrs . '><input type="hidden" name="csrf" value="' . h(csrf()) . '"><input type="hidden" name="do" value="' . h($do) . '">';
}

function jkt(?string $utc, string $fmt = 'j M Y · H:i'): string {
    try {
        return $utc ? (new DateTime($utc, new DateTimeZone('UTC')))->setTimezone(new DateTimeZone('Asia/Jakarta'))->format($fmt) : '—';
    } catch (Exception) {
        return '—'; // e.g. a malformed date from GitHub
    }
}

// Shown on pages with sensitive actions: a fresh code unlocks export, delete and team changes for a few minutes.
function stepup_bar(string $view): string {
    $v = '<input type="hidden" name="view" value="' . h($view) . '">';
    if (stepped_up()) {
        $left = max(1, (int)ceil((STEPUP_MINUTES * 60 - (time() - (int)$_SESSION['stepup_at'])) / 60));
        return '<div class="msg ok unlock">' . form('stepdown') . $v . '<span>Export, delete and team changes are unlocked for ' . $left . ' more minute' . ($left === 1 ? '' : 's') . '.</span> <button class="ghost">Lock now</button></form></div>';
    }
    return '<div class="msg unlock">' . form('stepup') . $v . '<span>Export, delete and team changes need a fresh code.</span>'
        . '<input name="code" aria-label="6-digit code" placeholder="123 456" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required> <button class="ghost">Unlock</button></form></div>';
}

function rp($n): string { return 'Rp ' . number_format((int)$n, 0, ',', '.'); }

// $user null = the narrow sign-in layout.
function page(string $title, ?array $user, callable $body, string $view = ''): void {
    $f = $_SESSION['flash'] ?? null;
    unset($_SESSION['flash']);
    $nav = fn(string $v, string $label) => '<a href="' . ($v === 'inbox' ? './' : './?view=' . $v) . '"' . ($view === $v ? ' aria-current="page"' : '') . '>' . $label . '</a>';
    ?><!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title><?= h($title) ?> · Aleph One</title>
<link rel="icon" type="image/png" href="../uploads/aleph-icon.png">
<style>
@font-face{font-family:Inter;src:url(../assets/fonts/inter.woff2) format('woff2');font-weight:400 700}
@font-face{font-family:Lora;src:url(../assets/fonts/lora.woff2) format('woff2');font-weight:400 700}
:root{--bg:#070809;--card:#0E1012;--card2:#14171A;--ink:#EDEFF0;--mute:#9BA1A4;--dim:#5C6367;--line:rgba(255,255,255,.13);--cy:#35D6F0;--tan:#C8A77C;--ok:#7BE0A6;--bad:#FF8A80}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--cy);text-decoration:none}a:hover{text-decoration:underline}
h1,h2,h3{font-family:Lora,Georgia,serif;font-weight:600;margin:0}
.k{display:block;font-size:10px;font-weight:650;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);margin-bottom:3px}
.wrap{max-width:1120px;margin:0 auto;padding:0 20px 64px}
.top{position:sticky;top:0;z-index:2;background:rgba(7,8,9,.9);backdrop-filter:blur(10px);border-bottom:1px solid var(--line);margin-bottom:28px}
.top .wrap{display:flex;align-items:center;gap:18px;flex-wrap:wrap;padding-top:14px;padding-bottom:14px}
.top img{height:26px}.top nav{display:flex;gap:4px;flex:1;flex-wrap:wrap}
.top nav a{color:var(--mute);padding:8px 12px;border-radius:999px;font-weight:600;font-size:14px}
.top nav a:hover{color:var(--ink);text-decoration:none}.top nav a[aria-current]{color:var(--ink);background:var(--card2)}
.who{color:var(--dim);font-size:13px}
button,.btn{font:inherit;cursor:pointer;border:0;border-radius:999px;min-height:40px;padding:0 18px;font-weight:650;letter-spacing:.04em;display:inline-flex;align-items:center;justify-content:center}
.go{background:var(--ink);color:var(--bg)}.go:hover{background:#fff}
.ghost{background:none;color:var(--mute);box-shadow:inset 0 0 0 1px var(--line)}.ghost:hover{color:var(--ink)}
.danger{background:none;color:var(--bad);box-shadow:inset 0 0 0 1px rgba(255,138,128,.4)}
input,select,textarea{font:inherit;color:var(--ink);background:var(--card2);border:0;box-shadow:inset 0 0 0 1px var(--line);border-radius:10px;min-height:42px;padding:8px 12px;width:100%}
textarea{min-height:70px;resize:vertical}
input:focus,select:focus,textarea:focus,button:focus-visible,a:focus-visible{outline:2px solid var(--cy);outline-offset:1px}
.head{display:flex;align-items:end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px}
.head h1{font-size:30px}.head p{margin:4px 0 0;color:var(--mute)}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:22px}
.stat{background:var(--card);border-radius:14px;box-shadow:inset 0 0 0 1px var(--line);padding:14px 16px}
.stat b{display:block;font:600 clamp(20px,2.2vw,26px)/1.15 Lora,Georgia,serif;font-variant-numeric:tabular-nums;white-space:nowrap}.stat small{color:var(--mute)}
.bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px}
.tabs{display:flex;gap:4px;flex-wrap:wrap}.tabs a{padding:7px 12px;border-radius:999px;color:var(--mute);font-size:13px;font-weight:600;box-shadow:inset 0 0 0 1px var(--line)}
.tabs a[aria-current]{background:var(--ink);color:var(--bg);box-shadow:none}.tabs a:hover{text-decoration:none;color:var(--ink)}.tabs a[aria-current]:hover{color:var(--bg)}
.bar form{display:flex;gap:8px;margin-left:auto;min-width:min(340px,100%)}.bar input{min-height:38px}
.list{display:grid;gap:12px}
.lead{background:var(--card);border-radius:14px;box-shadow:inset 0 0 0 1px var(--line);padding:18px 20px;display:grid;gap:14px}
.lead header{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 12px}
.lead h2{font-size:20px}.lead .biz{color:var(--mute)}.lead .price{margin-left:auto;font-weight:650;color:var(--tan);font-variant-numeric:tabular-nums}
.pill{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:3px 9px;border-radius:999px;background:var(--card2);color:var(--mute)}
.pill.new{color:var(--cy)}.pill.won{color:var(--ok)}.pill.lost{color:var(--dim)}.pill.contacted{color:var(--tan)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px 20px}
.grid div{min-width:0;overflow-wrap:anywhere}
.notes{white-space:pre-wrap;overflow-wrap:anywhere;color:var(--mute);border-top:1px solid var(--line);padding-top:12px}
.edit{display:grid;grid-template-columns:180px 1fr auto;gap:10px;align-items:start;border-top:1px solid var(--line);padding-top:14px}
.meta{color:var(--dim);font-size:12px}
details summary{cursor:pointer;color:var(--dim);font-size:12px}details pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 ui-monospace,monospace;color:var(--mute);margin:10px 0 0}
.del{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px}
.empty{color:var(--mute);padding:48px 0;text-align:center}
.pager{display:flex;gap:10px;justify-content:center;margin-top:20px}
table{width:100%;border-collapse:collapse;font-size:14px}th{text-align:left;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);font-weight:650}
th,td{padding:10px 8px;border-bottom:1px solid var(--line);vertical-align:top}td form{display:inline}
.panel{background:var(--card);border-radius:14px;box-shadow:inset 0 0 0 1px var(--line);padding:20px;margin-bottom:18px;overflow-x:auto}
.panel h2{font-size:20px;margin-bottom:12px}.panel p{color:var(--mute);margin:0 0 12px}
.row{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;align-items:end}
.msg{border-radius:10px;padding:12px 14px;margin-bottom:18px;font-size:14px;overflow-wrap:anywhere}
.msg.ok{background:rgba(123,224,166,.1);color:var(--ok)}.msg.bad{background:rgba(255,128,128,.1);color:var(--bad)}
.copy{font:13px ui-monospace,monospace;user-select:all}
.unlock{background:var(--card);box-shadow:inset 0 0 0 1px var(--line);color:var(--mute)}.unlock.ok{background:rgba(123,224,166,.08);color:var(--ok);box-shadow:none}
.unlock form{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center}.unlock span{flex:1;min-width:220px}.unlock input{width:130px;min-height:36px}.unlock button{min-height:36px}
.solo{min-height:100vh;display:grid;place-items:center;padding:24px 20px}
.solo main{width:min(400px,100%);display:grid;gap:14px}.solo img{height:42px}.solo h1{font-size:28px;margin-top:4px}.solo p{color:var(--mute);margin:0}
.solo form{display:grid;gap:12px}.key{font:600 18px/1.6 ui-monospace,monospace;letter-spacing:.08em;background:var(--card2);border-radius:10px;padding:12px 14px;user-select:all;overflow-wrap:anywhere}
.steps{margin:0;padding-left:20px;color:var(--mute)}.steps li{margin-bottom:4px}
@media (max-width:700px){.edit{grid-template-columns:1fr}.lead .price{margin-left:0;width:100%}.bar form{margin-left:0}}
</style>
</head>
<body<?= $user ? '' : ' class="solo"' ?>>
<?php if ($user): ?>
<div class="top"><div class="wrap">
  <img src="../uploads/aleph-mark.png" alt="Aleph One">
  <nav aria-label="Dashboard"><?= $nav('inbox', 'Briefs') ?><?= $nav('apps', 'AlephOS') ?><?= $nav('team', 'Team') ?><?= $nav('activity', 'Activity') ?><?= $nav('account', 'Account') ?>
    <a href="https://dashboard-alephone.vercel.app/index.html#overview" target="_blank" rel="noopener noreferrer">Command Center ↗</a></nav>
  <span class="who"><?= h($user['name']) ?></span>
  <?= form('sign_out') ?><button class="ghost">Sign out</button></form>
</div></div>
<div class="wrap">
<?php else: ?>
<main>
  <img src="../uploads/aleph-mark.png" alt="Aleph One">
<?php endif ?>
<?php if ($f): ?><div class="msg <?= $f[0] === 'bad' ? 'bad' : 'ok' ?>" role="<?= $f[0] === 'bad' ? 'alert' : 'status' ?>"><?= h($f[1]) ?></div><?php endif ?>
<?= $user && in_array($view, ['inbox', 'team'], true) ? stepup_bar($view) : '' ?>
<?php $body(); ?>
<?= $user ? '</div>' : '</main>' ?>
</body>
</html>
<?php
}
