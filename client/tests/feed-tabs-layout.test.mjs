import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('youtube tab uses compact YT label', () => {
  const homeSource = readFileSync(resolve(__dirname, '../src/pages/Home.tsx'), 'utf8');

  assert.match(homeSource, /: 'YT'/);
  assert.doesNotMatch(homeSource, />YouTube<\/button>/);
});

test('desktop split feed tabs scroll within the left pane instead of overflowing it', () => {
  const css = readFileSync(resolve(__dirname, '../src/styles/global.css'), 'utf8');
  const splitTabsRule = css.match(/\.split-left \.feed-tabs\s*\{([^}]+)\}/)?.[1] || '';
  const feedTabRule = css.match(/\.feed-tab\s*\{([^}]+)\}/)?.[1] || '';

  assert.match(splitTabsRule, /justify-content:\s*flex-start/);
  assert.match(splitTabsRule, /overflow-x:\s*auto/);
  assert.match(feedTabRule, /white-space:\s*nowrap/);
});
