import { NextRequest, NextResponse } from 'next/server';
import { createServer } from '@/lib/supabase/server';
import Stripe from 'stripe';
import { getEnv } from '@/lib/admin-utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Aspect = '1:1' | '9:16';

function mapAspect(aspect: Aspect | string | undefined) {
  const a = (aspect || '1:1') as Aspect;
  if (a === '9:16') {
    return { width: 1024, height: 1820, label: '9:16' as const };
  }
  return { width: 1024, height: 1024, label: '1:1' as const };
}

function buildPrompt(input: { product?: string; caption?: string; style?: string }) {
  const product = String(input.product || '').trim();
  const caption = String(input.caption || '').trim();
  const style = String(input.style || '').trim();
  // 简单提取：取 #hashtags 与前几行名词短语
  const tags = Array.from(caption.matchAll(/#([\p{L}\p{N}_]+)/gu)).map((m) => m[1]).slice(0, 6);
  const firstLine = caption.split('\n').map((s) => s.trim()).find((s) => s.length > 0) || '';
  const base = [
    product && `product: ${product}`,
    style && `style: ${style}`,
    firstLine && `vibe: ${firstLine}`,
    tags.length > 0 && `tags: ${tags.join(', ')}`,
  ]
    .filter(Boolean)
    .join('; ');
  // 默认安全风格，避免人物肖像侵权等
  return `${base}; photography; soft natural light; realistic; brand-safe; no text overlay;`;
}

function placeholderUrl(width: number, height: number, seed?: string) {
  const s = seed || Math.random().toString(36).slice(2);
  return `https://picsum.photos/seed/${encodeURIComponent(s)}/${width}/${height}`;
}

export async function POST(req: NextRequest) {
  try {
    // 登录校验
    try {
      const sb = createServer();
      const { data: { user } } = await sb.auth.getUser();
      if (!user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      // 按订阅周期或自然月检查图片额度（默认 100，可用 IMAGE_MONTHLY_LIMIT 覆盖）
      try {
        const email = String(user.email).toLowerCase();
        const IMAGE_LIMIT = parseInt(String(process.env.IMAGE_MONTHLY_LIMIT || '100')) || 100;
        async function computeBucketKey(email: string): Promise<string> {
          try {
            const stripe = new Stripe(getEnv('STRIPE_SECRET_KEY'));
            const custs = await stripe.customers.list({ email, limit: 1 });
            const cust = custs.data?.[0];
            if (cust) {
              const subs = await stripe.subscriptions.list({ customer: cust.id, status: 'all', limit: 1 });
              const sub = subs.data?.[0];
              const start = Number(sub?.current_period_start || 0);
              const end = Number(sub?.current_period_end || 0);
              if (start > 0 && end > 0) return `cycle:${start}-${end}`;
            }
          } catch {}
          const d = new Date();
          const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
          return `month:${ym}`;
        }
        const bucketKey = await computeBucketKey(email);
        const monthlyFile = require('path').join(process.cwd(), 'data', 'usage-monthly.json');
        const fs2 = require('fs');
        let monthly: any = {};
        if (fs2.existsSync(monthlyFile)) {
          try { monthly = JSON.parse(fs2.readFileSync(monthlyFile, 'utf8')); } catch { monthly = {}; }
        }
        const used = Number(monthly?.[bucketKey]?.[email]?.images || 0);
        if (used >= IMAGE_LIMIT) {
          return NextResponse.json({ error: '本周期图片额度已用完', limit: IMAGE_LIMIT }, { status: 429 });
        }
        (globalThis as any).__incMonthlyImage = () => {
          try {
            const dir = require('path').dirname(monthlyFile);
            if (!fs2.existsSync(dir)) fs2.mkdirSync(dir, { recursive: true });
            if (!monthly[bucketKey]) monthly[bucketKey] = {};
            if (!monthly[bucketKey][email]) monthly[bucketKey][email] = { captions: 0, images: 0 };
            monthly[bucketKey][email].images = Number(monthly[bucketKey][email].images || 0) + 1;
            fs2.writeFileSync(monthlyFile, JSON.stringify(monthly, null, 2));
          } catch {}
        };
      } catch {}
    } catch (e: any) {
      return NextResponse.json({ error: 'Request failed', detail: `AUTH: ${String(e?.message || e)}` }, { status: 500 });
    }

    let body: any;
    try {
      body = await req.json();
    } catch (e: any) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const product = String(body?.product || '').trim();
    const caption = String(body?.caption || '').trim();
    const style = String(body?.style || '').trim();
    const aspectRaw = String(body?.aspect || '1:1');
    const seed = String(body?.seed || '').trim() || undefined;
    const aspect = (aspectRaw === '9:16' ? '9:16' : '1:1') as Aspect;
    const { width, height } = mapAspect(aspect);
    const prompt = buildPrompt({ product, caption, style });

    const FAL_KEY = (process.env.FAL_KEY || '').trim();
    const STABILITY_API_KEY = (process.env.STABILITY_API_KEY || '').trim();

    // 30s 超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    // Provider 1: fal.ai（若提供 FAL_KEY）
    async function tryFal() {
      if (!FAL_KEY) return null;
      try {
        const res = await fetch('https://fal.run/fal-ai/flux/dev', {
          method: 'POST',
          headers: {
            'Authorization': `Key ${FAL_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt,
            image_size: aspect === '1:1' ? 'square' : 'portrait_9_16',
            seed,
          }),
          signal: controller.signal,
        });
        if (!res.ok) return null;
        const data = await res.json();
        const url = data?.image?.url || data?.images?.[0]?.url || data?.result?.image?.url;
        if (typeof url === 'string' && url) {
          clearTimeout(timeoutId);
          return { image_url: url as string, provider: 'fal.ai', seed: String(seed || data?.seed || '') } as const;
        }
      } catch (_) {}
      return null;
    }

    // Provider 2: Stability（若提供 STABILITY_API_KEY）
    async function tryStability() {
      if (!STABILITY_API_KEY) return null;
      try {
        const form = new FormData();
        form.append('prompt', prompt);
        form.append('output_format', 'png');
        form.append('width', String(width));
        form.append('height', String(height));
        if (seed) form.append('seed', seed);

        const res = await fetch('https://api.stability.ai/v2beta/stable-image/generate/core', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${STABILITY_API_KEY}`,
          },
          body: form,
          signal: controller.signal,
        });
        if (!res.ok) return null;
        // v2beta 返回的是二进制图片；为简化直接用 data URL 承载
        const arrayBuf = await res.arrayBuffer();
        const base64 = Buffer.from(arrayBuf).toString('base64');
        const dataUrl = `data:image/png;base64,${base64}`;
        clearTimeout(timeoutId);
        return { image_url: dataUrl, provider: 'stability', seed: seed || '' } as const;
      } catch (_) {}
      return null;
    }

    const falResult = await tryFal();
    if (falResult) {
      try { (globalThis as any).__incMonthlyImage?.(); } catch {}
      return NextResponse.json(falResult, { status: 200, headers: { 'Cache-Control': 'no-store, max-age=0' } });
    }
    const staResult = await tryStability();
    if (staResult) {
      try { (globalThis as any).__incMonthlyImage?.(); } catch {}
      return NextResponse.json(staResult, { status: 200, headers: { 'Cache-Control': 'no-store, max-age=0' } });
    }

    // 占位图兜底
    clearTimeout(timeoutId);
    try { (globalThis as any).__incMonthlyImage?.(); } catch {}
    return NextResponse.json({ image_url: placeholderUrl(width, height, seed), provider: 'placeholder', seed: seed || '' }, { status: 200, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: 'Request failed', detail: (err as Error)?.message ?? String(err) },
      { status: 500 }
    );
  }
}



