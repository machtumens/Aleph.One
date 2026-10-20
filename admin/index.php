<?php
// Studio dashboard. Website visitors never come here; the admins on the list sign in with Google and an authenticator code.
declare(strict_types=1);
const ALEPH_ADMIN = true;
require __DIR__ . '/../api/lib.php';
foreach (['_auth', '_ui', '_public', '_inbox', '_team', '_apps'] as $part) require __DIR__ . '/' . $part . '.php';

admin_ready();
// form-action also covers the redirect after "Sign in with Google", so the Google sign-in page's origin is allowed.
$google = parse_url(google_url('auth'));
$googleOrigin = $google['scheme'] . '://' . $google['host'] . (isset($google['port']) ? ':' . $google['port'] : '');
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; img-src 'self'; form-action 'self' $googleOrigin; frame-ancestors 'none'; base-uri 'none'");
header('X-Frame-Options: DENY');
// same-origin, not no-referrer: with no-referrer, browsers send "Origin: null" on form posts and the CSRF check refuses them.
header('Referrer-Policy: same-origin');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');

start_session(isset($_GET['login']));
$user = current_user();

if (!$user && isset($_GET['login'])) google_start();
// Back from Google: finish step 1, then show the code (or connect-an-app) page. The redirect drops the code from the URL.
if (!$user && isset($_GET['state'])) {
    $err = has_session() ? google_callback() : 'That sign-in expired. Try again.';
    if ($err !== '' && has_session()) flash($err, 'bad');
    go('./');
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    check_csrf();
    $do = param($_POST, 'do');
    if ($do === 'sign_out') {
        if ($user) log_event((int)$user['id'], 'sign_out');
        sign_out();
        go();
    }
    if (!$user) public_post($do);
    if ($do === 'stepup') {
        $err = try_stepup($user, param($_POST, 'code'));
        flash($err !== '' ? $err : 'Unlocked for ' . STEPUP_MINUTES . ' minutes.', $err !== '' ? 'bad' : 'ok');
        go('./' . (param($_POST, 'view') === 'team' ? '?view=team' : ''));
    }
    if ($do === 'stepdown') { unset($_SESSION['stepup_at']); go('./' . (param($_POST, 'view') === 'team' ? '?view=team' : '')); }
    inbox_post($user, $do);
    team_post($user, $do);
    http_response_code(400);
    exit('Unknown action.');
}

if (!$user) { public_view(); exit; }
match (param($_GET, 'view')) {
    'apps' => apps_view($user),
    'team' => team_view($user),
    'activity' => activity_view($user),
    'account' => account_view($user),
    default => inbox_view($user),
};
