import { Hono } from 'hono';
import { getMany, getOne, query } from '../db/index.js';

const articles = new Hono();
const LOCAL_DATE_SQL = `DATE(COALESCE(a.published_at, a.created_at) AT TIME ZONE 'Asia/Ho_Chi_Minh')`;

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
    `SELECT ${LOCAL_DATE_SQL} as date, COUNT(*)::int as count
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
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '50');
  const sourceId = c.req.query('sourceId');
  const status = c.req.query('status');
  const date = c.req.query('date'); // YYYY-MM-DD local VN date
  const offset = (page - 1) * limit;

  let where = 'WHERE 1=1';
  const params: any[] = [];
  let paramIndex = 1;

  if (sourceId) {
    where += ` AND a.source_id = $${paramIndex++}`;
    params.push(sourceId);
  }
  if (status) {
    where += ` AND a.summary_status = $${paramIndex++}`;
    params.push(status);
  }
  if (date) {
    where += ` AND ${LOCAL_DATE_SQL} = $${paramIndex++}`;
    params.push(date);
  }

  const countResult = await getOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM articles a ${where}`,
    params
  );
  const total = parseInt(countResult?.count || '0');

  params.push(limit, offset);
  const rows = await getMany(
    `SELECT a.id, a.source_id, a.url, a.title, a.author, a.published_at,
            a.content_type, a.language, a.raw_excerpt, a.summary_text, a.tldr,
            a.summary_status, a.image_url, a.created_at,
            s.name as source_name, s.type as source_type,
            ${LOCAL_DATE_SQL} as local_date
     FROM articles a
     LEFT JOIN sources s ON s.id = a.source_id
     ${where}
     ORDER BY COALESCE(a.published_at, a.created_at) DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    params
  );

  return c.json({
    success: true,
    data: rows,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit), date: date || null },
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
     SET summary_text = NULL, summary_status = 'pending'
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

  return c.json({ success: true, data: row });
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
    `SELECT a.*, s.name as source_name, s.type as source_type
     FROM articles a
     LEFT JOIN sources s ON s.id = a.source_id
     WHERE a.id = $1`,
    [id]
  );
  if (!row) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Article not found' } }, 404);
  }
  return c.json({ success: true, data: row });
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
