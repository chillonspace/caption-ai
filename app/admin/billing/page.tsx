"use client";
import { useState } from 'react';

export default function AdminBillingPage() {
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<any[]>([]);

  async function callAPI(body: Record<string, any>) {
    setLoading(true);
    setStatus('');
    try {
      const res = await fetch('/api/admin/user-active', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': token,
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Request failed');
      setStatus(JSON.stringify(json));
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: '40px auto', padding: 16 }}>
      <h2>Admin · Billing</h2>
      <div style={{ display: 'grid', gap: 12 }}>
        <input
          placeholder="Admin token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          style={{ padding: 8, border: '1px solid #ccc', borderRadius: 6 }}
        />
        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: 8, border: '1px solid #ccc', borderRadius: 6 }}
        />

        <div style={{ display: 'flex', gap: 8 }}>
          <button disabled={loading} onClick={() => callAPI({ email })}>查看状态</button>
          <button disabled={loading} onClick={() => callAPI({ email, active: true })}>设为激活</button>
          <button disabled={loading} onClick={() => callAPI({ email, active: false })}>设为未激活</button>
          <button
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              try {
                const res = await fetch('/api/admin/users-list', {
                  headers: { 'x-admin-token': token },
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
          >列出所有用户</button>
        </div>

        <pre style={{ background: '#f7f7f7', padding: 12, borderRadius: 6, minHeight: 80 }}>
{status}
        </pre>

        {users.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Email</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Phone</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Created</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Active</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td style={{ borderBottom: '1px solid #eee', padding: 8 }}>{u.email}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 8 }}>{u.phone || '-'}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 8 }}>{u.created_at?.replace('T',' ').replace('Z','')}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 8 }}>{u.active ? 'true' : 'false'}</td>
                    <td style={{ borderBottom: '1px solid #eee', padding: 8 }}>
                      <button disabled={loading} onClick={() => callAPI({ email: u.email, active: true })}>设为激活</button>
                      <button disabled={loading} style={{ marginLeft: 8 }} onClick={() => callAPI({ email: u.email, active: false })}>设为未激活</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}


