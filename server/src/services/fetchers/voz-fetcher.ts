import { isVozSource } from './registry.js';
import { scrapeVozSource } from './forum-fetchers.js';
import { SourceFetcher } from './types.js';

export const vozFetcher: SourceFetcher = {
  key: 'voz',
  canHandle: isVozSource,
  fetch: scrapeVozSource,
};
