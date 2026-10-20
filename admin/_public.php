<?php
// Pages before sign-in: "Sign in with Google", the authenticator code, and connecting an authenticator app.
declare(strict_types=1);
defined('ALEPH_ADMIN') || exit;

// Each action returns an error message ('' when it worked); either way the person lands back on the dashboard start.
function public_post(string $do): void {
    if ($do === 'cancel') { unset($_SESSION['pending'], $_SESSION['enroll'], $_SESSION['oauth']); go(); }
    [$err, $ok] = match ($do) {
        'code' => [try_code(param($_POST, 'code')), ''],
        'enroll' => [try_enroll(param($_POST, 'connect'), param($_POST, 'code')), 'Two-step sign-in is on. Welcome in.'],
        default => [null, ''],
    };
    if ($err === null) { http_response_code(400); exit('Sign in first.'); }
    flash($err !== '' ? $err : $ok, $err !== '' ? 'bad' : 'ok');
    go();
}

function public_view(): void {
    if (isset($_SESSION['enroll'])) { enroll_page(); return; }
    if (isset($_SESSION['pending'])) { code_page(); return; }
    // A plain link, not a form: no session or file is made until someone actually starts signing in.
    page('Sign in', null, function () { ?>
  <h1>Studio dashboard</h1>
  <p>Website briefs, for the Aleph One admins on the list. Sign in with your Google account, then the code from your authenticator app.</p>
  <a class="btn go" href="./?login=1">Sign in with Google</a>
<?php });
}

function code_page(): void {
    page('Sign in', null, function () { ?>
  <h1>Enter your code</h1>
  <p>Open your authenticator app and type the 6-digit code for Aleph One.</p>
  <?= form('code') ?>
    <input name="code" aria-label="6-digit code" placeholder="123 456" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" maxlength="7" required autofocus>
    <button class="go">Sign in</button>
  </form>
  <?= form('cancel') ?><button class="ghost">Start over</button></form>
<?php });
}

function enroll_page(): void {
    $e = $_SESSION['enroll'];
    $u = user_by_id((int)$e['uid']);
    if (!$u) { unset($_SESSION['enroll']); go(); }
    $uri = 'otpauth://totp/' . rawurlencode('Aleph One:' . $u['email']) . '?secret=' . $e['secret'] . '&issuer=' . rawurlencode('Aleph One');
    page('Two-step sign-in', null, function () use ($e, $u, $uri) { ?>
  <h1>Connect your authenticator</h1>
  <p>Hi <?= h($u['name']) ?>. Every sign-in needs Google and a code from your phone, so a hijacked Google account alone can't open the inbox.</p>
  <ol class="steps">
    <li>Install an authenticator app: Google Authenticator, Microsoft Authenticator, Authy or 1Password.</li>
    <li>On this phone? <a href="<?= h($uri) ?>">Open in the app</a>. Otherwise choose "Enter a setup key" and type this key:</li>
  </ol>
  <div class="key" aria-label="Authenticator key"><?= h(trim(chunk_split($e['secret'], 4, ' '))) ?></div>
  <p>Name it "Aleph One", time-based. Then fill in both boxes: the <strong>connect code</strong> another admin made for you (Team page), and the 6-digit code the app shows.</p>
  <?= form('enroll') ?>
    <input name="connect" aria-label="Connect code" placeholder="Connect code, e.g. ABCD-EFGH-JKLM" autocomplete="off" required>
    <input name="code" aria-label="6-digit code" placeholder="123 456" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" maxlength="7" required>
    <button class="go">Confirm and sign in</button>
  </form>
  <?= form('cancel') ?><button class="ghost">Start over</button></form>
<?php });
}
