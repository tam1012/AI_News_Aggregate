import { scrapeRssSource } from './legacy.js';
import { SourceFetcher } from './types.js';

export const rssFetcher: SourceFetcher = {
  key: 'rss',
  canHandle: (source) => source.type === 'rss',
  fetch: scrapeRssSource,
};
