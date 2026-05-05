const CACHE_PREFIX = 'synthnews-api-cache:';
const CACHE_INDEX_KEY = `${CACHE_PREFIX}index`;
const MAX_ENTRIES = 80;

interface StoredApiResponse<T = any> {
  path: string;
  data: T;
  savedAt: number;
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function keyFor(path: string): string {
  return `${CACHE_PREFIX}${path}`;
}

function readIndex(): string[] {
  if (!canUseStorage()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CACHE_INDEX_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function writeIndex(paths: string[]): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(paths.slice(0, MAX_ENTRIES)));
}

export function isPersistentApiCacheable(path: string): boolean {
  return (
    path.startsWith('/articles') ||
    path.startsWith('/digests/latest') ||
    path === '/sources'
  );
}

export function savePersistentApiCache<T>(path: string, data: T): void {
  if (!canUseStorage() || !isPersistentApiCacheable(path)) return;

  try {
    const row: StoredApiResponse<T> = { path, data, savedAt: Date.now() };
    window.localStorage.setItem(keyFor(path), JSON.stringify(row));

    const index = readIndex().filter((item) => item !== path);
    index.unshift(path);
    const evicted = index.slice(MAX_ENTRIES);
    for (const item of evicted) window.localStorage.removeItem(keyFor(item));
    writeIndex(index);
  } catch {}
}

export function loadPersistentApiCache<T = any>(path: string): T | null {
  if (!canUseStorage() || !isPersistentApiCacheable(path)) return null;

  try {
    const raw = window.localStorage.getItem(keyFor(path));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredApiResponse<T>;
    return parsed?.data ?? null;
  } catch {
    return null;
  }
}

export function markPersistentData<T extends Record<string, any>>(data: T): T {
  return {
    ...data,
    offline: data.offline ?? true,
    stale: data.stale ?? true,
  };
}
