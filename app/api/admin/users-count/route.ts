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

  let count = 0;
  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      return NextResponse.json({ error: 'List users failed', detail: error.message }, { status: 500 });
    }
    count += data?.users?.length || 0;
    const total = data?.total || 0;
    if (count >= total) break;
    page += 1;
  }

  return NextResponse.json({ count });
}


