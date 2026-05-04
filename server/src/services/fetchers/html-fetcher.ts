import * as cheerio from 'cheerio';
import { normalizePublicHttpUrl, truncate, sleep } from '../../lib/utils.js';
import { BROWSER_UA } from './http-utils.js';
import { insertArticleIfNew } from './article-writer.js';
import { SourceFetcher } from './types.js';

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const htmlFetcher: SourceFetcher = {
  key: 'html',
  canHandle: (source) => source.type === 'web',
  async fetch(source) {
    const result = { itemsFound: 0, itemsInserted: 0, errors: [] as string[] };
    const config = source.parser_config;

    if (!config || !config.articleLinkSelector) {
      result.errors.push('parser_config with articleLinkSelector is required for web sources');
      return result;
    }

    try {
      const sourceUrl = normalizePublicHttpUrl(source.url);
      if (!sourceUrl) throw new Error('Source URL must be a public http(s) URL');

      const response = await fetch(sourceUrl, {
        headers: { 'User-Agent': BROWSER_UA },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`Status code ${response.status}`);
      const html = await response.text();
      const $ = cheerio.load(html);

      const links: string[] = [];
      $(config.articleLinkSelector).each((_: number, el: any) => {
        const href = $(el).attr('href');
        if (href) {
          try {
            const publicUrl = normalizePublicHttpUrl(new URL(href, sourceUrl).toString());
            if (publicUrl) links.push(publicUrl);
          } catch {}
        }
      });

      const uniqueLinks = [...new Set(links)].slice(0, parsePositiveInt(process.env.MAX_ARTICLES_PER_SOURCE, 20));
      result.itemsFound = uniqueLinks.length;

      for (const articleUrl of uniqueLinks) {
        try {
          await sleep(500);
          const articleRes = await fetch(articleUrl, {
            headers: { 'User-Agent': BROWSER_UA },
            signal: AbortSignal.timeout(15000),
          });
          if (!articleRes.ok) throw new Error(`Status code ${articleRes.status}`);
          const articleHtml = await articleRes.text();
          const $article = cheerio.load(articleHtml);

          if (config.removeSelectors) {
            for (const sel of config.removeSelectors) $article(sel).remove();
          }

          const title = $article(config.titleSelector || 'h1').first().text().trim();
          if (!title) continue;

          const content = $article(config.contentSelector || 'article').text().trim();
          const excerpt = truncate(content, 500);

          let imageUrl: string | null = null;
          const imgSrc = $article(config.imageSelector || 'article img, .article img, .content img').first().attr('src');
          if (imgSrc) {
            try {
              imageUrl = normalizePublicHttpUrl(new URL(imgSrc, articleUrl).toString());
            } catch {}
          }

          let publishedAt: string | null = null;
          if (config.publishedAtSelector) {
            const dateText = $article(config.publishedAtSelector).attr('datetime') ||
              $article(config.publishedAtSelector).text().trim();
            if (dateText) {
              try {
                publishedAt = new Date(dateText).toISOString();
              } catch {}
            }
          }

          const inserted = await insertArticleIfNew({
            source,
            url: articleUrl,
            title,
            publishedAt,
            rawExcerpt: excerpt,
            rawContent: content,
            contentHashSeed: title + excerpt,
            imageUrl,
          });
          if (inserted) result.itemsInserted++;
        } catch (err: any) {
          result.errors.push(`Failed to fetch ${articleUrl}: ${err.message}`);
        }
      }
    } catch (err: any) {
      result.errors.push(err.message);
    }

    return result;
  },
};
