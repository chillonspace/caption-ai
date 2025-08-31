'use client';

import React, { useState } from 'react';

const PRODUCTS = ['AirVo', 'TriGuard', 'FloMix', 'TrioCare', 'FleXa'];
const STYLES = ['朋友介绍口吻', '推销口吻'];
const PLATFORMS = ['Facebook']; // 先只开放 Facebook

export default function CaptionPage() {
  const [product, setProduct] = useState('');
  const [tone, setTone] = useState('');
  const [platform, setPlatform] = useState('Facebook');
  const [loading, setLoading] = useState(false);
  const [captions, setCaptions] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [hint, setHint] = useState('');

  const current = captions[idx] ?? '';

  async function handleGenerate() {
    if (!product || !tone) return;
    setLoading(true);
    setCaptions([]);
    setIdx(0);
    setHint('');

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `你是资深中文社媒文案助手，面向马来西亚 30~55 岁用户。请用【中文为主】，可少量 EN/BM 混搭（<=15%），每条【≤1 个 emoji】，且【必须包含明确 CTA】（如：私讯我、留言"我要"、点击链接等）。输出三条不同文案。`,
            },
            {
              role: 'user',
              content: `产品: ${product}\n风格: ${tone}\n平台: ${platform}`,
            },
          ],
          temperature: 0.7,
        }),
      });

      const data = await res.json();
      let text = data?.choices?.[0]?.message?.content ?? '';

      // 简单切割成数组
      let result = text.split(/\n+/).filter((t: string) => t.trim()).slice(0, 3);
      setCaptions(result);
    } catch (e) {
      setHint('生成失败，请重试。');
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy(text: string) {
    await navigator.clipboard.writeText(text);
    setHint('已复制到剪贴板 ✅');
    setTimeout(() => setHint(''), 2000);
  }

  async function handleShare(text: string) {
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {}
    }
    await navigator.clipboard.writeText(text);
    window.open('https://www.facebook.com/', '_blank');
    setHint('已复制并打开 Facebook');
  }

  return (
    <main className="min-h-[100dvh] bg-white text-black px-4 pt-8 pb-24 max-w-md mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">生成社媒文案</h1>
        <p className="text-sm text-gray-500 mt-1">选择产品、风格与平台，点击生成。</p>
      </header>

      {/* 下拉选择 */}
      <div className="space-y-4">
        <select value={product} onChange={(e) => setProduct(e.target.value)} className="w-full border rounded-xl px-4 py-3 text-base">
          <option value="">请选择产品</option>
          {PRODUCTS.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>

        <select value={tone} onChange={(e) => setTone(e.target.value)} className="w-full border rounded-xl px-4 py-3 text-base">
          <option value="">请选择风格</option>
          {STYLES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>

        <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="w-full border rounded-xl px-4 py-3 text-base">
          {PLATFORMS.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>

        <button
          onClick={handleGenerate}
          disabled={!product || !tone || loading}
          className={`w-full h-12 rounded-2xl text-lg font-semibold ${
            loading ? 'bg-gray-300 text-gray-600' : 'bg-[#1877F2] text-white'
          }`}
        >
          {loading ? '生成中…' : '生成'}
        </button>
      </div>

      {/* 结果 */}
      {captions.length > 0 && (
        <div className="mt-6 rounded-2xl border p-4">
          <div className="flex justify-between mb-2">
            <button onClick={() => setIdx((idx - 1 + captions.length) % captions.length)}>←</button>
            <span>{idx + 1} / {captions.length}</span>
            <button onClick={() => setIdx((idx + 1) % captions.length)}>→</button>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">{current}</div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button onClick={() => handleCopy(current)} className="h-12 rounded-2xl border font-medium">复制</button>
            <button onClick={() => handleShare(current)} className="h-12 rounded-2xl bg-black text-white font-medium">分享</button>
          </div>
        </div>
      )}

      {hint && <p className="mt-3 text-sm text-green-600">{hint}</p>}
    </main>
  );
}
