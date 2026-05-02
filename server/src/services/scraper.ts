import RssParser from 'rss-parser';
import * as cheerio from 'cheerio';
import { query, getOne, getMany } from '../db/index.js';
import { generateId, createContentHash, normalizeUrl, truncate, sleep } from '../lib/utils.js';

const rssParser = new RssParser({
  timeout: 15000,
  headers: {
    'User-Agent': 'NewsDigest/1.0 (RSS Reader)',
    Accept: 'application/rss+xml, application/xml, text/xml',
  },
});

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

function isRedditUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === 'reddit.com' || hostname === 'www.reddit.com';
  } catch { return false; }
}

function extractSubreddit(url: string): string | null {
  try {
    const match = new URL(url).pathname.match(/^\/r\/([^/]+)/i);
    return match ? match[1] : null;
  } catch { return null; }
}

interface SourceRow {
  id: string;
  type: string;
  name: string;
  url: string;
  language: string;
  category: string | null;
  fetch_interval_minutes: number;
  parser_config: any;
}

interface ScrapeResult {
  itemsFound: number;
  itemsInserted: number;
  errors: string[];
}

// ==========================================
// REDDIT JSON SCRAPER (full content + comments)
// ==========================================
export async function scrapeRedditSource(source: SourceRow): Promise<ScrapeResult> {
  const result: ScrapeResult = { itemsFound: 0, itemsInserted: 0, errors: [] };
  const subreddit = extractSubreddit(source.url);
  if (!subreddit) {
    result.errors.push('Could not extract subreddit name');
    return result;
  }

  try {
    // Use RSS for listing (JSON API blocked on many server IPs)
    const rssUrl = `https://www.reddit.com/r/${subreddit}/hot/.rss`;
    const rssRes = await fetch(rssUrl, {
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!rssRes.ok) {
      throw new Error(`Reddit RSS ${rssRes.status}`);
    }

    const xml = await rssRes.text();
    const feed = await rssParser.parseString(xml);
    const items = feed.items.slice(0, parseInt(process.env.MAX_ARTICLES_PER_SOURCE || '15'));
    result.itemsFound = items.length;

    for (const item of items) {
      if (!item.link || !item.title) continue;

      const url = normalizeUrl(item.link);
      const existing = await getOne('SELECT id FROM articles WHERE url = $1', [url]);
      if (existing) continue;

      // Extract Reddit post path for JSON comments fetch
      const postPath = new URL(item.link).pathname;

      // Build content from RSS + try to get comments via JSON
      const rssContent = item.contentSnippet || item.content || '';
      let fullContent = '';

      if (rssContent) {
        fullContent += `[Nội dung bài viết]\n${stripHtmlBasic(rssContent)}\n\n`;
      }

      // Try fetching comments JSON (may 403)
      try {
        await sleep(1200);
        const commentsUrl = `https://www.reddit.com${postPath}.json?limit=8&sort=best&depth=1`;
        const commentsRes = await fetch(commentsUrl, {
          headers: { 'User-Agent': BROWSER_UA, 'Accept': 'application/json' },
          signal: AbortSignal.timeout(10000),
        });

        if (commentsRes.ok) {
          const commentsData = await commentsRes.json();
          // Extract selftext from post data (richer than RSS)
          const postData = commentsData[0]?.data?.children?.[0]?.data;
          if (postData?.selftext && postData.selftext.length > rssContent.length) {
            fullContent = `[Nội dung bài viết]\n${postData.selftext}\n\n`;
            if (postData.url && !postData.is_self && !postData.url.includes('reddit.com')) {
              fullContent += `[Link chia sẻ]: ${postData.url}\n\n`;
            }
          }

          // Extract top comments
          const comments = commentsData[1]?.data?.children || [];
          const topComments = comments
            .filter((c: any) => c.kind === 't1' && c.data?.body)
            .slice(0, 8);

          if (topComments.length > 0) {
            fullContent += '[Bình luận nổi bật]\n';
            for (const c of topComments) {
              const score = c.data.score || 0;
              const body = c.data.body.substring(0, 500);
              fullContent += `- (${score} điểm) ${body}\n`;
            }
          }
        }
      } catch {
        // JSON blocked, continue with RSS content only
      }

      const contentHash = createContentHash(item.title + fullContent.substring(0, 200));
      const hashExists = await getOne('SELECT id FROM articles WHERE content_hash = $1', [contentHash]);
      if (hashExists) continue;

      const excerpt = truncate(stripHtmlBasic(rssContent) || item.title, 500);

      // Extract image from RSS content HTML
      let imageUrl: string | null = null;
      const rawHtml = item.content || '';
      if (rawHtml) {
        const $ = cheerio.load(rawHtml);
        const imgSrc = $('img').first().attr('src');
        if (imgSrc) imageUrl = imgSrc;
      }

      const id = generateId('art');
      const publishedAt = item.pubDate ? new Date(item.pubDate).toISOString() : null;

      await query(
        `INSERT INTO articles (id, source_id, external_id, url, title, author, published_at,
                               content_type, language, raw_excerpt, raw_content, content_hash,
                               image_url, summary_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'article', $8, $9, $10, $11, $12, 'pending')
         ON CONFLICT (url) DO NOTHING`,
        [
          id, source.id, item.guid || null, url,
          `[r/${subreddit}] ${item.title.trim()}`,
          item.creator || null, publishedAt,
          source.language, excerpt,
          truncate(fullContent || item.title, 30000), contentHash, imageUrl,
        ]
      );
      result.itemsInserted++;
    }
  } catch (err: any) {
    result.errors.push(err.message);
  }

  return result;
}

// ==========================================
// RSS Scraper
// ==========================================
export async function scrapeRssSource(source: SourceRow): Promise<ScrapeResult> {
  const result: ScrapeResult = { itemsFound: 0, itemsInserted: 0, errors: [] };

  try {
    const response = await fetch(source.url, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'application/rss+xml, application/xml, text/xml, application/atom+xml;q=0.9, */*;q=0.8',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) throw new Error(`Status code ${response.status}`);

    const xml = await response.text();
    const feed = await rssParser.parseString(xml);
    const items = feed.items.slice(0, parseInt(process.env.MAX_ARTICLES_PER_SOURCE || '20'));
    result.itemsFound = items.length;

    for (const item of items) {
      if (!item.link || !item.title) continue;

      const url = normalizeUrl(item.link);
      const existing = await getOne('SELECT id FROM articles WHERE url = $1', [url]);
      if (existing) continue;

      const rawExcerpt = item.contentSnippet || item.content || '';
      const rawContent = item.content || item['content:encoded'] || '';
      const contentHash = createContentHash(item.title + rawExcerpt);

      const hashExists = await getOne('SELECT id FROM articles WHERE content_hash = $1', [contentHash]);
      if (hashExists) continue;

      const id = generateId('art');
      const publishedAt = item.pubDate ? new Date(item.pubDate).toISOString() : null;

      let imageUrl: string | null = null;
      if (item.enclosure?.url) {
        imageUrl = item.enclosure.url;
      } else if (rawContent) {
        const $ = cheerio.load(rawContent);
        imageUrl = $('img').first().attr('src') || null;
      }

      await query(
        `INSERT INTO articles (id, source_id, external_id, url, title, author, published_at,
                               content_type, language, raw_excerpt, raw_content, content_hash,
                               image_url, summary_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'article', $8, $9, $10, $11, $12, 'pending')
         ON CONFLICT (url) DO NOTHING`,
        [
          id, source.id, item.guid || null, url, item.title.trim(),
          item.creator || item.author || null, publishedAt,
          source.language, truncate(stripHtml(rawExcerpt), 500),
          truncate(stripHtml(rawContent), 30000), contentHash, imageUrl,
        ]
      );
      result.itemsInserted++;
    }
  } catch (err: any) {
    result.errors.push(err.message);
  }

  return result;
}

// ==========================================
// Web Scraper
// ==========================================
export async function scrapeWebSource(source: SourceRow): Promise<ScrapeResult> {
  const result: ScrapeResult = { itemsFound: 0, itemsInserted: 0, errors: [] };
  const config = source.parser_config;

  if (!config || !config.articleLinkSelector) {
    result.errors.push('parser_config with articleLinkSelector is required for web sources');
    return result;
  }

  try {
    const response = await fetch(source.url, {
      headers: { 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(15000),
    });
    const html = await response.text();
    const $ = cheerio.load(html);

    const links: string[] = [];
    $(config.articleLinkSelector).each((_: number, el: any) => {
      const href = $(el).attr('href');
      if (href) {
        try {
          const absoluteUrl = new URL(href, source.url).toString();
          links.push(normalizeUrl(absoluteUrl));
        } catch { /* skip invalid */ }
      }
    });

    const maxArticles = parseInt(process.env.MAX_ARTICLES_PER_SOURCE || '20');
    const uniqueLinks = [...new Set(links)].slice(0, maxArticles);
    result.itemsFound = uniqueLinks.length;

    for (const articleUrl of uniqueLinks) {
      const existing = await getOne('SELECT id FROM articles WHERE url = $1', [articleUrl]);
      if (existing) continue;

      try {
        await sleep(500);
        const articleRes = await fetch(articleUrl, {
          headers: { 'User-Agent': BROWSER_UA },
          signal: AbortSignal.timeout(15000),
        });
        const articleHtml = await articleRes.text();
        const $article = cheerio.load(articleHtml);

        if (config.removeSelectors) {
          for (const sel of config.removeSelectors) $article(sel).remove();
        }

        const title = $article(config.titleSelector || 'h1').first().text().trim();
        if (!title) continue;

        const content = $article(config.contentSelector || 'article').text().trim();
        const excerpt = truncate(content, 500);
        const contentHash = createContentHash(title + excerpt);

        const hashExists = await getOne('SELECT id FROM articles WHERE content_hash = $1', [contentHash]);
        if (hashExists) continue;

        let imageUrl: string | null = null;
        const imgSrc = $article(config.imageSelector || 'article img, .article img, .content img').first().attr('src');
        if (imgSrc) {
          try { imageUrl = new URL(imgSrc, articleUrl).toString(); } catch {}
        }

        let publishedAt: string | null = null;
        if (config.publishedAtSelector) {
          const dateText = $article(config.publishedAtSelector).attr('datetime') ||
                          $article(config.publishedAtSelector).text().trim();
          if (dateText) {
            try { publishedAt = new Date(dateText).toISOString(); } catch {}
          }
        }

        const id = generateId('art');
        await query(
          `INSERT INTO articles (id, source_id, url, title, published_at, content_type, language,
                                 raw_excerpt, raw_content, content_hash, image_url, summary_status)
           VALUES ($1, $2, $3, $4, $5, 'article', $6, $7, $8, $9, $10, 'pending')
           ON CONFLICT (url) DO NOTHING`,
          [id, source.id, articleUrl, title, publishedAt, source.language,
           excerpt, truncate(content, 30000), contentHash, imageUrl]
        );
        result.itemsInserted++;
      } catch (err: any) {
        result.errors.push(`Failed to fetch ${articleUrl}: ${err.message}`);
      }
    }
  } catch (err: any) {
    result.errors.push(err.message);
  }

  return result;
}

// ==========================================
// Dispatcher
// ==========================================
export async function scrapeSource(source: SourceRow): Promise<ScrapeResult> {
  // Reddit: always use JSON API scraper
  if (isRedditUrl(source.url)) {
    return scrapeRedditSource(source);
  }

  switch (source.type) {
    case 'rss':
      return scrapeRssSource(source);
    case 'web':
      return scrapeWebSource(source);
    default:
      return { itemsFound: 0, itemsInserted: 0, errors: [`Unknown source type: ${source.type}`] };
  }
}

// ==========================================
// Helper
// ==========================================
function stripHtml(html: string): string {
  return cheerio.load(html).text().replace(/\s+/g, ' ').trim();
}

function stripHtmlBasic(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
