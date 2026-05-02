import { query, getOne, getMany } from '../db/index.js';
import { generateId, truncate } from '../lib/utils.js';
import { callAi } from './ai-client.js';

interface ArticleForSummary {
  id: string;
  title: string;
  raw_excerpt: string;
  raw_content: string;
  language: string;
  source_name: string;
}

// Tóm tắt 1 article — output có cấu trúc markdown
export async function summarizeArticle(article: ArticleForSummary): Promise<string | null> {
  const content = article.raw_content || article.raw_excerpt || '';
  
  const isReddit = article.source_name?.toLowerCase().includes('reddit') ||
                   article.title?.startsWith('[r/');

  // For normal news, skip if too short. For Reddit, titles alone might be worth showing.
  if (!isReddit && content.length < 80) return null;

  const prompt = isReddit
    ? buildRedditPrompt(article, content)
    : buildNewsPrompt(article, content);

  try {
    const result = await callAi(prompt);
    return result.trim();
  } catch (err: any) {
    console.error(`Failed to summarize article ${article.id}:`, err.message);
    throw err;
  }
}

function buildNewsPrompt(article: ArticleForSummary, content: string): string {
  return `Bạn là biên tập viên tin tức cấp cao, viết tóm tắt có cấu trúc cho app đọc tin.

NHIỆM VỤ: Tóm tắt bài viết sau bằng tiếng Việt, format markdown.

ĐỊNH DẠNG BẮT BUỘC (chỉ trả về đúng nội dung, không thêm bất kỳ lời giải thích nào):

**Tổng quan:** 1-2 câu nêu ngay sự kiện chính, kết luận hoặc phát hiện quan trọng nhất.

**Điểm nổi bật:**
- Chi tiết quan trọng #1 (kèm số liệu/tên/ngày cụ thể nếu có)
- Chi tiết quan trọng #2
- Chi tiết quan trọng #3
- (thêm nếu cần, tối đa 5 điểm)

**Bối cảnh:** 1 câu về ý nghĩa hoặc tác động rộng hơn (nếu phù hợp).

QUY TẮC:
- Giữ nguyên tên riêng, con số, phát biểu quan trọng.
- Không dùng "bài viết nói về", "theo nguồn tin", "nội dung đề cập".
- Không bịa thêm thông tin ngoài nội dung nguồn.
- Viết tự nhiên, súc tích, giàu thông tin.

Tiêu đề: ${article.title}
Nguồn: ${article.source_name}
Ngôn ngữ gốc: ${article.language || 'không rõ'}

Nội dung:
${truncate(content, 10000)}`;
}

function buildRedditPrompt(article: ArticleForSummary, content: string): string {
  return `Bạn là biên tập viên chuyên tổng hợp thảo luận từ Reddit, viết cho app đọc tin tiếng Việt.

NHIỆM VỤ: Tổng hợp bài viết và các bình luận Reddit sau bằng tiếng Việt, format markdown.

ĐỊNH DẠNG BẮT BUỘC:

**Chủ đề:** 1-2 câu mô tả nội dung bài viết gốc.

**Ý kiến cộng đồng:**
- Quan điểm/ý kiến nổi bật #1 (được upvote cao)
- Quan điểm/ý kiến nổi bật #2
- Quan điểm/ý kiến nổi bật #3

**Tóm lại:** 1 câu kết luận tổng quan về xu hướng ý kiến hoặc insight đáng chú ý nhất.

QUY TẮC:
- Tổng hợp CẢ nội dung bài viết VÀ bình luận, không chỉ tiêu đề.
- Ưu tiên bình luận có nhiều upvote, có insight thú vị.
- Nếu có tranh luận, thể hiện cả hai phía.
- Viết tự nhiên, dùng thuật ngữ phù hợp cộng đồng.
- Không bịa thêm, không suy diễn quá xa.

Tiêu đề: ${article.title}
Nguồn: ${article.source_name}

Nội dung + Bình luận:
${truncate(content, 12000)}`;
}

// Tóm tắt hàng loạt articles chưa có summary
export async function summarizePendingArticles(): Promise<{ processed: number; succeeded: number; failed: number }> {
  const maxCalls = parseInt(process.env.MAX_AI_CALLS_PER_RUN || '30');

  const pendingArticles = await getMany<ArticleForSummary>(
    `SELECT a.id, a.title, a.raw_excerpt, a.raw_content, a.language,
            s.name as source_name
     FROM articles a
     LEFT JOIN sources s ON s.id = a.source_id
     WHERE a.summary_status = 'pending'
     ORDER BY a.created_at DESC
     LIMIT $1`,
    [maxCalls]
  );

  let succeeded = 0;
  let failed = 0;

  for (const article of pendingArticles) {
    await query('UPDATE articles SET summary_status = $1 WHERE id = $2', ['processing', article.id]);

    try {
      const summary = await summarizeArticle(article);
      if (summary) {
        await query(
          'UPDATE articles SET summary_text = $1, summary_status = $2 WHERE id = $3',
          [summary, 'done', article.id]
        );
        succeeded++;
      } else {
        await query('UPDATE articles SET summary_status = $1 WHERE id = $2', ['skipped', article.id]);
        succeeded++;
      }
    } catch (err: any) {
      await query(
        `UPDATE articles SET summary_status = 'failed' WHERE id = $1`,
        [article.id]
      );
      failed++;
    }
  }

  return { processed: pendingArticles.length, succeeded, failed };
}

// Tạo digest từ các articles đã có summary
export async function generateDigest(): Promise<string | null> {
  const now = new Date();
  const periodEnd = now.toISOString();
  const periodStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const articlesForDigest = await getMany(
    `SELECT a.id, a.title, a.summary_text, a.url, a.published_at,
            s.name as source_name, s.category
     FROM articles a
     LEFT JOIN sources s ON s.id = a.source_id
     WHERE a.summary_status = 'done'
       AND a.created_at >= $1
       AND a.created_at <= $2
     ORDER BY a.published_at DESC NULLS LAST
     LIMIT 50`,
    [periodStart, periodEnd]
  );

  if (articlesForDigest.length === 0) {
    console.log('No articles to digest');
    return null;
  }

  const articleSummaries = articlesForDigest
    .map((a, i) => `${i + 1}. [${a.source_name}] ${a.title}\n   ${a.summary_text || 'Chưa có tóm tắt'}`)
    .join('\n\n');

  const prompt = `Bạn là biên tập viên tin tức. Hãy tổng hợp các tin tức dưới đây thành 1 bản tin hằng ngày bằng tiếng Việt.
Nhóm theo chủ đề (Công nghệ, Kinh tế, Xã hội, Thế giới, ...).
Tránh lặp lại thông tin.
Viết ngắn gọn, dễ đọc.
Định dạng: Markdown với headings (##) và bullet points.

Các bài viết hôm nay:
${articleSummaries}`;

  try {
    const digestContent = await callAi(prompt);
    const digestId = generateId('dig');
    const digestDate = now.toISOString().split('T')[0];

    await query(
      `INSERT INTO digests (id, digest_date, period_start, period_end, language, title, body_markdown, article_count, status)
       VALUES ($1, $2, $3, $4, 'vi', $5, $6, $7, 'done')`,
      [digestId, digestDate, periodStart, periodEnd, `Bản tin ${digestDate}`, digestContent, articlesForDigest.length]
    );

    for (const article of articlesForDigest) {
      await query(
        'INSERT INTO digest_items (id, digest_id, article_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [generateId('di'), digestId, article.id]
      );
    }

    return digestId;
  } catch (err: any) {
    console.error('Failed to generate digest:', err.message);
    return null;
  }
}
