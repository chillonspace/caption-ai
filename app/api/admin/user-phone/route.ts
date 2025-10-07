import { NextRequest, NextResponse } from 'next/server';
import { validateAdminToken, createAdminClient } from '@/lib/admin-utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const providedToken = req.headers.get('x-admin-token') || '';
  if (!validateAdminToken(providedToken)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let email: string = '';
  let phone: string = '';
  try {
    const body = await req.json();
    email = String(body?.email || '').trim();
    phone = String(body?.phone || '').trim();
    if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    // find user
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const user = (data?.users || []).find(u => (u.email || '').toLowerCase() === email.toLowerCase());
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const meta = { ...(user.user_metadata as any), phone };
    const { error: updErr } = await admin.auth.admin.updateUserById(user.id, { user_metadata: meta });
    if (updErr) return NextResponse.json({ error: updErr.message || 'Update failed' }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}


