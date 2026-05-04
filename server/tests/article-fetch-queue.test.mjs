import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadTsModule(relativePath, stubs = {}) {
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
    URL,
    require: (name) => {
      if (stubs[name]) return stubs[name];
      throw new Error(`Unexpected require ${name}`);
    },
  });
  return moduleContext.exports;
}

test('build discovered article job row with normalized public URL and discovered status', () => {
  const { buildArticleFetchJobRow } = loadTsModule('../src/services/article-fetch-queue.ts', {
    '../lib/utils.js': {
      generateId: (prefix) => `${prefix}_test`,
      normalizePublicHttpUrl: (url) => new URL(url).toString(),
    },
    '../db/index.js': {},
  });

  const row = buildArticleFetchJobRow({
    sourceId: 'src_1',
    url: 'https://example.com/post',
    title: ' Example ',
    externalId: 'guid-1',
    publishedAt: '2026-05-04T00:00:00.000Z',
    payload: { rawExcerpt: 'excerpt' },
  });

  assert.equal(row.id, 'afj_test');
  assert.equal(row.source_id, 'src_1');
  assert.equal(row.url, 'https://example.com/post');
  assert.equal(row.title, 'Example');
  assert.equal(row.status, 'discovered');
  assert.equal(row.retry_count, 0);
  assert.equal(row.last_error, null);
  assert.deepEqual(row.payload_json, { rawExcerpt: 'excerpt' });
});

test('claim pending article fetch jobs uses FOR UPDATE SKIP LOCKED', () => {
  const { buildClaimArticleFetchJobsSql } = loadTsModule('../src/services/article-fetch-queue.ts', {
    '../lib/utils.js': {},
    '../db/index.js': {},
  });
  const statement = buildClaimArticleFetchJobsSql(7);

  assert.match(statement.sql, /status = 'discovered'/);
  assert.match(statement.sql, /FOR UPDATE SKIP LOCKED/);
  assert.match(statement.sql, /SET status = 'fetching'/);
  assert.deepEqual(Array.from(statement.params), [7]);
});

test('reset retryable article fetch jobs respects retry cap', () => {
  const { buildResetRetryableArticleFetchJobsSql, MAX_ARTICLE_FETCH_RETRIES } = loadTsModule('../src/services/article-fetch-queue.ts', {
    '../lib/utils.js': {},
    '../db/index.js': {},
  });
  const statement = buildResetRetryableArticleFetchJobsSql(15);

  assert.equal(MAX_ARTICLE_FETCH_RETRIES, 3);
  assert.match(statement.sql, /status = 'failed'/);
  assert.match(statement.sql, /retry_count < \$1/);
  assert.match(statement.sql, /status = 'discovered'/);
  assert.deepEqual(Array.from(statement.params), [3, 15]);
});
