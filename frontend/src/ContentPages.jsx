import React, { useEffect, useState } from 'react';
import { ArrowLeft, Sun, Moon, Shield, Users, Lock, BookOpen, CheckCircle2, FileText } from 'lucide-react';
import { syncAdSenseForView } from './utils/adsense.js';
import './ContentPages.css';

const PAGE_META = {
  "/about": {
    title: "About PairUP & How It Works",
    subtitle: "How real-time public rooms, Instant Pass guest sessions, and anonymous Mate matching work under the hood.",
    docTitle: "About PairUP | Real-Time Chat Rooms & Anonymous Mate Matching",
    icon: BookOpen
  },
  "/guidelines": {
    title: "Community Safety & Moderation Guidelines",
    subtitle: "Clear standards for respectful conversation across public rooms, direct messages, and anonymous Mate sessions.",
    docTitle: "Community Guidelines | PairUP",
    icon: Shield
  },
  "/privacy": {
    title: "Privacy Policy",
    subtitle: "How PairUP handles account information, ephemeral Instant Pass sessions, browser storage, and third-party services.",
    docTitle: "Privacy Policy | PairUP",
    icon: Lock
  },
  "/terms": {
    title: "Terms of Service",
    subtitle: "The rules and terms governing your use of PairUP chat rooms, Mate matchmaking, and messaging features.",
    docTitle: "Terms of Service | PairUP",
    icon: FileText
  }
};

export default function ContentPage({ pathname }) {
  const cleanPath = (pathname || "/about").replace(/\/+$/, "") || "/about";
  const meta = PAGE_META[cleanPath] || PAGE_META["/about"];
  const IconComp = meta.icon;

  const [theme, setTheme] = useState(() => localStorage.getItem("pu_theme") || "light");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("pu_theme", theme);
  }, [theme]);

  useEffect(() => {
    document.title = meta.docTitle;
    syncAdSenseForView({ isPublisherContent: true, pathname: cleanPath });
  }, [cleanPath, meta.docTitle]);

  return (
    <div className="content-page-shell">
      <header className="content-page-nav">
        <div className="content-page-nav-inner">
          <a href="/" className="content-brand">
            <span className="content-brand-mark">PU</span>
            <span className="content-brand-name">PairUP</span>
          </a>

          <nav className="content-nav-links" aria-label="Primary pages">
            <a href="/about" className={cleanPath === "/about" ? "active" : ""}>About</a>
            <a href="/guidelines" className={cleanPath === "/guidelines" ? "active" : ""}>Guidelines</a>
            <a href="/privacy" className={cleanPath === "/privacy" ? "active" : ""}>Privacy</a>
            <a href="/terms" className={cleanPath === "/terms" ? "active" : ""}>Terms</a>
          </nav>

          <div className="content-nav-actions">
            <button
              type="button"
              className="content-theme-btn"
              onClick={() => setTheme(prev => (prev === "dark" ? "light" : "dark"))}
              aria-label="Toggle color theme"
              title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            >
              {theme === "dark" ? <Sun size={16} strokeWidth={1.5} /> : <Moon size={16} strokeWidth={1.5} />}
            </button>
            <a href="/" className="content-back-cta">
              <ArrowLeft size={15} strokeWidth={1.5} />
              <span>Back to PairUP</span>
            </a>
          </div>
        </div>
      </header>

      <main className="content-page-main">
        <article className="content-article">
          <header className="content-article-header">
            <div className="content-article-kicker">
              <IconComp size={15} strokeWidth={1.5} />
              <span>PairUP Documentation</span>
            </div>
            <h1>{meta.title}</h1>
            <p className="content-article-lead">{meta.subtitle}</p>
            <div className="content-article-meta">Last updated: November 20, 2026</div>
          </header>

          {cleanPath === "/about" && (
            <div className="content-prose">
              <section>
                <h2>What PairUP Is</h2>
                <p>
                  PairUP (<strong>pairup.cc</strong>) is a real-time web communication platform designed for focused group conversations and interest-based 1-on-1 discovery. Most chat platforms force visitors through lengthy registration forms before they can read or join a single discussion. PairUP removes that barrier while still offering full account persistence, room moderation, and privacy controls for returning members.
                </p>
              </section>

              <section>
                <h2>Core Features Explained</h2>
                <h3>1. Instant Pass (Ephemeral Guest Access)</h3>
                <p>
                  Instant Pass lets anyone pick a temporary handle and enter public rooms in seconds without providing an email address or creating a password. Guest accounts are isolated per session. When an Instant Pass user logs out or closes all active connections, the temporary guest profile is automatically purged so no personal footprint is left behind.
                </p>

                <h3>2. Mate (Anonymous Interest-Based Matchmaking)</h3>
                <p>
                  Mate connects signed-in users 1-on-1 based on shared topics such as coding, gaming, music, design, or startups. When you enter the Mate queue, PairUP computes topic overlap using Jaccard similarity to pair you with the closest available match. Both participants receive neutral animal personas (such as Fox, Otter, or Panda) so conversations begin without profile bias. Your real profile stays hidden unless both people independently click <strong>Interested</strong>—unlocking mutual friendship and permanent direct messaging.
                </p>

                <h3>3. Public and Private Community Rooms</h3>
                <p>
                  Users can browse public rooms in the Announcements &amp; Rooms directory or create custom rooms with unique slugs, descriptions, and avatars. Every room has a Prime Moderator (its creator) who can appoint up to four additional moderators. Private rooms require invite codes and explicit moderator approval before non-members can read history or send messages.
                </p>

                <h3>4. Ghost Mode &amp; Offline-First Messaging</h3>
                <p>
                  Registered users can enable <strong>Ghost mode</strong> from their profile to appear offline to others while staying connected, similar to Google Chat&apos;s away status. PairUP also caches recent conversation history locally in your browser so switching between active rooms and direct messages feels immediate without redundant server requests.
                </p>
              </section>

              <section>
                <h2>Who Built PairUP</h2>
                <p>
                  PairUP is independently built and maintained as a lightweight, fast, browser-native alternative to bloated chat clients. It runs on modern web standards—React on the frontend and FastAPI WebSockets on the backend—so it works smoothly across desktop and mobile browsers without requiring an app store download.
                </p>
              </section>
            </div>
          )}

          {cleanPath === "/guidelines" && (
            <div className="content-prose">
              <section>
                <h2>Our Commitment to Safe Conversations</h2>
                <p>
                  PairUP is built for open, constructive, and genuine conversations. Whether you are chatting in a public topic room, messaging a friend directly, or meeting someone new in Mate, every participant is expected to follow these community guidelines.
                </p>
              </section>

              <section>
                <h2>Expected Conduct</h2>
                <ul>
                  <li><strong>Treat people with respect:</strong> Harassment, hate speech, slurs, personal attacks, or targeted intimidation are strictly prohibited in all rooms and private chats.</li>
                  <li><strong>Protect privacy:</strong> Never share another person&apos;s private information, real name, phone number, address, or private messages without explicit permission.</li>
                  <li><strong>Keep content lawful and safe:</strong> Do not post illegal content, malware links, phishing attempts, sexually explicit material, or violent threats.</li>
                  <li><strong>No spam or automated flooding:</strong> Automated bots, repetitive promotional links, and deliberate message flooding degrade rooms for everyone and will result in rate-limiting or removal.</li>
                  <li><strong>Respect anonymity in Mate:</strong> Do not pressure anonymous matches to reveal their identity or move off-platform. Mutual interest is designed to be voluntary on both sides.</li>
                </ul>
              </section>

              <section>
                <h2>Room Moderation &amp; Governance</h2>
                <p>
                  Each community room is governed by its Prime Moderator and up to four appointed co-moderators. Moderators have the authority to:
                </p>
                <ul>
                  <li>Approve or decline admission requests for private rooms.</li>
                  <li>Remove disruptive participants from a room.</li>
                  <li>Clear room message history if spam or policy-violating content is posted.</li>
                  <li>Update room descriptions, visibility settings, and moderator rosters.</li>
                </ul>
              </section>

              <section>
                <h2>Reporting Issues &amp; Feedback</h2>
                <p>
                  If you encounter a bug, safety concern, or abusive behavior, use the <strong>Feedback</strong> form in the Announcements section to notify the PairUP team. We review submissions regularly and take action against accounts or rooms that violate these standards.
                </p>
              </section>
            </div>
          )}

          {cleanPath === "/privacy" && (
            <div className="content-prose">
              <section>
                <h2>1. Information We Collect</h2>
                <p>
                  PairUP collects only the minimum information required to operate real-time chat and user accounts:
                </p>
                <ul>
                  <li><strong>Google Sign-In accounts:</strong> When you sign in with Google OAuth 2.0, we receive your name, email address, and profile avatar URL from Google to create and authenticate your account. Your email address is never exposed publicly to other users.</li>
                  <li><strong>Profile details:</strong> Optional display name, username, gender preference, bio, interests, uploaded avatar, and Ghost mode preference that you choose to save.</li>
                  <li><strong>Instant Pass guest sessions:</strong> Temporary nickname, optional display name, and session messages. Guest accounts are automatically purged when you log out or disconnect all active sessions.</li>
                  <li><strong>Messages &amp; room membership:</strong> Messages you send in rooms, direct conversations, and Mate sessions so they can be delivered to intended participants.</li>
                </ul>
              </section>

              <section>
                <h2>2. Cookies, Local Storage &amp; Offline Caching</h2>
                <p>
                  PairUP uses essential browser storage mechanisms to keep your session secure and responsive:
                </p>
                <ul>
                  <li><strong>Security Cookies (CSRF):</strong> We set a first-party <code>pairup_csrf</code> cookie to protect state-changing API requests against Cross-Site Request Forgery.</li>
                  <li><strong>Local Session &amp; Offline Cache:</strong> Your theme preference, authentication token, and recent conversation history are cached locally in your browser (LocalStorage and IndexedDB) to reduce server load and support fast offline-first switching. All cached chat data is wiped when you log out.</li>
                </ul>
              </section>

              <section>
                <h2>3. Advertising &amp; Third-Party Services</h2>
                <p>
                  PairUP uses <strong>Google AdSense</strong> to display advertisements on public informational and editorial pages (such as our home page and documentation pages). Ads are intentionally disabled inside active chat rooms, direct messages, loading states, and account modals.
                </p>
                <p>
                  Third-party vendors, including Google, may use cookies to serve ads based on a user&apos;s prior visits to this website or other websites. You may opt out of personalized advertising by visiting{" "}
                  <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer">
                    Google Ads Settings
                  </a>{" "}
                  or{" "}
                  <a href="https://www.aboutads.info/choices/" target="_blank" rel="noopener noreferrer">
                    aboutads.info
                  </a>.
                </p>
              </section>

              <section>
                <h2>4. Security &amp; Data Retention</h2>
                <p>
                  We protect communications with HTTPS/WSS transport encryption, strict origin validation on WebSocket connections, CSRF verification, and per-IP rate limiting. You can clear your direct chat history at any time from the chat options menu, exit any room to stop receiving its messages, or log out to remove locally cached data.
                </p>
              </section>
            </div>
          )}

          {cleanPath === "/terms" && (
            <div className="content-prose">
              <section>
                <h2>1. Acceptance of Terms</h2>
                <p>
                  By accessing or using PairUP (<strong>pairup.cc</strong>), including public chat rooms, direct messaging, Instant Pass guest sessions, or Mate matchmaking, you agree to be bound by these Terms of Service and our{" "}
                  <a href="/guidelines">Community Guidelines</a>.
                </p>
              </section>

              <section>
                <h2>2. Eligibility &amp; Accounts</h2>
                <p>
                  You must be at least 13 years old (or the minimum digital consent age in your jurisdiction) to use PairUP. You are responsible for maintaining the security of your Google-authenticated session and for all activity conducted under your account or Instant Pass handle.
                </p>
              </section>

              <section>
                <h2>3. User Content &amp; Acceptable Use</h2>
                <p>
                  You retain ownership of the messages and profile content you post on PairUP, and you grant PairUP a limited license to transmit, store, and display that content to the participants of the rooms or conversations you join. You agree not to abuse, reverse-engineer, scrape, overload, or attempt unauthorized access to PairUP servers, private rooms, or other users&apos; accounts.
                </p>
              </section>

              <section>
                <h2>4. Ephemeral Features &amp; Availability</h2>
                <p>
                  Instant Pass accounts and Mate anonymous sessions are temporary by design. PairUP is provided on an &quot;as is&quot; and &quot;as available&quot; basis. We may perform scheduled maintenance, update features, or moderate rooms and accounts that violate these terms without prior notice.
                </p>
              </section>

              <section>
                <h2>5. Changes to These Terms</h2>
                <p>
                  We may update these Terms of Service as PairUP evolves. Continued use of the platform after updates are published constitutes acceptance of the revised terms.
                </p>
              </section>
            </div>
          )}
        </article>
      </main>

      <footer className="content-page-footer">
        <div className="content-page-footer-inner">
          <span>© {new Date().getFullYear()} PairUP (pairup.cc)</span>
          <div className="content-footer-links">
            <a href="/">Home</a>
            <a href="/about">About</a>
            <a href="/guidelines">Guidelines</a>
            <a href="/privacy">Privacy Policy</a>
            <a href="/terms">Terms of Service</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
