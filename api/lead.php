<?php
// Saves one brief from the site's SEND button (navigator.sendBeacon, JSON body). WhatsApp stays the main channel,
// so the visitor never sees what happens here.
declare(strict_types=1);
require __DIR__ . '/lib.php';

const MAX_BODY = 20000;
const PER_VISITOR_HOUR = 10;  // one connection; a real person sends one or two
const ALL_PER_HOUR = 100;     // far above a studio's real volume; beyond it briefs are kept but marked 'held'
const HELD_PER_DAY = 1000;    // hard ceiling so a flood can't fill the database; held briefs are deleted after 30 days
const FIELDS = ['name' => 120, 'business' => 160, 'when' => 40, 'email' => 160, 'social' => 200, 'about' => 2000,
    'package' => 60, 'addons' => 400, 'maintenance' => 60, 'other' => 2000, 'message' => 6000];

if ($_SERVER['REQUEST_METHOD'] !== 'POST') reply(405, 'POST only.');
// Browsers send Origin on every POST, so another site's page can't file briefs here. Scripts without Origin meet the rate limit.
if (foreign_origin()) reply(403, 'Wrong origin.');

$raw = (string)file_get_contents('php://input', false, null, 0, MAX_BODY + 1);
if (strlen($raw) > MAX_BODY) reply(413, 'Too long.');
$in = json_decode($raw, true);
if (!is_array($in)) reply(400, 'Expected JSON.');

// Over-long fields are cut, not refused: a refused beacon would lose the brief without anyone knowing.
$lead = [];
foreach (FIELDS as $k => $max) $lead[$k] = mb_substr(trim(is_string($in[$k] ?? null) ? $in[$k] : ''), 0, $max);
if ($lead['name'] === '' || $lead['business'] === '') reply(422, 'Name and business are required.');
$price = $in['project_price'] ?? 0;
$lead['project_price'] = is_int($price) && $price >= 0 && $price <= 1000000000 ? $price : 0;

if (over_limit('lead', PER_VISITOR_HOUR, 60)) reply(429, 'Too many briefs from this connection. Try again in an hour.');
// Many addresses together: keep their briefs out of the main list (the Held tab) instead of refusing them, so a flood
// can't push real people out of the inbox, and a real brief that arrives during one is still kept.
$recent = fn(string $where, string $span) => (int)db()->query("SELECT COUNT(*) FROM leads WHERE $where AND created_at > UTC_TIMESTAMP() - INTERVAL $span")->fetchColumn();
$status = 'new';
if ($recent("status <> 'held'", '1 HOUR') >= ALL_PER_HOUR) {
    if ($recent("status = 'held'", '1 DAY') >= HELD_PER_DAY) reply(429, 'The inbox is busy. Send the brief on WhatsApp.');
    if ($recent("status = 'held'", '1 HOUR') === 0) log_event(null, 'flood', 'over ' . ALL_PER_HOUR . ' briefs this hour; new ones go to Held');
    $status = 'held';
}
db()->prepare('INSERT INTO leads (name, business, start_when, email, social, about, package, addons, maintenance, other, message, project_price, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())')->execute([...array_values($lead), $status]);
reply($status === 'held' ? 202 : 201, $status === 'held' ? 'Saved, held for review.' : 'Saved.');
