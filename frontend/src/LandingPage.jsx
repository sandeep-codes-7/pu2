import React from 'react';
import './LandingPage.css';
import {
  Zap, Hash, Shuffle, ArrowRight, RefreshCw, Sun, Moon
} from 'lucide-react';

const RANDOM_GUEST_NAMES = [
  "NeonWolf", "CyberPanda", "HyperTurtle", "NovaOtter", "ZenFox",
  "PixelRider", "CodeNinja", "AstroPenguin", "QuantumKoala", "SolarTiger",
  "EchoSparrow", "VibeRabbit", "AlphaOtter", "ShadowFox", "CosmicPanda"
];

export default function LandingPage({
  demoUsername,
  setDemoUsername,
  demoName,
  setDemoName,
  demoGender,
  setDemoGender,
  handleDemoLogin,
  isLoggedIn,
  onLaunchApp,
  authError,
  loginNotice,
  theme,
  toggleTheme
}) {
  const handleRandomizeGuest = () => {
    const randomName = RANDOM_GUEST_NAMES[Math.floor(Math.random() * RANDOM_GUEST_NAMES.length)];
    setDemoUsername(randomName);
  };

  return (
    <div className="lp-shell">
      {/* Quiet Top Bar */}
      <header className="lp-header">
        <div className="lp-header-inner">
          <a href="/" className="lp-brand">
            <span className="lp-brand-mark">PU</span>
            <span className="lp-brand-name">PairUP</span>
          </a>

          <div className="lp-header-right">
            <nav className="lp-nav" aria-label="Documentation">
              <a href="/about" className="lp-nav-link">About</a>
              <a href="/guidelines" className="lp-nav-link">Guidelines</a>
            </nav>
            {toggleTheme && (
              <button
                type="button"
                className="lp-theme-btn"
                onClick={toggleTheme}
                aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
                title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              >
                {theme === "dark" ? <Sun size={16} strokeWidth={1.5} /> : <Moon size={16} strokeWidth={1.5} />}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Split: Briefing + Login Card */}
      <main className="lp-main">
        <div className="lp-grid">
          {/* Left: Concise Product Briefing */}
          <section className="lp-brief" aria-label="About PairUP">
            <h1 className="lp-title">
              Real-time rooms and anonymous 1-on-1 matching
            </h1>
            <p className="lp-lead">
              PairUP is a browser-native chat space for public topic rooms, direct messaging, and interest-based anonymous matching. Jump in with a temporary guest pass or sign in with Google for persistent chats and friends.
            </p>

            <ul className="lp-features">
              <li className="lp-feature-item">
                <span className="lp-feature-icon" aria-hidden="true">
                  <Hash size={16} strokeWidth={1.5} />
                </span>
                <div className="lp-feature-copy">
                  <span className="lp-feature-title">Public and private rooms</span>
                  <span className="lp-feature-desc">Join open spaces like #general or create moderated rooms with invite links.</span>
                </div>
              </li>

              <li className="lp-feature-item">
                <span className="lp-feature-icon" aria-hidden="true">
                  <Shuffle size={16} strokeWidth={1.5} />
                </span>
                <div className="lp-feature-copy">
                  <span className="lp-feature-title">Anonymous Mate matching</span>
                  <span className="lp-feature-desc">Match 1-on-1 by shared interests under animal personas and unlock profiles only on mutual consent.</span>
                </div>
              </li>

              <li className="lp-feature-item">
                <span className="lp-feature-icon" aria-hidden="true">
                  <Zap size={16} strokeWidth={1.5} />
                </span>
                <div className="lp-feature-copy">
                  <span className="lp-feature-title">Instant Pass guest access</span>
                  <span className="lp-feature-desc">Pick a handle with no email or password—temporary guest data clears automatically when you leave.</span>
                </div>
              </li>
            </ul>
          </section>

          {/* Right: Inline Login & Instant Pass Card */}
          <section className="lp-auth-col" aria-label="Sign in">
            <div className="lp-auth-card">
              {isLoggedIn ? (
                <div className="lp-signed-in">
                  <h2>Welcome back to PairUP</h2>
                  <p>Your session is active. Return to your rooms and direct messages.</p>
                  <button
                    type="button"
                    className="lp-btn-primary"
                    onClick={onLaunchApp}
                  >
                    <span>Open PairUP</span>
                    <ArrowRight size={16} strokeWidth={1.5} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="lp-auth-head">
                    <h2>Sign in to PairUP</h2>
                    <p>Use Google for permanent friends and Mate, or enter as a guest</p>
                  </div>

                  {loginNotice && (
                    <div className="lp-alert" role="alert">
                      {loginNotice}
                    </div>
                  )}

                  {authError && (
                    <div className="lp-alert" role="alert">
                      {authError}
                    </div>
                  )}

                  {/* Google OAuth Button Target */}
                  <div id="google-signin-btn" className="lp-google-slot" />

                  <div className="lp-divider">
                    <span>or Instant Pass</span>
                  </div>

                  <form onSubmit={handleDemoLogin} className="lp-form">
                    <div className="lp-field">
                      <label htmlFor="lp-guest-username">Username</label>
                      <div className="lp-input-row">
                        <input
                          id="lp-guest-username"
                          type="text"
                          placeholder="e.g. StarVoyager"
                          value={demoUsername}
                          onChange={e => setDemoUsername(e.target.value)}
                          required
                          autoComplete="username"
                          className="lp-input"
                        />
                        <button
                          type="button"
                          className="lp-btn-secondary lp-random-btn"
                          onClick={handleRandomizeGuest}
                          title="Generate random username"
                        >
                          <RefreshCw size={14} strokeWidth={1.5} />
                          <span>Random</span>
                        </button>
                      </div>
                    </div>

                    <div className="lp-form-two-col">
                      <div className="lp-field">
                        <label htmlFor="lp-guest-name">Display name</label>
                        <input
                          id="lp-guest-name"
                          type="text"
                          placeholder="Optional"
                          value={demoName}
                          onChange={e => setDemoName(e.target.value)}
                          className="lp-input"
                        />
                      </div>

                      <div className="lp-field">
                        <label htmlFor="lp-guest-gender">Gender</label>
                        <select
                          id="lp-guest-gender"
                          value={demoGender}
                          onChange={e => setDemoGender(e.target.value)}
                          className="lp-input lp-select"
                        >
                          <option value="Prefer not to say">Prefer not to say</option>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                    </div>

                    <button type="submit" className="lp-btn-primary">
                      <Zap size={15} strokeWidth={1.5} />
                      <span>Enter with Instant Pass</span>
                    </button>
                  </form>

                  <p className="lp-auth-footnote">
                    Instant Pass sessions are temporary and cleared on logout.
                  </p>
                </>
              )}
            </div>
          </section>
        </div>
      </main>

      {/* Slim Footer */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <span className="lp-copyright">© {new Date().getFullYear()} PairUP (pairup.cc)</span>
          <div className="lp-footer-links">
            <a href="/about">About</a>
            <a href="/guidelines">Guidelines</a>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
