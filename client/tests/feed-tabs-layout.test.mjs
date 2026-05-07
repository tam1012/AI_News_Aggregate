import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('desktop split feed tabs scroll within the left pane instead of overflowing it', () => {
  const css = readFileSync(resolve(__dirname, '../src/styles/global.css'), 'utf8');
  const splitTabsRule = css.match(/\.split-left \.feed-tabs\s*\{([^}]+)\}/)?.[1] || '';
  const feedTabRule = css.match(/\.feed-tab\s*\{([^}]+)\}/)?.[1] || '';

  assert.match(splitTabsRule, /justify-content:\s*flex-start/);
  assert.match(splitTabsRule, /overflow-x:\s*auto/);
  assert.match(feedTabRule, /white-space:\s*nowrap/);
});

test('dark theme uses GitHub-style neutral dark tokens', () => {
  const css = readFileSync(resolve(__dirname, '../src/styles/global.css'), 'utf8');
  const darkThemeRule = css.match(/\[data-theme="dark"\]\s*\{([^}]+)\}/)?.[1] || '';

  assert.match(darkThemeRule, /--color-bg:\s*#0d1117/);
  assert.match(darkThemeRule, /--color-bg-card:\s*#161b22/);
  assert.match(darkThemeRule, /--color-accent:\s*#58a6ff/);
  assert.match(darkThemeRule, /--color-border:\s*#30363d/);
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

test('desktop split view widens reader without changing feed column width', () => {
  const css = readFileSync(resolve(__dirname, '../src/styles/global.css'), 'utf8');

  assert.match(css, /body\.split-view-active \.container-fluid\s*\{[\s\S]*max-width:\s*min\(1680px, calc\(100vw - 32px\)\)/);
  assert.match(css, /\.home-split-layout\s*\{[\s\S]*width:\s*100%/);
  assert.match(css, /\.split-left\s*\{[\s\S]*flex:\s*0 0 360px/);
  assert.match(css, /@media \(min-width:\s*1200px\)\s*\{[\s\S]*\.split-left\s*\{[\s\S]*flex:\s*0 0 400px/);
});

test('mobile reader exposes refresh row and floating scroll-to-top affordance styles', () => {
  const css = readFileSync(resolve(__dirname, '../src/styles/global.css'), 'utf8');
  const homeSource = readFileSync(resolve(__dirname, '../src/pages/Home.tsx'), 'utf8');

  assert.match(css, /\.feed-refresh-row\s*\{/);
  assert.match(css, /\.scroll-top-button\s*\{/);
  assert.match(homeSource, /className="feed-refresh-row"/);
  assert.match(homeSource, /className="scroll-top-button"/);
});

test('mobile digest keeps the main tab bar at the top instead of a bottom-only bar', () => {
  const css = readFileSync(resolve(__dirname, '../src/styles/global.css'), 'utf8');
  const homeSource = readFileSync(resolve(__dirname, '../src/pages/Home.tsx'), 'utf8');

  assert.doesNotMatch(homeSource, /feed-tabs visible-on-mobile-only/);
  assert.doesNotMatch(css, /\.visible-on-mobile-only\.feed-tabs\s*\{/);
  assert.match(css, /\.split-feed-toolbar \.toolbar-tabs-row\s*\{[\s\S]*justify-content:\s*flex-start/);
  assert.match(css, /overflow-x:\s*clip/);
});

test('mobile feed and detail styles prioritize clean reading', () => {
  const css = readFileSync(resolve(__dirname, '../src/styles/global.css'), 'utf8');
  const homeSource = readFileSync(resolve(__dirname, '../src/pages/Home.tsx'), 'utf8');

  assert.match(css, /\.feed-item-body\s*\{[\s\S]*display:\s*block/);
  assert.match(css, /\.detail-source-link\s*\{/);
  assert.match(css, /\.detail-reading-nav\s*\{/);
  assert.match(css, /\.detail-reading-nav-btn\s*\{/);
  assert.match(css, /height:\s*100dvh/);
  assert.match(css, /\.detail-mobile-header\s*\{[\s\S]*display:\s*none/);
  assert.match(css, /padding:\s*26px 0 12px/);
  assert.match(css, /touch-action:\s*none/);
  assert.match(css, /\.feed-item-title\s*\{[\s\S]*font-size:\s*1\.02rem/);
  assert.match(css, /\.detail-title-editorial\s*\{[\s\S]*font-size:\s*clamp\(1\.75rem, 3\.4vw, 2\.1rem\)/);
  assert.match(homeSource, /startedOnPullBarRef/);
  assert.match(css, /--safe-bottom:\s*env\(safe-area-inset-bottom/);
  assert.match(homeSource, /Tin mới/);
});

test('service worker cache version is bumped for updated app shell', () => {
  const serviceWorker = readFileSync(resolve(__dirname, '../public/sw.js'), 'utf8');

  assert.match(serviceWorker, /CACHE_VERSION = 'synthnews-v3'/);
  assert.match(serviceWorker, /fetch\(request, \{ cache: 'no-store' \}\)/);
});

test('feed uses server-side tab pagination and exposes load-more control', () => {
  const homeSource = readFileSync(resolve(__dirname, '../src/pages/Home.tsx'), 'utf8');
  const apiSource = readFileSync(resolve(__dirname, '../src/services/api.ts'), 'utf8');

  assert.match(apiSource, /feedTab\?: 'news' \| 'voz' \| 'reddit'/);
  assert.match(homeSource, /feedTab: tab === 'digest' \? 'news' : tab/);
  assert.match(homeSource, /handleLoadMoreArticles/);
  assert.match(homeSource, /Tải thêm bài cũ/);
});

test('feed omits hot ranking controls for a simpler toolbar', () => {
  const homeSource = readFileSync(resolve(__dirname, '../src/pages/Home.tsx'), 'utf8');
  const css = readFileSync(resolve(__dirname, '../src/styles/global.css'), 'utf8');

  assert.doesNotMatch(homeSource, /Tin nóng/);
  assert.doesNotMatch(homeSource, /sort: feedSort/);
  assert.doesNotMatch(css, /\.feed-sort-toggle\s*\{/);
});

test('article detail supports keyboard arrow navigation', () => {
  const homeSource = readFileSync(resolve(__dirname, '../src/pages/Home.tsx'), 'utf8');

  assert.match(homeSource, /event\.key === 'ArrowLeft'/);
  assert.match(homeSource, /handlePrevArticle\(\)/);
  assert.match(homeSource, /event\.key === 'ArrowRight'/);
  assert.match(homeSource, /handleNextArticle\(\)/);
  assert.match(homeSource, /input, textarea, select, \[contenteditable="true"\]/);
});
