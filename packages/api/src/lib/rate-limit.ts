/**
 * Lightweight in-memory sliding-window rate limiter.
 *
 * Suitable for single-instance deployments and edge/serverless with warm
 * instances. For multi-region horizontal scaling, swap the store for Redis
 * (the interface is intentionally small). Defaults are conservative.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const store = new Map<string, Bucket>();

// Periodically evict expired buckets to bound memory.
let lastSweep = Date.now();
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of store) {
    if (bucket.resetAt <= now) store.delete(key);
  }
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

/**
 * Check and consume one unit from the rate-limit bucket for `key`.
 *
 * @param key     Unique identifier (e.g. `login:<ip>`, `webhook:<repoId>`)
 * @param limit   Max requests allowed within the window
 * @param windowMs Window length in milliseconds
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const bucket = store.get(key);
  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { success: true, limit, remaining: limit - 1, resetAt };
  }

  if (bucket.count >= limit) {
    return { success: false, limit, remaining: 0, resetAt: bucket.resetAt };
  }

  bucket.count += 1;
  return {
    success: true,
    limit,
    remaining: limit - bucket.count,
    resetAt: bucket.resetAt,
  };
}

/**
 * Derive a best-effort client IP from request headers.
 */
export function getClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return (
    headers.get("x-real-ip") ??
    headers.get("cf-connecting-ip") ??
    "unknown"
  );
}

/**
 * Execute a single Upstash Redis REST command.
 * Returns the `result` field, or throws on transport error.
 */
async function upstashCommand(
  url: string,
  token: string,
  command: (string | number)[]
): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`Upstash error ${res.status}`);
  const json = (await res.json()) as { result?: unknown };
  return json.result;
}

/**
 * Distributed rate limiter.
 *
 * When UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are configured,
 * uses a Redis fixed-window counter so limits hold across serverless instances
 * and regions. Otherwise (and on any Redis error) it falls back to the
 * in-memory limiter, which is fine for single-instance / local development.
 */
export async function rateLimitAsync(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return rateLimit(key, limit, windowMs);
  }

  try {
    const windowIndex = Math.floor(Date.now() / windowMs);
    const redisKey = `rl:${key}:${windowIndex}`;
    const count = Number(await upstashCommand(url, token, ["INCR", redisKey]));
    // Set the TTL only on the first hit of the window.
    if (count === 1) {
      await upstashCommand(url, token, ["PEXPIRE", redisKey, windowMs]);
    }
    const resetAt = (windowIndex + 1) * windowMs;
    return {
      success: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      resetAt,
    };
  } catch {
    // Never let a limiter outage block legitimate traffic — fall back.
    return rateLimit(key, limit, windowMs);
  }
}
