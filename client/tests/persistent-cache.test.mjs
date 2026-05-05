import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadTsModule(relativePath, localStorage) {
  const source = readFileSync(resolve(__dirname, relativePath), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const moduleContext = { exports: {} };
  vm.runInNewContext(outputText, {
    Date,
    JSON,
    exports: moduleContext.exports,
    module: moduleContext,
    window: { localStorage },
  });
  return moduleContext.exports;
}

function createLocalStorage() {
  const store = new Map();
  return {
    getItem: (key) => store.has(key) ? store.get(key) : null,
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
  };
}

test('persistent API cache stores and restores cacheable public responses', () => {
  const localStorage = createLocalStorage();
  const { savePersistentApiCache, loadPersistentApiCache } = loadTsModule('../src/services/persistentCache.ts', localStorage);

  const response = { success: true, data: [{ id: 'art_1' }] };
  savePersistentApiCache('/articles?limit=100', response);

  assert.deepEqual(loadPersistentApiCache('/articles?limit=100'), response);
});

test('persistent API cache ignores admin and mutating-style paths', () => {
  const localStorage = createLocalStorage();
  const { savePersistentApiCache, loadPersistentApiCache } = loadTsModule('../src/services/persistentCache.ts', localStorage);

  savePersistentApiCache('/ai-providers', { success: true, data: [] });

  assert.equal(loadPersistentApiCache('/ai-providers'), null);
});

test('mark persistent data annotates stale offline responses', () => {
  const localStorage = createLocalStorage();
  const { markPersistentData } = loadTsModule('../src/services/persistentCache.ts', localStorage);

  assert.equal(JSON.stringify(markPersistentData({ success: true, data: [] })), JSON.stringify({
    success: true,
    data: [],
    offline: true,
    stale: true,
  }));
});
