import { Hono } from 'hono';
import { getMany, getOne, query } from '../db/index.js';
import { generateId, normalizePublicHttpUrl, normalizeUrl } from '../lib/utils.js';
import { resolveSourceUrl } from '../lib/sourceResolver.js';
import { getFetcherForSource } from '../services/fetchers/registry.js';
import { SourceRow, sourceFetchers } from '../services/fetchers/index.js';
import { scrapeSource } from '../services/scraper.js';
import { enqueueDiscoveredArticles } from '../services/article-fetch-queue.js';

const sources = new Hono();

function getRedditRssUrl(url: string): string | null {
  try {
    const normalizedUrl = normalizeUrl(url);
    const u = new URL(normalizedUrl);
    const hostname = u.hostname.toLowerCase();
    if (hostname !== 'reddit.com' && hostname !== 'www.reddit.com') return null;

    const subredditMatch = u.pathname.match(/^\/r\/([^/]+)\/?$/i);
    if (!subredditMatch) return null;

    u.pathname = `/r/${subredditMatch[1]}/.rss`;
    u.search = '';
    u.hash = '';
    return normalizeUrl(u.toString());
  } catch {
    return null;
  }
}

function isYoutubeUrl(url: string): boolean {
  try {
    const normalizedUrl = normalizeUrl(url);
    const hostname = new URL(normalizedUrl).hostname.toLowerCase();
    return ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(hostname);
  } catch {
    return false;
  }
}

// Lay tat ca sources
sources.get('/', async (c) => {
  const rows = await getMany(
    `SELECT id, type, name, url, language, category, is_enabled,
            fetch_interval_minutes, parser_config,
            last_checked_at, last_success_at, last_error_message,
            consecutive_failures, next_run_at, created_at, updated_at
     FROM sources ORDER BY created_at DESC`
  );
  return c.json({ success: true, data: rows });
});

// Lay 1 source theo id
sources.get('/:id', async (c) => {
  const { id } = c.req.param();
  const row = await getOne('SELECT * FROM sources WHERE id = $1', [id]);
  if (!row) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Source not found' } }, 404);
  }
  return c.json({ success: true, data: row });
});

// Them source moi
sources.post('/', async (c) => {
  const body = await c.req.json();
  let { type, name, url, language, category, fetch_interval_minutes, parser_config } = body;

  if (!type || !name || !url) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION', message: 'type, name, url are required' },
    }, 400);
  }

  if (!['rss', 'web'].includes(type)) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION', message: 'type must be rss or web' },
    }, 400);
  }

  const redditRssUrl = getRedditRssUrl(url);
  if (redditRssUrl) {
    type = 'rss';
    url = redditRssUrl;
    parser_config = null;
  }
  if (isYoutubeUrl(url)) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION', message: 'YouTube sources are disabled. Use the YouTube app for videos.' },
    }, 400);
  }

  const id = generateId('src');
  const normalizedUrl = normalizePublicHttpUrl(url);
  if (!normalizedUrl) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION', message: 'url must be a public http(s) URL' },
    }, 400);
  }
  const now = new Date().toISOString();

  try {
    await query(
      `INSERT INTO sources (id, type, name, url, language, category, fetch_interval_minutes, parser_config, next_run_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $9)`,
      [id, type, name, normalizedUrl, language || 'vi', category || null, fetch_interval_minutes || 60, parser_config ? JSON.stringify(parser_config) : null, now]
    );

    const row = await getOne('SELECT * FROM sources WHERE id = $1', [id]);
    return c.json({ success: true, data: row }, 201);
  } catch (err: any) {
    if (err.code === '23505') {
      return c.json({
        success: false,
        error: { code: 'DUPLICATE', message: 'Source URL already exists' },
      }, 409);
    }
    throw err;
  }
});

// Cap nhat source
sources.patch('/:id', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();

  const existing = await getOne('SELECT id FROM sources WHERE id = $1', [id]);
  if (!existing) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Source not found' } }, 404);
  }

  if (body.url !== undefined) {
    const redditRssUrl = getRedditRssUrl(body.url);
    if (redditRssUrl) {
      body.url = redditRssUrl;
      body.type = 'rss';
      body.parser_config = null;
    }
  }

  if (body.url !== undefined && isYoutubeUrl(body.url)) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION', message: 'YouTube sources are disabled. Use the YouTube app for videos.' },
    }, 400);
  }

  if (body.type !== undefined && !['rss', 'web'].includes(body.type)) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION', message: 'type must be rss or web' },
    }, 400);
  }

  // Cho phep update cac truong nay
  const allowedFields = ['name', 'url', 'language', 'category', 'is_enabled', 'fetch_interval_minutes', 'parser_config', 'type'];
  const updates: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      let value = body[field];
      if (field === 'url') {
        value = normalizePublicHttpUrl(value);
        if (!value) {
          return c.json({
            success: false,
            error: { code: 'VALIDATION', message: 'url must be a public http(s) URL' },
          }, 400);
        }
      }
      if (field === 'parser_config') value = JSON.stringify(value);
      updates.push(`${field} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  }

  if (updates.length === 0) {
    return c.json({ success: false, error: { code: 'VALIDATION', message: 'No fields to update' } }, 400);
  }

  values.push(id);
  await query(`UPDATE sources SET ${updates.join(', ')} WHERE id = $${paramIndex}`, values);

  const row = await getOne('SELECT * FROM sources WHERE id = $1', [id]);
  return c.json({ success: true, data: row });
});

sources.post('/:id/scrape', async (c) => {
  const { id } = c.req.param();
  const source = await getOne<SourceRow & { is_enabled: boolean; consecutive_failures: number }>(
    `SELECT id, type, name, url, language, category, fetch_interval_minutes, parser_config,
            is_enabled, consecutive_failures
     FROM sources
     WHERE id = $1`,
    [id]
  );
  if (!source) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Source not found' } }, 404);
  }
  if (!source.is_enabled) {
    return c.json({ success: false, error: { code: 'VALIDATION', message: 'Source is disabled' } }, 400);
  }

  const logId = generateId('log');
  const startedAt = new Date().toISOString();

  try {
    const fetcher = getFetcherForSource(source, sourceFetchers);
    const scrapeIntervalHours = Math.max(1, Math.ceil(source.fetch_interval_minutes / 60));
    let result;
    if (fetcher.discover) {
      const discovered = await fetcher.discover(source);
      const enqueued = await enqueueDiscoveredArticles(discovered);
      result = { itemsFound: discovered.length, itemsInserted: enqueued, errors: [] as string[] };
    } else {
      result = await scrapeSource(source);
    }

    const nextRunDelayMinutes = result.errors.length > 0
      ? Math.min(scrapeIntervalHours * 60 * 2, 24 * 60)
      : scrapeIntervalHours * 60;
    const status = result.errors.length > 0 ? (result.itemsInserted > 0 ? 'partial' : 'failed') : 'success';
    const errorMessage = result.errors.length > 0 ? result.errors.join('; ').substring(0, 500) : null;

    await query(
      `UPDATE sources SET
         last_checked_at = NOW(),
         last_success_at = CASE WHEN $2 != 'failed' THEN NOW() ELSE last_success_at END,
         consecutive_failures = CASE WHEN $2 = 'failed' THEN consecutive_failures + 1 ELSE 0 END,
         last_error_message = $3,
         next_run_at = NOW() + ($4 * INTERVAL '1 minute')
       WHERE id = $1`,
      [source.id, status, errorMessage, nextRunDelayMinutes]
    );

    await query(
      `INSERT INTO scrape_logs (id, source_id, job_type, status, started_at, finished_at, items_found, items_inserted, error_message, metadata)
       VALUES ($1, $2, 'manual_source_scrape', $3, $4, NOW(), $5, $6, $7, $8)`,
      [logId, source.id, status, startedAt, result.itemsFound, result.itemsInserted, errorMessage, result.metadata ? JSON.stringify(result.metadata) : null]
    );

    return c.json({
      success: true,
      data: {
        status,
        itemsFound: result.itemsFound,
        itemsInserted: result.itemsInserted,
        errors: result.errors,
      },
    });
  } catch (err: any) {
    const message = err.message.substring(0, 500);
    const failureCount = source.consecutive_failures + 1;
    const backoffMinutes = Math.min(Math.max(1, Math.ceil(source.fetch_interval_minutes / 60)) * 60 * Math.pow(2, Math.max(failureCount - 1, 0)), 24 * 60);

    await query(
      `UPDATE sources SET
         last_checked_at = NOW(), consecutive_failures = consecutive_failures + 1,
         last_error_message = $1,
         next_run_at = NOW() + ($3 * INTERVAL '1 minute')
       WHERE id = $2`,
      [message, source.id, backoffMinutes]
    );

    await query(
      `INSERT INTO scrape_logs (id, source_id, job_type, status, started_at, finished_at, error_message)
       VALUES ($1, $2, 'manual_source_scrape', 'failed', $3, NOW(), $4)`,
      [logId, source.id, startedAt, message]
    );

    return c.json({ success: false, error: { code: 'SCRAPE_FAILED', message } }, 500);
  }
});

// Xoa source
sources.delete('/:id', async (c) => {
  const { id } = c.req.param();
  const result = await query('DELETE FROM sources WHERE id = $1', [id]);
  if (result.rowCount === 0) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Source not found' } }, 404);
  }
  return c.json({ success: true, data: { deleted: true } });
});

// Toggle enable/disable source
sources.post('/:id/toggle', async (c) => {
  const { id } = c.req.param();
  const row = await getOne('SELECT id, is_enabled FROM sources WHERE id = $1', [id]);
  if (!row) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Source not found' } }, 404);
  }

  await query('UPDATE sources SET is_enabled = $1 WHERE id = $2', [!row.is_enabled, id]);
  const updated = await getOne('SELECT * FROM sources WHERE id = $1', [id]);
  return c.json({ success: true, data: updated });
});

// ==========================================
// Auto-detect: dan link vao, he thong tu phan tich
// ==========================================
sources.post('/detect', async (c) => {
  const { url } = await c.req.json();
  if (!url) {
    return c.json({ success: false, error: { code: 'VALIDATION', message: 'url is required' } }, 400);
  }

  try {
    const result = await resolveSourceUrl(url);
    return c.json({ success: true, data: result });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'VALIDATION', message: err.message } }, 400);
  }
});

export { sources };
