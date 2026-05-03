import { pool, getMany, query } from '../db/index.js';
import { makeTldrFromSummary, normalizeTldr } from '../lib/tldr.js';

type ArticleRow = {
  id: string;
  title: string;
  tldr: string | null;
  summary_text: string | null;
  tldr_length: number | null;
};

const APPLY = process.argv.includes('--apply');
const MAX_CHARS = 180;
const MIN_REPORT_LENGTH = 180;

async function sampleRows(label: string) {
  const rows = await getMany<ArticleRow>(
    `SELECT id, title, tldr, summary_text, char_length(tldr) as tldr_length
     FROM articles
     WHERE tldr IS NOT NULL AND char_length(tldr) > $1
     ORDER BY char_length(tldr) DESC, created_at DESC
     LIMIT 5`,
    [MIN_REPORT_LENGTH]
  );

  console.log(`\n${label}`);
  if (rows.length === 0) {
    console.log('  no long tldr rows');
    return;
  }

  for (const row of rows) {
    console.log(`  ${row.id} len=${row.tldr_length} title=${row.title}`);
    console.log(`    ${row.tldr}`);
  }
}

async function main() {
  await sampleRows('before sample');

  const candidates = await getMany<ArticleRow>(
    `SELECT id, title, tldr, summary_text, char_length(tldr) as tldr_length
     FROM articles
     WHERE tldr IS NOT NULL AND char_length(tldr) > $1
     ORDER BY char_length(tldr) DESC`,
    [MAX_CHARS]
  );

  console.log(`\ncandidates=${candidates.length} mode=${APPLY ? 'apply' : 'dry-run'}`);

  let changed = 0;
  for (const row of candidates) {
    const source = row.summary_text || row.tldr || '';
    const next = makeTldrFromSummary(source, MAX_CHARS) || normalizeTldr(row.tldr || '', MAX_CHARS);
    if (!next || next === row.tldr) continue;

    changed++;
    if (changed <= 5) {
      console.log(`  update ${row.id}: ${row.tldr_length} -> ${next.length}`);
      console.log(`    ${next}`);
    }

    if (APPLY) {
      await query('UPDATE articles SET tldr = $1 WHERE id = $2', [next, row.id]);
    }
  }

  console.log(`changed=${changed}`);

  if (APPLY) {
    await sampleRows('after sample');
  } else {
    console.log('\ndry-run only; rerun with --apply to update rows');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
