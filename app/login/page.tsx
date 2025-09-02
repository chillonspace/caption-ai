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
    const { error } = await sb.auth.signInWithPassword({ email, password: pw });
    setLoading(false);
    if (error) {
      setErr(error.message);
      return;
    }
    location.href = '/caption';
  }

  // If already logged in, redirect to /caption
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { user } } = await sb.auth.getUser();
        if (alive && user) location.href = '/caption';
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


