import { scrapeWebSource } from './legacy.js';
import { SourceFetcher } from './types.js';

export const htmlFetcher: SourceFetcher = {
  key: 'html',
  canHandle: (source) => source.type === 'web',
  fetch: scrapeWebSource,
};
