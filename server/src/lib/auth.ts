import { Context, Next } from 'hono';

// Routes that require auth for ALL methods (including GET)
const PROTECTED_PREFIXES = ['/api/ai-providers', '/api/health/trigger'];

export async function authMiddleware(c: Context, next: Next) {
  const path = c.req.path;
  const method = c.req.method;

  // Check if this route requires auth for ALL methods
  const isFullyProtected = PROTECTED_PREFIXES.some(prefix => path.startsWith(prefix));

  // Public: only GET on non-protected routes (articles, sources list, digests)
  if (method === 'GET' && !isFullyProtected) {
    return next();
  }

  // Everything else needs token
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  const adminToken = process.env.ADMIN_TOKEN;

  if (!adminToken || adminToken === 'change-me-to-a-random-string') {
    console.warn('WARNING: ADMIN_TOKEN not configured or using default value!');
  }

  if (!token || token !== adminToken) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid or missing token' } }, 401);
  }

  return next();
}
