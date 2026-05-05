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
    URL,
    exports: moduleContext.exports,
    module: moduleContext,
    require: (name) => {
      if (stubs[name]) return stubs[name];
      throw new Error(`Unexpected require ${name}`);
    },
  });
  return moduleContext.exports;
}

test('forum discussion threshold requires at least 10 replies by default', () => {
  const { hasMinimumForumDiscussion } = loadTsModule('../src/services/fetchers/forum-utils.ts', {
    cheerio: { load: () => ({}) },
    '../../lib/utils.js': { normalizePublicHttpUrl: (value) => value },
  });

  assert.equal(hasMinimumForumDiscussion(9), false);
  assert.equal(hasMinimumForumDiscussion(10), true);
  assert.equal(hasMinimumForumDiscussion(11), true);
});

test('forum discussion threshold can be overridden for tests and config', () => {
  const { hasMinimumForumDiscussion } = loadTsModule('../src/services/fetchers/forum-utils.ts', {
    cheerio: { load: () => ({}) },
    '../../lib/utils.js': { normalizePublicHttpUrl: (value) => value },
  });

  assert.equal(hasMinimumForumDiscussion(4, 5), false);
  assert.equal(hasMinimumForumDiscussion(5, 5), true);
});

test('forum insert policy applies minimum discussion only to VOZ', () => {
  const { shouldInsertForumArticle } = loadTsModule('../src/services/fetchers/forum-utils.ts', {
    cheerio: { load: () => ({}) },
    '../../lib/utils.js': { normalizePublicHttpUrl: (value) => value },
  });

  assert.equal(shouldInsertForumArticle('voz', 9), false);
  assert.equal(shouldInsertForumArticle('voz', 10), true);
  assert.equal(shouldInsertForumArticle('reddit', 0), true);
  assert.equal(shouldInsertForumArticle('reddit', 9), true);
});
