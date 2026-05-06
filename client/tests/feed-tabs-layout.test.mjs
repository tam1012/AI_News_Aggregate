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

test('split feed toolbar keeps compact tabs separate from the filter button on narrow panes', () => {
  const css = readFileSync(resolve(__dirname, '../src/styles/global.css'), 'utf8');
  const toolbarTabsRule = css.match(/\.split-feed-toolbar \.feed-tabs\s*\{([^}]+)\}/)?.[1] || '';
  const toolbarTabRule = css.match(/\.split-feed-toolbar \.feed-tab\s*\{([^}]+)\}/)?.[1] || '';

  assert.match(toolbarTabsRule, /justify-content:\s*flex-start/);
  assert.match(toolbarTabsRule, /overflow-x:\s*auto/);
  assert.match(toolbarTabRule, /padding:\s*6px 8px/);
  assert.match(toolbarTabRule, /font-size:\s*0\.82rem/);
});

test('mobile reader exposes refresh row and floating scroll-to-top affordance styles', () => {
  const css = readFileSync(resolve(__dirname, '../src/styles/global.css'), 'utf8');
  const homeSource = readFileSync(resolve(__dirname, '../src/pages/Home.tsx'), 'utf8');

  assert.match(css, /\.feed-refresh-row\s*\{/);
  assert.match(css, /\.scroll-top-button\s*\{/);
  assert.match(homeSource, /className="feed-refresh-row"/);
  assert.match(homeSource, /className="scroll-top-button"/);
});

test('mobile digest tab bar scrolls horizontally without page overflow', () => {
  const css = readFileSync(resolve(__dirname, '../src/styles/global.css'), 'utf8');
  const homeSource = readFileSync(resolve(__dirname, '../src/pages/Home.tsx'), 'utf8');
  const mobileTabsRule = css.match(/\.visible-on-mobile-only\.feed-tabs\s*\{([^}]+)\}/)?.[1] || '';
  const mobileTabRule = css.match(/\.visible-on-mobile-only\.feed-tabs \.feed-tab\s*\{([^}]+)\}/)?.[1] || '';

  assert.match(homeSource, /className="feed-tabs visible-on-mobile-only"/);
  assert.match(css, /overflow-x:\s*clip/);
  assert.match(mobileTabsRule, /max-width:\s*100%/);
  assert.match(mobileTabsRule, /overflow-x:\s*auto/);
  assert.match(mobileTabsRule, /overscroll-behavior-x:\s*contain/);
  assert.match(mobileTabsRule, /justify-content:\s*flex-start/);
  assert.match(mobileTabRule, /flex:\s*0 0 auto/);
});

test('mobile feed and detail styles prioritize compact reading', () => {
  const css = readFileSync(resolve(__dirname, '../src/styles/global.css'), 'utf8');
  const homeSource = readFileSync(resolve(__dirname, '../src/pages/Home.tsx'), 'utf8');

  assert.match(css, /-webkit-line-clamp:\s*3/);
  assert.match(css, /\.detail-actions\s*\{[\s\S]*position:\s*sticky/);
  assert.match(css, /--safe-bottom:\s*env\(safe-area-inset-bottom/);
  assert.match(homeSource, />Tin mới<\/button>/);
});

test('service worker cache version is bumped for updated app shell', () => {
  const serviceWorker = readFileSync(resolve(__dirname, '../public/sw.js'), 'utf8');

  assert.match(serviceWorker, /CACHE_VERSION = 'synthnews-v2'/);
});

test('feed uses server-side tab pagination and exposes load-more control', () => {
  const homeSource = readFileSync(resolve(__dirname, '../src/pages/Home.tsx'), 'utf8');
  const apiSource = readFileSync(resolve(__dirname, '../src/services/api.ts'), 'utf8');

  assert.match(apiSource, /feedTab\?: 'news' \| 'voz' \| 'reddit' \| 'youtube'/);
  assert.match(homeSource, /feedTab: tab === 'digest' \? 'news' : tab/);
  assert.match(homeSource, /handleLoadMoreArticles/);
  assert.match(homeSource, /Tải thêm bài cũ/);
});
