import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

async function findUserByEmail(admin: ReturnType<typeof createSupabaseClient>, email: string) {
  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const list = data?.users || [];
    const found = list.find((u: any) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (found) return found;
    const total = data?.total || 0;
    if (page * perPage >= total) return null;
    page++;
  }
}

export async function POST(req: NextRequest) {
  const adminToken = process.env.ADMIN_API_TOKEN || '';
  const provided = req.headers.get('x-admin-token') || '';
  if (!adminToken || provided !== adminToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const email = String(body.email || '').trim();
  const hasActive = Object.prototype.hasOwnProperty.call(body, 'active');
  const desiredActive: boolean | null = hasActive ? Boolean(body.active) : null;
  if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 });

  const url = getEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const admin = createSupabaseClient(url, serviceKey);

  const user = await findUserByEmail(admin, email);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // GET status only
  if (desiredActive === null) {
    const current = Boolean((user.app_metadata || {}).active);
    return NextResponse.json({ email, active: current });
  }

  // SET status
  const newAppMeta = { ...(user.app_metadata || {}), active: desiredActive } as Record<string, any>;
  const { error: updErr } = await admin.auth.admin.updateUserById(user.id, { app_metadata: newAppMeta });
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  return NextResponse.json({ email, updated: true, active: desiredActive });
}


