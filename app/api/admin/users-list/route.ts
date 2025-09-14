import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { validateAdminToken, createAdminClient, getEnv } from '@/lib/admin-utils';
import { API_PAGINATION } from '@/lib/constants';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const providedToken = req.headers.get('x-admin-token') || '';
  if (!validateAdminToken(providedToken)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  const includeStripe = req.nextUrl.searchParams.get('include_stripe') === '1';
  const stripe = includeStripe ? new Stripe(getEnv('STRIPE_SECRET_KEY')) : null as unknown as Stripe | null;

  let page = 1;
  const perPage = API_PAGINATION.DEFAULT_PAGE_SIZE;
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


