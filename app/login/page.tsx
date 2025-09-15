'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const sb = createClient();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  // 页面加载时读取保存的登录信息
  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem('saved_email');
      const savedPassword = localStorage.getItem('saved_password');
      if (savedEmail) setEmail(savedEmail);
      if (savedPassword) setPw(savedPassword);
    } catch (e) {
      // localStorage可能被禁用，忽略错误
    }
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    // Admin portal shortcut: if password equals special admin portal password, go admin page
    try {
      const adminPortalPassword = process.env.NEXT_PUBLIC_ADMIN_PORTAL_PASSWORD;
      if (adminPortalPassword && pw === adminPortalPassword) {
        setLoading(false);
        router.push('/admin/billing');
        return;
      }
    } catch {}
    try {
      let user;
      let authErr;
      
      if (isSignUp) {
        // 注册新用户 - 使用统一密码 + 存储手机号到user_metadata
        const fullPhone = `+60${phone.replace(/^0/, '')}`; // 处理马来西亚手机号格式
        const { data, error } = await sb.auth.signUp({ 
          email, 
          password: 'agent123123',
          options: {
            data: {
              phone: fullPhone
            }
          }
        });
        user = data.user;
        authErr = error;
        if (!authErr && user) {
          // 注册成功后保存邮箱到localStorage
          try {
            localStorage.setItem('saved_email', email);
            localStorage.setItem('saved_password', 'agent123123'); // 保存统一密码
          } catch (e) {
            // localStorage可能被禁用，忽略错误
          }
          setErr('注册成功！请检查邮箱并点击确认链接。');
          setLoading(false);
          return;
        }
      } else {
        // 登录现有用户
        const { data, error } = await sb.auth.signInWithPassword({ email, password: pw });
        user = data.user;
        authErr = error;
        
        // 登录成功后保存到localStorage
        if (!authErr && user) {
          try {
            localStorage.setItem('saved_email', email);
            localStorage.setItem('saved_password', pw);
          } catch (e) {
            // localStorage可能被禁用，忽略错误
          }
        }
      }
      
      if (authErr) {
        setLoading(false);
        setErr(authErr.message);
        return;
      }

      // After login, check strict boolean active flag
      const active = (user?.app_metadata as any)?.active === true;
      if (active) {
        setLoading(false);
        window.location.href = '/caption';
        return;
      }

      // Not active → redirect to Stripe Payment Link
      const paymentLink = process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK_URL;
      if (paymentLink) {
        window.location.href = paymentLink; // 外部链接使用window.location.href
      } else {
        setErr('Payment link is not configured');
      }
      setLoading(false);
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
        const active = (user?.app_metadata as any)?.active === true;
        if (alive && user && active) {
          window.location.href = '/caption';
        }
      } catch {}
    })();
    return () => { alive = false; };
  }, []); // 移除sb依赖，避免重复执行

  return (
    <main className="login-main">
      <div className="card-login">
        <h1 className="title-login">{isSignUp ? '注册' : '登录'}</h1>
        <div className="title-underline" />

        <form onSubmit={onSubmit} className="form-login">
          <label className="label-login">Email</label>
          <input
            className="input-login"
            type="email" required value={email}
            onChange={e=>setEmail(e.target.value)}
            placeholder="Enter email address"
          />

          {isSignUp ? (
            // 注册时显示手机号字段
            <>
              <label className="label-login">手机号码</label>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ 
                  padding: '12px', 
                  backgroundColor: '#f5f5f5', 
                  border: '1px solid #ddd', 
                  borderRight: 'none',
                  fontSize: '14px',
                  color: '#666'
                }}>+60</span>
                <input
                  className="input-login"
                  type="tel" required value={phone}
                  onChange={e=>setPhone(e.target.value)}
                  placeholder="123456789"
                  style={{ borderLeft: 'none', flex: 1 }}
                />
              </div>
            </>
          ) : (
            // 登录时显示密码字段
            <>
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
            </>
          )}

          <button
            className="btn-login"
            type="submit"
            disabled={loading || !email || (isSignUp ? !phone : !pw)}
          >
            {loading ? (isSignUp ? '注册中…' : '登录中…') : (isSignUp ? '注册' : '登录')}
          </button>

          {err && <div className="error-login">{err}</div>}
        </form>

        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--brand)',
              textDecoration: 'underline',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            {isSignUp ? '已有账号？点击登录' : '没有账号？点击注册'}
          </button>
        </div>
      </div>
    </main>
  );
}


