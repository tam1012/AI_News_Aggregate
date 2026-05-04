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
  async fetch(source) {
    const result = { itemsFound: 0, itemsInserted: 0, errors: [] as string[] };

    try {
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
      result.itemsFound = items.length;

      for (const item of items) {
        if (!item.link || !item.title) continue;

        const url = normalizePublicHttpUrl(item.link);
        if (!url) continue;

        const rawExcerpt = item.contentSnippet || item.content || '';
        const rawContent = item.content || item['content:encoded'] || '';

        let imageUrl: string | null = null;
        if (item.enclosure?.url) {
          imageUrl = item.enclosure.url;
        } else if (rawContent) {
          const $ = cheerio.load(rawContent);
          imageUrl = $('img').first().attr('src') || null;
        }

        const inserted = await insertArticleIfNew({
          source,
          externalId: item.guid || null,
          url,
          title: item.title.trim(),
          author: item.creator || item.author || null,
          publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : null,
          rawExcerpt: stripHtml(rawExcerpt),
          rawContent: stripHtml(rawContent),
          contentHashSeed: item.title + rawExcerpt,
          imageUrl,
        });
        if (inserted) result.itemsInserted++;
      }
    } catch (err: any) {
      result.errors.push(err.message);
    }

    return result;
  },
};
