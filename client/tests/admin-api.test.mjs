import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadApiModule(fetchImpl) {
  const source = readFileSync(resolve(__dirname, '../src/services/api.ts'), 'utf8');
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
    fetch: fetchImpl,
    localStorage: {
      getItem: () => 'admin-token',
      setItem: () => {},
    },
    window: {
      prompt: () => '',
    },
    URLSearchParams,
    require: (name) => {
      if (name === './apiCache') {
        return {
          getCachePolicy: () => ({ cacheable: false, ttlMs: 0 }),
          makeApiCacheKey: (path) => path,
        };
      }
      if (name === './persistentCache') {
        return {
          loadPersistentApiCache: () => null,
          markPersistentData: (data) => data,
          savePersistentApiCache: () => {},
        };
      }
      throw new Error(`Unexpected require ${name}`);
    },
  });
  return moduleContext.exports;
}

test('admin API can trigger article fetch worker', async () => {
  const calls = [];
  const { api } = loadApiModule(async (url, options) => {
    calls.push({ url, options });
    return {
      json: async () => ({ success: true, data: { message: 'ok' } }),
    };
  });

  await api.triggerFetchArticles();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/health/trigger/fetch-articles');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer admin-token');
});
