import * as cheerio from 'cheerio';
import { normalizePublicHttpUrl } from '../../lib/utils.js';

export interface ForumComment {
  author: string;
  body: string;
  reactions: number;
  page: number;
  order: number;
  score: number;
}

export interface VozPost {
  author: string;
  body: string;
  reactions: number;
  isOp: boolean;
  page: number;
  order: number;
}

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function dedupeTextKey(text: string): string {
  return normalizeWhitespace(text).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').trim();
}

export function scoreForumComment(body: string, reactions: number, page: number, order: number): number {
  const lengthBonus = Math.min(body.length / 140, 4);
  const reactionBonus = Math.min(reactions, 50) * 0.35;
  const earlyThreadBonus = page === 1 ? 1.2 : 0;
  const earlyReplyBonus = order < 8 ? 0.6 : 0;
  return reactionBonus + lengthBonus + earlyThreadBonus + earlyReplyBonus;
}

export function selectForumComments(comments: ForumComment[], maxComments: number): ForumComment[] {
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

export function hasMinimumForumDiscussion(commentCount: number, minComments = 10): boolean {
  return commentCount >= minComments;
}

export function shouldInsertForumArticle(kind: 'reddit' | 'voz', commentCount: number, minComments = 10): boolean {
  if (kind === 'reddit') return true;
  return hasMinimumForumDiscussion(commentCount, minComments);
}

export function parseVozPosts(html: string, page: number): VozPost[] {
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

export function extractVozPagination(html: string, threadUrl: string): string[] {
  const $ = cheerio.load(html);
  const urls = new Set<string>();

  $('.pageNav-page').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    try {
      const publicUrl = normalizePublicHttpUrl(new URL(href, threadUrl).toString());
      if (publicUrl) urls.add(publicUrl);
    } catch {}
  });

  return [...urls];
}

export function buildVozRawContent(posts: VozPost[], selectedComments: ForumComment[], pagesFetched: number, totalCommentsSeen: number): string {
  if (posts.length === 0) return '';

  const opPost = posts.find((post) => post.isOp) || posts[0];
  let fullContent = `[Noi dung bai viet goc - boi ${opPost.author}]\n${opPost.body}\n\n`;
  fullContent += `[Du lieu thread VOZ]\n- Da doc ${pagesFetched} trang thread\n- Da trich ${totalCommentsSeen} binh luan thanh vien\n- Da chon ${selectedComments.length} binh luan tieu bieu cho AI\n\n`;

  if (selectedComments.length > 0) {
    fullContent += '[Binh luan thanh vien noi bat nhieu trang]\n';
    for (const comment of selectedComments) {
      const reactionLabel = comment.reactions > 0 ? ` | ${comment.reactions} reactions` : '';
      fullContent += `- Trang ${comment.page}${reactionLabel} | ${comment.author}: ${comment.body}\n`;
    }
  } else {
    fullContent += '[Chua co binh luan thanh vien du du lieu de tong hop]\n';
  }

  return fullContent;
}

export function flattenRedditComments(nodes: any[], depth: number, maxDepth: number, bucket: ForumComment[]) {
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

export function buildRedditRawContent(postContent: string, linkUrl: string | null, selectedComments: ForumComment[], totalCommentsSeen: number): string {
  let fullContent = `[Noi dung bai viet]\n${postContent}\n\n`;
  if (linkUrl) {
    fullContent += `[Link chia se]: ${linkUrl}\n\n`;
  }

  fullContent += `[Du lieu thao luan Reddit]\n- Da trich ${totalCommentsSeen} comment/reply\n- Da chon ${selectedComments.length} comment tieu bieu cho AI\n\n`;

  if (selectedComments.length > 0) {
    fullContent += '[Binh luan cong dong]\n';
    for (const comment of selectedComments) {
      const scoreLabel = comment.reactions > 0 ? `(${comment.reactions} diem)` : '(0 diem)';
      const depthLabel = comment.page > 1 ? ` [reply depth ${comment.page}]` : '';
      fullContent += `- ${scoreLabel}${depthLabel} ${comment.author}: ${comment.body}\n`;
    }
  }

  return fullContent;
}
