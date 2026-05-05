import { getOne, query } from '../../db/index.js';
import { decodeHtmlEntities } from '../../lib/htmlEntities.js';
import { createContentHash, generateId, truncate } from '../../lib/utils.js';

interface ArticleWriterSource {
  id: string;
  language: string;
}

export interface ArticleInsertInput {
  source: ArticleWriterSource;
  url: string;
  title: string;
  author?: string | null;
  publishedAt?: string | null;
  rawExcerpt: string;
  rawContent: string;
  imageUrl?: string | null;
  externalId?: string | null;
  contentHashSeed?: string;
  excerptMaxLength?: number;
  contentMaxLength?: number;
}

export interface ArticleInsertRow {
  id: string;
  source_id: string;
  external_id: string | null;
  url: string;
  title: string;
  author: string | null;
  published_at: string | null;
  content_type: 'article';
  language: string;
  raw_excerpt: string;
  raw_content: string;
  content_hash: string;
  image_url: string | null;
  summary_status: 'pending';
  retry_count: 0;
  last_summary_error: null;
}

export function buildArticleInsertRow(input: ArticleInsertInput): ArticleInsertRow {
  const title = decodeHtmlEntities(input.title).trim();
  const fullRawExcerpt = decodeHtmlEntities(input.rawExcerpt || '');
  const fullRawContent = decodeHtmlEntities(input.rawContent || '');
  const rawExcerpt = truncate(fullRawExcerpt, input.excerptMaxLength || 500);
  const rawContent = truncate(fullRawContent, input.contentMaxLength || 30000);
  const seed = input.contentHashSeed || `${title}${fullRawExcerpt || fullRawContent || ''}`;

  return {
    id: generateId('art'),
    source_id: input.source.id,
    external_id: input.externalId || null,
    url: input.url,
    title,
    author: input.author || null,
    published_at: input.publishedAt || null,
    content_type: 'article',
    language: input.source.language,
    raw_excerpt: rawExcerpt,
    raw_content: rawContent,
    content_hash: createContentHash(seed),
    image_url: input.imageUrl || null,
    summary_status: 'pending',
    retry_count: 0,
    last_summary_error: null,
  };
}

export async function insertArticleIfNew(input: ArticleInsertInput): Promise<boolean> {
  const existing = await getOne('SELECT id FROM articles WHERE url = $1', [input.url]);
  if (existing) return false;

  const row = buildArticleInsertRow(input);
  const hashExists = await getOne('SELECT id FROM articles WHERE content_hash = $1', [row.content_hash]);
  if (hashExists) return false;

  const insertResult = await query(
    `INSERT INTO articles (id, source_id, external_id, url, title, author, published_at,
                           content_type, language, raw_excerpt, raw_content, content_hash,
                           image_url, summary_status, retry_count, last_summary_error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'article', $8, $9, $10, $11, $12, 'pending', 0, NULL)
     ON CONFLICT (url) DO NOTHING
     RETURNING id`,
    [
      row.id,
      row.source_id,
      row.external_id,
      row.url,
      row.title,
      row.author,
      row.published_at,
      row.language,
      row.raw_excerpt,
      row.raw_content,
      row.content_hash,
      row.image_url,
    ]
  );

  return Boolean(insertResult.rowCount && insertResult.rowCount > 0);
}
