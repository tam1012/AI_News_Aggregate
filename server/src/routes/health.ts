import { Hono } from 'hono';
import { getOne, getMany } from '../db/index.js';
import { runScrapeJob, runArticleFetchJob, runSummarizeJob, runDigestJob, runCleanupJob } from '../jobs/scheduler.js';

const health = new Hono();

health.get('/live', async (c) => {
  try {
    await getOne('SELECT 1');
    return c.json({ success: true, data: { status: 'ok' } });
  } catch {
    return c.json({ success: false, error: { code: 'HEALTH_CHECK_FAILED', message: 'Database unavailable' } }, 500);
  }
});

function num(value: unknown): number {
  return Number(value || 0);
}

health.get('/', async (c) => {
  try {
    const dbCheck = await getOne('SELECT NOW() as time');

    const sourcesCount = await getOne<{ total: string; enabled: string; due: string; failing: string; backed_off: string }>(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE is_enabled = true) as enabled,
              COUNT(*) FILTER (WHERE is_enabled = true AND (next_run_at IS NULL OR next_run_at <= NOW())) as due,
              COUNT(*) FILTER (WHERE is_enabled = true AND consecutive_failures > 0) as failing,
              COUNT(*) FILTER (WHERE is_enabled = true AND consecutive_failures > 0 AND next_run_at > NOW()) as backed_off
       FROM sources`
    );

    const articlesCount = await getOne<{ total: string; pending: string; processing: string; done: string; failed: string; skipped: string; retryable_failed: string }>(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE summary_status = 'pending') as pending,
              COUNT(*) FILTER (WHERE summary_status = 'processing') as processing,
              COUNT(*) FILTER (WHERE summary_status = 'done') as done,
              COUNT(*) FILTER (WHERE summary_status = 'failed') as failed,
              COUNT(*) FILTER (WHERE summary_status = 'skipped') as skipped,
              COUNT(*) FILTER (WHERE summary_status = 'failed' AND retry_count < 3) as retryable_failed
       FROM articles`
    );

    const articleFetchJobsCount = await getOne<{ total: string; discovered: string; fetching: string; done: string; failed: string; retryable_failed: string }>(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE status = 'discovered') as discovered,
              COUNT(*) FILTER (WHERE status = 'fetching') as fetching,
              COUNT(*) FILTER (WHERE status = 'done') as done,
              COUNT(*) FILTER (WHERE status = 'failed') as failed,
              COUNT(*) FILTER (WHERE status = 'failed' AND retry_count < 3) as retryable_failed
       FROM article_fetch_jobs`
    );

    const lastDigest = await getOne(
      `SELECT digest_date, title, article_count FROM digests WHERE status = 'done' ORDER BY digest_date DESC LIMIT 1`
    );

    const recentLogs = await getMany(
      `SELECT source_id, job_type, status, started_at, items_found, items_inserted, error_message
       FROM scrape_logs ORDER BY started_at DESC LIMIT 5`
    );

    const forumTotals = await getMany<{
      kind: string;
      threads_seen: string;
      inserted: string;
      skipped_few_comments: string;
      skipped_few_useful_comments: string;
      skipped_duplicate: string;
      fetch_errors: string;
    }>(
      `SELECT metadata->'forum'->>'kind' as kind,
              SUM((metadata->'forum'->>'threadsSeen')::int) as threads_seen,
              SUM((metadata->'forum'->>'inserted')::int) as inserted,
              SUM((metadata->'forum'->>'skippedFewComments')::int) as skipped_few_comments,
              SUM((metadata->'forum'->>'skippedFewUsefulComments')::int) as skipped_few_useful_comments,
              SUM((metadata->'forum'->>'skippedDuplicate')::int) as skipped_duplicate,
              SUM((metadata->'forum'->>'fetchErrors')::int) as fetch_errors
       FROM scrape_logs
       WHERE metadata ? 'forum'
         AND started_at >= NOW() - INTERVAL '24 hours'
       GROUP BY metadata->'forum'->>'kind'
       ORDER BY kind`
    );

    const forumRecent = await getMany(
      `SELECT sl.source_id, s.name as source_name, sl.job_type, sl.status, sl.started_at,
              sl.items_found, sl.items_inserted, sl.error_message, sl.metadata->'forum' as forum
       FROM scrape_logs sl
       LEFT JOIN sources s ON s.id = sl.source_id
       WHERE sl.metadata ? 'forum'
       ORDER BY sl.started_at DESC
       LIMIT 8`
    );

    const forum = {
      totals24h: forumTotals.map((row) => ({
        kind: row.kind,
        threadsSeen: num(row.threads_seen),
        inserted: num(row.inserted),
        skippedFewComments: num(row.skipped_few_comments),
        skippedFewUsefulComments: num(row.skipped_few_useful_comments),
        skippedDuplicate: num(row.skipped_duplicate),
        fetchErrors: num(row.fetch_errors),
      })),
      recent: forumRecent,
    };

    return c.json({
      success: true,
      data: {
        status: 'ok',
        time: dbCheck?.time,
        sources: {
          total: parseInt(sourcesCount?.total || '0'),
          enabled: parseInt(sourcesCount?.enabled || '0'),
          due: parseInt(sourcesCount?.due || '0'),
          failing: parseInt(sourcesCount?.failing || '0'),
          backed_off: parseInt(sourcesCount?.backed_off || '0'),
        },
        articles: {
          total: parseInt(articlesCount?.total || '0'),
          pending: parseInt(articlesCount?.pending || '0'),
          processing: parseInt(articlesCount?.processing || '0'),
          done: parseInt(articlesCount?.done || '0'),
          failed: parseInt(articlesCount?.failed || '0'),
          skipped: parseInt(articlesCount?.skipped || '0'),
          retryable_failed: parseInt(articlesCount?.retryable_failed || '0'),
        },
        articleFetchJobs: {
          total: parseInt(articleFetchJobsCount?.total || '0'),
          discovered: parseInt(articleFetchJobsCount?.discovered || '0'),
          fetching: parseInt(articleFetchJobsCount?.fetching || '0'),
          done: parseInt(articleFetchJobsCount?.done || '0'),
          failed: parseInt(articleFetchJobsCount?.failed || '0'),
          retryable_failed: parseInt(articleFetchJobsCount?.retryable_failed || '0'),
        },
        lastDigest: lastDigest || null,
        forum,
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
  runScrapeJob().catch(console.error);
  return c.json({ success: true, data: { message: 'Triggered scrape discovery job' } });
});

health.post('/trigger/fetch-articles', async (c) => {
  runArticleFetchJob().catch(console.error);
  return c.json({ success: true, data: { message: 'Triggered article fetch job' } });
});

health.post('/trigger/summarize', async (c) => {
  runSummarizeJob().catch(console.error);
  return c.json({ success: true, data: { message: 'Triggered summarize job' } });
});

health.post('/trigger/digest', async (c) => {
  runDigestJob().catch(console.error);
  return c.json({ success: true, data: { message: 'Triggered digest job' } });
});

health.post('/trigger/cleanup', async (c) => {
  runCleanupJob().catch(console.error);
  return c.json({ success: true, data: { message: 'Triggered cleanup job' } });
});

export { health };
