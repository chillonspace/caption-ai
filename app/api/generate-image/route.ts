import { NextRequest, NextResponse } from 'next/server';
import { createServer } from '@/lib/supabase/server';
import fs from 'fs';
import path from 'path';
import Stripe from 'stripe';
import { getEnv } from '@/lib/admin-utils';
import sharp from 'sharp';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Aspect = '1:1' | '9:16' | '4:5';

// Advertising style pool for diversity (5 styles)
const AD_STYLES: Record<string, string> = {
  beauty_red: 'beauty portrait with red background, studio light, elegant typography',
  lifestyle_white: 'lifestyle scene with white bright background, natural light, morning mood',
  flatlay_wood: 'top-down flatlay on wooden surface with props like cup, plants, magazine',
  scientific_lab: 'technical laboratory setting, glass beakers, subtle light reflections',
  herbal_nature: 'natural background with herbal leaves, green tone, clean minimalist layout',
};

const PROMPT_TEMPLATE = `
High-quality commercial poster for {{product_name}}.
Use the provided product image exactly as it is — do NOT redraw, repaint, or modify the product in any way.
The original product must appear clearly, front-facing, fully visible, with label readable.

Design a professional advertising photo in {{style_desc}}, inspired by modern health and skincare ads.
Add large, elegant Chinese promotional text (主标题、功效、卖点) integrated naturally with the design, matching the scene tone.

Scene must look realistic, aesthetic, premium, clean background, soft light, suitable for online ads.
brand-safe, compliant, no medical or exaggerated claims.
`;

const NEGATIVE_PROMPT = `missing product, fake bottle, distorted label, cropped product, bad hands, messy background, too dark, wrong text, watermark, nsfw, low quality`;

function mapAspect(aspect: Aspect | string | undefined) {
  const a = (aspect || '4:5') as Aspect;
  if (a === '9:16') {
    return { width: 1024, height: 1820, label: '9:16' as const };
  }
  if (a === '1:1') {
    return { width: 1024, height: 1024, label: '1:1' as const };
  }
  // default 4:5 portrait
  return { width: 1080, height: 1350, label: '4:5' as const };
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
    const adStyle = String(body?.ad_style || '').trim().toLowerCase();
    const aspectRaw = String(body?.aspect || '4:5');
    const seed = String(body?.seed || Math.floor(Math.random() * 9999999).toString()).trim();
    const aspect = (aspectRaw === '9:16' ? '9:16' : aspectRaw === '1:1' ? '1:1' : '4:5') as Aspect;
    const { width, height } = mapAspect(aspect);
    // Style selection: use fixed pool if not provided
    const styleKeys = Object.keys(AD_STYLES);
    const adStyleKey = adStyle || styleKeys[Math.floor(Math.random() * styleKeys.length)];
    const styleDesc = AD_STYLES[adStyleKey] || AD_STYLES[styleKeys[0]];
    const prompt = (
      PROMPT_TEMPLATE
        .replace('{{product_name}}', product)
        .replace('{{style_desc}}', styleDesc)
      + (caption ? `\n${caption}` : '')
    ).trim();

    const STABILITY_API_KEY = (process.env.STABILITY_API_KEY || '').trim();

    // 45s 超时控制（Stability 有时需要更久）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    // Removed fal provider for simplicity and determinism (must use Stability with init image)

    // Provider 2: Stability（若提供 STABILITY_API_KEY）
    let lastStabilityError: string | undefined;
    async function tryStabilityWithInitImage() {
      if (!STABILITY_API_KEY) return null;
      try {
        // 尝试使用 public/products 下的参考图作为初始图
        const mapName = (p: string): string => {
          const k = (p || '').toLowerCase();
          if (k.includes('tri') && k.includes('guard')) return 'triguard';
          if (k.includes('flo')) return 'flomix';
          if (k.includes('flex')) return 'flexa';
          if (k.includes('air')) return 'airvo';
          if (k.includes('trio') && k.includes('care')) return 'triocare';
          return '';
        };
        const fileKey = mapName(product);
        if (!fileKey) return null;
        const filePath = path.join(process.cwd(), 'public', 'products', `${fileKey}.png`);
        if (!fs.existsSync(filePath)) return null;

        const form = new FormData();
        form.append('image', new Blob([fs.readFileSync(filePath)]), `${fileKey}.png`);
        form.append('prompt', prompt);
        form.append('output_format', 'png');
        form.append('width', String(width));
        form.append('height', String(height));
        // Optional negative prompt field for Stability edit endpoint
        try { (form as any).append('negative_prompt', NEGATIVE_PROMPT); } catch {}

        const res = await fetch('https://api.stability.ai/v2beta/stable-image/edit', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${STABILITY_API_KEY}`,
            'Accept': 'image/*',
          },
          body: form,
          signal: controller.signal,
        });
        if (!res.ok) {
          try { lastStabilityError = `init ${res.status} ${await res.text()}`; } catch {}
          return null;
        }
        const arrayBuf = await res.arrayBuffer();
        const base64 = Buffer.from(arrayBuf).toString('base64');
        const dataUrl = `data:image/png;base64,${base64}`;
        clearTimeout(timeoutId);
        return { image_url: dataUrl, provider: 'stability', seed: seed || '' } as const;
      } catch (e: any) { lastStabilityError = `init err ${String(e?.message || e)}`; }
      return null;
    }
    async function tryStability() {
      if (!STABILITY_API_KEY) return null;
      try {
        const form = new FormData();
        form.append('prompt', prompt);
        form.append('output_format', 'png');
        form.append('width', String(width));
        form.append('height', String(height));
        if (seed) form.append('seed', seed);
        try { (form as any).append('negative_prompt', NEGATIVE_PROMPT); } catch {}

        const res = await fetch('https://api.stability.ai/v2beta/stable-image/generate/core', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${STABILITY_API_KEY}`,
            'Accept': 'image/*',
          },
          body: form,
          signal: controller.signal,
        });
        if (!res.ok) {
          try { lastStabilityError = `core ${res.status} ${await res.text()}`; } catch {}
          return null;
        }
        // v2beta 返回的是二进制图片；为简化直接用 data URL 承载
        const arrayBuf = await res.arrayBuffer();
        const base64 = Buffer.from(arrayBuf).toString('base64');
        const dataUrl = `data:image/png;base64,${base64}`;
        clearTimeout(timeoutId);
        return { image_url: dataUrl, provider: 'stability', seed: seed || '' } as const;
      } catch (e: any) { lastStabilityError = `core err ${String(e?.message || e)}`; }
      return null;
    }

    // If we have a local reference image and Stability key, prioritize init-image path first
    try {
      const initFirst = await tryStabilityWithInitImage();
      if (initFirst) {
        try { (globalThis as any).__incMonthlyImage?.(); } catch {}
        const disk = await (async () => { try { return await persistToDisk(initFirst.image_url, { desiredW: 1080, desiredH: 1350 }); } catch { return { saved_path: '', thumb_path: '' } as const; } })();
        return NextResponse.json(
          { ...initFirst, ...disk, aspect: '4:5' },
          { status: 200, headers: { 'Cache-Control': 'no-store, max-age=0' } }
        );
      }
    } catch {}

    // Strict path: must use Stability with init image; fail fast otherwise
    // Preconditions
    if (!STABILITY_API_KEY) {
      clearTimeout(timeoutId);
      return NextResponse.json({ error: 'MISSING_STABILITY_KEY', detail: '请在环境变量配置 STABILITY_API_KEY' }, { status: 500 });
    }
    const mapNameStrict = (p: string): string => {
      const k = (p || '').toLowerCase();
      if (k.includes('tri') && k.includes('guard')) return 'triguard';
      if (k.includes('flo')) return 'flomix';
      if (k.includes('flex')) return 'flexa';
      if (k.includes('air')) return 'airvo';
      if (k.includes('trio') && k.includes('care')) return 'triocare';
      return '';
    };
    const strictKey = mapNameStrict(product);
    if (!strictKey) {
      clearTimeout(timeoutId);
      return NextResponse.json({ error: 'INVALID_PRODUCT', detail: '产品名未匹配到参考图（TriGuard/FloMix/FleXa/AirVo/TrioCare）' }, { status: 400 });
    }
    const strictFilePath = path.join(process.cwd(), 'public', 'products', `${strictKey}.png`);
    if (!fs.existsSync(strictFilePath)) {
      clearTimeout(timeoutId);
      return NextResponse.json({ error: 'MISSING_REFERENCE_IMAGE', detail: `/public/products/${strictKey}.png 不存在` }, { status: 400 });
    }

    const staInit = await tryStabilityWithInitImage();
    if (staInit) {
      try { (globalThis as any).__incMonthlyImage?.(); } catch {}
      const disk = await persistToDisk(staInit.image_url, { desiredW: 1080, desiredH: 1350 });
      return NextResponse.json(
        {
          ...staInit,
          image_url: disk.saved_path,
          ...disk,
          aspect: '4:5',
          used_prompt: prompt,
          ad_style_key: adStyleKey,
          used_endpoint: 'edit',
          reference_image: `/products/${strictKey}.png`,
        },
        { status: 200, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }
    // Try once more with core endpoint as a backup (still Stability)
    const staBackup = await tryStability();
    if (staBackup) {
      try { (globalThis as any).__incMonthlyImage?.(); } catch {}
      const disk = await persistToDisk(staBackup.image_url, { desiredW: 1080, desiredH: 1350 });
      return NextResponse.json(
        {
          ...staBackup,
          image_url: disk.saved_path,
          ...disk,
          aspect: '4:5',
          used_prompt: prompt,
          ad_style_key: adStyleKey,
          used_endpoint: 'core',
          reference_image: `/products/${strictKey}.png`,
        },
        { status: 200, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }
    clearTimeout(timeoutId);
    return NextResponse.json({ error: 'STABILITY_EDIT_FAILED', detail: lastStabilityError || '使用参考图生成失败，请稍后重试' }, { status: 502 });

    // Helper: persist to public/generated and create 540x675 thumbnail
    async function persistToDisk(input: string | Buffer, opts: { desiredW: number; desiredH: number }) {
      let buf: Buffer;
      try {
        if (typeof input !== 'string') {
          buf = input;
        } else if (input.startsWith('data:image/')) {
          const base64 = input.split(',')[1] || '';
          buf = Buffer.from(base64, 'base64');
        } else {
          const res = await fetch(input);
          const arr = await res.arrayBuffer();
          buf = Buffer.from(arr);
        }
      } catch {
        // fallback to placeholder if fetch fails
        const res = await fetch(placeholderUrl(opts.desiredW, opts.desiredH));
        const arr = await res.arrayBuffer();
        buf = Buffer.from(arr);
      }

      const dir = path.join(process.cwd(), 'public', 'generated');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const id = Math.random().toString(36).slice(2) + Date.now();
      const mainName = `${id}.png`;
      const thumbName = `${id}.thumb.png`;
      const mainPath = path.join(dir, mainName);
      const thumbPath = path.join(dir, thumbName);

      // Ensure main is 4:5 by covering to target box; thumbnail to 540x675
      await sharp(buf).resize(opts.desiredW, opts.desiredH, { fit: 'cover' }).png().toFile(mainPath);
      await sharp(buf).resize(540, 675, { fit: 'cover' }).png().toFile(thumbPath);

      return {
        saved_path: `/generated/${mainName}`,
        thumb_path: `/generated/${thumbName}`,
      } as const;
    }

    // Unreachable under normal conditions due to early returns above
  } catch (err: unknown) {
    return NextResponse.json(
      { error: 'Request failed', detail: (err as Error)?.message ?? String(err) },
      { status: 500 }
    );
  }
}



