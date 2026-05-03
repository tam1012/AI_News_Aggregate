import { query, getMany } from '../db/index.js';
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

async function claimPendingArticles(limit: number): Promise<ArticleForSummary[]> {
  const result = await query<ArticleForSummary>(
    `WITH picked AS (
       SELECT a.id, a.source_id
       FROM articles a
       WHERE a.summary_status = 'pending'
       ORDER BY a.created_at DESC
       FOR UPDATE SKIP LOCKED
       LIMIT $1
     ), claimed AS (
       UPDATE articles a
       SET summary_status = 'processing'
       FROM picked
       WHERE a.id = picked.id
       RETURNING a.id, a.title, a.raw_excerpt, a.raw_content, a.language, picked.source_id
     )
     SELECT c.id, c.title, c.raw_excerpt, c.raw_content, c.language,
            s.name as source_name
     FROM claimed c
     LEFT JOIN sources s ON s.id = c.source_id`,
    [limit]
  );

  return result.rows;
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
  return `Biên tập viên tin tức cấp cao. Phân tích và tóm tắt CHI TIẾT, CHÍNH XÁC dựa hoàn toàn trên <raw_data>.

NGUYÊN TẮC:
- CHỈ dùng thông tin trong <raw_data>. KHÔNG suy đoán, KHÔNG bổ sung.
- Nếu thiếu dữ kiện → bỏ qua, KHÔNG tự điền.
- KHÔNG dùng từ suy diễn ("đáng chú ý", "gây tranh cãi", "quan trọng") nếu không có trong bài.
- Ưu tiên số liệu, tên riêng, mốc thời gian cụ thể.
- Luôn output tiếng Việt. Giữ nguyên tên riêng gốc (tiếng Anh, tên sản phẩm, thuật ngữ kỹ thuật).

ĐỊNH DẠNG OUTPUT (dùng markdown, chỉ trả về nội dung, không giải thích):

## Tổng quan

Viết 2-3 câu mô tả sự kiện/tin tức chính: chuyện gì xảy ra, ai liên quan, ở đâu, khi nào. Nêu rõ tên tổ chức, sản phẩm, nhân vật nếu có.

## Các điểm chính

Liệt kê các thông tin quan trọng nhất từ bài viết:
- **Label ngắn gọn**: Giải thích chi tiết 1-2 câu, ưu tiên số liệu/tên/ngày cụ thể.
  - Sub-bullet nếu có chi tiết bổ sung, ví dụ cụ thể, hoặc so sánh.
- **Label ngắn gọn**: Giải thích chi tiết.
  - Sub-bullet nếu cần.
- (Tối đa 6 điểm. Chỉ ghi ý có thật trong <raw_data>. Không lặp ý.)

## Bối cảnh và tác động

Viết 1-3 câu về bối cảnh rộng hơn nếu bài có đề cập: nguyên nhân, hệ quả, xu hướng liên quan, hoặc phản ứng từ các bên. Bỏ qua mục này hoàn toàn nếu bài không có thông tin bối cảnh.

QUY TẮC VIẾT:
- Không dùng: "bài viết nói về", "theo nguồn tin", "nội dung đề cập".
- In đậm (**bold**) các label và thuật ngữ quan trọng.
- Toàn bộ output: 300-600 từ tuỳ độ phong phú của dữ liệu.
- Verify: mọi chi tiết phải tồn tại trong <raw_data>. Loại bullet trùng ý.

Tiêu đề: ${article.title}
Nguồn: ${article.source_name}
Ngôn ngữ gốc: ${article.language || 'không rõ'}

<raw_data>
${truncate(content, 20000)}
</raw_data>`;
}


function buildForumPrompt(article: ArticleForSummary, content: string): string {
  return `Biên tập viên tổng hợp chuyên sâu nội dung từ Reddit/VOZ/Forum, viết cho app đọc tin tiếng Việt. Phân tích và tóm tắt CHI TIẾT dựa hoàn toàn trên <raw_data>.

NGUYÊN TẮC:
- CHỈ dùng thông tin trong <raw_data>. KHÔNG suy đoán, KHÔNG bổ sung, KHÔNG khái quát nếu dữ liệu không đủ.
- Tổng hợp CẢ nội dung gốc VÀ bình luận thảo luận một cách đầy đủ.
- Mỗi ý kiến phải phản ánh nội dung thực sự trong bình luận (có thể diễn đạt lại, không thay đổi ý nghĩa).
- Ưu tiên bình luận có nhiều upvote hoặc được nhắc lại nhiều lần.
- Nếu có tranh luận → thể hiện rõ các phía, không gộp sai lệch.
- Luôn output tiếng Việt. Giữ nguyên tên riêng gốc (tiếng Anh, tên sản phẩm, thuật ngữ kỹ thuật).

ĐỊNH DẠNG OUTPUT (dùng markdown, chỉ trả về nội dung, không giải thích):

## Tổng quan về nội dung

Viết 2-3 câu mô tả bài viết gốc: tác giả đăng gì, mục đích gì, bối cảnh gì. Nếu bài có link, sản phẩm, dự án → nêu rõ tên.

## Các điểm chính trong thảo luận

Liệt kê các điểm nổi bật nhất từ bài viết gốc VÀ bình luận:
- **Label ngắn gọn**: Giải thích chi tiết 1-2 câu dựa trên nội dung thực.
  - Sub-bullet nếu có chi tiết bổ sung hoặc ví dụ cụ thể từ bình luận.
- **Label ngắn gọn**: Giải thích chi tiết.
  - Sub-bullet nếu cần.
- (Tối đa 6 điểm. Chỉ ghi ý có thật trong <raw_data>. Không lặp ý.)

## Phản hồi từ cộng đồng

Tổng hợp phản ứng và ý kiến nổi bật từ bình luận:
- **Quan điểm ủng hộ/tích cực**: Tóm tắt các ý kiến đồng tình, khen ngợi (nếu có).
- **Góp ý cải thiện / Phản biện**: Tóm tắt các ý kiến phản đối, góp ý, hoặc cảnh báo.
  - Sub-bullet cho từng ý riêng biệt nếu có nhiều góc nhìn.
- **Thách thức / Rủi ro**: Nếu cộng đồng nêu ra rủi ro hoặc hạn chế → ghi rõ.
- (Bỏ mục nào nếu không có dữ liệu. KHÔNG bịa ý kiến.)

## Kết luận

Viết 1-2 câu tổng kết xu hướng chung của thảo luận. Nếu ý kiến phân tán → ghi rõ "Cộng đồng có nhiều quan điểm trái chiều về vấn đề này".

QUY TẮC VIẾT:
- Viết tự nhiên, dùng thuật ngữ phù hợp cộng đồng tech Việt.
- In đậm (**bold**) các label và thuật ngữ quan trọng.
- Toàn bộ output: 300-600 từ tuỳ độ phong phú của dữ liệu.
- Verify: mọi chi tiết phải tồn tại trong <raw_data>. Loại bullet trùng ý.

Tiêu đề: ${article.title}
Nguồn: ${article.source_name}

<raw_data>
${truncate(content, 28000)}
</raw_data>`;
}

// Tóm tắt hàng loạt articles chưa có summary
export async function summarizePendingArticles(): Promise<{ processed: number; succeeded: number; failed: number }> {
  const maxCalls = parseInt(process.env.MAX_AI_CALLS_PER_RUN || '30');

  const pendingArticles = await claimPendingArticles(maxCalls);

  let succeeded = 0;
  let failed = 0;

  for (const article of pendingArticles) {
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

  const digestDateStr = now.toISOString().split('T')[0];
  const prompt = `Bạn là biên tập viên tin tức. Hãy tổng hợp các tin tức dưới đây thành 1 bản tin hằng ngày bằng tiếng Việt.
Nhóm theo chủ đề (Công nghệ, Kinh tế, Xã hội, Thế giới, ...).
Tránh lặp lại thông tin.
Viết ngắn gọn, dễ đọc.
Định dạng: Markdown với headings (##) và bullet points.

QUAN TRỌNG: 
1. TUYỆT ĐỐI KHÔNG tự viết thêm tiêu đề chính (H1 hoặc # Tiêu đề).
2. Tên các chuyên mục dùng ## (ví dụ: ## Công nghệ).

Các bài viết hôm nay (${digestDateStr}):
${articleSummaries}`;

  try {
    const digestContent = await callAi(prompt, { max_tokens: 4000 });
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
