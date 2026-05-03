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
  return `Bạn là một biên tập viên tin tức chuyên nghiệp, có khả năng viết tóm tắt vừa đủ chi tiết vừa hấp dẫn như một bài phân tích ngắn. Nhiệm vụ: phân tích <raw_data> và tạo bản tóm tắt CÓ CHIỀU SÂU, giàu thông tin, giúp người đọc hiểu trọn vẹn sự việc mà không cần đọc bài gốc.

NGUYÊN TẮC BẮT BUỘC:
1. KHÔNG bịa đặt — chỉ dùng thông tin có trong <raw_data>.
2. Giữ nguyên số liệu, tên riêng, ngày tháng, thuật ngữ kỹ thuật (không dịch).
3. Viết bằng tiếng Việt tự nhiên, mạch lạc, không sáo rỗng. Tránh các cụm từ mở đầu nhàm chán như "Theo đó", "Được biết".
4. Mỗi section phải có NỘI DUNG THỰC, không được viết chung chung hay lặp lại tiêu đề.

YÊU CẦU VỀ CHIỀU SÂU:
- TLDR phải tóm tắt được BỐI CẢNH + KẾT QUẢ/Ý NGHĨA, không chỉ nêu sự kiện.
- Mỗi heading section phải có ít nhất 3-4 câu phân tích/điểm tin, không được viết 1 câu rồi chuyển heading.
- Nếu bài viết có số liệu, con số — PHẢI trích dẫn cụ thể.
- Nếu có nhiều bên liên quan — nêu rõ quan điểm/tư thế của từng bên.
- Nếu có bối cảnh lịch sử hoặc so sánh — trình bày để người đọc hiểu tại sao sự kiện này quan trọng.

ĐỊNH DẠNG OUTPUT (Markdown, KHÔNG emoji):

TLDR:
[Viết 1 đoạn văn 3-4 câu. Không dùng gạch đầu dòng. Phải bao gồm: (1) Sự việc chính là gì, (2) Bối cảnh/tại sao quan trọng, (3) Kết quả hoặc hệ quả. Bắt đầu bằng "TLDR:"]

## [Tiêu đề mô tả trực diện sự kiện]
[Đoạn mở bài: trình bày sự việc chính, ai, ở đâu, khi nào. Viết như mở đầu một bài phân tích — lôi cuốn nhưng chính xác. Tối thiểu 4-5 câu.]

## [Tiêu đề về bối cảnh hoặc nguyên nhân]
[Giải thích tại sao chuyện này xảy ra, tiền sử sự việc, hoặc các yếu tố dẫn đến. Nếu không có bối cảnh rõ ràng thì dùng section này cho diễn biến chi tiết hơn. Tối thiểu 3-4 câu.]

## [Tiêu đề về phản ứng, hệ quả hoặc ý kiến]
[Trình bày phản ứng từ các bên liên quan, hệ quả dự kiến, hoặc các góc nhìn khác nhau. Trích dẫn cụ thể nếu có. Tối thiểu 3-4 câu.]

## [Tiêu đề về tác động hoặc tương lai]
[Nếu phù hợp: hệ quả rộng hơn, tác động đến ngành/cộng đồng, hoặc những gì sẽ xảy ra tiếp theo. Nếu không có đủ thông tin, bỏ qua section này.]

Tiêu đề: ${article.title}
Nguồn: ${article.source_name}
Ngôn ngữ gốc: ${article.language || 'không rõ'}

<raw_data>
${truncate(content, 20000)}
</raw_data>`;
}

function buildForumPrompt(article: ArticleForSummary, content: string): string {
  return `Bạn là chuyên gia tổng hợp thông tin từ diễn đàn (Reddit, VOZ...). Nhiệm vụ: tổng hợp bài đăng gốc và thảo luận cộng đồng thành bản phân tích có cấu trúc, giàu thông tin, giúp người đọc nắm bắt toàn bộ cuộc thảo luận mà không cần đọc từng comment.

NGUYÊN TẮC BẮT BUỘC:
1. KHÔNG bịa đặt — chỉ dùng nội dung có trong <raw_data>.
2. Phân biệt rõ OP (bài gốc) vs Comments (phản hồi cộng đồng).
3. Lọc nhiễu: bỏ comment vô nghĩa, troll, meme. Ưu tiên comment có thông tin thực, kinh nghiệm dùng, tranh luận logic, hoặc upvote cao.
4. Khi trích dẫn ý kiến cộng đồng, ghi rõ đặc điểm người viết (ví dụ: "một người dùng tự nhận là dev 10 năm kinh nghiệm", "nhiều người dùng khác đồng tình").
5. Viết bằng tiếng Việt tự nhiên, không sáo rỗng.

YÊU CẦU VỀ CHIỀU SÂU:
- TLDR phải nêu: (1) Chủ đề thảo luận là gì, (2) Xu hướng phản hồi chính của cộng đồng (đồng tình, phản đối, hay chia rẽ?).
- Mỗi section phải có ít nhất 3-4 câu nội dung thực, không được viết 1 câu rồi chuyển section.
- Nếu có số liệu, benchmark, ví dụ cụ thể từ comment — PHẢI trích dẫn.
- Nếu có tranh luận/disagreement — trình bày CẢ HAI phía với luận điểm cụ thể.

ĐỊNH DẠNG OUTPUT (Markdown, KHÔNG emoji):

TLDR:
[1 đoạn văn 3-4 câu: chủ đề chính + xu hướng phản hồi cộng đồng + kết luận/ý nghĩa. Bắt đầu bằng "TLDR:"]

## [Tiêu đề mô tả bài gốc / câu hỏi của OP]
[Tóm tắt bài gốc: OP hỏi gì/chia sẻ gì, bối cảnh, link nếu có. Tối thiểu 3-4 câu.]

## [Tiêu đề mô tả luồng ý kiến ủng hộ/chính]
[Tổng hợp các bình luận đồng tình, ủng hộ, hoặc chia sẻ kinh nghiệm tương tự. Trích dẫn cụ thể luận điểm. Tối thiểu 3-4 câu.]

## [Tiêu đề mô tả luồng ý kiến phản đối/khác biệt]
[Tổng hợp các bình luận phản đối, đặt câu hỏi, hoặc cung cấp góc nhìn khác. Trích dẫn cụ thể. Tối thiểu 3-4 câu.]

## [Tiêu đề về kết luận hoặc điểm đáng chú ý]
[Nếu có: câu trả lời được upvote nhiều nhất, insight bất ngờ, hoặc kết luận ngầm của cộng đồng. Nếu không đủ thông tin, bỏ qua section này.]

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
