import { Context, Next } from 'hono';

const WEAK_ADMIN_TOKENS = new Set(['', 'change-me', 'change-me-to-a-random-string']);

// Routes that require auth for ALL methods (including GET)
const PROTECTED_PREFIXES = ['/api/ai-providers', '/api/health', '/api/settings'];
const PUBLIC_GET_PATHS = new Set(['/api/health/live']);

function extractBearerToken(value?: string): string {
  return value?.replace(/^Bearer\s+/i, '').trim() || '';
}

function isWeakAdminToken(token?: string): boolean {
  return WEAK_ADMIN_TOKENS.has((token || '').trim());
}

export function assertAdminTokenConfigured() {
  if (process.env.NODE_ENV !== 'production') return;
  if (isWeakAdminToken(process.env.ADMIN_TOKEN)) {
    throw new Error('ADMIN_TOKEN must be set to a non-default value in production');
  }
}

export function hasValidAdminToken(authHeader?: string): boolean {
  const adminToken = process.env.ADMIN_TOKEN || '';
  if (isWeakAdminToken(adminToken)) return false;
  return extractBearerToken(authHeader) === adminToken;
}

export function requiresAdminTokenForRequest(method: string, path: string): boolean {
  if (method.toUpperCase() === 'GET' && PUBLIC_GET_PATHS.has(path)) {
    return false;
  }

  const isFullyProtected = PROTECTED_PREFIXES.some(prefix => path.startsWith(prefix));
  if (method.toUpperCase() === 'GET' && !isFullyProtected) {
    return false;
  }

  return true;
}

export async function authMiddleware(c: Context, next: Next) {
  const path = c.req.path;
  const method = c.req.method;

  if (!requiresAdminTokenForRequest(method, path)) {
    return next();
  }

  // Everything else needs token
  if (!hasValidAdminToken(c.req.header('Authorization'))) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid or missing token' } }, 401);
  }

  return next();
}
