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
  
  const isForum = article.source_name?.toLowerCase().includes('reddit') ||
                  article.source_name?.toLowerCase().includes('voz') ||
                  article.title?.startsWith('[r/');

  // For normal news, skip if too short. For forums, titles alone might be worth showing.
  if (!isForum && content.length < 80) return null;

  const prompt = isForum
    ? buildForumPrompt(article, content)
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
  return `Biên tập viên tin tức cấp cao. Tóm tắt CHÍNH XÁC, NGẮN GỌN dựa hoàn toàn trên <raw_data>.

NGUYÊN TẮC:
- CHỈ dùng thông tin trong <raw_data>. KHÔNG suy đoán, KHÔNG bổ sung.
- Nếu thiếu dữ kiện → bỏ qua, KHÔNG tự điền.
- KHÔNG dùng từ suy diễn ("đáng chú ý", "gây tranh cãi", "quan trọng") nếu không có trong bài.
- Ưu tiên số liệu, tên riêng, mốc thời gian cụ thể.
- Luôn output tiếng Việt. Giữ nguyên tên riêng gốc.

ĐỊNH DẠNG (chỉ trả về nội dung, không giải thích):

**Tổng quan:** 1-2 câu tóm sự kiện chính.

**Điểm nổi bật:**
- #1: [Chi tiết cụ thể, ưu tiên số liệu/tên/ngày]
- #2: [Chi tiết khác, không trùng ý #1]
- (Tối đa 5. Chỉ ghi ý có thật. Không lặp ý.)

**Bối cảnh:** 1 câu nếu bài có đề cập rõ. Bỏ qua mục này nếu không có.

QUY TẮC VIẾT:
- Không dùng: "bài viết nói về", "theo nguồn tin", "nội dung đề cập".
- Mỗi bullet tối đa 1 câu. Toàn bộ output tối đa 200 từ.
- Verify: mọi chi tiết phải tồn tại trong <raw_data>. Loại bullet trùng ý.

Tiêu đề: ${article.title}
Nguồn: ${article.source_name}
Ngôn ngữ gốc: ${article.language || 'không rõ'}

<raw_data>
${truncate(content, 10000)}
</raw_data>`;
}

function buildForumPrompt(article: ArticleForSummary, content: string): string {
  return `Biên tập viên chuyên tổng hợp thảo luận cộng đồng (Reddit, VOZ, Forum). Tóm tắt CHÍNH XÁC dựa trên <raw_data>.

NGUYÊN TẮC:
- CHỈ dùng thông tin trong <raw_data>. KHÔNG suy đoán, KHÔNG bổ sung.
- Tổng hợp CẢ nội dung gốc VÀ bình luận thảo luận.
- Ưu tiên bình luận đa chiều, có insight hoặc tranh luận sắc bén.
- Thể hiện các góc nhìn khác nhau nếu có ý kiến trái chiều.
- Luôn output tiếng Việt. Giữ nguyên tên riêng gốc.

ĐỊNH DẠNG (chỉ trả về nội dung, không giải thích):

**Chủ đề:** 1-2 câu mô tả nội dung bài viết/chủ đề gốc.

**Ý kiến cộng đồng:**
- #1: [Quan điểm nổi bật, được đồng tình nhiều hoặc phân tích sâu]
- #2: [Quan điểm khác, không trùng ý #1]
- (Tối đa 5. Chỉ ghi ý có thật. Không lặp ý.)

**Tóm lại:** 1 câu kết luận xu hướng ý kiến chung. Bỏ qua nếu không rõ xu hướng.

QUY TẮC VIẾT:
- Viết tự nhiên, dùng thuật ngữ phù hợp cộng đồng.
- Mỗi bullet tối đa 1 câu. Toàn bộ output tối đa 200 từ.
- Verify: mọi chi tiết phải tồn tại trong <raw_data>. Loại bullet trùng ý.

Tiêu đề: ${article.title}
Nguồn: ${article.source_name}

<raw_data>
${truncate(content, 12000)}
</raw_data>`;
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
