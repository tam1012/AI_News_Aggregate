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

NGUYÊN TẮC ĐỊNH DẠNG (linh hoạt theo nội dung):
- **Phải có tiêu đề sections ngắn gọn, rõ ràng** — mỗi section mở đầu bằng ## và tên mô tả trực diện.
- **Bullet points (-)** khi liệt kê nhiều điểm cùng loại (ví dụ: danh sách tính năng, timeline, so sánh).
- **In đậm (bold)** cho thuật ngữ, tên riêng, con số quan trọng. Đặt bold ở đầu mỗi bullet nếu bullet có dạng "Label: mô tả".
- **Đoạn văn ngắn** khi cần giải thích bối cảnh hoặc phân tích sâu (1-3 câu).
- **Numbered list (1. 2. 3.)** khi có thứ tự hoặc quy trình.
- **KHÔNG dùng ngoặc vuông [ ] trong tiêu đề sections.**
- LINH HOẠT: chọn cách trình bày phù hợp nhất với nội dung bài viết. Bài có timeline → bullet với bold label + ngày tháng. Bài có nhiều sản phẩm → numbered list. Bài phân tích → mix bullet và đoạn ngắn. Bài có so sánh → bullet nêu rõ A vs B.
- BẮT BUỘC có TLDR ở đầu: 1 đoạn ngắn 2-3 câu tóm tắt toàn bộ sự việc. Bắt đầu bằng "TLDR:".

ĐỊNH DẠNG OUTPUT (Markdown, KHÔNG emoji):

TLDR:
[1-2 câu tóm tắt sự việc. Bắt đầu bằng "TLDR:"]

## [Tiêu đề section 1 — mô tả trực diện sự kiện]
[Chọn format phù hợp: bullet points, numbered list, hoặc đoạn ngắn. Tùy nội dung.]

## [Tiêu đề section 2 — bối cảnh hoặc phân tích]
[Chọn format phù hợp.]

## [Tiêu đề section 3 — phản ứng hoặc hệ quả]
[Chọn format phù hợp. Section này có thể bỏ qua nếu không đủ thông tin.]

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

NGUYÊN TẮC ĐỊNH DẠNG (linh hoạt theo nội dung):
- **Tiêu đề sections ngắn gọn, rõ ràng** — mỗi section mở đầu bằng ## và tên mô tả trực diện.
- **Bullet points (-)** khi liệt kê nhiều ý kiến, tính năng, hoặc so sánh.
- **Bold label + mô tả** ở đầu mỗi bullet nếu bullet có dạng "Điểm A: giải thích".
- **Đoạn văn ngắn** khi cần tóm tắt bối cảnh bài gốc.
- **KHÔNG dùng ngoặc vuông [ ] trong tiêu đề sections.**
- LINH HOẠT: chọn cách trình bày phù hợp với loại thảo luận. Bài có nhiều ý kiến trái chiều → bullet bold label + mô tả. Bài hỏi kinh nghiệm → bullet liệt kê kinh nghiệm thực tế. Bài thảo luận kỹ thuật → numbered list + bullet chi tiết.
- BẮT BUỘC có TLDR ở đầu: 1-2 câu tóm tắt chủ đề + xu hướng phản hồi. Bắt đầu bằng "TLDR:".

ĐỊNH DẠNG OUTPUT (Markdown, KHÔNG emoji):

TLDR:
[1-2 câu: chủ đề + xu hướng phản hồi. Bắt đầu bằng "TLDR:"]

## [Tiêu đề section 1 — bài gốc hoặc vấn đề]
[Chọn format phù hợp: đoạn ngắn tóm tắt, bullet, hoặc mix.]

## [Tiêu đề section 2 — ý kiến nổi bật]
[Chọn format phù hợp: bullet bold label + mô tả, hoặc đoạn ngắn.]

## [Tiêu đề section 3 — ý kiến khác hoặc tranh luận]
[Section này có thể bỏ qua nếu không có nhiều ý kiến trái chiều.]

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
