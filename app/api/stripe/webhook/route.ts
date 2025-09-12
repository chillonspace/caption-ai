import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

async function getEmailFromStripe(stripe: Stripe, event: Stripe.Event): Promise<string | null> {
  try {
    const type = event.type;
    const data: any = event.data?.object as any;
    if (!data) return null;

    // checkout.session.completed
    if (type === 'checkout.session.completed') {
      return data?.customer_details?.email || data?.customer_email || null;
    }

    // invoice events may include email directly
    if (type.startsWith('invoice.')) {
      if (data?.customer_email) return data.customer_email as string;
      if (data?.customer) {
        const cust = await stripe.customers.retrieve(data.customer as string);
        // @ts-expect-error Stripe types allow string|null
        return (cust as any)?.email ?? null;
      }
      return null;
    }

    // subscription events → need to fetch customer to read email
    if (type.startsWith('customer.subscription.')) {
      if (data?.customer) {
        const cust = await stripe.customers.retrieve(data.customer as string);
        // @ts-expect-error Stripe types allow string|null
        return (cust as any)?.email ?? null;
      }
      return null;
    }

    return null;
  } catch {
    return null;
  }
}

async function setUserActiveByEmail(email: string, active: boolean) {
  const url = getEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const admin = createSupabaseClient(url, serviceKey);

  // 1) find user by email via Auth Admin API (no need to expose auth schema)
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) return { ok: false, reason: 'list_failed' } as const;
  const target = (list?.users || []).find(u => (u.email || '').toLowerCase() === email.toLowerCase());
  if (!target?.id) return { ok: false, reason: 'user_not_found' } as const;

  // 2) update app_metadata.active via Auth Admin API
  const { error: updErr } = await admin.auth.admin.updateUserById(target.id, {
    app_metadata: { active },
  });
  if (updErr) return { ok: false, reason: 'update_failed' } as const;
  return { ok: true } as const;
}

export async function POST(req: NextRequest) {
  const stripe = new Stripe(getEnv('STRIPE_SECRET_KEY'));
  const webhookSecret = getEnv('STRIPE_WEBHOOK_SECRET');

  let payload: Buffer;
  try {
    const raw = await req.arrayBuffer();
    payload = Buffer.from(raw);
  } catch (e) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, sig, webhookSecret);
  } catch (err: unknown) {
    return NextResponse.json({ error: 'Signature verification failed', detail: (err as Error)?.message }, { status: 400 });
  }

  const type = event.type;
  let shouldActivate: boolean | null = null;

  if (type === 'checkout.session.completed') {
    shouldActivate = true;
  } else if (type === 'customer.subscription.created' || type === 'customer.subscription.updated') {
    // activate when status is trialing or active
    const obj: any = event.data.object as any;
    const status = (obj?.status || '').toString();
    if (status === 'trialing' || status === 'active') shouldActivate = true;
    if (status === 'canceled' || status === 'unpaid' || status === 'incomplete_expired') shouldActivate = false;
  } else if (type === 'customer.subscription.deleted') {
    shouldActivate = false;
  } else if (type === 'invoice.payment_succeeded') {
    shouldActivate = true;
  } else if (type === 'invoice.payment_failed') {
    shouldActivate = false;
  }

  // Only proceed when we know what to do
  if (shouldActivate === null) {
    return NextResponse.json({ received: true, ignored: true });
  }

  // derive email from event, with optional override for testing
  let email = await getEmailFromStripe(stripe, event);
  try {
    const enableOverride = String(process.env.ENABLE_WEBHOOK_OVERRIDE || '').toLowerCase() === 'true';
    if (enableOverride) {
      const qp = req.nextUrl.searchParams;
      const secretParam = qp.get('secret');
      const overrideSecret = process.env.WEBHOOK_OVERRIDE_SECRET || '';
      const overrideEmail = qp.get('override_email');
      if (overrideEmail && secretParam && overrideSecret && secretParam === overrideSecret) {
        email = overrideEmail;
      }
    }
  } catch {}
  if (!email) {
    return NextResponse.json({ received: true, no_email: true });
  }

  const res = await setUserActiveByEmail(email, shouldActivate);
  if (!res.ok) {
    return NextResponse.json({ received: true, updated: false, reason: res.reason });
  }
  return NextResponse.json({ received: true, updated: true });
}


