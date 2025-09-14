import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

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

  const includeStripe = req.nextUrl.searchParams.get('include_stripe') === '1';
  const stripe = includeStripe ? new Stripe(getEnv('STRIPE_SECRET_KEY')) : null as unknown as Stripe | null;

  let page = 1;
  const perPage = 1000;
  const rows: any[] = [];
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const list = data?.users || [];
    for (const u of list) {
      let subscription_status: string | null = null;
      let current_period_end: number | null = null;
      if (includeStripe && stripe && u.email) {
        try {
          const custs = await stripe.customers.list({ email: u.email, limit: 1 });
          const cust = custs.data?.[0];
          if (cust) {
            const subs = await stripe.subscriptions.list({ customer: cust.id, status: 'all', limit: 1 });
            const sub = subs.data?.[0];
            if (sub) {
              subscription_status = sub.status;
              current_period_end = sub.current_period_end || null;
            }
          }
        } catch {}
      }

      rows.push({
        id: u.id,
        email: u.email,
        phone: (u.user_metadata as any)?.phone || null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        active: Boolean((u.app_metadata as any)?.active),
        subscription_status,
        current_period_end,
      });
    }
    const total = data?.total || 0;
    if (page * perPage >= total) break;
    page++;
  }

  return NextResponse.json({ users: rows });
}


