import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServer } from '@/lib/supabase/server';
import { createAdminClient, getEnv } from '@/lib/admin-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // Auth: must be logged-in user
    const sb = createServer();
    const { data: { user } } = await sb.auth.getUser();
    if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Read app metadata for min_cancel_date and subscription id (optional)
    const admin = createAdminClient();
    const u = await admin.auth.admin.getUserById(user.id);
    const meta: any = u.data?.user?.app_metadata || {};
    const nowSec = Math.floor(Date.now() / 1000);
    const minCancelSec = Number(meta.min_cancel_date || 0);
    if (minCancelSec && nowSec < minCancelSec) {
      return NextResponse.json({ allowed: false, message: `可在 ${new Date(minCancelSec * 1000).toLocaleDateString('zh-CN')} 后取消` }, { status: 403 });
    }

    const stripe = new Stripe(getEnv('STRIPE_SECRET_KEY'));

    // Find customer's active subscription by email
    const custs = await stripe.customers.list({ email: user.email, limit: 1 });
    const cust = custs.data?.[0];
    if (!cust) return NextResponse.json({ error: 'Stripe customer not found' }, { status: 404 });
    const subs = await stripe.subscriptions.list({ customer: cust.id, status: 'active', limit: 1 });
    const sub = subs.data?.[0];
    if (!sub) return NextResponse.json({ error: 'Active subscription not found' }, { status: 404 });

    await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
    return NextResponse.json({ allowed: true, message: '已提交取消，本账期结束后生效' });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Request failed' }, { status: 500 });
  }
}


