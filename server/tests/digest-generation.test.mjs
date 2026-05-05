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
    Date,
    Intl,
    Math,
    Number,
    parseInt,
    process: {
      env: {},
    },
    require: (name) => {
      if (stubs[name]) return stubs[name];
      throw new Error(`Unexpected require ${name}`);
    },
  });
  return moduleContext.exports;
}

function loadSummarizer(env = {}) {
  return loadTsModule('../src/services/summarizer.ts', {
    '../db/index.js': {},
    '../lib/utils.js': {
      generateId: (prefix) => `${prefix}_test`,
      truncate: (value) => value,
    },
    '../lib/tldr.js': {
      normalizeTldr: (value) => value,
    },
    '../lib/summaryRetryPolicy.js': {
      truncateSummaryError: (err) => String(err?.message || err),
    },
    '../lib/summaryOutput.js': {
      parseAiSummaryOutput: () => ({}),
    },
    './ai-client.js': {},
    './prompt-settings.js': {},
    '../lib/promptConfig.js': {},
  }, env);
}

test('digest date uses Vietnam local date instead of UTC date', () => {
  const { buildDigestRunContext } = loadSummarizer();
  const context = buildDigestRunContext(new Date('2026-05-04T23:30:00.000Z'));

  assert.equal(context.digestDate, '2026-05-05');
  assert.equal(context.displayDate, '05/05/2026');
  assert.match(context.displayDateTime, /05\/05\/2026/);
});

test('digest article limit defaults to 100 and can be overridden safely', () => {
  const { parseDigestArticleLimit } = loadSummarizer();

  assert.equal(parseDigestArticleLimit(undefined), 100);
  assert.equal(parseDigestArticleLimit('25'), 25);
  assert.equal(parseDigestArticleLimit('500'), 200);
  assert.equal(parseDigestArticleLimit('bad'), 100);
});

test('digest prompt prioritizes economy society coverage and avoids time-of-day greetings', () => {
  const { buildDigestPrompt, buildDigestRunContext } = loadSummarizer();
  const prompt = buildDigestPrompt({
    promptConfig: {
      output_language: 'Vietnamese',
      topic_priorities: ['AI/LLM', 'Startup/Business'],
      digest_headings: ['AI & LLM', 'Startup & Business'],
      custom_context: '',
    },
    articleSummaries: '1. [VnExpress | score 8 | tags: Vietnam, Business] Tin kinh te\n   Tom tat',
    runContext: buildDigestRunContext(new Date('2026-05-04T23:30:00.000Z')),
  });

  assert.match(prompt, /05\/05\/2026/);
  assert.match(prompt, /Thời sự kinh tế xã hội/);
  assert.match(prompt, /kinh tế/i);
  assert.match(prompt, /xã hội/i);
  assert.match(prompt, /Không mở đầu bằng lời chào/i);
  assert.doesNotMatch(prompt, /Chào buổi sáng/);
});

test('generate digest does not insert an empty AI response', async () => {
  const writes = [];
  const { generateDigest } = loadTsModule('../src/services/summarizer.ts', {
    '../db/index.js': {
      getMany: async () => [{
        id: 'art_1',
        title: 'Tin kinh te',
        summary_short: 'Tom tat ngan',
        summary_text: 'Tom tat dai',
        hot_score: 8,
        tags: ['Economy'],
        source_name: 'VnExpress',
      }],
      query: async (sql, params) => {
        writes.push({ sql, params });
        return { rowCount: 1 };
      },
    },
    '../lib/utils.js': {
      generateId: (prefix) => `${prefix}_test`,
      truncate: (value) => value,
    },
    '../lib/tldr.js': {
      normalizeTldr: (value) => value,
    },
    '../lib/summaryRetryPolicy.js': {
      truncateSummaryError: (err) => String(err?.message || err),
    },
    '../lib/summaryOutput.js': {
      parseAiSummaryOutput: () => ({}),
    },
    './ai-client.js': {
      callAi: async () => '   ',
    },
    './prompt-settings.js': {
      getPromptConfig: async () => ({
        output_language: 'Vietnamese',
        topic_priorities: ['AI/LLM'],
        digest_headings: ['AI & LLM'],
        custom_context: '',
      }),
    },
    '../lib/promptConfig.js': {},
  });

  const result = await generateDigest();

  assert.equal(result, null);
  assert.equal(writes.length, 0);
});
