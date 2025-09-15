import { NextRequest, NextResponse } from 'next/server';
import kbJson from '@/lib/kb/10secherbs_kb.json';
import { STYLE_OPTIONS_ZH } from '@/lib/constants';
import { createServer } from '@/lib/supabase/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

// 临时禁用base64编码，直接返回空字符串来测试
function safeBase64Encode(text: string): string {
  // 临时返回空字符串，避免ByteString错误
  return '';
}

// 记录用户使用次数
async function recordUsage(email: string) {
  try {
    const usageFile = path.join(process.cwd(), 'data', 'usage-stats.json');
    
    // 确保目录存在
    const dataDir = path.dirname(usageFile);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // 读取现有统计
    let stats: Record<string, number> = {};
    if (fs.existsSync(usageFile)) {
      stats = JSON.parse(fs.readFileSync(usageFile, 'utf8'));
    }
    
    // 增加使用次数
    stats[email] = (stats[email] || 0) + 1;
    
    // 保存统计
    fs.writeFileSync(usageFile, JSON.stringify(stats, null, 2));
  } catch (error) {
    console.error('Failed to record usage:', error);
  }
}

export async function POST(req: NextRequest) {
  try {
    // 验证用户登录状态
    const sb = createServer();
    const { data: { user } } = await sb.auth.getUser();
    
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // 记录使用次数
    await recordUsage(user.email);
    
    const { product, platform, ban_opening_prefixes, style, ban_recent_styles } = await req.json();

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

    // Style normalization (中文/英文 → 内部键)
    function normalizeStyle(input?: unknown): 'random' | 'story' | 'pain' | 'daily' | 'tech' | 'promo' {
      const raw = String((input as string) || '').trim();
      const map: Record<string, 'random' | 'story' | 'pain' | 'daily' | 'tech' | 'promo'> = {
        随机: 'random', 故事: 'story', 痛点: 'pain', 日常: 'daily', 技术: 'tech', 促销: 'promo',
        random: 'random', story: 'story', pain: 'pain', daily: 'daily', tech: 'tech', promo: 'promo',
      };
      return map[raw] || 'random';
    }
    
    // Smart random style selection avoiding recent styles
    function pickRandomStyle(banRecentStyles: string[] = []): 'story' | 'pain' | 'daily' | 'tech' | 'promo' {
      const allStyles: ('story' | 'pain' | 'daily' | 'tech' | 'promo')[] = ['story', 'pain', 'daily', 'tech', 'promo'];
      const bannedNormalized = banRecentStyles.map(s => normalizeStyle(s)).filter(s => s !== 'random');
      const available = allStyles.filter(s => !bannedNormalized.includes(s));
      
      // If all styles are banned (unlikely), reset and allow all
      if (available.length === 0) {
        return allStyles[Math.floor(Math.random() * allStyles.length)];
      }
      
      return available[Math.floor(Math.random() * available.length)];
    }

    const OPENING_SCHEMA: Record<'story'|'pain'|'daily'|'tech'|'promo', string[]> = {
      story: [
        '今天这位大哥来我们这里…',
        '前几天一个客户做体检…',
        '测出数据有点吓人…',
        '上星期有个阿姨过来咨询…',
        '遇到一位常客，他说…',
        '昨天一位朋友跟我分享…',
        '刚才有人问我关于…',
        '听说有个用户试了之后…',
        '记得那次有位大叔…',
        '最近碰到好几个人都在问…',
      ],
      pain: [
        '#鼻塞的苦日子…',
        '饭后一阵困，眼皮抬不起来…',
        '久坐到腰酸背痛…',
        '半夜又被憋醒了…',
        '每天早上起来就开始不舒服…',
        '这种感觉真的很无奈…',
        '又是一个睡不好的夜晚…',
        '看到镜子里憔悴的自己…',
        '身体不舒服的时候最明白…',
        '那种有气无力的感觉…',
      ],
      daily: [
        '🌿每天一抹，就像给身体一个温柔的拥抱',
        '早上起来抹一抹，整天轻松点',
        '下班回家先抹一下，放松',
        '睡前的小仪式，抹一抹安心入睡',
        '忙碌一天后，给自己一点呵护',
        '随身带着，需要的时候就用',
        '简单的日常，却带来大改变',
        '每天几分钟，为健康投资',
        '生活小确幸，从涂抹开始',
        '日常护理变得这么简单',
      ],
      tech: [
        '✨ 外用小分子，10秒透皮吸收',
        '德国+日本双技术加持，不经肠胃',
        '轻轻一抹，走微循环',
        '🔬 透皮技术的革新突破',
        '小分子渗透，科技改变生活',
        '外用吸收，绕过肠胃负担',
        '创新配方，传统智慧遇见现代科技',
        '精准渗透，直达需要的地方',
        '技术背后的健康理念',
        '科学配比，每一滴都有意义',
      ],
      promo: [
        '⚡名额有限，想试的现在私讯',
        '📣 本周下单有礼，别错过',
        '🔥 很多人在用，你也可以试试',
        '💥 限时优惠，机会难得',
        '🎁 特别推广，现在最划算',
        '⏰ 今天最后一天，抓紧时间',
        '🛒 库存不多，喜欢的赶快',
        '💌 私讯我了解详情',
        '🏆 口碑推荐，值得信赖',
        '💯 用过的都说好',
      ],
    };

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

    if (!product) {
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
用短句，空行分段，每句只表达一个意思；可用多样化清单符号增强可读性（如：✅ ✨ — 💡 🎯 📍 ⭐ 🌟 💎 🔥 等，避免重复使用相同符号）。
必须基于 <KB> 提供的事实写作，不得发明成分/功效/数据。
技术点低调自然表达（如：小分子/道尔顿/10秒透皮/不进肠胃/KKM），只点到为止，不要堆砌。
禁止医疗承诺或诊断词（如 治愈/奇迹/保证/100% 有效）。
禁止使用模板化开头：例如 "最近/这阵子/有时候/常常/每次/每天/近来/Eh/Hari-hari"等；如出现请改写。
避免重复句式与连接词，多样化表达：用"然后/接着/于是/结果/所以/因此/不过/但是/而且/另外"等不同连接；变化"感觉/觉得/发现/体验/尝试"等动词。
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
 
例4（故事 Story）
前几天有位阿姨来做体检，
医生说：血压又上去了，她整个人都慌了…
-
后来她开始每天按步骤用【TriGuard】，
✅ 不是吞的，是外用抹一抹，更安心
✅ 10秒透皮吸收，走微循环更快
-
“至少不会再被那种窒住的感觉吓到”，她笑说。
#TriGuard #日常保养 #10secHerbs

例5（痛点 Pain）
#鼻塞的人懂的 半夜醒来第N次，只能用嘴吸气 🤧
早上喉咙干到说不出话，整天没精神…
-
AirVo 外用舒缓，
✅ 抹一抹，呼吸顺点
✅ 清清凉凉，睡觉不再被卡住
#AirVo #舒缓鼻塞 #10secHerbs

例6（日常 Daily）
早上出门前，胸口抹一下，像给自己打个小气。
午后犯困，再抹一抹，整个人醒过来。
晚上洗澡后，顺手抹，睡前呼吸更顺。
#10secHerbs #轻松一点点

例7（技术 Tech）
✨ 德国+日本双技术：小分子，10秒透皮；不经肠胃，负担更小。
用在胸口、颈侧这些微血管多的地方，吸收更快。
#10secHerbs #技术加持 #不用吞

例8（促销 Promo）
🔥 想试的现在私讯，名额有限。
这周下单有礼，别错过。
#10secHerbs #PM我 #本周优惠
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
      'Hashtags：必需；数量在 <hashtag_range> 内，置于文末一段；打乱顺序避免固定模式，结合产品名/功效/场景/品牌。',
      'CTA：按平台习惯收尾（FB=PM我/私讯我；小红书=留言+收藏；IG=点链接；TikTok=评论/私信）。',
      '多样性：根据 variation_level 调整语气与开头；即使同变量多次生成，也要有不同感觉；句式、连接词、表达角度都需变化。',
      '输出：只给最终文案正文（纯文本）。'
    ].join('\n');
    // Simple similarity utilities for opening prefix (char-level 3-gram Jaccard)
    function toNgrams(input: string, n = 3): Set<string> {
      const s = (input || '').trim();
      const grams = new Set<string>();
      if (s.length < n) {
        grams.add(s);
        return grams;
      }
      for (let i = 0; i <= s.length - n; i++) {
        grams.add(s.slice(i, i + n));
      }
      return grams;
    }
    function jaccard(a: string, b: string): number {
      const A = toNgrams(a, 3);
      const B = toNgrams(b, 3);
      let inter = 0;
      for (const x of A) if (B.has(x)) inter++;
      const union = A.size + B.size - inter || 1;
      return inter / union;
    }
    function isSimilarToAny(prefix: string, banned: string[], threshold = 0.65): boolean {
      if (!prefix) return false;
      for (const b of banned) {
        if (!b) continue;
        if (b === prefix) return true;
        if (jaccard(prefix, b) >= threshold) return true;
      }
      return false;
    }

    // SLA fallback toggle (default off)
    const ENABLE_SLA = (process.env.SLA_FALLBACK === '1' || process.env.SLA_FALLBACK === 'true');
    // Helper: run one generation with a specific opening schema and variation token
    async function generateOnce(
      openingSchemaName: string,
      variationToken: string,
      banPrefixes: string[],
      styleKey: 'random'|'story'|'pain'|'daily'|'tech'|'promo',
      options?: { timeoutMs?: number; quick?: boolean }
    ) {
      const schema = OPENING_SCHEMAS.find(s => s.name === openingSchemaName) || pickSchema();
      const openingBlock = JSON.stringify({ name: schema.name, tip: schema.tip }, null, 2);
      const platformProfileBlock = platformProfileBlockBase; // unchanged core profile
      const styleBlock = JSON.stringify({ type: styleKey }, null, 2);
      const STYLE_RULES: Record<'story'|'pain'|'daily'|'tech'|'promo', string[]> = {
        story: [
          '第一人称/身边人故事，三段骨架：起因→转折→舒缓/改变',
          '细节化描写（场景/动作/感受），不用“你是否/有没有”类问句',
          '收尾自然口语+轻 CTA（PM我/私讯我）',
        ],
        pain: [
          '先共鸣痛点（具体场景+感受），再说改善方向',
          '句子短、力度强，避免形容词堆叠',
          '收尾用“轻解决”语气，不承诺疗效',
        ],
        daily: [
          '日常作息/场景化流程（早-中-晚/出门-回家）',
          '口语自然，像给朋友的小建议',
          '清单可选 1–2 条，简短有力',
        ],
        tech: [
          '技术点只 1 句解释原理 + 1 句说明影响',
          '避免堆砌专业词，保持通俗',
          '强调“不进肠胃/小分子/10秒透皮”一类点到为止',
        ],
        promo: [
          '突出稀缺/限时/赠品等，语气轻快，不强推',
          '明确 CTA（PM我/私讯我/本周优惠）',
          'Hashtags 贴近活动',
        ],
      };
      const styleRulesBlock = JSON.stringify({ rules: STYLE_RULES[styleKey === 'random' ? 'story' : styleKey] || [] }, null, 2);
      // Emoji sets by style, grouped in categories for diversity
      const EMOJI_SETS: Record<'story'|'pain'|'daily'|'tech'|'promo', Record<string, string[]>> = {
        story: {
          emotion: ['😣','😵‍💫','😮‍💨','🙂','😌','🥹','😉','😃','😊','🥰','😋','😎','🤗','😇','🥺','😍','🤩','😘','🙃','😄'],
          nature: ['🌿','🍃','🌤️','🌙','🪴','🍋','🌊','✨','⭐️','🌸','🌺','🌻','🌞','🌱','🍀','🌾','🌈','☘️','🌝','🌼','🌷'],
          daily: ['👜','🍽️','☕️','🏠','🛏️','📅','🚶‍♂️','🧭','🎒','🥤','🍵','🏃‍♀️','📖','🕐','👩‍💻','🧘‍♀️','🚗','🚌','📱','🎧'],
        },
        pain: {
          emotion: ['😣','🤧','🥵','🥶','😖','😫','😓','😰','😨','😢','🥴','😵','🤕','😪','🙄','😤','😮‍💨','😩'],
          health: ['🫁','🫀','🧠','🦴','🤒','🩺','💊','🏥','⚕️','🩹','🌡️','💉','🧑‍⚕️','👩‍⚕️','🚑','🔬'],
          relief: ['😮‍💨','🙂','😌','🌿','🍃','✨','😊','🥰','😇','🌱','💚','🤲','🙏','💆‍♀️','🛀','🧘‍♂️'],
        },
        daily: {
          routine: ['🌅','☀️','🌙','🛁','🛏️','🏠','👜','🚶‍♀️','🌄','🌇','🌃','⏰','🕐','🕕','🕘','🚿','🧴','🪥','👔','👗','🧥'],
          nature: ['🌿','🍃','🌤️','🪴','🍋','🌱','🌾','🌸','🌺','🌻','🌞','🍀','☘️','🌈','🌝','🌼','🌷','🌲'],
          emotion: ['🙂','😉','😌','😮‍💨','😊','🥰','😋','😇','🤗','☺️','😄','🙃','😍','😘','🥺'],
        },
        tech: {
          tech: ['✨','⚙️','🧪','🔬','📈','🧠','💻','📱','🖥️','⌚️','🔧','🔩','💡','🛠️','📊','📉','💾','🔌','🎛️','📡'],
          speed: ['⏱️','⚡️','🚀','🎯','💨','🏃‍♂️','🏎️','✈️','🚁','⚙️','🔥','💫','⭐️','🌟'],
          clean: ['🧼','💧','🌿','🧽','🚿','💎','❄️','💙','🤍','✨','🌊','💠','🔷'],
        },
        promo: {
          promo: ['📣','🎁','💬','🛒','🏷️','💡','📢','🎉','🎊','🛍️','💳','💰','🏆','🎖️','🏅','🎪','📦','🛫','💌'],
          hype: ['🔥','⚡️','🚀','⭐️','✨','💥','💯','🌟','🎆','🎇','🔆','💫','⚡','🌠','💥','🎯','🚨'],
          time: ['⏰','🗓️','⏳','⏱️','🕐','📅','⌛','🔔','📆','🚨','⚠️','🏃‍♂️','💨'],
        },
      };
      const emojiSetsBlock = JSON.stringify(EMOJI_SETS[styleKey === 'random' ? 'story' : styleKey], null, 2);
      const openings = styleKey === 'random'
        ? OPENING_SCHEMA[(['story','pain','daily','tech','promo'])[Math.floor(Math.random()*5)] as 'story']
        : OPENING_SCHEMA[styleKey] || OPENING_SCHEMA['story'];
      const openingSeedBlock = JSON.stringify({ openings }, null, 2);
      const quickRules = options?.quick
        ? '\n[QUICK]\n输出为120–180字，≤2条清单（可选），必须包含 hashtags；保持口语自然。'
        : '';
      // 随机清单符号池
      const LIST_SYMBOLS = ['✅', '✨', '—', '💡', '🎯', '📍', '⭐', '🌟', '💎', '🔥', '🌿', '💫', '🎪', '🚀', '⚡', '💯'];
      const shuffledSymbols = LIST_SYMBOLS.sort(() => Math.random() - 0.5).slice(0, 5);
      const symbolsBlock = JSON.stringify({ list_symbols: shuffledSymbols }, null, 2);
      
      const userPrompt = [
        `variation_token: ${variationToken}`,
        '<OPENING_SCHEMA>', openingBlock,
        '',
        '<STYLE>', styleBlock,
        '',
        '<STYLE_RULES>', styleRulesBlock,
        '',
        '<OPENING_SEEDS>', openingSeedBlock,
        '',
        '<EMOJI_SETS>', emojiSetsBlock,
        '',
        '<LIST_SYMBOLS>', symbolsBlock,
        '',
        '<PLATFORM_PROFILE>', platformProfileBlock,
        '',
        '<KB>', kbBlock,
        '',
        '<BAN_OPENING_PREFIXES>', JSON.stringify({ ban_opening_prefixes: Array.isArray(banPrefixes) ? banPrefixes : [] }, null, 2),
        '',
        '<OUTPUT_RULES>', OUTPUT_RULES,
        '\n要求：第一句开头需从 <OPENING_SEEDS>.openings 任选其一进行自然改写（不要逐字复读）；同时符合 <OPENING_SCHEMA>。禁止与 <BAN_OPENING_PREFIXES> 中任一前缀相同或仅作轻微改写（同义替换/标点/emoji 变化也算相似）。如有冲突请换一种说法。开头要自然、有信息量，避免空泛。' +
        '\nEmoji 多样性：从 <EMOJI_SETS> 的不同类别各取，避免重复；每段最多 1 个，总量按 <emoji_range>；不要一行堆两个。' +
        '\n清单符号多样性：如需使用清单，请从 <LIST_SYMBOLS> 中随机选择不同符号，避免全部使用相同符号。' + quickRules
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

      const controller = new AbortController();
      const timeoutId = options?.timeoutMs && options.timeoutMs > 0
        ? setTimeout(() => controller.abort(), options!.timeoutMs)
        : null;
      let res: Response;
      try {
        res = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      } catch (e: any) {
        if (e?.name === 'AbortError') {
          if (timeoutId) clearTimeout(timeoutId);
          return { timeout: true } as const;
        }
        if (timeoutId) clearTimeout(timeoutId);
        return { error: String(e?.message || e) } as const;
      }
      if (timeoutId) clearTimeout(timeoutId);
      if (!res.ok) {
        let errorText: string;
        try {
          errorText = await res.text();
        } catch (e) {
          errorText = `HTTP ${res.status}: ${res.statusText}`;
        }
        return { error: `Upstream model error: ${errorText}` } as const;
      }

      let data: any;
      try {
        data = await res.json();
      } catch (e) {
        return { error: `Failed to parse JSON response: ${String(e)}` } as const;
      }
      
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
      ? (ban_opening_prefixes as unknown[]).map(v => String(v || '')).filter(Boolean).slice(-7)
      : [];

    // Determine actual style to use (with smart random selection)
    const inputStyleKey = normalizeStyle(style);
    const banRecentStylesList: string[] = Array.isArray(ban_recent_styles) 
      ? (ban_recent_styles as unknown[]).map(v => String(v || '')).filter(Boolean)
      : [];
    
    const actualStyleKey = inputStyleKey === 'random' 
      ? pickRandomStyle(banRecentStylesList)
      : inputStyleKey;
    
    // Attempt up to 2 times: initial + one retry with different schema if opening collides
    const styleKey = actualStyleKey;
    const firstSchema = pickSchema();
    const first = await generateOnce(
      firstSchema.name,
      Math.random().toString(36).slice(2) + Date.now(),
      banList,
      styleKey,
      ENABLE_SLA ? { timeoutMs: 8000 } : undefined
    );
    if ('error' in first) {
      return NextResponse.json({ error: first.error }, { status: 502 });
    }
    if ('timeout' in first && first.timeout === true) {
      // SLA quick fallback
      const retryQuick = await generateOnce(
        pickSchema().name,
        Math.random().toString(36).slice(2) + Date.now(),
        banList,
        styleKey,
        ENABLE_SLA ? { timeoutMs: 1500, quick: true } : { quick: true }
      );
      if (!('error' in retryQuick) && !('timeout' in retryQuick)) {
        const p64 = safeBase64Encode(retryQuick.openingPrefix || '');
        const styleMapping: Record<string, string> = { story: '故事', pain: '痛点', daily: '日常', tech: '技术', promo: '促销' };
        const usedStyleChinese = styleMapping[styleKey] || styleKey;
        return new NextResponse(
          JSON.stringify({ captions: retryQuick.finalCaptions, used_style: usedStyleChinese }),
          { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, max-age=0', 'X-Style-Used': usedStyleChinese, 'X-Used-Style': usedStyleChinese, 'X-Opening-Prefix-B64': p64 } }
        );
      }
      // Ultimate local fallback (very short template from KB)
      const flatFacts = Object.values(facts).flat().filter(Boolean) as string[];
      const pick = (arr: string[]) => arr[Math.floor(Math.random()*arr.length)] || '';
      const p1 = pick(facts.体验) || pick(facts.功效) || pick(flatFacts);
      const p2 = pick(facts.功效) || pick(flatFacts);
      const tags = ['#10secHerbs', `#${productKey}`].concat([pick(flatFacts), pick(flatFacts)].filter(Boolean).slice(0,2)).slice(0,5).map(t=>`#${String(t).replace(/\s+/g,'')}`);
      const local = [p1, p2, '', tags.join(' ')].filter(Boolean).join('\n');
      {
        const p64 = safeBase64Encode(extractOpeningPrefix(local) || '');
        const styleMapping: Record<string, string> = { story: '故事', pain: '痛点', daily: '日常', tech: '技术', promo: '促销' };
        const usedStyleChinese = styleMapping[styleKey] || styleKey;
        return new NextResponse(
          JSON.stringify({ captions: [local], used_style: usedStyleChinese }),
          { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, max-age=0', 'X-Style-Used': usedStyleChinese, 'X-Used-Style': usedStyleChinese, 'X-Opening-Prefix-B64': p64 } }
        );
      }
    }
    const firstTooShort = !first.openingPrefix || first.openingPrefix.length < 5;
    if ((first.openingPrefix && isSimilarToAny(first.openingPrefix, banList, 0.65)) || firstTooShort) {
      const retrySchema = pickSchema(first.schemaUsed);
      const second = await generateOnce(retrySchema.name, Math.random().toString(36).slice(2) + Date.now(), banList, styleKey, ENABLE_SLA ? { timeoutMs: 8000 } : undefined);
      if ('error' in second) {
        // fallback to first if retry failed upstream
        {
          const p64 = safeBase64Encode(first.openingPrefix || '');
        const styleMapping: Record<string, string> = { story: '故事', pain: '痛点', daily: '日常', tech: '技术', promo: '促销' };
        const usedStyleChinese = styleMapping[styleKey] || styleKey;
        return new NextResponse(
          JSON.stringify({ captions: first.finalCaptions, used_style: usedStyleChinese }),
          { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, max-age=0', 'X-Style-Used': usedStyleChinese, 'X-Used-Style': usedStyleChinese, 'X-Opening-Prefix-B64': p64 } }
        );
        }
      }
      if ('timeout' in second && second.timeout === true) {
        // quick fallback for retry branch as well
        const quick = await generateOnce(
          pickSchema(retrySchema.name).name,
          Math.random().toString(36).slice(2) + Date.now(),
          banList,
          styleKey,
          ENABLE_SLA ? { timeoutMs: 1500, quick: true } : { quick: true }
        );
        if (!('error' in quick) && !('timeout' in quick)) {
          const p64 = safeBase64Encode(quick.openingPrefix || '');
          const styleMapping: Record<string, string> = { story: '故事', pain: '痛点', daily: '日常', tech: '技术', promo: '促销' };
          const usedStyleChinese = styleMapping[styleKey] || styleKey;
          return new NextResponse(
            JSON.stringify({ captions: quick.finalCaptions, used_style: usedStyleChinese }),
            { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, max-age=0', 'X-Style-Used': usedStyleChinese, 'X-Used-Style': usedStyleChinese, 'X-Opening-Prefix-B64': p64 } }
          );
        }
        const local2 = first.finalCaptions[0] || '';
        {
          const p64 = safeBase64Encode(extractOpeningPrefix(local2) || '');
          const styleMapping: Record<string, string> = { story: '故事', pain: '痛点', daily: '日常', tech: '技术', promo: '促销' };
          const usedStyleChinese = styleMapping[styleKey] || styleKey;
          return new NextResponse(
            JSON.stringify({ captions: [local2], used_style: usedStyleChinese }),
            { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, max-age=0', 'X-Style-Used': usedStyleChinese, 'X-Used-Style': usedStyleChinese, 'X-Opening-Prefix-B64': p64 } }
          );
        }
      }
      // if second still collides, return second anyway (已重试一次)
      {
        const p64 = safeBase64Encode(second.openingPrefix || '');
        const styleMapping: Record<string, string> = { story: '故事', pain: '痛点', daily: '日常', tech: '技术', promo: '促销' };
        const usedStyleChinese = styleMapping[styleKey] || styleKey;
        return new NextResponse(
          JSON.stringify({ captions: second.finalCaptions, used_style: usedStyleChinese }),
          { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, max-age=0', 'X-Style-Used': usedStyleChinese, 'X-Used-Style': usedStyleChinese, 'X-Opening-Prefix-B64': p64 } }
        );
      }
    }

    // first is fine
    {
      const p64 = safeBase64Encode(first.openingPrefix || '');
      const styleMapping: Record<string, string> = { story: '故事', pain: '痛点', daily: '日常', tech: '技术', promo: '促销' };
      const usedStyleChinese = styleMapping[styleKey] || styleKey;
      
      return new NextResponse(
        JSON.stringify({ captions: first.finalCaptions, used_style: usedStyleChinese }),
        { status: 200, headers: { 
          'Content-Type': 'application/json', 
          'Cache-Control': 'no-store, max-age=0', 
          'X-Style-Used': usedStyleChinese, 
          'X-Used-Style': usedStyleChinese,
          'X-Opening-Prefix-B64': p64 
        } }
      );
    }
  } catch (err: unknown) {
    return NextResponse.json(
      { error: 'Request failed', detail: (err as Error)?.message ?? String(err) },
      { status: 500 }
    );
  }
}


