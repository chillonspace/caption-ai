'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const sb = createClient();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [show, setShow] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    // Admin portal shortcut: if password equals special admin portal password, go admin page
    try {
      const adminPortalPassword = process.env.NEXT_PUBLIC_ADMIN_PORTAL_PASSWORD;
      if (adminPortalPassword && pw === adminPortalPassword) {
        setLoading(false);
        location.href = '/admin/billing';
        return;
      }
    } catch {}
    try {
      const { data: { user }, error: authErr } = await sb.auth.signInWithPassword({ email, password: pw });
      if (authErr) {
        setLoading(false);
        setErr(authErr.message);
        return;
      }

      // After login, check app_metadata.active; if falsey, send to payment link
      const active = Boolean((user?.app_metadata as any)?.active);
      if (active) {
        setLoading(false);
        location.href = '/caption';
        return;
      }

      // Not active → redirect to Stripe Payment Link
      const paymentLink = process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK_URL;
      if (paymentLink) {
        location.href = paymentLink;
      } else {
        setErr('Payment link is not configured');
      }
    } catch (e: unknown) {
      setErr((e as Error)?.message ?? 'Login failed');
      setLoading(false);
    }
  }

  // If already logged in, redirect to /caption
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { user } } = await sb.auth.getUser();
        const active = Boolean((user?.app_metadata as any)?.active);
        if (alive && user && active) location.href = '/caption';
      } catch {}
    })();
    return () => { alive = false; };
  }, [sb]);

  return (
    <main className="login-main">
      <div className="card-login">
        <h1 className="title-login">登录</h1>
        <div className="title-underline" />

        <form onSubmit={onSubmit} className="form-login">
          <label className="label-login">Email</label>
          <input
            className="input-login"
            type="email" required value={email}
            onChange={e=>setEmail(e.target.value)}
            placeholder="Enter email address"
          />

          <label className="label-login">密码</label>
          <div className="password-row">
            <input
              className="input-login"
              type={show ? 'text' : 'password'} required value={pw}
              onChange={e=>setPw(e.target.value)}
              placeholder="Enter password"
            />
            <button type="button" className="pw-toggle" onClick={()=>setShow(s=>!s)}>
              {show ? '隐藏' : '显示'}
            </button>
          </div>

          <button
            className="btn-login"
            type="submit"
            disabled={loading || !email || !pw}
          >
            {loading ? '登录中…' : '登录'}
          </button>

          {err && <div className="error-login">{err}</div>}
        </form>
      </div>
    </main>
  );
}


