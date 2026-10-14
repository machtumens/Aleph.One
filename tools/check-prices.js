// node tools/check-prices.js — aleph-prices.js must match "Aleph One Price list 2026" (PDF) and the 50/50 split must add up.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(__dirname + '/../aleph-prices.js', 'utf8'), ctx);
const P = JSON.parse(JSON.stringify(ctx.window.ALEPH_PRICES)), by = (list, id) => list.find(x => x.id === id);

assert.deepStrictEqual(P.tiers.map(t => [t.id, t.price, t.days, t.revisions]), [['basic', 1000000, 7, 2], ['medium', 2000000, 14, 3], ['advanced', 3500000, 21, 3]]);
assert.deepStrictEqual(P.maintenance.plans.map(m => [m.id, m.price]), [['annual', 300000], ['monthly', 50000]]);
assert.strictEqual(by(P.maintenance.plans, 'monthly').price * 12, by(P.maintenance.plans, 'annual').was);
assert.deepStrictEqual(P.addons.map(a => [a.id, a.price]), [['bi', 2000000], ['motion', 250000], ['payment', 250000], ['system', 200000], ['chatbot', 50000], ['api', 50000]]);
assert.strictEqual(P.included.length, 10); assert.strictEqual(P.process.length, 5); assert.strictEqual(P.terms.length, 9);

// Same arithmetic as calc() in index.html: Medium + Motion + 2 integrations, paid 50/50.
const project = by(P.tiers, 'medium').price + by(P.addons, 'motion').price + by(P.addons, 'api').price * 2, deposit = Math.round(project * P.deposit);
assert.strictEqual(project, 2350000); assert.strictEqual(deposit + (project - deposit), project); assert.strictEqual(deposit, 1175000);
console.log('prices ok: 3 packages, 6 add-ons, 2 maintenance plans match the 2026 list');
