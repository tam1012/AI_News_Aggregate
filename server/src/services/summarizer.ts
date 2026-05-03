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

/** Extract a 1-2 sentence tldr from Key Takeaways bullets in the AI summary */
function extractTldr(summaryText: string): string {
  // Match the Key Takeaways section (new prompt format)
  const match = summaryText.match(/##[^\n]*Key Takeaways[^\n]*\n([\s\S]*?)(?=\n##|$)/i);
  if (!match) return '';

  const bullets = match[1]
    .split('\n')
    .filter(line => /^\s*[-*•]/.test(line))
    .slice(0, 2)
    .map(line => line
      .replace(/^\s*[-*•]\s*/, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .trim()
    )
    .filter(Boolean);

  return bullets.join(' · ');
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
  return `Bạn là một biên tập viên tin tức khách quan và chuyên nghiệp. Nhiệm vụ của bạn là phân tích và tóm tắt CHI TIẾT bài báo dựa hoàn toàn trên <raw_data>.

NGUYÊN TẮC CỐT LÕI (TUYỆT ĐỐI TUÂN THỦ):
1. Không bịa đặt: CHỈ dùng thông tin có thật trong <raw_data>. KHÔNG suy đoán, KHÔNG bổ sung ý kiến cá nhân.
2. Khách quan: Duy trì sự trung lập. KHÔNG dùng các từ suy diễn cảm xúc ("đáng chú ý", "gây sốc") trừ khi có trong bài gốc.
3. Giữ lại chi tiết đắt giá: Ưu tiên giữ lại các con số, số liệu thống kê, tên riêng, ngày tháng và dữ liệu quan trọng.
4. Xử lý tên riêng: Giữ nguyên tên riêng tiếng Anh, tên sản phẩm, thuật ngữ kỹ thuật.

ĐỊNH DẠNG OUTPUT (Sử dụng Markdown, chỉ trả về nội dung, không giải thích):

## 📌 Key Takeaways
[Trình bày 3-5 gạch đầu dòng ngắn gọn (bullet points) nêu bật những thông tin quan trọng nhất, kết luận cốt lõi, hoặc giá trị thiết thực nhất từ bài viết. Giúp người đọc nắm bắt toàn bộ tinh thần bài viết chỉ trong 10 giây.]

## 📖 Nội dung chi tiết
[Phân chia nội dung bài viết thành các mục nhỏ với heading cấp 3 (###). Linh hoạt đặt tên heading theo chủ đề.]
- **Sử dụng in đậm (bold)** cho các thuật ngữ và từ khóa quan trọng.
- Sử dụng bảng (Markdown table) nếu bài viết có chứa dữ liệu so sánh, thông số kỹ thuật hoặc danh sách số liệu.
- Giữ bố cục thoáng, dễ quét thông tin.

## 🌍 Bối cảnh & Tác động (Nếu có)
[Viết 1-3 câu nêu rõ nguyên nhân, hệ quả, hoặc bối cảnh rộng hơn của sự kiện nếu bài gốc có đề cập. Bỏ qua mục này hoàn toàn nếu không có thông tin.]

Tiêu đề: ${article.title}
Nguồn: ${article.source_name}
Ngôn ngữ gốc: ${article.language || 'không rõ'}

<raw_data>
${truncate(content, 20000)}
</raw_data>`;
}

function buildForumPrompt(article: ArticleForSummary, content: string): string {
  return `Bạn là chuyên gia tổng hợp thông tin từ các diễn đàn công nghệ (Reddit, VOZ...). Nhiệm vụ của bạn là tổng hợp bài đăng gốc và các luồng thảo luận của cộng đồng một cách khách quan dựa trên <raw_data>.

NGUYÊN TẮC CỐT LÕI (TUYỆT ĐỐI TUÂN THỦ):
1. Không bịa đặt: CHỈ dùng thông tin và bình luận có trong <raw_data>. KHÔNG bịa ra ý kiến ảo.
2. Phân tách rõ ràng: Phân biệt rõ đâu là thông tin từ bài đăng gốc (OP), đâu là phản ứng từ cộng đồng (Comments).
3. Lọc nhiễu (Signal-to-noise): Bỏ qua các bình luận vô nghĩa, cợt nhả. Ưu tiên các bình luận có hàm lượng thông tin cao, kinh nghiệm thực tế, tranh luận logic hoặc được upvote/nhắc lại nhiều.

ĐỊNH DẠNG OUTPUT (Sử dụng Markdown, kết hợp emoji cho sinh động, chỉ trả về nội dung):

## 📌 Key Takeaways
[3-5 gạch đầu dòng (bullet points) tóm tắt nhanh nhất cốt lõi bài đăng và phản ứng chung của cộng đồng. Đọc xong phần này là hiểu thread nói về cái gì.]

## 📝 Nội dung bài đăng gốc
[Tóm tắt ngắn gọn bối cảnh, câu hỏi hoặc chia sẻ của người đăng bài. Nêu rõ tên công cụ/sản phẩm đang được thảo luận.]

## 🗣️ Phản hồi từ cộng đồng
[Gom nhóm các bình luận nổi bật thành các nhóm chủ đề/quan điểm (sử dụng heading cấp 3 - ###). Không ép buộc vào các danh mục cố định, hãy linh hoạt chia nhóm dựa trên nội dung thực tế (ví dụ: ### Cách giải quyết thay thế, ### Kinh nghiệm đau thương, ### Cảnh báo rủi ro).]
- In đậm (**bold**) các luận điểm chính.
- Thể hiện đa chiều các quan điểm đối lập nếu có tranh cãi. Không thiên vị.

## 🎯 Tổng kết xu hướng
[1-2 câu kết luận tổng thể về thái độ của cộng đồng (ví dụ: phần lớn đồng tình, tranh cãi gay gắt, hay chưa có hồi kết).]

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
        await query(
          'UPDATE articles SET summary_text = $1, summary_status = $2, tldr = $3 WHERE id = $4',
          [summary, 'done', tldr || null, article.id]
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
