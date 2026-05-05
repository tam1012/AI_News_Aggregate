import { htmlFetcher } from './html-fetcher.js';
import { redditFetcher } from './reddit-fetcher.js';
import { rssFetcher } from './rss-fetcher.js';
import { vozFetcher } from './voz-fetcher.js';
import { youtubeFetcher } from './youtube-fetcher.js';
import { SourceFetcher } from './types.js';

export const sourceFetchers: SourceFetcher[] = [
  redditFetcher,
  vozFetcher,
  youtubeFetcher,
  rssFetcher,
  htmlFetcher,
];

export * from './types.js';
export * from './forum-fetchers.js';
