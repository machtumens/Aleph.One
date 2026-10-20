<?php
// Briefs: totals, filter and search, a status and notes per brief, CSV export, and delete (for removal requests).
// "Held" briefs arrived during a flood (see api/lead.php): kept apart from the main list, deleted after 30 days.
declare(strict_types=1);
defined('ALEPH_ADMIN') || exit;

const STATUSES = ['new' => 'New', 'contacted' => 'Contacted', 'won' => 'Won', 'lost' => 'Lost', 'held' => 'Held'];
const PER_PAGE = 30;
const EXPORT_COLS = ['id', 'created_at', 'status', 'name', 'business', 'start_when', 'email', 'social', 'package', 'addons', 'maintenance', 'project_price', 'about', 'other', 'notes'];

// Filters kept to known keys and values, so a redirect built from them can only land back on this page.
function filters(array $src): array {
    $f = [];
    $s = param($src, 'status');
    if (isset(STATUSES[$s])) $f['status'] = $s;
    $q = trim(mb_substr(param($src, 'q'), 0, 80));
    if ($q !== '') $f['q'] = $q;
    $page = (int)param($src, 'page');
    if ($page > 1) $f['page'] = min($page, 10000);
    return $f;
}

function here(array $f): string { return './' . ($f ? '?' . http_build_query($f) : ''); }

function inbox_post(array $user, string $do): void {
    parse_str(param($_POST, 'back'), $b);
    $back = here(filters($b));
    $id = (int)param($_POST, 'id');
    if ($do === 'lead_save') {
        $status = param($_POST, 'status');
        if (!isset(STATUSES[$status]) || $id < 1) { flash('Nothing saved.', 'bad'); go($back); }
        $notes = mb_substr(trim(param($_POST, 'notes')), 0, 5000);
        $q = db()->prepare('UPDATE leads SET status = ?, notes = ?, updated_at = UTC_TIMESTAMP(), updated_by = ? WHERE id = ?');
        $q->execute([$status, $notes, $user['id'], $id]);
        log_event((int)$user['id'], 'brief_saved', '#' . $id . ' ' . $status);
        flash('Saved brief #' . $id . '.');
        go($back . '#b' . $id);
    }
    if ($do === 'lead_delete') {
        require_stepup($back);
        if (param($_POST, 'confirm') !== 'yes' || $id < 1) { flash('Not deleted: tick the box to confirm.', 'bad'); go($back); }
        db()->prepare('DELETE FROM leads WHERE id = ?')->execute([$id]);
        log_event((int)$user['id'], 'brief_deleted', '#' . $id);
        flash('Deleted brief #' . $id . ' for good.');
        go($back);
    }
    if ($do === 'export') {
        require_stepup($back);
        export_csv($user);
    }
}

// Spreadsheet apps run cells starting with = + - @ as formulas; a leading apostrophe keeps a visitor's text as text.
function cell(string $v): string { return preg_match('/^[=+\-@\t\r]/', $v) ? "'" . $v : $v; }

function export_csv(array $user): void {
    log_event((int)$user['id'], 'export', 'all briefs');
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="aleph-briefs-' . gmdate('Y-m-d') . '.csv"');
    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF"); // lets Excel read the file as UTF-8
    fputcsv($out, EXPORT_COLS, ',', '"', '');
    foreach (db()->query('SELECT ' . implode(', ', EXPORT_COLS) . ' FROM leads ORDER BY id DESC') as $r) {
        $r['created_at'] = jkt($r['created_at'], 'Y-m-d H:i') . ' WIB';
        fputcsv($out, array_map(fn($v) => cell((string)$v), $r), ',', '"', '');
    }
    exit;
}

function inbox_view(array $user): void {
    $f = filters($_GET);
    $where = [];
    $args = [];
    if (isset($f['status'])) { $where[] = 'l.status = ?'; $args[] = $f['status']; }
    else $where[] = "l.status <> 'held'"; // "All" means all real briefs; flood leftovers stay in their own tab
    if (isset($f['q'])) {
        $like = '%' . addcslashes($f['q'], '%_\\') . '%';
        $where[] = '(l.name LIKE ? OR l.business LIKE ? OR l.email LIKE ? OR l.social LIKE ?)';
        array_push($args, $like, $like, $like, $like);
    }
    $w = $where ? ' WHERE ' . implode(' AND ', $where) : '';
    $q = db()->prepare('SELECT COUNT(*) FROM leads l' . $w);
    $q->execute($args);
    $total = (int)$q->fetchColumn();
    $pages = max(1, (int)ceil($total / PER_PAGE));
    $page = min($f['page'] ?? 1, $pages);
    $q = db()->prepare('SELECT l.*, u.name AS editor FROM leads l LEFT JOIN users u ON u.id = l.updated_by' . $w
        . ' ORDER BY l.id DESC LIMIT ' . PER_PAGE . ' OFFSET ' . (($page - 1) * PER_PAGE));
    $q->execute($args);
    $leads = $q->fetchAll();

    $by = db()->query('SELECT status, COUNT(*) AS n, COALESCE(SUM(project_price), 0) AS v FROM leads GROUP BY status')->fetchAll(PDO::FETCH_UNIQUE);
    $n = fn(string $s) => (int)($by[$s]['n'] ?? 0);
    $v = fn(string $s) => (int)($by[$s]['v'] ?? 0);
    $monthStart = (new DateTime('first day of this month 00:00', new DateTimeZone('Asia/Jakarta')))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
    $q = db()->prepare("SELECT COUNT(*) FROM leads WHERE created_at >= ? AND status <> 'held'");
    $q->execute([$monthStart]);
    $month = (int)$q->fetchColumn();
    $backQs = http_build_query(['status' => $f['status'] ?? null, 'q' => $f['q'] ?? null, 'page' => $page > 1 ? $page : null]);
    $tab = fn(?string $s, string $label) => '<a href="' . h(here(array_filter(['status' => $s, 'q' => $f['q'] ?? null]))) . '"'
        . (($f['status'] ?? null) === $s ? ' aria-current="page"' : '') . '>' . $label . '</a>';

    page('Briefs', $user, function () use ($user, $f, $leads, $total, $page, $pages, $n, $v, $month, $backQs, $tab) { ?>
  <div class="head">
    <div><h1>Briefs</h1><p>Everything sent from the website's SEND button. Times in Jakarta.</p></div>
    <?= form('export') ?><button class="ghost">Export all (CSV)</button></form>
  </div>
  <div class="stats">
    <div class="stat"><span class="k">New, not answered</span><b><?= $n('new') ?></b></div>
    <div class="stat"><span class="k">In conversation</span><b><?= $n('contacted') ?></b></div>
    <div class="stat"><span class="k">Open value</span><b><?= h(rp($v('new') + $v('contacted'))) ?></b><small>new + in conversation</small></div>
    <div class="stat"><span class="k">Won</span><b><?= $n('won') ?></b><small><?= h(rp($v('won'))) ?></small></div>
    <div class="stat"><span class="k">This month</span><b><?= $month ?></b><small>briefs received</small></div>
    <?php if ($n('held')): ?><div class="stat"><span class="k">Held during a flood</span><b><?= $n('held') ?></b><small>check the Held tab</small></div><?php endif ?>
  </div>
  <div class="bar">
    <nav class="tabs" aria-label="Status"><?= $tab(null, 'All') ?><?php foreach (STATUSES as $s => $label) echo $tab($s, $label); ?></nav>
    <form method="get" role="search">
      <?php if (isset($f['status'])): ?><input type="hidden" name="status" value="<?= h($f['status']) ?>"><?php endif ?>
      <input type="search" name="q" value="<?= h($f['q'] ?? '') ?>" aria-label="Search" placeholder="Search name, business, email, Instagram">
      <button class="ghost">Search</button>
    </form>
  </div>
  <main class="list">
  <?php if (($f['status'] ?? '') === 'held'): ?><p class="meta">These arrived while more than 100 briefs an hour were coming in, which usually means spam. Real ones: set them to New. The rest are deleted automatically after 30 days.</p><?php endif ?>
  <?php if (!$leads): ?><p class="empty"><?= $total === 0 && !$f ? 'No briefs yet. They land here when someone presses SEND ON WHATSAPP on the site.' : 'Nothing matches.' ?></p><?php endif ?>
  <?php foreach ($leads as $l) lead_card($user, $l, $backQs); ?>
  </main>
  <?php if ($pages > 1): ?><nav class="pager" aria-label="Pages">
    <?php if ($page > 1): ?><a class="btn ghost" href="<?= h(here(['page' => $page - 1] + $f)) ?>">Newer</a><?php endif ?>
    <span class="meta">Page <?= $page ?> of <?= $pages ?> · <?= $total ?> briefs</span>
    <?php if ($page < $pages): ?><a class="btn ghost" href="<?= h(here(['page' => $page + 1] + $f)) ?>">Older</a><?php endif ?>
  </nav><?php endif ?>
<?php }, 'inbox');
}

// Links only for plain web addresses, always https; anything else stays text.
function site_link(string $s): string {
    return preg_match('~^(https?://)?([a-z0-9-]+\.)+[a-z]{2,}(/[^\s"<>]*)?$~i', $s) ? 'https://' . preg_replace('~^https?://~i', '', $s) : '';
}

function lead_card(array $user, array $l, string $backQs): void {
    $url = site_link($l['social']);
    $id = (int)$l['id']; ?>
    <article class="lead" id="b<?= $id ?>">
      <header>
        <h2><?= h($l['name']) ?></h2><span class="biz"><?= h($l['business']) ?></span>
        <span class="pill <?= h($l['status']) ?>"><?= h(STATUSES[$l['status']] ?? $l['status']) ?></span>
        <span class="price"><?= h(rp($l['project_price'])) ?></span>
      </header>
      <div class="grid">
        <div><span class="k">Received</span><?= h(jkt($l['created_at'])) ?></div>
        <div><span class="k">Wants to start</span><?= h($l['start_when'] ?: '—') ?></div>
        <div><span class="k">Package</span><?= h($l['package'] ?: '—') ?></div>
        <div><span class="k">Add-ons</span><?= h($l['addons'] ?: 'None') ?></div>
        <div><span class="k">Maintenance</span><?= h($l['maintenance'] ?: '—') ?></div>
        <div><span class="k">Email</span><?= $l['email'] !== '' ? '<a href="mailto:' . h(rawurlencode($l['email'])) . '">' . h($l['email']) . '</a>' : '—' ?></div>
        <div><span class="k">Instagram or website</span><?= $url !== '' ? '<a href="' . h($url) . '" target="_blank" rel="noopener noreferrer">' . h($l['social']) . '</a>' : h($l['social'] ?: '—') ?></div>
      </div>
      <?php if ($l['about'] !== '' || $l['other'] !== ''): ?><div class="notes"><?= h(trim($l['about'] . ($l['other'] !== '' ? "\n\nOther: " . $l['other'] : ''))) ?></div><?php endif ?>
      <?php if ($l['message'] !== ''): ?><details><summary>Message as sent to WhatsApp</summary><pre><?= h($l['message']) ?></pre></details><?php endif ?>
      <?= form('lead_save', ' class="edit"') ?>
        <input type="hidden" name="id" value="<?= $id ?>"><input type="hidden" name="back" value="<?= h($backQs) ?>">
        <label><span class="k">Status</span><select name="status"><?php foreach (STATUSES as $s => $label): ?><option value="<?= $s ?>"<?= $l['status'] === $s ? ' selected' : '' ?>><?= $label ?></option><?php endforeach ?></select></label>
        <label><span class="k">Team notes</span><textarea name="notes" maxlength="5000" placeholder="Called on Monday, sending a quote…"><?= h($l['notes'] ?? '') ?></textarea></label>
        <button class="go" style="margin-top:18px">Save</button>
      </form>
      <?php if ($l['updated_at']): ?><p class="meta" style="margin:0">Last changed by <?= h($l['editor'] ?? 'a removed account') ?>, <?= h(jkt($l['updated_at'])) ?></p><?php endif ?>
      <details><summary>Delete this brief</summary>
        <?= form('lead_delete', ' class="del"') ?><input type="hidden" name="id" value="<?= $id ?>"><input type="hidden" name="back" value="<?= h($backQs) ?>">
          <label><input type="checkbox" name="confirm" value="yes" style="width:auto;min-height:0"> Yes, delete it for good (for example when the person asks)</label>
          <button class="danger">Delete</button>
        </form></details>
    </article>
<?php
}
