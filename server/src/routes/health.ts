import { Hono } from 'hono';
import { getOne, getMany, query } from '../db/index.js';
import { runScrapeJob, runSummarizeJob, runDigestJob, runCleanupJob } from '../jobs/scheduler.js';

const health = new Hono();

health.get('/live', async (c) => {
  try {
    await getOne('SELECT 1');
    return c.json({ success: true, data: { status: 'ok' } });
  } catch {
    return c.json({ success: false, error: { code: 'HEALTH_CHECK_FAILED', message: 'Database unavailable' } }, 500);
  }
});

health.get('/', async (c) => {
  try {
    const dbCheck = await getOne('SELECT NOW() as time');

    const sourcesCount = await getOne<{ total: string; enabled: string }>(
      `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_enabled = true) as enabled FROM sources`
    );

    const articlesCount = await getOne<{ total: string; pending: string; done: string; failed: string }>(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE summary_status = 'pending') as pending,
              COUNT(*) FILTER (WHERE summary_status = 'done') as done,
              COUNT(*) FILTER (WHERE summary_status = 'failed') as failed
       FROM articles`
    );

    const lastDigest = await getOne(
      `SELECT digest_date, title, article_count FROM digests WHERE status = 'done' ORDER BY digest_date DESC LIMIT 1`
    );

    const recentLogs = await getMany(
      `SELECT source_id, job_type, status, started_at, items_found, items_inserted, error_message
       FROM scrape_logs ORDER BY started_at DESC LIMIT 5`
    );

    return c.json({
      success: true,
      data: {
        status: 'ok',
        time: dbCheck?.time,
        sources: {
          total: parseInt(sourcesCount?.total || '0'),
          enabled: parseInt(sourcesCount?.enabled || '0'),
        },
        articles: {
          total: parseInt(articlesCount?.total || '0'),
          pending: parseInt(articlesCount?.pending || '0'),
          done: parseInt(articlesCount?.done || '0'),
          failed: parseInt(articlesCount?.failed || '0'),
        },
        lastDigest: lastDigest || null,
        recentLogs,
      },
    });
  } catch (err: any) {
    return c.json({
      success: false,
      error: { code: 'HEALTH_CHECK_FAILED', message: err.message },
    }, 500);
  }
});

// Manual trigger endpoints (POST, can auth)
health.post('/trigger/scrape', async (c) => {
  // Fire scrape then auto-summarize new articles
  (async () => {
    await runScrapeJob();
    await runSummarizeJob();
  })().catch(console.error);
  return c.json({ success: true, data: { message: 'Đã kích hoạt job scrape + tóm tắt' } });
});

health.post('/trigger/summarize', async (c) => {
  runSummarizeJob().catch(console.error);
  return c.json({ success: true, data: { message: 'Đã kích hoạt job tóm tắt' } });
});

health.post('/trigger/digest', async (c) => {
  runDigestJob().catch(console.error);
  return c.json({ success: true, data: { message: 'Đã kích hoạt job tạo bản tin' } });
});

health.post('/trigger/cleanup', async (c) => {
  runCleanupJob().catch(console.error);
  return c.json({ success: true, data: { message: 'Đã kích hoạt job dọn dẹp' } });
});

export { health };
