/**
 * PairUP Frontend Double-Submit Cookie CSRF Protection
 * Automatically ensures a CSRF cookie is present and attaches X-CSRF-Token
 * to all state-changing /api/ requests (POST, PUT, PATCH, DELETE).
 */

const CSRF_COOKIE_NAME = "pairup_csrf";
const CSRF_HEADER_NAME = "X-CSRF-Token";
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const API_BASE =
  typeof window !== "undefined" &&
  (window.location.origin.includes(":5173") || window.location.origin.includes(":5174"))
    ? `http://${window.location.hostname}:8080`
    : typeof window !== "undefined"
      ? window.location.origin
      : "";

let inFlightTokenPromise = null;
let rawFetch = null;

export function readCsrfCookie() {
  if (typeof document === "undefined") return "";
  const pairs = document.cookie ? document.cookie.split("; ") : [];
  for (const pair of pairs) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) continue;
    const key = pair.slice(0, eqIdx);
    if (key === CSRF_COOKIE_NAME) {
      return decodeURIComponent(pair.slice(eqIdx + 1));
    }
  }
  return "";
}

export async function ensureCsrfToken(forceRefresh = false) {
  if (!forceRefresh) {
    const existing = readCsrfCookie();
    if (existing) return existing;
  }
  if (inFlightTokenPromise) return inFlightTokenPromise;

  const fetchImpl = rawFetch || window.fetch.bind(window);
  inFlightTokenPromise = fetchImpl(`${API_BASE}/api/csrf-token`, {
    method: "GET",
    credentials: "include",
  })
    .then(async (res) => {
      if (!res.ok) return readCsrfCookie();
      const data = await res.json().catch(() => ({}));
      return data.csrf_token || readCsrfCookie();
    })
    .catch(() => readCsrfCookie())
    .finally(() => {
      inFlightTokenPromise = null;
    });

  return inFlightTokenPromise;
}

function isTargetApiUrl(input) {
  try {
    const urlStr = typeof input === "string" ? input : input?.url || "";
    if (!urlStr) return false;
    const parsed = new URL(urlStr, window.location.origin);
    const isApiPath = parsed.pathname.startsWith("/api/");
    const isSameOrApiOrigin =
      parsed.origin === window.location.origin || parsed.origin === API_BASE;
    return isApiPath && isSameOrApiOrigin;
  } catch {
    return false;
  }
}

export function installCsrfFetchInterceptor() {
  if (typeof window === "undefined" || window.__pairupCsrfInstalled) return;
  window.__pairupCsrfInstalled = true;
  rawFetch = window.fetch.bind(window);

  // Warm the CSRF cookie immediately on app boot
  ensureCsrfToken(false);

  window.fetch = async (input, init = {}) => {
    if (!isTargetApiUrl(input)) {
      return rawFetch(input, init);
    }

    const method = (
      init.method ||
      (typeof input !== "string" && input?.method) ||
      "GET"
    ).toUpperCase();

    const nextInit = {
      ...init,
      credentials: init.credentials || "include",
    };

    if (MUTATING_METHODS.has(method)) {
      const token = await ensureCsrfToken(false);
      const headers = new Headers(
        init.headers || (typeof input !== "string" ? input?.headers : undefined) || {}
      );
      if (token && !headers.has(CSRF_HEADER_NAME)) {
        headers.set(CSRF_HEADER_NAME, token);
      }
      nextInit.headers = headers;

      let response = await rawFetch(input, nextInit);

      // If CSRF cookie rotated or expired, refresh once and retry
      if (response.status === 403) {
        try {
          const cloneText = await response.clone().text();
          if (cloneText.toLowerCase().includes("csrf")) {
            const freshToken = await ensureCsrfToken(true);
            if (freshToken) {
              headers.set(CSRF_HEADER_NAME, freshToken);
              nextInit.headers = headers;
              response = await rawFetch(input, nextInit);
            }
          }
        } catch {
          // Return original 403 response
        }
      }
      return response;
    }

    return rawFetch(input, nextInit);
  };
}
