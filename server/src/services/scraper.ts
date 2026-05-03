import RssParser from 'rss-parser';
import * as cheerio from 'cheerio';
import { exec } from 'child_process';
import puppeteer from 'puppeteer-core';
import { query, getOne } from '../db/index.js';
import { generateId, createContentHash, normalizeUrl, truncate, sleep } from '../lib/utils.js';

const rssParser = new RssParser({
  timeout: 15000,
  headers: {
    'User-Agent': 'NewsDigest/1.0 (RSS Reader)',
    Accept: 'application/rss+xml, application/xml, text/xml',
  },
});

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const FORUM_RAW_CONTENT_MAX_LENGTH = parseInt(process.env.FORUM_RAW_CONTENT_MAX_LENGTH || '60000');
const FORUM_MAX_COMMENTS = parseInt(process.env.FORUM_MAX_COMMENTS || '50');
const VOZ_MAX_THREAD_PAGES = parseInt(process.env.VOZ_MAX_THREAD_PAGES || '10');
const REDDIT_COMMENT_LIMIT = parseInt(process.env.REDDIT_COMMENT_LIMIT || '30');
const REDDIT_COMMENT_DEPTH = parseInt(process.env.REDDIT_COMMENT_DEPTH || '3');

// Reddit OAuth
const REDDIT_CLIENT_ID = process.env.REDDIT_CLIENT_ID || '';
const REDDIT_CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET || '';
const REDDIT_USERNAME = process.env.REDDIT_USERNAME || '';
const REDDIT_PASSWORD = process.env.REDDIT_PASSWORD || '';
const REDDIT_PROXY_URL = process.env.REDDIT_PROXY_URL || '';
let redditToken: { access_token: string; expires_at: number } | null = null;

function hasRedditOAuth(): boolean {
  return !!(REDDIT_CLIENT_ID && REDDIT_CLIENT_SECRET && REDDIT_USERNAME && REDDIT_PASSWORD);
}

async function getRedditToken(): Promise<string | null> {
  if (!hasRedditOAuth()) return null;
  if (redditToken && Date.now() < redditToken.expires_at) return redditToken.access_token;

  return new Promise((resolve) => {
    const cmd = `curl -s -X POST -H "User-Agent: newstamhv/1.0" -u "${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}" -d "grant_type=password&username=${encodeURIComponent(REDDIT_USERNAME)}&password=${encodeURIComponent(REDDIT_PASSWORD)}" "https://www.reddit.com/api/v1/access_token"`;
    exec(cmd, { timeout: 15000 }, (err, stdout) => {
      if (err) { console.error('Reddit OAuth error:', err.message); resolve(null); return; }
      try {
        const data = JSON.parse(stdout);
        if (data.access_token) {
          redditToken = { access_token: data.access_token, expires_at: Date.now() + (data.expires_in - 60) * 1000 };
          resolve(data.access_token);
        } else {
          console.error('Reddit OAuth: no token in response', stdout.substring(0, 200));
          resolve(null);
        }
      } catch (e) {
        console.error('Reddit OAuth parse error:', stdout.substring(0, 200));
        resolve(null);
      }
    });
  });
}

async function redditApiFetch(path: string): Promise<any | null> {
  const token = await getRedditToken();
  if (!token) return null;

  return new Promise((resolve) => {
    const url = `https://oauth.reddit.com${path}`;
    const cmd = `curl -s -L --max-time 15 -H "User-Agent: newstamhv/1.0" -H "Authorization: Bearer ${token}" "${url}"`;
    exec(cmd, { timeout: 20000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) { console.error('Reddit API error:', err.message); resolve(null); return; }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        console.error('Reddit API: invalid JSON', stdout.substring(0, 200));
        resolve(null);
      }
    });
  });
}

function isRedditUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === 'reddit.com' || hostname === 'www.reddit.com';
  } catch {
    return false;
  }
}

function isVozUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === 'voz.vn' || hostname === 'www.voz.vn';
  } catch {
    return false;
  }
}

function extractSubreddit(url: string): string | null {
  try {
    const match = new URL(url).pathname.match(/^\/r\/([^/]+)/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
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

interface ForumComment {
  author: string;
  body: string;
  reactions: number;
  page: number;
  order: number;
  score: number;
}

interface VozPost {
  author: string;
  body: string;
  reactions: number;
  isOp: boolean;
  page: number;
  order: number;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function dedupeTextKey(text: string): string {
  return normalizeWhitespace(text).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').trim();
}

function scoreForumComment(body: string, reactions: number, page: number, order: number): number {
  const lengthBonus = Math.min(body.length / 140, 4);
  const reactionBonus = Math.min(reactions, 50) * 0.35;
  const earlyThreadBonus = page === 1 ? 1.2 : 0;
  const earlyReplyBonus = order < 8 ? 0.6 : 0;
  return reactionBonus + lengthBonus + earlyThreadBonus + earlyReplyBonus;
}

function selectForumComments(comments: ForumComment[], maxComments: number): ForumComment[] {
  const seen = new Set<string>();
  const unique = comments.filter((comment) => {
    const key = dedupeTextKey(comment.body);
    if (!key || key.length < 12 || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.reactions !== a.reactions) return b.reactions - a.reactions;
      if (a.page !== b.page) return a.page - b.page;
      return a.order - b.order;
    })
    .slice(0, maxComments)
    .sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page;
      return a.order - b.order;
    });
}

// Use curl to bypass Cloudflare TLS fingerprinting that blocks Node.js fetch()
function curlFetch(url: string, accept: string, timeoutSec: number): Promise<{ ok: boolean; status: number; text: () => Promise<string>; json: () => Promise<any> }> {
  return new Promise((resolve, reject) => {
    const cmd = `curl -s -L --max-time ${timeoutSec} -H "User-Agent: ${BROWSER_UA}" -H "Accept: ${accept}" -H "Accept-Language: vi-VN,vi;q=0.9,en;q=0.8" "${url}"`;
    exec(cmd, { timeout: (timeoutSec + 2) * 1000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) {
        reject(err);
        return;
      }
      const body = stdout || '';
      // Detect Cloudflare challenge or blocked pages
      const isBlocked = body.includes('Just a moment...') || body.includes('<title>Blocked</title>');
      resolve({
        ok: !isBlocked && body.length > 100,
        status: isBlocked ? 403 : 200,
        text: async () => body,
        json: async () => JSON.parse(body),
      });
    });
  });
}

// Headless browser for sites that block curl/fetch (Reddit)
let browserInstance: any = null;

async function getBrowser(): Promise<any> {
  if (browserInstance && browserInstance.connected) return browserInstance;
  browserInstance = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
    headless: true,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1920,1080',
    ],
  });
  return browserInstance;
}

async function browserFetch(url: string, timeoutMs: number = 30000, rawText: boolean = false): Promise<string> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // Anti-detection: remove webdriver flag, set realistic properties
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      (window as any).chrome = { runtime: {} };
    });
    await page.setUserAgent(BROWSER_UA);
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: timeoutMs });

    // Try to dismiss Reddit cookie/consent wall if present
    try {
      const acceptBtn = await page.$('button[aria-label="Accept all cookies"], button:has-text("Accept")');
      if (acceptBtn) await acceptBtn.click();
      await new Promise(r => setTimeout(r, 500));
    } catch {}

    if (rawText) {
      // For JSON endpoints: get raw text from body, not HTML wrapper
      return await page.evaluate(() => document.body?.innerText || document.documentElement?.textContent || '');
    }
    return await page.content();
  } finally {
    await page.close();
  }
}

function parseVozPosts(html: string, page: number): VozPost[] {
  const $ = cheerio.load(html);
  const posts: VozPost[] = [];

  $('article.message--post').each((idx, el) => {
    const author = $(el).find('.message-name .username, .message-name a').first().text().trim() || 'unknown';
    const bodyEl = $(el).find('.message-body .bbWrapper').first().clone();
    bodyEl.find('.bbCodeBlock--quote, .toggleTriggerAnchor').remove();
    bodyEl.find('iframe, video, .bbMediaWrapper, script, style').remove();

    const body = normalizeWhitespace(bodyEl.text());
    let reactions = 0;
    const reactText = $(el).find('.reactionsBar-link').text().trim();
    const numMatch = reactText.match(/(\d+)/);
    if (numMatch) reactions = parseInt(numMatch[1], 10);

    if (body && body.length > 10) {
      posts.push({
        author,
        body: body.substring(0, 1200),
        reactions,
        isOp: idx === 0 && page === 1,
        page,
        order: idx,
      });
    }
  });

  return posts;
}

function extractVozPagination(html: string, threadUrl: string): string[] {
  const $ = cheerio.load(html);
  const urls = new Set<string>();

  $('.pageNav-page').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    try {
      urls.add(normalizeUrl(new URL(href, threadUrl).toString()));
    } catch {}
  });

  return [...urls];
}

function buildVozRawContent(posts: VozPost[], selectedComments: ForumComment[], pagesFetched: number, totalCommentsSeen: number): string {
  if (posts.length === 0) return '';

  const opPost = posts.find((post) => post.isOp) || posts[0];
  let fullContent = `[Nội dung bài viết gốc - bởi ${opPost.author}]\n${opPost.body}\n\n`;
  fullContent += `[Dữ liệu thread VOZ]\n- Đã đọc ${pagesFetched} trang thread\n- Đã trích ${totalCommentsSeen} bình luận thành viên\n- Đã chọn ${selectedComments.length} bình luận tiêu biểu cho AI\n\n`;

  if (selectedComments.length > 0) {
    fullContent += '[Bình luận thành viên nổi bật nhiều trang]\n';
    for (const comment of selectedComments) {
      const reactionLabel = comment.reactions > 0 ? ` | ${comment.reactions} reactions` : '';
      fullContent += `- Trang ${comment.page}${reactionLabel} | ${comment.author}: ${comment.body}\n`;
    }
  } else {
    fullContent += '[Chưa có bình luận thành viên đủ dữ liệu để tổng hợp]\n';
  }

  return fullContent;
}

function flattenRedditComments(nodes: any[], depth: number, maxDepth: number, bucket: ForumComment[]) {
  if (!Array.isArray(nodes) || depth > maxDepth) return;

  for (const node of nodes) {
    if (node?.kind !== 't1' || !node.data?.body) continue;
    const body = normalizeWhitespace(node.data.body || '');
    if (!body || body === '[deleted]' || body === '[removed]') continue;

    const score = node.data.score || 0;
    const comment: ForumComment = {
      author: node.data.author || 'unknown',
      body: body.substring(0, 900),
      reactions: score,
      page: depth,
      order: bucket.length,
      score: scoreForumComment(body, score, depth, bucket.length + 1) + (depth === 1 ? 0.8 : 0.2),
    };
    bucket.push(comment);

    const replies = node.data.replies?.data?.children;
    if (Array.isArray(replies)) {
      flattenRedditComments(replies, depth + 1, maxDepth, bucket);
    }
  }
}

function buildRedditRawContent(postContent: string, linkUrl: string | null, selectedComments: ForumComment[], totalCommentsSeen: number): string {
  let fullContent = `[Nội dung bài viết]\n${postContent}\n\n`;
  if (linkUrl) {
    fullContent += `[Link chia sẻ]: ${linkUrl}\n\n`;
  }

  fullContent += `[Dữ liệu thảo luận Reddit]\n- Đã trích ${totalCommentsSeen} comment/reply\n- Đã chọn ${selectedComments.length} comment tiêu biểu cho AI\n\n`;

  if (selectedComments.length > 0) {
    fullContent += '[Bình luận cộng đồng]\n';
    for (const comment of selectedComments) {
      const scoreLabel = comment.reactions > 0 ? `(${comment.reactions} điểm)` : '(0 điểm)';
      const depthLabel = comment.page > 1 ? ` [reply depth ${comment.page}]` : '';
      fullContent += `- ${scoreLabel}${depthLabel} ${comment.author}: ${comment.body}\n`;
    }
  }

  return fullContent;
}

export async function scrapeRedditSource(source: SourceRow): Promise<ScrapeResult> {
  const result: ScrapeResult = { itemsFound: 0, itemsInserted: 0, errors: [] };
  const subreddit = extractSubreddit(source.url);
  if (!subreddit) {
    result.errors.push('Could not extract subreddit name');
    return result;
  }

  try {
    const rssUrl = `https://www.reddit.com/r/${subreddit}/hot/.rss`;
    const rssRes = await fetch(rssUrl, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'application/rss+xml, application/xml, text/xml',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!rssRes.ok) {
      throw new Error(`Reddit RSS ${rssRes.status}`);
    }

    const xml = await rssRes.text();
    const feed = await rssParser.parseString(xml);
    const items = feed.items.slice(0, parsePositiveInt(process.env.MAX_ARTICLES_PER_SOURCE, 15));
    result.itemsFound = items.length;

    let enrichedCount = 0;
    const MAX_ENRICH_PER_RUN = 8;

    for (const item of items) {
      if (!item.link || !item.title) continue;

      const url = normalizeUrl(item.link);
      const existing = await getOne('SELECT id FROM articles WHERE url = $1', [url]);
      if (existing) continue;

      const postPath = new URL(item.link).pathname;
      const rssContent = item.contentSnippet || item.content || '';
      let postContent = stripHtmlBasic(rssContent) || item.title;
      let outboundUrl: string | null = null;
      let discussionComments: ForumComment[] = [];

      try {
        await sleep(1200);
        const postId = postPath.match(/\/comments\/([a-z0-9]+)/)?.[1];

        if (hasRedditOAuth()) {
          // Use OAuth API for full comment access
          const commentsData = await redditApiFetch(`${postPath}.json?limit=${REDDIT_COMMENT_LIMIT}&sort=best&depth=${REDDIT_COMMENT_DEPTH}`);
          if (commentsData) {
            const postData = commentsData[0]?.data?.children?.[0]?.data;
            if (postData?.selftext && postData.selftext.length > postContent.length) {
              postContent = normalizeWhitespace(postData.selftext);
            }
            if (postData?.url && !postData.is_self && !String(postData.url).includes('reddit.com')) {
              outboundUrl = String(postData.url);
            }
            const comments = commentsData[1]?.data?.children || [];
            const flattened: ForumComment[] = [];
            flattenRedditComments(comments, 1, REDDIT_COMMENT_DEPTH, flattened);
            discussionComments = selectForumComments(flattened, REDDIT_COMMENT_LIMIT);
          }
        } else if (enrichedCount < MAX_ENRICH_PER_RUN) {
          enrichedCount++;

          // Strategy 1: Cloudflare Worker proxy (real-time Reddit API access)
          if (REDDIT_PROXY_URL) {
            try {
              const proxyUrl = `${REDDIT_PROXY_URL}?path=${encodeURIComponent(postPath + '.json')}&limit=${REDDIT_COMMENT_LIMIT}&sort=best&depth=${REDDIT_COMMENT_DEPTH}`;
              const proxyRes = await curlFetch(proxyUrl, 'application/json', 15);
              if (proxyRes.ok) {
                const commentsData = await proxyRes.json();
                if (Array.isArray(commentsData)) {
                  const postData = commentsData[0]?.data?.children?.[0]?.data;
                  if (postData?.selftext && postData.selftext.length > postContent.length) {
                    postContent = normalizeWhitespace(postData.selftext);
                  }
                  if (postData?.url && !postData.is_self && !String(postData.url).includes('reddit.com')) {
                    outboundUrl = String(postData.url);
                  }
                  const comments = commentsData[1]?.data?.children || [];
                  const flattened: ForumComment[] = [];
                  flattenRedditComments(comments, 1, REDDIT_COMMENT_DEPTH, flattened);
                  discussionComments = selectForumComments(flattened, REDDIT_COMMENT_LIMIT);
                  if (discussionComments.length > 0) {
                    console.log(`[reddit] Proxy: got ${discussionComments.length} comments for ${postPath}`);
                  }
                }
              }
            } catch (e: any) {
              console.log(`[reddit] Proxy failed for ${postPath}: ${e.message}`);
            }
          }

          // Strategy 2: Pullpush archive API (fallback, data may be stale)
          if (discussionComments.length === 0 && postId) {
            try {
              const pullpushUrl = `https://api.pullpush.io/reddit/comment/search?link_id=${postId}&size=${REDDIT_COMMENT_LIMIT}&sort=score&sort_type=score`;
              const pullpushRes = await curlFetch(pullpushUrl, 'application/json', 10);
              if (pullpushRes.ok) {
                const pullpushData = await pullpushRes.json();
                const pullpushComments: ForumComment[] = (pullpushData.data || [])
                  .filter((c: any) => c.body && c.body !== '[deleted]' && c.body !== '[removed]' && c.body.length > 20)
                  .map((c: any, idx: number) => ({
                    author: c.author || 'unknown',
                    body: c.body.substring(0, 900),
                    reactions: c.score || 0,
                    page: 1,
                    order: idx,
                    score: scoreForumComment(c.body, c.score || 0, 1, idx),
                  }));
                discussionComments = selectForumComments(pullpushComments, REDDIT_COMMENT_LIMIT);
                if (pullpushComments.length > 0) {
                  console.log(`[reddit] Pullpush: got ${pullpushComments.length} comments for ${postPath}`);
                }
              }
            } catch (e: any) {
              console.log(`[reddit] Pullpush failed for ${postPath}: ${e.message}`);
            }
          }
        }
      } catch {
      }

      const fullContent = buildRedditRawContent(postContent, outboundUrl, discussionComments, discussionComments.length);
      const contentHash = createContentHash(item.title + fullContent.substring(0, 300));
      const hashExists = await getOne('SELECT id FROM articles WHERE content_hash = $1', [contentHash]);
      if (hashExists) continue;

      const excerpt = truncate(stripHtmlBasic(rssContent) || item.title, 500);
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
          truncate(fullContent || item.title, FORUM_RAW_CONTENT_MAX_LENGTH), contentHash, imageUrl,
        ]
      );
      result.itemsInserted++;
    }
  } catch (err: any) {
    result.errors.push(err.message);
  }

  return result;
}

export async function scrapeVozSource(source: SourceRow): Promise<ScrapeResult> {
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
    const items = feed.items.slice(0, parsePositiveInt(process.env.MAX_ARTICLES_PER_SOURCE, 15));
    result.itemsFound = items.length;

    for (const item of items) {
      if (!item.link || !item.title) continue;

      const url = normalizeUrl(item.link);
      const existing = await getOne('SELECT id FROM articles WHERE url = $1', [url]);
      if (existing) continue;

      const rawExcerpt = item.contentSnippet || item.content || '';
      const contentHash = createContentHash(item.title + rawExcerpt.substring(0, 200));
      const hashExists = await getOne('SELECT id FROM articles WHERE content_hash = $1', [contentHash]);
      if (hashExists) continue;

      let fullContent = '';
      let imageUrl: string | null = null;

      try {
        const pagesToVisit: string[] = [item.link];
        const visited = new Set<string>();
        const allPosts: VozPost[] = [];

        for (let pageIndex = 0; pageIndex < pagesToVisit.length && pageIndex < VOZ_MAX_THREAD_PAGES; pageIndex++) {
          const pageUrl = normalizeUrl(pagesToVisit[pageIndex]);
          if (visited.has(pageUrl)) continue;
          visited.add(pageUrl);

          await sleep(800);
          const threadRes = await curlFetch(pageUrl, 'text/html,application/xhtml+xml', 15);
          if (!threadRes.ok) throw new Error(`VOZ thread status ${threadRes.status}`);

          const threadHtml = await threadRes.text();
          allPosts.push(...parseVozPosts(threadHtml, pageIndex + 1));

          if (pageIndex === 0) {
            const pageLinks = extractVozPagination(threadHtml, item.link).slice(0, Math.max(0, VOZ_MAX_THREAD_PAGES - 1));
            for (const nextPage of pageLinks) {
              if (!pagesToVisit.includes(nextPage)) pagesToVisit.push(nextPage);
            }

            const $ = cheerio.load(threadHtml);
            imageUrl = $('meta[property="og:image"]').attr('content') || null;
            if (!imageUrl) {
              const firstImg = $('article.message--post').first().find('.message-body img').first().attr('src');
              if (firstImg) {
                try {
                  imageUrl = new URL(firstImg, item.link).toString();
                } catch {}
              }
            }
          }
        }

        if (allPosts.length > 0) {
          const comments = allPosts
            .filter((post) => !post.isOp)
            .map((post) => ({
              author: post.author,
              body: post.body,
              reactions: post.reactions,
              page: post.page,
              order: post.order,
              score: scoreForumComment(post.body, post.reactions, post.page, post.order),
            }));

          const selectedComments = selectForumComments(comments, FORUM_MAX_COMMENTS);
          fullContent = buildVozRawContent(allPosts, selectedComments, visited.size, comments.length);
        }
      } catch (err: any) {
        result.errors.push(`Failed to fetch VOZ thread ${item.link}: ${err.message}`);
      }

      if (!fullContent) {
        fullContent = stripHtml(rawExcerpt) || item.title;
      }

      const id = generateId('art');
      const publishedAt = item.pubDate ? new Date(item.pubDate).toISOString() : null;

      if (!imageUrl) {
        const rawHtmlContent = item.content || '';
        if (rawHtmlContent) {
          const $ = cheerio.load(rawHtmlContent);
          imageUrl = $('img').first().attr('src') || null;
        }
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
          truncate(fullContent, FORUM_RAW_CONTENT_MAX_LENGTH), contentHash, imageUrl,
        ]
      );
      result.itemsInserted++;
    }
  } catch (err: any) {
    result.errors.push(err.message);
  }

  return result;
}

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
    const items = feed.items.slice(0, parsePositiveInt(process.env.MAX_ARTICLES_PER_SOURCE, 20));
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
        } catch {}
      }
    });

    const maxArticles = parsePositiveInt(process.env.MAX_ARTICLES_PER_SOURCE, 20);
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
          try {
            imageUrl = new URL(imgSrc, articleUrl).toString();
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

export async function scrapeSource(source: SourceRow): Promise<ScrapeResult> {
  if (isRedditUrl(source.url)) {
    return scrapeRedditSource(source);
  }

  if (isVozUrl(source.url)) {
    return scrapeVozSource(source);
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

function stripHtml(html: string): string {
  return cheerio.load(html).text().replace(/\s+/g, ' ').trim();
}

function stripHtmlBasic(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
