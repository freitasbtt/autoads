import type { Request, RequestHandler } from "express";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  name: string;
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
};

const buckets = new Map<string, RateLimitBucket>();
let lastSweepAt = 0;

function sweepExpiredBuckets(now: number) {
  if (now - lastSweepAt < 60_000) {
    return;
  }

  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }

  lastSweepAt = now;
}

function getClientAddress(req: Request): string {
  const candidate =
    typeof req.ip === "string" && req.ip.trim().length > 0
      ? req.ip.trim()
      : typeof req.socket.remoteAddress === "string" && req.socket.remoteAddress.trim().length > 0
        ? req.socket.remoteAddress.trim()
        : "unknown";

  return candidate;
}

export function createRateLimit(options: RateLimitOptions): RequestHandler {
  return (req, res, next) => {
    const now = Date.now();
    sweepExpiredBuckets(now);

    const keySuffix = options.keyGenerator?.(req) ?? getClientAddress(req);
    const bucketKey = `${options.name}:${keySuffix}`;

    const existingBucket = buckets.get(bucketKey);
    const bucket =
      existingBucket && existingBucket.resetAt > now
        ? existingBucket
        : {
            count: 0,
            resetAt: now + options.windowMs,
          };

    bucket.count += 1;
    buckets.set(bucketKey, bucket);

    const resetInSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    const remaining = Math.max(0, options.max - bucket.count);

    res.setHeader("X-RateLimit-Limit", String(options.max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(resetInSeconds));

    if (bucket.count > options.max) {
      res.setHeader("Retry-After", String(resetInSeconds));
      return res.status(429).json({
        message: options.message ?? "Too many requests. Try again later.",
      });
    }

    return next();
  };
}
