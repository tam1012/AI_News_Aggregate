import RssParser from 'rss-parser';
import * as cheerio from 'cheerio';
import { normalizePublicHttpUrl, truncate } from '../../lib/utils.js';
import { BROWSER_UA } from './http-utils.js';
import { insertArticleIfNew } from './article-writer.js';
import { SourceFetcher } from './types.js';

const rssParser = new RssParser({
  timeout: 15000,
  headers: {
    'User-Agent': 'NewsDigest/1.0 (RSS Reader)',
    Accept: 'application/rss+xml, application/xml, text/xml',
  },
});

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function stripHtml(html: string): string {
  const normalized = html.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '');
  return cheerio.load(normalized).text().replace(/\s+/g, ' ').trim();
}

function getText($item: cheerio.Cheerio<any>, selector: string): string {
  return $item.find(selector).first().text().trim();
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
    'article',
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

async function fetchFullArticle(jobUrl: string): Promise<{ title: string; content: string; imageUrl: string | null; publishedAt: string | null }> {
  const response = await fetch(jobUrl, {
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Status code ${response.status}`);

  const html = await response.text();
  const $ = cheerio.load(html);
  const title = $('h1').first().text().replace(/\s+/g, ' ').trim() ||
    getMetaContent($, 'meta[property="og:title"]') ||
    $('title').first().text().replace(/\s+/g, ' ').trim();
  const content = extractArticleText($);
  const imageUrl = getMetaContent($, 'meta[property="og:image"]') || getMetaContent($, 'meta[name="twitter:image"]') || null;
  const publishedAt = $('time[datetime]').first().attr('datetime') ||
    getMetaContent($, 'meta[property="article:published_time"]') ||
    getMetaContent($, 'meta[name="pubdate"]') ||
    null;

  let normalizedPublishedAt: string | null = null;
  if (publishedAt) {
    const date = new Date(publishedAt);
    if (!Number.isNaN(date.getTime())) normalizedPublishedAt = date.toISOString();
  }

  return {
    title,
    content,
    imageUrl: imageUrl ? normalizePublicHttpUrl(new URL(imageUrl, jobUrl).toString()) : null,
    publishedAt: normalizedPublishedAt,
  };
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

export const rssFetcher: SourceFetcher = {
  key: 'rss',
  canHandle: (source) => source.type === 'rss',
  async discover(source) {
    const sourceUrl = normalizePublicHttpUrl(source.url);
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

    return items.flatMap((item) => {
      const rawItem = item as RssParser.Item & Record<string, any>;
      if (!item.link || !item.title) return [];
      const url = normalizePublicHttpUrl(item.link);
      if (!url) return [];

      const rawExcerpt = item.contentSnippet || item.content || '';
      const rawContent = item.content || rawItem['content:encoded'] || '';
      let imageUrl: string | null = null;
      if (item.enclosure?.url) {
        imageUrl = item.enclosure.url;
      } else if (rawContent) {
        const $ = cheerio.load(rawContent);
        imageUrl = $('img').first().attr('src') || null;
      }

      return [{
        sourceId: source.id,
        url,
        title: item.title.trim(),
        externalId: item.guid || null,
        publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : null,
        payload: {
          author: item.creator || rawItem.author || null,
          rawExcerpt: stripHtml(rawExcerpt),
          rawContent: stripHtml(rawContent),
          contentHashSeed: item.title + rawExcerpt,
          imageUrl,
        },
      }];
    });
  },
  async fetchArticle(job, source) {
    const payload = job.payload_json || {};
    const rssExcerpt = payload.rawExcerpt || '';
    const rssContent = payload.rawContent || '';
    let fullArticle: Awaited<ReturnType<typeof fetchFullArticle>> | null = null;

    try {
      fullArticle = await fetchFullArticle(job.url);
    } catch (err: any) {
      console.warn(`Failed to fetch full RSS article ${job.url}: ${err.message}`);
    }

    const fullContent = fullArticle?.content || '';
    const rawContent = fullContent.length > rssContent.length ? fullContent : rssContent;
    const rawExcerpt = rawContent ? truncate(rawContent, 500) : rssExcerpt;

    return {
      source,
      externalId: job.external_id,
      url: job.url,
      title: fullArticle?.title || job.title,
      author: payload.author || null,
      publishedAt: fullArticle?.publishedAt || job.published_at,
      rawExcerpt,
      rawContent,
      contentHashSeed: `${fullArticle?.title || job.title}${rawContent || rssExcerpt}`,
      imageUrl: fullArticle?.imageUrl || payload.imageUrl || null,
    };
  },
  async fetch(source) {
    const result = { itemsFound: 0, itemsInserted: 0, errors: [] as string[] };

    try {
      const discovered = await rssFetcher.discover!(source);
      result.itemsFound = discovered.length;
      for (const item of discovered) {
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
