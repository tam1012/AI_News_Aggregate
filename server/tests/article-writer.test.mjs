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
    require: (name) => {
      if (stubs[name]) return stubs[name];
      throw new Error(`Unexpected require ${name}`);
    },
  });
  return moduleContext.exports;
}

test('build article insert row with pending summary state and retry defaults', () => {
  const { buildArticleInsertRow } = loadTsModule('../src/services/fetchers/article-writer.ts', {
    '../../db/index.js': {
      getOne: async () => null,
      query: async () => ({ rowCount: 0 }),
    },
    '../../lib/utils.js': {
      createContentHash: (value) => `hash:${value.slice(0, 8)}`,
      generateId: (prefix) => `${prefix}_test`,
      truncate: (value, max) => String(value).slice(0, max),
    },
  });

  const row = buildArticleInsertRow({
    source: { id: 'src_1', language: 'vi' },
    url: 'https://example.com/post',
    title: 'Example title',
    author: 'Author',
    publishedAt: '2026-05-04T00:00:00.000Z',
    rawExcerpt: 'excerpt',
    rawContent: 'content',
    imageUrl: 'https://example.com/image.jpg',
    externalId: 'guid-1',
  });

  assert.equal(row.id, 'art_test');
  assert.equal(row.summary_status, 'pending');
  assert.equal(row.retry_count, 0);
  assert.equal(row.last_summary_error, null);
  assert.equal(row.content_hash, 'hash:Example ');
});

test('insert article skips duplicate URL before hashing', async () => {
  const queries = [];
  const { insertArticleIfNew } = loadTsModule('../src/services/fetchers/article-writer.ts', {
    '../../db/index.js': {
      getOne: async (sql, params) => {
        queries.push({ sql, params });
        if (/WHERE url =/.test(sql)) return { id: 'existing' };
        return null;
      },
      query: async () => {
        throw new Error('insert should not be called');
      },
    },
    '../../lib/utils.js': {
      createContentHash: () => 'hash',
      generateId: () => 'art_test',
      truncate: (value) => value,
    },
  });

  const inserted = await insertArticleIfNew({
    source: { id: 'src_1', language: 'vi' },
    url: 'https://example.com/post',
    title: 'Example title',
    rawExcerpt: '',
    rawContent: '',
  });

  assert.equal(inserted, false);
  assert.equal(queries.length, 1);
});
