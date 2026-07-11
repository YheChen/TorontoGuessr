import type { IncomingMessage } from "node:http";

/**
 * In-memory fixed-window rate limiter.
 *
 * Note: serverless instances each keep their own map, so this is per-instance,
 * not globally shared. It reliably deters casual scripting from a single
 * client (whose requests tend to reuse warm instances) but is not a hard
 * global cap; a distributed store (Redis/Supabase) would be needed for that.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function checkRateLimit(
  key: string,
  options: { limit: number; windowMs: number },
  now: number = Date.now()
): RateLimitResult {
  const { limit, windowMs } = options;

  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  bucket.count += 1;
  const allowed = bucket.count <= limit;
  const remaining = Math.max(0, limit - bucket.count);
  const retryAfterSeconds = allowed
    ? 0
    : Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

  // Bound memory: sweep expired buckets when the map grows large.
  if (buckets.size > MAX_BUCKETS) {
    for (const [existingKey, existingBucket] of buckets) {
      if (now >= existingBucket.resetAt) {
        buckets.delete(existingKey);
      }
    }
  }

  return { allowed, remaining, retryAfterSeconds };
}

/** Best-effort client IP, preferring the proxy-forwarded headers Vercel sets. */
export function clientIp(request: IncomingMessage): string {
  const forwarded = request.headers["x-forwarded-for"];
  const rawForwarded = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (rawForwarded) {
    const first = rawForwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  const realIp = request.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) {
    return realIp.trim();
  }

  return request.socket?.remoteAddress ?? "unknown";
}

/** Reset all buckets. Test-only. */
export function resetRateLimits(): void {
  buckets.clear();
}
