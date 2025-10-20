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
      const tipDate = new Date(minCancelSec * 1000).toLocaleDateString('zh-CN');
      return NextResponse.json({ allowed: false, message: `当前方案享有 3 个月使用保障期，您可在 ${tipDate} 后随时申请取消 🤝` }, { status: 403 });
    }

    const stripe = new Stripe(getEnv('STRIPE_SECRET_KEY'));

    // Find customer's latest cancellable subscription by email (support trialing/active...)
    const custs = await stripe.customers.list({ email: user.email, limit: 1 });
    const cust = custs.data?.[0];
    if (!cust) return NextResponse.json({ error: '未找到对应的 Stripe 账户，请确认登录邮箱' }, { status: 404 });
    const subsAll = await stripe.subscriptions.list({ customer: cust.id, status: 'all', limit: 10 });
    const candidates = subsAll.data.filter(s => ['trialing','active','past_due','unpaid'].includes(String(s.status)));
    const sub = candidates[0];
    if (!sub) return NextResponse.json({ error: '当前账号暂无有效订阅，请确认登录邮箱是否正确，或稍后再试 🙏' }, { status: 404 });

    // 已安排取消
    if (sub.cancel_at_period_end || sub.cancel_at) {
      const endTs = Number(sub.cancel_at || sub.current_period_end || 0);
      const endDate = endTs ? new Date(endTs * 1000).toLocaleDateString('zh-CN') : '';
      return NextResponse.json({ allowed: true, message: `您的订阅已安排于 ${endDate} 结束，无需再次操作 😊` });
    }

    const updated = await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
    const effective = updated.current_period_end ? new Date(updated.current_period_end * 1000).toLocaleDateString('zh-CN') : '';
    return NextResponse.json({ allowed: true, message: `您的取消申请已提交，将于 ${effective} 生效。在此之前仍可正常使用服务 💚` });
  } catch (e: any) {
    return NextResponse.json({ error: '系统繁忙，请稍后再试；如多次失败，请联系我们的支持团队 💬' }, { status: 500 });
  }
}


