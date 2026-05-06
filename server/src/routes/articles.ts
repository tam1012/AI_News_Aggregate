import { Hono } from 'hono';
import { getMany, getOne, query } from '../db/index.js';
import { LOCAL_DATE_SQL, LOCAL_DATE_TEXT_SQL, buildArticleListFilters, buildArticleListOrderBy } from '../lib/articleFilters.js';
import { decodeArticleRows, decodeArticleTextFields } from '../lib/htmlEntities.js';

const articles = new Hono();

function parseBoundedInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = parseInt(value || '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

// Danh sach tag pho bien (de UI hien topic filter chips)
articles.get('/tags', async (c) => {
  const feedTab = c.req.query('feedTab');
  const date = c.req.query('date');

  let where = `WHERE a.summary_status = 'done'`;
  const params: any[] = [];
  let paramIndex = 1;

  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    where += ` AND ${LOCAL_DATE_SQL} = $${paramIndex++}`;
    params.push(date);
  }

  // feedTab filter (reuse same logic as article list)
  if (feedTab === 'youtube') {
    where += ` AND (s.type = 'youtube' OR a.url ILIKE '%youtube.com%' OR a.url ILIKE '%youtu.be%')`;
  } else if (feedTab === 'reddit') {
    where += ` AND (s.name ILIKE '%reddit%' OR a.url ILIKE '%reddit.com%' OR a.title ILIKE '[r/%')`;
  } else if (feedTab === 'voz') {
    where += ` AND (s.name ILIKE '%voz%' OR a.url ILIKE '%voz.vn%')`;
  } else if (feedTab === 'news') {
    where += ` AND NOT (s.type = 'youtube' OR a.url ILIKE '%youtube.com%' OR a.url ILIKE '%youtu.be%' OR s.name ILIKE '%reddit%' OR a.url ILIKE '%reddit.com%' OR a.title ILIKE '[r/%' OR s.name ILIKE '%voz%' OR a.url ILIKE '%voz.vn%')`;
  }

  const rows = await getMany(
    `SELECT tag, COUNT(*)::int as count
     FROM articles a
     LEFT JOIN sources s ON s.id = a.source_id,
     LATERAL unnest(a.tags) AS tag
     ${where}
     GROUP BY tag
     ORDER BY count DESC
     LIMIT 20`,
    params
  );

  return c.json({ success: true, data: rows });
});

// Danh sach ngay co bai viet (de UI hien date picker)
articles.get('/dates', async (c) => {
  const sourceId = c.req.query('sourceId');

  let where = 'WHERE 1=1';
  const params: any[] = [];
  let paramIndex = 1;

  if (sourceId) {
    where += ` AND a.source_id = $${paramIndex++}`;
    params.push(sourceId);
  }

  const rows = await getMany(
    `SELECT ${LOCAL_DATE_TEXT_SQL} as date, COUNT(*)::int as count
     FROM articles a
     ${where}
     GROUP BY ${LOCAL_DATE_SQL}
     ORDER BY date DESC
     LIMIT 60`,
    params
  );

  return c.json({ success: true, data: rows });
});

// Danh sach articles (phan trang, loc theo ngay va nguon)
articles.get('/', async (c) => {
  const page = parseBoundedInt(c.req.query('page'), 1, 1, 500);
  const limit = parseBoundedInt(c.req.query('limit'), 50, 1, 100);
  const sourceId = c.req.query('sourceId');
  const status = c.req.query('status');
  const date = c.req.query('date'); // YYYY-MM-DD local VN date
  const tag = c.req.query('tag');
  const minScore = c.req.query('minScore');
  const feedTab = c.req.query('feedTab');
  const sort = c.req.query('sort');
  const offset = (page - 1) * limit;

  let filters;
  try {
    filters = buildArticleListFilters({ sourceId, status, date, tag, minScore, feedTab, sort });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'VALIDATION', message: err.message } }, 400);
  }

  const countResult = await getOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM articles a LEFT JOIN sources s ON s.id = a.source_id ${filters.where}`,
    filters.params
  );
  const total = parseInt(countResult?.count || '0');

  const params = [...filters.params];
  const orderBy = buildArticleListOrderBy(filters.sort);
  let paramIndex = filters.nextParamIndex;
  params.push(limit, offset);
  const rows = await getMany(
    `SELECT a.id, a.source_id, a.url, a.title, a.author, a.published_at,
            a.content_type, a.language, a.raw_excerpt, a.summary_text, a.tldr,
            a.summary_short, a.hot_score, a.tags,
            a.summary_status, a.retry_count, a.last_summary_error, a.image_url, a.created_at,
            s.name as source_name, s.type as source_type,
            ${LOCAL_DATE_TEXT_SQL} as local_date
     FROM articles a
     LEFT JOIN sources s ON s.id = a.source_id
     ${filters.where}
     ${orderBy}
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    params
  );

  return c.json({
    success: true,
    data: decodeArticleRows(rows),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit), date: date || null, tag: tag || null, minScore: minScore || null, feedTab: feedTab || null, sort: filters.sort },
  });
});

articles.get('/fetch-jobs', async (c) => {
  const page = parseBoundedInt(c.req.query('page'), 1, 1, 500);
  const limit = parseBoundedInt(c.req.query('limit'), 50, 1, 100);
  const status = c.req.query('status');
  const offset = (page - 1) * limit;

  const params: any[] = [];
  let where = 'WHERE 1=1';
  if (status) {
    if (!['discovered', 'fetching', 'done', 'failed'].includes(status)) {
      return c.json({ success: false, error: { code: 'VALIDATION', message: 'Invalid fetch job status' } }, 400);
    }
    params.push(status);
    where += ` AND j.status = $${params.length}`;
  }

  const countResult = await getOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM article_fetch_jobs j ${where}`,
    params
  );
  const total = parseInt(countResult?.count || '0');

  params.push(limit, offset);
  const rows = await getMany(
    `SELECT j.id, j.source_id, j.url, j.title, j.external_id, j.published_at,
            j.status, j.retry_count, j.last_error, j.created_at, j.updated_at,
            s.name as source_name, s.type as source_type
     FROM article_fetch_jobs j
     LEFT JOIN sources s ON s.id = j.source_id
     ${where}
     ORDER BY CASE j.status WHEN 'failed' THEN 0 WHEN 'fetching' THEN 1 WHEN 'discovered' THEN 2 ELSE 3 END,
              j.updated_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return c.json({
    success: true,
    data: rows,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit), status: status || null },
  });
});

articles.post('/fetch-jobs/:id/retry', async (c) => {
  const { id } = c.req.param();
  const existing = await getOne('SELECT id FROM article_fetch_jobs WHERE id = $1', [id]);
  if (!existing) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Fetch job not found' } }, 404);
  }

  await query(
    `UPDATE article_fetch_jobs
     SET status = 'discovered', last_error = NULL, updated_at = NOW()
     WHERE id = $1`,
    [id]
  );

  import('../jobs/scheduler.js').then(m => m.runArticleFetchJob()).catch(console.error);

  return c.json({ success: true, data: { retried: true } });
});

articles.delete('/fetch-jobs/:id', async (c) => {
  const { id } = c.req.param();
  const result = await query('DELETE FROM article_fetch_jobs WHERE id = $1', [id]);
  if (!result.rowCount) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Fetch job not found' } }, 404);
  }

  return c.json({ success: true, data: { deleted: true } });
});

articles.post('/:id/reset-summary', async (c) => {
  const { id } = c.req.param();
  const existing = await getOne('SELECT id FROM articles WHERE id = $1', [id]);
  if (!existing) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Article not found' } }, 404);
  }

  await query(
    `UPDATE articles
     SET summary_text = NULL, tldr = NULL, summary_short = NULL, hot_score = NULL,
         tags = '{}'::TEXT[], summary_status = 'pending', retry_count = 0, last_summary_error = NULL
     WHERE id = $1`,
    [id]
  );

  // Trigger summarize job ngay lập tức (background, không chờ)
  import('../jobs/scheduler.js').then(m => m.runSummarizeJob()).catch(console.error);

  const row = await getOne(
    `SELECT a.*, s.name as source_name, s.type as source_type
     FROM articles a
     LEFT JOIN sources s ON s.id = a.source_id
     WHERE a.id = $1`,
    [id]
  );

  return c.json({ success: true, data: decodeArticleTextFields(row) });
});

articles.delete('/:id', async (c) => {
  const { id } = c.req.param();
  const existing = await getOne('SELECT id FROM articles WHERE id = $1', [id]);
  if (!existing) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Article not found' } }, 404);
  }

  await query('DELETE FROM digest_items WHERE article_id = $1', [id]);
  await query('DELETE FROM articles WHERE id = $1', [id]);

  return c.json({ success: true, data: { deleted: true } });
});

// Chi tiet article
articles.get('/:id', async (c) => {
  const { id } = c.req.param();
  const row = await getOne(
    `SELECT a.id, a.source_id, a.url, a.title, a.author, a.published_at,
            a.content_type, a.language, a.raw_excerpt, a.summary_text, a.tldr,
            a.summary_short, a.hot_score, a.tags,
            a.summary_status, a.retry_count, a.last_summary_error, a.image_url, a.created_at, a.updated_at,
            s.name as source_name, s.type as source_type
     FROM articles a
     LEFT JOIN sources s ON s.id = a.source_id
     WHERE a.id = $1`,
    [id]
  );
  if (!row) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Article not found' } }, 404);
  }
  return c.json({ success: true, data: decodeArticleTextFields(row) });
});

// Manual Rescrape (for Admin)
articles.post('/:id/rescrape', async (c) => {
  const { id } = c.req.param();
  const { rescrapeArticle } = await import('../services/rescrape.js');
  const { runSummarizeJob } = await import('../jobs/scheduler.js');
  
  const updated = await rescrapeArticle(id, true); // force rescrape
  if (updated) {
    // Fire and forget summarizing
    runSummarizeJob().catch(console.error);
    return c.json({ success: true, message: 'Article content updated and re-summarizing triggered.' });
  } else {
    return c.json({ success: false, message: 'Article content was not updated (either fetch failed, not a forum source, or no new content found).' });
  }
});

export { articles };
