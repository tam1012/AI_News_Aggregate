import { getFetcherForSource } from './fetchers/registry.js';
import { sourceFetchers, SourceRow, ScrapeResult, retryRedditComments } from './fetchers/index.js';

export async function scrapeSource(source: SourceRow): Promise<ScrapeResult> {
  const fetcher = getFetcherForSource(source, sourceFetchers);
  return fetcher.fetch(source);
}

export { retryRedditComments };
export {
  buildRedditRawContent,
  buildVozRawContent,
  browserFetch,
  curlFetch,
  extractVozPagination,
  fetchRedditCommentsForPost,
  flattenRedditComments,
  parseVozPosts,
  scoreForumComment,
  selectForumComments,
} from './fetchers/forum-fetchers.js';
export type { ForumComment, VozPost } from './fetchers/forum-fetchers.js';
