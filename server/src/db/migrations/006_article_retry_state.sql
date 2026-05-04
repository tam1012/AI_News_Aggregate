ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_summary_error TEXT;

CREATE INDEX IF NOT EXISTS idx_articles_summary_retry
  ON articles(summary_status, retry_count, updated_at);
