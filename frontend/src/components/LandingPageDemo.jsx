import React, { useState } from 'react';
import { ArrowRight, Sun, Moon } from 'lucide-react';
import MonochromeBackground from './MonochromeBackground.jsx';

/**
 * Minimal landing page hero preview demonstrating MonochromeBackground
 * in both dark (#000000) and light (#FFFFFF) themes.
 */
export default function LandingPageDemo({ onPrimaryAction }) {
  const [theme, setTheme] = useState('dark');
  const isDark = theme === 'dark';

  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100dvh',
        width: '100%',
        color: isDark ? '#FFFFFF' : '#0A0A0A',
        fontFamily: 'var(--font-body, system-ui, -apple-system, sans-serif)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <MonochromeBackground theme={theme} density={1} speed={0.85} />

      <header
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: 1040,
          width: '100%',
          margin: '0 auto',
          padding: '20px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: isDark ? '#FFFFFF' : '#0A0A0A',
              color: isDark ? '#000000' : '#FFFFFF',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            PU
          </span>
          <span style={{ fontSize: '1.05rem', fontWeight: 600, letterSpacing: '-0.02em' }}>
            PairUP
          </span>
        </div>

        <button
          type="button"
          onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            height: 36,
            padding: '0 14px',
            borderRadius: 8,
            border: `1px solid ${isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)'}`,
            background: isDark ? 'rgba(10,10,10,0.75)' : 'rgba(255,255,255,0.85)',
            color: isDark ? '#FFFFFF' : '#0A0A0A',
            fontSize: '0.84rem',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          {isDark ? <Sun size={15} strokeWidth={1.5} /> : <Moon size={15} strokeWidth={1.5} />}
          <span>{isDark ? 'Light mode' : 'Dark mode'}</span>
        </button>
      </header>

      <main
        style={{
          position: 'relative',
          zIndex: 1,
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 24px 80px',
        }}
      >
        <div style={{ maxWidth: 640, width: '100%', textAlign: 'left' }}>
          <h1
            style={{
              fontSize: 'clamp(2.25rem, 5vw, 3.75rem)',
              fontWeight: 500,
              lineHeight: 1.06,
              letterSpacing: '-0.03em',
              margin: '0 0 20px',
            }}
          >
            Real-time rooms and anonymous 1-on-1 matching
          </h1>
          <p
            style={{
              fontSize: '1.05rem',
              lineHeight: 1.6,
              color: isDark ? '#A3A3A3' : '#525252',
              margin: '0 0 32px',
              maxWidth: 520,
            }}
          >
            Quiet, browser-native conversations with zero clutter. Join public topic rooms with Instant Pass or match anonymously by shared interests.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={onPrimaryAction}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                height: 44,
                padding: '0 22px',
                borderRadius: 8,
                border: `1px solid ${isDark ? '#FFFFFF' : '#0A0A0A'}`,
                background: isDark ? '#FFFFFF' : '#0A0A0A',
                color: isDark ? '#000000' : '#FFFFFF',
                fontSize: '0.92rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <span>Enter PairUP</span>
              <ArrowRight size={16} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
