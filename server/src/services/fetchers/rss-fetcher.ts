import RssParser from 'rss-parser';
import * as cheerio from 'cheerio';
import { normalizePublicHttpUrl } from '../../lib/utils.js';
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
  return cheerio.load(html).text().replace(/\s+/g, ' ').trim();
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
    const feed = await rssParser.parseString(xml);
    const items = feed.items.slice(0, parsePositiveInt(process.env.MAX_ARTICLES_PER_SOURCE, 20));

    return items.flatMap((item) => {
      if (!item.link || !item.title) return [];
      const url = normalizePublicHttpUrl(item.link);
      if (!url) return [];

      const rawExcerpt = item.contentSnippet || item.content || '';
      const rawContent = item.content || item['content:encoded'] || '';
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
          author: item.creator || item.author || null,
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
    return {
      source,
      externalId: job.external_id,
      url: job.url,
      title: job.title,
      author: payload.author || null,
      publishedAt: job.published_at,
      rawExcerpt: payload.rawExcerpt || '',
      rawContent: payload.rawContent || '',
      contentHashSeed: payload.contentHashSeed || job.title,
      imageUrl: payload.imageUrl || null,
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
