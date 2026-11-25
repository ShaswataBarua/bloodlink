/**
 * Fixed-window rate limiter for login attempts (per IP and per email).
 * In-memory by design: on Vercel each warm instance keeps its own window, and the
 * durable per-account lockout (users.failed_logins / locked_until) is the hard limit.
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = { ok: boolean; retryAfterSec: number };

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }
  return { ok: true, retryAfterSec: 0 };
}

export function resetRateLimits(): void {
  buckets.clear();
}

// Keep the map bounded on long-running instances.
if (buckets.size === 0) {
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  }, 60_000).unref?.();
}
