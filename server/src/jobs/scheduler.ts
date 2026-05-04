import cron from 'node-cron';
import { getMany, query, getOne } from '../db/index.js';
import { scrapeSource, retryRedditComments } from '../services/scraper.js';
import { summarizePendingArticles, generateDigest } from '../services/summarizer.js';
import { generateId } from '../lib/utils.js';
import { rescrapeArticle, runForumRescrapeJob } from '../services/rescrape.js';
import {
  buildResetRetryableFailedSummariesSql,
  buildResetStuckProcessingSummariesSql,
} from '../lib/summaryRetryPolicy.js';

// Scrape ALL enabled sources (chay moi gio tai :00)
async function runScrapeJob() {
  console.log(`[${new Date().toISOString()}] Starting scrape job...`);

  const allSources = await getMany(
    `SELECT id, type, name, url, language, category, fetch_interval_minutes, parser_config
     FROM sources
     WHERE is_enabled = true
     ORDER BY name ASC`
  );

  console.log(`  Found ${allSources.length} enabled sources to scrape`);

  for (const source of allSources) {
    const logId = generateId('log');
    const startedAt = new Date().toISOString();

    try {
      console.log(`  Scraping [${source.type}] ${source.name}...`);
      const result = await scrapeSource(source);

      // Update source status
      await query(
        `UPDATE sources SET
           last_checked_at = NOW(), last_success_at = NOW(),
           consecutive_failures = 0, last_error_message = NULL
         WHERE id = $1`,
        [source.id]
      );

      // Log
      const status = result.errors.length > 0 ? (result.itemsInserted > 0 ? 'partial' : 'failed') : 'success';
      await query(
        `INSERT INTO scrape_logs (id, source_id, job_type, status, started_at, finished_at, items_found, items_inserted, error_message)
         VALUES ($1, $2, 'scrape', $3, $4, NOW(), $5, $6, $7)`,
        [logId, source.id, status, startedAt, result.itemsFound, result.itemsInserted,
         result.errors.length > 0 ? result.errors.join('; ') : null]
      );

      console.log(`    -> ${result.itemsInserted}/${result.itemsFound} items inserted ${result.errors.length > 0 ? `(${result.errors.length} errors)` : ''}`);
    } catch (err: any) {
      console.error(`    -> ERROR: ${err.message}`);

      await query(
        `UPDATE sources SET
           last_checked_at = NOW(), consecutive_failures = consecutive_failures + 1,
           last_error_message = $1
         WHERE id = $2`,
        [err.message.substring(0, 500), source.id]
      );

      await query(
        `INSERT INTO scrape_logs (id, source_id, job_type, status, started_at, finished_at, error_message)
         VALUES ($1, $2, 'scrape', 'failed', $3, NOW(), $4)`,
        [logId, source.id, startedAt, err.message.substring(0, 500)]
      );
    }
  }

  console.log(`[${new Date().toISOString()}] Scrape job complete.`);
}

// Summarize articles pending
async function runSummarizeJob() {
  console.log(`[${new Date().toISOString()}] Starting summarize job...`);
  try {
    const result = await summarizePendingArticles();
    console.log(`  Processed: ${result.processed}, Succeeded: ${result.succeeded}, Failed: ${result.failed}`);
  } catch (err: any) {
    console.error(`  Summarize error: ${err.message}`);
  }
}

// Generate digest
async function runDigestJob() {
  console.log(`[${new Date().toISOString()}] Starting digest generation...`);
  try {
    const digestId = await generateDigest();
    if (digestId) {
      console.log(`  Digest created: ${digestId}`);
    } else {
      console.log('  No articles to digest');
    }
  } catch (err: any) {
    console.error(`  Digest error: ${err.message}`);
  }
}

// Cleanup du lieu cu
async function runCleanupJob() {
  console.log(`[${new Date().toISOString()}] Starting cleanup...`);
  try {
    // Xoa logs cu hon 14 ngay
    const logsResult = await query(
      `DELETE FROM scrape_logs WHERE started_at < NOW() - INTERVAL '14 days'`
    );
    console.log(`  Deleted ${logsResult.rowCount} old logs`);

    // NULL raw_content cua articles cu hon 60 ngay (giu summary)
    const articlesResult = await query(
      `UPDATE articles SET raw_content = NULL
       WHERE created_at < NOW() - INTERVAL '60 days' AND raw_content IS NOT NULL`
    );
    console.log(`  Cleaned content of ${articlesResult.rowCount} old articles`);

    // Reset stuck processing items (> 5 phut = chac chan da timeout)
    const stuckStatement = buildResetStuckProcessingSummariesSql();
    const stuckResult = await query(stuckStatement.sql, stuckStatement.params);
    console.log(`  Reset ${stuckResult.rowCount} stuck articles`);
  } catch (err: any) {
    console.error(`  Cleanup error: ${err.message}`);
  }
}

// Retry failed + stuck articles (mỗi 10 phút)
async function runRetryJob() {
  console.log(`[${new Date().toISOString()}] Running retry check...`);
  try {
    // Reset stuck 'processing' > 5 phút (API timeout hoặc crash)
    const stuckResult = await query(
      `UPDATE articles SET summary_status = 'pending'
       WHERE summary_status = 'processing' AND updated_at < NOW() - INTERVAL '5 minutes'`
    );
    if (stuckResult.rowCount && stuckResult.rowCount > 0) {
      console.log(`  Reset ${stuckResult.rowCount} stuck processing articles`);
    }

    // Reset 'failed' > 10 phút (tối đa 15 bài)
    const failedStatement = buildResetRetryableFailedSummariesSql(15);
    const failedResult = await query(failedStatement.sql, failedStatement.params);
    console.log(`  Reset ${failedResult.rowCount} failed articles for retry`);
    
    // Retry lấy comment Reddit cho bài chưa có comment (Pullpush chậm index)
    let redditEnriched = 0;
    try {
      const redditRetry = await retryRedditComments();
      redditEnriched = redditRetry.enriched;
      console.log(`  Reddit comments retry: checked=${redditRetry.checked}, enriched=${redditRetry.enriched}`);
    } catch (err: any) {
      console.log(`  Reddit retry error: ${err.message}`);
    }

    // Nếu có bài được reset hoặc Reddit enriched, gọi ngay summarize job
    const totalReset = (stuckResult.rowCount || 0) + (failedResult.rowCount || 0) + redditEnriched;
    if (totalReset > 0) {
      console.log(`  Triggering summarizer for ${totalReset} retried articles...`);
      await runSummarizeJob();
    }
  } catch (err: any) {
    console.error(`  Retry error: ${err.message}`);
  }
}

export function startCronJobs() {
  const intervalHours = parseInt(process.env.SCRAPE_INTERVAL_HOURS || '3');

  // Scrape at minute 0 past every X hours (e.g. 0, 3, 6, 9...)
  cron.schedule(`0 */${intervalHours} * * *`, async () => {
    try {
      await runScrapeJob();
    } catch (err) {
      console.error(err);
    }
  });

  // Summarize independently so slow AI never blocks source scraping.
  cron.schedule('*/10 * * * *', () => {
    runSummarizeJob().catch(console.error);
  });

  // Re-scrape active forum threads every 30 minutes (at :30 and :00 of non-scrape hours)
  cron.schedule(`0,30 * * * *`, async () => {
    const currentHour = new Date().getHours();
    const currentMinute = new Date().getMinutes();
    
    // Don't run at minute 0 if it's the main scrape hour to avoid overlap
    if (currentMinute === 0 && currentHour % intervalHours === 0) {
      return;
    }

    try {
      const result = await runForumRescrapeJob();
      if (result.updated > 0) {
        await runSummarizeJob();
      }
    } catch (err) {
      console.error(err);
    }
  });

  // Generate digest ở phút 30 (sau khi đã tóm tắt xong)
  cron.schedule(`30 */${intervalHours} * * *`, () => {
    runDigestJob().catch(console.error);
  });

  // Retry & fix mỗi 10 phút
  cron.schedule('*/10 * * * *', () => {
    runRetryJob().catch(console.error);
  });

  // Cleanup mỗi ngày lúc 2:43 AM
  cron.schedule('43 2 * * *', () => {
    runCleanupJob().catch(console.error);
  });

  console.log(`Cron jobs scheduled:`);
  console.log(`  - Scrape: every ${intervalHours}h at :00`);
  console.log(`  - Summarize: every 10 minutes`);
  console.log(`  - Forum Rescrape: every 30 mins (max 2 times per article)`);
  console.log(`  - Digest: every ${intervalHours}h at :30`);
  console.log(`  - Retry: every 10 minutes`);
  console.log(`  - Cleanup: daily at 2:43 AM`);
}

// Export de co the goi thu cong qua API
export { runScrapeJob, runSummarizeJob, runDigestJob, runCleanupJob, rescrapeArticle, runForumRescrapeJob };
