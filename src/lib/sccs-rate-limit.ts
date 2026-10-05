// In-memory rate limiter — port of the express-rate-limit layers used by the
// original server (per-account + per-IP login throttling, reset throttling).
// Sufficient for a single-process sandbox deployment.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

/**
 * Fixed-window rate limit check. `skipSuccess` semantics from the original
 * code are handled by only calling `rateLimitFail()` on failed attempts for
 * the login limiters.
 */
export function checkRateLimit(key: string, windowMs: number, limit: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSec: 0 };
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return { ok: false, remaining: 0, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true, remaining: limit - bucket.count, retryAfterSec: 0 };
}

/** Client IP best-effort (gateway/proxied requests carry X-Forwarded-For). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

/** Periodically prune expired buckets so the map does not grow forever. */
if (typeof setInterval !== 'undefined') {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, 60_000);
  (timer as unknown as { unref?: () => void }).unref?.();
}
