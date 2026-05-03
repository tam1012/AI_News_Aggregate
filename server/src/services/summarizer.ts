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

/** Extract a 1-2 sentence tldr from TLDR: prefix in the AI summary */
function extractTldr(summaryText: string): string {
  const match = summaryText.match(/TLDR:\s*([\s\S]*?)(?=\n##|$)/i);
  if (!match) return '';
  return match[1].trim();
}

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
  return `Bạn là biên tập viên tin tức. Phân tích <raw_data> và viết bản tóm tắt chi tiết bằng tiếng Việt.

NGUYÊN TẮC:
1. KHÔNG bịa đặt — chỉ dùng thông tin trong <raw_data>.
2. Giữ nguyên tên riêng, số liệu, thuật ngữ kỹ thuật.
3. Tránh sáo rỗng ("Theo đó", "Được biết").

QUAN TRỌNG VỀ ĐỊNH DẠNG:
- Mỗi section PHẢI dùng bullet points (-) để liệt kê thông tin, KHÔNG viết đoạn văn dài.
- In đậm (**bold**) các thuật ngữ, tên riêng, con số quan trọng.
- Tiêu đề sections phải ngắn gọn, rõ ràng, KHÔNG dùng ngoặc vuông.
- Viết sao cho dễ scan — người đọc lướt qua cũng nắm được ý chính.

ĐỊNH DẠNG OUTPUT (Markdown, KHÔNG emoji):

TLDR:
[1 đoạn văn ngắn 2-3 câu tóm tắt sự việc. Bắt đầu bằng "TLDR:"]

## [Tiêu đề sự kiện chính]
- Điểm tin 1: mô tả cụ thể, có số liệu nếu có
- Điểm tin 2: ai làm gì, ở đâu, khi nào
- Điểm tin 3: kết quả hoặc phản ứng ban đầu
- Điểm tin 4 (nếu có): thêm chi tiết đáng chú ý

## [Tiêu đề bối cảnh hoặc phân tích]
- Điểm phân tích 1: tại sao quan trọng
- Điểm phân tích 2: tiền sử hoặc so sánh
- Điểm phân tích 3: tác động đến ngành/liên quan

## [Tiêu đề phản ứng hoặc hệ quả]
- Phản ứng từ bên liên quan A
- Phản ứng từ bên liên quan B
- Hệ quả dự kiến

Tiêu đề: ${article.title}
Nguồn: ${article.source_name}
Ngôn ngữ gốc: ${article.language || 'không rõ'}

<raw_data>
${truncate(content, 20000)}
</raw_data>`;
}

function buildForumPrompt(article: ArticleForSummary, content: string): string {
  return `Bạn là chuyên gia tổng hợp thông tin từ diễn đàn (Reddit, VOZ...). Tổng hợp bài gốc và thảo luận thành bản tóm tắt dễ đọc.

NGUYÊN TẮC:
1. KHÔNG bịa đặt — chỉ dùng nội dung trong <raw_data>.
2. Phân biệt OP (bài gốc) vs Comments (cộng đồng).
3. Lọc bỏ troll, meme, comment vô nghĩa. Ưu tiên comment có kinh nghiệm thực, tranh luận logic, upvote cao.

QUAN TRỌNG VỀ ĐỊNH DẠNG:
- Mỗi section PHẢI dùng bullet points (-) để liệt kê, KHÔNG viết đoạn văn dài.
- In đậm (**bold**) tên riêng, thuật ngữ, con số quan trọng.
- Tiêu đề sections ngắn gọn, rõ ràng, KHÔNG dùng ngoặc vuông.

ĐỊNH DẠNG OUTPUT (Markdown, KHÔNG emoji):

TLDR:
[1 đoạn văn ngắn 2-3 câu: chủ đề + xu hướng phản hồi. Bắt đầu bằng "TLDR:"]

## [Tiêu đề bài gốc]
- Bối cảnh bài viết: ai đăng, nội dung chính
- Câu hỏi hoặc vấn đề được nêu ra

## [Tiêu đề luồng ý kiến A]
- Ý kiến 1: trích dẫn luận điểm cụ thể, ghi rõ đặc điểm người viết
- Ý kiến 2: thêm ví dụ hoặc kinh nghiệm thực tế

## [Tiêu đề luồng ý kiến B]
- Ý kiến đối lập: luận điểm cụ thể
- Phản biện hoặc góc nhìn khác

## [Kết luận]
- Điểm đáng chú ý nhất
- Xu hướng chung của cộng đồng (nếu có)

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
        const tldr = extractTldr(summary);
        const cleanSummary = summary.replace(/TLDR:[\s\S]*?(?=\n##)/i, '').trim();

        await query(
          'UPDATE articles SET summary_text = $1, summary_status = $2, tldr = $3 WHERE id = $4',
          [cleanSummary, 'done', tldr || null, article.id]
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
  const prompt = `Bạn là tổng biên tập bản tin hằng ngày. Nhiệm vụ: tổng hợp các bài viết dưới đây thành một bản tin chuyên nghiệp, có cấu trúc rõ ràng, dễ đọc, và đủ thông tin.

QUY TẮC:
1. Nhóm tin theo chủ đề: Công nghệ, Kinh tế, Xã hội, Thế giới, Giải trí, Thể thao, v.v.
2. Mỗi mục chủ đề phải có TIÊU ĐỀ MÔ TẢ ngắn gọn (không chỉ "Công nghệ" mà phải là "## Công nghệ — Apple ra mắt chip M5, Google cập nhật AI" chẳng hạn).
3. Dưới mỗi mục: viết 1-2 câu TỔNG QUAN chủ đề, rồi liệt kê các tin bằng bullet points.
4. Mỗi bullet point phải tóm tắt ĐỦ Ý: sự việc + bối cảnh ngắn + hệ quả. Không chỉ nêu tiêu đề.
5. Nếu các tin liên quan đến nhau — gom lại và viết mối liên hệ giữa chúng.
6. Tránh lặp thông tin giữa các mục.
7. Viết bằng tiếng Việt tự nhiên, dễ đọc.

ĐỊNH DẠNG (Markdown):
- KHÔNG dùng H1 (#) cho tiêu đề chính.
- Mục chủ đề dùng ##.
- Mỗi tin dùng bullet point (-).
- In đậm (**bold**) cho tên riêng, con số quan trọng, từ khóa.

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
