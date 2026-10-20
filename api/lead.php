<?php
// Saves one brief from the site's SEND button (navigator.sendBeacon, JSON body). WhatsApp stays the main channel,
// so the visitor never sees what happens here.
declare(strict_types=1);
require __DIR__ . '/lib.php';

const MAX_BODY = 20000;
const ALL_PER_HOUR = 100; // far above a studio's real volume
const FIELDS = ['name' => 120, 'business' => 160, 'when' => 40, 'email' => 160, 'social' => 200, 'about' => 2000,
    'package' => 60, 'addons' => 400, 'maintenance' => 60, 'other' => 2000, 'message' => 6000];

if ($_SERVER['REQUEST_METHOD'] !== 'POST') reply(405, 'POST only.');
// Browsers send Origin on every POST, so another site's page can't file briefs here. Scripts without Origin meet the rate limit.
$origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
if ($origin !== '' && parse_url($origin, PHP_URL_HOST) !== parse_url('//' . ($_SERVER['HTTP_HOST'] ?? ''), PHP_URL_HOST)) reply(403, 'Wrong origin.');

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

if (over_limit('lead', 10, 60)) reply(429, 'Too many briefs from this connection. Try again in an hour.');
// One cap for everyone as well, so many addresses together still can't bury real briefs in the inbox.
if ((int)db()->query('SELECT COUNT(*) FROM leads WHERE created_at > UTC_TIMESTAMP() - INTERVAL 1 HOUR')->fetchColumn() >= ALL_PER_HOUR) reply(429, 'The inbox is busy. Send the brief on WhatsApp.');
db()->prepare('INSERT INTO leads (name, business, start_when, email, social, about, package, addons, maintenance, other, message, project_price, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())')->execute(array_values($lead));
reply(201, 'Saved.');
