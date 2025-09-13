import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

async function setUserActiveByEmail(email: string, active: boolean) {
  const url = getEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const admin = createSupabaseClient(url, serviceKey);

  // find user by email via Auth Admin API
  let page = 1;
  const perPage = 1000;
  let target: any = null;
  while (!target) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return { ok: false, reason: 'list_failed' } as const;
    target = (data?.users || []).find(u => (u.email || '').toLowerCase() === email.toLowerCase());
    const total = data?.total || 0;
    if (target || page * perPage >= total) break;
    page++;
  }
  if (!target?.id) return { ok: false, reason: 'user_not_found' } as const;

  const { error: updErr } = await admin.auth.admin.updateUserById(target.id, { app_metadata: { active } });
  if (updErr) return { ok: false, reason: 'update_failed' } as const;
  return { ok: true } as const;
}

export async function POST(req: NextRequest) {
  const secret = process.env.WEBHOOK_TEST_SECRET || '';
  if (!secret) return NextResponse.json({ error: 'Not enabled' }, { status: 403 });
  const provided = req.headers.get('x-test-secret') || '';
  if (provided !== secret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const email = (body?.email || '').toString().trim();
  const active = Boolean(body?.active);
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });

  const res = await setUserActiveByEmail(email, active);
  if (!res.ok) return NextResponse.json({ updated: false, reason: res.reason }, { status: 400 });
  return NextResponse.json({ updated: true, email, active });
}


