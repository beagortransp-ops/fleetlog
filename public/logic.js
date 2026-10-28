// Shared pure logic (browser + Node). No I/O, so it can move on-device later.
(function (root) {
  const DAY = 86400000;
  const num = v => Number(v) || 0;
  function avgDailyMiles(db, vid) {
    const pts = [];
    db.services.filter(s => s.vehicleId === vid && s.mileage).forEach(s => pts.push([s.date, num(s.mileage)]));
    db.parts.filter(p => p.vehicleId === vid && p.mileage).forEach(p => pts.push([p.date, num(p.mileage)]));
    (db.mileageLog || []).filter(m => m.vehicleId === vid).forEach(m => pts.push([m.date, num(m.mileage)]));
    if (pts.length < 2) return 0;
    pts.sort((a, b) => a[0] < b[0] ? -1 : 1);
    const [d0, m0] = pts[0], [d1, m1] = pts[pts.length - 1];
    const days = (new Date(d1) - new Date(d0)) / DAY;
    return days > 0 && m1 > m0 ? (m1 - m0) / days : 0;
  }
  function predictions(db, today) {
    today = today || new Date().toISOString().slice(0, 10);
    const out = [];
    for (const v of db.vehicles) {
      const adm = avgDailyMiles(db, v.id), cur = num(v.mileage);
      for (const it of db.intervals) {
        const hist = [...db.services.filter(s => s.vehicleId === v.id && s.category === it.category),
                      ...db.parts.filter(p => p.vehicleId === v.id && p.type === it.category)]
          .sort((a, b) => a.date < b.date ? 1 : -1);
        const last = hist[0];
        const lastMi = last ? num(last.mileage) : 0, lastDate = last ? last.date : null;
        let dueMi = it.miles && last ? lastMi + num(it.miles) : null;
        let dueByMiles = null;
        if (dueMi != null && adm > 0) dueByMiles = new Date(new Date(today).getTime() + ((dueMi - cur) / adm) * DAY);
        let dueByTime = null;
        if (it.months && lastDate) { const d = new Date(lastDate); d.setMonth(d.getMonth() + num(it.months)); dueByTime = d; }
        const cands = [dueByMiles, dueByTime].filter(Boolean);
        const dueDate = cands.length ? new Date(Math.min(...cands)).toISOString().slice(0, 10) : null;
        const milesLeft = dueMi != null ? dueMi - cur : null;
        const overdue = (milesLeft != null && milesLeft <= 0) || (dueDate && dueDate < today);
        const soon = !overdue && ((milesLeft != null && milesLeft <= 1500) || (dueDate && (new Date(dueDate) - new Date(today)) / DAY <= 30));
        out.push({ vehicleId: v.id, truck: v.truck, category: it.category, lastDate, lastMileage: last ? lastMi : null,
          dueMileage: dueMi, milesLeft, dueDate, avgDailyMiles: Math.round(adm), status: !last ? 'unknown' : overdue ? 'overdue' : soon ? 'soon' : 'ok', noHistory: !last });
      }
    }
    const rank = { overdue: 0, soon: 1, ok: 2, unknown: 3 };
    return out.sort((a, b) => rank[a.status] - rank[b.status] || (a.dueDate || '9') .localeCompare(b.dueDate || '9'));
  }
  function quoteGroups(db) {
    const g = {};
    for (const q of db.quotes) { const k = q.vehicleId + '|' + q.job; (g[k] = g[k] || { vehicleId: q.vehicleId, job: q.job, quotes: [] }).quotes.push(q); }
    return Object.values(g).map(x => {
      const prices = x.quotes.map(q => num(q.price));
      const min = Math.min(...prices), max = Math.max(...prices);
      return { ...x, cheapest: x.quotes.find(q => num(q.price) === min), min, max, spread: max - min,
        spreadPct: min ? Math.round((max - min) / min * 100) : 0, chosen: x.quotes.find(q => q.chosen) || null };
    });
  }
  function dashboard(db, today) {
    const months = [];
    const t = today ? new Date(today) : new Date();
    for (let i = 11; i >= 0; i--) { const d = new Date(t.getFullYear(), t.getMonth() - i, 1); months.push(d.toISOString().slice(0, 7)); }
    const costItems = [...db.services.map(s => ({ ...s, kind: 'service' })), ...db.parts.map(p => ({ ...p, kind: 'part' }))];
    const perTruck = db.vehicles.map(v => {
      const mine = costItems.filter(c => c.vehicleId === v.id);
      const monthly = months.map(m => ({ month: m, spend: mine.filter(c => (c.date || '').startsWith(m)).reduce((a, c) => a + (typeof LABOR_TOT === 'function' && c.kind === 'service' ? LABOR_TOT(c) : num(c.cost)), 0) }));
      return { vehicleId: v.id, truck: v.truck, monthly,
        totalSpend: mine.reduce((a, c) => a + (typeof LABOR_TOT === 'function' && c.kind === 'service' ? LABOR_TOT(c) : num(c.cost)), 0),
        downtimeDays: db.services.filter(s => s.vehicleId === v.id).reduce((a, s) => a + num(s.downtimeDays), 0),
        last12Spend: monthly.reduce((a, m) => a + m.spend, 0), ...cpm(v, mine) };
    });
    /*CPM1 cost per mile = total recorded spend / miles between the lowest and highest odometer we have for the truck (needs 100+ miles)*/
    function cpm(v, mine) {
      const od = [v.mileage, v.startMileage, ...[db.services, db.parts, db.inspections || [], db.mileageLog || []].flatMap(a => (a || []).filter(x => x.vehicleId === v.id).map(x => x.mileage))].map(Number).filter(x => x > 0);
      const miles = od.length > 1 ? Math.max(...od) - Math.min(...od) : 0, spend = mine.reduce((a, c) => a + (typeof LABOR_TOT === 'function' && c.kind === 'service' ? LABOR_TOT(c) : num(c.cost)), 0);
      return { milesTracked: miles, costPerMile: miles >= 100 ? Math.round(spend / miles * 1000) / 1000 : null };
    }
    const preds = predictions(db, today);
    return { months, perTruck,
      totals: { vehicles: db.vehicles.length, spend: perTruck.reduce((a, p) => a + p.totalSpend, 0),
        last12Spend: perTruck.reduce((a, p) => a + p.last12Spend, 0), downtimeDays: perTruck.reduce((a, p) => a + p.downtimeDays, 0),
        overdue: preds.filter(p => p.status === 'overdue').length, soon: preds.filter(p => p.status === 'soon').length },
      upcoming: preds.filter(p => p.status === 'overdue' || p.status === 'soon').slice(0, 15) };
  }
  function toCSV(rows) {
    if (!rows.length) return '';
    const cols = [...new Set(rows.flatMap(Object.keys))];
    const esc = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
  }
  const api = { avgDailyMiles, predictions, quoteGroups, dashboard, toCSV };
  if (typeof module !== 'undefined') module.exports = api; else root.FleetLogic = api;
})(this);
