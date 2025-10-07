"use client";
import { useEffect, useState } from 'react';

export default function AdminBillingPage() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [phoneNew, setPhoneNew] = useState('');
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [usageStats, setUsageStats] = useState<Record<string, number>>({});

  // bootstrap token from public admin password (single-password mode)
  useEffect(() => {
    try {
      const pw = process.env.NEXT_PUBLIC_ADMIN_PORTAL_PASSWORD as string | undefined;
      if (pw) setToken(pw);
    } catch {}
  }, []);

  async function callAPI(body: Record<string, any>, updateUserInList = false) {
    setLoading(true);
    setStatus('');
    try {
      const res = await fetch('/api/admin/user-active', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': token || '',
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Request failed');
      
      // 如果是从用户列表操作且成功，立即更新列表中的用户状态
      if (updateUserInList && body.email && typeof body.active === 'boolean') {
        setUsers(prevUsers => 
          prevUsers.map(user => 
            user.email === body.email 
              ? { ...user, active: body.active }
              : user
          )
        );
        setStatus(`✅ 已成功${body.active ? '激活' : '禁用'} ${body.email}`);
      } else {
        setStatus(JSON.stringify(json));
      }
    } catch (e: any) {
      setStatus(`❌ 错误: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function updateUserPhone() {
    if (!email.trim()) {
      setStatus('❌ 错误: 请输入邮箱');
      return;
    }
    setLoading(true);
    setStatus('');
    try {
      const res = await fetch('/api/admin/user-phone', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': token || '',
        },
        body: JSON.stringify({ email, phone: phoneNew.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Request failed');

      // 同步更新列表中的该用户手机号
      setUsers(prev => prev.map(u => u.email === email ? { ...u, phone: phoneNew.trim() } : u));
      setStatus(`✅ 已更新手机号: ${email} → ${phoneNew.trim() || '-'}`);
    } catch (e: any) {
      setStatus(`❌ 错误: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
      month: '2-digit',
      day: '2-digit'
    });
  };

  const formatLastSignIn = (dateStr: string) => {
    if (!dateStr) return '从未登陆';
    const lastSignIn = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - lastSignIn.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return '今天';
    } else if (diffDays === 1) {
      return '昨天';
    } else if (diffDays < 7) {
      return `${diffDays}天前`;
    } else if (diffDays < 30) {
      return `${Math.floor(diffDays / 7)}周前`;
    } else {
      return lastSignIn.toLocaleDateString('zh-CN', {
        month: '2-digit',
        day: '2-digit'
      });
    }
  };

  const getStatusBadge = (active: boolean) => (
    <span 
      style={{
        padding: '2px 6px',
        borderRadius: '4px',
        fontSize: '11px',
        fontWeight: '500',
        background: active ? '#DCFCE7' : '#FEF2F2',
        color: active ? '#166534' : '#DC2626'
      }}
    >
      {active ? '激活' : '禁用'}
    </span>
  );

  const getSubscriptionBadge = (status: string) => {
    if (!status || status === '-') return '-';
    const isActive = status === 'active';
    return (
      <span 
        style={{
          padding: '2px 6px',
          borderRadius: '4px',
          fontSize: '11px',
          fontWeight: '500',
          background: isActive ? '#DBEAFE' : '#F3F4F6',
          color: isActive ? '#1D4ED8' : '#6B7280'
        }}
      >
        {isActive ? '付费' : status}
      </span>
    );
  };

  return (
    <div style={{ 
      minHeight: '100vh',
      background: 'var(--bg-page)',
      padding: '24px 16px'
    }}>
      <div style={{ width: '100%', maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div className="header-center" style={{ marginBottom: '32px' }}>
          <h1 className="title">Admin · 用户计费管理</h1>
          <p className="subtitle">管理用户激活状态和订阅信息</p>
        </div>

        {/* Main Control Card */}
        <div className="card" style={{ marginBottom: '24px' }}>
          <div style={{ display: 'grid', gap: '20px' }}>
            <div>
              <label style={{ 
                display: 'block', 
                fontSize: '14px', 
                fontWeight: '500',
                color: 'var(--text)',
                marginBottom: '8px' 
              }}>
                用户邮箱
              </label>
              <input
                className="input-login"
                placeholder="输入用户邮箱地址"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ width: '100%' }}
              />
              <div style={{ height: 12 }} />
              <label style={{ 
                display: 'block', 
                fontSize: '14px', 
                fontWeight: '500',
                color: 'var(--text)',
                marginBottom: '8px' 
              }}>
                手机号码（国际区号纯数字）
              </label>
              <input
                className="input-login"
                placeholder="如 60123456789"
                value={phoneNew}
                onChange={(e) => setPhoneNew(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', 
              gap: '12px'
            }}>
              <button 
                className="btn-secondary"
                disabled={loading || !email.trim()} 
                onClick={() => callAPI({ email })}
              >
                {loading ? '...' : '查看状态'}
              </button>
              <button 
                className="btn-premium"
                disabled={loading || !email.trim()} 
                onClick={() => callAPI({ email, active: true })}
                style={{ height: '48px' }}
              >
                {loading ? '...' : '设为激活'}
              </button>
              <button 
                className="btn-dark"
                disabled={loading || !email.trim()} 
                onClick={() => callAPI({ email, active: false })}
              >
                {loading ? '...' : '设为未激活'}
              </button>
              <button 
                className="btn-secondary"
                disabled={loading || !email.trim()}
                onClick={updateUserPhone}
              >
                {loading ? '...' : '更新手机号'}
              </button>
              <button
                className="btn-secondary"
                disabled={loading}
                onClick={async () => {
                  setLoading(true);
              try {
                // 获取用户列表
                const res = await fetch('/api/admin/users-list?include_stripe=1', {
                  headers: { 'x-admin-token': token || '' },
                });
                const json = await res.json();
                if (!res.ok) throw new Error(json?.error || 'Request failed');
                setUsers(json.users || []);
                
                // 获取使用统计
                const statsRes = await fetch('/api/admin/usage-stats', {
                  headers: { 'x-admin-token': token || '' },
                });
                const statsJson = await statsRes.json();
                if (statsRes.ok) {
                  setUsageStats(statsJson.stats || {});
                }
              } catch (e: any) {
                setStatus(`Error: ${e.message}`);
              } finally {
                setLoading(false);
              }
                }}
              >
                {loading ? '加载中...' : '列出所有用户'}
              </button>
            </div>
          </div>
        </div>

        {/* Status Display Card */}
        {status && (
          <div className="card" style={{ marginBottom: '24px' }}>
            <h3 style={{ 
              margin: '0 0 16px 0', 
              fontSize: '16px', 
              fontWeight: '600',
              color: 'var(--text)'
            }}>
              操作结果
            </h3>
            <div style={{
              background: status.startsWith('✅') ? '#F0FDF4' : status.startsWith('❌') ? '#FEF2F2' : 'var(--bg-soft)',
              border: `1px solid ${status.startsWith('✅') ? '#BBF7D0' : status.startsWith('❌') ? '#FECACA' : 'var(--border)'}`,
              borderRadius: '12px',
              padding: '16px',
              fontSize: '14px',
              color: status.startsWith('✅') ? '#166534' : status.startsWith('❌') ? '#DC2626' : 'var(--text)',
              fontWeight: status.startsWith('✅') || status.startsWith('❌') ? '500' : 'normal',
              fontFamily: status.startsWith('✅') || status.startsWith('❌') ? 'inherit' : 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all'
            }}>
              {status}
            </div>
          </div>
        )}

        {/* Users Table */}
        {users.length > 0 && (
          <div className="card">
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '20px' 
            }}>
              <h3 style={{ 
                margin: 0, 
                fontSize: '18px', 
                fontWeight: '600',
                color: 'var(--text)'
              }}>
                用户列表
              </h3>
              <span style={{ 
                fontSize: '14px', 
                color: 'var(--text-muted)',
                background: 'var(--bg-soft)',
                padding: '4px 12px',
                borderRadius: '20px'
              }}>
                总共 {users.length} 个用户
              </span>
            </div>
            
            <div style={{ 
              border: '1px solid var(--border)',
              borderRadius: '12px'
            }}>
              <table style={{ 
                width: '100%', 
                borderCollapse: 'collapse',
                background: 'white',
                fontSize: '13px'
              }}>
                <thead>
                  <tr style={{ background: 'var(--bg-soft)' }}>
                    <th style={{ 
                      textAlign: 'left', 
                      padding: '12px 8px',
                      fontSize: '13px',
                      fontWeight: '600',
                      color: 'var(--text)',
                      borderBottom: '1px solid var(--border)',
                      width: '25%'
                    }}>邮箱</th>
                    <th style={{ 
                      textAlign: 'center', 
                      padding: '12px 6px',
                      fontSize: '13px',
                      fontWeight: '600',
                      color: 'var(--text)',
                      borderBottom: '1px solid var(--border)',
                      width: '8%'
                    }}>手机号</th>
                    <th style={{ 
                      textAlign: 'center', 
                      padding: '12px 6px',
                      fontSize: '13px',
                      fontWeight: '600',
                      color: 'var(--text)',
                      borderBottom: '1px solid var(--border)',
                      width: '12%'
                    }}>创建</th>
                    <th style={{ 
                      textAlign: 'center', 
                      padding: '12px 6px',
                      fontSize: '13px',
                      fontWeight: '600',
                      color: 'var(--text)',
                      borderBottom: '1px solid var(--border)',
                      width: '12%'
                    }}>最后登陆</th>
                    <th style={{ 
                      textAlign: 'center', 
                      padding: '12px 6px',
                      fontSize: '13px',
                      fontWeight: '600',
                      color: 'var(--text)',
                      borderBottom: '1px solid var(--border)',
                      width: '8%'
                    }}>状态</th>
                    <th style={{ 
                      textAlign: 'center', 
                      padding: '12px 6px',
                      fontSize: '13px',
                      fontWeight: '600',
                      color: 'var(--text)',
                      borderBottom: '1px solid var(--border)',
                      width: '10%'
                    }}>订阅</th>
                    <th style={{ 
                      textAlign: 'center', 
                      padding: '12px 6px',
                      fontSize: '13px',
                      fontWeight: '600',
                      color: 'var(--text)',
                      borderBottom: '1px solid var(--border)',
                      width: '12%'
                    }}>到期</th>
                    <th style={{ 
                      textAlign: 'center', 
                      padding: '12px 6px',
                      fontSize: '13px',
                      fontWeight: '600',
                      color: 'var(--text)',
                      borderBottom: '1px solid var(--border)',
                      width: '8%'
                    }}>使用次数</th>
                    <th style={{ 
                      textAlign: 'center', 
                      padding: '12px 8px',
                      fontSize: '13px',
                      fontWeight: '600',
                      color: 'var(--text)',
                      borderBottom: '1px solid var(--border)',
                      width: '13%'
                    }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, index) => (
                    <tr key={u.id} style={{ 
                      background: index % 2 === 0 ? 'white' : 'var(--bg-page)' 
                    }}>
                      <td style={{ 
                        padding: '12px 8px',
                        fontSize: '13px',
                        color: 'var(--text)',
                        borderBottom: '1px solid var(--divider)',
                        fontWeight: '500',
                        maxWidth: '200px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }} title={u.email}>{u.email}</td>
                      <td style={{ 
                        padding: '12px 6px',
                        fontSize: '12px',
                        color: 'var(--text)',
                        borderBottom: '1px solid var(--divider)',
                        textAlign: 'center'
                      }}>{u.phone || '-'}</td>
                      <td style={{ 
                        padding: '12px 6px',
                        fontSize: '12px',
                        color: 'var(--text-muted)',
                        borderBottom: '1px solid var(--divider)',
                        textAlign: 'center'
                      }}>{formatDateTime(u.created_at)}</td>
                      <td style={{ 
                        padding: '12px 6px',
                        fontSize: '12px',
                        color: u.last_sign_in_at ? 'var(--text-muted)' : '#9CA3AF',
                        borderBottom: '1px solid var(--divider)',
                        textAlign: 'center',
                        fontWeight: u.last_sign_in_at ? 'normal' : '500'
                      }}>{formatLastSignIn(u.last_sign_in_at)}</td>
                      <td style={{ 
                        padding: '12px 6px',
                        borderBottom: '1px solid var(--divider)',
                        textAlign: 'center'
                      }}>{getStatusBadge(u.active)}</td>
                      <td style={{ 
                        padding: '12px 6px',
                        borderBottom: '1px solid var(--divider)',
                        textAlign: 'center'
                      }}>{getSubscriptionBadge(u.subscription_status)}</td>
                      <td style={{ 
                        padding: '12px 6px',
                        fontSize: '12px',
                        color: 'var(--text-muted)',
                        borderBottom: '1px solid var(--divider)',
                        textAlign: 'center'
                      }}>
                        {u.current_period_end ? new Date(u.current_period_end * 1000).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) : '-'}
                      </td>
                      <td style={{ 
                        padding: '12px 6px',
                        fontSize: '12px',
                        color: 'var(--text)',
                        borderBottom: '1px solid var(--divider)',
                        textAlign: 'center',
                        fontWeight: '600'
                      }}>
                        <span style={{
                          background: (usageStats[u.email] || 0) > 0 ? 'var(--bg-soft)' : '#f3f4f6',
                          color: (usageStats[u.email] || 0) > 0 ? 'var(--brand)' : 'var(--text-muted)',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: '500'
                        }}>
                          {usageStats[u.email] || 0}
                        </span>
                      </td>
                      <td style={{ 
                        padding: '8px',
                        borderBottom: '1px solid var(--divider)',
                        textAlign: 'center'
                      }}>
                        <div style={{ display: 'flex', gap: '3px', justifyContent: 'center' }}>
                          <button 
                            disabled={loading}
                            onClick={() => callAPI({ email: u.email, active: true }, true)}
                            style={{
                              padding: '4px 6px',
                              fontSize: '11px',
                              fontWeight: '500',
                              border: '1px solid var(--brand)',
                              borderRadius: '4px',
                              background: u.active ? 'var(--brand)' : 'white',
                              color: u.active ? 'white' : 'var(--brand)',
                              cursor: loading ? 'not-allowed' : 'pointer',
                              opacity: loading ? 0.6 : 1,
                              transition: 'all 0.2s'
                            }}
                          >
                            激活
                          </button>
                          <button 
                            disabled={loading}
                            onClick={() => callAPI({ email: u.email, active: false }, true)}
                            style={{
                              padding: '4px 6px',
                              fontSize: '11px',
                              fontWeight: '500',
                              border: '1px solid #DC2626',
                              borderRadius: '4px',
                              background: !u.active ? '#DC2626' : 'white',
                              color: !u.active ? 'white' : '#DC2626',
                              cursor: loading ? 'not-allowed' : 'pointer',
                              opacity: loading ? 0.6 : 1,
                              transition: 'all 0.2s'
                            }}
                          >
                            禁用
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


