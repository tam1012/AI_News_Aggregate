import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadTsModule(relativePath) {
  const source = readFileSync(resolve(__dirname, relativePath), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const moduleContext = { exports: {} };
  vm.runInNewContext(outputText, {
    exports: moduleContext.exports,
    module: moduleContext,
  });
  return moduleContext.exports;
}

test('article filters add tag and minimum score SQL predicates', () => {
  const { buildArticleListFilters } = loadTsModule('../src/lib/articleFilters.ts');
  const result = buildArticleListFilters({
    sourceId: 'src_1',
    status: 'done',
    date: '2026-05-04',
    tag: 'AI',
    minScore: '7',
  });

  assert.match(result.where, /a\.source_id = \$1/);
  assert.match(result.where, /a\.summary_status = \$2/);
  assert.match(result.where, /DATE\(COALESCE\(a\.published_at, a\.created_at\)/);
  assert.match(result.where, /\$4 = ANY\(a\.tags\)/);
  assert.match(result.where, /a\.hot_score >= \$5/);
  assert.deepEqual(Array.from(result.params), ['src_1', 'done', '2026-05-04', 'AI', 7]);
  assert.equal(result.nextParamIndex, 6);
});

test('article filters validate score, status, and date', () => {
  const { buildArticleListFilters } = loadTsModule('../src/lib/articleFilters.ts');

  assert.throws(() => buildArticleListFilters({ status: 'bad' }), /Invalid status/);
  assert.throws(() => buildArticleListFilters({ date: '04-05-2026' }), /date must be YYYY-MM-DD/);
  assert.throws(() => buildArticleListFilters({ minScore: '11' }), /minScore must be between 1 and 10/);
  assert.throws(() => buildArticleListFilters({ feedTab: 'bad' }), /Invalid feedTab/);
});

test('article filters add feed tab predicates before pagination', () => {
  const { buildArticleListFilters } = loadTsModule('../src/lib/articleFilters.ts');

  assert.match(buildArticleListFilters({ feedTab: 'news' }).where, /NOT \(s\.type = 'youtube'/);
  assert.match(buildArticleListFilters({ feedTab: 'reddit' }).where, /reddit/);
  assert.match(buildArticleListFilters({ feedTab: 'voz' }).where, /voz/);
  assert.match(buildArticleListFilters({ feedTab: 'youtube' }).where, /s\.type = 'youtube'/);
});

test('article local date text SQL serializes as YYYY-MM-DD instead of a UTC Date object', () => {
  const { LOCAL_DATE_TEXT_SQL } = loadTsModule('../src/lib/articleFilters.ts');

  assert.match(LOCAL_DATE_TEXT_SQL, /^TO_CHAR\(/);
  assert.match(LOCAL_DATE_TEXT_SQL, /'YYYY-MM-DD'/);
  assert.match(LOCAL_DATE_TEXT_SQL, /Asia\/Ho_Chi_Minh/);
});
