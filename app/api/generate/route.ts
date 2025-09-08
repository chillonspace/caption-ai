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
      '你是马来西亚本地风格的中文社媒文案写手（不是品牌官号），写给朋友看的口吻。',
      '严格中文为主，可极少量 EN/BM 词语点缀（≤5%）；若非必要，请全中文。避免“AI腔”和硬广套话。',
      '写短句、留空行、每句只表达一个想法；可用符号增强可读性（✅ ✨ —）。',
      '只使用 <KB> 提供的事实，不要发明成分/功效/数据；技术点低调表达（如：小分子/道尔顿、10秒透皮、KKM）。',
      '禁止使用模板化开头：例如 “最近/这阵子/有时候/常常/每次/每天/近来/Eh/Hari-hari”等；若出现请改写。',
      '不得医疗承诺或诊断，不要使用“治愈/保证/奇迹”等词。',
      '只输出最终文案正文（纯文本），不要解释，不要代码块。'
    ].join('\n');

    const platformProfileBlock = JSON.stringify({
      platform: plat,
      ...PLATFORM_PROFILES[plat],
      tone: 'light',
      variation_level: 3,
    }, null, 2);
    const kbBlock = JSON.stringify({ product_key: productKey, facts }, null, 2);
    const OUTPUT_RULES = [
      '开头：用“场景/痛点/细节/话题#”吸睛；避免“你是否/有没有发现”等套路句。',
      '开头需在以下模板中轮换：#话题 / 反问句 / 细节瞬间 / 场景画面；不得连续两次使用同一类型；如重复请改写。',
      '结构：短句 + 空行 + “.” 分段；中段只用 <KB.facts> 的 2–4 个要点，避免说明书腔。',
      '清单：必须用 ✅/✨/— 输出 3–4 条（体验/功效/技术/适用人群/使用方式/注意事项中任选，顺序随机），精炼、口语化，不堆技术。',
      '语言：中文为主，EN/BM 仅点缀（≤5%）；若非必要请全中文。',
      '用词：统一使用“涂抹/抹一抹/早晚各一次”等表达；避免与品类不符的“喷/贴”等词。',
      '技术点：低调表达（小分子/10秒透皮/不经肠胃/KKM），不得医疗承诺与夸大数字。',
      'CTA：按平台输出（FB=“PM我/私讯我”；也可 Like&Share）。',
      'Hashtags：末尾一段，6–12 个，兼顾产品名/场景/功效。',
      '输出：只给最终文案正文（纯文本），不要解释。'
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


