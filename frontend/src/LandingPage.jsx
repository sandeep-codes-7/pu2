import React, { useState, useEffect } from 'react';
import './LandingPage.css';
import {
  Sparkles, Zap, Shield, Users, MessageSquare, ArrowRight,
  Heart, CheckCircle2, Lock, Flame, Info, ChevronDown, Check,
  HelpCircle, Compass, UserCheck, LogIn, ExternalLink, Globe,
  Hash, Crown, X, RefreshCw, Smile, ArrowUpRight
} from 'lucide-react';

const RANDOM_GUEST_NAMES = [
  "NeonWolf", "CyberPanda", "HyperTurtle", "NovaOtter", "ZenFox",
  "PixelRider", "CodeNinja", "AstroPenguin", "QuantumKoala", "SolarTiger",
  "EchoSparrow", "VibeRabbit", "AlphaOtter", "ShadowFox", "CosmicPanda"
];

const SAMPLE_INTERESTS = [
  "💻 Coding", "🎮 Gaming", "🎧 Music", "🚀 AI & Tech",
  "🎨 Design", "☕ Chill Talk", "📚 Anime", "🎬 Movies",
  "💡 Startups", "🧘 Fitness"
];

export default function LandingPage({
  onOpenAuth,
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
  showAuthModal,
  setShowAuthModal
}) {
  // Interactive Live Demo states
  const [heroWidgetTab, setHeroWidgetTab] = useState("pass"); // "pass" | "mate"
  const [selectedInterests, setSelectedInterests] = useState(["💻 Coding", "🎮 Gaming", "🚀 AI & Tech"]);
  const [simStep, setSimStep] = useState("idle"); // "idle" | "matching" | "matched" | "mutual"
  const [simPartner, setSimPartner] = useState({ name: "Fox", emoji: "🦊", interests: "Gaming, Coding" });
  const [faqOpen, setFaqOpen] = useState(null);

  // Quick random guest generator
  const handleRandomizeGuest = () => {
    const randomName = RANDOM_GUEST_NAMES[Math.floor(Math.random() * RANDOM_GUEST_NAMES.length)];
    setDemoUsername(randomName);
  };

  // Toggle interest in simulation
  const toggleInterest = (interest) => {
    setSelectedInterests(prev =>
      prev.includes(interest)
        ? (prev.length > 1 ? prev.filter(i => i !== interest) : prev)
        : [...prev, interest]
    );
  };

  // Run Mate Match Simulation
  const handleRunSimulation = () => {
    setSimStep("matching");
    setTimeout(() => {
      const partners = [
        { name: "Fox", emoji: "🦊", interests: "Coding, Gaming" },
        { name: "Panda", emoji: "🐼", interests: "AI, Chill Talk" },
        { name: "Wolf", emoji: "🐺", interests: "Gaming, Tech" },
        { name: "Otter", emoji: "🦦", interests: "Design, Music" }
      ];
      setSimPartner(partners[Math.floor(Math.random() * partners.length)]);
      setSimStep("matched");
    }, 1800);
  };

  const handleSimExpressInterest = () => {
    setSimStep("mutual");
  };

  const toggleFaq = (index) => {
    setFaqOpen(prev => (prev === index ? null : index));
  };

  return (
    <div className="landing-page-container">
      {/* ── STICKY GLASS NAVBAR ── */}
      <header className="landing-navbar">
        <div className="landing-navbar-inner">
          <a href="#" className="landing-brand">
            <div className="landing-brand-icon">PU</div>
            <span className="brand-gradient landing-brand-text">PairUP</span>
          </a>

          <nav className="landing-nav-links">
            <a href="#instant-pass" className="landing-nav-link">Instant Pass</a>
            <a href="#mate" className="landing-nav-link">Mate Match</a>
            <a href="#rooms" className="landing-nav-link">Public Rooms</a>
            <a href="#features" className="landing-nav-link">Features</a>
            <a href="#faq" className="landing-nav-link">FAQ</a>
          </nav>

          <div className="landing-nav-actions">
            {isLoggedIn ? (
              <button
                type="button"
                className="btn-primary landing-cta-btn"
                onClick={onLaunchApp}
              >
                Go to Chats <ArrowRight size={16} />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="landing-btn-secondary"
                  onClick={() => setShowAuthModal(true)}
                >
                  <LogIn size={15} /> Sign In
                </button>
                <button
                  type="button"
                  className="btn-primary landing-cta-btn"
                  onClick={() => {
                    if (!demoUsername) handleRandomizeGuest();
                    setShowAuthModal(true);
                  }}
                >
                  <Zap size={15} /> Instant Pass
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── HERO SECTION ── */}
      <section className="landing-hero-section">
        <div className="landing-hero-backdrop" />
        <div className="landing-hero-content">
          <div className="landing-pill-badge">
            <span className="landing-pill-dot" />
            <Sparkles size={14} color="var(--accent-glow)" />
            <span>Next-Gen Real-Time Chat & Anonymous Connections</span>
          </div>

          <h1 className="landing-hero-title">
            Connect Instantly. <br />
            <span className="brand-gradient">Chat Freely.</span> Find Your Mate.
          </h1>

          <p className="landing-hero-subtitle">
            PairUP is your friction-free social hub. Jump into public community rooms with zero setup via <strong>Instant Pass</strong>, or pair up anonymously with someone who shares your passions through <strong>Mate</strong>.
          </p>

          <div className="landing-hero-actions">
            {isLoggedIn ? (
              <button type="button" className="landing-hero-cta-primary" onClick={onLaunchApp}>
                <span>Open PairUP Chat Stage</span>
                <ArrowRight size={18} />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="landing-hero-cta-primary"
                  onClick={() => {
                    if (!demoUsername) handleRandomizeGuest();
                    setShowAuthModal(true);
                  }}
                >
                  <Zap size={18} />
                  <span>Enter with Instant Pass (No Signup)</span>
                </button>
                <a href="#mate" className="landing-hero-cta-secondary">
                  <Sparkles size={18} />
                  <span>Discover Mate Matchmaking</span>
                </a>
              </>
            )}
          </div>

          <div className="landing-trust-strip">
            <div className="trust-item"><CheckCircle2 size={15} color="var(--accent-green)" /> 100% Free & Open</div>
            <div className="trust-item"><CheckCircle2 size={15} color="var(--accent-green)" /> No Email or Password Required</div>
            <div className="trust-item"><CheckCircle2 size={15} color="var(--accent-green)" /> Ephemeral & Privacy-First</div>
            <div className="trust-item"><CheckCircle2 size={15} color="var(--accent-green)" /> Real-Time WebSocket Delivery</div>
          </div>

          {/* ── INTERACTIVE HERO WIDGET ── */}
          <div className="landing-interactive-widget-box">
            <div className="widget-header">
              <div className="widget-tabs">
                <button
                  type="button"
                  className={`widget-tab ${heroWidgetTab === "pass" ? "active" : ""}`}
                  onClick={() => setHeroWidgetTab("pass")}
                >
                  <Zap size={15} /> Test Instant Pass
                </button>
                <button
                  type="button"
                  className={`widget-tab ${heroWidgetTab === "mate" ? "active" : ""}`}
                  onClick={() => setHeroWidgetTab("mate")}
                >
                  <Sparkles size={15} /> Mate Match Simulator
                </button>
              </div>
              <span className="widget-live-tag">Interactive Preview</span>
            </div>

            <div className="widget-body">
              {heroWidgetTab === "pass" ? (
                <div className="widget-pass-flow">
                  <div className="widget-pass-description">
                    <h4>Skip registration. Enter with a temporary guest pass.</h4>
                    <p>Pick a handle or randomize one to join public rooms and direct chats immediately.</p>
                  </div>

                  <form onSubmit={handleDemoLogin} className="widget-pass-form">
                    <div className="widget-input-group">
                      <input
                        type="text"
                        placeholder="Choose Username (e.g. StarVoyager)"
                        value={demoUsername}
                        onChange={e => setDemoUsername(e.target.value)}
                        required
                        className="chat-input widget-input"
                      />
                      <button
                        type="button"
                        className="btn-secondary widget-random-btn"
                        onClick={handleRandomizeGuest}
                        title="Randomize username"
                      >
                        <RefreshCw size={14} /> Random
                      </button>
                    </div>

                    <div className="widget-form-row">
                      <input
                        type="text"
                        placeholder="Display Name (optional)"
                        value={demoName}
                        onChange={e => setDemoName(e.target.value)}
                        className="chat-input widget-input-sm"
                      />
                      <select
                        value={demoGender}
                        onChange={e => setDemoGender(e.target.value)}
                        className="chat-input widget-input-sm"
                      >
                        <option value="Prefer not to say">Gender: Any</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <button type="submit" className="btn-primary widget-submit-btn">
                      <Zap size={16} /> Enter Chat Immediately
                    </button>
                  </form>
                </div>
              ) : (
                <div className="widget-mate-flow">
                  {simStep === "idle" && (
                    <>
                      <div className="widget-mate-info">
                        <h4>Pick your interests to find an anonymous mate:</h4>
                        <p>PairUP pairs you with someone online who loves what you love.</p>
                      </div>
                      <div className="widget-interest-chips">
                        {SAMPLE_INTERESTS.map(item => (
                          <button
                            key={item}
                            type="button"
                            className={`widget-chip ${selectedInterests.includes(item) ? "active" : ""}`}
                            onClick={() => toggleInterest(item)}
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="btn-primary widget-submit-btn"
                        onClick={handleRunSimulation}
                      >
                        <Sparkles size={16} /> Start Match Simulation
                      </button>
                    </>
                  )}

                  {simStep === "matching" && (
                    <div className="widget-sim-matching">
                      <div className="sim-pulse-spinner">
                        <Sparkles size={28} className="mate-spin-icon" color="var(--accent-glow)" />
                      </div>
                      <h4>Matching your passions...</h4>
                      <p>Searching for someone into {selectedInterests.slice(0, 2).join(" & ")}...</p>
                    </div>
                  )}

                  {simStep === "matched" && (
                    <div className="widget-sim-matched">
                      <div className="sim-avatar-pair">
                        <div className="sim-avatar you">🐰 <span>You</span></div>
                        <div className="sim-connector">⚡</div>
                        <div className="sim-avatar partner">{simPartner.emoji} <span>{simPartner.name}</span></div>
                      </div>
                      <div className="sim-chat-bubble">
                        <strong>{simPartner.name}:</strong> "Hey there! Saw we both love {selectedInterests[0] || 'tech'}. Nice to pair up!"
                      </div>
                      <p className="sim-tip">Click below to secretly express interest!</p>
                      <button
                        type="button"
                        className="btn-interested active widget-heart-btn"
                        onClick={handleSimExpressInterest}
                      >
                        <Heart size={16} fill="currentColor" /> Express Interest
                      </button>
                    </div>
                  )}

                  {simStep === "mutual" && (
                    <div className="widget-sim-mutual">
                      <div className="sim-mutual-badge">🎉 It's a Mutual Match!</div>
                      <h3>You are now Friends on PairUP!</h3>
                      <p>Both users expressed interest. Identities unlocked, direct messaging opened, and friends list updated!</p>
                      <button
                        type="button"
                        className="landing-btn-secondary"
                        style={{ marginTop: "12px" }}
                        onClick={() => setSimStep("idle")}
                      >
                        Try Another Simulation
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── SPOTLIGHT 1: INSTANT PASS ── */}
      <section id="instant-pass" className="landing-section">
        <div className="landing-section-header">
          <div className="landing-section-badge">
            <Zap size={14} color="var(--accent-glow)" />
            <span>Instant Pass Feature</span>
          </div>
          <h2 className="landing-section-title">Zero Friction. <span className="brand-gradient">Instant Access.</span></h2>
          <p className="landing-section-subtitle">
            Tired of filling out endless sign-up forms, verifying emails, and managing passwords just to chat? Instant Pass lets you jump into PairUP in a single click.
          </p>
        </div>

        <div className="landing-cards-grid">
          <div className="landing-feature-card">
            <div className="card-icon-wrap" style={{ background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8" }}>
              <Zap size={24} />
            </div>
            <h3>1-Click Entry</h3>
            <p>Pick any unique username and you're immediately in the app. No email, no password, and zero confirmation delays.</p>
          </div>

          <div className="landing-feature-card">
            <div className="card-icon-wrap" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981" }}>
              <Shield size={24} />
            </div>
            <h3>Privacy Shield</h3>
            <p>Instant Pass guest accounts are completely temporary. When your session ends or you log out, your guest identity is cleared.</p>
          </div>

          <div className="landing-feature-card">
            <div className="card-icon-wrap" style={{ background: "rgba(168, 85, 247, 0.15)", color: "#c084fc" }}>
              <Users size={24} />
            </div>
            <h3>Full Public Chat Access</h3>
            <p>Participate in public community rooms, read discussions, view room rosters, and experience real-time conversations.</p>
          </div>

          <div className="landing-feature-card">
            <div className="card-icon-wrap" style={{ background: "rgba(245, 158, 11, 0.15)", color: "#fbbf24" }}>
              <ArrowUpRight size={24} />
            </div>
            <h3>Upgrade Anytime</h3>
            <p>Ready to save permanent friends and unlock private direct messaging? Upgrade seamlessly with Google Login at any time.</p>
          </div>
        </div>
      </section>

      {/* ── SPOTLIGHT 2: MATE (ANONYMOUS MATCHMAKING) ── */}
      <section id="mate" className="landing-section">
        <div className="landing-section-header">
          <div className="landing-section-badge" style={{ background: "rgba(236, 72, 153, 0.15)", color: "#f472b6" }}>
            <Sparkles size={14} color="#f472b6" />
            <span>Mate Matchmaking</span>
          </div>
          <h2 className="landing-section-title">Anonymous Chat. <span className="brand-gradient">Real Connections.</span></h2>
          <p className="landing-section-subtitle">
            Mate is PairUP's intelligent anonymous matchmaking engine. Pair up 1-on-1 with genuine people who share your passions without revealing your identity until you both want to.
          </p>
        </div>

        <div className="landing-mate-steps-grid">
          <div className="mate-step-card">
            <div className="mate-step-number">01</div>
            <h4>Input Shared Passions</h4>
            <p>Tell Mate what you're into — from coding to gaming, music, science, or casual banter. Mate searches for active peers online.</p>
          </div>

          <div className="mate-step-card">
            <div className="mate-step-number">02</div>
            <h4>Safe Animal Avatars</h4>
            <p>Both users are assigned playful animal personas (🐰 Rabbit, 🐺 Wolf, 🐼 Panda, 🦊 Fox, 🐢 Turtle). No profile pics or biases.</p>
          </div>

          <div className="mate-step-card">
            <div className="mate-step-number">03</div>
            <h4>Real-Time 1-on-1 Chat</h4>
            <p>Enjoy a distraction-free, 1-on-1 conversation feed with real-time typing indicators and zero clutter.</p>
          </div>

          <div className="mate-step-card">
            <div className="mate-step-number">04</div>
            <h4>Secret "Interested" Match</h4>
            <p>Hit the Heart button if you vibe. When interest is mutual, both profiles are revealed and you become permanent friends!</p>
          </div>
        </div>
      </section>

      {/* ── SPOTLIGHT 3: PUBLIC ROOMS ── */}
      <section id="rooms" className="landing-section">
        <div className="landing-section-header">
          <div className="landing-section-badge">
            <Hash size={14} color="var(--accent-primary)" />
            <span>Community Spaces</span>
          </div>
          <h2 className="landing-section-title">Join Public Rooms. <span className="brand-gradient">Build Communities.</span></h2>
          <p className="landing-section-subtitle">
            From tech discussions to gaming hubs and open hangout spots, explore dynamic rooms created and moderated by users.
          </p>
        </div>

        <div className="landing-rooms-preview-grid">
          <div className="room-preview-card">
            <div className="room-preview-header">
              <div className="room-preview-icon"><Hash size={20} /></div>
              <div>
                <div className="room-preview-title">#general</div>
                <div className="room-preview-slug">pairup.cc/general</div>
              </div>
            </div>
            <p className="room-preview-desc">The open town square for PairUP. Say hello, introduce yourself, and meet people worldwide.</p>
            <div className="room-preview-footer">
              <span className="room-tag">Open to All</span>
              <span className="room-tag">Active Now</span>
            </div>
          </div>

          <div className="room-preview-card">
            <div className="room-preview-header">
              <div className="room-preview-icon"><Hash size={20} /></div>
              <div>
                <div className="room-preview-title">#developers</div>
                <div className="room-preview-slug">pairup.cc/developers</div>
              </div>
            </div>
            <p className="room-preview-desc">Coding, system design, web development, AI tools, and debugging discussions.</p>
            <div className="room-preview-footer">
              <span className="room-tag">Tech & Code</span>
              <span className="room-tag">Moderated</span>
            </div>
          </div>

          <div className="room-preview-card">
            <div className="room-preview-header">
              <div className="room-preview-icon"><Hash size={20} /></div>
              <div>
                <div className="room-preview-title">#gaming</div>
                <div className="room-preview-slug">pairup.cc/gaming</div>
              </div>
            </div>
            <p className="room-preview-desc">Find squad mates, discuss releases, strategies, and pair up for cooperative gaming.</p>
            <div className="room-preview-footer">
              <span className="room-tag">Gaming</span>
              <span className="room-tag">Community</span>
            </div>
          </div>
        </div>

        <div className="room-feature-highlights">
          <div className="highlight-item">
            <Crown size={18} color="var(--accent-gold)" />
            <span>Prime Moderator & 5 Mod Slots for safe room governance</span>
          </div>
          <div className="highlight-item">
            <Info size={18} color="var(--accent-primary)" />
            <span>Dedicated "View Info" page with moderator & participant rosters</span>
          </div>
          <div className="highlight-item">
            <Users size={18} color="var(--accent-green)" />
            <span>WhatsApp-style unread counter badges for incoming messages</span>
          </div>
        </div>
      </section>

      {/* ── COMPARISON TABLE ── */}
      <section className="landing-section">
        <div className="landing-section-header">
          <h2 className="landing-section-title">Pick How You Want to Join</h2>
          <p className="landing-section-subtitle">Whether you want maximum anonymity or persistent friendship circles, PairUP supports your style.</p>
        </div>

        <div className="comparison-table-wrap">
          <table className="comparison-table">
            <thead>
              <tr>
                <th>Feature</th>
                <th>Instant Pass (Guest)</th>
                <th>Authenticated (Google)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Sign-Up Requirement</td>
                <td><span className="tag-green">None (Zero setup)</span></td>
                <td>Google OAuth 2.0</td>
              </tr>
              <tr>
                <td>Public Chat Rooms</td>
                <td><Check size={18} color="var(--accent-green)" /> Full Access</td>
                <td><Check size={18} color="var(--accent-green)" /> Full Access</td>
              </tr>
              <tr>
                <td>Room Info & Participants</td>
                <td><Check size={18} color="var(--accent-green)" /> View all rosters</td>
                <td><Check size={18} color="var(--accent-green)" /> View all rosters</td>
              </tr>
              <tr>
                <td>Create & Moderate Rooms</td>
                <td><span className="tag-muted">Guest only</span></td>
                <td><Check size={18} color="var(--accent-green)" /> Prime Moderator</td>
              </tr>
              <tr>
                <td>Mate Anonymous Matchmaking</td>
                <td><span className="tag-muted">Read-only preview</span></td>
                <td><Check size={18} color="var(--accent-green)" /> Full Matching & Friends Unlock</td>
              </tr>
              <tr>
                <td>Persistent Direct Messaging</td>
                <td><span className="tag-muted">Session only</span></td>
                <td><Check size={18} color="var(--accent-green)" /> Permanent Friendships</td>
              </tr>
              <tr>
                <td>Privacy & Data Retention</td>
                <td><span className="tag-green">Cleared on exit</span></td>
                <td>Encrypted & Protected</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ── FAQ SECTION (SEO ACCORDION) ── */}
      <section id="faq" className="landing-section">
        <div className="landing-section-header">
          <div className="landing-section-badge">
            <HelpCircle size={14} color="var(--accent-glow)" />
            <span>Common Questions</span>
          </div>
          <h2 className="landing-section-title">Frequently Asked Questions</h2>
          <p className="landing-section-subtitle">Everything you need to know about PairUP, Instant Pass, and Mate.</p>
        </div>

        <div className="faq-accordion-list">
          {[
            {
              q: "What is Instant Pass and how does it work?",
              a: "Instant Pass is PairUP's unique guest access feature. It lets anyone enter PairUP without registering, providing an email, or setting a password. You simply enter a nickname and immediately participate in public rooms. It is completely private and temporary."
            },
            {
              q: "How does the Mate anonymous matchmaking system work?",
              a: "Mate lets you enter interests like 'Coding' or 'Gaming' and joins a real-time queue. When an active user with similar interests is found, you are paired in a private anonymous chat under animal identities (e.g., Rabbit, Wolf). If both participants click 'Interested', profiles are exchanged and you become friends on PairUP!"
            },
            {
              q: "Is PairUP completely free to use?",
              a: "Yes! PairUP is 100% free. There are no paywalls, hidden subscriptions, or premium tiers for chatting, matching, or creating public rooms."
            },
            {
              q: "Can I create my own public chat room?",
              a: "Yes. Authenticated users can create public chat rooms with custom titles, descriptions, and avatars. The creator becomes the Prime Moderator and can appoint up to 4 additional moderators to keep the room safe."
            },
            {
              q: "How does PairUP protect my privacy?",
              a: "PairUP uses encrypted WebSocket communication. Instant Pass guest accounts leave zero trace after you leave. In Mate chat, your real identity is never exposed unless both participants explicitly click 'Interested' to consent."
            },
            {
              q: "Can I use PairUP on my smartphone?",
              a: "Absolutely. PairUP is built with a responsive, mobile-first design that adapts seamlessly to phones, tablets, and desktop browsers with smooth bottom-anchored chat bars and touch controls."
            }
          ].map((item, idx) => (
            <div key={idx} className={`faq-accordion-item ${faqOpen === idx ? "open" : ""}`}>
              <button
                type="button"
                className="faq-accordion-trigger"
                onClick={() => toggleFaq(idx)}
              >
                <span>{item.q}</span>
                <ChevronDown size={18} className="faq-chevron" />
              </button>
              {faqOpen === idx && (
                <div className="faq-accordion-content">
                  <p>{item.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── FINAL CTA BANNER ── */}
      <section className="landing-cta-banner">
        <div className="cta-banner-glow" />
        <div className="cta-banner-content">
          <h2>Ready to Pair Up?</h2>
          <p>Join thousands of conversations happening right now. No signup required.</p>
          <div className="cta-banner-actions">
            <button
              type="button"
              className="landing-hero-cta-primary"
              onClick={() => {
                if (!demoUsername) handleRandomizeGuest();
                setShowAuthModal(true);
              }}
            >
              <Zap size={18} />
              <span>Launch Instant Pass</span>
            </button>
            <button
              type="button"
              className="landing-btn-secondary"
              onClick={() => setShowAuthModal(true)}
            >
              <LogIn size={16} /> Sign In with Google
            </button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="footer-col brand-col">
            <div className="landing-brand">
              <div className="landing-brand-icon">PU</div>
              <span className="brand-gradient landing-brand-text">PairUP</span>
            </div>
            <p className="footer-desc">
              The modern real-time connection platform. Chat freely in public rooms, pair up with an anonymous Mate, or explore the community with Instant Pass.
            </p>
            <div className="footer-copyright">
              © {new Date().getFullYear()} PairUP (pairup.cc). All rights reserved.
            </div>
          </div>

          <div className="footer-col">
            <h5>Features</h5>
            <ul>
              <li><a href="#instant-pass">Instant Pass (Guest)</a></li>
              <li><a href="#mate">Mate Matchmaking</a></li>
              <li><a href="#rooms">Public Chat Rooms</a></li>
              <li><a href="#features">Unread Counter Badges</a></li>
            </ul>
          </div>

          <div className="footer-col">
            <h5>Community</h5>
            <ul>
              <li><a href="#rooms">#general Room</a></li>
              <li><a href="#rooms">#developers Room</a></li>
              <li><a href="#rooms">#gaming Room</a></li>
              <li><a href="#faq">FAQ & Support</a></li>
            </ul>
          </div>

          <div className="footer-col">
            <h5>Privacy & Terms</h5>
            <ul>
              <li><span className="footer-static-link">Ephemeral Guest Data</span></li>
              <li><span className="footer-static-link">Zero Trackers</span></li>
              <li><span className="footer-static-link">Community Safety</span></li>
            </ul>
          </div>
        </div>
      </footer>

      {/* ── AUTH MODAL ── */}
      {showAuthModal && (
        <div className="auth-modal-overlay" onClick={() => setShowAuthModal(false)}>
          <div className="auth-modal-card" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              className="auth-modal-close"
              onClick={() => setShowAuthModal(false)}
            >
              <X size={18} />
            </button>

            <div style={{ textAlign: "center", marginBottom: "20px" }}>
              <div className="landing-brand-icon" style={{ margin: "0 auto 10px" }}>PU</div>
              <h2 className="brand-gradient" style={{ fontSize: "1.8rem", marginBottom: "4px" }}>PairUP</h2>
              <p style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>Choose how you want to enter</p>
            </div>

            {loginNotice && (
              <div className="error-banner" style={{ background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#fca5a5", marginBottom: "14px" }}>
                {loginNotice}
              </div>
            )}

            {authError && (
              <div className="error-banner" style={{ marginBottom: "14px" }}>{authError}</div>
            )}

            {/* Google Sign-in */}
            <div id="google-signin-btn" style={{ display: "flex", justifyContent: "center", minHeight: "44px", marginBottom: "6px" }} />

            <div className="divider" style={{ margin: "16px 0" }}>Or Continue With Instant Pass</div>

            {/* Instant Pass Guest Form */}
            <form onSubmit={handleDemoLogin} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  placeholder="Choose Username"
                  value={demoUsername}
                  onChange={e => setDemoUsername(e.target.value)}
                  required
                  className="chat-input full-width"
                />
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleRandomizeGuest}
                  style={{ padding: "0 10px", flexShrink: 0 }}
                  title="Randomize handle"
                >
                  <RefreshCw size={14} />
                </button>
              </div>

              <input
                type="text"
                placeholder="Display Name (optional)"
                value={demoName}
                onChange={e => setDemoName(e.target.value)}
                className="chat-input full-width"
              />

              <select
                value={demoGender}
                onChange={e => setDemoGender(e.target.value)}
                className="chat-input full-width select-field"
              >
                <option value="Prefer not to say">Gender: Prefer not to say</option>
                <option value="Male">Gender: Male</option>
                <option value="Female">Gender: Female</option>
                <option value="Other">Gender: Other</option>
              </select>

              <button type="submit" className="btn-primary full-width" style={{ marginTop: "4px" }}>
                <Zap size={15} /> Enter as Instant Pass (Guest)
              </button>
            </form>

            <p style={{ fontSize: "0.72rem", color: "var(--text-dim)", textAlign: "center", marginTop: "14px" }}>
              Instant Pass sessions are temporary — your session data is removed when you leave.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
