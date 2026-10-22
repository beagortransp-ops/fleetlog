// Passwordless sign-in (Supabase Auth, one-time code). Demo mode when config.js is blank.
const AUTH = (() => {
  const C = window.FM_CONFIG || {};
  const demo = !C.SUPABASE_URL || !C.SUPABASE_ANON_KEY;
  if (C.SUPABASE_ANON_KEY && /service_role|sb_secret_/.test(C.SUPABASE_ANON_KEY + atobSafe(C.SUPABASE_ANON_KEY))) {
    alert('config.js has a SECRET key. Remove it and use the public anon/publishable key.'); throw new Error('secret key in config');
  }
  function atobSafe(k) { try { return atob(String(k).split('.')[1] || ''); } catch { return ''; } }
  let sb = null, user = null;
  if (!demo) {
    if (!window.supabase) throw new Error('Sign-in library did not load (check internet).');
    sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  }
  const isPhone = v => /^\+?[\d\s().-]{7,}$/.test(v) && !v.includes('@');
  const normPhone = v => { let d = v.replace(/[^\d+]/g, ''); if (!d.startsWith('+')) d = (d.length === 10 ? '+1' : '+') + d; return d; };
  return {
    demo, phoneOn: !!C.ALLOW_PHONE,
    id: () => demo ? '' : (user && user.id) || '',
    label: () => demo ? 'Demo mode' : (user && (user.email || user.phone)) || '',
    async current() { if (demo) return { demo: true }; const { data } = await sb.auth.getSession(); user = data.session ? data.session.user : null; return user; },
    async send(raw) {
      const v = raw.trim(); if (!v) throw new Error('Enter your email' + (C.ALLOW_PHONE ? ' or phone' : ''));
      const phone = isPhone(v);
      if (phone && !C.ALLOW_PHONE) throw new Error('Text-message codes are not turned on yet. Use your email.');
      if (!phone && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) throw new Error('That email does not look right.');
      const arg = phone ? { phone: normPhone(v) } : { email: v.toLowerCase() };
      const { error } = await sb.auth.signInWithOtp(arg); if (error) throw error;
      return { ...arg, type: phone ? 'sms' : 'email' };
    },
    async verify(target, code) {
      const { data, error } = await sb.auth.verifyOtp({ ...(target.phone ? { phone: target.phone } : { email: target.email }), token: code.trim(), type: target.type });
      if (error) throw error; user = data.user; return user;
    },
    async signOut() { if (sb) await sb.auth.signOut(); user = null; location.reload(); }
  };
})();
