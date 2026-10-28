/*LEGAL1 California auto-renewal disclosures, consent, cancel, paid confirmation, legal links.*/
(function () {
  var TO = ''; fetch('/api/support').then(function (r) { return r.json(); }).then(function (j) { TO = (j && j.email) || ''; }).catch(function () {}) /*SUPPORT1 one config value: env SUPPORT_EMAIL*/, CONSENT_VER = 'v1-2026-10-22';
  var CONSENT_TXT = 'I agree to the Terms and the automatic renewal terms above';
  var STRIPE_PORTAL_URL = 'https://billing.stripe.com/p/login/aFabJ15OZekpdAG7DQ4F200'; // optional hardcoded Stripe Customer Portal login link; server env STRIPE_PORTAL_URL wins
  function money(n) { n = Number(n); return '$' + (n % 1 ? n.toFixed(2) : n); }
  function e(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function plans() { return ((window.FL_BILL && window.FL_BILL.plans) || window.FL_PLANS || []); }
  function planBy(id) { return plans().filter(function (p) { return p.id === id; })[0] || { id: id, name: id.charAt(0).toUpperCase() + id.slice(1), monthly: { basic: 15.99, premium: 19.99, pro: 29.99 }[id], yearly: { basic: 159, premium: 199, pro: 299 }[id] }; }
  window.renewText = function (p, per) {
    var unit = per === 'yearly' ? 'year' : 'month', price = money(p[per]) + '/' + unit;
    var t = (p.id === 'pro' && per === 'yearly') ? '10-day free trial, then ' + price + ' charged unless you cancel before the trial ends. ' : '';
    return t + 'Renews automatically at ' + price + ' until you cancel. Cancel anytime online in Settings.';
  };
  window.renewNote = function (p, per) {
    var id = 'ck_' + p.id + '_' + per;
    return '<div style="font-size:12.5px;color:#222;background:#f3effa;border:1px solid #d9cdee;border-radius:8px;padding:7px;margin-top:8px;line-height:1.4"><b>' + e(renewText(p, per)) + '</b></div>'
      + '<label style="display:flex;flex-direction:row;gap:6px;align-items:flex-start;font-size:12.5px;color:#222;margin-top:6px;cursor:pointer"><input type="checkbox" class="ckPlan" id="' + id + '" onchange="if(this.checked)document.querySelectorAll(\'.ckPlan\').forEach(function(c){if(c!==this)c.checked=false},this)" style="width:auto;margin-top:2px"><span>I agree to the <a href="/terms" target="_blank" style="color:#5b2a86">Terms</a> and the automatic renewal terms above</span></label>';
  };
  window.payGo = function (plan, per, link) {
    if (window.DEMO) return window.demoLogin('signup', 'Create a free account first, then choose your plan.'); /*DEMO1*/
    var ck = document.getElementById('ck_' + plan + '_' + per);
    if (!ck || !ck.checked) { if (ck) { ck.parentNode.style.outline = '2px solid #c62828'; ck.focus(); } alert('Please check the box to agree to the Terms and automatic renewal terms first.'); return; }
    var p = planBy(plan);
    try { fetch('/api/billing/consent', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', 'X-User': (window.AUTH && AUTH.id()) || '', 'X-Pin': localStorage.getItem('fmPin') || '' }, body: JSON.stringify({ plan: plan, cycle: per, price: p[per], text: CONSENT_TXT + ' — ' + renewText(p, per), version: CONSENT_VER }) }); } catch (x) {}
    window.open(link, '_blank');
  };
  window.legalLinks = function (c) { c = c || '#5b2a86'; return '<a href="/terms" style="color:' + c + '">Terms</a> · <a href="/privacy" style="color:' + c + '">Privacy</a> · <a href="/refund" style="color:' + c + '">Refunds</a> · <a href="#" onclick="openHelp(\'FleetLog support\');return false" style="color:' + c + '">Contact</a>'; };
  window.manageBtn = function () { return '<button class="b s" style="margin:6px 0;border:1px solid #5b2a86;color:#5b2a86;background:#fff" onclick="manageSub()">Manage or cancel subscription</button>'; };
  window.manageSub = function () {
    var url = (window.FL_BILL && window.FL_BILL.portalUrl) || STRIPE_PORTAL_URL;
    if (url) return window.open(url, '_blank');
    cancelForm();
  };
  function close() { var b = document.getElementById('cxBox'); if (b) b.remove(); }
  window.cancelForm = function () {
    if (document.getElementById('cxBox')) return;
    var b = window.FL_BILL || {}, s = b.subscription || {}, cur = s.plan ? planBy(s.plan).name + ' ' + (s.cycle || s.period || '') : '';
    var st = 'width:100%;box-sizing:border-box;padding:9px;border:1px solid #ccd;border-radius:8px;font:15px system-ui;margin:4px 0 10px';
    document.body.insertAdjacentHTML('beforeend', '<div id="cxBox" style="position:fixed;inset:0;background:#0007;z-index:210;display:flex;align-items:center;justify-content:center;padding:14px;font-family:system-ui,sans-serif"><form id="cxF" style="background:#fff;border-radius:14px;padding:20px;max-width:420px;width:100%;display:block">'
      + '<button type="button" onclick="document.getElementById(\'cxBox\').remove()" style="float:right;border:0;background:none;font-size:20px;cursor:pointer;width:auto;padding:0"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>'
      + '<h3 style="margin:0 0 6px;color:#5b2a86">Cancel subscription</h3><p style="font-size:13px;color:#445;margin:0 0 10px">Your plan stops renewing. You keep access until the end of the period you paid for. Your data stays saved.</p>'
      + '<label style="font-size:13px;color:#445">Email used for payment<input name="email" type="email" required maxlength="200" style="' + st + '"></label>'
      + '<label style="font-size:13px;color:#445">Name or company<input name="name" required maxlength="100" style="' + st + '"></label>'
      + '<div id="cxMsg" style="font-size:14px;margin:0 0 10px"></div>'
      + '<button id="cxSend" type="submit" style="width:100%;background:#c62828;color:#fff;border:0;border-radius:8px;padding:11px;font-weight:700;font-size:15px;cursor:pointer">Cancel my subscription</button></form></div>');
    var f = document.getElementById('cxF');
    f.onsubmit = async function (ev) {
      ev.preventDefault();
      var m = document.getElementById('cxMsg'), btn = document.getElementById('cxSend');
      var d = { name: f.name.value.trim(), email: f.email.value.trim(), subject: 'Cancel subscription', message: 'Please cancel my FleetLog subscription.' + (cur ? '\nPlan: ' + cur : '') + '\nRequested: ' + new Date().toISOString() };
      btn.disabled = true; btn.textContent = 'Sending…';
      var r, j = {};
      try { r = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }); j = await r.json().catch(function () { return {}; }); } catch (x) { r = null; }
      if (r && r.ok && j.ok) { f.innerHTML = '<h3 style="margin:0 0 8px;color:#2e7d32">Cancel request received</h3><p style="font-size:14px;color:#445">Your subscription will not renew. We will confirm by email to ' + e(d.email) + '. You keep access until the end of your paid period.</p><button type="button" onclick="document.getElementById(\'cxBox\').remove()" style="width:100%;background:#5b2a86;color:#fff;border:0;border-radius:8px;padding:10px;font-weight:700;cursor:pointer">Close</button>'; return; }
      if ((!r || j.fallback) && TO) { location.href = 'mailto:' + TO + '?subject=' + encodeURIComponent('Cancel subscription') + '&body=' + encodeURIComponent(d.message + '\n\n' + d.name + ' <' + d.email + '>'); m.style.color = '#445'; m.textContent = 'Opening your email app – press Send there to finish cancelling.'; }
      else { m.style.color = '#c62828'; m.textContent = j.error || 'Could not send. Please try again in a few minutes.'; }
      btn.disabled = false; btn.textContent = 'Cancel my subscription';
    };
  };
  window.paidConfirm = function (b, plan, cycle) {
    var p = planBy(plan), name = (b && b.planName) || p.name;
    document.body.insertAdjacentHTML('beforeend', '<div id="paidBox" style="position:fixed;inset:0;background:#0007;z-index:220;display:flex;align-items:center;justify-content:center;padding:14px;font-family:system-ui,sans-serif"><div style="background:#fff;border-radius:14px;padding:22px;max-width:440px;width:100%;text-align:center">'
      + '<div style="color:#2e7d32"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.8"/></svg></div><h3 style="color:#2e7d32;margin:4px 0 8px">Payment received – thank you!</h3>'
      + '<p style="font-size:15px;margin:0 0 8px">You are on the <b>' + e(name) + ' ' + e(cycle) + '</b> plan: <b>' + money(p[cycle]) + '/' + (cycle === 'yearly' ? 'year' : 'month') + '</b>.</p>'
      + '<p style="font-size:13.5px;color:#222;background:#f3effa;border-radius:8px;padding:8px">' + e(renewText(p, cycle)) + '</p>'
      + '<p style="font-size:13px;color:#445">To cancel: <b>Settings → Plans &amp; billing → Manage or cancel subscription</b>, or use Need help? to send us a message. Stripe emails your receipt.</p>'
      + '<p style="font-size:12px">' + legalLinks() + '</p>'
      + '<button class="b" style="width:100%" onclick="document.getElementById(\'paidBox\').remove()">OK</button></div></div>');
  };
})();
