'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const PRODUCTS = ['AirVo', 'TriGuard', 'FloMix', 'TrioCare', 'FleXa'];
const STYLES = ['朋友介绍口吻', '推销口吻'];
const PLATFORMS = ['Facebook'];

export default function CaptionPage() {
  const [product, setProduct] = useState('');
  const [tone, setTone] = useState('');
  const [platform, setPlatform] = useState('Facebook');
  const [loading, setLoading] = useState(false);
  const [captions, setCaptions] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [hint, setHint] = useState('');

  const current = captions[idx] ?? '';

  // Remember last selections
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('caption:prefs') || 'null');
      if (saved) {
        if (saved.product) setProduct(saved.product);
        if (saved.tone) setTone(saved.tone);
        if (saved.platform) setPlatform(saved.platform);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('caption:prefs', JSON.stringify({ product, tone, platform }));
    } catch {}
  }, [product, tone, platform]);

  async function handleGenerate() {
    if (!product || !tone) return;
    setLoading(true);
    setCaptions([]);
    setIdx(0);
    setHint('');

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product, tone, platform }),
      });

      if (!res.ok) throw new Error('Bad response');
      const data = await res.json();
      const result: string[] = Array.isArray(data?.captions) ? data.captions : [];
      setCaptions(result);
    } catch (e) {
      setHint('生成失败，请重试');
      setTimeout(() => setHint(''), 3000);
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
    <div style={containerStyle} className="safe-area-bottom">
      <div style={mainStyle}>
        {/* Header */}
        <header style={headerStyle}>
          <h1 style={titleStyle}>生成社媒文案</h1>
          <p style={subtitleStyle}>选择产品、风格与平台，点击生成。</p>
        </header>

        {/* Input Card */}
        <motion.div
          style={cardStyle}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.26, ease: 'easeOut' }}
        >
          <div style={inputGroupStyle}>
            <select
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              style={{ ...selectStyle, color: product ? 'var(--text)' : 'var(--text-muted)' }}
            >
              <option value="" disabled>请选择产品</option>
              {PRODUCTS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            <select
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              style={{ ...selectStyle, color: tone ? 'var(--text)' : 'var(--text-muted)' }}
            >
              <option value="" disabled>请选择风格</option>
              {STYLES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              style={{ ...selectStyle, color: platform ? 'var(--text)' : 'var(--text-muted)' }}
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            <motion.button
              style={{
                ...buttonStyle,
                opacity: !product || !tone || loading ? 0.6 : 1,
                cursor: !product || !tone || loading ? 'not-allowed' : 'pointer',
              }}
              whileTap={{ scale: 0.98 }}
              whileHover={{ y: loading ? 0 : -2 }}
              onClick={handleGenerate}
              disabled={!product || !tone || loading}
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
              {/* Navigation */}
              <div style={navStyle}>
                <motion.button
                  style={navButtonStyle}
                  whileTap={{ scale: 0.95 }}
                  onClick={prevCaption}
                  disabled={captions.length <= 1}
                >
                  ←
                </motion.button>
                
                <div style={dotsStyle}>
                  {captions.map((_, i) => (
                    <motion.div
                      key={i}
                      style={{
                        ...dotStyle,
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
                  disabled={captions.length <= 1}
                >
                  →
                </motion.button>
              </div>

              {/* Caption Display */}
              <div style={captionContainerStyle}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={idx}
                    style={captionTextStyle}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.18 }}
                  >
                    {current}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Action Buttons */}
              <div style={actionButtonsStyle}>
                <motion.button
                  style={copyButtonStyle}
                  whileTap={{ scale: 0.98 }}
                  whileHover={{ scale: 1.02 }}
                  onClick={() => handleCopy(current)}
                >
                  复制
                </motion.button>
                
                <motion.button
                  style={shareButtonStyle}
                  whileTap={{ scale: 0.98 }}
                  whileHover={{ scale: 1.02 }}
                  onClick={() => handleShare(current)}
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
                color: hint.includes('失败') ? 'var(--error)' : 'var(--success)',
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
    </div>
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