import RssParser from 'rss-parser';
import * as cheerio from 'cheerio';
import { decodeHTML } from 'entities';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { normalizePublicHttpUrl, truncate, sleep } from '../../lib/utils.js';
import { matchPromoKeyword } from '../../lib/promoFilter.js';
import { BROWSER_UA, BrowserFetchOptions, browserFetch } from './http-utils.js';
import { insertArticleIfNew, MIN_ARTICLE_TEXT_LENGTH } from './article-writer.js';
import { SourceFetcher } from './types.js';
import { learnSelectorProfileFromHtml } from './selector-learning.js';
import {
  extractWithSelectorProfile,
  getDomainFromUrl,
  getSourceProfile,
  isExtractionUsable,
  recordProfileFailure,
  recordProfileSuccess,
  rowToSelectorProfile,
  saveSourceProfile,
} from './selector-profile.js';

const rssParser = new RssParser({
  timeout: 15000,
  headers: {
    'User-Agent': 'NewsDigest/1.0 (RSS Reader)',
    Accept: 'application/rss+xml, application/xml, text/xml',
  },
});

interface RssDomainPolicy {
  allowSnippetFallback: boolean;
  snippetFallbackMinLength: number;
  skipBrowserFallback?: boolean;
  browserOptions?: BrowserFetchOptions;
}

const DEFAULT_RSS_SNIPPET_FALLBACK_MIN_LENGTH = parsePositiveInt(process.env.RSS_SNIPPET_FALLBACK_MIN_LENGTH, 800);
const DEFAULT_BLOCKED_GOOGLE_NEWS_PUBLISHER_DOMAINS = [
  'nytimes.com', 'eweek.com', 'kotaku.com', 'theinformation.com', 'politico.eu', 
  'latimes.com', 'axios.com', 'wsj.com', 'bloomberg.com', 'ft.com', 'economist.com', 
  'barrons.com', 'businessinsider.com', 'seekingalpha.com', 'nikkei.com', 
  'washingtonpost.com', 'thetimes.co.uk', 'telegraph.co.uk', 'scmp.com', 
  'theglobeandmail.com', 'theatlantic.com', 'newyorker.com', 'medium.com', 
  'towardsdatascience.com', 'wired.com', 'technologyreview.com', 'hbr.org'
];

let googleDecoderPromise: Promise<any | null> | null = null;

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function domainMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function getBlockedGoogleNewsPublisherDomains(): string[] {
  const configured = (process.env.BLOCKED_GOOGLE_NEWS_PUBLISHER_DOMAINS || '')
    .split(',')
    .map(domain => domain.trim().toLowerCase())
    .filter(Boolean);
  return configured.length > 0 ? configured : DEFAULT_BLOCKED_GOOGLE_NEWS_PUBLISHER_DOMAINS;
}

function isBlockedGoogleNewsPublisherUrl(url: string): boolean {
  const hostname = getHostname(url);
  return getBlockedGoogleNewsPublisherDomains().some(domain => domainMatches(hostname, domain));
}

function getRssDomainPolicy(url: string): RssDomainPolicy {
  const hostname = getHostname(url);
  const policy: RssDomainPolicy = {
    allowSnippetFallback: true,
    snippetFallbackMinLength: DEFAULT_RSS_SNIPPET_FALLBACK_MIN_LENGTH,
  };

  if (domainMatches(hostname, 'nytimes.com')) {
    return { ...policy, skipBrowserFallback: true };
  }

  if (hostname.includes('kotaku.com') || hostname.includes('eweek.com')) {
    return {
      ...policy,
      browserOptions: {
        waitUntil: 'domcontentloaded',
        blockHeavyResources: true,
        settleMs: 1000,
      },
    };
  }

  return policy;
}

function getNormalizedTextLength(value: string): number {
  return value.replace(/\s+/g, ' ').trim().length;
}

function buildSnippetFallbackContent(rssContent: string, rssExcerpt: string, minLength: number): string | null {
  const contentLength = getNormalizedTextLength(rssContent);
  if (contentLength >= minLength) return rssContent;

  const excerptLength = getNormalizedTextLength(rssExcerpt);
  if (excerptLength >= minLength) return rssExcerpt;

  return null;
}

function isGoogleNewsArticleUrl(url: string): boolean {
  return url.includes('news.google.com/rss/articles/');
}

async function getGoogleNewsDecoder(): Promise<any | null> {
  if (!googleDecoderPromise) {
    // @ts-ignore
    googleDecoderPromise = import('google-news-url-decoder')
      .then((decoderModule: any) => {
        const GoogleDecoder = decoderModule.GoogleDecoder || decoderModule.default;
        return GoogleDecoder ? new GoogleDecoder() : null;
      })
      .catch(() => null);
  }
  return googleDecoderPromise;
}

async function decodeGoogleNewsUrl(url: string): Promise<string> {
  if (!isGoogleNewsArticleUrl(url)) return url;

  const decoder = await getGoogleNewsDecoder();
  if (!decoder) throw new Error('Google News URL decoder is not available');

  const decoded = await decoder.decode(url);
  if (!decoded?.status || !decoded.decoded_url) {
    throw new Error(decoded?.message || 'Google News URL decoder returned no article URL');
  }

  const normalized = normalizePublicHttpUrl(decoded.decoded_url);
  if (!normalized) throw new Error('Google News decoded URL is not a public http(s) URL');
  return normalized;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function decodeText(value: string): string {
  return decodeHTML(value)
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHtml(html: string): string {
  const normalized = html.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '');
  return decodeText(cheerio.load(normalized).text());
}

function getText($item: cheerio.Cheerio<any>, selector: string): string {
  return decodeText($item.find(selector).first().text());
}

function getXmlChildHtml($item: cheerio.Cheerio<any>, selector: string): string {
  const child = $item.find(selector).first();
  return child.html()?.trim() || child.text().trim();
}

function getMetaContent($: cheerio.CheerioAPI, selector: string): string {
  return $(selector).first().attr('content')?.trim() || '';
}

function extractArticleText($: cheerio.CheerioAPI): string {
  $('script, style, noscript, iframe, svg, form, button, input, textarea, nav, header, footer, aside, .ads, .advertisement, .related, .social, .share, .comment, .comments').remove();

  const selectors = [
    'article [itemprop="articleBody"]',
    '[itemprop="articleBody"]',
    '[data-testid="article-body"]',
    '#article-container .caas-body',
    '#article-container [class*="body"]',
    '#article-container .caas-content-wrapper',
    'article',
    '.caas-body',
    '.maincontent',
    '.article-detail',
    '.article-content',
    '.ArticleContent',
    '.content-detail',
    '.detail-content',
    '.news-content',
    '.entry-content',
    '.post-content',
    '.story-body',
    'main',
  ];

  let best = '';
  for (const selector of selectors) {
    const text = $(selector).first().text().replace(/\s+/g, ' ').trim();
    if (text.length > best.length) best = text;
  }

  return best;
}

function extractWithReadability(html: string, url: string): string {
  try {
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    dom.window.close();
    return article?.textContent?.replace(/\s+/g, ' ').trim() || '';
  } catch {
    return '';
  }
}

function normalizeDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function extractArticleFromHtml(html: string, jobUrl: string, extractor: string): Promise<{ title: string; content: string; imageUrl: string | null; publishedAt: string | null; metadata?: any }> {
  const aiExtraction = await extractWithAiSelector(html, jobUrl);
  if (aiExtraction) {
    const { extraction, sourceProfileId } = aiExtraction;
    return {
      title: extraction.title,
      content: extraction.content,
      imageUrl: extraction.imageUrl,
      publishedAt: extraction.publishedAt,
      metadata: { extractor: `${extractor}:ai-selector`, matchedSelector: extraction.matchedSelector, sourceProfileId },
    };
  }

  const $ = cheerio.load(html);
  const title = $('h1').first().text().replace(/\s+/g, ' ').trim() ||
    getMetaContent($, 'meta[property="og:title"]') ||
    $('title').first().text().replace(/\s+/g, ' ').trim();
  let content = extractArticleText($);
  const selectorContentLength = content.length;
  const imageUrl = getMetaContent($, 'meta[property="og:image"]') || getMetaContent($, 'meta[name="twitter:image"]') || null;
  const publishedAt = $('time[datetime]').first().attr('datetime') ||
    getMetaContent($, 'meta[property="article:published_time"]') ||
    getMetaContent($, 'meta[name="pubdate"]') ||
    null;

  // Fallback: Mozilla Readability when cheerio selectors produce short content
  if (content.length < MIN_ARTICLE_TEXT_LENGTH) {
    const readabilityContent = extractWithReadability(html, jobUrl);
    if (readabilityContent.length > content.length) {
      content = readabilityContent;
    }
  }

  return {
    title,
    content,
    imageUrl: imageUrl ? normalizePublicHttpUrl(new URL(imageUrl, jobUrl).toString()) : null,
    publishedAt: normalizeDate(publishedAt),
    metadata: { extractor: content.length >= MIN_ARTICLE_TEXT_LENGTH && selectorContentLength < MIN_ARTICLE_TEXT_LENGTH ? `${extractor}:readability` : `${extractor}:selectors` },
  };
}

async function extractWithAiSelector(html: string, pageUrl: string) {
  const domain = getDomainFromUrl(pageUrl);
  if (!domain) return null;

  const cached = await getSourceProfile(domain);
  if (cached) {
    try {
      const profile = rowToSelectorProfile(cached);
      const extraction = extractWithSelectorProfile(html, pageUrl, profile);
      if (isExtractionUsable(extraction.content, profile.minTextLength)) {
        await recordProfileSuccess(cached.id);
        return { extraction, sourceProfileId: cached.id };
      }
      await recordProfileFailure(cached.id, new Error('Cached selector profile produced short content'));
    } catch (err) {
      await recordProfileFailure(cached.id, err);
    }
  }

  try {
    const learned = await learnSelectorProfileFromHtml(pageUrl, html);
    if (!learned) return null;
    const saved = await saveSourceProfile(domain, learned.profile);
    await recordProfileSuccess(saved.id);
    return { extraction: learned.extraction, sourceProfileId: saved.id };
  } catch (err: any) {
    console.warn(`Failed to learn selector profile for ${domain}: ${err.message}`);
    return null;
  }
}

async function fetchFullArticle(jobUrl: string, policy = getRssDomainPolicy(jobUrl)): Promise<{ title: string; content: string; imageUrl: string | null; publishedAt: string | null; metadata?: any }> {
  let fetchError: Error | null = null;

  try {
    const response = await fetch(jobUrl, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Status code ${response.status}`);

    const html = await response.text();
    const article = await extractArticleFromHtml(html, jobUrl, 'fetch');
    if (article.content.length >= MIN_ARTICLE_TEXT_LENGTH) return article;
    fetchError = new Error(`fetch extraction too short (${article.content.length} characters)`);
  } catch (err: any) {
    fetchError = err instanceof Error ? err : new Error(String(err));
  }

  if (policy.skipBrowserFallback) {
    throw new Error(`Full article fetch failed: ${fetchError?.message || 'unknown fetch error'}; browser fallback skipped by domain policy`);
  }

  try {
    console.warn(`Retrying RSS article with browser fetch ${jobUrl}: ${fetchError?.message || 'short content'}`);
    await sleep(2000);
    const html = await browserFetch(jobUrl, parseInt(process.env.ARTICLE_BROWSER_FETCH_TIMEOUT_MS || '30000', 10), policy.browserOptions || false);
    const article = await extractArticleFromHtml(html, jobUrl, 'browser');
    if (article.content.length >= MIN_ARTICLE_TEXT_LENGTH) return article;
    throw new Error(`browser extraction too short (${article.content.length} characters)`);
  } catch (browserErr: any) {
    throw new Error(`Full article fetch failed: ${fetchError?.message || 'unknown fetch error'}; browser fallback failed: ${browserErr.message}`);
  }
}

export function parseRssItems(xml: string): RssParser.Item[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  return $('item').toArray().flatMap((element) => {
    const $item = $(element);
    const title = getText($item, 'title');
    const link = getText($item, 'link');
    if (!title || !link) return [];

    return [{
      title,
      link,
      guid: getText($item, 'guid') || link,
      pubDate: getText($item, 'pubDate') || getText($item, 'published') || getText($item, 'updated'),
      creator: getText($item, 'creator') || getText($item, 'dc\\:creator'),
      contentSnippet: stripHtml(getXmlChildHtml($item, 'description')),
      content: getXmlChildHtml($item, 'encoded') || getXmlChildHtml($item, 'content\\:encoded') || getXmlChildHtml($item, 'description'),
      enclosure: { url: $item.find('enclosure').first().attr('url') || '' },
    }];
  });
}

async function parseFeedItems(xml: string): Promise<RssParser.Item[]> {
  try {
    const feed = await rssParser.parseString(xml);
    return feed.items;
  } catch {
    const items = parseRssItems(xml);
    if (items.length === 0) throw new Error('Feed not recognized as RSS 1 or 2.');
    return items;
  }
}

function normalizeFeedUrl(url: string): string {
  if (url === 'https://www.theguardian.com/international/rss') {
    return 'https://www.theguardian.com/world/rss';
  }
  return url;
}

export const rssFetcher: SourceFetcher = {
  key: 'rss',
  canHandle: (source) => source.type === 'rss',
  async discover(source) {
    const normalizedUrl = normalizePublicHttpUrl(source.url);
    const sourceUrl = normalizedUrl ? normalizeFeedUrl(normalizedUrl) : null;
    if (!sourceUrl) throw new Error('Source URL must be a public http(s) URL');

    const response = await fetch(sourceUrl, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'application/rss+xml, application/xml, text/xml, application/atom+xml;q=0.9, */*;q=0.8',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) throw new Error(`Status code ${response.status}`);

    const xml = await response.text();
    const items = (await parseFeedItems(xml)).slice(0, parsePositiveInt(process.env.MAX_ARTICLES_PER_SOURCE, 20));

    const results = [];
    for (const item of items) {
      const rawItem = item as RssParser.Item & Record<string, any>;
      if (!item.link || !item.title) continue;
      let url = normalizePublicHttpUrl(item.link);
      if (!url) continue;
      const googleNewsUrl = isGoogleNewsArticleUrl(url) ? url : null;

      if (googleNewsUrl) {
        try {
          url = await decodeGoogleNewsUrl(googleNewsUrl);
        } catch (err: any) {
          console.warn(`Failed to decode Google News URL ${googleNewsUrl}: ${err.message}`);
          continue;
        }
        if (isBlockedGoogleNewsPublisherUrl(url)) {
          console.log(`[google-news-filter] Skipped "${item.title}" from blocked publisher ${getHostname(url)}`);
          continue;
        }
      }

      const rawExcerpt = item.contentSnippet || item.content || '';
      const rawContent = item.content || rawItem['content:encoded'] || '';
      let imageUrl: string | null = null;
      if (item.enclosure?.url) {
        imageUrl = item.enclosure.url;
      } else if (rawContent) {
        const $ = cheerio.load(rawContent);
        imageUrl = $('img').first().attr('src') || null;
      }

      results.push({
        sourceId: source.id,
        url,
        title: decodeText(item.title),
        externalId: item.guid || null,
        publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : null,
        payload: {
          author: item.creator || rawItem.author || null,
          rawExcerpt: stripHtml(rawExcerpt),
          rawContent: stripHtml(rawContent),
          contentHashSeed: decodeText(item.title) + rawExcerpt,
          imageUrl,
          googleNewsUrl,
        },
      });
    }

    return results;
  },
  async fetchArticle(job, source) {
    const payload = job.payload_json || {};
    const rssExcerpt = payload.rawExcerpt || '';
    const rssContent = payload.rawContent || '';
    let fullArticle: Awaited<ReturnType<typeof fetchFullArticle>> | null = null;

    let articleUrl = job.url;
    if (isGoogleNewsArticleUrl(articleUrl)) {
      try {
        articleUrl = await decodeGoogleNewsUrl(articleUrl);
      } catch (err: any) {
        throw new Error(`Google News URL decode failed for queued article: ${err.message}`);
      }
    }

    if ((payload.googleNewsUrl || isGoogleNewsArticleUrl(job.url)) && isBlockedGoogleNewsPublisherUrl(articleUrl)) {
      throw new Error(`Google News publisher blocked by domain policy: ${getHostname(articleUrl)}`);
    }

    const policy = getRssDomainPolicy(articleUrl);
    let fullArticleError: string | null = null;
    try {
      fullArticle = await fetchFullArticle(articleUrl, policy);
    } catch (err: any) {
      fullArticleError = err.message;
      console.warn(`Failed to fetch full RSS article ${articleUrl}: ${err.message}`);
    }

    const fullContent = fullArticle?.content || '';
    const snippetFallbackContent = fullArticle ? null : buildSnippetFallbackContent(rssContent, rssExcerpt, policy.snippetFallbackMinLength);
    const rawContent = fullContent.length > rssContent.length ? fullContent : (snippetFallbackContent || rssContent);
    const rawExcerpt = rawContent ? truncate(rawContent, 500) : rssExcerpt;

    return {
      source,
      externalId: job.external_id,
      url: articleUrl,
      title: fullArticle?.title || job.title,
      author: payload.author || null,
      publishedAt: fullArticle?.publishedAt || job.published_at,
      rawExcerpt,
      rawContent,
      contentHashSeed: `${fullArticle?.title || job.title}${rawContent || rssExcerpt}`,
      imageUrl: fullArticle?.imageUrl || payload.imageUrl || null,
      metadata: fullArticle?.metadata || (snippetFallbackContent ? {
        extractor: 'rss:snippet-fallback',
        fullArticleError,
        snippetFallbackMinLength: policy.snippetFallbackMinLength,
        sourceUrl: articleUrl,
        googleNewsUrl: payload.googleNewsUrl || null,
      } : null),
    };
  },
  async fetch(source) {
    const result = { itemsFound: 0, itemsInserted: 0, errors: [] as string[], metadata: {} as Record<string, unknown> };

    try {
      const discovered = await rssFetcher.discover!(source);
      result.itemsFound = discovered.length;

      // Layer 1: keyword promo filter — drop deal/sale articles before DB insert
      const filtered: typeof discovered = [];
      let promoSkipped = 0;
      for (const item of discovered) {
        const matchedKeyword = matchPromoKeyword(item.title);
        if (matchedKeyword) {
          promoSkipped++;
          console.log(`[promo-filter] Skipped "${item.title}" (matched: "${matchedKeyword}")`);
          continue;
        }
        filtered.push(item);
      }
      if (promoSkipped > 0) {
        result.metadata.promoSkipped = promoSkipped;
      }

      for (const item of filtered) {
        const articleInput = await rssFetcher.fetchArticle!({
          id: '',
          source_id: source.id,
          url: item.url,
          title: item.title,
          external_id: item.externalId || null,
          published_at: item.publishedAt || null,
          payload_json: item.payload || null,
        }, source);
        if (!articleInput) continue;
        const inserted = await insertArticleIfNew({
          ...articleInput,
        });
        if (inserted) result.itemsInserted++;
      }
    } catch (err: any) {
      result.errors.push(err.message);
    }

    return result;
  },
};
