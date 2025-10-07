import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/admin-utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// This endpoint now accepts either a short code OR a phone number (MSISDN).

function normalizeMsisdn(raw: string): string | null {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('0') && !digits.startsWith('60')) {
    return `60${digits.slice(1)}`;
  }
  return digits;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const code = String(params?.code || '').trim();
    if (!code) return NextResponse.json({ error: 'Invalid code' }, { status: 400 });

    // If param itself looks like a phone number, use directly
    let msisdn = normalizeMsisdn(code);
    if (!msisdn) {
      // else try to lookup by short code → resolve to user's phone
      const secret = String(process.env.SHORTLINK_SECRET || '').trim();
      if (!secret) return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
      const admin = createAdminClient();
      let page = 1;
      const perPage = 1000;
      let phone: string | null = null;
      while (true) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        const list = data?.users || [];
        for (const u of list) {
          const meta = (u.user_metadata as any) || {};
          const p = normalizeMsisdn(String(meta.phone || ''));
          if (!p) continue;
          // backward compatible: accept 8-char legacy short code derived elsewhere
          const alias = String(meta.wa_alias || '').trim();
          if (alias && alias === code) { phone = p; break; }
        }
        if (phone) { msisdn = phone; break; }
        const total = data?.total || 0;
        if (page * perPage >= total) break;
        page++;
      }
      if (!msisdn) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Constant, exact-encoded trigger text provided by product owner
    const TRIGGER_ENC = 'Hi%2C%20I%E2%80%99m%20interested%20in%20your%2010secHerb%20product.';
    const waUrl = `https://wa.me/${msisdn}?text=${TRIGGER_ENC}`;
    return NextResponse.redirect(waUrl, 302);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}


