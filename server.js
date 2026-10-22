// FleetLog (hosted build) – plain Node >=18, no deps. Static files + /api.
// Env: PORT, DATA_DIR (default ./data), PIN_HASH (sha256 hex of the PIN; unset = no PIN, local testing only).
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const L = require('./public/logic.js');
const KB = require('./kb.js'); /*KBASE1*/
const PORT = process.env.PORT || 8790, DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data')), DATA = path.join(DATA_DIR, 'data.json'), PUB = path.join(__dirname, 'public');
fs.mkdirSync(DATA_DIR, { recursive: true });
{ const kc = path.join(DATA_DIR, 'kb-cache.json'), seed = path.join(__dirname, 'seed', 'kb-cache.json'); if (!fs.existsSync(kc) && fs.existsSync(seed)) fs.copyFileSync(seed, kc); }
const PIN_HASH = String(process.env.PIN_HASH || '').trim().toLowerCase();
if (!PIN_HASH) console.warn('WARNING: PIN_HASH not set – API is open. Set it before going live.');
const FAILS = new Map(), MAXF = 5, WIN = 15 * 60 * 1000; // wrong-PIN limit: 5 per 15 min per IP
const ipOf = req => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
const safeEq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const COLS = ['vehicles', 'services', 'parts', 'quotes', 'intervals', 'mileageLog', 'profile', 'inspections', 'kbFixes', 'vir']; /*VIRFORM*/
const DEFAULT_INTERVALS = [
  ['Oil change', 7500, 6], ['Tire rotation', 10000, 6], ['Tires', 50000, 48], ['Brakes', 40000, null],
  ['Battery', null, 48], ['Transmission fluid', 60000, null], ['Coolant', 100000, 60], ['Air filter', 20000, 12],
  ['Spark plugs', 100000, null], ['DOT inspection', null, 12]].map(([category, miles, months]) => ({ id: crypto.randomUUID(), category, miles, months }));
// Per-contractor data: each signed-in user gets their own file (data-<hash>.json). No user = demo (data.json).
// NOTE: this local server trusts the X-User header; it separates data but is NOT a security boundary.
// Real protection for shared cloud data = Supabase table with row-level security (see SETUP-SIGNIN.md).
const DBS = new Map();
function fileFor(user) { return user ? path.join(DATA_DIR, 'data-' + crypto.createHash('sha256').update(user).digest('hex').slice(0, 24) + '.json') : DATA; }
/*TRIAL3 3-day free trial. Data is never deleted; after the trial, data routes return 402 until paid.*/
const TRIAL_DAYS = 3, PAYMENT_URL = process.env.PAYMENT_URL || '', HELP_EMAIL = 'fleetlog.support@gmail.com';
const OWNER_PAID = /^(1|true|yes)$/i.test(process.env.OWNER_PAID || ''); // exempts the owner (no-user / default) account
/*PLANS1 subscription plans – defined once, exposed via /api/billing as `plans`.*/
const PLANS = [
  { id: 'basic', name: 'Basic', trucks: 5, desc: 'Up to 5 trucks', monthly: 15.99, yearly: 159 },
  { id: 'premium', name: 'Premium', trucks: 15, desc: 'Up to 15 trucks · batch printing · cost dashboard', monthly: 19.99, yearly: 199, popular: true },
  { id: 'pro', name: 'Pro', trucks: null, desc: 'Unlimited trucks · priority email support', monthly: 24.99, yearly: 249 }];
const STRIPE_LINKS = { basic: { monthly: process.env.STRIPE_LINK_BASIC_MONTHLY || 'https://buy.stripe.com/test_4gM4gzb2M1j5c0wgYU5sA02', yearly: process.env.STRIPE_LINK_BASIC_YEARLY || '' }, premium: { monthly: process.env.STRIPE_LINK_PREMIUM_MONTHLY || '', yearly: process.env.STRIPE_LINK_PREMIUM_YEARLY || '' }, pro: { monthly: process.env.STRIPE_LINK_PRO_MONTHLY || 'https://buy.stripe.com/test_9B69AT2wg9PB5C8eQM5sA00', yearly: process.env.STRIPE_LINK_PRO_YEARLY || 'https://buy.stripe.com/test_dRmfZhc6Qf9V1lS4c85sA01' } };
const ANY_LINK = Object.values(STRIPE_LINKS).some(o => o.monthly || o.yearly);
const TEST_PAYMENTS = process.env.TEST_PAYMENTS ? /^(1|true|yes)$/i.test(process.env.TEST_PAYMENTS) : true;
function linkFor(plan, period, user) { const l = (STRIPE_LINKS[plan] || {})[period]; return l ? l + (l.includes('?') ? '&' : '?') + 'client_reference_id=' + encodeURIComponent(user || 'owner') : ''; }
/*PLANLIMIT plan + truck limit. Trial (no plan) = no limit. Paid without a plan id (legacy/owner) = unlimited.*/
function planOf(db, user) {
  const b = db.billing, paid = (b && b.status === 'paid') || (OWNER_PAID && !user);
  if (!paid) return null;
  return PLANS.find(x => x.id === (b && b.plan)) || PLANS.find(x => x.id === 'pro');
}
const truckCount = db => db.vehicles.filter(v => !v.example).length;
function billing(db, user) {
  const paid = (db.billing && db.billing.status === 'paid') || (OWNER_PAID && !user);
  const start = Date.parse(db.trialStart) || Date.now(), end = start + TRIAL_DAYS * 864e5, now = Date.now();
  const plans = PLANS.map(p => ({ ...p, links: { monthly: linkFor(p.id, 'monthly', user), yearly: linkFor(p.id, 'yearly', user) } }));
  return { paid: !!paid, trialStart: db.trialStart, trialEnds: new Date(end).toISOString(), daysLeft: paid ? null : Math.max(0, Math.ceil((end - now) / 864e5)), active: !!paid || now < end, paymentUrl: PAYMENT_URL, email: HELP_EMAIL, plans, testPayments: TEST_PAYMENTS, subscription: db.billing || null, ownerExempt: !!(OWNER_PAID && !user), ...(pl => ({ plan: pl ? pl.id : null, planName: pl ? pl.name : null, cycle: (db.billing && (db.billing.cycle || db.billing.period)) || null, truckLimit: pl ? pl.trucks : null, trucks: truckCount(db) }))(planOf(db, user)) };
}
function getDb(user) {
  const f = fileFor(user);
  if (DBS.has(f)) return DBS.get(f);
  let d; try { d = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { d = null; }
  if (!d) d = { intervals: DEFAULT_INTERVALS.map(x => ({ ...x, id: crypto.randomUUID() })) };
  for (const c of COLS) d[c] = d[c] || [];
  Object.defineProperty(d, '_file', { value: f, enumerable: false });
  DBS.set(f, d); if (!d.trialStart) { d.trialStart = new Date().toISOString(); fs.writeFileSync(f + '.tmp', JSON.stringify(d, null, 2)); fs.renameSync(f + '.tmp', f); } return d;
}
const save = db => { fs.writeFileSync(db._file + '.tmp', JSON.stringify(db, null, 2)); fs.renameSync(db._file + '.tmp', db._file); };
save(getDb(''));
function example(db) {
  const ex = { example: true }, id = () => crypto.randomUUID();
  const d = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  const v1 = { id: id(), truck: 'EX-101', year: 2021, make: 'Ford', model: 'Transit 250', vin: '', mileage: 142300, ...ex };
  const v2 = { id: id(), truck: 'EX-102', year: 2019, make: 'Ford', model: 'Transit 350 HD', vin: '', mileage: 211800, ...ex };
  db.vehicles.push(v1, v2);
  const S = (v, days, mileage, cost, shop, category, parts, notes, downtimeDays) => ({ id: id(), vehicleId: v.id, date: d(days), mileage, cost, shop, category, parts, notes, downtimeDays, ...ex });
  db.services.push(
    S(v1, 300, 118000, 89, 'Quick Lube Tracy', 'Oil change', '', '', 0), S(v1, 150, 130500, 95, 'Quick Lube Tracy', 'Oil change', '', '', 0),
    S(v1, 40, 139800, 1450, 'Valley Ford', 'Repair', 'Sliding door roller & cable', 'Door stuck on route', 2),
    S(v2, 330, 178000, 2900, 'Central Valley Transmission', 'Transmission fluid', 'Fluid + valve body', '', 4),
    S(v2, 120, 199000, 99, 'Quick Lube Tracy', 'Oil change', '', '', 0), S(v2, 20, 210500, 640, 'Valley Ford', 'Brakes', 'Front pads & rotors', '', 1));
  const P = (v, days, mileage, type, position, brand, cost, notes) => ({ id: id(), vehicleId: v.id, date: d(days), mileage, type, position, brand, cost, notes, ...ex });
  db.parts.push(P(v1, 200, 125000, 'Tires', 'All 4', 'Michelin Agilis', 1180, ''), P(v1, 90, 135000, 'Battery', '', 'Motorcraft', 260, 'No-start'),
    P(v2, 60, 206000, 'Alternator', '', 'Reman', 520, 'Battery light on'), P(v2, 10, 211500, 'Starter', '', 'Reman', 410, ''));
  const Q = (v, job, shop, price, chosen) => ({ id: id(), vehicleId: v.id, job, shop, price, date: d(3), notes: '', chosen, ...ex });
  db.quotes.push(Q(v1, 'Rear brakes', 'Valley Ford', 720, false), Q(v1, 'Rear brakes', 'Tracy Brake & Tire', 540, true), Q(v1, 'Rear brakes', 'Midas', 610, false));
}
const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type }); res.end(type === 'application/json' ? JSON.stringify(body) : body); };
const body = req => new Promise((ok, no) => { let s = ''; req.on('data', c => s += c); req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { no(e); } }); });
const NUMS = ['mileage', 'cost', 'downtimeDays', 'price', 'year', 'miles', 'months'];
function clean(o) { const r = { ...o }; delete r.id; for (const k of NUMS) if (k in r) r[k] = r[k] === '' || r[k] == null ? null : (Number(String(r[k]).replace(/[^0-9.-]/g, '')) || 0); return r; }
function bumpMileage(db, rec) {
  const v = db.vehicles.find(v => v.id === rec.vehicleId);
  if (v && rec.mileage > (v.mileage || 0)) v.mileage = rec.mileage;
}
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'), p = u.pathname.split('/').filter(Boolean);
  try {
    if (u.pathname === '/healthz') return send(res, 200, { ok: true });
    if (p[0] !== 'api') {
      const f = path.join(PUB, u.pathname === '/' ? 'index.html' : path.normalize(u.pathname).replace(/^\/+/, ''));
      if (!f.startsWith(PUB) || !fs.existsSync(f)) return send(res, 404, 'Not found', 'text/plain');
      if (/\.(html|js)$/.test(f)) res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate'); /*TAX875 no stale page*/
      return send(res, 200, fs.readFileSync(f), { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(f)] || 'application/octet-stream');
    }
    if (PIN_HASH) {
      const ip = ipOf(req), now = Date.now(), f = (FAILS.get(ip) || []).filter(t => now - t < WIN);
      if (f.length >= MAXF) { FAILS.set(ip, f); res.setHeader('Retry-After', Math.ceil((WIN - (now - f[0])) / 1000)); return send(res, 429, { error: 'Too many wrong codes. Try again in 15 minutes.' }); }
      const given = String(req.headers['x-pin'] || '').trim();
      if (!given || !safeEq(crypto.createHash('sha256').update(given).digest('hex'), PIN_HASH)) { f.push(now); FAILS.set(ip, f); return send(res, 401, { error: 'pin' }); }
      FAILS.delete(ip);
    }
    const [, a, b] = p, m = req.method;
    const user = String(req.headers['x-user'] || u.searchParams.get('u') || '').trim().toLowerCase().slice(0, 200);
    const db = getDb(user);
    if (a === 'billing' && b === 'test' && m === 'POST') { /*PLANS1 test checkout – before the 402 check, after the PIN check*/
      if (!TEST_PAYMENTS) return send(res, 403, { error: 'test payments disabled' });
      const o = await body(req), plan = PLANS.find(x => x.id === o.plan), period = (o.period || o.cycle) === 'yearly' ? 'yearly' : (o.period || o.cycle || 'monthly') === 'monthly' ? 'monthly' : '';
      if (!plan || !period) return send(res, 400, { error: 'plan must be basic|premium|pro, period monthly|yearly' });
      const now = new Date(), r = new Date(now); if (period === 'yearly') r.setFullYear(r.getFullYear() + 1); else r.setMonth(r.getMonth() + 1);
      db.billing = { status: 'paid', plan: plan.id, cycle: period, period, amount: plan[period], paidAt: now.toISOString(), test: true, renews: r.toISOString() }; save(db);
      return send(res, 200, billing(db, user));
    }
    if (a === 'billing' && b === 'paid' && m === 'POST') { /*PLANLIMIT Stripe Payment Link return (?paid=<plan>&cycle=<cycle>).
      NOTE: there is NO Stripe webhook yet – this is trust-on-redirect: whoever opens the return URL gets the plan recorded.
      Fine for now; add a Stripe webhook (checkout.session.completed) before relying on it for real money.*/
      const o = await body(req), plan = PLANS.find(x => x.id === String(o.plan || '').toLowerCase()), cycle = o.cycle === 'yearly' ? 'yearly' : 'monthly';
      if (!plan) return send(res, 400, { error: 'plan must be basic|premium|pro' });
      const now = new Date(), r = new Date(now); if (cycle === 'yearly') r.setFullYear(r.getFullYear() + 1); else r.setMonth(r.getMonth() + 1);
      db.billing = { status: 'paid', plan: plan.id, cycle, period: cycle, amount: plan[cycle], paidAt: now.toISOString(), renews: r.toISOString(), source: 'stripe-redirect' }; save(db);
      return send(res, 200, billing(db, user));
    }
    if (a === 'billing' && b === 'test' && m === 'DELETE') {
      if (!TEST_PAYMENTS) return send(res, 403, { error: 'test payments disabled' });
      delete db.billing; save(db); return send(res, 200, billing(db, user));
    }
    if (TEST_PAYMENTS && u.searchParams.get('testTrialEnd') === '1') { db.trialStart = new Date(Date.now() - 4 * 864e5).toISOString(); save(db); }
    if (a === 'billing') return send(res, 200, billing(db, user));
    const bl = billing(db, user);
    if (!bl.active) return send(res, 402, { error: 'trial_ended', ...bl });
    if (a === 'state' && m === 'GET') return send(res, 200, db);
    if (a === 'dashboard') return send(res, 200, L.dashboard(db));
    if (a === 'predictions') return send(res, 200, L.predictions(db));
    if (a === 'quotes-summary') return send(res, 200, L.quoteGroups(db));
    if (a === 'example' && m === 'POST') { example(db); save(db); return send(res, 200, { ok: true }); }
    if (a === 'example' && m === 'DELETE') { for (const c of COLS) if (c !== 'intervals') db[c] = db[c].filter(x => !x.example); save(db); return send(res, 200, { ok: true }); }
    if (a === 'export') {
      const c = (b || '').replace(/\.csv$/, '');
      if (!COLS.includes(c)) return send(res, 404, { error: 'unknown collection' });
      const trucks = Object.fromEntries(db.vehicles.map(v => [v.id, v.truck]));
      const rows = db[c].map(r => r.vehicleId ? { truck: trucks[r.vehicleId], ...r } : r);
      res.writeHead(200, { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="${c}.csv"` }); return res.end(L.toCSV(rows));
    }
    if (a === 'inspections' && m === 'POST' && !b) { /*INSPECT1*/
      const o = await body(req), v = db.vehicles.find(v => v.id === o.vehicleId);
      if (!v) return send(res, 400, { error: 'vehicleId required' });
      const OK = ['pass', 'fail', 'note'], date = String(o.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
      const items = (Array.isArray(o.items) ? o.items : []).slice(0, 40).map(x => ({ item: String(x.item || '').slice(0, 80), result: OK.includes(x.result) ? x.result : 'pass', note: String(x.note || '').slice(0, 300) })).filter(x => x.item);
      if (!items.length) return send(res, 400, { error: 'items required' });
      const mileage = o.mileage === '' || o.mileage == null ? null : (Number(String(o.mileage).replace(/[^0-9.]/g, '')) || null);
      const rec = { id: crypto.randomUUID(), vehicleId: v.id, date, driver: String(o.driver || '').trim().slice(0, 80), mileage, type: String(o.type || 'Pre-trip').slice(0, 20), items, fixIds: [] };
      rec.result = items.some(x => x.result === 'fail') ? 'fail' : items.some(x => x.result === 'note') ? 'note' : 'pass';
      for (const x of items.filter(x => x.result === 'fail')) {
        const fx = { id: crypto.randomUUID(), vehicleId: v.id, date, mileage, cost: null, shop: '', category: 'Pre-trip/post-trip (DVIR) repair', parts: '', notes: 'Inspection: ' + x.item + (x.note ? ' – ' + x.note : ''), downtimeDays: 0, needsDetails: true, inspectionId: rec.id };
        db.services.push(fx); rec.fixIds.push(fx.id);
      }
      db.inspections.push(rec); bumpMileage(db, rec); save(db); return send(res, 201, rec);
    }
    if (a === 'kb') { /*KBASE1 Costa Fleet knowledge base: NHTSA public data + OBDex CC0 codes + shop's own notes. No ALLDATA/Ford content.*/
      const K = KB.load(), c = p[2], q = String(u.searchParams.get('q') || '').trim();
      if (!c && m === 'GET') return send(res, 200, KB.overview(db, K));
      if (c === 'dtc' && m === 'GET') { const code = String(p[3] || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); return send(res, 200, { code, info: K.dtc[code] || null, shop: KB.shopHits(db, K, code) }); }
      if (c === 'search' && m === 'GET') return send(res, 200, KB.search(db, K, q));
      if (c === 'fixes' && m === 'POST') {
        const o = await body(req), S = (x, n) => String(x ?? '').trim().slice(0, n);
        const rec = { id: crypto.randomUUID(), group: S(o.group, 80), symptom: S(o.symptom, 300), code: S(o.code, 60).toUpperCase(), fix: S(o.fix, 600), parts: S(o.parts, 300), labor: S(o.labor, 60), notes: S(o.notes, 1000), date: new Date().toISOString().slice(0, 10) };
        if (!rec.group || !(rec.fix || rec.symptom)) return send(res, 400, { error: 'model and fix or symptom required' });
        db.kbFixes.push(rec); save(db); return send(res, 201, rec);
      }
      if (c === 'fixes' && m === 'DELETE') { const i = db.kbFixes.findIndex(x => x.id === p[3]); if (i < 0) return send(res, 404, { error: 'not found' }); db.kbFixes.splice(i, 1); save(db); return send(res, 200, { ok: true }); }
      if (c === 'refresh' && m === 'POST') return send(res, 200, await KB.refresh(db, K));
      return send(res, 404, { error: 'no kb route' });
    }
    if (COLS.includes(a)) {
      if (m === 'GET') return send(res, 200, db[a]);
      if (m === 'POST') {
        const rec = { id: crypto.randomUUID(), ...clean(await body(req)) };
        if (a !== 'vehicles' && a !== 'intervals' && a !== 'profile' && !db.vehicles.some(v => v.id === rec.vehicleId)) return send(res, 400, { error: 'vehicleId required' });
        if (a === 'vehicles' && !rec.truck) return send(res, 400, { error: 'truck # required' });
        if (a === 'vehicles' && !rec.example) { const pl = planOf(db, user); /*PLANLIMIT*/
          if (pl && pl.trucks != null && truckCount(db) >= pl.trucks) return send(res, 403, { error: `Your ${pl.name} plan allows ${pl.trucks} trucks. Upgrade to add more.`, limit: pl.trucks, plan: pl.id, planName: pl.name }); }
        if (a === 'quotes' && rec.chosen) db.quotes.forEach(q => { if (q.vehicleId === rec.vehicleId && q.job === rec.job) q.chosen = false; });
        db[a].push(rec); bumpMileage(db, rec); save(db); return send(res, 201, rec);
      }
      const i = db[a].findIndex(x => x.id === b);
      if (i < 0) return send(res, 404, { error: 'not found' });
      if (m === 'PUT') {
        const upd = { ...db[a][i], ...clean(await body(req)) };
        if (a === 'quotes' && upd.chosen) db.quotes.forEach(q => { if (q.vehicleId === upd.vehicleId && q.job === upd.job) q.chosen = false; });
        db[a][i] = upd; bumpMileage(db, upd); save(db); return send(res, 200, upd);
      }
      if (m === 'DELETE') {
        const [gone] = db[a].splice(i, 1);
        if (a === 'vehicles') for (const c of COLS) if (c !== 'vehicles' && c !== 'intervals') db[c] = db[c].filter(x => x.vehicleId !== gone.id);
        save(db); return send(res, 200, { ok: true });
      }
    }
    send(res, 404, { error: 'no route' });
  } catch (e) { send(res, 500, { error: String(e.message || e) }); }
}).listen(PORT, '0.0.0.0', () => console.log(`Fleet Maintenance on http://localhost:${PORT}`));
