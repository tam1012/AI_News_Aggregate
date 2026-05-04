CREATE TABLE IF NOT EXISTS article_fetch_jobs (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  external_id TEXT,
  published_at TIMESTAMPTZ,
  payload_json JSONB,
  status TEXT NOT NULL DEFAULT 'discovered'
    CHECK (status IN ('discovered', 'fetching', 'done', 'failed')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source_id, url)
);

CREATE TRIGGER update_article_fetch_jobs_updated_at BEFORE UPDATE ON article_fetch_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_article_fetch_jobs_status_retry
  ON article_fetch_jobs(status, retry_count, updated_at);

CREATE INDEX IF NOT EXISTS idx_article_fetch_jobs_source
  ON article_fetch_jobs(source_id, created_at DESC);
