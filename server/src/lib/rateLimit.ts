import { Context, Next } from 'hono';

interface Bucket {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyPrefix: string;
}

const buckets = new Map<string, Bucket>();
const HEAVY_ACTION_PATHS = [
  /\/scrape$/,
  /\/retry$/,
  /\/delete$/,
  /\/summarize$/,
  /\/digest$/,
];

function getClientIp(c: Context): string {
  return c.req.header('cf-connecting-ip')
    || c.req.header('x-real-ip')
    || c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
}

function checkRateLimit(key: string, options: RateLimitOptions): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  existing.count++;
  if (existing.count <= options.max) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

function pruneExpiredBuckets() {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

setInterval(pruneExpiredBuckets, 5 * 60 * 1000).unref?.();

function isWriteMethod(method: string): boolean {
  return ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method.toUpperCase());
}

function isHeavyAction(path: string): boolean {
  return HEAVY_ACTION_PATHS.some((pattern) => pattern.test(path));
}

export async function writeRateLimitMiddleware(c: Context, next: Next) {
  if (!isWriteMethod(c.req.method)) return next();

  const ip = getClientIp(c);
  const path = c.req.path;
  const options: RateLimitOptions = isHeavyAction(path)
    ? { keyPrefix: 'heavy', windowMs: 60_000, max: 10 }
    : { keyPrefix: 'write', windowMs: 60_000, max: 120 };
  const result = checkRateLimit(`${options.keyPrefix}:${ip}`, options);

  if (!result.allowed) {
    c.header('Retry-After', String(result.retryAfterSeconds));
    return c.json({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
    }, 429);
  }

  return next();
}

export function recordAuthFailure(c: Context): { allowed: boolean; retryAfterSeconds: number } {
  const options: RateLimitOptions = { keyPrefix: 'auth', windowMs: 5 * 60_000, max: 10 };
  return checkRateLimit(`${options.keyPrefix}:${getClientIp(c)}`, options);
}
