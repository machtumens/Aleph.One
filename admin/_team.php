<?php
// Team: the admins on the list. Make a one-time connect code so someone can connect their authenticator, reset a lost one,
// or switch someone off at once. Who may be an admin at all is admin_emails in the settings file.
// Activity: who did what. Account: sign out on every device.
declare(strict_types=1);
defined('ALEPH_ADMIN') || exit;

function team_post(array $user, string $do): void {
    $me = (int)$user['id'];
    if ($do === 'sign_out_all') {
        db()->prepare('UPDATE users SET gen = gen + 1 WHERE id = ?')->execute([$me]);
        log_event($me, 'sign_out_all');
        sign_out();
        flash('Signed out on every device.');
        go();
    }
    if (!in_array($do, ['connect', 'reset_2fa', 'toggle_active'], true)) return;
    require_stepup('./?view=team');
    $email = strtolower(param($_POST, 'email'));
    // Only for someone else on the list, never yourself, so one admin always stays able to undo a change.
    if (!allowed($email) || $email === $user['email']) { flash('Pick someone else on the admin list.', 'bad'); go('./?view=team'); }
    $q = db()->prepare('SELECT * FROM users WHERE email = ?');
    $q->execute([$email]);
    $t = $q->fetch() ?: null;
    if ($do === 'connect') {
        if ($t && $t['totp_secret'] !== null) { flash('They already have an authenticator. Use Reset authenticator if they lost it.', 'bad'); go('./?view=team'); }
        $_SESSION['connect'] = [$email, make_connect_code($me, $email)];
    } elseif (!$t) {
        flash('They haven\'t signed in yet.', 'bad');
    } elseif ($do === 'reset_2fa') {
        db()->prepare('UPDATE users SET totp_secret = NULL, totp_step = 0, gen = gen + 1 WHERE id = ?')->execute([$t['id']]);
        log_event($me, '2fa_reset', mask_email($email));
        $_SESSION['connect'] = [$email, make_connect_code($me, $email)];
    } else {
        db()->prepare('UPDATE users SET active = 1 - active, gen = gen + 1 WHERE id = ?')->execute([$t['id']]);
        log_event($me, $t['active'] ? 'switched_off' : 'switched_on', mask_email($email));
        flash($t['name'] . ($t['active'] ? ' can no longer sign in.' : ' can sign in again.'));
    }
    go('./?view=team');
}

function team_view(array $user): void {
    $rows = db()->query('SELECT * FROM users')->fetchAll();
    $byEmail = array_column($rows, null, 'email');
    $connect = $_SESSION['connect'] ?? null;
    unset($_SESSION['connect']);
    page('Team', $user, function () use ($user, $byEmail, $connect) { ?>
  <div class="head"><div><h1>Team</h1><p>Admins sign in with Google and an authenticator app. The list of allowed emails lives in the settings file on the server.</p></div></div>
  <?php if ($connect): ?><div class="panel">
    <h2>Connect code for <?= h($connect[0]) ?></h2>
    <p>Send it to them yourself (WhatsApp is fine). They sign in with Google and type it when connecting their authenticator. It works once, for <?= CONNECT_HOURS ?> hours, and this is the only time it is shown.</p>
    <div class="key copy"><?= h($connect[1]) ?></div>
  </div><?php endif ?>
  <div class="panel">
    <table>
      <tr><th>Admin</th><th>Authenticator</th><th>Last sign-in</th><th></th></tr>
      <?php foreach (admin_emails() as $email): $p = $byEmail[$email] ?? null; $self = $email === $user['email']; ?>
      <tr>
        <td><?= h($p['name'] ?? '') ?><br><span class="meta"><?= h($email) ?></span><?= $p && !$p['active'] ? '<br><span class="pill">Switched off</span>' : '' ?></td>
        <td><?= $p && $p['totp_secret'] ? 'On' : ($p && $p['enrol_hash'] ? 'Connect code made' : 'Not connected yet') ?></td>
        <td><?= h(jkt($p['last_login_at'] ?? null)) ?></td>
        <td><?php if ($self): ?><span class="meta">You</span><?php else: ?>
          <?php if (!$p || !$p['totp_secret']): ?><?= form('connect') ?><input type="hidden" name="email" value="<?= h($email) ?>"><button class="go">Make connect code</button></form><?php endif ?>
          <?php if ($p && $p['totp_secret']): ?><?= form('reset_2fa') ?><input type="hidden" name="email" value="<?= h($email) ?>"><button class="ghost">Reset authenticator</button></form><?php endif ?>
          <?php if ($p): ?><?= form('toggle_active') ?><input type="hidden" name="email" value="<?= h($email) ?>"><button class="<?= $p['active'] ? 'danger' : 'ghost' ?>"><?= $p['active'] ? 'Switch off' : 'Switch on' ?></button></form><?php endif ?>
        <?php endif ?></td>
      </tr>
      <?php endforeach ?>
    </table>
  </div>
  <div class="panel">
    <h2>Adding or removing an admin</h2>
    <p>Edit <code>admin_emails</code> in <code>aleph-config.php</code> on the server, then make them a connect code here. Someone removed from the list is signed out on their next click (Hostinger can take up to a minute to notice the edit). To stop someone right now, Switch off.</p>
  </div>
<?php }, 'team');
}

function activity_view(array $user): void {
    $admins = param($_GET, 'who') === 'admins';
    $rows = db()->query('SELECT e.*, u.name FROM events e LEFT JOIN users u ON u.id = e.user_id' . ($admins ? ' WHERE e.user_id IS NOT NULL' : '') . ' ORDER BY e.id DESC LIMIT 300')->fetchAll();
    page('Activity', $user, function () use ($rows, $admins) { ?>
  <div class="head"><div><h1>Activity</h1><p>The newest 300 events, kept for a year. "Connection" is a scrambled fingerprint of the IP address: the same value means the same connection.</p></div></div>
  <div class="bar"><nav class="tabs" aria-label="Filter">
    <a href="./?view=activity"<?= $admins ? '' : ' aria-current="page"' ?>>Everything</a>
    <a href="./?view=activity&amp;who=admins"<?= $admins ? ' aria-current="page"' : '' ?>>Admins only</a>
  </nav></div>
  <div class="panel">
    <table>
      <tr><th>When</th><th>Who</th><th>What</th><th>Detail</th><th>Connection</th></tr>
      <?php foreach ($rows as $r): ?><tr>
        <td><?= h(jkt($r['at'])) ?></td><td><?= h($r['name'] ?? '—') ?></td><td><?= h(str_replace('_', ' ', $r['action'])) ?></td>
        <td><?= h($r['detail']) ?></td><td class="meta"><?= h(substr($r['ip_hash'], 0, 8)) ?></td>
      </tr><?php endforeach ?>
    </table>
  </div>
<?php }, 'activity');
}

function account_view(array $user): void {
    page('Account', $user, function () use ($user) { ?>
  <div class="head"><div><h1>Account</h1><p><?= h($user['name']) ?> · <?= h($user['email']) ?></p></div></div>
  <div class="panel">
    <h2>Lost a phone or laptop?</h2>
    <p>Sign out everywhere now. Lost the phone with your authenticator: ask another admin to reset it; they'll give you a connect code for the new phone. Also secure your Google account.</p>
    <?= form('sign_out_all') ?><button class="danger">Sign out on every device</button></form>
  </div>
<?php }, 'account');
}
