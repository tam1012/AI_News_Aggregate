import { isRedditSource } from './registry.js';
import { scrapeRedditSource } from './forum-fetchers.js';
import { SourceFetcher } from './types.js';

export const redditFetcher: SourceFetcher = {
  key: 'reddit',
  canHandle: isRedditSource,
  fetch: scrapeRedditSource,
};
