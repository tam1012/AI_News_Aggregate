import * as cheerio from 'cheerio';
import { normalizePublicHttpUrl } from '../../lib/utils.js';
import type { DiscoveredArticle } from '../article-fetch-queue.js';
import type { SourceRow } from './types.js';

export interface SitemapArticleEntry {
  url: string;
  title: string;
  publishedAt: string | null;
  sitemapUrl?: string;
}

export interface SitemapParseOptions {
  maxAgeHours?: number;
  now?: Date;
}

export interface SitemapFetchResponse {
  ok: boolean;
  status?: number;
  text(): Promise<string>;
}

export type SitemapFetch = (url: string, init?: RequestInit) => Promise<SitemapFetchResponse>;

const SITEMAP_PATHS = [
  '/sitemap.xml',
  '/sitemap_index.xml',
  '/news-sitemap.xml',
  '/news_sitemap.xml',
  '/sitemap_news.xml',
  '/post-sitemap.xml',
];

function normalizeDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isRecentEnough(value: string | null, options: SitemapParseOptions): boolean {
  if (!options.maxAgeHours || !value) return true;
  const published = new Date(value);
  if (Number.isNaN(published.getTime())) return true;
  const now = options.now || new Date();
  return now.getTime() - published.getTime() <= options.maxAgeHours * 60 * 60 * 1000;
}

function getText($node: cheerio.Cheerio<any>, selector: string): string {
  return $node.find(selector).first().text().replace(/\s+/g, ' ').trim();
}

function titleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname;
    return decodeURIComponent(last).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || url;
  } catch {
    return url;
  }
}

export function buildSitemapCandidates(siteUrl: string): string[] {
  const normalized = normalizePublicHttpUrl(siteUrl, false);
  if (!normalized) return [];

  try {
    const origin = new URL(normalized).origin;
    return SITEMAP_PATHS.map((path) => `${origin}${path}`);
  } catch {
    return [];
  }
}

export function parseSitemapIndexUrls(xml: string, baseUrl: string): string[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const seen = new Set<string>();
  const urls: string[] = [];

  $('sitemap').each((_: number, element: any) => {
    const rawLoc = getText($(element), 'loc');
    if (!rawLoc) return;
    try {
      const normalized = normalizePublicHttpUrl(new URL(rawLoc, baseUrl).toString());
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      urls.push(normalized);
    } catch {}
  });

  return urls;
}

export function parseSitemapUrls(xml: string, baseUrl: string, options: SitemapParseOptions = {}): SitemapArticleEntry[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const seen = new Set<string>();
  const entries: SitemapArticleEntry[] = [];

  $('url').each((_: number, element: any) => {
    const $url = $(element);
    const rawLoc = getText($url, 'loc');
    if (!rawLoc) return;

    try {
      const normalized = normalizePublicHttpUrl(new URL(rawLoc, baseUrl).toString());
      if (!normalized || seen.has(normalized)) return;

      const newsTitle = getText($url, 'news\\:title') || getText($url, 'title');
      const newsPublishedAt = normalizeDate(getText($url, 'news\\:publication_date'));
      const lastModifiedAt = normalizeDate(getText($url, 'lastmod'));
      const publishedAt = newsPublishedAt || lastModifiedAt;
      if (!isRecentEnough(publishedAt, options)) return;

      seen.add(normalized);
      entries.push({
        url: normalized,
        title: newsTitle || titleFromUrl(normalized),
        publishedAt,
      });
    } catch {}
  });

  return entries;
}

export async function discoverSitemapArticles(
  source: Pick<SourceRow, 'id' | 'url'>,
  fetcher: SitemapFetch = fetch,
  options: SitemapParseOptions & { limit?: number; candidates?: string[] } = {},
): Promise<DiscoveredArticle[]> {
  const candidates = options.candidates || buildSitemapCandidates(source.url);
  const sitemapUrls = [...candidates];
  const seenSitemaps = new Set<string>();
  const seenArticles = new Set<string>();
  const articles: DiscoveredArticle[] = [];
  const limit = Math.max(1, options.limit || 20);

  for (let index = 0; index < sitemapUrls.length && articles.length < limit; index++) {
    const sitemapUrl = sitemapUrls[index];
    if (seenSitemaps.has(sitemapUrl)) continue;
    seenSitemaps.add(sitemapUrl);

    try {
      const response = await fetcher(sitemapUrl, {
        headers: { 'User-Agent': 'NewsDigest/1.0 (Sitemap Reader)' },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) continue;

      const xml = await response.text();
      for (const child of parseSitemapIndexUrls(xml, sitemapUrl)) {
        if (!seenSitemaps.has(child) && sitemapUrls.length < candidates.length + 20) {
          sitemapUrls.push(child);
        }
      }

      for (const entry of parseSitemapUrls(xml, sitemapUrl, options)) {
        if (seenArticles.has(entry.url)) continue;
        seenArticles.add(entry.url);
        articles.push({
          sourceId: source.id,
          url: entry.url,
          title: entry.title,
          externalId: entry.url,
          publishedAt: entry.publishedAt,
          payload: {
            discovery: 'sitemap',
            sitemapUrl,
            rawExcerpt: '',
            rawContent: '',
          },
        });
        if (articles.length >= limit) break;
      }
    } catch {}
  }

  return articles;
}
