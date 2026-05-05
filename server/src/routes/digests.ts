import { Hono } from 'hono';
import { getMany, getOne, query } from '../db/index.js';
import { decodeArticleRows } from '../lib/htmlEntities.js';

const digests = new Hono();

function parseBoundedInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = parseInt(value || '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

// Digest moi nhat
digests.get('/latest', async (c) => {
  const lang = c.req.query('lang') || 'vi';
  const row = await getOne(
    `SELECT * FROM digests
     WHERE status = 'done' AND language = $1
     ORDER BY digest_date DESC, created_at DESC LIMIT 1`,
    [lang]
  );
  if (!row) {
    return c.json({ success: true, data: null });
  }

  // Lay articles trong digest
  const items = await getMany(
    `SELECT a.id, a.title, a.url, a.summary_text, a.image_url, a.published_at,
            a.source_id, s.name as source_name, di.section
     FROM digest_items di
     JOIN articles a ON a.id = di.article_id
     LEFT JOIN sources s ON s.id = a.source_id
     WHERE di.digest_id = $1
     ORDER BY di.created_at`,
    [row.id]
  );

  return c.json({ success: true, data: { ...row, articles: decodeArticleRows(items) } });
});

// Danh sach digests (phan trang)
digests.get('/', async (c) => {
  const page = parseBoundedInt(c.req.query('page'), 1, 1, 500);
  const limit = parseBoundedInt(c.req.query('limit'), 10, 1, 50);
  const offset = (page - 1) * limit;

  const countResult = await getOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM digests WHERE status = 'done'`
  );
  const total = parseInt(countResult?.count || '0');

  const rows = await getMany(
    `SELECT id, digest_date, title, article_count, language, status, created_at
     FROM digests WHERE status = 'done'
     ORDER BY digest_date DESC, created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  return c.json({
    success: true,
    data: rows,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// Chi tiet digest
digests.get('/:id', async (c) => {
  const { id } = c.req.param();
  const row = await getOne('SELECT * FROM digests WHERE id = $1', [id]);
  if (!row) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Digest not found' } }, 404);
  }

  const items = await getMany(
    `SELECT a.id, a.title, a.url, a.summary_text, a.image_url, a.published_at,
            a.source_id, s.name as source_name, di.section
     FROM digest_items di
     JOIN articles a ON a.id = di.article_id
     LEFT JOIN sources s ON s.id = a.source_id
     WHERE di.digest_id = $1
     ORDER BY di.created_at`,
    [id]
  );

  return c.json({ success: true, data: { ...row, articles: decodeArticleRows(items) } });
});

// Xoa digest
digests.delete('/:id', async (c) => {
  const { id } = c.req.param();
  const row = await getOne('SELECT id FROM digests WHERE id = $1', [id]);
  if (!row) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Digest not found' } }, 404);
  }
  await query('DELETE FROM digest_items WHERE digest_id = $1', [id]);
  await query('DELETE FROM digests WHERE id = $1', [id]);
  return c.json({ success: true, data: { deleted: id } });
});

export { digests };
