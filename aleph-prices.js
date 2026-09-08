// Authoritative price data (Sept 2026 price list). Every displayed price derives from here.
window.ALEPH_PRICES = {
  currency: 'IDR',
  whatsapp: '62XXXXXXXXXX', // TODO: studio WhatsApp number, international format without +
  tiers: [
    { id: 'starter', name: 'Starter', price: 799000, pages: 1, days: '3–5', daysMax: 5, revisi: 2, garansi: 14,
      scope: ['1 halaman statis', 'Tombol WhatsApp, Google Maps, sosial media', 'SEO dasar, favicon', 'Hosting gratis'] },
    { id: 'business', name: 'Business', price: 999000, pages: 5, days: '5–7', daysMax: 7, revisi: 4, garansi: 30, badge: 'paling banyak dipilih',
      scope: ['Sampai 5 halaman', 'Katalog dasar (database)', 'Form kontak ke email + notifikasi WA', 'Galeri sampai 20 foto, testimoni', 'Motion sederhana, bantuan copywriting'] },
    { id: 'professional', name: 'Professional', price: 1499000, pages: 10, days: '10–14', daysMax: 14, revisi: 6, garansi: 60, freeAddons: { count: 2, cap: 300000 },
      scope: ['Sampai 10 halaman', 'Katalog sampai 50 item, pesan per item via WhatsApp', 'AI chatbot dilatih dengan data bisnis Anda', 'Blog, SEO lanjutan + Google Business Profile', 'Optimasi kecepatan, pelatihan 1 jam', '2 add-on gratis sampai Rp 300.000'] }
  ],
  maintenance: [
    { id: 'lite', name: 'Lite', price: 50000, unit: '/bln', sla: '≤ 2×24 jam', items: ['Monitoring uptime', 'Backup bulanan', 'Update keamanan', 'Scan malware bulanan', 'Monitoring SSL', '1 perubahan teks'] },
    { id: 'standard', name: 'Standard', price: 80000, unit: '/bln', sla: '≤ 24 jam', items: ['Semua di Lite', 'Backup mingguan', '3 perubahan', 'Laporan traffic', 'Scan mingguan', 'Dashboard status', 'Email prioritas'] },
    { id: 'pro', name: 'Pro', price: 120000, unit: '/bln', sla: '≤ 6 jam, antrean prioritas', items: ['Semua di Standard', 'Backup harian', 'Sampai 8 perubahan', 'Laporan performa + rekomendasi', 'Update katalog', 'Konsultasi WhatsApp jam kerja', 'Rollback point mingguan', 'Audit keamanan per kuartal'] },
    { id: 'lifetime', name: 'Lifetime', price: 1500000, unit: 'sekali bayar', sla: 'setara Standard', items: ['Setara Standard seumur situs', 'Balik modal di bulan ke-19'] }
  ],
  addons: [
    { id: 'server', name: 'Upgrade server', price: 250000, unit: '/bln', recurring: true, material: 'tab' },
    { id: 'domain', name: 'Domain .com / .id', price: 300000, unit: 'mulai', material: 'tab' },
    { id: 'email', name: 'Email bisnis', price: 200000, unit: '/thn', recurring: true, material: 'tab' },
    { id: 'security', name: 'Uji keamanan siber lanjutan', price: 150000, unit: '/bln', recurring: true, material: 'tab', trap: 'creates a duty of care' },
    { id: 'page', name: 'Halaman tambahan', price: 150000, material: 'plane' },
    { id: 'chatbot', name: 'AI chatbot personal', price: 500000, material: 'emissive' },
    { id: 'chatbotHosting', name: 'Hosting chatbot', price: 150000, unit: '/bln', recurring: true, material: 'tab' },
    { id: 'autoreply', name: 'WhatsApp auto-reply', price: 500000, material: 'tab' },
    { id: 'payment', name: 'Payment gateway (Midtrans/Xendit, QRIS)', price: 1500000, material: 'metallic' },
    { id: 'booking', name: 'Sistem booking', price: 1200000, material: 'mech' },
    { id: 'bilingual', name: 'Dua bahasa ID + EN', price: 400000, material: 'plane' },
    { id: 'motion', name: 'Upgrade motion sinematik', price: 150000, material: 'tab', trap: 'pre-ship QA costs more than it charges' },
    { id: 'logo', name: 'Logo', price: 200000, material: 'tab' },
    { id: 'photo', name: 'Foto produk, 10 item', price: 400000, material: 'tab' },
    { id: 'gbp', name: 'Google Business Profile', price: 200000, material: 'tab' },
    { id: 'seo', name: 'Audit SEO + kecepatan', price: 300000, material: 'tab' }
  ],
  express: { label: 'Express, 50% lebih cepat', pct: 0.5 },
  extras: [
    { name: 'Revisi di luar paket', price: 100000 }
  ],
  promos: [
    { name: 'Standard prabayar 12 bulan', price: 800000, note: 'hemat Rp 160.000' },
    { name: 'Referral', note: '2 bulan pemeliharaan gratis per referral yang closing' },
    { name: 'Professional + Lifetime', price: 2700000, note: 'hemat Rp 299.000' }
  ],
  terms: ['Harga belum termasuk pajak.', '50% di muka, 50% saat serah terima.'],
  warrantyExcludes: ['Domain kedaluwarsa yang tidak diperpanjang klien', 'Gangguan pihak ketiga (Cloudflare, Google, WhatsApp)', 'Kerusakan akibat perubahan oleh klien sendiri', 'Serangan siber di luar kendali yang wajar'],
  // ?pm internal assumptions, not shown publicly
  pm: { hours: { starter: 14, business: 28, professional: 56 }, capacityHoursPerSprint: 120, addonHours: { payment: 10, booking: 9, chatbot: 6, bilingual: 5, motion: 4, security: 3, page: 1.5, autoreply: 3 } }
};
