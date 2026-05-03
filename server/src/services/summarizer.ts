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

/** Extract tldr from <tldr>...</tldr> XML tag in AI summary */
function extractTldr(summaryText: string): string {
  const match = summaryText.match(/<tldr>([\s\S]*?)<\/tldr>/i);
  return match ? match[1].trim() : '';
}

/** Remove the <tldr> block from summary, leaving only the main content */
function cleanSummaryText(summaryText: string): string {
  return summaryText.replace(/<tldr>[\s\S]*?<\/tldr>/i, '').trim();
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
  return `Bạn là biên tập viên tin tức chuyên nghiệp. Đọc toàn bộ <raw_data> và viết bản phân tích CHI TIẾT giúp người đọc hiểu toàn diện sự việc mà không cần đọc bài gốc.

NGUYÊN TẮC CỐT LÕI:
1. KHÔNG bịa đặt — chỉ dùng thông tin trong <raw_data>.
2. Giữ nguyên tên riêng, số liệu, thuật ngữ kỹ thuật gốc (kể cả tiếng Anh).
3. Viết bằng tiếng Việt tự nhiên. Giữ nguyên tiếng Anh cho thuật ngữ chuyên ngành, tên sản phẩm, tên công ty.
4. Tránh sáo rỗng ("Theo đó", "Được biết", "Nhìn chung").
5. Thuật ngữ kỹ thuật, tên file, lệnh → dùng \`code\` inline.

CẤU TRÚC (linh hoạt, KHÔNG template cố định):
- Bắt đầu bằng tag <tldr>: 2-3 câu tóm tắt sự việc chính + tại sao quan trọng + hệ quả.
- Chia thành 2-5 sections (##) tùy độ phức tạp.
- Heading phải MÔ TẢ nội dung cụ thể, KHÔNG generic.
  ✗ "## Bối cảnh"  ✗ "## Phân tích"
  ✓ "## Thách thức về niềm tin vào Agentic AI"
- Mỗi section mở đầu bằng 1-2 câu dẫn dắt, rồi mới vào chi tiết.
- Mix đoạn văn + bullet + numbered list tùy nội dung — đọc như bài viết, không như checklist.
- Nếu bài có số liệu → PHẢI trích dẫn cụ thể.
- Nếu có nhiều bên liên quan → nêu rõ quan điểm từng bên.

CÁCH DÙNG BOLD VÀ BULLET:
- **Bold inline**: in đậm tên riêng, con số, thuật ngữ quan trọng TRONG CÂU.
- **Bold label** (- **Label:** value): chỉ dùng khi liệt kê nhiều mục song song dạng key-value.
- KHÔNG ép bold label cho MỌI bullet — chỉ dùng khi nội dung có dạng key-value.

ĐỊNH DẠNG OUTPUT (Markdown, KHÔNG emoji, KHÔNG ngoặc vuông trong heading):

<tldr>
[2-3 câu tóm tắt tự nhiên, không prefix]
</tldr>

## [Heading mô tả cụ thể]
[Đoạn dẫn dắt + chi tiết]

## [Heading mô tả cụ thể]
[Nội dung phù hợp]

Tiêu đề: ${article.title}
Nguồn: ${article.source_name}
Ngôn ngữ gốc: ${article.language || 'không rõ'}

<raw_data>
${truncate(content, 20000)}
</raw_data>`;
}

function buildForumPrompt(article: ArticleForSummary, content: string): string {
  return `Bạn là chuyên gia tổng hợp thảo luận từ diễn đàn (Reddit, VOZ...). Đọc toàn bộ <raw_data> và viết bản tổng hợp dễ đọc.

NGUYÊN TẮC:
1. KHÔNG bịa đặt — chỉ dùng nội dung trong <raw_data>.
2. Phân biệt rõ: bài gốc (OP) vs ý kiến cộng đồng (comments).
3. Lọc bỏ troll, meme, comment vô nghĩa. Ưu tiên comment có kinh nghiệm thực tế, upvote cao.
4. Viết bằng tiếng Việt. Giữ nguyên thuật ngữ tiếng Anh khi cần.
5. Thuật ngữ kỹ thuật → dùng \`code\` inline.

CẤU TRÚC (linh hoạt):
- Bắt đầu bằng tag <tldr>: 2-3 câu — chủ đề + tình huống + xu hướng phản hồi chính.
- Chia thành 2-5 sections (##) phù hợp với loại thảo luận:
  + Bài hỏi kinh nghiệm → tóm tắt câu hỏi + các lời khuyên nổi bật
  + Bài tranh luận → các luồng ý kiến chính + đối lập
  + Bài chia sẻ → nội dung OP + phản hồi cộng đồng
- Heading MÔ TẢ nội dung cụ thể:
  ✗ "## Ý kiến nổi bật"
  ✓ "## Lời khuyên từ cộng đồng về chiến lược marketing"
- Mỗi section mở đầu bằng 1-2 câu dẫn dắt, rồi bullet chi tiết.
- KHÔNG dùng ngoặc vuông [ ] trong heading.
- Mix đoạn văn + bullet tùy nội dung — đọc như bài viết, không như checklist.

ĐỊNH DẠNG OUTPUT (Markdown, KHÔNG emoji):

<tldr>
[2-3 câu tóm tắt tự nhiên, không prefix]
</tldr>

## [Heading cụ thể cho bài gốc]
[Tóm tắt nội dung OP]

## [Heading cụ thể cho ý kiến cộng đồng]
[Các ý kiến nổi bật]

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
        const cleanedSummary = cleanSummaryText(summary);

        await query(
          'UPDATE articles SET summary_text = $1, summary_status = $2, tldr = $3 WHERE id = $4',
          [cleanedSummary, 'done', tldr || null, article.id]
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
