import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const requireFromTest = createRequire(import.meta.url);
const { decodeHTML } = requireFromTest('entities');

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
    Buffer,
    exports: moduleContext.exports,
    module: moduleContext,
    require: (name) => {
      if (stubs[name]) return stubs[name];
      throw new Error(`Unexpected require ${name}`);
    },
  });
  return moduleContext.exports;
}

test('decode article text fields for legacy API rows with HTML entities', () => {
  const { decodeArticleTextFields } = loadTsModule('../src/lib/htmlEntities.ts', {
    entities: { decodeHTML },
  });

  const row = decodeArticleTextFields({
    id: 'art_1',
    title: 'C&ocirc;ng ty x\u1ed5 s\u1ed1 chi h&agrave;ng ng&agrave;n l\u01b0\u1ee3ng v&agrave;ng',
    raw_excerpt: 'Gi&aacute; v&agrave;ng t\u0103ng',
    url: 'https://example.com?a=1&amp;b=2',
  });

  assert.equal(row.title, 'C\u00f4ng ty x\u1ed5 s\u1ed1 chi h\u00e0ng ng\u00e0n l\u01b0\u1ee3ng v\u00e0ng');
  assert.equal(row.raw_excerpt, 'Gi\u00e1 v\u00e0ng t\u0103ng');
  assert.equal(row.url, 'https://example.com?a=1&amp;b=2');
});

test('decode article text fields repairs mojibake and strips unsafe controls', () => {
  const { decodeArticleTextFields } = loadTsModule('../src/lib/htmlEntities.ts', {
    entities: { decodeHTML },
  });

  const title = 'New York real estate titan likens ‘tax the rich’ to racial slurs';
  const summary = '## Phát ngôn gây tranh cãi\n\nDễ bị đánh giá.';
  const row = decodeArticleTextFields({
    id: 'art_guardian',
    title: Buffer.from(title, 'utf8').toString('latin1'),
    summary_text: Buffer.from(summary, 'utf8').toString('latin1'),
  });

  assert.equal(row.title, title);
  assert.equal(row.summary_text, summary);
});

test('decode article text fields does not re-encode valid Vietnamese text', () => {
  const { decodeArticleTextFields } = loadTsModule('../src/lib/htmlEntities.ts', {
    entities: { decodeHTML },
  });

  const summary = '## Phát ngôn gây tranh cãi của tỷ phú bất động sản New York\n\nTrong buổi họp báo cáo kết quả kinh doanh quý.';
  const row = decodeArticleTextFields({ id: 'art_valid', summary_text: summary });

  assert.equal(row.summary_text, summary);
});
