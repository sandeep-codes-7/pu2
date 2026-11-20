/**
 * Policy-safe Google AdSense loader for PairUP (pairup.cc).
 *
 * Google AdSense Policy Compliance:
 * - Only loads Auto Ads on indexable editorial/publisher content pages
 *   (/, /about, /guidelines, /privacy, /terms).
 * - Never loads or leaves ad containers on interactive chat stages, empty lobbies,
 *   loading states, "Under Construction" screens, maintenance screens, auth modals,
 *   or /admin routes.
 */

export const ADSENSE_CLIENT = "ca-pub-4647904494238513";
const ADSENSE_SCRIPT_ID = "pairup-adsense-script";

const CONTENT_ELIGIBLE_PATHS = new Set([
  "/",
  "/about",
  "/guidelines",
  "/privacy",
  "/terms",
]);

export function isEligibleContentPath(pathname) {
  const clean = (pathname || "/").replace(/\/+$/, "") || "/";
  return CONTENT_ELIGIBLE_PATHS.has(clean);
}

export function clearAdSenseArtifacts() {
  if (typeof document === "undefined") return;
  document
    .querySelectorAll(".google-auto-placed, ins.adsbygoogle")
    .forEach((node) => {
      try {
        node.remove();
      } catch {
        // ignore removal errors
      }
    });
}

export function syncAdSenseForView({ isPublisherContent, pathname }) {
  if (typeof document === "undefined") return;
  const path = pathname || window.location.pathname;
  const shouldEnable = Boolean(isPublisherContent) && isEligibleContentPath(path);

  if (!shouldEnable) {
    clearAdSenseArtifacts();
    return;
  }

  if (document.getElementById(ADSENSE_SCRIPT_ID)) {
    return;
  }

  const script = document.createElement("script");
  script.id = ADSENSE_SCRIPT_ID;
  script.async = true;
  script.crossOrigin = "anonymous";
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
  document.head.appendChild(script);
}
