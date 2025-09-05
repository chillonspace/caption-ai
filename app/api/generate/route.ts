import { NextRequest, NextResponse } from 'next/server';
import kbJson from '@/lib/kb/10secherbs_kb.json';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { product, tone, platform } = await req.json();

    // --- Minimal KB wiring & platform profiles (inline; no new files) ---
    const KB: any = kbJson as any;
    const PLATFORM_PROFILES = {
      facebook: { length_hint: 'medium', emoji_range: [2, 4], hashtag_range: [2, 5], cta: 'pm_me', tone: 'light' },
      xiaohongshu: { length_hint: 'long', emoji_range: [2, 5], hashtag_range: [6, 10], cta: 'comment', tone: 'warm' },
      instagram: { length_hint: 'short', emoji_range: [1, 3], hashtag_range: [4, 8], cta: 'link', tone: 'playful' },
      tiktok: { length_hint: 'short', emoji_range: [1, 3], hashtag_range: [3, 6], cta: 'comment', tone: 'playful' },
    } as const;
    type PlatformKey = keyof typeof PLATFORM_PROFILES;

    function normalizeProductKey(keyRaw: string): string {
      const k = (keyRaw || '').toLowerCase();
      if (k.includes('trio') && k.includes('care')) return 'TrioCare';
      if (k.includes('flo')) return 'FloMix';
      if (k.includes('flex')) return 'FleXa';
      if (k.includes('air')) return 'AirVo';
      if (k.includes('tri') && k.includes('guard')) return 'TriGuard';
      const exact = ['TriGuard', 'FloMix', 'FleXa', 'AirVo', 'TrioCare'];
      return exact.find(x => x.toLowerCase() === k) || 'TriGuard';
    }

    function pickN<T>(arr: T[] | undefined, n: number): T[] {
      if (!arr || arr.length === 0 || n <= 0) return [];
      const copy = arr.slice();
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy.slice(0, Math.min(n, copy.length));
    }
    function maybePickN<T>(arr: T[] | undefined, n: number, p = 0.6): T[] {
      return Math.random() < p ? pickN(arr, n) : [];
    }
    function pickFacts(productKey: string, variationLevel = 2) {
      const p = KB[productKey] as any;
      if (!p) return { 功效: [], 技术: [], 体验: [], 适用人群: [], 使用方式: [], 注意事项: [] };
      const res = {
        体验: pickN(p.体验, 1),
        功效: pickN(p.功效, 1 + (variationLevel > 1 ? 1 : 0)),
        技术: pickN(p.技术, variationLevel > 2 ? 2 : 1),
        适用人群: maybePickN(p.适用人群, 1, 0.5),
        使用方式: maybePickN(p.使用方式, 1, 0.5),
        注意事项: maybePickN(p.注意事项, 1, 0.3),
      } as Record<string, string[]>;
      const buckets: Array<[string, string[]]> = Object.entries(res) as any;
      const flat = buckets.flatMap(([k, arr]) => (arr || []).map(v => ({ k, v })));
      const desired = 2 + Math.floor(Math.random() * 3); // 2~4
      if (flat.length > desired) {
        const prio: Record<string, number> = { 体验: 3, 功效: 3, 技术: 2, 适用人群: 1, 使用方式: 1, 注意事项: 1 };
        flat.sort((a, b) => (prio[b.k] || 0) - (prio[a.k] || 0));
        const kept = flat.slice(0, desired);
        const newRes: Record<string, string[]> = { 体验: [], 功效: [], 技术: [], 适用人群: [], 使用方式: [], 注意事项: [] };
        kept.forEach(({ k, v }) => newRes[k].push(v));
        return newRes;
      }
      return res;
    }

    if (!process.env.DEEPSEEK_API_KEY) {
      return NextResponse.json({ error: 'Missing DEEPSEEK_API_KEY' }, { status: 500 });
    }

    if (!product || !tone) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const plat: PlatformKey = (Object.keys(PLATFORM_PROFILES) as string[]).includes((platform || '').toLowerCase())
      ? ((platform || '').toLowerCase() as PlatformKey)
      : 'facebook';
    const productKey = normalizeProductKey(product || 'TriGuard');
    const facts = pickFacts(productKey, 2);

    const SYSTEM_PROMPT = [
      'You are a Malaysian agent writing social posts to friends, not a brand account.',
      'Write like a real person: colloquial, short sentences, light code-mixing OK (zh/EN/BM) with Malaysian tone.',
      'Avoid AI tone and ad clichés. Keep it scannable (short lines, blank lines, one idea per sentence).',
      'Use exactly the facts provided in <KB>; do not invent ingredients, medical claims, or guarantees.',
      'If numbers/certifications appear in <KB> (e.g., KKM), keep them factual and low‑key.',
      'No diagnoses/cures; this is daily‑care copy, not medical advice.'
    ].join('\n');

    const platformProfileBlock = JSON.stringify({
      platform: plat,
      ...PLATFORM_PROFILES[plat],
      tone: 'light',
      variation_level: 2,
    }, null, 2);
    const kbBlock = JSON.stringify({ product_key: productKey, facts }, null, 2);
    const OUTPUT_RULES = [
      '开头：用“场景/痛点/细节”吸睛；避免千篇一律的“你是否…/有没有…”。',
      '中段：自然带入产品名；只选 <KB.facts> 中 2–4 点（体验/功效/技术混搭），不要全塞。',
      '结尾CTA：FB=私讯我；小红书=评论/收藏；IG=点链接；TikTok=评论/私信。',
      '字数：short≈60–100 / medium≈120–180 / long≈200–280（按平台配置）。',
      'Emoji：数量按范围；不要一行堆一排。',
      'Hashtags：数量按范围，混合“产品名+功效/场景”。',
      '输出：只给最终文案，不要解释过程。'
    ].join('\n');

    const userPrompt = ['<PLATFORM_PROFILE>', platformProfileBlock, '', '<KB>', kbBlock, '', '<OUTPUT_RULES>', OUTPUT_RULES].join('\n');

    const payload = {
      model: (process.env.GEN_MODEL as string) || 'deepseek-chat',
      temperature: 0.9,
      top_p: 0.95,
      frequency_penalty: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    } as const;

    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errorText = await res.text();
      return NextResponse.json({ error: 'Upstream model error', detail: errorText }, { status: 502 });
    }

    const data = await res.json();
    let text: string = data?.choices?.[0]?.message?.content ?? '';
    // Strip code fences if present
    text = text.replace(/^```[a-zA-Z]*\n|\n```$/g, '');
    // Extract JSON slice if wrapped
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    const jsonSlice = firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace
      ? text.slice(firstBrace, lastBrace + 1)
      : text;

    let captions: string[] = [];
    try {
      const parsed = JSON.parse(jsonSlice);
      if (Array.isArray(parsed?.captions)) {
        captions = parsed.captions
          .map((t: unknown) => String(t ?? '').trim())
          .filter(Boolean)
          .slice(0, 1);
      }
    } catch {
      try {
        const repaired = jsonSlice
          .replace(/[“”]/g, '"')
          .replace(/[‘’]/g, "'")
          .replace(/,\s*([}\]])/g, '$1')
          .replace(/[\u200B-\u200D\uFEFF]/g, '');
        const reparsed = JSON.parse(repaired);
        if (Array.isArray(reparsed?.captions)) {
          captions = reparsed.captions
            .map((t: unknown) => String(t ?? '').trim())
            .filter(Boolean)
            .slice(0, 1);
        }
      } catch {
        // fall through
      }
    }

    // Final normalization: always return clean string[] with real newlines
    function finalizeNormalize(input: unknown): string[] {
      try {
        if (Array.isArray(input)) {
          const flat: string[] = [];
          for (const el of input) {
            if (typeof el === 'string') {
              const raw = el.trim();
              if (raw.startsWith('{') || raw.startsWith('[') || raw.includes('"captions"')) {
                try {
                  const parsed = JSON.parse(raw);
                  flat.push(...finalizeNormalize((parsed as any)?.captions ?? parsed));
                  continue;
                } catch {}
              }
              flat.push(raw.replace(/\\n/g, '\n'));
            } else if (Array.isArray(el)) {
              flat.push(...finalizeNormalize(el));
            } else if (el && typeof el === 'object' && 'captions' in (el as any)) {
              flat.push(...finalizeNormalize((el as any).captions));
            } else if (el != null) {
              flat.push(String(el));
            }
          }
          return flat.filter(Boolean).slice(0, 1);
        }
        if (typeof input === 'string') {
          try {
            const parsed = JSON.parse(input);
            return finalizeNormalize((parsed as any)?.captions ?? parsed);
          } catch {}
          return [input.replace(/\\n/g, '\n').trim()].filter(Boolean).slice(0, 1);
        }
        return [];
      } catch {
        return [];
      }
    }

    const finalCaptions = captions.length > 0 ? finalizeNormalize(captions) : finalizeNormalize(text);

    return new NextResponse(
      JSON.stringify({ captions: finalCaptions }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: 'Request failed', detail: (err as Error)?.message ?? String(err) },
      { status: 500 }
    );
  }
}


