import { decodeHTML } from 'entities';

const ARTICLE_TEXT_FIELDS = ['title', 'raw_excerpt', 'raw_content', 'summary_text', 'summary_short', 'tldr'] as const;
const UNSAFE_CONTROL_CHARS = new RegExp('[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f-\\u009f]', 'g');

function repairUtf8Mojibake(value: string): string {
  if (!/[ÃÂâ]/.test(value)) return value;
  try {
    const repaired = Buffer.from(value, 'latin1').toString('utf8');
    const before = (value.match(/[ÃÂâ][-¿]?/g) || []).length;
    const after = (repaired.match(/[ÃÂâ][-¿]?/g) || []).length;
    return after < before ? repaired : value;
  } catch {
    return value;
  }
}

function removeUnsafeControlChars(value: string): string {
  return value.replace(UNSAFE_CONTROL_CHARS, '');
}

export function decodeHtmlEntities(value: string): string {
  return removeUnsafeControlChars(decodeHTML(repairUtf8Mojibake(value)));
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
