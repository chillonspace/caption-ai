import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getEnv, setUserActiveByEmail, createAdminClient, findUserByEmail } from '@/lib/admin-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
        return (cust as any)?.email ?? null;
      }
      return null;
    }

    // subscription events → need to fetch customer to read email
    if (type.startsWith('customer.subscription.')) {
      if (data?.customer) {
        const cust = await stripe.customers.retrieve(data.customer as string);
        return (cust as any)?.email ?? null;
      }
      return null;
    }

    return null;
  } catch {
    return null;
  }
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

  // Derive email first (used for trial rule)
  let email = await getEmailFromStripe(stripe, event);

  // Read trial flags from our DB (Supabase app_metadata)
  let trialUsed = false;
  let trialStartedAtSec: number | null = null; // unix seconds
  let userIdToUpdate: string | null = null;
  try {
    if (email) {
      const u: any = await findUserByEmail(email);
      if (u) {
        userIdToUpdate = u.id as string;
        trialUsed = Boolean((u.app_metadata || {}).trial_used);
        const tsa = (u.app_metadata || {}).trial_started_at;
        if (typeof tsa === 'number') trialStartedAtSec = tsa;
      }
    }
  } catch {}

  // Compute 14-day window based on first subscription time
  const TRIAL_DAYS = 14;
  const nowSec = Math.floor(Date.now() / 1000);
  const inWindow = trialStartedAtSec != null && nowSec < (trialStartedAtSec + TRIAL_DAYS * 24 * 60 * 60);

  // Decide activation with trial rule
  if (type === 'checkout.session.completed') {
    // First subscription checkout completes → start trial window if not set
    if (!trialStartedAtSec && userIdToUpdate) {
      try {
        const admin = createAdminClient();
        await admin.auth.admin.updateUserById(userIdToUpdate, { app_metadata: { trial_started_at: nowSec, trial_used: true } });
        trialStartedAtSec = nowSec;
      } catch {}
    }
    // Within 14-day window → activate；otherwise wait for payment success
    shouldActivate = (trialStartedAtSec && (nowSec < trialStartedAtSec + TRIAL_DAYS * 24 * 60 * 60)) ? true : false;
  } else if (type === 'customer.subscription.created' || type === 'customer.subscription.updated') {
    const obj: any = event.data.object as any;
    const status = (obj?.status || '').toString();
    if (!trialStartedAtSec && (status === 'trialing' || status === 'active') && userIdToUpdate) {
      // First time we see a subscription → start trial window
      try {
        const admin = createAdminClient();
        await admin.auth.admin.updateUserById(userIdToUpdate, { app_metadata: { trial_started_at: nowSec, trial_used: true } });
        trialStartedAtSec = nowSec;
      } catch {}
    }
    if (status === 'trialing') {
      // Activate during the window; otherwise do not auto-activate
      shouldActivate = (trialStartedAtSec && (nowSec < trialStartedAtSec + TRIAL_DAYS * 24 * 60 * 60)) ? true : false;
    } else if (status === 'active') {
      shouldActivate = true;
    } else if (status === 'canceled' || status === 'unpaid' || status === 'incomplete_expired') {
      // If inside trial window, keep active; else disable
      shouldActivate = (trialStartedAtSec && (nowSec < trialStartedAtSec + TRIAL_DAYS * 24 * 60 * 60)) ? true : false;
    }
  } else if (type === 'customer.subscription.deleted') {
    // If inside trial window, keep active; else disable
    shouldActivate = (trialStartedAtSec && (nowSec < trialStartedAtSec + TRIAL_DAYS * 24 * 60 * 60)) ? true : false;
  } else if (type === 'invoice.payment_succeeded') {
    shouldActivate = true;
  } else if (type === 'invoice.payment_failed') {
    shouldActivate = false;
  }

  // Only proceed when we know what to do
  if (shouldActivate === null) {
    return NextResponse.json({ received: true, ignored: true });
  }

  // derive email from event (already resolved above), with optional override for testing
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


// noop: trigger redeploy
