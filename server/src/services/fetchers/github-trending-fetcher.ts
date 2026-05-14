import * as cheerio from 'cheerio';
import { normalizePublicHttpUrl, truncate } from '../../lib/utils.js';
import { BROWSER_UA, isBlockedHtml, playwrightFetch, randomUA } from './http-utils.js';
import { scraplingFetchWithFallback } from './scrapling-fetch.js';
import { SourceFetcher } from './types.js';

interface GitHubTrendingPayload {
  repoName: string;
  repoUrl: string;
  description: string;
  language: string | null;
  stars: string | null;
  starsToday: string | null;
  discoveredAt: string;
}

const README_BRANCHES = ['main', 'master'];
const README_FILENAMES = ['README.md', 'README.mdx', 'README.rst', 'README.txt'];

function isGitHubTrendingUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase() === 'github.com' && parsed.pathname.toLowerCase().startsWith('/trending');
  } catch {
    return false;
  }
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readRepoName($: cheerio.CheerioAPI, row: any): string {
  const link = $(row).find('h2 a').first();
  const href = link.attr('href') || '';
  return cleanText(link.text()).replace(/\s*\/\s*/g, '/').replace(/^\//, '') || href.replace(/^\//, '');
}

function readStars($: cheerio.CheerioAPI, row: any): string | null {
  const text = cleanText($(row).find('a[href$="/stargazers"]').first().text());
  return text || null;
}

function readStarsToday($: cheerio.CheerioAPI, row: any): string | null {
  const text = cleanText($(row).find('span.d-inline-block.float-sm-right').first().text());
  return text || null;
}

function readLanguage($: cheerio.CheerioAPI, row: any): string | null {
  const text = cleanText($(row).find('[itemprop="programmingLanguage"]').first().text());
  return text || null;
}

function buildRawExcerpt(payload: GitHubTrendingPayload): string {
  const parts = [
    payload.stars ? `Stars: ${payload.stars}` : '',
    payload.starsToday ? `Trending today: ${payload.starsToday}` : '',
    payload.language ? `Language: ${payload.language}` : '',
    payload.description,
  ].filter(Boolean);
  return parts.join('\n');
}

function repoPathFromUrl(repoUrl: string): string | null {
  try {
    const parsed = new URL(repoUrl);
    if (parsed.hostname.toLowerCase() !== 'github.com') return null;
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    return `${parts[0]}/${parts[1]}`;
  } catch {
    return null;
  }
}

async function fetchReadmeFromRaw(repoUrl: string): Promise<string | null> {
  const repoPath = repoPathFromUrl(repoUrl);
  if (!repoPath) return null;

  for (const branch of README_BRANCHES) {
    for (const filename of README_FILENAMES) {
      const url = `https://raw.githubusercontent.com/${repoPath}/${branch}/${filename}`;
      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': BROWSER_UA, Accept: 'text/plain,text/markdown,*/*' },
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) continue;
        const text = await response.text();
        if (text.trim().length >= 80) return text.trim();
      } catch {}
    }
  }

  return null;
}

async function fetchReadmeFromRepoPage(repoUrl: string): Promise<string | null> {
  let html = '';
  try {
    const response = await fetch(repoUrl, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Status code ${response.status}`);
    html = await response.text();
    if (isBlockedHtml(html)) throw new Error('blocked HTML');
  } catch (err: any) {
    console.warn(`github-trending: native repo page fetch failed for ${repoUrl}, falling back to Scrapling: ${err.message}`);
    try {
      html = await scraplingFetchWithFallback(repoUrl, {
        mode: 'fast',
        blockResources: true,
        waitMs: 1000,
      }, {
        waitUntil: 'networkidle2',
        blockHeavyResources: true,
        settleMs: 1000,
        userAgent: randomUA(),
      });
    } catch {
      return null;
    }
  }

  let $ = cheerio.load(html);
  let text = cleanText($('article.markdown-body, #readme').first().text());
  if (text.length < 80) {
    try {
      html = await scraplingFetchWithFallback(repoUrl, {
        mode: 'fast',
        blockResources: true,
        waitMs: 1000,
      }, {
        waitUntil: 'networkidle2',
        blockHeavyResources: true,
        settleMs: 1000,
        userAgent: randomUA(),
      });
      $ = cheerio.load(html);
      text = cleanText($('article.markdown-body, #readme').first().text());
    } catch {}
  }
  return text.length >= 80 ? text : null;
}

export function buildGitHubTrendingContent(payload: GitHubTrendingPayload, readme: string | null): string {
  const metadata = [
    `Repository: ${payload.repoName}`,
    payload.description ? `Description: ${payload.description}` : '',
    payload.language ? `Language: ${payload.language}` : '',
    payload.stars ? `Stars: ${payload.stars}` : '',
    payload.starsToday ? `Trending signal: ${payload.starsToday}` : '',
  ].filter(Boolean).join('\n');

  return readme
    ? `${metadata}\n\nREADME:\n${readme}`
    : metadata;
}

export const githubTrendingFetcher: SourceFetcher = {
  key: 'github-trending',
  canHandle: (source) => source.type === 'web' && isGitHubTrendingUrl(source.url),
  async fetch(source) {
    const discovered = await githubTrendingFetcher.discover!(source);
    let itemsInserted = 0;
    for (const item of discovered) {
      const articleInput = await githubTrendingFetcher.fetchArticle!({
        id: '',
        source_id: item.sourceId,
        url: item.url,
        title: item.title,
        external_id: item.externalId || null,
        published_at: item.publishedAt || null,
        payload_json: item.payload || null,
      }, source);
      if (articleInput) itemsInserted++;
    }
    return { itemsFound: discovered.length, itemsInserted, errors: [] };
  },
  async discover(source) {
    const sourceUrl = normalizePublicHttpUrl(source.url, false);
    if (!sourceUrl) throw new Error('Source URL must be a public http(s) URL');

    let html = '';
    try {
      const response = await fetch(sourceUrl, {
        headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml' },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`Status code ${response.status}`);
      html = await response.text();
      if (isBlockedHtml(html)) throw new Error('blocked HTML');
    } catch (err: any) {
      console.warn(`github-trending: native discover failed for ${sourceUrl}, falling back to Scrapling: ${err.message}`);
      html = await scraplingFetchWithFallback(sourceUrl, {
        mode: 'fast',
        blockResources: true,
        waitMs: 1000,
      }, {
        waitUntil: 'networkidle2',
        blockHeavyResources: true,
        settleMs: 1000,
        userAgent: randomUA(),
      });
    }

    let $ = cheerio.load(html);
    const discoveredAt = new Date().toISOString();
    let rows = $('article.Box-row');
    if (rows.length === 0) {
      console.warn(`github-trending: native discover found 0 rows for ${sourceUrl}, falling back to Scrapling`);
      html = await scraplingFetchWithFallback(sourceUrl, {
        mode: 'fast',
        blockResources: true,
        waitMs: 1000,
      }, {
        waitUntil: 'networkidle2',
        blockHeavyResources: true,
        settleMs: 1000,
        userAgent: randomUA(),
      });
      $ = cheerio.load(html);
      rows = $('article.Box-row');
    }

    const items = rows.map((_: number, row: any) => {
      const link = $(row).find('h2 a').first();
      const href = link.attr('href');
      if (!href) return null;

      const repoUrl = normalizePublicHttpUrl(new URL(href, 'https://github.com').toString());
      if (!repoUrl) return null;

      const repoName = readRepoName($, row);
      if (!repoName) return null;

      const description = cleanText($(row).find('p').first().text());
      const payload: GitHubTrendingPayload = {
        repoName,
        repoUrl,
        description,
        language: readLanguage($, row),
        stars: readStars($, row),
        starsToday: readStarsToday($, row),
        discoveredAt,
      };

      return {
        sourceId: source.id,
        url: repoUrl,
        title: repoName,
        externalId: repoName,
        publishedAt: discoveredAt,
        payload,
      };
    }).get().filter(Boolean) as {
      sourceId: string;
      url: string;
      title: string;
      externalId: string;
      publishedAt: string;
      payload: GitHubTrendingPayload;
    }[];

    return items.slice(0, parsePositiveInt(process.env.MAX_ARTICLES_PER_SOURCE, 20));
  },
  async fetchArticle(job, source) {
    const payload = (job.payload_json || {}) as Partial<GitHubTrendingPayload>;
    const repoName = payload.repoName || job.title;
    const repoUrl = normalizePublicHttpUrl(payload.repoUrl || job.url);
    if (!repoUrl) throw new Error('Repository URL must be a public http(s) URL');

    const normalizedPayload: GitHubTrendingPayload = {
      repoName,
      repoUrl,
      description: payload.description || '',
      language: payload.language || null,
      stars: payload.stars || null,
      starsToday: payload.starsToday || null,
      discoveredAt: payload.discoveredAt || job.published_at || new Date().toISOString(),
    };

    const readme = await fetchReadmeFromRaw(repoUrl) || await fetchReadmeFromRepoPage(repoUrl);
    const rawExcerpt = buildRawExcerpt(normalizedPayload);
    const rawContent = buildGitHubTrendingContent(normalizedPayload, readme);

    return {
      source,
      url: repoUrl,
      title: repoName,
      publishedAt: job.published_at || normalizedPayload.discoveredAt,
      rawExcerpt: rawExcerpt || repoName,
      rawContent,
      contentHashSeed: `${repoUrl}:${normalizedPayload.starsToday || normalizedPayload.discoveredAt.slice(0, 10)}`,
      contentMaxLength: 30000,
      metadata: {
        kind: 'github-trending',
        ...normalizedPayload,
        hasReadme: Boolean(readme),
      },
    };
  },
};
