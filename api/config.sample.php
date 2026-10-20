<?php
// Settings template. On Hostinger (full guide: "Hostinger setup guide.md", kept next to the zip, outside the website):
// 1. hPanel > Databases > MySQL Databases: create a database and a user. Copy the full names (they start with u...) and the password.
// 2. Google Cloud console: an OAuth client of type "Web application" whose Authorized redirect URI is https://your-domain/admin/
//    (the Command Center's existing client works too: just add that URI to it).
// 3. File Manager: in the folder ABOVE public_html (domains/your-domain/), create aleph-config.php, paste this whole file
//    into it and fill in every value. (Can't save there? Use public_html/api/config.php instead.)
// This file holds secrets: never commit it, zip it or send it to anyone.
return [
    'db_host' => 'localhost',
    'db_name' => '',
    'db_user' => '',
    'db_pass' => '',
    // Two different long random texts, at least 24 characters each. Opening /admin/ before they are set shows fresh ones.
    // secret: hashes visitor IPs for the rate limits. Set it once and leave it.
    'secret' => '',
    // setup_key: typed once by each admin when connecting their authenticator app (and again after a reset). Share it only in person or by WhatsApp.
    'setup_key' => '',
    // The site's own address, no slash at the end, e.g. 'https://alephone.id'. Google sends people back to site_url + /admin/.
    'site_url' => '',
    'google_client_id' => '',
    'google_client_secret' => '',
    // The only Google accounts allowed into the dashboard. Remove one and that person is signed out on their next click.
    'admin_emails' => [
        // 'name@gmail.com',
    ],
];
