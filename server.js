// FleetLog (hosted build) – plain Node >=18, no deps. Static files + /api.
// Env: PORT, DATA_DIR (default ./data), PIN_HASH (sha256 hex of the PIN; unset = no PIN, local testing only).
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const L = require('./public/logic.js');
const KB = require('./kb.js'); /*KBASE1*/
const SS = require('./sheetsync.js'); /*SHEETSYNC1*/
const PORT = process.env.PORT || 8790, DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data')), DATA = path.join(DATA_DIR, 'data.json'), PUB = path.join(__dirname, 'public');
fs.mkdirSync(DATA_DIR, { recursive: true });
{ const kc = path.join(DATA_DIR, 'kb-cache.json'), seed = path.join(__dirname, 'seed', 'kb-cache.json'); if (!fs.existsSync(kc) && fs.existsSync(seed)) fs.copyFileSync(seed, kc); }
const PIN_HASH = String(process.env.PIN_HASH || (f => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } })(path.join(__dirname, 'pin.hash'))).trim().toLowerCase(); /*ACCTS1 PIN from env or pin.hash file (iMac copy)*/
/*ACCTS1 customer accounts: users.json in DATA_DIR. Password = scrypt(salt). Session = random token in an httpOnly cookie; only its sha256 is stored.
  Each account has its own store (data-<hash>.json). The legacy/default store (data.json) is adopted once by OWNER_EMAIL, or, when OWNER_EMAIL is unset,
  by the first account created while data.json already has real (non-example) data. See ACCOUNTS.md.*/
const OWNER_EMAIL = String(process.env.OWNER_EMAIL || '').trim().replace(/^["']|["']$/g, '').trim().toLowerCase();
const UFILE = path.join(DATA_DIR, 'users.json');
const UDB = (() => { try { const d = JSON.parse(fs.readFileSync(UFILE, 'utf8')); d.users = d.users || []; d.sessions = d.sessions || {}; return d; } catch { return { users: [], sessions: {} }; } })();
const usave = () => { fs.writeFileSync(UFILE + '.tmp', JSON.stringify(UDB, null, 2)); fs.renameSync(UFILE + '.tmp', UFILE); };
const SESS_DAYS = 30, LFAILS = new Map(), LMAX = 8, LWIN = 15 * 60 * 1000;
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
const hashPw = (pw, salt) => new Promise((ok, no) => crypto.scrypt(pw, salt, 64, (e, k) => e ? no(e) : ok(k.toString('hex'))));
const cookieOf = req => Object.fromEntries(String(req.headers.cookie || '').split(';').map(x => x.trim().split('=')).filter(x => x[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
function sessUser(req) { const t = cookieOf(req).fl_sess; if (!t) return null; const s = UDB.sessions[sha(t)]; if (!s || s.exp < Date.now()) return null; return UDB.users.find(u => u.id === s.uid) || null; }
function baseKey(u) { return u.legacy ? '' : u.id; } /*TEAM1 own store*/
const storeKey = u => u.memberOf != null ? u.memberOf : baseKey(u); /*TEAM1 members open the owner's store*/ // '' = legacy/default store (data.json); keeps ownerExempt for the owner
const setCookie = (req, res, v, maxAge) => res.setHeader('Set-Cookie', `fl_sess=${v}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}` + ((req.socket.encrypted || /https/i.test(String(req.headers['x-forwarded-proto'] || ''))) ? '; Secure' : ''));
const pubUser = u => ({ id: u.id, email: u.email, role: roleOf(u), team: u.memberOf != null, plan: u.plan, cycle: u.cycle, activePlan: u.activePlan, createdAt: u.createdAt, legacy: !!u.legacy });
function legacyHasData() { try { const d = JSON.parse(fs.readFileSync(DATA, 'utf8')); return ['vehicles', 'services', 'parts'].some(c => (d[c] || []).some(x => !x.example)); } catch { return false; } }
async function authRoute(req, res, b) {
  const m = req.method;
  if (b === 'me' && m === 'GET') { const u = sessUser(req); return u ? send(res, 200, pubUser(u)) : send(res, 401, { error: 'auth' }); }
  if (b === 'logout' && m === 'POST') { const t = cookieOf(req).fl_sess; if (t) { delete UDB.sessions[sha(t)]; usave(); } setCookie(req, res, '', 0); return send(res, 200, { ok: true }); }
  if ((b === 'signup' || b === 'login') && m === 'POST') {
    const o = await body(req), email = String(o.email || '').trim().toLowerCase().slice(0, 200), pw = String(o.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(res, 400, { error: 'Enter a valid email.' });
    if (pw.length < 8 || pw.length > 200) return send(res, 400, { error: 'Password must be at least 8 characters.' });
    let u = UDB.users.find(x => x.email === email);
    if (b === 'signup') {
      if (u) return send(res, 409, { error: 'An account with this email already exists. Log in instead.' });
      const salt = crypto.randomBytes(16).toString('hex');
      const legacy = !UDB.users.some(x => x.legacy) && (OWNER_EMAIL ? email === OWNER_EMAIL : (UDB.users.length === 0 && legacyHasData()));
      u = { id: crypto.randomUUID(), email, salt, pwHash: await hashPw(pw, salt), plan: 'trial', cycle: null, activePlan: 'trial', createdAt: new Date().toISOString(), ...(legacy ? { legacy: true } : {}) };
      UDB.users.push(u); usave(); getDb(storeKey(u));
    } else {
      const k = ipOf(req) + '|' + email, now = Date.now(), f = (LFAILS.get(k) || []).filter(t => now - t < LWIN);
      if (f.length >= LMAX) { LFAILS.set(k, f); res.setHeader('Retry-After', Math.ceil((LWIN - (now - f[0])) / 1000)); return send(res, 429, { error: 'Too many tries. Wait 15 minutes and try again.' }); }
      const h = u ? await hashPw(pw, u.salt) : await hashPw(pw, 'x'.repeat(32));
      if (!u || !safeEq(h, u.pwHash)) { f.push(now); LFAILS.set(k, f); return send(res, 401, { error: 'Wrong email or password.' }); }
      LFAILS.delete(k);
    }
    const t = crypto.randomBytes(32).toString('hex'), now = Date.now();
    for (const [k, s] of Object.entries(UDB.sessions)) if (s.exp < now) delete UDB.sessions[k];
    UDB.sessions[sha(t)] = { uid: u.id, exp: now + SESS_DAYS * 864e5 }; usave();
    setCookie(req, res, t, SESS_DAYS * 86400); return send(res, b === 'signup' ? 201 : 200, pubUser(u));
  }
  return send(res, 404, { error: 'no auth route' });
}
const syncPlan = (acct, db) => { if (!acct) return; const bl = db.billing; acct.plan = bl && bl.status === 'paid' ? bl.plan : 'trial'; acct.cycle = bl && bl.status === 'paid' ? (bl.cycle || bl.period || null) : null; acct.activePlan = acct.plan; usave(); }; /*ACCTS1 billing mirrored onto the account*/
if (!PIN_HASH) console.warn('WARNING: PIN_HASH not set – API is open. Set it before going live.');
const FAILS = new Map(), MAXF = 5, WIN = 15 * 60 * 1000; // wrong-PIN limit: 5 per 15 min per IP
const ipOf = req => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
const safeEq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const COLS = ['vehicles', 'services', 'parts', 'quotes', 'intervals', 'mileageLog', 'profile', 'inspections', 'kbFixes', 'vir', 'driverReports']; /*VIRFORM*/ /*DRIVER1*/
const DEFAULT_INTERVALS = [
  ['Oil change', 7500, 6], ['Tire rotation', 10000, 6], ['Tires', 50000, 48], ['Brakes', 40000, null],
  ['Battery', null, 48], ['Transmission fluid', 60000, null], ['Coolant', 100000, 60], ['Air filter', 20000, 12],
  ['Spark plugs', 100000, null], ['DOT inspection', null, 12]].map(([category, miles, months]) => ({ id: crypto.randomUUID(), category, miles, months }));
// Per-contractor data: each signed-in user gets their own file (data-<hash>.json). No user = demo (data.json).
// ACCTS1: the user now comes from the session cookie (see ACCOUNTS.md); X-User is ignored.
// Real protection for shared cloud data = Supabase table with row-level security (see SETUP-SIGNIN.md).
const DBS = new Map();
function fileFor(user) { return user ? path.join(DATA_DIR, 'data-' + crypto.createHash('sha256').update(user).digest('hex').slice(0, 24) + '.json') : DATA; }
/*TRIAL3 3-day free trial. Data is never deleted; after the trial, data routes return 402 until paid.*/
const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 0), /*NOTRIAL pay before use*/ PAYMENT_URL = process.env.PAYMENT_URL || '', HELP_EMAIL = 'fleetlog.support@gmail.com';
const OWNER_PAID = /^(1|true|yes|on)$/i.test(String(process.env.OWNER_PAID || '').trim().replace(/^["']|["']$/g, '').trim()); // exempts the owner (no-user / default) account
/*PLANS1 subscription plans – defined once, exposed via /api/billing as `plans`.*/
const PLANS = [
  { id: 'basic', name: 'Basic', trucks: 5, desc: 'Up to 5 trucks', monthly: 15.99, yearly: 159 },
  { id: 'premium', name: 'Premium', trucks: 15, desc: 'Up to 15 trucks · batch printing · cost dashboard', monthly: 19.99, yearly: 199, popular: true },
  { id: 'pro', name: 'Pro', trucks: null, desc: 'Unlimited trucks · priority email support', monthly: 29.99, yearly: 299 }];
const STRIPE_LINKS = { basic: { monthly: process.env.STRIPE_LINK_BASIC_MONTHLY || 'https://buy.stripe.com/4gMaEX5OZ2BHgMSbU64F205', yearly: process.env.STRIPE_LINK_BASIC_YEARLY || 'https://buy.stripe.com/4gMaEX4KVdgl54agam4F206' }, premium: { monthly: process.env.STRIPE_LINK_PREMIUM_MONTHLY || 'https://buy.stripe.com/4gMeVdfpz0tz68e7DQ4F207', yearly: process.env.STRIPE_LINK_PREMIUM_YEARLY || 'https://buy.stripe.com/6oU00ja5f1xD54a5vI4F208' }, pro: { monthly: process.env.STRIPE_LINK_PRO_MONTHLY || 'https://buy.stripe.com/7sY9AT0uF905dAG5vI4F209', yearly: process.env.STRIPE_LINK_PRO_YEARLY || 'https://buy.stripe.com/28E14nfpzgsx4061fs4F204' } };
const ANY_LINK = Object.values(STRIPE_LINKS).some(o => o.monthly || o.yearly);
const TEST_PAYMENTS = process.env.TEST_PAYMENTS ? /^(1|true|yes)$/i.test(process.env.TEST_PAYMENTS) : false;
const STRIPE_PORTAL_URL = process.env.STRIPE_PORTAL_URL || 'https://billing.stripe.com/p/login/aFabJ15OZekpdAG7DQ4F200'; /*LEGAL1 Stripe Customer Portal login link (Settings > Billing > Customer portal). Empty = in-app cancel request form.*/
function linkFor(plan, period, user) { const l = (STRIPE_LINKS[plan] || {})[period]; return l ? l + (l.includes('?') ? '&' : '?') + 'client_reference_id=' + encodeURIComponent(user || 'owner') /*ACCTS1 user = account id*/ : ''; }
/*PLANLIMIT plan + truck limit. Trial (no plan) = no limit. Paid without a plan id (legacy/owner) = unlimited.*/
function planOf(db, user) {
  const b = db.billing, paid = (b && b.status === 'paid') || ownerPaid(user);
  if (!paid) return null;
  return PLANS.find(x => x.id === (b && b.plan)) || PLANS.find(x => x.id === 'pro');
}
const OWNER_KEYS = new Set(); /*OWNERPAID2 signed-in OWNER_EMAIL account counts as owner*/
const ownerPaid = user => (OWNER_PAID && !user) || OWNER_KEYS.has(user) || (!!OWNER_EMAIL && UDB.users.some(x => x.memberOf == null && baseKey(x) === user && String(x.email || '').toLowerCase() === OWNER_EMAIL)); /*TEAM1 owner status follows the store, so members inherit it*/ /*OWNERPAID4 OWNER_EMAIL match alone is enough*/
const truckCount = db => db.vehicles.filter(v => !v.example).length;
function billing(db, user) {
  const paid = (db.billing && db.billing.status === 'paid') || ownerPaid(user);
  const start = Date.parse(db.trialStart) || Date.now(), end = start + TRIAL_DAYS * 864e5, now = Date.now();
  const plans = PLANS.map(p => ({ ...p, links: { monthly: linkFor(p.id, 'monthly', user), yearly: linkFor(p.id, 'yearly', user) } }));
  return { paid: !!paid, trialStart: db.trialStart, trialEnds: new Date(end).toISOString(), daysLeft: paid ? null : Math.max(0, Math.ceil((end - now) / 864e5)), active: !!paid || now < end, paymentUrl: PAYMENT_URL, portalUrl: STRIPE_PORTAL_URL, email: HELP_EMAIL, plans, testPayments: TEST_PAYMENTS, subscription: db.billing || null, ownerExempt: !!ownerPaid(user), sheetSync: { price: SHEETSYNC_PRICE, paymentUrl: SHEETSYNC_PAYMENT_URL, included: !!ownerPaid(user), active: !!ownerPaid(user) || !!(db.billing && Array.isArray(db.billing.addons) && db.billing.addons.includes('sheetsync')) }, /*ADDONS1*/ ...(pl => ({ plan: pl ? pl.id : null, planName: pl ? pl.name : null, cycle: (db.billing && (db.billing.cycle || db.billing.period)) || null, truckLimit: pl ? pl.trucks : null, trucks: truckCount(db) }))(planOf(db, user)) };
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
/*DEMO1 read-only public demo store (in memory, never saved, never a real user's data)*/
let DEMO = null;
function demoDb() {
  if (DEMO) return DEMO;
  const d = { intervals: DEFAULT_INTERVALS.map(x => ({ ...x })), trialStart: new Date().toISOString() }; for (const c of COLS) d[c] = d[c] || [];
  example(d); d.vehicles.forEach(v => v.truck = v.truck.replace('EX-', 'SAMPLE-'));
  const v = d.vehicles[0], day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  d.inspections.push({ id: crypto.randomUUID(), vehicleId: v.id, date: day(2), driver: 'Sample driver', mileage: v.mileage, type: 'Pre-trip', items: [{ item: 'Brakes', result: 'pass', note: '' }, { item: 'Tires', result: 'pass', note: '' }, { item: 'Lights', result: 'note', note: 'Sample: marker light dim' }], result: 'note', fixIds: [], example: true });
  d.vir.push({ id: crypto.randomUUID(), vehicleId: v.id, inspDate: day(10), nextDate: day(-80), inspNo: 'SAMPLE-1', make: v.make, model: v.model, year: v.year, unit: v.truck, mileage: v.mileage, inspector: 'Sample inspector', carrier: 'Sample carrier', items: { 0: { m: 'X', c: '' }, 1: { m: 'A', c: 'Sample adjust' } }, example: true });
  d.profile.push({ id: crypto.randomUUID(), hub: 'SAMPLE HUB', example: true });
  d.demo = true; return (DEMO = d);
}
const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type }); res.end(type === 'application/json' ? JSON.stringify(body) : body); };
const body = req => new Promise((ok, no) => { let s = ''; req.on('data', c => s += c); req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { no(e); } }); });
const NUMS = ['mileage', 'cost', 'downtimeDays', 'price', 'year', 'miles', 'months'];
function clean(o) { const r = { ...o }; delete r.id; for (const k of NUMS) if (k in r) r[k] = r[k] === '' || r[k] == null ? null : (Number(String(r[k]).replace(/[^0-9.-]/g, '')) || 0); return r; }
function bumpMileage(db, rec) {
  const v = db.vehicles.find(v => v.id === rec.vehicleId);
  if (v && rec.mileage > (v.mileage || 0)) v.mileage = rec.mileage;
}
/*CONTACT1 "Need help?" form -> Resend. Env: RESEND_API_KEY, CONTACT_FROM, CONTACT_TO. No key = 503 {fallback:true}.*/
const CRATE = new Map(), CMAX = 5, CWIN = 60 * 60 * 1000;
async function contact(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  let raw = ''; for await (const c of req) { raw += c; if (raw.length > 20000) return send(res, 413, { error: 'Message too long.' }); }
  let d; try { d = JSON.parse(raw || '{}'); } catch { return send(res, 400, { error: 'Bad request.' }); }
  if (d.website) return send(res, 200, { ok: true }); // honeypot: pretend success
  const name = String(d.name || '').trim().slice(0, 100), email = String(d.email || '').trim().slice(0, 200), msg = String(d.message || '').trim();
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !msg) return send(res, 400, { error: 'Please fill in name, a valid email and a message.' });
  if (msg.length > 5000) return send(res, 400, { error: 'Message too long (max 5000 characters).' });
  if (!process.env.RESEND_API_KEY) return send(res, 503, { fallback: true, error: 'Email sending not set up.' });
  const ip = ipOf(req), now = Date.now(), h = (CRATE.get(ip) || []).filter(t => now - t < CWIN);
  if (h.length >= CMAX) return send(res, 429, { error: 'Too many messages. Please try again later.' });
  h.push(now); CRATE.set(ip, h);
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.CONTACT_FROM || 'FleetLog <onboarding@resend.dev>', to: process.env.CONTACT_TO || 'fleetlog.support@gmail.com', reply_to: email,
        subject: (d.subject === 'Cancel subscription' ? 'Cancel subscription' : 'FleetLog support') + ': ' + name.replace(/[\r\n]/g, ' '), text: msg + '\n\n---\nFrom: ' + name + ' <' + email + '>' }) });
    if (!r.ok) { console.error('contact: resend', r.status, (await r.text()).slice(0, 300)); return send(res, 502, { error: 'Could not send the message. Please email fleetlog.support@gmail.com.' }); }
    return send(res, 200, { ok: true });
  } catch (e) { console.error('contact:', e.message); return send(res, 502, { error: 'Could not send the message. Please email fleetlog.support@gmail.com.' }); }
}
/*SHEETSYNC1 add-on gate + background sync every SHEETSYNC_MIN minutes*/
const SHEETSYNC_PRICE = 9, SHEETSYNC_PAYMENT_URL = String(process.env.SHEETSYNC_PAYMENT_URL || '').trim(), SHEETSYNC_MIN = 10, SS_OPTS = { save: db => save(db), bumpMileage: (db, r) => bumpMileage(db, r) };
const isOwnerKey = key => ownerPaid(key) || (!!OWNER_EMAIL && UDB.users.some(u => baseKey(u) === key && String(u.email || '').toLowerCase() === OWNER_EMAIL));
const sheetAllowed = (db, key) => !!(db.billing && Array.isArray(db.billing.addons) && db.billing.addons.includes('sheetsync')) || isOwnerKey(key);
let ssBusy = false;
async function sheetSyncAll() { if (ssBusy) return; ssBusy = true;
  try { for (const key of new Set(UDB.users.map(baseKey))) { const db = getDb(key); if (!db.sheetSync || !db.sheetSync.url || !sheetAllowed(db, key)) continue;
    const r = await SS.run(db, SS_OPTS); if (r.error) console.error('sheetsync', key || 'default', r.error); else if (r.added) console.log('sheetsync', key || 'default', 'added', r.added); } }
  catch (e) { console.error('sheetsync:', e.message); } ssBusy = false; }
setTimeout(sheetSyncAll, 60 * 1000); setInterval(sheetSyncAll, SHEETSYNC_MIN * 60 * 1000);
/*DRIVER1 driver defect reports via a secret per-account link (/d/<token>). The link can only list trucks and submit reports.*/
const DLFILE = path.join(DATA_DIR, 'driver-links.json'), PHOTO_DIR = path.join(DATA_DIR, 'photos');
const DLINKS = (() => { try { return JSON.parse(fs.readFileSync(DLFILE, 'utf8')); } catch { return {}; } })(); // sha(token) -> storeKey
const dlsave = () => { fs.writeFileSync(DLFILE + '.tmp', JSON.stringify(DLINKS)); fs.renameSync(DLFILE + '.tmp', DLFILE); };
const photoDir = user => path.join(PHOTO_DIR, crypto.createHash('sha256').update('p|' + user).digest('hex').slice(0, 24));
const DRATE = new Map(); // key -> timestamps
const rateOk = (k, max, win) => { const now = Date.now(), f = (DRATE.get(k) || []).filter(t => now - t < win); if (f.length >= max) { DRATE.set(k, f); return false; } f.push(now); DRATE.set(k, f); return true; };
const bodyMax = (req, max) => new Promise((ok, no) => { let s = '', n = 0; req.on('data', c => { n += c.length; if (n <= max) s += c; else s = ''; }); req.on('end', () => { if (n > max) return no(Object.assign(new Error('too large'), { code: 413 })); try { ok(s ? JSON.parse(s) : {}); } catch (e) { no(e); } }); });
function driverLinkView(db) { return db.driverLink ? { token: db.driverLink.token, createdAt: db.driverLink.createdAt } : null; }
function driverLinkNew(db, user) { if (db.driverLink) delete DLINKS[sha(db.driverLink.token)]; const token = crypto.randomBytes(18).toString('base64url'); db.driverLink = { token, createdAt: new Date().toISOString() }; DLINKS[sha(token)] = user; dlsave(); save(db); }
function driverLinkOff(db) { if (db.driverLink) { delete DLINKS[sha(db.driverLink.token)]; dlsave(); } delete db.driverLink; save(db); }
async function driverRoute(req, res, token, action) {
  const key = DLINKS[sha(String(token || ''))];
  if (key == null) return send(res, 404, { error: 'This driver link is not valid. Ask your fleet manager for the current link.' });
  const db = getDb(key);
  if (!db.driverLink || !safeEq(sha(db.driverLink.token), sha(token))) return send(res, 404, { error: 'This driver link is not valid.' });
  if (!billing(db, key).active) return send(res, 402, { error: 'Reporting is paused for this fleet account.' });
  if (action === 'trucks' && req.method === 'GET') return send(res, 200, { trucks: db.vehicles.filter(v => !v.example).map(v => ({ id: v.id, truck: v.truck, desc: [v.year, v.make, v.model].filter(Boolean).join(' ') })) });
  if (action === 'report' && req.method === 'POST') {
    const ip = ipOf(req);
    if (!rateOk('ip|' + ip, 30, 3600e3) || !rateOk('acct|' + key, 200, 864e5)) return send(res, 429, { error: 'Too many reports. Please wait and try again.' });
    let o; try { o = await bodyMax(req, 4.5e6); } catch (e) { return send(res, e.code === 413 ? 413 : 400, { error: e.code === 413 ? 'Photo is too large (max about 3 MB).' : 'Bad request' }); }
    const v = db.vehicles.find(x => x.id === o.vehicleId && !x.example);
    const driver = String(o.driver || '').trim().slice(0, 60), desc = String(o.description || '').trim().slice(0, 1000);
    if (!v) return send(res, 400, { error: 'Pick a truck.' });
    if (!driver) return send(res, 400, { error: 'Enter your name.' });
    if (!desc && !o.photo) return send(res, 400, { error: 'Add a photo or a description.' });
    const rec = { id: crypto.randomUUID(), vehicleId: v.id, driver, description: desc, createdAt: new Date().toISOString(), status: 'open', photo: null, lat: null, lng: null, accuracy: null };
    const la = Number(o.lat), lo = Number(o.lng);
    if (o.lat != null && Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180) { rec.lat = Math.round(la * 1e5) / 1e5; rec.lng = Math.round(lo * 1e5) / 1e5; rec.accuracy = Math.round(Number(o.accuracy) || 0) || null; }
    if (o.photo) {
      const mt = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(o.photo));
      if (!mt) return send(res, 400, { error: 'Photo must be a JPEG.' });
      const buf = Buffer.from(mt[1], 'base64');
      if (buf.length > 3.2e6 || buf[0] !== 0xff || buf[1] !== 0xd8) return send(res, 400, { error: 'Photo is not a valid JPEG or is too large.' });
      const dir = photoDir(key); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, rec.id + '.jpg'), buf); rec.photo = rec.id + '.jpg';
    }
    db.driverReports.push(rec); save(db); return send(res, 201, { ok: true, id: rec.id });
  }
  return send(res, 404, { error: 'no route' });
}
/*TEAM1 team members: a member account (memberOf = owner's store key) opens the owner's store with role admin|user. Invites live in users.json.*/
const roleOf = u => !u ? null : u.memberOf != null ? (u.role === 'admin' ? 'admin' : 'user') : 'owner';
const storeOwner = key => UDB.users.find(x => x.memberOf == null && baseKey(x) === key) || null;
const killSessions = uid => { for (const [k, s] of Object.entries(UDB.sessions)) if (s.uid === uid) delete UDB.sessions[k]; };
const INV_DAYS = 7;
const invView = i => ({ id: i.id, email: i.email || '', role: i.role, exp: i.exp, createdAt: i.createdAt, token: i.token });
function teamRoute(req, res, acct, key, b, c) {
  return (async () => {
    UDB.invites = (UDB.invites || []).filter(i => i.exp > Date.now());
    const m = req.method, own = storeOwner(key);
    if (!b && m === 'GET') return send(res, 200, { me: { id: acct.id, role: roleOf(acct) }, owner: own ? { id: own.id, email: own.email } : null,
      members: UDB.users.filter(x => x.memberOf === key).map(x => ({ id: x.id, email: x.email, role: roleOf(x), joinedAt: x.joinedAt || x.createdAt })),
      invites: UDB.invites.filter(i => i.key === key).map(invView) });
    if (b === 'invite' && m === 'POST' && !c) {
      const o = await body(req), email = String(o.email || '').trim().toLowerCase().slice(0, 200), role = o.role === 'admin' ? 'admin' : 'user';
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(res, 400, { error: 'Enter a valid email or leave it empty.' });
      if (UDB.invites.filter(i => i.key === key).length >= 50) return send(res, 429, { error: 'Too many pending invites. Revoke some first.' });
      const i = { id: crypto.randomUUID(), token: crypto.randomBytes(24).toString('base64url'), key, email, role, createdBy: acct.id, createdAt: new Date().toISOString(), exp: Date.now() + INV_DAYS * 864e5 };
      UDB.invites.push(i); usave(); return send(res, 201, invView(i));
    }
    if (b === 'invite' && m === 'DELETE' && c) { const n = UDB.invites.length; UDB.invites = UDB.invites.filter(i => !(i.id === c && i.key === key)); usave(); return send(res, n === UDB.invites.length ? 404 : 200, { ok: n !== UDB.invites.length }); }
    const t = b && UDB.users.find(x => x.id === b && x.memberOf === key);
    if (b && !t) return send(res, own && b === own.id ? 403 : 404, { error: own && b === own.id ? 'The account owner cannot be changed or removed.' : 'Member not found' });
    if (t && m === 'PUT') { const o = await body(req); t.role = o.role === 'admin' ? 'admin' : 'user'; if (t.id !== acct.id) killSessions(t.id); usave(); return send(res, 200, { ok: true, role: t.role }); }
    if (t && m === 'DELETE') { delete t.memberOf; delete t.role; delete t.joinedAt; killSessions(t.id); usave(); return send(res, 200, { ok: true }); }
    return send(res, 404, { error: 'no team route' });
  })();
}
async function inviteRoute(req, res, token) { /*TEAM1 public: read or accept an invite*/
  const now = Date.now(), i = (UDB.invites || []).find(x => x.exp > now && safeEq(sha(x.token), sha(String(token || ''))));
  if (!i) return send(res, 404, { error: 'This invite link is not valid or has expired. Ask for a new one.' });
  if (req.method === 'GET') return send(res, 200, { ok: true, role: i.role, email: i.email, exists: !!(i.email && UDB.users.some(u => u.email === i.email)), exp: i.exp });
  if (req.method !== 'POST') return send(res, 404, { error: 'no route' });
  const o = await body(req), email = String(o.email || '').trim().toLowerCase().slice(0, 200), pw = String(o.password || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(res, 400, { error: 'Enter a valid email.' });
  if (i.email && email !== i.email) return send(res, 400, { error: 'This invite is for a different email address.' });
  if (pw.length < 8 || pw.length > 200) return send(res, 400, { error: 'Password must be at least 8 characters.' });
  const k = ipOf(req) + '|' + email, f = (LFAILS.get(k) || []).filter(t => now - t < LWIN);
  if (f.length >= LMAX) { LFAILS.set(k, f); return send(res, 429, { error: 'Too many tries. Wait 15 minutes and try again.' }); }
  let u = UDB.users.find(x => x.email === email);
  if (u) {
    if (!safeEq(await hashPw(pw, u.salt), u.pwHash)) { f.push(now); LFAILS.set(k, f); return send(res, 401, { error: 'This email already has an account. Enter its password to join.' }); }
    LFAILS.delete(k);
    if (u.legacy || baseKey(u) === i.key || (OWNER_EMAIL && u.email === OWNER_EMAIL)) return send(res, 400, { error: 'This account owns a fleet and cannot join another team.' });
    if (UDB.users.some(x => x.memberOf === baseKey(u))) return send(res, 400, { error: 'This account has its own team members and cannot join another team.' });
    if (u.memberOf != null && u.memberOf !== i.key) return send(res, 400, { error: 'This account is already on another team. Ask that team to remove it first.' });
  } else {
    const salt = crypto.randomBytes(16).toString('hex');
    u = { id: crypto.randomUUID(), email, salt, pwHash: await hashPw(pw, salt), plan: 'trial', cycle: null, activePlan: 'trial', createdAt: new Date().toISOString() }; UDB.users.push(u);
  }
  u.memberOf = i.key; u.role = i.role; u.joinedAt = new Date().toISOString();
  UDB.invites = UDB.invites.filter(x => x.id !== i.id); // one-time
  const t = crypto.randomBytes(32).toString('hex'); UDB.sessions[sha(t)] = { uid: u.id, exp: now + SESS_DAYS * 864e5 }; usave();
  setCookie(req, res, t, SESS_DAYS * 86400); return send(res, 200, pubUser(u));
}
const USER_BLOCK = ['billing', 'sheetsync', 'driverlink', 'team', 'example', 'export'], USER_RO = ['intervals', 'profile'];
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'), p = u.pathname.split('/').filter(Boolean);
  try {
    if (u.pathname === '/healthz') return send(res, 200, { ok: true, v: 'owner4', ownerEmailSet: !!OWNER_EMAIL, ownerPaidSet: OWNER_PAID });
    if (p[0] === 'invite' && p[1] && req.method === 'GET') { res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer'); return send(res, 200, fs.readFileSync(path.join(PUB, 'invite.html')), 'text/html'); } /*TEAM1*/
    if (p[0] === 'd' && p[1] && req.method === 'GET') { res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer'); return send(res, 200, fs.readFileSync(path.join(PUB, 'driver.html')), 'text/html'); } /*DRIVER1*/
    if (p[0] === 'api' && p[1] === 'driver') { res.setHeader('Cache-Control', 'no-store'); return driverRoute(req, res, p[2], p[3]); } /*DRIVER1 public, token-scoped*/
    if (p[0] !== 'api') {
      const f = path.join(PUB, u.pathname === '/' ? 'index.html' : ({ '/terms': 'terms.html', '/privacy': 'privacy.html', '/refund': 'refund.html', '/refunds': 'refund.html' })[u.pathname.replace(/\/+$/, '')] /*LEGAL1 public legal pages*/ || path.normalize(u.pathname).replace(/^\/+/, ''));
      if (!f.startsWith(PUB) || !fs.existsSync(f)) return send(res, 404, 'Not found', 'text/plain');
      if (/\.(html|js)$/.test(f)) res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate'); /*TAX875 no stale page*/
      return send(res, 200, fs.readFileSync(f), { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(f)] || 'application/octet-stream');
    }
    if (u.pathname === '/api/contact') return contact(req, res); /*CONTACT1 public: before PIN/paywall*/
    if (PIN_HASH) {
      const ip = ipOf(req), now = Date.now(), f = (FAILS.get(ip) || []).filter(t => now - t < WIN);
      if (f.length >= MAXF) { FAILS.set(ip, f); res.setHeader('Retry-After', Math.ceil((WIN - (now - f[0])) / 1000)); return send(res, 429, { error: 'Too many wrong codes. Try again in 15 minutes.' }); }
      const given = String(req.headers['x-pin'] || '').trim();
      if (!given || !safeEq(crypto.createHash('sha256').update(given).digest('hex'), PIN_HASH)) { f.push(now); FAILS.set(ip, f); return send(res, 401, { error: 'pin' }); }
      FAILS.delete(ip);
    }
    const [, a, b] = p, m = req.method;
    if (a === 'auth') return authRoute(req, res, b); /*ACCTS1*/
    if (a === 'invite') return inviteRoute(req, res, b); /*TEAM1*/
    const acct = sessUser(req); /*ACCTS1 user comes from the session cookie only; X-User is ignored*/
    if (OWNER_EMAIL && acct && String(acct.email || '').toLowerCase() === OWNER_EMAIL) OWNER_KEYS.add(storeKey(acct)); /*OWNERPAID3 before demo/billing paths*/
    const demoReq = req.headers['x-demo'] === '1' || u.searchParams.get('demo') === '1'; /*DEMO2 explicit demo read for anyone; never touches user data*/
    if (demoReq && acct && m !== 'GET') return send(res, 403, { error: 'demo_readonly', demo: true });
    if (!acct || demoReq) { /*DEMO1 logged out (or DEMO2 flag): GETs read the fixed demo store; every write needs an account*/
      if (m !== 'GET' || a === 'export' || (a === 'kb' && p[2] === 'refresh')) return send(res, 401, { error: 'auth', demo: true });
      if (a === 'billing' && !b && !acct) return send(res, 200, { ...billing({ vehicles: [], trialStart: new Date().toISOString() }, ''), ownerExempt: false, signedIn: false, demo: true });
      if (a === 'billing' && !b) { const rb = billing(getDb(storeKey(acct)), storeKey(acct)); return send(res, 200, rb); }
      const D = demoDb();
      if (a === 'state') return send(res, 200, D);
      if (a === 'dashboard') return send(res, 200, L.dashboard(D));
      if (a === 'predictions') return send(res, 200, L.predictions(D));
      if (a === 'quotes-summary') return send(res, 200, L.quoteGroups(D));
      if (COLS.includes(a) && !b) return send(res, 200, D[a]);
      if (a === 'kb') { const K = KB.load(), c = p[2], q = String(u.searchParams.get('q') || '').trim(); if (!c) return send(res, 200, KB.overview(D, K)); if (c === 'search') return send(res, 200, KB.search(D, K, q)); if (c === 'dtc') { const code = String(p[3] || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); return send(res, 200, { code, info: K.dtc[code] || null, shop: [] }); } }
      return send(res, 401, { error: 'auth', demo: true }); }
    const user = storeKey(acct), db = getDb(user);
    { const rl = roleOf(acct); /*TEAM1 server-side role checks*/
      if (rl === 'user' && (USER_BLOCK.includes(a) || (USER_RO.includes(a) && m !== 'GET') || (a === 'kb' && p[2] === 'refresh'))) return send(res, 403, { error: 'Your role (User) cannot do this. Ask the account owner or an admin.', role: rl });
      if (a === 'team') return teamRoute(req, res, acct, user, b, p[3]);
      if (rl === 'user' && a === 'state' && m === 'GET') { const bl0 = billing(db, user); if (!bl0.active) return send(res, 402, { error: 'trial_ended' }); const o = { ...db }; delete o.driverLink; delete o.sheetSync; delete o.billing; delete o.consents; return send(res, 200, o); } }
    if (OWNER_EMAIL && acct && String(acct.email || '').toLowerCase() === OWNER_EMAIL) OWNER_KEYS.add(user);
    if (a === 'billing' && b === 'consent' && m === 'POST') { /*LEGAL1 auto-renewal consent record (kept; never deleted)*/
      const o = await body(req), plan = PLANS.find(x => x.id === String(o.plan || '').toLowerCase()), cycle = o.cycle === 'yearly' ? 'yearly' : 'monthly';
      if (!plan) return send(res, 400, { error: 'plan must be basic|premium|pro' });
      db.consents = Array.isArray(db.consents) ? db.consents : [];
      db.consents.push({ at: new Date().toISOString(), plan: plan.id, cycle, price: plan[cycle], version: String(o.version || '').slice(0, 40), text: String(o.text || '').slice(0, 600), ip: ipOf(req), user: acct.email });
      save(db); return send(res, 201, { ok: true });
    }
    if (a === 'billing' && b === 'test' && m === 'POST') { /*PLANS1 test checkout – before the 402 check, after the PIN check*/
      if (!TEST_PAYMENTS) return send(res, 403, { error: 'test payments disabled' });
      const o = await body(req), plan = PLANS.find(x => x.id === o.plan), period = (o.period || o.cycle) === 'yearly' ? 'yearly' : (o.period || o.cycle || 'monthly') === 'monthly' ? 'monthly' : '';
      if (!plan || !period) return send(res, 400, { error: 'plan must be basic|premium|pro, period monthly|yearly' });
      const now = new Date(), r = new Date(now); if (period === 'yearly') r.setFullYear(r.getFullYear() + 1); else r.setMonth(r.getMonth() + 1);
      db.billing = { status: 'paid', plan: plan.id, cycle: period, period, amount: plan[period], paidAt: now.toISOString(), test: true, renews: r.toISOString() }; save(db); syncPlan(acct, db);
      return send(res, 200, billing(db, user));
    }
    if (a === 'billing' && b === 'paid' && m === 'POST') { /*PLANLIMIT Stripe Payment Link return (?paid=<plan>&cycle=<cycle>).
      NOTE: there is NO Stripe webhook yet – this is trust-on-redirect: whoever opens the return URL gets the plan recorded.
      Fine for now; add a Stripe webhook (checkout.session.completed) before relying on it for real money.*/
      const o = await body(req), plan = PLANS.find(x => x.id === String(o.plan || '').toLowerCase()), cycle = o.cycle === 'yearly' ? 'yearly' : 'monthly';
      if (!plan) return send(res, 400, { error: 'plan must be basic|premium|pro' });
      const now = new Date(), r = new Date(now); if (cycle === 'yearly') r.setFullYear(r.getFullYear() + 1); else r.setMonth(r.getMonth() + 1);
      db.billing = { status: 'paid', plan: plan.id, cycle, period: cycle, amount: plan[cycle], paidAt: now.toISOString(), renews: r.toISOString(), source: 'stripe-redirect' }; save(db); syncPlan(acct, db);
      return send(res, 200, billing(db, user));
    }
    if (a === 'billing' && b === 'test' && m === 'DELETE') {
      if (!TEST_PAYMENTS) return send(res, 403, { error: 'test payments disabled' });
      delete db.billing; save(db); syncPlan(acct, db); return send(res, 200, billing(db, user));
    }
    if (TEST_PAYMENTS && u.searchParams.get('testTrialEnd') === '1') { db.trialStart = new Date(Date.now() - 4 * 864e5).toISOString(); save(db); }
    if (a === 'sheetsync') { /*SHEETSYNC1 $9/mo add-on (price set by SHEETSYNC_PRICE)*/
      const ok = sheetAllowed(db, user); let S = db.sheetSync || null;
      const view = () => (S = db.sheetSync || null, { allowed: ok, price: SHEETSYNC_PRICE, paymentUrl: SHEETSYNC_PAYMENT_URL, email: HELP_EMAIL, fields: Object.keys(SS.FIELDS), everyMin: SHEETSYNC_MIN,
        config: S && { url: S.url, tab: S.tab, map: S.map || {}, detected: S.detected || {}, lastRun: S.lastRun, lastError: S.lastError, lastAdded: S.lastAdded, lastAlready: S.lastAlready, totalAdded: S.totalAdded || 0, unknownUnits: S.unknownUnits || [], sentCount: (S.sentRows || []).length } });
      if (m === 'GET' && !b) return send(res, 200, view());
      if (!ok) return send(res, 402, { error: 'Sheet Sync is a paid add-on ($' + SHEETSYNC_PRICE + '/month).', ...view() });
      if (m === 'PUT' && !b) { const o = await body(req), url = String(o.url || '').trim().slice(0, 500), tab = String(o.tab || '').trim().slice(0, 100);
        try { SS.csvUrl(url, tab); } catch (e) { return send(res, 400, { error: e.message }); }
        const map = Object.fromEntries(Object.entries(o.map || {}).filter(([k, v]) => SS.FIELDS[k] && v).map(([k, v]) => [k, String(v).slice(0, 100)]));
        const changed = !S || S.url !== url || S.tab !== tab;
        db.sheetSync = { ...(S || {}), url, tab, map, sentRows: changed ? [] : (S.sentRows || []) }; save(db);
        const r = await SS.run(db, SS_OPTS, o.skipExisting && changed ? 'skip' : null); return send(res, r.error ? 400 : 200, { ...view(), result: r }); }
      if (m === 'POST' && b === 'run') { if (!S) return send(res, 400, { error: 'Set up the sheet first' }); const r = await SS.run(db, SS_OPTS); return send(res, 200, { ...view(), result: r }); }
      if (m === 'DELETE' && !b) { delete db.sheetSync; save(db); return send(res, 200, view()); }
      return send(res, 404, { error: 'no route' });
    }
    if (a === 'billing') return send(res, 200, billing(db, user));
    const bl = billing(db, user);
    if (!bl.active) return send(res, 402, { error: 'trial_ended', ...bl });
    if (a === 'state' && m === 'GET') return send(res, 200, db);
    if (a === 'driverlink') { /*DRIVER1*/
      if (m === 'GET') return send(res, 200, { link: driverLinkView(db) });
      if (m === 'POST') { driverLinkNew(db, user); return send(res, 200, { link: driverLinkView(db) }); }
      if (m === 'DELETE') { driverLinkOff(db); return send(res, 200, { link: null }); } }
    if (a === 'photo' && m === 'GET') { const id = String(b || '').replace(/[^a-f0-9-]/g, ''), r = db.driverReports.find(x => x.id === id && x.photo);
      if (!r) return send(res, 404, { error: 'not found' }); const f = path.join(photoDir(user), r.photo); if (!fs.existsSync(f)) return send(res, 404, { error: 'not found' });
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400' }); return res.end(fs.readFileSync(f)); }
    if (a === 'driverReports' && m === 'DELETE' && b) { const r = db.driverReports.find(x => x.id === b); if (r && r.photo) try { fs.unlinkSync(path.join(photoDir(user), r.photo)); } catch {} }
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
    if (a === 'kb') { /*KBASE1 FleetLog knowledge base: NHTSA public data + OBDex CC0 codes + shop's own notes. No ALLDATA/Ford content.*/
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
