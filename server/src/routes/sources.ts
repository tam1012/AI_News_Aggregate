import { Hono } from 'hono';
import { getMany, getOne, query } from '../db/index.js';
import { generateId, normalizePublicHttpUrl, normalizeUrl } from '../lib/utils.js';
import { resolveSourceUrl } from '../lib/sourceResolver.js';

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

  if (!['rss', 'web', 'youtube'].includes(type)) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION', message: 'type must be rss, web, or youtube' },
    }, 400);
  }

  const redditRssUrl = getRedditRssUrl(url);
  if (redditRssUrl) {
    type = 'rss';
    url = redditRssUrl;
    parser_config = null;
  }
  if (isYoutubeUrl(url)) {
    type = 'youtube';
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
    body.type = 'youtube';
  }

  if (body.type !== undefined && !['rss', 'web', 'youtube'].includes(body.type)) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION', message: 'type must be rss, web, or youtube' },
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
