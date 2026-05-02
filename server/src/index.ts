import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { existsSync, readFileSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { sources } from './routes/sources.js';
import { articles } from './routes/articles.js';
import { digests } from './routes/digests.js';
import { health } from './routes/health.js';
import { aiProviders } from './routes/ai-providers.js';
import { authMiddleware } from './lib/auth.js';
import { startCronJobs } from './jobs/scheduler.js';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: process.env.CORS_ORIGIN || '*',
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Auth cho write operations
app.use('/api/*', authMiddleware);

// API Routes
app.route('/api/health', health);
app.route('/api/sources', sources);
app.route('/api/articles', articles);
app.route('/api/digests', digests);
app.route('/api/ai-providers', aiProviders);

// Serve static frontend (production)
const publicDir = join(__dirname, '..', 'public');
if (existsSync(publicDir)) {
  app.use('/*', serveStatic({ root: publicDir }));
  // SPA fallback: routes without a file extension return index.html; missing assets return 404.
  app.get('*', (c) => {
    if (c.req.path.startsWith('/api')) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'API route not found' } }, 404);
    }
    if (extname(c.req.path)) {
      return c.notFound();
    }
    return c.html(readFileSync(join(publicDir, 'index.html'), 'utf-8'));
  });
} else {
  app.get('/', (c) => c.json({ name: 'News Digest V2 API', version: '1.0.0' }));
}

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: err.message },
  }, 500);
});

// Start server
const port = parseInt(process.env.PORT || '3000');

console.log(`Starting News Digest V2 server on port ${port}...`);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Server running at http://localhost:${info.port}`);

  // Start cron jobs
  startCronJobs();
});
