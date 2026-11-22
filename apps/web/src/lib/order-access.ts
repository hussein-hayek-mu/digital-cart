/**
 * Order access tokens kept in this browser, keyed by order reference.
 * The server enforces expiry; the local copy expires too so tokens don't
 * linger on shared devices.
 */

const PREFIX = "order-access:";
const LOCAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type Stored = { token: string; savedAt: number };

export function saveOrderAccessToken(publicRef: string, token: string): void {
  try {
    const value: Stored = { token, savedAt: Date.now() };
    localStorage.setItem(PREFIX + publicRef, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private mode); the email link still works.
  }
}

export function getOrderAccessToken(publicRef: string): string | null {
  try {
    const raw = localStorage.getItem(PREFIX + publicRef);
    if (!raw) return null;
    const value = JSON.parse(raw) as Stored;
    if (!value.token || Date.now() - value.savedAt > LOCAL_TTL_MS) {
      localStorage.removeItem(PREFIX + publicRef);
      return null;
    }
    return value.token;
  } catch {
    return null;
  }
}

export function forgetOrderAccessToken(publicRef: string): void {
  try {
    localStorage.removeItem(PREFIX + publicRef);
  } catch {
    // ignore
  }
}

/** Reads `#t=<token>` from the current URL, then removes it from the address bar. */
export function takeTokenFromUrlFragment(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const token = params.get("t");
  if (!token) return null;
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  return token;
}
