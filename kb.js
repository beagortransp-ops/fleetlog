// KBASE1 – Costa Fleet knowledge base helpers. Data: NHTSA vPIC/recalls/manufacturer communications (public, free), OBDex generic DTCs (CC0).
const fs = require('fs'), path = require('path');
const CACHE = path.join(path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data')), 'kb-cache.json'), DTC = path.join(__dirname, 'dtc-obdex.json');
let K = null;
const ALIAS = { 'MT45 Chassis': 'MT45' };
function load() { if (!K) { K = JSON.parse(fs.readFileSync(CACHE, 'utf8')); K.dtc = JSON.parse(fs.readFileSync(DTC, 'utf8')); } return K; }
const isFleet = v => (v.make || '').toLowerCase() !== 'kia';
function info(K, v) { const d = K.decoded[v.vin] || {}; const make = d.make || (v.make || '').toUpperCase(), model = d.model || v.model || '', year = String(d.year || v.year || '');
  const nm = d.nhtsaModel || ALIAS[model] || model; return { year, make, model, nhtsaModel: nm, series: d.series || '', engine: d.engine || '', group: `${year} ${make[0] + make.slice(1).toLowerCase()} ${model}${d.series ? ' ' + d.series : ''}`.trim(), rkey: `${year}|${make}|${nm}` }; }
function seeded(db, K) { // repair records from the service log, grouped by model (no truck numbers)
  const byId = Object.fromEntries(db.vehicles.filter(isFleet).map(v => [v.id, info(K, v).group]));
  return db.services.filter(s => byId[s.vehicleId] && !s.example && (s.category || s.parts || s.notes)).map(s => ({ id: 's-' + s.id, fromLog: true, group: byId[s.vehicleId], date: s.date, symptom: s.notes || '', code: ((s.notes || '') + ' ' + (s.parts || '')).toUpperCase().match(/\b[PBCU][0-9A-F]{4}\b/g)?.join(' ') || '', fix: s.category || '', parts: s.parts || '', labor: s.downtimeDays ? s.downtimeDays + ' day(s) down' : '', notes: s.cost ? 'Cost $' + s.cost : '' }));
}
function overview(db, K) {
  const groups = {};
  for (const v of db.vehicles.filter(isFleet)) { const i = info(K, v); const g = groups[i.group] = groups[i.group] || { group: i.group, year: i.year, make: i.make, model: i.model, engine: i.engine, rkey: i.rkey, vehicles: [] };
    g.vehicles.push({ year: i.year, model: `${i.make[0] + i.make.slice(1).toLowerCase()} ${i.model}${i.series ? ' ' + i.series : ''}`, vin: v.vin || '' }); }
  const fixes = [...seeded(db, K), ...(db.kbFixes || [])];
  const list = Object.values(groups).sort((a, b) => a.year.localeCompare(b.year) || a.group.localeCompare(b.group)).map(g => ({ ...g, recalls: K.recalls[g.rkey] || [], bulletinCount: K.bulletins.filter(b => b.make === g.make && b.model.toUpperCase() === (ALIAS[g.model] || g.model).toUpperCase() && b.years.includes(g.year)).length, fixes: fixes.filter(f => f.group === g.group) }));
  return { shop: 'Costa Fleet', builtAt: K.builtAt, recallsAt: K.recallsAt || K.builtAt, groups: list, bulletins: K.bulletins, dtcCount: Object.keys(K.dtc).length };
}
const txt = o => Object.values(o).join(' ').toLowerCase();
function shopHits(db, K, code) { if (!code) return []; const re = new RegExp('\\b' + code + '\\b', 'i'); return [...seeded(db, K), ...(db.kbFixes || [])].filter(f => re.test([f.code, f.symptom, f.fix, f.parts, f.notes].join(' '))); }
function search(db, K, q) {
  q = q.toLowerCase(); if (q.length < 2) return { q, fixes: [], codes: [], recalls: [], bulletins: [] };
  const ws = q.split(/\s+/).filter(Boolean), hit = s => ws.every(w => s.includes(w));
  const ov = overview(db, K), fixes = ov.groups.flatMap(g => g.fixes).filter(f => hit(txt(f)));
  const C = /^[pbcu][0-9a-f]{4}$/.test(q) ? (K.dtc[q.toUpperCase()] ? [[q.toUpperCase(), K.dtc[q.toUpperCase()]]] : []) : Object.entries(K.dtc).filter(([c, d]) => hit((c + ' ' + d.t).toLowerCase())).slice(0, 25);
  const recalls = ov.groups.flatMap(g => g.recalls.map(r => ({ group: g.group, ...r }))).filter(r => hit(txt(r)));
  const bulletins = K.bulletins.filter(b => hit((b.id + ' ' + b.summary + ' ' + b.model).toLowerCase())).slice(0, 40);
  return { q, fixes, codes: C.map(([code, d]) => ({ code, title: d.t })), recalls, bulletins };
}
async function refresh(db) { // re-pull NHTSA recalls for the fleet's make/model/year
  const k = load(), keys = [...new Set(db.vehicles.filter(isFleet).map(v => info(k, v).rkey))]; const out = {}, errs = [];
  for (const key of keys) { const [y, mk, md] = key.split('|');
    try { const r = await fetch('https://api.nhtsa.gov/recalls/recallsByVehicle?' + new URLSearchParams({ make: mk, model: md, modelYear: y }), { headers: { 'User-Agent': 'Mozilla/5.0 CostaFleet' } }); const j = r.ok ? await r.json() : { results: [] };
      out[key] = (j.results || []).map(x => ({ NHTSACampaignNumber: x.NHTSACampaignNumber, ReportReceivedDate: x.ReportReceivedDate, Component: x.Component, Summary: x.Summary, Remedy: x.Remedy, parkIt: x.parkIt, parkOutSide: x.parkOutSide })); } catch (e) { errs.push(key); out[key] = k.recalls[key] || []; } }
  k.recalls = { ...k.recalls, ...out }; k.recallsAt = new Date().toISOString().slice(0, 10);
  const { dtc, ...disk } = k; fs.writeFileSync(CACHE + '.tmp', JSON.stringify(disk)); fs.renameSync(CACHE + '.tmp', CACHE);
  return { ok: true, recallsAt: k.recallsAt, combos: keys.length, errors: errs };
}
module.exports = { load, overview, shopHits, search, refresh };
