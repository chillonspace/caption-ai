import { NextRequest, NextResponse } from 'next/server';
import { validateAdminToken, findUserByEmail, createAdminClient } from '@/lib/admin-utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const providedToken = req.headers.get('x-admin-token') || '';
  if (!validateAdminToken(providedToken)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const email = String(body.email || '').trim();
  const phoneRaw = body.phone;
  const phone = typeof phoneRaw === 'string' ? phoneRaw.trim() : '';
  if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 });

  try {
    const user = await findUserByEmail(email);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const admin = createAdminClient();
    const newUserMeta = { ...(user.user_metadata || {}), phone } as Record<string, any>;

    const { error: updErr } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: newUserMeta,
    });
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    return NextResponse.json({ email, updated: true, phone });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


