/*UX1 shared UI helpers: one line-icon set, in-app toasts and dialogs, date formats. Loaded before the app script.*/
(function () {
  var P = {
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5h4v5"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
    camera: '<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13.5" r="3.5"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-5 4 4 2.5-2.5L20 18"/>',
    chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16v-5M12 16V8M16 16v-3"/>',
    truck: '<path d="M2.5 16.5V7h11v9.5"/><path d="M13.5 10h4l3 3.2v3.3h-7"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/>',
    tire: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M12 3v5.5M12 15.5V21M3 12h5.5M15.5 12H21"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9z"/><path d="M9 11h6M9 15h4"/>',
    check: '<path d="M5 12.5 10 17.5 19.5 7"/>',
    checklist: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9z"/><path d="m9 13 2 2 4-4"/>',
    receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
    logout: '<path d="M10 4H5v16h5"/><path d="M14 8l4 4-4 4M18 12H9"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    alert: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.01"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    fwd: '<path d="M9 5l7 7-7 7"/>',
    oil: '<path d="M12 3s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11z"/>',
    brake: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M7 7.5a7 7 0 0 1 4-2"/>',
    battery: '<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M7 4v3M17 4v3M7 13h3M15.5 11.5v3M14 13h3"/>',
    door: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 3v18M15 12h1"/>',
    note: '<path d="M5 4h14v16H5z"/><path d="M8 9h8M8 13h8M8 17h5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/>',
    sign: '<path d="M3 17c3-5 5-5 6-2s3 3 5-1 4-3 7 0"/><path d="M3 21h18"/>'
  };
  window.IC = function (n, s) { s = s || 18; return '<svg class="ic" viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-0.2em;flex:none">' + (P[n] || P.note) + '</svg>'; };
  var css = '.uxT{position:fixed;left:50%;bottom:84px;transform:translateX(-50%);z-index:200;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;width:min(92vw,440px)}'
    + '.uxT div{pointer-events:auto;background:#1d1f3a;color:#fff;border-radius:10px;padding:11px 16px;font:600 14px/1.35 system-ui,sans-serif;box-shadow:0 6px 20px #0003;display:flex;gap:8px;align-items:center;width:100%;box-sizing:border-box}'
    + '.uxT div.err{background:#b00020}.uxT div.ok{background:#1b5e20}'
    + '.uxD{position:fixed;inset:0;background:#0007;z-index:210;display:flex;align-items:center;justify-content:center;padding:20px}'
    + '.uxD>div{background:#fff;border-radius:14px;max-width:420px;width:100%;padding:20px;font:15px/1.45 system-ui,sans-serif;color:#1d1f3a;box-shadow:0 10px 40px #0004}'
    + '.uxD p{margin:0 0 16px}.uxD .uxB{display:flex;gap:10px;justify-content:flex-end}.uxD button{border:0;border-radius:8px;padding:10px 16px;font-weight:700;cursor:pointer;font-size:15px;width:auto}'
    + '.uxD .c{background:#eef0f4;color:#1d1f3a}.uxD .o{background:#5b2a86;color:#fff}.uxD .o.d{background:#b00020}.uxD input{width:100%;box-sizing:border-box;padding:9px;margin:0 0 14px;border:1px solid #ccd;border-radius:8px;font-size:14px}';
  function addCss() { if (document.getElementById('uxCss')) return; var s = document.createElement('style'); s.id = 'uxCss'; s.textContent = css; (document.head || document.documentElement).appendChild(s); }
  window.toast = function (msg, kind) {
    addCss(); var w = document.querySelector('.uxT'); if (!w) { w = document.createElement('div'); w.className = 'uxT'; w.setAttribute('role', 'status'); w.setAttribute('aria-live', 'polite'); document.body.appendChild(w); }
    var d = document.createElement('div'); d.className = kind || ''; d.textContent = String(msg == null ? '' : msg); w.appendChild(d);
    setTimeout(function () { d.remove(); }, kind === 'err' ? 6000 : 3500);
  };
  window.ask = function (msg, o) {
    o = o || {}; addCss();
    return new Promise(function (ok) {
      var d = document.createElement('div'); d.className = 'uxD'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
      var box = document.createElement('div'), p = document.createElement('p'); p.textContent = msg; box.appendChild(p);
      var inp = null; if (o.value != null) { inp = document.createElement('input'); inp.readOnly = true; inp.value = o.value; inp.onclick = function () { inp.select(); }; box.appendChild(inp); }
      var b = document.createElement('div'); b.className = 'uxB';
      var done = function (v) { d.remove(); document.removeEventListener('keydown', key); ok(v); };
      var key = function (e) { if (e.key === 'Escape') done(false); };
      if (o.cancel !== false) { var c = document.createElement('button'); c.className = 'c'; c.textContent = o.cancel || 'Cancel'; c.onclick = function () { done(false); }; b.appendChild(c); }
      var y = document.createElement('button'); y.className = 'o' + (o.danger ? ' d' : ''); y.textContent = o.ok || 'OK'; y.onclick = function () { done(true); }; b.appendChild(y);
      box.appendChild(b); d.appendChild(box); d.onclick = function (e) { if (e.target === d) done(false); };
      document.addEventListener('keydown', key); document.body.appendChild(d); (inp || y).focus(); if (inp) inp.select();
    });
  };
  window.showCopy = function (v) { return ask('Copy this link:', { value: v, ok: 'Done', cancel: false }); };
  /*errors and notices: never a browser pop-up*/
  window.alert = function (m) { var s = String(m == null ? '' : m); toast(s, /fail|could not|error|not |invalid|too |allow|please|enter|pick/i.test(s) ? 'err' : ''); };
  var D = function (v) { if (!v) return null; var s = String(v); var d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T12:00:00') : new Date(s); return isNaN(d) ? null : d; };
  window.fmtD = function (v) { var d = D(v); return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : (v || ''); };
  window.fmtDT = function (v) { var d = D(v); return d ? d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : (v || ''); };
  window.fmtUS = function (v) { var d = D(v); return d ? d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : (v || ''); };
})();
