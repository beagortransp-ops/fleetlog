/*CONTACT1 "Need help?" modal -> POST /api/contact; falls back to mailto when server has no email key.*/
(function () {
  var TO = ''; fetch('/api/support').then(function (r) { return r.json(); }).then(function (j) { TO = (j && j.email) || ''; }).catch(function () {}) /*SUPPORT1 one config value: env SUPPORT_EMAIL*/;
  function el(id) { return document.getElementById(id); }
  window.openHelp = function (subj) {
    if (el('helpBox')) return;
    var pre = {}; try { var s = JSON.parse(localStorage.getItem('fl_user') || 'null'); if (s && s.email) pre.email = s.email; } catch (e) {}
    var st = 'width:100%;box-sizing:border-box;padding:9px;border:1px solid #ccd;border-radius:8px;font:15px system-ui;margin:4px 0 10px';
    document.body.insertAdjacentHTML('beforeend', '<div id="helpBox" style="position:fixed;inset:0;background:#0007;z-index:200;display:flex;align-items:center;justify-content:center;padding:14px;font-family:system-ui,sans-serif" onclick="if(event.target===this)closeHelp()"><form id="helpF" style="background:#fff;border-radius:14px;padding:20px;max-width:440px;width:100%;box-shadow:0 8px 40px #0004;text-align:left" onsubmit="sendHelp(event)">'
      + '<button type="button" onclick="closeHelp()" style="float:right;border:0;background:none;font-size:20px;cursor:pointer;width:auto;padding:0;color:#445" aria-label="Close"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>'
      + '<h3 style="margin:0 0 10px;color:#5b2a86">Need help?</h3>'
      + '<p style="font-size:13px;color:#445;margin:0 0 10px"><b>How to reach us:</b> fill in this form with your name and email, then describe your issue or question (which screen, which truck, what happened). We reply by email.</p>'
      + '<label style="font-size:13px;color:#445">Name<input name="name" required maxlength="100" style="' + st + '"></label>'
      + '<label style="font-size:13px;color:#445">Email (we reply here)<input name="email" type="email" required maxlength="200" value="' + (pre.email || '').replace(/"/g, '') + '" style="' + st + '"></label>'
      + '<label style="font-size:13px;color:#445">Message<textarea name="message" required maxlength="5000" rows="5" style="' + st + ';resize:vertical"></textarea></label>'
      + '<input name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0" aria-hidden="true">'
      + '<input type="hidden" name="subj" value="' + String(subj || 'FleetLog support').replace(/"/g, '') + '">'
      + '<div id="helpMsg" style="font-size:14px;margin:0 0 10px"></div>'
      + '<button id="helpSend" type="submit" style="width:100%;background:#5b2a86;color:#fff;border:0;border-radius:8px;padding:11px;font-weight:700;font-size:15px;cursor:pointer">Send</button></form></div>');
    setTimeout(function () { var f = el('helpF'); if (f) f.name.focus(); }, 30);
  };
  window.closeHelp = function () { var b = el('helpBox'); if (b) b.remove(); };
  window.sendHelp = async function (ev) {
    ev.preventDefault();
    var f = el('helpF'), m = el('helpMsg'), b = el('helpSend');
    var d = { name: f.name.value.trim(), email: f.email.value.trim(), message: f.message.value.trim(), website: f.website.value };
    b.disabled = true; b.textContent = 'Sending…'; m.textContent = '';
    var r, j = {};
    try { r = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) }); j = await r.json().catch(function () { return {}; }); } catch (e) { r = null; }
    if (r && r.ok && j.ok) { f.innerHTML = '<h3 style="margin:0 0 8px;color:#2e7d32">Message sent – we\'ll reply by email</h3><button type="button" onclick="closeHelp()" style="width:100%;background:#5b2a86;color:#fff;border:0;border-radius:8px;padding:10px;font-weight:700;cursor:pointer">Close</button>'; return; }
    if ((!r || j.fallback) && TO) {
      location.href = 'mailto:' + TO + '?subject=' + encodeURIComponent(f.subj.value) + '&body=' + encodeURIComponent(d.message + '\n\n' + d.name + ' <' + d.email + '>');
      m.style.color = '#445'; m.textContent = 'Opening your email app – press Send there to send the message.';
    } else { m.style.color = '#c62828'; m.textContent = j.error || 'Could not send the message. Please try again in a few minutes.'; }
    b.disabled = false; b.textContent = 'Send';
  };
})();
