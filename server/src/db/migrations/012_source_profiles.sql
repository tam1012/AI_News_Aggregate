CREATE TABLE IF NOT EXISTS source_profiles (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'article',
  content_selectors TEXT[] NOT NULL,
  remove_selectors TEXT[] NOT NULL DEFAULT '{}',
  title_selector TEXT,
  image_selector TEXT,
  published_at_selector TEXT,
  min_text_length INTEGER NOT NULL DEFAULT 500,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  last_error TEXT,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(domain, mode)
);

CREATE TRIGGER update_source_profiles_updated_at BEFORE UPDATE ON source_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_source_profiles_domain_mode_enabled
  ON source_profiles(domain, mode, is_enabled);
