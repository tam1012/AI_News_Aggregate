import { SourceFetcher, SourceRow } from './types.js';

function isHost(url: string, hosts: string[]): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hosts.includes(hostname);
  } catch {
    return false;
  }
}

export function isRedditSource(source: Pick<SourceRow, 'url'>): boolean {
  return isHost(source.url, ['reddit.com', 'www.reddit.com']);
}

export function isVozSource(source: Pick<SourceRow, 'url'>): boolean {
  return isHost(source.url, ['voz.vn', 'www.voz.vn']);
}

export function isYoutubeSource(source: Pick<SourceRow, 'type' | 'url'>): boolean {
  if (source.type === 'youtube') return true;
  return isHost(source.url, ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);
}

export function isGitHubTrendingSource(source: Pick<SourceRow, 'type' | 'url'>): boolean {
  if (source.type !== 'web') return false;
  try {
    const parsed = new URL(source.url);
    return parsed.hostname.toLowerCase() === 'github.com' && parsed.pathname.toLowerCase().startsWith('/trending');
  } catch {
    return false;
  }
}

export function getFetcherKeyForSource(source: Pick<SourceRow, 'type' | 'url'>): string {
  if (isRedditSource(source)) return 'reddit';
  if (isVozSource(source)) return 'voz';
  if (isYoutubeSource(source)) return 'youtube';
  if (isGitHubTrendingSource(source)) return 'github-trending';
  if (source.type === 'rss') return 'rss';
  if (source.type === 'web') return 'html';
  throw new Error(`No fetcher registered for source type ${source.type}`);
}

export function getFetcherForSource(source: Pick<SourceRow, 'type' | 'url'>, fetchers: SourceFetcher[]): SourceFetcher {
  const fetcher = fetchers.find((candidate) => candidate.canHandle(source));
  if (!fetcher) throw new Error(`No fetcher registered for source type ${source.type}`);
  return fetcher;
}
