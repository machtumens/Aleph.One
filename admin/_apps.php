<?php
// AlephOS: the newest desktop-app installers from the public AlephOS-releases repo, plus a way into the Command Center.
declare(strict_types=1);
defined('ALEPH_ADMIN') || exit;

const RELEASES_API = 'https://api.github.com/repos/animamonology/AlephOS-releases/releases/latest';
const RELEASES_PAGE = 'https://github.com/animamonology/AlephOS-releases/releases/latest';
const DOWNLOAD_PREFIX = 'https://github.com/animamonology/AlephOS-releases/releases/download/';
const COMMAND_CENTER = 'https://dashboard-alephone.vercel.app/index.html#overview';
// [label, AlephOS file pattern, AlephOS Partners file pattern]
const PLATFORMS = [
    'win' => ['Windows 10 / 11', '/^AlephOS-Setup-[\d.]+\.exe$/', '/^AlephOS-Partners-Setup-[\d.]+\.exe$/'],
    'arm' => ['Mac, Apple silicon (M1 and later)', '/^AlephOS-[\d.]+-mac-arm64\.dmg$/', '/^AlephOS-Partners-[\d.]+-mac-arm64\.dmg$/'],
    'x64' => ['Mac, Intel', '/^AlephOS-[\d.]+-mac-x64\.dmg$/', '/^AlephOS-Partners-[\d.]+-mac-x64\.dmg$/'],
];

// Newest release, kept an hour in `meta`: unauthenticated GitHub allows 60 calls an hour per IP, and Hostinger IPs are shared.
// If GitHub is down, the last good copy is shown and asked again in 5 minutes.
function latest_release(): ?array {
    $cached = json_decode((string)db()->query("SELECT v FROM meta WHERE k = 'alephos'")->fetchColumn(), true);
    if (is_array($cached) && $cached['at'] > time() - 3600) return $cached['r'];
    [$status, $d] = http_json(RELEASES_API, null, ['User-Agent: AlephOne-website', 'Accept: application/vnd.github+json']);
    $r = $cached['r'] ?? null;
    $at = time() - 3300;
    if ($status === 200 && isset($d['tag_name'])) {
        $assets = [];
        foreach ($d['assets'] ?? [] as $a) {
            $url = (string)($a['browser_download_url'] ?? '');
            $digest = (string)($a['digest'] ?? ''); // GitHub's own SHA-256 of the upload, when it has one
            if (str_starts_with($url, DOWNLOAD_PREFIX)) $assets[] = ['name' => (string)$a['name'], 'size' => (int)$a['size'], 'url' => $url,
                'sha256' => preg_match('/^sha256:([0-9a-f]{64})$/', $digest, $m) ? $m[1] : ''];
        }
        $r = ['tag' => (string)$d['tag_name'], 'name' => (string)($d['name'] ?? $d['tag_name']), 'published' => (string)($d['published_at'] ?? ''),
            'notes' => mb_substr((string)($d['body'] ?? ''), 0, 3000), 'assets' => $assets];
        $at = time();
    }
    db()->prepare("REPLACE INTO meta (k, v) VALUES ('alephos', ?)")->execute([json_encode(['at' => $at, 'r' => $r])]);
    return $r;
}

// The "What changed" part of the release notes as plain lines (the notes are Markdown; the download table is shown separately).
function release_notes(string $md): string {
    $part = preg_match('/##\s*What changed\s*(.+?)(\n##\s|\z)/si', $md, $m) ? $m[1] : $md;
    return trim(preg_replace(['/\*\*(.+?)\*\*/', '/`([^`]*)`/', '/^\s*[-*]\s+/m'], ['$1', '$1', '• '], $part) ?? $part);
}

function apps_view(array $user): void {
    $r = latest_release();
    $ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
    $mine = str_contains($ua, 'Windows') ? 'win' : (str_contains($ua, 'Macintosh') ? 'mac' : '');
    $file = function (string $pattern) use ($r): string {
        foreach ($r['assets'] ?? [] as $a) {
            if (preg_match($pattern, $a['name'])) return '<a class="btn ghost" href="' . h($a['url']) . '">Download</a> <span class="meta">' . round($a['size'] / 1048576) . ' MB</span>'
                . (($a['sha256'] ?? '') !== '' ? '<br><span class="meta" title="SHA-256 ' . h($a['sha256']) . '">SHA-256 ' . h(substr($a['sha256'], 0, 12)) . '…</span>' : '');
        }
        return '<span class="meta">—</span>';
    };
    page('AlephOS', $user, function () use ($r, $mine, $file) { ?>
  <div class="head">
    <div><h1>AlephOS</h1><p>The Aleph One desktop apps. Both sign in with Google and open only for allowed accounts.</p></div>
    <a class="btn go" href="<?= h(COMMAND_CENTER) ?>" target="_blank" rel="noopener noreferrer">Open Command Center ↗</a>
  </div>
  <?php if (!$r): ?>
  <div class="panel"><p>GitHub didn't answer just now. The installers are on the <a href="<?= h(RELEASES_PAGE) ?>" target="_blank" rel="noopener noreferrer">latest release page</a>.</p></div>
  <?php else: ?>
  <div class="stats">
    <div class="stat"><span class="k">Latest version</span><b><?= h($r['tag']) ?></b><small><?= h($r['name']) ?></small></div>
    <div class="stat"><span class="k">Released</span><b><?= h($r['published'] ? jkt(str_replace(['T', 'Z'], [' ', ''], $r['published']), 'j M Y') : '—') ?></b><small>Jakarta date</small></div>
  </div>
  <div class="panel">
    <h2>Download</h2>
    <p><strong>AlephOS</strong> has the studio and the business dashboard in two tabs. <strong>AlephOS Partners</strong> has the business dashboard alone.</p>
    <table>
      <tr><th>Computer</th><th>AlephOS</th><th>AlephOS Partners</th></tr>
      <?php foreach (PLATFORMS as $key => [$label, $full, $partners]): ?>
      <tr<?= ($mine === 'win' && $key === 'win') || ($mine === 'mac' && $key !== 'win') ? ' style="background:var(--card2)"' : '' ?>>
        <td><?= h($label) ?></td><td><?= $file($full) ?></td><td><?= $file($partners) ?></td>
      </tr>
      <?php endforeach ?>
    </table>
    <p class="meta" style="margin-top:12px">Not sure which Mac? Apple menu → About This Mac: "Chip: Apple M…" is Apple silicon, "Processor: Intel" is Intel.</p>
  </div>
  <div class="panel">
    <h2>First launch</h2>
    <p>The installers aren't signed with a paid certificate yet, so the first launch takes one extra click.</p>
    <p><strong>Windows:</strong> SmartScreen says it protected your PC. Click More info, then Run anyway.<br>
    <strong>Mac:</strong> drag the app into Applications. The first time, open System Settings → Privacy &amp; Security and click Open Anyway.</p>
    <p>After that, the apps update themselves. Only click through those warnings for files downloaded from this page or the
    AlephOS-releases page. If something feels off, compare the SHA-256 under each download (Windows: <code>certutil -hashfile file SHA256</code>, Mac: <code>shasum -a 256 file</code>).</p>
  </div>
  <?php if (trim($r['notes']) !== ''): ?><div class="panel"><h2>What changed in <?= h($r['tag']) ?></h2><div class="notes" style="border:0;padding:0"><?= h(release_notes($r['notes'])) ?></div>
    <p style="margin-top:12px"><a href="<?= h(RELEASES_PAGE) ?>" target="_blank" rel="noopener noreferrer">All releases on GitHub ↗</a></p></div><?php endif ?>
  <?php endif ?>
<?php }, 'apps');
}
