export type ReaderTab = 'news' | 'voz' | 'reddit' | 'youtube' | 'digest';
export type ReaderLoadingState = 'feed-only' | 'split';

export function getReaderLoadingState({
  isFeedLoading,
  hasArticleDeepLink,
}: {
  isFeedLoading: boolean;
  hasArticleDeepLink: boolean;
}): ReaderLoadingState {
  return isFeedLoading && !hasArticleDeepLink ? 'feed-only' : 'split';
}

export function shouldShowDetailPane({
  tab,
  hasSelectedArticle,
  hasArticleDeepLink,
}: {
  tab: ReaderTab;
  hasSelectedArticle: boolean;
  hasArticleDeepLink: boolean;
}): boolean {
  return tab !== 'digest' && (hasSelectedArticle || hasArticleDeepLink);
}

export function shouldShowRightPane({
  tab,
  hasSelectedArticle,
  hasArticleDeepLink,
}: {
  tab: ReaderTab;
  hasSelectedArticle: boolean;
  hasArticleDeepLink: boolean;
}): boolean {
  return tab === 'digest' || shouldShowDetailPane({ tab, hasSelectedArticle, hasArticleDeepLink });
}
