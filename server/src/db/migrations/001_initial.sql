-- 001_initial.sql
-- News Digest V2 - Initial Schema

-- Bang nguon tin
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('rss', 'web')),
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  language TEXT DEFAULT 'vi',
  category TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  fetch_interval_minutes INTEGER NOT NULL DEFAULT 60,
  parser_config JSONB,
  last_checked_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error_message TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bang bai viet
CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  external_id TEXT,
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  author TEXT,
  published_at TIMESTAMPTZ,
  content_type TEXT NOT NULL DEFAULT 'article' CHECK (content_type IN ('article', 'video')),
  language TEXT,
  raw_excerpt TEXT,
  raw_content TEXT,
  content_hash TEXT,
  summary_text TEXT,
  summary_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (summary_status IN ('pending', 'processing', 'done', 'failed', 'skipped')),
  image_url TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bang digest tong hop
CREATE TABLE IF NOT EXISTS digests (
  id TEXT PRIMARY KEY,
  digest_date DATE NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  language TEXT NOT NULL DEFAULT 'vi',
  title TEXT,
  body_markdown TEXT,
  article_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lien ket digest voi articles
CREATE TABLE IF NOT EXISTS digest_items (
  id TEXT PRIMARY KEY,
  digest_id TEXT NOT NULL REFERENCES digests(id) ON DELETE CASCADE,
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  section TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(digest_id, article_id)
);

-- Log scrape
CREATE TABLE IF NOT EXISTS scrape_logs (
  id TEXT PRIMARY KEY,
  source_id TEXT REFERENCES sources(id) ON DELETE SET NULL,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'partial')),
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  items_found INTEGER DEFAULT 0,
  items_inserted INTEGER DEFAULT 0,
  ai_calls INTEGER DEFAULT 0,
  error_message TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sources_due ON sources(is_enabled, next_run_at);
CREATE INDEX IF NOT EXISTS idx_articles_source_published ON articles(source_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_summary_status ON articles(summary_status, created_at);
CREATE INDEX IF NOT EXISTS idx_articles_content_hash ON articles(content_hash);
CREATE INDEX IF NOT EXISTS idx_digests_date ON digests(digest_date DESC, language);
CREATE INDEX IF NOT EXISTS idx_scrape_logs_source ON scrape_logs(source_id, started_at DESC);

-- Function tu dong cap nhat updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_sources_updated_at BEFORE UPDATE ON sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_articles_updated_at BEFORE UPDATE ON articles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_digests_updated_at BEFORE UPDATE ON digests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
