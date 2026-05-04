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

test('merge prompt config with defaults and sanitize string arrays', () => {
  const { mergePromptConfig, DEFAULT_PROMPT_CONFIG } = loadTsModule('../src/lib/promptConfig.ts');
  const merged = mergePromptConfig({
    output_language: 'English',
    topic_priorities: [' AI ', '', 12, 'Security'],
    allowed_tags: ['Finance', 'Climate', 'Finance'],
    digest_headings: [],
    custom_context: 'Focus on Southeast Asia.',
  });

  assert.equal(merged.output_language, 'English');
  assert.deepEqual(Array.from(merged.topic_priorities), ['AI', 'Security']);
  assert.deepEqual(Array.from(merged.allowed_tags), ['Finance', 'Climate']);
  assert.deepEqual(Array.from(merged.digest_headings), Array.from(DEFAULT_PROMPT_CONFIG.digest_headings));
  assert.equal(merged.custom_context, 'Focus on Southeast Asia.');
});

test('reject invalid prompt config payloads', () => {
  const { validatePromptConfigPatch } = loadTsModule('../src/lib/promptConfig.ts');

  assert.throws(() => validatePromptConfigPatch({ output_language: '' }), /output_language/);
  assert.throws(() => validatePromptConfigPatch({ allowed_tags: [] }), /allowed_tags/);
  assert.throws(() => validatePromptConfigPatch({ custom_context: '<tag>bad</tag>' }), /custom_context/);
});
