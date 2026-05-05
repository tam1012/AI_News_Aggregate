import { decodeHTML } from 'entities';

const ARTICLE_TEXT_FIELDS = ['title', 'raw_excerpt', 'raw_content', 'summary_text', 'summary_short', 'tldr'] as const;

export function decodeHtmlEntities(value: string): string {
  return decodeHTML(value);
}

export function decodeArticleTextFields<T extends Record<string, any>>(row: T): T {
  const decoded: Record<string, any> = { ...row };

  for (const field of ARTICLE_TEXT_FIELDS) {
    if (typeof decoded[field] === 'string') {
      decoded[field] = decodeHtmlEntities(decoded[field]);
    }
  }

  return decoded as T;
}

export function decodeArticleRows<T extends Record<string, any>>(rows: T[]): T[] {
  return rows.map(decodeArticleTextFields);
}
