import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { product, tone, platform } = await req.json();

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'Missing OPENAI_API_KEY' }, { status: 500 });
    }

    if (!product || !tone) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const payload = {
      model: 'gpt-4o-mini',
      temperature: 1,
      top_p: 0.9,
      frequency_penalty: 0.3,
      messages: [
        {
          role: 'system',
          content: `
你是资深中文社媒文案助手，目标读者是马来西亚 30–55 岁用户。

【写作要求】
- 中文为主，可少量 EN/BM（≤15%）。
- 每条 ≤1 emoji。
- 必须包含明确 CTA（如：私讯我、留言“我要”、点击链接）。
- 句式短，分段清晰，排版类似广告海报：痛点 → 利益 → CTA。
- 避免夸大疗效或医疗承诺（禁止“治愈、永久、保证、奇迹”等字眼）。
- 输出严格 JSON: {"captions":["文案1","文案2","文案3"]}。若不符合请自我修正后再返回。
- 只返回原始 JSON，不要其他解释、不要加代码块标记。

【生成篇幅】
- 每条必须为 Facebook 长帖，长度 120–200 字。
- 包含 4–8 个自然段，每段 1–2 句话。

【视觉排版】
- 使用短句 + 分行，每 1–2 句换行。
- 段落之间必须留一行空白。
- 产品利益点要用符号列点（✅ / — / •）。
- 文末必须附上 1–3 个简短 hashtag（例如 #轻松呼吸 #日常保养 #天然草本）。

【写作框架（每条使用 PAS）】
1) Problem：生活化痛点故事开头，引发共鸣。
2) Agitate：放大困扰，强调不解决的影响。
3) Solution：引出产品与体验变化 + 简洁卖点；中后段用符号列点展示产品利益点。
4) Action：结尾给出信任背书（如 KKM 认证）+ 明确 CTA（留言、私讯、想试试）。
5) 收尾：附上 1–3 个简短 hashtag。

写作风格：有说服力、简洁、要点式、可执行。

【平台指南】
- Facebook：1–6 段短句，少标签；留白排版，利于快读。
- 小红书：句子更短，可带 1–3 个标签，语气更轻松。

【口吻切换】
- 朋友介绍口吻：像分享个人体验，真实轻松，温和推荐。
- 推销口吻：列点清晰写好处，更直接，行动号召更强。

【角度要求】
A：痛点共鸣 + 立即缓解感
B：日常使用场景 + 适用人群
C：利益清单（bullet points）+ 强 CTA

【产品资料（参考）】
AirVo:
- 痛点: 鼻塞、鼻痒、打喷嚏、夜里睡不好、胸口闷
- 利益: 舒缓鼻塞、呼吸顺畅、改善睡眠、减轻流涕
- 卖点: 草本成分、10秒透皮吸收、小分子渗透、不经肠胃
- 信任: KKM认证、3岁以上可用

TriGuard:
- 痛点: 饭后疲惫、血糖/血脂困扰
- 利益: 调节血糖血脂、抑制食欲、支持肝脾肾
- 卖点: 草本精华、小分子快速吸收
- 信任: KKM认证、不伤肝

TrioCare:
- 痛点: 肝脏负担重、消化不良、疲劳
- 利益: 护肝解毒、润肠排毒、增强代谢
- 卖点: 草本小分子、透皮吸收
- 信任: KKM认证、天然草本

FloMix:
- 痛点: 消化不良、腹胀、排便不畅
- 利益: 健胃消食、缓解不适、润肠排毒
- 卖点: 草本精华透皮吸收、减轻肠胃负担
- 信任: KKM认证、安全温和

FleXa:
- 痛点: 关节酸痛、炎症困扰、身体僵硬
- 利益: 活血化瘀、缓解炎症、镇定舒缓
- 卖点: 天然草本、小分子快速渗透
- 信任: KKM认证、不经肠胃
          `,
        },
        {
          role: 'user',
          content: `产品: ${product}\n口吻: ${tone}\n平台: ${platform ?? 'Facebook'}\n\n请严格按「生成篇幅」「视觉排版」「写作框架（PAS）」「输出格式」生成三条不同角度的 Facebook 长帖文案，并满足所有写作要求。`,
        },
      ],
    } as const;

    // First try with the configured model; if it's unavailable (e.g. model_not_found),
    // fall back to a widely-available model to avoid hard failures in dev.
    let res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const primaryErrorText = await res.text();
      // Retry once with a stable fallback model
      const fallbackPayload = { ...payload, model: 'gpt-4o-mini' } as const;
      const retry = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fallbackPayload),
      });
      if (!retry.ok) {
        const fallbackErrorText = await retry.text();
        return NextResponse.json(
          {
            error: 'Upstream OpenAI error',
            detail: primaryErrorText || fallbackErrorText,
            tried: [payload.model, fallbackPayload.model],
          },
          { status: 502 }
        );
      }
      res = retry;
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
          .slice(0, 3);
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
            .slice(0, 3);
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
          return flat.filter(Boolean).slice(0, 3);
        }
        if (typeof input === 'string') {
          try {
            const parsed = JSON.parse(input);
            return finalizeNormalize((parsed as any)?.captions ?? parsed);
          } catch {}
          return [input.replace(/\\n/g, '\n').trim()].filter(Boolean).slice(0, 3);
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


