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
const cheerio = requireFromTest('cheerio');

function loadTsModule(relativePath, stubs = {}, globals = {}) {
  const source = readFileSync(resolve(__dirname, relativePath), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const moduleContext = { exports: {} };
  vm.runInNewContext(outputText, {
    AbortSignal: { timeout: () => undefined },
    exports: moduleContext.exports,
    module: moduleContext,
    process: { env: {} },
    require: (name) => {
      if (stubs[name]) return stubs[name];
      throw new Error(`Unexpected require ${name}`);
    },
    ...globals,
  });
  return moduleContext.exports;
}

const guardianStyleRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>The Guardian</title>
    <item>
      <title>World news live</title>
      <link>https://www.theguardian.com/world/live/2026/may/07/example</link>
      <guid isPermaLink="false">guardian/example</guid>
      <pubDate>Thu, 07 May 2026 09:30:00 GMT</pubDate>
      <description><![CDATA[<p>Live coverage with <strong>updates</strong>.</p>]]></description>
      <enclosure url="https://media.guim.co.uk/image.jpg" type="image/jpeg" />
      <media:content url="https://media.guim.co.uk/image.jpg" width="140" height="84" />
    </item>
  </channel>
</rss>`;

test('RSS fetcher falls back to tolerant item parsing when strict parser rejects feed XML', async () => {
  const { rssFetcher } = loadTsModule('../src/services/fetchers/rss-fetcher.ts', {
    'rss-parser': {
      default: class StrictParser {
        async parseString() {
          throw new Error('Attribute without value Line: 13 Column: 5 Char: /');
        }
      },
    },
    cheerio,
    entities: { decodeHTML: (value) => value },
    '../../lib/utils.js': { normalizePublicHttpUrl: (value) => new URL(value).toString(), truncate: (value) => value },
    './http-utils.js': { BROWSER_UA: 'test-agent' },
    './article-writer.js': { insertArticleIfNew: async () => true },
    './selector-learning.js': { learnSelectorProfileFromHtml: async () => null },
    './selector-profile.js': {
      extractWithSelectorProfile: () => ({ title: '', content: '', imageUrl: null, publishedAt: null, matchedSelector: null }),
      getDomainFromUrl: () => null,
      getSourceProfile: async () => null,
      isExtractionUsable: () => false,
      recordProfileFailure: async () => {},
      recordProfileSuccess: async () => {},
      rowToSelectorProfile: () => null,
      saveSourceProfile: async () => null,
    },
  }, {
    fetch: async () => ({ ok: true, text: async () => guardianStyleRss }),
  });

  const items = await rssFetcher.discover({
    id: 'src_guardian',
    type: 'rss',
    name: 'The Guardian',
    url: 'https://www.theguardian.com/international/rss',
    language: 'en',
    category: null,
    fetch_interval_minutes: 60,
    parser_config: null,
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'World news live');
  assert.equal(items[0].url, 'https://www.theguardian.com/world/live/2026/may/07/example');
  assert.equal(items[0].externalId, 'guardian/example');
  assert.equal(items[0].payload.rawExcerpt, 'Live coverage with updates.');
  assert.equal(items[0].payload.imageUrl, 'https://media.guim.co.uk/image.jpg');
});
