import { Hono } from 'hono';
import { getMany, getOne, query } from '../db/index.js';
import { generateId } from '../lib/utils.js';
import { invalidateBlocklistCache, getBlocklistMatch } from '../services/fetchers/blocklist.js';

const blocklist = new Hono();

const VALID_TYPES = new Set(['domain', 'path']);

function normalizePattern(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\s+/g, '');
}

function validateType(input: unknown): 'domain' | 'path' | null {
  if (typeof input !== 'string') return null;
  return VALID_TYPES.has(input) ? (input as 'domain' | 'path') : null;
}

blocklist.get('/', async (c) => {
  const rows = await getMany(
    `SELECT id, pattern, type, reason, is_enabled, hit_count, last_hit_at, created_at, updated_at
     FROM blocklist
     ORDER BY is_enabled DESC, hit_count DESC, pattern ASC`
  );
  return c.json({ success: true, data: rows });
});

blocklist.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const pattern = normalizePattern(body.pattern);
  const type = validateType(body.type);
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : null;

  if (!pattern) return c.json({ success: false, error: { code: 'VALIDATION', message: 'Pattern không được rỗng' } }, 400);
  if (!type) return c.json({ success: false, error: { code: 'VALIDATION', message: 'Type phải là domain hoặc path' } }, 400);
  if (type === 'domain' && pattern.includes('/')) {
    return c.json({ success: false, error: { code: 'VALIDATION', message: 'Domain pattern không chứa dấu /' } }, 400);
  }
  if (type === 'path' && !pattern.includes('/')) {
    return c.json({ success: false, error: { code: 'VALIDATION', message: 'Path pattern phải chứa dấu /' } }, 400);
  }

  const existing = await getOne('SELECT id FROM blocklist WHERE pattern = $1', [pattern]);
  if (existing) {
    return c.json({ success: false, error: { code: 'DUPLICATE', message: 'Pattern đã tồn tại' } }, 409);
  }

  const id = generateId('blk');
  await query(
    `INSERT INTO blocklist (id, pattern, type, reason) VALUES ($1, $2, $3, $4)`,
    [id, pattern, type, reason]
  );
  invalidateBlocklistCache();
  const row = await getOne('SELECT * FROM blocklist WHERE id = $1', [id]);
  return c.json({ success: true, data: row });
});

blocklist.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const updates: string[] = [];
  const params: any[] = [];
  let i = 1;

  if (typeof body.is_enabled === 'boolean') {
    updates.push(`is_enabled = $${i++}`);
    params.push(body.is_enabled);
  }
  if (typeof body.reason === 'string') {
    updates.push(`reason = $${i++}`);
    params.push(body.reason.trim().slice(0, 500) || null);
  }
  if (typeof body.pattern === 'string') {
    const pattern = normalizePattern(body.pattern);
    if (!pattern) return c.json({ success: false, error: { code: 'VALIDATION', message: 'Pattern không hợp lệ' } }, 400);
    updates.push(`pattern = $${i++}`);
    params.push(pattern);
  }
  if (typeof body.type === 'string') {
    const type = validateType(body.type);
    if (!type) return c.json({ success: false, error: { code: 'VALIDATION', message: 'Type không hợp lệ' } }, 400);
    updates.push(`type = $${i++}`);
    params.push(type);
  }

  if (updates.length === 0) {
    return c.json({ success: false, error: { code: 'VALIDATION', message: 'Không có trường nào để cập nhật' } }, 400);
  }

  params.push(id);
  const result = await query(
    `UPDATE blocklist SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
    params
  );
  if (result.rowCount === 0) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Blocklist entry không tồn tại' } }, 404);
  }
  invalidateBlocklistCache();
  return c.json({ success: true, data: result.rows[0] });
});

blocklist.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const result = await query('DELETE FROM blocklist WHERE id = $1', [id]);
  if (result.rowCount === 0) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Blocklist entry không tồn tại' } }, 404);
  }
  invalidateBlocklistCache();
  return c.json({ success: true, data: { id } });
});

blocklist.post('/test', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!url) {
    return c.json({ success: false, error: { code: 'VALIDATION', message: 'URL không được rỗng' } }, 400);
  }
  const match = await getBlocklistMatch(url);
  return c.json({
    success: true,
    data: {
      url,
      blocked: Boolean(match),
      match: match ? { id: match.id, pattern: match.pattern, type: match.type, reason: match.reason } : null,
    },
  });
});

export { blocklist };
