'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';

const PRODUCTS = ['AirVo', 'TriGuard', 'FloMix', 'TrioCare', 'FleXa'];
const STYLE_OPTIONS_ZH = ['随机', '故事', '痛点', '日常', '技术', '促销'] as const;
const PLATFORMS = ['Facebook'];

export default function CaptionPage() {
  const sb = createClient();
  const [product, setProduct] = useState('');
  const [platform, setPlatform] = useState('Facebook');
  const [styleZh, setStyleZh] = useState<string>('随机');
  const [loading, setLoading] = useState(false);
  const [captions, setCaptions] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [hint, setHint] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  const [userEmail, setUserEmail] = useState<string>('');
  // Keep last 3 opening prefixes to avoid repetitive openings across runs
  const lastPrefixesRef = useRef<string[]>([]);
  // Keep last 2-3 styles to avoid repetitive styles in random mode
  const lastStylesRef = useRef<string[]>([]);

  function extractOpeningPrefix(text: string): string {
    try {
      const s = String(text || '')
        .split('\n')
        .map(t => t.trim())
        .find(t => t.length > 0) || '';
      // Remove leading punctuation/hashtags/emojis roughly, keep letters/numbers/CJK
      const cleaned = s.replace(/^[#\p{P}\s]+/u, '').replace(/\s+/g, '');
      return cleaned.slice(0, 12);
    } catch {
      return '';
    }
  }

  const current = captions[idx] ?? '';
  // Final display fallback: if current is a JSON string like {"captions":[...]},
  // extract the proper item and normalize newlines
  const display = (() => {
    const raw = String(current ?? '');
    try {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed?.captions)
        ? parsed.captions
        : Array.isArray(parsed)
        ? parsed
        : null;
      if (Array.isArray(list) && list.length > 0) {
        const i = ((idx % list.length) + list.length) % list.length;
        return String(list[i] ?? '').replace(/\\n/g, '\n').trim();
      }
    } catch {}
    return raw.replace(/\\n/g, '\n');
  })();

  // Touch swipe refs for mobile navigation
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchStartTimeRef = useRef<number>(0);

  function handleTouchStart(e: React.TouchEvent) {
    const t = e.changedTouches[0];
    touchStartXRef.current = t.clientX;
    touchStartYRef.current = t.clientY;
    touchStartTimeRef.current = Date.now();
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const t = e.changedTouches[0];
    const startX = touchStartXRef.current ?? t.clientX;
    const startY = touchStartYRef.current ?? t.clientY;
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    const dt = Date.now() - touchStartTimeRef.current;
    // Only treat as horizontal swipe when horizontal movement dominates
    const horizontal = Math.abs(dx) > Math.abs(dy);
    const distanceOk = Math.abs(dx) > 40; // px threshold
    const timeOk = dt < 800; // quick gesture
    if (horizontal && distanceOk && timeOk && captions.length > 0) {
      if (dx < 0) {
        nextCaption();
      } else {
        prevCaption();
      }
    }
    touchStartXRef.current = null;
    touchStartYRef.current = null;
  }

  // Remember last selections
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('caption:prefs') || 'null');
      if (saved) {
        if (saved.product) setProduct(saved.product);
        if (saved.platform) setPlatform(saved.platform);
        if (saved.styleZh) setStyleZh(saved.styleZh);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('caption:prefs', JSON.stringify({ product, platform, styleZh }));
    } catch {}
  }, [product, platform, styleZh]);

  // Load last 3 opening prefixes from localStorage on mount
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('caption:lastPrefixes') || 'null');
      if (Array.isArray(saved)) {
        lastPrefixesRef.current = saved.slice(-7).map((v)=>String(v||'')).filter(Boolean);
      }
    } catch {}
    
    // Load last styles for random mode diversity
    try {
      const savedStyles = JSON.parse(localStorage.getItem('caption:lastStyles') || 'null');
      if (Array.isArray(savedStyles)) {
        lastStylesRef.current = savedStyles.slice(-2).map((v)=>String(v||'')).filter(Boolean);
      }
    } catch {}
  }, []);

  // Fetch current auth user email for menu display
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { user } } = await sb.auth.getUser();
        if (alive && user?.email) setUserEmail(user.email);
      } catch {}
    })();
    return () => { alive = false; };
  }, [sb]);

  async function handleSignOut() {
    try {
      await sb.auth.signOut();
    } finally {
      location.href = '/login';
    }
  }

  async function handleGenerate() {
    if (!product) return;
    setLoading(true);
    setHint('');

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product,
          platform,
          style: styleZh,
          ban_opening_prefixes: lastPrefixesRef.current.slice(-7),
          ban_recent_styles: styleZh === '随机' ? lastStylesRef.current.slice(-2) : [],
        }),
      });

      if (!res.ok) {
        const errorData = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorData}`);
      }
      const data = await res.json();
      
      // 如果是随机模式，记录实际使用的风格
      if (styleZh === '随机') {
        const usedStyle = res.headers.get('X-Used-Style') || data.used_style;
        if (usedStyle) {
          const nextStyles = [...lastStylesRef.current, usedStyle].slice(-2);
          lastStylesRef.current = nextStyles;
          try { localStorage.setItem('caption:lastStyles', JSON.stringify(nextStyles)); } catch {}
        }
      }
      // Prefer opening prefix from response header when available
      try {
        const pfxHeaderB64 = res.headers.get('X-Opening-Prefix-B64');
        if (pfxHeaderB64) {
          try {
            const decoded = atob(pfxHeaderB64);
            const next = [...lastPrefixesRef.current, String(decoded).trim()].slice(-7);
            lastPrefixesRef.current = next;
            try { localStorage.setItem('caption:lastPrefixes', JSON.stringify(next)); } catch {}
          } catch {}
        } else {
          const pfxHeader = res.headers.get('X-Opening-Prefix');
          if (pfxHeader) {
            const next = [...lastPrefixesRef.current, String(pfxHeader).trim()].slice(-7);
            lastPrefixesRef.current = next;
            try { localStorage.setItem('caption:lastPrefixes', JSON.stringify(next)); } catch {}
          }
        }
      } catch {}
      // Defensive normalization: always produce string[] even if backend returns a JSON string
      function normalizeCaptions(input: unknown): string[] {
        try {
          if (Array.isArray(input)) {
            if (input.length === 1 && typeof input[0] === 'string') {
              // Sometimes the single item is a JSON string like {"captions":[...]}
              try {
                const maybe = JSON.parse(input[0]);
                if (Array.isArray(maybe?.captions)) return normalizeCaptions(maybe.captions);
                if (typeof maybe?.captions === 'string') {
                  // captions is a single string, not array
                  try {
                    const inner = JSON.parse(maybe.captions);
                    if (Array.isArray(inner)) return normalizeCaptions(inner);
                  } catch {}
                  return [String(maybe.captions).replace(/\\n/g, '\n').trim()].filter(Boolean);
                }
              } catch {}
            }
            const flat: string[] = [];
            for (const el of input) {
              if (typeof el === 'string') {
                const raw = el.trim();
                // If any item itself looks like JSON, try to unpack captions from it
                if (raw.startsWith('{') || raw.startsWith('[') || raw.includes('"captions"')) {
                  try {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed?.captions)) {
                      flat.push(...normalizeCaptions(parsed.captions));
                      continue;
                    }
                    if (typeof parsed?.captions === 'string') {
                      const innerStr = String(parsed.captions);
                      try {
                        const innerParsed = JSON.parse(innerStr);
                        if (Array.isArray(innerParsed)) {
                          flat.push(...normalizeCaptions(innerParsed));
                          continue;
                        }
                      } catch {}
                      flat.push(innerStr.replace(/\\n/g, '\n').trim());
                      continue;
                    }
                    if (Array.isArray(parsed)) {
                      flat.push(...normalizeCaptions(parsed));
                      continue;
                    }
                  } catch {}
                }
                flat.push(raw.replace(/\\n/g, '\n'));
              } else if (Array.isArray(el)) {
                flat.push(...normalizeCaptions(el));
              } else if (el && typeof el === 'object' && 'captions' in (el as any)) {
                flat.push(...normalizeCaptions((el as any).captions));
              } else if (el != null) {
                flat.push(String(el));
              }
            }
            return flat.filter(Boolean);
          }
          if (typeof input === 'string') {
            try {
              const parsed = JSON.parse(input);
              if (Array.isArray(parsed?.captions)) return normalizeCaptions(parsed.captions);
              if (typeof parsed?.captions === 'string') {
                // handle object with captions as a string
                try {
                  const inner = JSON.parse(parsed.captions);
                  if (Array.isArray(inner)) return normalizeCaptions(inner);
                } catch {}
                return [String(parsed.captions).replace(/\\n/g, '\n').trim()].filter(Boolean);
              }
            } catch {}
            return [input.replace(/\\n/g, '\n').trim()].filter(Boolean);
          }
          return [];
        } catch {
          return [];
        }
      }
      const result = normalizeCaptions((data as any)?.captions).slice(0, 1);
      setCaptions(prev => {
        const newCaptions = [...prev, ...result];
        const finalCaptions = newCaptions.slice(-10); // 只保留最新的10个
        setIdx(finalCaptions.length - 1); // 跳转到最新文案（数组末尾）
        return finalCaptions;
      });
      // Update last 3 opening prefixes with backend-provided opening_prefix first; fallback to header/local extraction
      let pfx = '';
      try {
        const backendPfx = (data as any)?.opening_prefix;
        if (typeof backendPfx === 'string') pfx = String(backendPfx).trim();
      } catch {}
      if (!pfx && result && result.length > 0) {
        pfx = extractOpeningPrefix(result[0]);
      }
      if (pfx) {
        const next = [...lastPrefixesRef.current, pfx].slice(-7);
        lastPrefixesRef.current = next;
        try { localStorage.setItem('caption:lastPrefixes', JSON.stringify(next)); } catch {}
      }
    } catch (e) {
      console.error('Generation error:', e);
      setHint(`生成失败: ${(e as Error)?.message || '未知错误'}`);
      setTimeout(() => setHint(''), 5000);
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setHint('已复制到剪贴板 ✅');
      setTimeout(() => setHint(''), 2000);
    } catch (e) {
      setHint('复制失败');
      setTimeout(() => setHint(''), 2000);
    }
  }

  async function handleShare(text: string) {
    if (navigator.share) {
      try {
        await navigator.share({ text });
        setHint('分享成功 ✅');
        setTimeout(() => setHint(''), 2000);
        return;
      } catch (e) {
        // User cancelled or error
      }
    }
    
    // Fallback: copy and open Facebook
    try {
      await navigator.clipboard.writeText(text);
      window.open('https://www.facebook.com/', '_blank');
      setHint('已复制并打开 Facebook ✅');
      setTimeout(() => setHint(''), 2000);
    } catch (e) {
      setHint('分享失败');
      setTimeout(() => setHint(''), 2000);
    }
  }

  const nextCaption = () => setIdx((idx + 1) % captions.length);
  const prevCaption = () => setIdx((idx - 1 + captions.length) % captions.length);

  return (
    <>
      {/* Floating Bubble Navigation */}
      <div className="nav-rail safe-area-top">
        <div className="nav-bubble">
          <div style={{ flex: 1 }} />   {/* 左空 */}
          <div style={{ flex: 1 }} />   {/* 中空（不要标题） */}
          <button
            className="nav-icon"
            aria-label="Open menu"
            onClick={() => setMenuOpen(true)}
          >
            <div className="nav-hamburger"><div /></div>
          </button>
        </div>
      </div>

      <div style={containerStyle} className="safe-area-bottom">
        <div className="container-narrow" style={{...mainStyle, maxWidth: 'unset', marginTop: '16px'}}>
        {/* Header */}
        <header className="header-center">
          <h1 className="title">AI 自动文案生成系统</h1>
          <p className="subtitle">选择产品、风格与平台，点击生成。</p>
        </header>

        {/* Input Card */}
        <motion.div
          className="card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.26, ease: 'easeOut' }}
        >
          <div style={inputGroupStyle}>
            <select
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              className="select"
              style={{ color: product ? 'var(--text)' : 'var(--text-muted)' }}
            >
              <option value="" disabled>请选择产品</option>
              {PRODUCTS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            {/* Style buttons (中文) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {STYLE_OPTIONS_ZH.map((s) => (
                <button
                  key={s}
                  className={s === styleZh ? 'btn-dark' : 'btn-secondary'}
                  onClick={() => setStyleZh(s)}
                  style={{ padding: '10px 8px' }}
                >
                  {s}
                </button>
              ))}
            </div>

            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="select"
              style={{ color: platform ? 'var(--text)' : 'var(--text-muted)' }}
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            <motion.button
              className="btn-premium"
              whileTap={{ scale: 0.98 }}
              whileHover={{ y: loading ? 0 : -2 }}
              onClick={handleGenerate}
              disabled={!product || loading}
            >
              {loading ? '生成中…' : '生成文案'}
            </motion.button>
          </div>
          {/* Divider */}
          <div style={dividerStyle} />
        </motion.div>

        {/* Loading Skeleton */}
        {loading && (
          <motion.div
            style={cardStyle}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
          >
            <div style={skeletonContainerStyle}>
              {[100, 88, 70].map((w, i) => (
                <motion.div
                  key={i}
                  style={{ ...skeletonBarStyle, width: `${w}%` }}
                  animate={{ opacity: [0.3, 0.7, 0.3] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.18 }}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* Results */}
        <AnimatePresence>
          {captions.length > 0 && !loading && (
            <motion.div
              style={cardStyle}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.22 }}
            >
              {/* Navigation (only when multiple captions) */}
              {captions.length > 1 && (
                <div style={navStyle}>
                  <motion.button
                    style={navButtonStyle}
                    whileTap={{ scale: 0.95 }}
                    onClick={prevCaption}
                  >
                    ←
                  </motion.button>
                  
                  <div style={dotsStyle}>
                    {captions.map((_, i) => (
                      <motion.div
                        key={i}
                        className="dot"
                        style={{
                          backgroundColor: i === idx ? 'var(--primary)' : '#D1D5DB',
                        }}
                        whileTap={{ scale: 0.8 }}
                        onClick={() => setIdx(i)}
                      />
                    ))}
                  </div>

                  <motion.button
                    style={navButtonStyle}
                    whileTap={{ scale: 0.95 }}
                    onClick={nextCaption}
                  >
                    →
                  </motion.button>
                </div>
              )}

              {/* Caption Display */}
              <div style={captionContainerStyle}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={idx}
                    className="caption-bubble"
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.18 }}
                    onTouchStart={captions.length > 1 ? handleTouchStart : undefined}
                    onTouchEnd={captions.length > 1 ? handleTouchEnd : undefined}
                  >
                    {display}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Action Buttons */}
              <div style={actionButtonsStyle}>
                <motion.button
                  className="btn-secondary"
                  whileTap={{ scale: 0.98 }}
                  whileHover={{ scale: 1.02 }}
                  onClick={() => handleCopy(display)}
                >
                  复制
                </motion.button>
                
                <motion.button
                  className="btn-dark"
                  whileTap={{ scale: 0.98 }}
                  whileHover={{ scale: 1.02 }}
                  onClick={() => handleShare(display)}
                >
                  分享
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Status Message */}
        <AnimatePresence>
          {hint && (
            <motion.div
              style={{
                ...hintStyle,
                color: hint.includes('失败') ? '#dc2626' : 'var(--success)',
                fontWeight: hint.includes('失败') ? '600' : 'normal',
                backgroundColor: hint.includes('失败') ? '#fef2f2' : 'transparent',
                padding: hint.includes('失败') ? '12px 16px' : '0',
                borderRadius: hint.includes('失败') ? '8px' : '0',
                border: hint.includes('失败') ? '1px solid #fecaca' : 'none',
              }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.22 }}
            >
              {hint}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Right Slide Menu */}
      <AnimatePresence>
        {menuOpen && (
          <>
            {/* Background overlay */}
            <motion.div
              className="menu-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
            />
            {/* Drawer panel */}
            <motion.aside
              className="menu-panel"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.22 }}
            >
              <div className="menu-header">
                <div className="menu-title">菜单</div>
                <button className="icon-btn" onClick={() => setMenuOpen(false)}>✕</button>
              </div>
              <div className="menu-content">
                <div className="menu-item disabled">{userEmail || '未登录'}</div>

                <label style={{ padding: '6px 10px', color:'#9ca3af', fontSize:12 }}>语言 Language</label>
                <select
                  className="menu-select"
                  value={lang}
                  onChange={(e)=>setLang(e.target.value as 'zh'|'en')}
                >
                  <option value="zh">🇨🇳 中文</option>
                  <option value="en">🇬🇧 English</option>
                </select>
                <button className="menu-item" onClick={handleSignOut}>退出登录</button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
      </div>
    </>
  );
}

// Styles
const containerStyle: React.CSSProperties = {
  minHeight: '100dvh',
  backgroundColor: 'var(--bg-page)',
  display: 'flex',
  justifyContent: 'center',
  padding: '20px 16px',
};

const mainStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '420px',
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
  marginTop: '12px',
};

const headerStyle: React.CSSProperties = {
  textAlign: 'center',
  marginBottom: '8px',
};

const titleStyle: React.CSSProperties = {
  fontSize: 'clamp(20px, 4.5vw, 22px)',
  fontWeight: 'bold',
  color: 'var(--text)',
  margin: '0 0 8px 0',
};

const subtitleStyle: React.CSSProperties = {
  fontSize: 'clamp(13px, 3.6vw, 15px)',
  color: 'var(--text-muted)',
  margin: 0,
};

const cardStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-card)',
  borderRadius: '18px',
  padding: '24px',
  border: '1px solid var(--border)',
  boxShadow: 'var(--shadow-soft)',
};

const inputGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
};

const selectStyle: React.CSSProperties = {
  height: '52px',
  fontSize: '16px',
  padding: '0 16px',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  backgroundColor: 'var(--bg-card)',
  cursor: 'pointer',
  outline: 'none',
  transition: 'border-color 0.2s',
};

const buttonStyle: React.CSSProperties = {
  height: '56px',
  fontSize: '15px',
  fontWeight: '600',
  backgroundColor: 'var(--primary)',
  color: 'white',
  border: 'none',
  borderRadius: '14px',
  cursor: 'pointer',
  transition: 'all 0.2s',
};

const navStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '20px',
};

const navButtonStyle: React.CSSProperties = {
  width: '44px',
  height: '44px',
  borderRadius: '12px',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--bg-card)',
  fontSize: '18px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const dotsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  alignItems: 'center',
};

const dotStyle: React.CSSProperties = {
  width: '6px',
  height: '6px',
  borderRadius: '50%',
  cursor: 'pointer',
  transition: 'background-color 0.2s',
};

const captionContainerStyle: React.CSSProperties = {
  minHeight: '120px',
  position: 'relative',
  marginBottom: '24px',
};

const captionTextStyle: React.CSSProperties = {
  fontSize: 'clamp(15px, 3.8vw, 16px)',
  lineHeight: 1.55,
  color: 'var(--text)',
  backgroundColor: 'var(--bg-soft)',
  padding: '16px',
  borderRadius: '12px',
  border: '1px solid var(--border)',
};

const actionButtonsStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '12px',
};

const copyButtonStyle: React.CSSProperties = {
  height: '48px',
  fontSize: '15px',
  fontWeight: '500',
  backgroundColor: 'white',
  color: 'var(--text)',
  border: '1px solid #CBD5E1',
  borderRadius: '12px',
  cursor: 'pointer',
  transition: 'all 0.2s',
};

const shareButtonStyle: React.CSSProperties = {
  height: '48px',
  fontSize: '15px',
  fontWeight: '500',
  backgroundColor: '#111827',
  color: 'white',
  border: 'none',
  borderRadius: '12px',
  cursor: 'pointer',
  transition: 'all 0.2s',
};

const skeletonContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  padding: '20px 0',
};

const skeletonBarStyle: React.CSSProperties = {
  height: '20px',
  backgroundColor: '#E5E7EB',
  borderRadius: '10px',
};

const hintStyle: React.CSSProperties = {
  fontSize: '14px',
  textAlign: 'center',
  fontWeight: '500',
};

const dividerStyle: React.CSSProperties = {
  height: '1px',
  backgroundColor: 'var(--divider)',
  marginTop: '16px',
};