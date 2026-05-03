-- Migration 003: Add tldr column for short list-view preview
-- Generated from summarized Key Takeaways, no extra AI call needed

ALTER TABLE articles ADD COLUMN IF NOT EXISTS tldr TEXT;

-- Backfill: extract first 1-2 Key Takeaway bullets from existing summary_text
-- Regex matches "📌 Key Takeaways" section then takes the first bullet line
UPDATE articles
SET tldr = (
  SELECT string_agg(line, ' · ')
  FROM (
    SELECT trim(regexp_replace(line, '^[-*•]\s*\*?\*?(.*?)\*?\*?$', '\1')) as line
    FROM (
      SELECT unnest(string_to_array(
        regexp_replace(summary_text, '(?s).*##[^\n]*Key Takeaways[^\n]*\n(.*?)(?:\n##|$)', '\1'),
        E'\n'
      )) as line
    ) raw_lines
    WHERE line ~ '^[-*•]\s+'
    LIMIT 2
  ) bullets
  WHERE line != ''
)
WHERE summary_text IS NOT NULL AND tldr IS NULL;
