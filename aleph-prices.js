// Authoritative price data: "Aleph One Price list 2026" (PDF, 4 pages). Every price on index.html and site.html derives from here.
window.ALEPH_PRICES = {
  currency: 'IDR',
  whatsapp: '62XXXXXXXXXX', // TODO: studio WhatsApp number, international format without +
  tiers: [
    { id: 'basic', name: 'Basic', tagline: 'Business profile', desc: 'A clean business profile, easy to find on Google.', price: 1000000,
      pages: 'Up to 5', days: 7, revisions: 2, hosting: 'Static, free',
      features: ['Aleph One design system, tailored to your logo and colours', 'Fast, secure static site', 'Home, About, Services or Products, Gallery, Contact'] },
    { id: 'medium', name: 'Medium', tagline: 'Custom brand website', desc: 'A brand website with a custom design made from scratch.', price: 2000000, featured: true,
      pages: 'Up to 8', days: 14, revisions: 3, hosting: 'Static, free',
      features: ['Everything in Basic', 'Custom design, approved by you before any code is written', 'Scroll animation and smooth transitions', 'Contact form with email delivery and spam protection'] },
    { id: 'advanced', name: 'Advanced', tagline: 'Self-managed with admin panel', desc: 'A website you manage yourself from an admin panel.', price: 3500000,
      pages: '8 + dynamic', days: 21, revisions: 3, hosting: 'Cloud database',
      features: ['Everything in Medium', 'Secure admin panel to edit content and images without code', '2 content types, such as products and articles, with pages generated automatically', 'Search, filters, and stored form entries'] }
  ],
  included: ['Responsive on phone, tablet, and laptop', 'HTTPS (SSL) enabled', 'Technical SEO: meta tags, sitemap, robots.txt', 'Link previews on WhatsApp and social media',
    'Google Search Console and Analytics 4', 'WhatsApp button, map, and social links', 'Optimised images (WebP, lazy loading)', 'Source code (Git) and a user guide', '30-day bug-fix warranty', 'Annual technical maintenance'],
  // One price for every package. The first year is billed with the final project payment.
  maintenance: {
    plans: [
      { id: 'annual', name: 'Paid annually', price: 300000, unit: 'per year', was: 600000, badge: 'Save 50%', note: 'One upfront payment covering 12 months. The first year is billed with the final project payment.' },
      { id: 'monthly', name: 'Paid monthly', price: 50000, unit: 'per month', note: 'Billed every month, Rp600.000 per year in total.' }
    ],
    does: ['Security updates to libraries and frameworks, checked monthly', 'Vulnerability patches as they are released', 'Bug fixes in the code we wrote', 'Uptime monitoring with automatic down alerts', 'Monthly health check: SSL, speed, errors, broken links', 'Monthly backup, plus the database on Advanced'],
    excludes: ['Changes to text, photos, or content. On Advanced you edit these yourself', 'New pages, features, or design work', 'Domain, hosting, and third-party fees', 'Fixes for code changed by anyone else'],
    response: { value: '2 days', label: 'working-day response', note: 'Critical issues, such as the site going down or showing signs of a breach, are picked up within 2 working days of being reported or detected.' }
  },
  addons: [
    { id: 'bi', name: 'Business Intelligence System', sub: 'Custom dashboard', desc: 'A dashboard built around your own data, such as sales, operations, or customers, with the charts and figures you actually use to decide.', price: 2000000,
      benefits: ['Sales, operations or customers on one screen', 'Only the charts and figures you use to decide', 'Runs on a cloud database we set up for you'], goodFor: 'Businesses that track their numbers in spreadsheets today',
      icon: 'M8 40V24M18 40V14M28 40V28M38 40V8M4 40h40' },
    { id: 'motion', name: 'Motion, UI/UX and 3D', sub: 'Motion graphics, UI/UX design, 3D renders', desc: 'Cinematic scroll animation, a refined UI/UX pass, and interactive 3D with a fallback for older devices.', price: 250000,
      benefits: ['Cinematic scroll animation', 'A refined UI/UX pass on every page', 'Interactive 3D, with a fallback for older devices'], goodFor: 'Brands that want to be remembered. This site is built this way.',
      icon: 'M18 24a6 6 0 1 0 12 0a6 6 0 1 0-12 0M6 24c0-5 8-9 18-9s18 4 18 9-8 9-18 9S6 29 6 24M38 8l1.5 3.5L43 13l-3.5 1.5L38 18l-1.5-3.5L33 13l3.5-1.5z' },
    { id: 'payment', name: 'Payment Gateway', sub: 'Midtrans or Xendit', desc: 'Online checkout with automatic payment status. Transaction fees are charged by the provider.', price: 250000,
      benefits: ['Online checkout with Midtrans or Xendit', 'Payment status updates automatically', 'Transaction fees are charged by the provider, not by us'], goodFor: 'Online shops, bookings, deposits and class sign-ups',
      icon: 'M6 13h36v23H6zM6 20h36M12 30h9M33 30h3' },
    { id: 'system', name: 'System Design', sub: 'Admin panel and business dashboard', desc: 'Secure admin login to manage content, plus a dashboard of key figures. The admin panel is included in Advanced.', price: 200000,
      benefits: ['Secure admin login to manage your content', 'A dashboard of your key figures', 'Already included in Advanced'], goodFor: 'Basic or Medium sites that need editing without code',
      icon: 'M6 8h16v14H6zM26 8h16v8H26zM26 20h16v20H26zM6 26h16v14H6z' },
    { id: 'chatbot', name: 'AI-Powered Chatbot', sub: 'Answers from your site content', desc: 'Replies to visitor questions around the clock. AI usage is billed to your own API account.', price: 50000,
      benefits: ['Answers visitor questions around the clock', 'Replies come from your own site content', 'AI usage is billed to your own API account'], goodFor: 'Businesses that answer the same WhatsApp questions every day',
      icon: 'M8 10h32v20H22l-8 7v-7H8zM16 20h1M24 20h1M32 20h1' },
    { id: 'api', name: 'API / Platform Integration', sub: 'Marketplace, CRM, shipping', desc: 'Connect a third-party platform to your site.', price: 50000, unit: 'per integration', perUnit: true,
      benefits: ['Connect a marketplace, CRM or shipping service', 'Priced per integration: add as many as you need', 'Accounts stay registered in your name'], goodFor: 'Shops on marketplaces, teams on a CRM, anyone shipping orders',
      icon: 'M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0M32 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0M20 36a4 4 0 1 0 8 0a4 4 0 1 0-8 0M16 12h16M14 15.5l7.5 17M34 15.5l-7.5 17' }
  ],
  addonsNote: 'Data features run on a cloud database we set up as part of the add-on. Hosting and third-party fees are billed by the provider.',
  process: [
    ['Deposit and materials', '50% deposit, plus your text, logo, and photos in one batch.'],
    ['Design', 'You approve the design before coding starts.'],
    ['Build and revise', 'Built on a preview link you can open any time.'],
    ['Final payment', 'The remaining 50% and your first maintenance payment.'],
    ['Launch', 'Live on your domain. Code and all access handed over.']
  ],
  deposit: 0.5,
  terms: ['50% payment upfront and 50% before the site goes live.', 'Delivery time starts once the deposit is received and your materials are complete.', 'One revision round is a single consolidated list of feedback.',
    'If materials or feedback are not received within 14 days, the project is paused. After 30 days it is closed and the deposit is non-refundable.', 'Source code and all access are handed over after full payment.',
    'Domain, hosting, database, and API accounts are registered in your name and paid directly to the provider, with no markup.', 'The 30-day warranty covers bugs in our code. It excludes provider outages, expired domains, and changes made by others.',
    'Additional pages and revision rounds are quoted on request.', 'Maintenance renews yearly. If it lapses, we no longer apply security updates or fixes.']
};
