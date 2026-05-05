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

test('article open graph meta is escaped and uses article content', () => {
  const { buildArticleMeta } = loadTsModule('../src/lib/openGraph.ts');
  const meta = buildArticleMeta({
    article: {
      id: 'art_test',
      title: 'A <b>sharp</b> 1-2 title',
      tldr: 'Short **summary** with <script>alert(1)</script>',
      summary_text: 'Fallback summary',
      raw_excerpt: 'Raw excerpt',
      image_url: 'https://example.com/image.jpg',
    },
    articleUrl: 'https://synthnews.site/article/art_test',
  });

  assert.match(meta, /<title>A sharp 1-2 title \| SynthNews<\/title>/);
  assert.match(meta, /property="og:title" content="A sharp 1-2 title"/);
  assert.match(meta, /property="og:image" content="https:\/\/synthnews\.site\/api\/img\?url=https%3A%2F%2Fexample\.com%2Fimage\.jpg&amp;p=og"/);
  assert.doesNotMatch(meta, /<script>/);
  assert.doesNotMatch(meta, /<b>/);
});

test('article meta replaces existing title and description in index html', () => {
  const { injectArticleMeta } = loadTsModule('../src/lib/openGraph.ts');
  const html = '<html><head><title>SynthNews</title><meta name="description" content="Old" /></head><body></body></html>';
  const output = injectArticleMeta(html, '<title>New</title><meta name="description" content="Fresh" />');

  assert.match(output, /<title>New<\/title>/);
  assert.match(output, /content="Fresh"/);
  assert.doesNotMatch(output, /content="Old"/);
});
