import { NextRequest, NextResponse } from 'next/server';
import kbJson from '@/lib/kb/10secherbs_kb.json';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { product, tone, platform, ban_opening_prefixes } = await req.json();

    // --- Minimal KB wiring & platform profiles (inline; no new files) ---
    const KB: any = kbJson as any;
    const PLATFORM_PROFILES = {
      facebook: { length_hint: 'medium', emoji_range: [4, 8], hashtag_range: [5, 9], cta: 'pm_me', tone: 'light' },
      xiaohongshu: { length_hint: 'long', emoji_range: [2, 5], hashtag_range: [6, 10], cta: 'comment', tone: 'warm' },
      instagram: { length_hint: 'short', emoji_range: [1, 3], hashtag_range: [4, 8], cta: 'link', tone: 'playful' },
      tiktok: { length_hint: 'short', emoji_range: [1, 3], hashtag_range: [3, 6], cta: 'comment', tone: 'playful' },
    } as const;
    type PlatformKey = keyof typeof PLATFORM_PROFILES;

    // Opening schemas for varied first-line patterns
    const OPENING_SCHEMAS = [
      { name: 'hashtag_topic', tip: '以#话题开头，1-3个标签后接一句具体感受。避免模板化词。' },
      { name: 'detail_moment', tip: '用一个细节瞬间描写（时间/场景/动作/感受），不问句。' },
      { name: 'rhetorical_question', tip: '用反问句引入，但不要使用“你是否/有没有/是不是”这类模板词。换一种更生活的问法。' },
      { name: 'micro_story', tip: '用一句超短小故事开场（人物+动作+情绪），自然口语。' },
      { name: 'surprising_fact', tip: '用一个让人意外的小事实或体验差异开场，口语化。' },
      { name: 'dialogue_line', tip: '用一行对话引入（不加引号也行），像朋友聊天。' },
      { name: 'pain_point_punch', tip: '痛点直击但避免套路词，像“今晚又被鼻塞吵醒了”。' },
      { name: 'scene_visual', tip: '画面感开头（触觉/听觉/视觉），一句话讲清。' },
    ] as const;

    function pickSchema(exclude?: string) {
      const pool = OPENING_SCHEMAS.filter(s => s.name !== exclude);
      return pool[Math.floor(Math.random() * pool.length)];
    }

    function extractOpeningPrefix(text: string): string {
      try {
        const firstNonEmpty = String(text || '')
          .split('\n')
          .map(t => t.trim())
          .find(t => t.length > 0) || '';
        const cleaned = firstNonEmpty.replace(/^[#\p{P}\s]+/u, '').replace(/\s+/g, '');
        return cleaned.slice(0, 12);
      } catch {
        return '';
      }
    }

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
      // 体验/功效优先；技术点降权，其余为点缀
      const res = {
        体验: pickN(p.体验, 1),
        功效: pickN(p.功效, 1 + (variationLevel > 1 ? 1 : 0)),
        技术: maybePickN(p.技术, 1, 0.4),
        适用人群: maybePickN(p.适用人群, 1, 0.6),
        使用方式: maybePickN(p.使用方式, 1, 0.5),
        注意事项: maybePickN(p.注意事项, 1, 0.2),
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

    const SYSTEM_PROMPT = `
你是马来西亚本地风格的中文社媒文案写手（不是品牌官号），写给朋友看的口吻。
输出的文案必须自然、口语化，像真人日常发帖。
中文为主，可少量 EN/BM 点缀（≤10%），自然嵌入即可。
用短句，空行分段，每句只表达一个意思；可用 ✅ ✨ — 等符号增强可读性。
必须基于 <KB> 提供的事实写作，不得发明成分/功效/数据。
技术点低调自然表达（如：小分子/道尔顿/10秒透皮/不进肠胃/KKM），只点到为止，不要堆砌。
禁止医疗承诺或诊断词（如 治愈/奇迹/保证/100% 有效）。
禁止使用模板化开头：例如 “最近/这阵子/有时候/常常/每次/每天/近来/Eh/Hari-hari”等；如出现请改写。
只输出最终文案正文（纯文本），不要解释，不要代码块。

[STYLE_EXAMPLES]
以下示例仅用于学习节奏、emoji、清单与 hashtags 习惯，请模仿其口吻与结构：

例1（AirVo 症状型）
#鼻塞的苦日子 每秒不是在忙着呼吸，就是在zut到鼻子脱皮 🤧
.
晚上最惨！鼻塞着 + 睡不好…
每口气都像背着沙包， #胸口快闷炸了！󰷹
.
❄ 还好遇到了 AirVo 鼻敏感舒缓霜！
1天只需轻轻 #涂抹2次在胸口上，10秒就透进血液，整个人呼吸都顺了～🥰
.
✅ 鼻孔终于“凉凉”的，畅通啦 👃
✅ 呼吸轻松，晚上安心睡到天亮！🫁
.
AirVo 采用德国技术把草本成分分解成超小分子，加上日本水解技术，#吸收率高达90%！不经过肠胃、#不伤肝，效果快看得见！
.
那种终于能顺口呼吸的感觉，鼻炎人懂的！🥹
记得Like&Share分享出去，拯救鼻炎星人！
.
.
.
#AirVo #改善鼻炎 #舒缓鼻塞 #缓解咳嗽 #增强肺活量 #润肺止咳 #保护肺功能 #呼吸顺畅的秘诀 #提升免疫系统 #创新涂抹式AirVo呼吸霜 #无负担的AirVo #10secHerbs

例2（AirVo 产品介绍型）
没想到 AirVo 一抹，呼吸瞬间顺顺啦～ 现在 #不再被鼻塞折磨 着了！🍃
.
每早醒来，鼻子塞到连气都吸不上去，只能用嘴硬吸气...
胸口闷得像压了块石头，半夜都没好觉睡！󰷹
.
自从用了【AirVo 鼻敏感舒缓霜】 每天轻轻 #涂抹2次，活性草本成分 #10秒透皮吸收，快速 #舒缓鼻塞和充血，让呼吸立刻顺畅啦！
.
✨ 快速缓解鼻塞，呼吸瞬间轻松
✨ 早上顺畅呼吸，整天神清气爽
✨ 减轻过敏症状，改善鼻痒和流鼻涕困扰
.
AirVo 创新打破传统，#不用吃药打针，特别推荐肠胃敏感的人❌💊
它还利用德国道尔顿先进技术，把草本成分分解成 200–500 #小分子，再通过日本水解技术 #增强皮肤吸收，由微血管进入全身循环。
.
✅ 透皮吸收率高达 90%
✅ 100% 天然草药，安全无刺激
✅ 通过 KKM 认证、⛔无化学添加、⛔无肝脏负担
📌 适合人群：敏感体质、上班族、3岁以上小孩也能安心使用哦
.
如今，AirVo 已成为名副其实的 “涂抹式天然保健”，深受全球用户喜爱啦！
.
别再让鼻塞毁掉早晨的好心情～
📩 马上 PM 一对一咨询，体验每天都能轻松呼吸、神清气爽！
.
.
.
#AirVo #改善鼻炎 #舒缓鼻塞 #缓解咳嗽 #增强肺活量 #润肺止咳 #保护肺功能 #呼吸顺畅的秘诀 #提升免疫系统 #创新涂抹式AirVo呼吸霜 #无负担的AirVo #10secHerbs

例3（TriGuard 案例型）
今天这位大哥来我们这里做健康检查，
结果一测——血糖竟然 9.3！😨
“平常吃得清淡，怎么血糖会偏高？”
他自己也吓了一跳💥
-
我们现场让他试用了【TriGuard控糖霜】👇
✅ 涂抹式草本控糖
✅ 不进肚子、不伤肝
✅ 采用道尔顿分子渗透技术，90%高吸收！
⏱ 15分钟后，再测一次血糖——
📉 结果从 9.3 → 降到 8.3‼️
一抹见效，他整个人都放松了下来😌
-
想知道这位大哥的血糖到底怎样降下来？👇
#TriGuard #控糖生活 #饭后不困 #10secHerbs
`;

    const platformProfileBlockBase = JSON.stringify({
      platform: plat,
      ...PLATFORM_PROFILES[plat],
      tone: 'light',
      variation_level: 3,
    }, null, 2);
    const kbBlock = JSON.stringify({ product_key: productKey, facts }, null, 2);
    const OUTPUT_RULES = [
      '开头：用生活细节/场景/话题#任选其一，自然吸睛；避免“你是否/有没有发现”套话。',
      '中段：从 <KB.facts> 中选 2–4 个点写成生活化句子；优先体验/功效，其次人群/使用；技术点轻描淡写。',
      '清单：可选 2–3 条，用 ✅/✨/— 表达，简短有力；不是每篇都必须有。',
      'Emoji：按 <emoji_range> 使用，分散在不同段落；不要一行堆两个。',
      'Hashtags：必需；数量在 <hashtag_range> 内，置于文末一段；结合产品名/功效/场景/品牌。',
      'CTA：按平台习惯收尾（FB=PM我/私讯我；小红书=留言+收藏；IG=点链接；TikTok=评论/私信）。',
      '多样性：根据 variation_level 调整语气与开头；即使同变量多次生成，也要有不同感觉。',
      '输出：只给最终文案正文（纯文本）。'
    ].join('\n');
    // Helper: run one generation with a specific opening schema and variation token
    async function generateOnce(openingSchemaName: string, variationToken: string, banPrefixes: string[]) {
      const schema = OPENING_SCHEMAS.find(s => s.name === openingSchemaName) || pickSchema();
      const openingBlock = JSON.stringify({ name: schema.name, tip: schema.tip }, null, 2);
      const platformProfileBlock = platformProfileBlockBase; // unchanged core profile
      const userPrompt = [
        `variation_token: ${variationToken}`,
        '<OPENING_SCHEMA>', openingBlock,
        '',
        '<PLATFORM_PROFILE>', platformProfileBlock,
        '',
        '<KB>', kbBlock,
        '',
        '<BAN_OPENING_PREFIXES>', JSON.stringify({ ban_opening_prefixes: Array.isArray(banPrefixes) ? banPrefixes : [] }, null, 2),
        '',
        '<OUTPUT_RULES>', OUTPUT_RULES,
        '\n要求：开头必须符合 <OPENING_SCHEMA>，且避免与最近样式/句式雷同；并且禁止开头与 <BAN_OPENING_PREFIXES> 中任一前缀相同或仅作轻微改写（同义替换/标点变化/emoji 变化也算相似）。如有冲突，请改写为不同风格和不同用词。开头请写到自然、有信息量，不要过于空泛。'
      ].join('\n');

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
        return { error: `Upstream model error: ${errorText}` } as const;
      }

      const data = await res.json();
      let text: string = data?.choices?.[0]?.message?.content ?? '';
      text = text.replace(/^```[a-zA-Z]*\n|\n```$/g, '');
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
        } catch {}
      }

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
      const openingPrefix = finalCaptions[0] ? extractOpeningPrefix(finalCaptions[0]) : '';
      return { finalCaptions, openingPrefix, schemaUsed: schema.name } as const;
    }

    const banList: string[] = Array.isArray(ban_opening_prefixes)
      ? (ban_opening_prefixes as unknown[]).map(v => String(v || '')).filter(Boolean).slice(-3)
      : [];

    // Attempt up to 2 times: initial + one retry with different schema if opening collides
    const firstSchema = pickSchema();
    const first = await generateOnce(firstSchema.name, Math.random().toString(36).slice(2) + Date.now(), banList);
    if ('error' in first) {
      return NextResponse.json({ error: first.error }, { status: 502 });
    }
    const firstTooShort = !first.openingPrefix || first.openingPrefix.length < 4;
    if ((first.openingPrefix && banList.includes(first.openingPrefix)) || firstTooShort) {
      const retrySchema = pickSchema(first.schemaUsed);
      const second = await generateOnce(retrySchema.name, Math.random().toString(36).slice(2) + Date.now(), banList);
      if ('error' in second) {
        // fallback to first if retry failed upstream
        return new NextResponse(
          JSON.stringify({ captions: first.finalCaptions, opening_prefix: first.openingPrefix, schema_used: first.schemaUsed }),
          { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, max-age=0' } }
        );
      }
      // if second still collides, return second anyway (已重试一次)
      return new NextResponse(
        JSON.stringify({ captions: second.finalCaptions, opening_prefix: second.openingPrefix, schema_used: retrySchema.name }),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    // first is fine
    return new NextResponse(
      JSON.stringify({ captions: first.finalCaptions, opening_prefix: first.openingPrefix, schema_used: first.schemaUsed }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: 'Request failed', detail: (err as Error)?.message ?? String(err) },
      { status: 500 }
    );
  }
}


