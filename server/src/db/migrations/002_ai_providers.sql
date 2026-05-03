-- 002_ai_providers.sql
-- Bang nha cung cap AI - cho phep cau hinh nhieu provider

CREATE TABLE IF NOT EXISTS ai_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,                     -- Ten hien thi: "Vertex AI", "OpenAI", "Gemini AI Studio"
  provider_type TEXT NOT NULL,            -- Loai: vertex_ai, openai, gemini, xai, mimo, custom
  is_active BOOLEAN NOT NULL DEFAULT false, -- Chi 1 provider active tai 1 thoi diem
  api_endpoint TEXT,                      -- Custom endpoint (null = dung default)
  api_key TEXT,                           -- API key (encrypted in future)
  model TEXT NOT NULL,                    -- Model: gemini-2.5-flash, gpt-4o-mini, ...
  extra_config JSONB,                     -- Cau hinh bo sung tuy provider
  -- Vertex AI specific
  project_id TEXT,                        -- Google Cloud project ID
  region TEXT,                            -- us-central1, asia-southeast1, ...
  service_account_json TEXT,              -- Service account JSON (cho Vertex AI)
  -- Settings
  max_tokens INTEGER DEFAULT 1024,
  temperature REAL DEFAULT 0.3,
  -- Tracking
  total_calls INTEGER NOT NULL DEFAULT 0,
  total_errors INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  last_error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_ai_providers_updated_at BEFORE UPDATE ON ai_providers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Them bang app_settings neu chua co
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
