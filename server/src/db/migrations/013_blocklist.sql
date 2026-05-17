-- 013_blocklist.sql
-- DB-backed blocklist replacing hardcoded arrays in rss-fetcher.ts.
-- Patterns are checked at the RSS discovery stage to avoid waste fetching
-- paywalled / antibot URLs that would later fail Readability anyway.

CREATE TABLE IF NOT EXISTS blocklist (
  id TEXT PRIMARY KEY,
  pattern TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('domain', 'path')),
  reason TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  hit_count INTEGER NOT NULL DEFAULT 0,
  last_hit_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blocklist_enabled ON blocklist(is_enabled, type);

CREATE TRIGGER update_blocklist_updated_at BEFORE UPDATE ON blocklist
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed from previous DEFAULT_BLOCKED_DOMAINS in rss-fetcher.ts
INSERT INTO blocklist (id, pattern, type, reason) VALUES
  ('blk_seed_thestreet',     'thestreet.com',         'domain', 'paywall'),
  ('blk_seed_timesofisrael', 'timesofisrael.com',     'domain', 'paywall'),
  ('blk_seed_nytimes',       'nytimes.com',           'domain', 'paywall'),
  ('blk_seed_eweek',         'eweek.com',             'domain', 'antibot'),
  ('blk_seed_kotaku',        'kotaku.com',            'domain', 'antibot'),
  ('blk_seed_theinfo',       'theinformation.com',    'domain', 'paywall'),
  ('blk_seed_politico',      'politico.com',          'domain', 'antibot'),
  ('blk_seed_politicoeu',    'politico.eu',           'domain', 'antibot'),
  ('blk_seed_bangkokpost',   'bangkokpost.com',       'domain', 'antibot'),
  ('blk_seed_alcom',         'al.com',                'domain', 'antibot'),
  ('blk_seed_jakartaglobe',  'jakartaglobe.id',       'domain', 'antibot'),
  ('blk_seed_boston25',      'boston25news.com',      'domain', 'antibot'),
  ('blk_seed_latimes',       'latimes.com',           'domain', 'paywall'),
  ('blk_seed_axios',         'axios.com',             'domain', 'paywall'),
  ('blk_seed_wsj',           'wsj.com',               'domain', 'paywall'),
  ('blk_seed_bloomberg',     'bloomberg.com',         'domain', 'paywall'),
  ('blk_seed_ft',            'ft.com',                'domain', 'paywall'),
  ('blk_seed_economist',     'economist.com',         'domain', 'paywall'),
  ('blk_seed_barrons',       'barrons.com',           'domain', 'paywall'),
  ('blk_seed_busins',        'businessinsider.com',   'domain', 'paywall'),
  ('blk_seed_seekalpha',     'seekingalpha.com',      'domain', 'paywall'),
  ('blk_seed_nikkei',        'nikkei.com',            'domain', 'paywall'),
  ('blk_seed_wapo',          'washingtonpost.com',    'domain', 'paywall'),
  ('blk_seed_thetimescom',   'thetimes.com',          'domain', 'paywall'),
  ('blk_seed_thetimescouk',  'thetimes.co.uk',        'domain', 'paywall'),
  ('blk_seed_telegraph',     'telegraph.co.uk',       'domain', 'paywall'),
  ('blk_seed_scmp',          'scmp.com',              'domain', 'paywall'),
  ('blk_seed_globeandmail',  'theglobeandmail.com',   'domain', 'paywall'),
  ('blk_seed_atlantic',      'theatlantic.com',       'domain', 'paywall'),
  ('blk_seed_newyorker',     'newyorker.com',         'domain', 'paywall'),
  ('blk_seed_medium',        'medium.com',            'domain', 'paywall'),
  ('blk_seed_towards',       'towardsdatascience.com','domain', 'paywall'),
  ('blk_seed_wired',         'wired.com',             'domain', 'paywall'),
  ('blk_seed_techreview',    'technologyreview.com',  'domain', 'paywall'),
  ('blk_seed_hbr',           'hbr.org',               'domain', 'paywall'),
  ('blk_seed_reuters',       'reuters.com',           'domain', 'antibot'),
  ('blk_seed_qdnd',          'qdnd.vn',               'domain', 'antibot'),
  ('blk_seed_usni',          'usni.org',              'domain', 'antibot'),
  ('blk_seed_gothamist',     'gothamist.com',         'domain', 'antibot'),
  ('blk_seed_gizmodo',       'gizmodo.com',           'domain', 'antibot'),
  ('blk_seed_seattletimes',  'seattletimes.com',      'domain', 'paywall'),
  ('blk_seed_cfp',           'centerforpolitics.org', 'domain', 'antibot'),
  ('blk_seed_bbc_sport',     'bbc.com/sport/',        'path',   'không phải tin tức'),
  ('blk_seed_bbc_audio',     'bbc.com/audio/',        'path',   'audio không tóm tắt được'),
  ('blk_seed_bbc_videos',    'bbc.com/news/videos/',  'path',   'video không tóm tắt được'),
  ('blk_seed_aje_video',     'aljazeera.com/video',   'path',   'video không tóm tắt được')
ON CONFLICT (pattern) DO NOTHING;
