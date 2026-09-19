export type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

export function createFixedWindowRateLimiter({
  limit,
  windowMs,
  now = Date.now,
}: {
  limit: number;
  windowMs: number;
  now?: () => number;
}) {
  const buckets = new Map<string, { count: number; startedAt: number }>();

  return (key: string): RateLimitDecision => {
    const currentTime = now();
    const existing = buckets.get(key);
    const bucket = !existing || currentTime - existing.startedAt >= windowMs
      ? { count: 0, startedAt: currentTime }
      : existing;

    bucket.count += 1;
    buckets.set(key, bucket);

    if (buckets.size > 10_000) {
      for (const [bucketKey, candidate] of buckets) {
        if (currentTime - candidate.startedAt >= windowMs) buckets.delete(bucketKey);
      }
    }

    return {
      allowed: bucket.count <= limit,
      limit,
      remaining: Math.max(0, limit - bucket.count),
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((bucket.startedAt + windowMs - currentTime) / 1_000),
      ),
    };
  };
}
