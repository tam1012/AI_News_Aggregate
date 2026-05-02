import { nanoid } from 'nanoid';

export function generateId(prefix?: string): string {
  const id = nanoid(16);
  return prefix ? `${prefix}_${id}` : id;
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

export function createContentHash(content: string): string {
  // Simple hash - dung cho dedupe, khong can crypto-safe
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36);
}

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    // Loai bo trailing slash, fragment, tracking params
    u.hash = '';
    u.searchParams.delete('utm_source');
    u.searchParams.delete('utm_medium');
    u.searchParams.delete('utm_campaign');
    u.searchParams.delete('utm_content');
    u.searchParams.delete('utm_term');
    u.searchParams.delete('fbclid');
    u.searchParams.delete('ref');
    let path = u.pathname.replace(/\/+$/, '') || '/';
    u.pathname = path;
    return u.toString();
  } catch {
    return url;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
