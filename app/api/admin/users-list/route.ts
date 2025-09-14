import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function GET(req: NextRequest) {
  const adminToken = process.env.ADMIN_API_TOKEN || '';
  const provided = req.headers.get('x-admin-token') || '';
  if (!adminToken || provided !== adminToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = getEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const admin = createSupabaseClient(url, serviceKey);

  let page = 1;
  const perPage = 1000;
  const rows: any[] = [];
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const list = data?.users || [];
    for (const u of list) {
      rows.push({
        id: u.id,
        email: u.email,
        phone: (u.user_metadata as any)?.phone || null,
        created_at: u.created_at,
        active: Boolean((u.app_metadata as any)?.active),
      });
    }
    const total = data?.total || 0;
    if (page * perPage >= total) break;
    page++;
  }

  return NextResponse.json({ users: rows });
}


