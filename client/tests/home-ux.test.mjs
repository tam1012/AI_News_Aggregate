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

test('article deep links keep the detail pane visible while article data loads', () => {
  const { getReaderLoadingState, shouldShowDetailPane } = loadTsModule('../src/pages/homeUx.ts');

  assert.equal(getReaderLoadingState({ isFeedLoading: true, hasArticleDeepLink: true }), 'split');
  assert.equal(shouldShowDetailPane({ tab: 'news', hasSelectedArticle: false, hasArticleDeepLink: true }), true);
});

test('non-article loads still use the compact full feed skeleton', () => {
  const { getReaderLoadingState, shouldShowDetailPane } = loadTsModule('../src/pages/homeUx.ts');

  assert.equal(getReaderLoadingState({ isFeedLoading: true, hasArticleDeepLink: false }), 'feed-only');
  assert.equal(shouldShowDetailPane({ tab: 'news', hasSelectedArticle: false, hasArticleDeepLink: false }), false);
});

test('digest route keeps the right pane visible without opening article detail state', () => {
  const { shouldShowDetailPane, shouldShowRightPane } = loadTsModule('../src/pages/homeUx.ts');

  assert.equal(shouldShowDetailPane({ tab: 'digest', hasSelectedArticle: false, hasArticleDeepLink: false }), false);
  assert.equal(shouldShowRightPane({ tab: 'digest', hasSelectedArticle: false, hasArticleDeepLink: false }), true);
});
