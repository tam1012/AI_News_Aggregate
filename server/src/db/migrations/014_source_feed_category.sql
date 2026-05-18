-- 014_source_feed_category.sql
-- Add feed_category to sources so admin can group sources into News / Tech News tabs.
-- VOZ + Reddit are auto-grouped by URL (already in articleFilters), so this column
-- only affects the "general" sources (the ones that aren't VOZ/Reddit).

ALTER TABLE sources
  ADD COLUMN IF NOT EXISTS feed_category TEXT NOT NULL DEFAULT 'news'
    CHECK (feed_category IN ('news', 'tech'));

CREATE INDEX IF NOT EXISTS idx_sources_feed_category ON sources(feed_category);
