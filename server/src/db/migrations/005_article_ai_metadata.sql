ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS hot_score INTEGER CHECK (hot_score IS NULL OR (hot_score >= 1 AND hot_score <= 10)),
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS summary_short TEXT;

CREATE INDEX IF NOT EXISTS idx_articles_hot_score ON articles(hot_score DESC);
CREATE INDEX IF NOT EXISTS idx_articles_tags ON articles USING GIN (tags);
