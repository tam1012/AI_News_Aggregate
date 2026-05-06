ALTER TABLE sources
  ALTER COLUMN fetch_interval_minutes SET DEFAULT 60;

UPDATE sources
SET fetch_interval_minutes = 60,
    next_run_at = NOW()
WHERE fetch_interval_minutes = 180
  AND is_enabled = true;
