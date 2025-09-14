"use client";
import { useEffect, useState } from 'react';

export default function AdminBillingPage() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<any[]>([]);

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

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatLastSignIn = (dateStr: string) => {
    if (!dateStr) return '从未登陆';
    const lastSignIn = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - lastSignIn.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return '今天 ' + lastSignIn.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return '昨天 ' + lastSignIn.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays < 7) {
      return `${diffDays}天前`;
    } else {
      return lastSignIn.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  };

  const getStatusBadge = (active: boolean) => (
    <span 
      style={{
        padding: '4px 8px',
        borderRadius: '6px',
        fontSize: '12px',
        fontWeight: '500',
        background: active ? '#DCFCE7' : '#FEF2F2',
        color: active ? '#166534' : '#DC2626'
      }}
    >
      {active ? '已激活' : '未激活'}
    </span>
  );

  const getSubscriptionBadge = (status: string) => {
    if (!status || status === '-') return '-';
    const isActive = status === 'active';
    return (
      <span 
        style={{
          padding: '4px 8px',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: '500',
          background: isActive ? '#DBEAFE' : '#F3F4F6',
          color: isActive ? '#1D4ED8' : '#6B7280'
        }}
      >
        {status}
      </span>
    );
  };

  return (
    <div style={{ 
      minHeight: '100vh',
      background: 'var(--bg-page)',
      padding: '24px 16px'
    }}>
      <div className="container-narrow">
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
                disabled={loading}
                onClick={async () => {
                  setLoading(true);
                  try {
                    const res = await fetch('/api/admin/users-list?include_stripe=1', {
                      headers: { 'x-admin-token': token || '' },
                    });
                    const json = await res.json();
                    if (!res.ok) throw new Error(json?.error || 'Request failed');
                    setUsers(json.users || []);
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
              overflowX: 'auto',
              border: '1px solid var(--border)',
              borderRadius: '12px'
            }}>
              <table style={{ 
                width: '100%', 
                borderCollapse: 'collapse',
                background: 'white'
              }}>
                <thead>
                  <tr style={{ background: 'var(--bg-soft)' }}>
                    <th style={{ 
                      textAlign: 'left', 
                      padding: '16px 12px',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: 'var(--text)',
                      borderBottom: '1px solid var(--border)'
                    }}>邮箱</th>
                    <th style={{ 
                      textAlign: 'left', 
                      padding: '16px 12px',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: 'var(--text)',
                      borderBottom: '1px solid var(--border)'
                    }}>手机</th>
                    <th style={{ 
                      textAlign: 'left', 
                      padding: '16px 12px',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: 'var(--text)',
                      borderBottom: '1px solid var(--border)'
                    }}>创建时间</th>
                    <th style={{ 
                      textAlign: 'left', 
                      padding: '16px 12px',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: 'var(--text)',
                      borderBottom: '1px solid var(--border)'
                    }}>最后登陆</th>
                    <th style={{ 
                      textAlign: 'left', 
                      padding: '16px 12px',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: 'var(--text)',
                      borderBottom: '1px solid var(--border)'
                    }}>激活状态</th>
                    <th style={{ 
                      textAlign: 'left', 
                      padding: '16px 12px',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: 'var(--text)',
                      borderBottom: '1px solid var(--border)'
                    }}>订阅状态</th>
                    <th style={{ 
                      textAlign: 'left', 
                      padding: '16px 12px',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: 'var(--text)',
                      borderBottom: '1px solid var(--border)'
                    }}>订阅到期</th>
                    <th style={{ 
                      textAlign: 'center', 
                      padding: '16px 12px',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: 'var(--text)',
                      borderBottom: '1px solid var(--border)',
                      width: '160px'
                    }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, index) => (
                    <tr key={u.id} style={{ 
                      background: index % 2 === 0 ? 'white' : 'var(--bg-page)' 
                    }}>
                      <td style={{ 
                        padding: '16px 12px',
                        fontSize: '14px',
                        color: 'var(--text)',
                        borderBottom: '1px solid var(--divider)',
                        fontWeight: '500'
                      }}>{u.email}</td>
                      <td style={{ 
                        padding: '16px 12px',
                        fontSize: '14px',
                        color: 'var(--text-muted)',
                        borderBottom: '1px solid var(--divider)'
                      }}>{u.phone || '-'}</td>
                      <td style={{ 
                        padding: '16px 12px',
                        fontSize: '14px',
                        color: 'var(--text-muted)',
                        borderBottom: '1px solid var(--divider)'
                      }}>{formatDateTime(u.created_at)}</td>
                      <td style={{ 
                        padding: '16px 12px',
                        fontSize: '14px',
                        color: u.last_sign_in_at ? 'var(--text-muted)' : '#9CA3AF',
                        borderBottom: '1px solid var(--divider)',
                        fontWeight: u.last_sign_in_at ? 'normal' : '500'
                      }}>{formatLastSignIn(u.last_sign_in_at)}</td>
                      <td style={{ 
                        padding: '16px 12px',
                        borderBottom: '1px solid var(--divider)'
                      }}>{getStatusBadge(u.active)}</td>
                      <td style={{ 
                        padding: '16px 12px',
                        borderBottom: '1px solid var(--divider)'
                      }}>{getSubscriptionBadge(u.subscription_status)}</td>
                      <td style={{ 
                        padding: '16px 12px',
                        fontSize: '14px',
                        color: 'var(--text-muted)',
                        borderBottom: '1px solid var(--divider)'
                      }}>
                        {u.current_period_end ? new Date(u.current_period_end * 1000).toLocaleString('zh-CN') : '-'}
                      </td>
                      <td style={{ 
                        padding: '12px',
                        borderBottom: '1px solid var(--divider)',
                        textAlign: 'center'
                      }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button 
                            disabled={loading}
                            onClick={() => callAPI({ email: u.email, active: true }, true)}
                            style={{
                              padding: '6px 10px',
                              fontSize: '12px',
                              fontWeight: '500',
                              border: '1px solid var(--brand)',
                              borderRadius: '6px',
                              background: u.active ? 'var(--brand)' : 'white',
                              color: u.active ? 'white' : 'var(--brand)',
                              cursor: loading ? 'not-allowed' : 'pointer',
                              opacity: loading ? 0.6 : u.active ? 1 : 0.8,
                              transition: 'all 0.2s',
                              boxShadow: u.active ? '0 2px 4px rgba(27,127,93,0.3)' : 'none'
                            }}
                          >
                            激活
                          </button>
                          <button 
                            disabled={loading}
                            onClick={() => callAPI({ email: u.email, active: false }, true)}
                            style={{
                              padding: '6px 10px',
                              fontSize: '12px',
                              fontWeight: '500',
                              border: '1px solid #DC2626',
                              borderRadius: '6px',
                              background: !u.active ? '#DC2626' : 'white',
                              color: !u.active ? 'white' : '#DC2626',
                              cursor: loading ? 'not-allowed' : 'pointer',
                              opacity: loading ? 0.6 : !u.active ? 1 : 0.8,
                              transition: 'all 0.2s',
                              boxShadow: !u.active ? '0 2px 4px rgba(220,38,38,0.3)' : 'none'
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


