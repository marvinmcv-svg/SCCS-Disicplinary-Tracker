// Failure-only rate limiter for the auth endpoints — port of the
// express-rate-limit instances configured with `skipSuccessfulRequests: true`
// in the original server (sccs/server/routes/index.ts):
//
//   - perIpLoginLimiter:      150 failures / 15 min / IP     (login + fix-admin)
//   - perAccountLoginLimiter:  10 failures / 15 min / account (login only)
//
// Express counts a request, then un-counts it when the response is a success
// (status < 400). The equivalent here: `isBlocked()` peeks at the bucket
// WITHOUT counting, and `recordFailure()` is only invoked on a failed outcome.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Check whether a key is currently rate-limited, without counting this request. */
export function isBlocked(key: string, limit: number): boolean {
  const bucket = buckets.get(key);
  if (!bucket) return false;
  if (bucket.resetAt <= Date.now()) return false;
  return bucket.count >= limit;
}

/** Record a FAILED attempt against a key (the first failure opens the window). */
export function recordFailure(key: string, windowMs: number): void {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
}

/** 15 minutes, as in the original login limiters. */
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
/** Per-IP limit shared by /api/auth/login and /api/auth/fix-admin. */
export const IP_LOGIN_LIMIT = 150;
/** Per-account limit for /api/auth/login. */
export const ACCOUNT_LOGIN_LIMIT = 10;

/** The express messages, kept verbatim so the UI shows the original text. */
export const IP_LIMIT_MESSAGE = 'Too many attempts from this network. Please wait a few minutes and try again.';
export const ACCOUNT_LIMIT_MESSAGE = 'Too many failed attempts for this account. Please wait a few minutes and try again.';
