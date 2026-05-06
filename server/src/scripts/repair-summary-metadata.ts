import { pool, getMany, query } from '../db/index.js';
import { DEFAULT_PROMPT_CONFIG } from '../lib/promptConfig.js';
import { parseAiSummaryOutput } from '../lib/summaryOutput.js';
import { normalizeTldr } from '../lib/tldr.js';

interface ArticleRow {
  id: string;
  title: string;
  summary_text: string | null;
  tldr: string | null;
  summary_short: string | null;
  hot_score: number | null;
  tags: string[] | null;
}

const APPLY = process.argv.includes('--apply');
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? Math.max(1, Math.min(parseInt(LIMIT_ARG.split('=')[1] || '', 10) || 500, 5000)) : 500;

function metadataMissing(row: ArticleRow): boolean {
  return !row.tldr || !row.summary_short || row.hot_score === null || !Array.isArray(row.tags) || row.tags.length === 0;
}

function normalizeSummaryText(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
}

async function main() {
  const rows = await getMany<ArticleRow>(
    `SELECT id, title, summary_text, tldr, summary_short, hot_score, tags
     FROM articles
     WHERE summary_status = 'done'
       AND summary_text IS NOT NULL
       AND (
         tldr IS NULL
         OR summary_short IS NULL
         OR hot_score IS NULL
         OR tags IS NULL
         OR starts_with(summary_text, chr(96) || chr(96) || chr(96))
       )
     ORDER BY created_at DESC
     LIMIT $1`,
    [LIMIT]
  );

  let repairable = 0;
  let changed = 0;

  for (const row of rows) {
    const raw = row.summary_text || '';
    const parsed = parseAiSummaryOutput(raw, DEFAULT_PROMPT_CONFIG.allowed_tags);
    if (!parsed.usedStructuredOutput) continue;

    const nextTldr = normalizeTldr(parsed.tldr || row.tldr || '');
    const nextSummaryText = normalizeSummaryText(parsed.editorialMarkdown);
    const nextSummaryShort = parsed.summaryShort || row.summary_short;
    const nextHotScore = parsed.hotScore ?? row.hot_score;
    const nextTags = parsed.tags.length > 0 ? parsed.tags : (row.tags || []);

    if (!nextSummaryText || !nextTldr) continue;
    repairable++;

    const shouldChange = metadataMissing(row)
      || row.summary_text !== nextSummaryText
      || row.tldr !== nextTldr
      || row.summary_short !== nextSummaryShort
      || row.hot_score !== nextHotScore
      || JSON.stringify(row.tags || []) !== JSON.stringify(nextTags);

    if (!shouldChange) continue;
    changed++;

    if (changed <= 10) {
      console.log(`repair ${row.id}: ${row.title}`);
      console.log(`  tldr=${nextTldr}`);
      console.log(`  score=${nextHotScore ?? 'null'} tags=${nextTags.join(', ') || 'none'}`);
    }

    if (APPLY) {
      await query(
        `UPDATE articles
         SET summary_text = $1,
             tldr = $2,
             summary_short = $3,
             hot_score = $4,
             tags = $5,
             last_summary_error = NULL,
             updated_at = NOW()
         WHERE id = $6`,
        [nextSummaryText, nextTldr, nextSummaryShort, nextHotScore, nextTags, row.id]
      );
    }
  }

  console.log(`candidates=${rows.length} repairable=${repairable} changed=${changed} mode=${APPLY ? 'apply' : 'dry-run'}`);
  if (!APPLY) console.log('dry-run only; rerun with --apply to update rows');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
