import { Hono } from 'hono';
import { getMany, getOne, query } from '../db/index.js';
import { LOCAL_DATE_SQL, LOCAL_DATE_TEXT_SQL, buildArticleListFilters } from '../lib/articleFilters.js';
import { decodeArticleRows, decodeArticleTextFields } from '../lib/htmlEntities.js';

const articles = new Hono();

function parseBoundedInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = parseInt(value || '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

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
  const offset = (page - 1) * limit;

  let filters;
  try {
    filters = buildArticleListFilters({ sourceId, status, date, tag, minScore, feedTab });
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'VALIDATION', message: err.message } }, 400);
  }

  const countResult = await getOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM articles a LEFT JOIN sources s ON s.id = a.source_id ${filters.where}`,
    filters.params
  );
  const total = parseInt(countResult?.count || '0');

  const params = [...filters.params];
  let paramIndex = filters.nextParamIndex;
  params.push(limit, offset);
  const rows = await getMany(
    `SELECT a.id, a.source_id, a.url, a.title, a.author, a.published_at,
            a.content_type, a.language, a.raw_excerpt, a.summary_text, a.tldr,
            a.summary_short, a.hot_score, a.tags,
            a.summary_status, a.retry_count, a.last_summary_error, a.image_url, a.created_at,
            s.name as source_name, s.type as source_type,
            ${LOCAL_DATE_SQL} as local_date
     FROM articles a
     LEFT JOIN sources s ON s.id = a.source_id
     ${filters.where}
     ORDER BY COALESCE(a.published_at, a.created_at) DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    params
  );

  return c.json({
    success: true,
    data: decodeArticleRows(rows),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit), date: date || null, tag: tag || null, minScore: minScore || null, feedTab: feedTab || null },
  });
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
