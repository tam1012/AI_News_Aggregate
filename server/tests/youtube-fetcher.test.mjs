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
    AbortSignal: { timeout: () => undefined },
    URL,
    Date,
    Promise,
    process: { env: {} },
    console,
    exports: moduleContext.exports,
    module: moduleContext,
    require: (name) => {
      if (stubs[name]) return stubs[name];
      throw new Error(`Unexpected require ${name}`);
    },
  });
  return moduleContext.exports;
}

test('extract YouTube video IDs from common URL shapes', () => {
  const { extractYouTubeVideoId } = loadTsModule('../src/services/fetchers/youtube-fetcher.ts', {
    '../../db/index.js': { query: async () => ({ rowCount: 0 }) },
    '../../lib/utils.js': { normalizePublicHttpUrl: (value) => new URL(value).toString() },
    './article-writer.js': { insertArticleIfNew: async () => false },
  });

  assert.equal(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractYouTubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
});

test('parse YouTube transcript XML into plain text', () => {
  const { parseYouTubeTranscriptXml } = loadTsModule('../src/services/fetchers/youtube-fetcher.ts', {
    '../../db/index.js': { query: async () => ({ rowCount: 0 }) },
    '../../lib/utils.js': { normalizePublicHttpUrl: (value) => new URL(value).toString() },
    './article-writer.js': { insertArticleIfNew: async () => false },
  });

  const text = parseYouTubeTranscriptXml('<transcript><text start="0">Hello &amp; welcome</text><text start="1">to SynthNews</text></transcript>');

  assert.equal(text, 'Hello & welcome to SynthNews');
});

test('discover recent YouTube RSS videos with thumbnails and descriptions', async () => {
  const { discoverYouTubeVideosFromFeed } = loadTsModule('../src/services/fetchers/youtube-fetcher.ts', {
    '../../db/index.js': { query: async () => ({ rowCount: 0 }) },
    '../../lib/utils.js': { normalizePublicHttpUrl: (value) => new URL(value).toString() },
    './article-writer.js': { insertArticleIfNew: async () => false },
  });
  const xml = `<?xml version="1.0"?>
    <feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
      <entry>
        <yt:videoId>dQw4w9WgXcQ</yt:videoId>
        <yt:channelId>UC123</yt:channelId>
        <title>Video &amp; title</title>
        <link rel="alternate" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"/>
        <published>2026-05-04T12:00:00+00:00</published>
        <media:group>
          <media:description>Description &amp; more</media:description>
          <media:thumbnail url="https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"/>
        </media:group>
      </entry>
    </feed>`;

  const items = discoverYouTubeVideosFromFeed(xml, {
    sourceId: 'src_youtube',
    maxItems: 5,
    now: new Date('2026-05-05T00:00:00.000Z'),
    recentDays: 3,
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(items[0].title, 'Video & title');
  assert.equal(items[0].payload.description, 'Description & more');
  assert.equal(items[0].payload.imageUrl, 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
});
