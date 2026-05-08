import * as cheerio from 'cheerio';
import { normalizePublicHttpUrl, truncate, sleep } from '../../lib/utils.js';
import { matchPromoKeyword } from '../../lib/promoFilter.js';
import { BROWSER_UA } from './http-utils.js';
import { insertArticleIfNew } from './article-writer.js';
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

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getMetaContent($: cheerio.CheerioAPI, selector: string): string {
  return $(selector).first().attr('content')?.trim() || '';
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
        return { extraction, matchedSelector: extraction.matchedSelector, sourceProfileId: cached.id };
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
    return { extraction: learned.extraction, matchedSelector: learned.extraction.matchedSelector, sourceProfileId: saved.id };
  } catch (err: any) {
    console.warn(`Failed to learn selector profile for ${domain}: ${err.message}`);
    return null;
  }
}

export const htmlFetcher: SourceFetcher = {
  key: 'html',
  canHandle: (source) => source.type === 'web',
  async discover(source) {
    const config = source.parser_config;
    if (!config || !config.articleLinkSelector) {
      throw new Error('parser_config with articleLinkSelector is required for web sources');
    }

    const sourceUrl = normalizePublicHttpUrl(source.url);
    if (!sourceUrl) throw new Error('Source URL must be a public http(s) URL');

    const response = await fetch(sourceUrl, {
      headers: { 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Status code ${response.status}`);
    const html = await response.text();
    const $ = cheerio.load(html);

    const discovered: { sourceId: string; url: string; title: string }[] = [];
    $(config.articleLinkSelector).each((_: number, el: any) => {
      const href = $(el).attr('href');
      if (!href) return;
      try {
        const publicUrl = normalizePublicHttpUrl(new URL(href, sourceUrl).toString());
        if (!publicUrl) return;
        const title = $(el).text().replace(/\s+/g, ' ').trim() || publicUrl;
        discovered.push({ sourceId: source.id, url: publicUrl, title });
      } catch {}
    });

    const seen = new Set<string>();
    return discovered
      .filter((item) => {
        if (seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
      })
      .slice(0, parsePositiveInt(process.env.MAX_ARTICLES_PER_SOURCE, 20));
  },
  async fetchArticle(job, source) {
    const config = source.parser_config;
    if (!config || !config.articleLinkSelector) {
      throw new Error('parser_config with articleLinkSelector is required for web sources');
    }

    await sleep(500);
    const articleRes = await fetch(job.url, {
      headers: { 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(15000),
    });
    if (!articleRes.ok) throw new Error(`Status code ${articleRes.status}`);
    const articleHtml = await articleRes.text();
    const aiExtraction = await extractWithAiSelector(articleHtml, job.url);
    if (aiExtraction) {
      const { extraction, matchedSelector, sourceProfileId } = aiExtraction;
      const title = extraction.title || job.title;
      const excerpt = truncate(extraction.content, 500);
      return {
        source,
        url: job.url,
        title,
        publishedAt: extraction.publishedAt || job.published_at,
        rawExcerpt: excerpt,
        rawContent: extraction.content,
        contentHashSeed: title + excerpt,
        imageUrl: extraction.imageUrl,
        metadata: { extractor: 'ai-selector', matchedSelector, sourceProfileId },
      };
    }

    const $article = cheerio.load(articleHtml);

    if (config.removeSelectors) {
      for (const sel of config.removeSelectors) $article(sel).remove();
    }

    const title = $article(config.titleSelector || 'h1').first().text().trim() ||
      getMetaContent($article, 'meta[property="og:title"]') ||
      $article('title').first().text().trim() ||
      job.title;
    if (!title) return null;

    const content = $article(config.contentSelector || 'article').text().replace(/\s+/g, ' ').trim();
    const excerpt = truncate(content, 500);

    let imageUrl: string | null = null;
    const imgSrc = $article(config.imageSelector || 'article img, .article img, .content img').first().attr('src') ||
      getMetaContent($article, 'meta[property="og:image"]') ||
      getMetaContent($article, 'meta[name="twitter:image"]');
    if (imgSrc) {
      try {
        imageUrl = normalizePublicHttpUrl(new URL(imgSrc, job.url).toString());
      } catch {}
    }

    let publishedAt: string | null = job.published_at;
    if (config.publishedAtSelector) {
      const dateText = $article(config.publishedAtSelector).attr('datetime') ||
        $article(config.publishedAtSelector).text().trim();
      if (dateText) {
        try {
          publishedAt = new Date(dateText).toISOString();
        } catch {}
      }
    }

    return {
      source,
      url: job.url,
      title,
      publishedAt,
      rawExcerpt: excerpt,
      rawContent: content,
      contentHashSeed: title + excerpt,
      imageUrl,
    };
  },
  async fetch(source) {
    const result = { itemsFound: 0, itemsInserted: 0, errors: [] as string[], metadata: {} as Record<string, unknown> };
    const config = source.parser_config;

    if (!config || !config.articleLinkSelector) {
      result.errors.push('parser_config with articleLinkSelector is required for web sources');
      return result;
    }

    try {
      const discovered = await htmlFetcher.discover!(source);
      result.itemsFound = discovered.length;

      // Layer 1: keyword promo filter
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
        try {
          const articleInput = await htmlFetcher.fetchArticle!({
            id: '',
            source_id: source.id,
            url: item.url,
            title: item.title,
            external_id: null,
            published_at: null,
            payload_json: null,
          }, source);
          if (!articleInput) continue;
          const inserted = await insertArticleIfNew({
            ...articleInput,
          });
          if (inserted) result.itemsInserted++;
        } catch (err: any) {
          result.errors.push(`Failed to fetch ${item.url}: ${err.message}`);
        }
      }
    } catch (err: any) {
      result.errors.push(err.message);
    }

    return result;
  },
};
