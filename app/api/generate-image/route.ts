import { NextRequest, NextResponse } from 'next/server';
import { createServer } from '@/lib/supabase/server';
import fs from 'fs';
import path from 'path';
import Stripe from 'stripe';
import { getEnv } from '@/lib/admin-utils';
import sharp from 'sharp';
import { PRODUCT_ASSETS } from '@/lib/constants';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Aspect = '1:1' | '9:16' | '4:5';

// Advertising style pool for diversity (5 styles)
const AD_STYLES: Record<string, string> = {
  beauty_red: '红色背景的美妆肖像，棚拍光，优雅中文字体',
  lifestyle_white: '生活方式场景，白色明亮背景，自然晨光',
  flatlay_wood: '木质桌面俯拍摆拍，搭配杯子、绿植、杂志等道具',
  scientific_lab: '理科实验室氛围，玻璃烧杯与微弱高光反射',
  herbal_nature: '自然草本背景，绿色色调，极简干净排版',
};

const PROMPT_TEMPLATE = `
为「{{product_name}}」生成高品质商业广告图。
必须使用提供的产品图片作为主体，禁止重绘、替换或修改瓶身与标签。
产品需完整正面、清晰可见，标签可读。

画面风格：{{style_desc}}；灵感来自现代健康/护肤广告。
在画面中自然融入大号中文文案（主标题、核心功效、卖点），与场景气质一致。

画面真实、审美高级、干净背景、柔和光线，适合线上投放；
注意品牌安全与合规，不夸大效果。
`;

const NEGATIVE_PROMPT = `没有产品, 假瓶, 标签变形, 裁切产品, 手部畸形, 杂乱背景, 过暗, 错误文字, 水印, 低质量, NSFW`;

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

    // 45s 超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);
    // Zhipu CogView-4 generations (user-specified)
    let lastZhipuError: string | undefined;
    async function tryZhipuGenerations() {
      const key = process.env.ZHIPU_API_KEY;
      if (!key) { lastZhipuError = 'missing ZHIPU_API_KEY'; return null; }
      try {
        const body = {
          model: 'cogview-4',
          prompt: `${prompt}\n产品必须保持原样，不可重绘。生成中文广告海报，添加中文标题与卖点，干净高质感背景。`,
          size: '1080x1350',
          seed: seed || Math.floor(Math.random() * 999999).toString(),
        } as const;
        const res = await fetch('https://open.bigmodel.cn/api/paas/v4/images/generations', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res.ok) {
          try { lastZhipuError = `gen ${res.status} ${await res.text()}`; } catch {}
          return null;
        }
        const data: any = await res.json();
        const url = data?.data?.[0]?.url;
        if (!url) { lastZhipuError = 'no url in response'; return null; }
        clearTimeout(timeoutId);
        return { image_url: url as string, provider: 'zhipu', seed: String(body.seed) } as const;
      } catch (e: any) {
        lastZhipuError = String(e?.message || e);
        return null;
      }
    }

    const zh = await tryZhipuGenerations();
    if (zh) {
      try { (globalThis as any).__incMonthlyImage?.(); } catch {}
      const bgBuf = await fetch(zh.image_url).then(r => r.arrayBuffer()).then(b => Buffer.from(b));
      const assetPath = (PRODUCT_ASSETS as any)?.[product as keyof typeof PRODUCT_ASSETS];
      const composed = assetPath
        ? await compositeProductRandom(bgBuf, path.join(process.cwd(), 'public', assetPath))
        : bgBuf;
      const withText = caption ? await overlayAdText(composed, caption) : composed;
      const disk = await persistToDisk(withText, { desiredW: 1080, desiredH: 1350 });
      return NextResponse.json(
        {
          ...zh,
          image_url: disk.saved_path,
          ...disk,
          aspect: '4:5',
          used_prompt: prompt,
          ad_style_key: adStyleKey,
          product_name: product,
          provider: 'zhipu',
        },
        { status: 200, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }
    clearTimeout(timeoutId);
    return NextResponse.json({ error: 'ZH_GENERATE_FAILED', detail: lastZhipuError || '智谱生成失败，请稍后重试' }, { status: 502 });

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

    async function compositeProductRandom(bgBuf: Buffer, productAbsPath: string) {
      const meta = await sharp(bgBuf).metadata();
      const W = meta.width || 1080; const H = meta.height || 1350;
      const anchors = [
        { x: 0.5, y: 0.75 },
        { x: 0.25, y: 0.7 }, { x: 0.75, y: 0.7 },
        { x: 0.5, y: 0.6 },
        { x: 0.2, y: 0.55 }, { x: 0.8, y: 0.55 },
        { x: 0.5, y: 0.5 },
      ];
      const a = anchors[Math.floor(Math.random() * anchors.length)];
      const jitterX = (Math.random() - 0.5) * 0.12;
      const jitterY = (Math.random() - 0.5) * 0.10;
      const scale = 0.45 + Math.random() * 0.2;
      const targetW = Math.floor(W * scale);
      const productBuf = await sharp(productAbsPath).resize(targetW).png().toBuffer();
      const prodMeta = await sharp(productBuf).metadata();
      const pw = prodMeta.width || targetW; const ph = prodMeta.height || Math.floor(targetW * 1.2);
      const margin = Math.floor(W * 0.04);
      let left = Math.floor(a.x * W - pw / 2 + jitterX * W);
      let top = Math.floor(a.y * H - ph / 2 + jitterY * H);
      left = Math.max(margin, Math.min(W - pw - margin, left));
      top = Math.max(margin, Math.min(H - ph - margin, top));
      return await sharp(bgBuf).composite([{ input: productBuf, left, top }]).png().toBuffer();
    }

    async function overlayAdText(buf: Buffer, caption: string) {
      const meta = await sharp(buf).metadata();
      const W = meta.width || 1080; const H = meta.height || 1350;
      const firstLine = String(caption).split('\n').map(s=>s.trim()).find(Boolean) || '';
      const short = firstLine.slice(0, 22);
      if (!short) return buf;
      const x = Math.floor(W * (0.08 + Math.random() * 0.12));
      const y = Math.floor(H * (0.12 + Math.random() * 0.1));
      const bgW = Math.min(W - x * 2, short.length * 28 + 24);
      const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
        <rect x="${x-12}" y="${y-36}" rx="8" ry="8" width="${bgW}" height="44" fill="rgba(0,0,0,0.35)"/>
        <text x="${x}" y="${y}" font-size="28" fill="#fff" font-family="-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, 'PingFang SC', 'Microsoft YaHei'">${short.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</text>
      </svg>`;
      return await sharp(buf).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer();
    }

    // Unreachable under normal conditions due to early returns above
  } catch (err: unknown) {
    return NextResponse.json(
      { error: 'Request failed', detail: (err as Error)?.message ?? String(err) },
      { status: 500 }
    );
  }
}


// Allow CORS preflight and simple GET checks to avoid 405 on direct visits
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Allow': 'POST, OPTIONS, GET',
      'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    return NextResponse.json(
      { ok: true, message: 'Use POST to generate image' },
      { status: 200, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: 'Request failed', detail: (err as Error)?.message ?? String(err) },
      { status: 500 }
    );
  }
}



