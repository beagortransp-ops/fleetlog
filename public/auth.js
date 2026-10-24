// ACCTS1 FleetLog accounts: email + password, server session in an httpOnly cookie (the page never sees the token).
const AUTH = (() => {
  let user = null;
  const post = async (url, data) => { const r = await fetch('/api/auth/' + url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Pin': localStorage.getItem('fmPin') || '' }, body: JSON.stringify(data || {}) });
    const j = await r.json().catch(() => ({})); if (r.status === 401 && j.error === 'pin') { pinScreen(); throw new Error('Sign-in code needed'); } if (!r.ok) throw new Error(j.error || ('Error ' + r.status)); return j; };
  return {
    demo: false, phoneOn: false,
    id: () => (user && user.id) || '', // kept for localStorage keys only; the server ignores X-User
    label: () => (user && user.email) || '',
    role: () => (user && user.role) || 'owner', /*TEAM1*/
    async current() { const r = await fetch('/api/auth/me', { credentials: 'same-origin', headers: { 'X-Pin': localStorage.getItem('fmPin') || '' } }); const j = await r.json().catch(() => ({}));
      if (r.status === 401 && j.error === 'pin') { pinScreen(); throw new Error('Sign-in code needed'); } user = r.ok ? j : null; return user; },
    async login(email, password) { user = await post('login', { email, password }); window.DEMO = false; this.demo = false; return user; },
    async signup(email, password) { user = await post('signup', { email, password }); window.DEMO = false; this.demo = false; return user; },
    async signOut() { try { await post('logout'); } catch (e) {} user = null; location.reload(); }
  };
})();
