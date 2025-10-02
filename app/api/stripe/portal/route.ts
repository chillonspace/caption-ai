import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getEnv } from '@/lib/admin-utils';
import { createServer } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const sb = createServer();
    const { data: { user } } = await sb.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const stripe = new Stripe(getEnv('STRIPE_SECRET_KEY'));

    // Find Stripe customer by email
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    const customer = customers.data?.[0];
    if (!customer) {
      return NextResponse.json({ error: 'Stripe customer not found' }, { status: 404 });
    }

    const origin = req.nextUrl.origin;
    const session = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: `${origin}/caption`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to create portal session' }, { status: 500 });
  }
}


