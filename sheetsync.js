// SHEETSYNC1 "Sheet Sync" add-on: pull rows from a public ("Anyone with the link can view") Google Sheet into an account's service log.
// No Google login: downloads the sheet as CSV. State per account in db.sheetSync = {url, tab, map, sentRows, lastRun, lastError, unknownUnits, lastAdded}.
const crypto = require('crypto');
const FIELDS = { date: ['date'], mechanic: ['mechanic', 'tech', 'technician'], unit: ['vehicleunit', 'unit', 'vehicle', 'truck'], mileage: ['mileage', 'miles', 'odometer'],
  job: ['jobtype', 'type'], work: ['workperformed', 'work', 'description', 'repair'], parts: ['partsused', 'parts'], partsCost: ['partscost', 'partcost', 'cost'],
  supplies: ['shopsupplies', 'supplies'], laborHours: ['laborhours', 'laborhrs', 'labor', 'hours'], status: ['status'], notes: ['notes', 'note', 'comments'] };
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function parseCSV(t) { const rows = []; let row = [], f = '', q = false; t = String(t).replace(/^\uFEFF/, '');
  for (let i = 0; i < t.length; i++) { const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; } else f += c; }
  if (f || row.length) { row.push(f); rows.push(row); } return rows; }
function autoMap(header) { const h = header.map(norm), map = {}, used = new Set();
  for (const [k, keys] of Object.entries(FIELDS)) { let idx = -1;
    for (const key of keys) { idx = h.findIndex((x, i) => !used.has(i) && (x === key || x.startsWith(key))); if (idx >= 0) break; }
    if (idx >= 0) { map[k] = header[idx]; used.add(idx); } }
  return map; }
const money = s => { s = String(s || '').split('+')[0].replace(/[$,\s]/g, ''); const n = parseFloat(s); return isFinite(n) ? n : 0; };
function isoDate(s) { s = String(s || '').trim(); let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[0] : null; }
function csvUrl(url, tab) { const id = (String(url).match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/) || [])[1]; if (!id) throw new Error('Not a Google Sheets link');
  const gid = (String(url).match(/[#&?]gid=(\d+)/) || [])[1];
  return tab ? `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}` : `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? '&gid=' + gid : ''}`; }
async function fetchRows(cfg, fetchText) {
  const txt = fetchText ? await fetchText(cfg) : await (async () => { const r = await fetch(csvUrl(cfg.url, cfg.tab), { redirect: 'follow' }); const t = await r.text();
    if (!r.ok || /^\s*<(!doctype|html)/i.test(t)) throw new Error('Could not read the sheet. Share it as "Anyone with the link can view" and check the tab name.'); return t; })();
  const rows = parseCSV(txt); if (!rows.length) throw new Error('Sheet is empty'); return rows; }
// opts: { save(db), bumpMileage(db, rec), fetchText?(cfg) }  mode 'skip' = mark all current rows as sent, add nothing.
async function run(db, opts, mode) {
  const S = db.sheetSync; if (!S || !S.url) throw new Error('Sheet Sync is not set up');
  S.sentRows = Array.isArray(S.sentRows) ? S.sentRows : [];
  const res = { added: 0, already: 0, unknown: [], at: new Date().toISOString() };
  try {
    const rows = await fetchRows(S, opts.fetchText), header = rows[0], map = { ...autoMap(header), ...(S.map || {}) }, col = k => header.indexOf(map[k]);
    if (col('date') < 0 || col('unit') < 0) throw new Error('Could not find the Date and Vehicle / Unit # columns. Set them under Column mapping.');
    const get = (r, k) => { const i = col(k); return i >= 0 ? String(r[i] || '').trim() : ''; };
    const sent = new Set(S.sentRows), veh = new Map(db.vehicles.filter(v => !v.example).map(v => [norm(v.truck), v]));
    const keys = new Set(db.services.map(s => s.vehicleId + '|' + s.date + '|' + Math.round(Number(s.cost || 0) * 100)));
    for (let i = 1; i < rows.length; i++) { const r = rows[i], n = i + 1, date = isoDate(get(r, 'date')), unit = get(r, 'unit'), lh = parseFloat(get(r, 'laborHours').replace(/[^0-9.]/g, '')), lhv = isFinite(lh) && lh > 0 ? lh : null;
      if (lhv != null) { const ex = db.services.find(s => s.sheetRow === n && s.laborHours == null); if (ex) { ex.laborHours = lhv; res.laborFilled = (res.laborFilled || 0) + 1; } } /*LABOR1 backfill hours on rows already synced*/
      if (date) { const tag = `[sheet row ${n}]`, ex = db.services.find(s => s.sheetRow === n || String(s.notes || '').includes(tag)); if (ex && ex.date !== date) { console.log('sheetsync datefix row', n, ex.date, '->', date); (res.dateFixed = res.dateFixed || []).push({ row: n, from: ex.date, to: date }); ex.date = date; } } /*DATEFIX1 sheet date edits flow to already-synced rows*/
      if (sent.has(n) || !date || !unit) continue;
      if (mode === 'skip') { sent.add(n); res.already++; continue; }
      const v = veh.get(norm(unit)); if (!v) { res.unknown.push({ row: n, unit: unit.slice(0, 40) }); continue; }
      const pc = money(get(r, 'partsCost')), cost = Math.round((pc + money(get(r, 'supplies'))) * 100) / 100;
      if (keys.has(v.id + '|' + date + '|' + Math.round(cost * 100)) || keys.has(v.id + '|' + date + '|' + Math.round(pc * 100))) { sent.add(n); res.already++; continue; }
      const job = get(r, 'job'), status = get(r, 'status'), notes = get(r, 'notes'), mil = parseInt(get(r, 'mileage').replace(/[^0-9]/g, ''), 10) || null;
      const rec = { id: crypto.randomUUID(), vehicleId: v.id, date, mileage: mil, cost, shop: get(r, 'mechanic').slice(0, 80), category: (get(r, 'work') || job || 'Shop work').slice(0, 200),
        parts: get(r, 'parts').slice(0, 300), downtimeDays: null, notes: [job && job + '.', status && 'Status: ' + status + '.', notes, `[sheet row ${n}]`].filter(Boolean).join(' ').slice(0, 1000), sheetRow: n, laborHours: lhv };
      db.services.push(rec); opts.bumpMileage && opts.bumpMileage(db, rec); keys.add(v.id + '|' + date + '|' + Math.round(cost * 100)); sent.add(n); res.added++; }
    S.sentRows = [...sent].sort((a, b) => a - b); S.lastError = null; S.detected = map;
  } catch (e) { S.lastError = String(e.message || e).slice(0, 300); }
  S.lastRun = res.at; S.lastAdded = res.added; S.lastAlready = res.already; S.unknownUnits = res.unknown.slice(0, 50); S.totalAdded = (S.totalAdded || 0) + res.added;
  opts.save(db); return { ...res, error: S.lastError };
}
module.exports = { run, parseCSV, autoMap, csvUrl, FIELDS };
