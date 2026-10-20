<?php
// One-time setup on Hostinger:
// 1. hPanel > Databases > MySQL Databases: create a database and a user. Copy the full names (they start with u...) and the password.
// 2. File Manager: copy this file to api/config.php (same folder) and fill in every value below.
// 3. Open https://your-domain/admin/ and sign in with admin_password. The tables create themselves on first use.
// config.php holds secrets: never commit it, zip it or send it to anyone.
return [
    'db_host' => 'localhost',
    'db_name' => '',
    'db_user' => '',
    'db_pass' => '',
    // At least 16 characters. The inbox refuses to open with a shorter one.
    'admin_password' => '',
    // Any long random text (30+ characters). Used to hash visitor IPs for the rate limits. Set it once and leave it.
    'secret' => '',
];
