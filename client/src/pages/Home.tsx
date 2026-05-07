import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { api } from '../services/api';
import { useFetchRaw } from '../hooks/useApi';
import { filterArticlesBySelectedDate, getEmptyFeedMessage, getReaderLoadingState, shouldShowDetailPane, shouldShowRightPane, shouldShowScrollTopButton } from './homeUx';

const READ_ARTICLES_STORAGE_KEY = 'read_articles';
const FEED_PREVIEW_MAX_CHARS = 180;
const FEED_PAGE_SIZE = 100;

/* ── helpers ── */
function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function formatDateHeading(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric', year: 'numeric' });
}

function extractSourceLabel(article: any): string {
  const name: string = article.source_name || '';
  // Reddit: extract subreddit from title like [r/technology]
  const m = article.title?.match(/^\[r\/([^\]]+)\]/);
  if (m) return `R/${m[1].toUpperCase()}`;
  // Otherwise shorten source name
  return name.replace(/ - .*$/, '').replace(/ RSS.*$/, '').toUpperCase();
}

function cleanTitle(title: string): string {
  return title.replace(/^\[r\/[^\]]+\]\s*/, '');
}

function stripPreviewMarkup(text: string): string {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/^#+\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function makeShortPreview(text: string, maxChars = FEED_PREVIEW_MAX_CHARS): string {
  const cleaned = stripPreviewMarkup(text);
  if (!cleaned) return '';
  if (cleaned.length <= maxChars) return cleaned;

  const firstSentence = cleaned.match(/^(.{70,180}?[.!?])\s/)?.[1];
  if (firstSentence) return firstSentence.trim();

  const cut = cleaned.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 80 ? lastSpace : maxChars).trim()}…`;
}

function buildFeedPreview(article: any): string {
  if (article.tldr && typeof article.tldr === 'string') {
    const preview = stripPreviewMarkup(article.tldr);
    if (preview.length >= 30) return preview;
  }

  const candidates = [
    article.raw_excerpt,
    article.summary_text,
    article.raw_content,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const preview = makeShortPreview(candidate);
    if (preview.length >= 30) return preview;
  }

  return '';
}

function shouldTryFeedThumbnail(article: any): boolean {
  const imageUrl = String(article.image_url || '').trim();
  if (!imageUrl) return false;

  const title = String(article.title || '').toLowerCase();
  const sourceName = String(article.source_name || '').toLowerCase();
  const url = imageUrl.toLowerCase();
  const articleUrl = String(article.url || '').toLowerCase();

  if (sourceName.includes('reddit') || sourceName.includes('voz') || title.startsWith('[r/') || articleUrl.includes('reddit.com') || articleUrl.includes('voz.vn')) {
    return false;
  }

  if (/avatar|profile|logo|icon|sprite|badge|emoji|placeholder|default|blank|transparent|favicon|redditstatic|snoo|voz\./.test(url)) {
    return false;
  }

  if (/screenshot|screen-shot|screen_shot|capture|thumb\?/.test(url)) {
    return false;
  }

  return true;
}

/* ── image proxy helper ── */
type ImgPreset = 'thumb' | 'detail' | 'og';
function proxyImgUrl(rawUrl: string | null | undefined, preset: ImgPreset = 'detail', baseUrl?: string | null): string {
  const url = String(rawUrl || '').trim();
  if (!url) return '';

  let sourceUrl = url;
  if (url.startsWith('/')) {
    try {
      sourceUrl = new URL(url, baseUrl || window.location.origin).toString();
    } catch {
      return '';
    }
  }

  return `/api/img?url=${encodeURIComponent(sourceUrl)}&p=${preset}`;
}

function isUsefulFeedThumbnail(img: HTMLImageElement): boolean {
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  if (!width || !height) return false;
  if (width < 160 || height < 90) return false;

  const ratio = width / height;
  if (ratio < 0.55 || ratio > 3.2) return false;

  return true;
}

function loadReadArticles(): string[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(READ_ARTICLES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function saveReadArticles(ids: string[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(READ_ARTICLES_STORAGE_KEY, JSON.stringify(ids.slice(0, 500)));
}

/* ── main component ── */

function ReadmeWelcome() {
  return (
    <div className="card" style={{ padding: '40px', textAlign: 'center', marginTop: '20px' }}>
      <h2 style={{ fontSize: '1.8rem', marginBottom: '16px', fontFamily: 'var(--font-heading)' }}>Chào mừng đến với SynthNews</h2>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: '24px', fontSize: '1.1rem', lineHeight: '1.6' }}>
        Hệ thống đọc tin tự động bằng Trí Tuệ Nhân Tạo.
      </p>

      <div style={{ textAlign: 'left', background: 'var(--color-bg)', padding: '24px', borderRadius: 'var(--radius)', fontSize: '0.95rem', lineHeight: '1.7' }}>
        <h3 style={{ marginBottom: '12px' }}>Cách hoạt động:</h3>
        <ul style={{ paddingLeft: '20px', marginBottom: '20px', color: 'var(--color-text-secondary)' }}>
          <li><strong>Cào nguồn (mặc định mỗi 60 phút/source):</strong> Cứ 3 giờ hệ thống kiểm tra các nguồn đến hạn theo <code>next_run_at</code>; nguồn mới mặc định 60 phút/lần, nguồn lỗi sẽ tự backoff tối đa 24 giờ.</li>
          <li><strong>Fetch bài chi tiết (mỗi 5 phút):</strong> URL mới từ RSS, Reddit, VOZ hoặc GitHub Trending được đưa vào queue riêng rồi fetch nội dung chi tiết độc lập.</li>
          <li><strong>Cào lại bình luận forum (mỗi 30 phút):</strong> Các bài Reddit và VOZ mới được cào lại tối đa 2 lần để cập nhật bình luận mới nhất.</li>
          <li><strong>Tóm tắt AI (mỗi 10 phút + khi cần):</strong> AI đọc nội dung gốc và viết lại thành bản tóm tắt tiếng Việt; job retry cũng chạy mỗi 10 phút để mở kẹt lỗi tạm thời.</li>
          <li><strong>Bản tin (mỗi 3 giờ, phút 30):</strong> Gom nhóm tin đã tóm tắt trong ngày thành một "Bản tin thời sự" duy nhất.</li>
        </ul>

        <h3 style={{ marginBottom: '12px' }}>Tính năng chính:</h3>
        <ul style={{ paddingLeft: '20px', marginBottom: '20px', color: 'var(--color-text-secondary)' }}>
          <li>Hỗ trợ nguồn RSS, web scraping, Reddit và VOZ forum.</li>
          <li>Reddit sử dụng Puppeteer (Headless Chrome) để lách Cloudflare.</li>
          <li>Tóm tắt bằng AI với prompt thích ứng theo loại bài viết.</li>
          <li>Nút "Cào lại" thủ công cho Admin để cập nhật bình luận bất kỳ lúc nào.</li>
          <li>Giao diện split view trên desktop, overlay trên mobile.</li>
          <li>Lọc theo nguồn, điều hướng theo ngày, đánh dấu bài đã đọc.</li>
          <li>Dark mode / Light mode.</li>
        </ul>

        <h3 style={{ marginBottom: '12px' }}>Hướng dẫn:</h3>
        <ul style={{ paddingLeft: '20px', color: 'var(--color-text-secondary)' }}>
          <li>Bấm vào bài viết bên trái để đọc chi tiết tóm tắt.</li>
          <li>Chuyển sang tab <strong>Bản tin</strong> để đọc tổng hợp toàn bộ sự kiện trong ngày.</li>
          <li>Chuyển ngày ở khung bên trái để xem lại tin cũ.</li>
        </ul>
      </div>

      <a
        href="https://github.com/tam1012/SynthNews"
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-ghost"
        style={{ marginTop: '20px' }}
      >
        GitHub Repository
      </a>
    </div>
  );
}

type FeedTab = 'news' | 'voz' | 'reddit';
type FeedSort = 'latest' | 'hot';

function classifyArticle(article: any): FeedTab {
  const name = (article.source_name || '').toLowerCase();
  const url = (article.url || '').toLowerCase();
  const title = (article.title || '').toLowerCase();
  const sourceType = (article.source_type || '').toLowerCase();
  if (sourceType === 'youtube' || url.includes('youtube.com') || url.includes('youtu.be')) return 'news';
  if (name.includes('reddit') || url.includes('reddit.com') || title.startsWith('[r/')) return 'reddit';
  if (name.includes('voz') || url.includes('voz.vn')) return 'voz';
  return 'news';
}

export function Home() {
  const location = useLocation();
  const { articleId: urlArticleId } = useParams<{ articleId?: string }>();
  const hasArticleDeepLink = Boolean(urlArticleId);

  // Derive initial tab from URL path
  const initialTab = useMemo(() => {
    const path = location.pathname;
    if (path === '/voz') return 'voz' as const;
    if (path === '/reddit') return 'reddit' as const;
    if (path === '/digest') return 'digest' as const;
    return 'news' as const;
  }, []); // only on mount

  const [selected, setSelected] = useState<any | null>(null);
  const [tab, setTab] = useState<'news' | 'voz' | 'reddit' | 'digest'>(initialTab);
  const [filterSource, setFilterSource] = useState<string>('all');
  const [feedSort, setFeedSort] = useState<FeedSort>('latest');
  const [filterTag, setFilterTag] = useState<string>('');
  const [showFilter, setShowFilter] = useState(false);
  const [showFeedControls, setShowFeedControls] = useState(false);

  // Drag-to-scroll for filters row on desktop
  const filterControlRef = useRef<HTMLDivElement>(null);
  const filtersRowRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({ isDown: false, startX: 0, scrollLeft: 0 });
  const handleFiltersDrag = useMemo(() => ({
    onMouseDown: (e: React.MouseEvent) => {
      const el = filtersRowRef.current;
      if (!el) return;
      dragState.current = { isDown: true, startX: e.pageX - el.offsetLeft, scrollLeft: el.scrollLeft };
      el.style.cursor = 'grabbing';
    },
    onMouseLeave: () => {
      dragState.current.isDown = false;
      if (filtersRowRef.current) filtersRowRef.current.style.cursor = '';
    },
    onMouseUp: () => {
      dragState.current.isDown = false;
      if (filtersRowRef.current) filtersRowRef.current.style.cursor = '';
    },
    onMouseMove: (e: React.MouseEvent) => {
      if (!dragState.current.isDown) return;
      e.preventDefault();
      const el = filtersRowRef.current;
      if (!el) return;
      const x = e.pageX - el.offsetLeft;
      el.scrollLeft = dragState.current.scrollLeft - (x - dragState.current.startX);
    },
  }), []);
  const [readArticleIds, setReadArticleIds] = useState<string[]>(() => loadReadArticles());
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [deepLinkLoading, setDeepLinkLoading] = useState(hasArticleDeepLink);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [articlePages, setArticlePages] = useState<any[]>([]);
  const [articlePage, setArticlePage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const splitLeftRef = useRef<HTMLDivElement>(null);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Fetch available dates
  const { data: datesRaw } = useFetchRaw(
    () => api.getArticleDates(filterSource === 'all' ? undefined : filterSource),
    [filterSource]
  );
  const availableDates: { date: string, count: number }[] = useMemo(() => datesRaw?.data || [], [datesRaw]);

  // Set default selected date
  useEffect(() => {
    if (availableDates.length > 0 && (!selectedDate || !availableDates.find(d => d.date === selectedDate))) {
      setSelectedDate(availableDates[0].date);
    }
  }, [availableDates, selectedDate]);

  const { data: raw, loading, error, reload } = useFetchRaw(
    () => {
      // Don't fetch until we have a date, unless there are no dates at all
      if (availableDates.length > 0 && !selectedDate) return Promise.resolve({ data: [], meta: { total: 0, page: 1, totalPages: 0 } });
      return api.getArticles({ page: 1, limit: FEED_PAGE_SIZE, status: 'done', date: selectedDate || undefined, sourceId: filterSource === 'all' ? undefined : filterSource, feedTab: tab === 'digest' ? 'news' : tab, sort: feedSort, tag: filterTag || undefined });
    },
    [selectedDate, filterSource, availableDates.length, tab, feedSort, filterTag]
  );

  useEffect(() => {
    setArticlePages(raw?.data || []);
    setArticlePage(1);
    setLoadMoreError(null);
  }, [raw]);

  const allArticles: any[] = useMemo(() => filterArticlesBySelectedDate(articlePages, selectedDate), [articlePages, selectedDate]);
  const isShowingOfflineCache = Boolean(raw?.offline || raw?.stale || datesRaw?.offline || datesRaw?.stale);

  const articles: any[] = allArticles;
  const hasMoreArticles = Boolean(raw?.meta && articlePages.length < raw.meta.total);
  const loadedArticleCount = articlePages.length;
  const totalArticleCount = raw?.meta?.total || loadedArticleCount;

  // Unique sources for filter (fetch all sources to be safe, but since we are filtering by date, we might miss sources. Ideally we fetch from a sources list)
  // We'll use api.getSources() for a full list, but for now we keep using the current articles if we don't have a separate fetch.
  // Actually, to make filter work properly across dates, we should fetch /sources.
  const { data: sourcesRaw } = useFetchRaw(() => api.getSources(), []);
  const sources = useMemo(() => (sourcesRaw?.data || []).filter((s: any) => s.is_enabled), [sourcesRaw]);

  // Fetch popular tags for topic chips
  const { data: tagsRaw } = useFetchRaw(
    () => api.getArticleTags({ feedTab: tab === 'digest' ? 'news' : tab, date: selectedDate || undefined }),
    [tab, selectedDate]
  );
  const popularTags: { tag: string; count: number }[] = useMemo(() => tagsRaw?.data || [], [tagsRaw]);
  // After filter changes, scroll the active chip into center view
  const scrollActiveChipToCenter = useCallback(() => {
    const el = filtersRowRef.current;
    if (!el) return;
    const activeChip = el.querySelector('.topic-chip.active') as HTMLElement;
    if (activeChip) {
      const containerRect = el.getBoundingClientRect();
      const chipRect = activeChip.getBoundingClientRect();
      const scrollTarget = el.scrollLeft + (chipRect.left - containerRect.left) - (containerRect.width / 2) + (chipRect.width / 2);
      el.scrollTo({ left: Math.max(0, scrollTarget), behavior: 'smooth' });
    }
  }, []);
  useEffect(() => {
    if (!filterTag) return;
    // Retry at multiple intervals to handle React re-render timing
    const t1 = setTimeout(scrollActiveChipToCenter, 50);
    const t2 = setTimeout(scrollActiveChipToCenter, 300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [filterTag, scrollActiveChipToCenter]);

  useEffect(() => {
    if (!filterTag || popularTags.some(t => t.tag === filterTag)) return;
    setFilterTag('');
  }, [filterTag, popularTags]);

  useEffect(() => {
    if (!showFilter) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (!filterControlRef.current?.contains(event.target as Node)) {
        setShowFilter(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFilter]);

  const readArticleSet = useMemo(() => new Set(readArticleIds), [readArticleIds]);

  const readerLoadingState = getReaderLoadingState({ isFeedLoading: loading, hasArticleDeepLink });
  const detailPaneVisible = shouldShowDetailPane({
    tab,
    hasSelectedArticle: Boolean(selected),
    hasArticleDeepLink,
  });
  const rightPaneVisible = shouldShowRightPane({
    tab,
    hasSelectedArticle: Boolean(selected),
    hasArticleDeepLink,
  });
  const emptyFeedMessage = getEmptyFeedMessage({
    isOfflineCache: isShowingOfflineCache,
    hasFilter: filterSource !== 'all' || tab !== 'news',
    tab,
  });

  const scrollFeedToTop = useCallback(() => {
    splitLeftRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleManualRefresh = useCallback(async () => {
    setIsRefreshing(true);
    const startedAt = Date.now();
    try {
      await reload();
    } finally {
      const remainingMs = Math.max(0, 450 - (Date.now() - startedAt));
      window.setTimeout(() => setIsRefreshing(false), remainingMs);
    }
  }, [reload]);

  const handleLoadMoreArticles = useCallback(async () => {
    if (isLoadingMore || !hasMoreArticles) return;
    const nextPage = articlePage + 1;
    setIsLoadingMore(true);
    setLoadMoreError(null);
    try {
      const response = await api.getArticles({ page: nextPage, limit: FEED_PAGE_SIZE, status: 'done', date: selectedDate || undefined, sourceId: filterSource === 'all' ? undefined : filterSource, feedTab: tab === 'digest' ? 'news' : tab, sort: feedSort, tag: filterTag || undefined });
      setArticlePages(prev => [...prev, ...(response?.data || [])]);
      setArticlePage(nextPage);
    } catch (err: any) {
      setLoadMoreError(err.message || 'Không thể tải thêm bài cũ.');
    } finally {
      setIsLoadingMore(false);
    }
  }, [articlePage, feedSort, filterSource, filterTag, hasMoreArticles, isLoadingMore, selectedDate, tab]);

  // Date navigation handlers
  const handlePrevDate = () => {
    if (!selectedDate) return;
    const idx = availableDates.findIndex(d => d.date === selectedDate);
    if (idx < availableDates.length - 1) setSelectedDate(availableDates[idx + 1].date);
  };

  const handleNextDate = () => {
    if (!selectedDate) return;
    const idx = availableDates.findIndex(d => d.date === selectedDate);
    if (idx > 0) setSelectedDate(availableDates[idx - 1].date);
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selected) setSelected(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selected]);

  // Lock body scroll when detail open (handled via CSS class for mobile only)
  useEffect(() => {
    if (!detailPaneVisible) {
      document.body.classList.remove('detail-open');
      document.body.style.removeProperty('top');
      document.body.style.removeProperty('width');
      return;
    }

    const scrollY = window.scrollY;
    document.body.classList.add('detail-open');
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';

    return () => {
      document.body.classList.remove('detail-open');
      document.body.style.removeProperty('top');
      document.body.style.removeProperty('width');
      window.scrollTo({ top: scrollY, behavior: 'instant' });
    };
  }, [detailPaneVisible]);

  // Add split-view-active class for desktop body overflow lock
  useEffect(() => {
    document.body.classList.add('split-view-active');
    return () => { document.body.classList.remove('split-view-active'); };
  }, []);

  useEffect(() => {
    const updateScrollTopState = () => {
      const paneScrollY = splitLeftRef.current?.scrollTop || 0;
      setShowScrollTop(shouldShowScrollTopButton(Math.max(window.scrollY, paneScrollY), detailPaneVisible));
    };

    updateScrollTopState();
    window.addEventListener('scroll', updateScrollTopState, { passive: true });
    const splitLeft = splitLeftRef.current;
    splitLeft?.addEventListener('scroll', updateScrollTopState, { passive: true });
    return () => {
      window.removeEventListener('scroll', updateScrollTopState);
      splitLeft?.removeEventListener('scroll', updateScrollTopState);
    };
  }, [detailPaneVisible]);

  useEffect(() => {
    saveReadArticles(readArticleIds);
  }, [readArticleIds]);

  useEffect(() => {
    if (!copyToast) return;
    const timeoutId = window.setTimeout(() => setCopyToast(null), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [copyToast]);

  useEffect(() => {
    document.title = selected
      ? `${cleanTitle(selected.title)} | SynthNews`
      : 'SynthNews — Tin tức tổng hợp AI';
  }, [selected]);

  // Navigate helper: sync tab to URL (no React Router re-render)
  const navigateTab = useCallback((t: 'news' | 'voz' | 'reddit' | 'digest') => {
    setTab(t);
    const path = t === 'news' ? '/' : `/${t}`;
    window.history.replaceState(null, '', path);
  }, []);

  // Load article from URL deep link (/article/:id)
  useEffect(() => {
    if (!urlArticleId) {
      setDeepLinkLoading(false);
      return;
    }

    let isActive = true;
    setDeepLinkLoading(true);
    api.getArticle(urlArticleId).then((res: any) => {
      if (!isActive) return;
      if (res?.data) {
        setSelected(res.data);
        setReadArticleIds(prev => (prev.includes(res.data.id) ? prev : [res.data.id, ...prev]));
        // Set tab based on article type
        const articleTab = classifyArticle(res.data);
        setTab(articleTab);
      }
    }).catch(() => {
      if (!isActive) return;
      // Article not found, go to news
      window.history.replaceState(null, '', '/');
    }).finally(() => {
      if (isActive) setDeepLinkLoading(false);
    });
    return () => { isActive = false; };
  }, [urlArticleId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectArticle = useCallback((article: any) => {
    setSelected(article);
    setReadArticleIds(prev => (prev.includes(article.id) ? prev : [article.id, ...prev]));
    // Update URL to article deep link (no re-render)
    window.history.replaceState(null, '', `/article/${article.id}`);
    // Stay on current feed tab, just make sure we're not on digest
    if (tab === 'digest') setTab('news');
  }, [tab]);

  const handleCopyLink = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopyToast('Đã copy link bài gốc');
    } catch {
      setCopyToast('Không thể copy link');
    }
  }, []);

  if (loading && readerLoadingState === 'feed-only') {
    return (
      <div className="feed-container">
        <FeedListSkeleton />
      </div>
    );
  }

  if (error && !hasArticleDeepLink) {
    return (
      <div className="empty-state">
        <p style={{ color: 'var(--color-error)' }}>Lỗi: {error}</p>
        <button className="btn btn-primary" onClick={reload} style={{ marginTop: 12 }}>Thử lại</button>
      </div>
    );
  }

  return (
    <>
      {/* Mobile-only tab bar — visible when digest tab is active (split-left is hidden) */}
      {tab === 'digest' && (
        <div className="feed-tabs visible-on-mobile-only">
          <button className="feed-tab" onClick={() => navigateTab('news')}>Tin mới</button>
          <button className="feed-tab" onClick={() => navigateTab('voz')}>VOZ</button>
          <button className="feed-tab" onClick={() => navigateTab('reddit')}>Reddit</button>
          <button className={`feed-tab active`} onClick={() => navigateTab('digest')}>Bản tin</button>
        </div>
      )}

      <div className="home-split-layout">
        <div className={`split-left ${tab === 'digest' ? 'hidden-on-mobile' : ''}`} ref={splitLeftRef}>
          {/* Tab bar inside left pane */}
          <div className="split-feed-toolbar">
            <div className="toolbar-tabs-row">
              <div className="feed-tabs">
                {(['news', 'voz', 'reddit'] as const).map(t => (
                  <button
                    key={t}
                    className={`feed-tab ${tab === t ? 'active' : ''}`}
                    onClick={() => {
                      if (tab === t) {
                        scrollFeedToTop();
                      }
                      navigateTab(t);
                      setSelected(null);
                      setFilterTag('');
                    }}
                  >
                    {t === 'news' ? 'Tin mới' : t === 'voz' ? 'VOZ' : 'Reddit'}
                  </button>
                ))}
                <button
                  className={`feed-tab ${tab === 'digest' ? 'active' : ''}`}
                  onClick={() => navigateTab('digest')}
                >
                  Bản tin
                </button>
              </div>
              <button
                className={`icon-btn ${showFeedControls || filterSource !== 'all' || filterTag ? 'active' : ''}`}
                onClick={() => setShowFeedControls(prev => !prev)}
                title="Bộ lọc"
                style={{ width: 32, height: 32, fontSize: '0.85rem' }}
              >
                ⚙
              </button>
              <button
                className="icon-btn"
                onClick={() => void handleManualRefresh()}
                disabled={isRefreshing || loading}
                title="Làm mới"
                style={{ width: 32, height: 32, fontSize: '0.85rem' }}
              >
                ↻
              </button>
            </div>
            {showFeedControls && (
              <div className="toolbar-filters-panel">
                <div className="toolbar-filters-row">
                  <div className="sort-toggle">
                    <button
                      className={`sort-btn ${feedSort === 'latest' ? 'active' : ''}`}
                      onClick={() => setFeedSort('latest')}
                      type="button"
                    >
                      Mới nhất
                    </button>
                    <button
                      className={`sort-btn ${feedSort === 'hot' ? 'active' : ''}`}
                      onClick={() => setFeedSort('hot')}
                      type="button"
                    >
                      Tin nóng
                    </button>
                  </div>
                  <div className="feed-filter-control" ref={filterControlRef}>
                    <button
                      className={`btn btn-sm ${filterSource !== 'all' ? 'btn-active' : ''}`}
                      onClick={() => setShowFilter(!showFilter)}
                      type="button"
                    >
                      {filterSource === 'all' ? 'Nguồn' : sources.find((s: any) => s.id === filterSource)?.name.replace(/ - .*$/, '').replace(/ RSS.*$/, '')}
                    </button>
                    {showFilter && (
                      <div className="filter-dropdown">
                        <button
                          className={`filter-option ${filterSource === 'all' ? 'active' : ''}`}
                          onClick={() => { setFilterSource('all'); setShowFilter(false); }}
                        >
                          Tất cả nguồn
                        </button>
                        {sources.map((s: any) => (
                          <button
                            key={s.id}
                            className={`filter-option ${filterSource === s.id ? 'active' : ''}`}
                            onClick={() => { setFilterSource(s.id); setShowFilter(false); }}
                          >
                            {s.name.replace(/ - .*$/, '').replace(/ RSS.*$/, '')}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {availableDates.length > 0 && selectedDate && (
                  <div className="date-navigator compact">
                    <button
                      className="icon-btn"
                      onClick={handlePrevDate}
                      disabled={availableDates.findIndex(d => d.date === selectedDate) === availableDates.length - 1}
                    >
                      ‹
                    </button>
                    <span className="date-navigator-label">
                      {formatDateHeading(selectedDate)}
                    </span>
                    <button
                      className="icon-btn"
                      onClick={handleNextDate}
                      disabled={availableDates.findIndex(d => d.date === selectedDate) === 0}
                    >
                      ›
                    </button>
                  </div>
                )}
                {popularTags.length > 0 && (
                  <div className="topic-scroll" ref={filtersRowRef} {...handleFiltersDrag}>
                    <button
                      className={`topic-chip ${filterTag ? '' : 'active'}`}
                      onClick={() => setFilterTag('')}
                      type="button"
                      title="Hiển thị tất cả chủ đề"
                    >
                      Tất cả
                    </button>
                    {popularTags.slice(0, 8).map(t => (
                      <button
                        key={t.tag}
                        className={`topic-chip ${filterTag === t.tag ? 'active' : ''}`}
                        onClick={() => setFilterTag(filterTag === t.tag ? '' : t.tag)}
                        type="button"
                        title={`${t.count} bài`}
                      >
                        {t.tag}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Active filter indicator */}
          {filterSource !== 'all' && (
            <div className="filter-active">
              <span>Đang lọc: <strong>{sources.find((s: any) => s.id === filterSource)?.name.replace(/ - .*$/, '')}</strong></span>
              <button className="btn btn-sm" onClick={() => setFilterSource('all')}>✕ Bỏ lọc</button>
            </div>
          )}

          <div className="feed-container">
            {isShowingOfflineCache && (
              <div className="offline-cache-banner">
                Đang hiển thị dữ liệu đã lưu. Một số tin mới có thể chưa được cập nhật.
              </div>
            )}

            {isRefreshing && (
              <div className="feed-refresh-row">
                Đang cập nhật tin mới...
              </div>
            )}

            {loading ? (
              <FeedListSkeleton />
            ) : error ? (
              <div className="empty-state">
                <p style={{ color: 'var(--color-error)' }}>Lỗi: {error}</p>
                <button className="btn btn-primary" onClick={reload} style={{ marginTop: 12 }}>Thử lại</button>
              </div>
            ) : articles.length === 0 ? (
              <div className="empty-state">
                <h2>Chưa có tin tức</h2>
                <p style={{ marginTop: 8 }}>{emptyFeedMessage}</p>
                <button className="btn btn-primary" onClick={() => void handleManualRefresh()} style={{ marginTop: 16 }}>Tải lại</button>
              </div>
            ) : (
              <>
                <div className="feed-day-group">
                  {articles.map(article => (
                    <FeedItem
                      key={article.id}
                      article={article}
                      isActive={selected?.id === article.id}
                      isRead={readArticleSet.has(article.id)}
                      onClick={() => handleSelectArticle(article)}
                    />
                  ))}
                </div>
                <div className="feed-load-more">
                  {loadMoreError && <p className="feed-load-more-error">{loadMoreError}</p>}
                  {hasMoreArticles ? (
                    <button className="btn btn-ghost" onClick={() => void handleLoadMoreArticles()} disabled={isLoadingMore}>
                      {isLoadingMore ? 'Đang tải thêm...' : `Tải thêm bài cũ (${loadedArticleCount}/${totalArticleCount})`}
                    </button>
                  ) : (
                    <p>Đã hiển thị hết bài trong ngày này.</p>
                  )}
                </div>
              </>
            )}

            <div className="reader-footer">
              <p>Nguồn mặc định cào mỗi 60 phút và tự backoff khi lỗi · Fetch bài mỗi 5 phút · Tóm tắt AI mỗi 10 phút</p>
            </div>
          </div>
        </div>
      
        <div className={`split-right ${!rightPaneVisible ? 'hidden-on-mobile' : ''}`}>
          {tab === 'digest' ? (
            <DigestTab />
          ) : selected ? (
            <ArticleDetail
              article={selected}
              onClose={() => {
                setSelected(null);
                // Navigate back to current tab URL (no re-render)
                const path = tab === 'news' ? '/' : `/${tab}`;
                window.history.replaceState(null, '', path);
              }}
              onCopyLink={handleCopyLink}
            />
          ) : hasArticleDeepLink && deepLinkLoading ? (
            <ArticleDetailSkeleton />
          ) : (
            <ReadmeWelcome />
          )}
        </div>
      </div>

      {showScrollTop && (
        <button className="scroll-top-button" onClick={scrollFeedToTop} aria-label="Lên đầu danh sách">
          ↑
        </button>
      )}

      {copyToast && <div className="copy-toast">{copyToast}</div>}

    </>
  );
}

/* ── Feed Item (list row) ── */
function FeedListSkeleton() {
  return (
    <>
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="feed-item-skeleton">
          <div className="skeleton" style={{ height: 14, width: '30%', marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 22, width: '85%', marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 14, width: '100%', marginBottom: 4 }} />
          <div className="skeleton" style={{ height: 14, width: '90%', marginBottom: 4 }} />
          <div className="skeleton" style={{ height: 14, width: '60%' }} />
        </div>
      ))}
    </>
  );
}

function ArticleDetailSkeleton() {
  return (
    <div className="detail-overlay" aria-busy="true">
      <div className="detail-panel">
        <div className="detail-pull-bar">
          <div className="detail-pull-indicator" />
        </div>
        <div className="detail-content detail-skeleton">
          <div className="skeleton" style={{ width: 96, height: 12, margin: '14px auto 10px' }} />
          <div className="skeleton" style={{ width: 160, height: 12, margin: '0 auto 28px' }} />
          <div className="skeleton" style={{ width: '78%', height: 42, margin: '0 auto 12px' }} />
          <div className="skeleton" style={{ width: '52%', height: 42, margin: '0 auto 36px' }} />
          <div className="detail-image-skeleton skeleton" />
          <div className="detail-body-skeleton">
            <div className="skeleton" style={{ width: '60%', height: 24, marginBottom: 24 }} />
            <div className="skeleton" style={{ width: '100%', height: 16, marginBottom: 10 }} />
            <div className="skeleton" style={{ width: '94%', height: 16, marginBottom: 10 }} />
            <div className="skeleton" style={{ width: '88%', height: 16, marginBottom: 10 }} />
            <div className="skeleton" style={{ width: '72%', height: 16 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function FeedItem({
  article,
  isActive,
  isRead,
  onClick,
}: {
  article: any;
  isActive?: boolean;
  isRead?: boolean;
  onClick: () => void;
}) {
  const sourceLabel = extractSourceLabel(article);
  const title = cleanTitle(article.title);
  const time = article.published_at ? formatTime(article.published_at) : '';

  const [showThumbnail, setShowThumbnail] = useState(() => shouldTryFeedThumbnail(article));

  useEffect(() => {
    setShowThumbnail(shouldTryFeedThumbnail(article));
  }, [article.id, article.image_url]);

  const preview = useMemo(() => {
    return buildFeedPreview(article);
  }, [article]);

  return (
    <article className={`feed-item ${isActive ? 'active' : ''} ${isRead ? 'is-read' : ''}`} onClick={onClick}>
      <div className="feed-item-meta">
        <span className={`feed-item-source source-${sourceLabel.toLowerCase().replace(/[^a-z0-9]/g, '')}`}>
          {sourceLabel}
        </span>
        {time && <span className="feed-item-time">{time}</span>}
      </div>
      <div className="feed-item-body">
        <div className="feed-item-text">
          <h3 className="feed-item-title">{title}</h3>
          <p className="feed-item-preview">{preview}</p>
        </div>
        {showThumbnail && article.image_url && (
          <img
            src={proxyImgUrl(article.image_url, 'thumb', article.url)}
            alt=""
            className="feed-item-thumb"
            loading="lazy"
            onLoad={(e) => { if (!isUsefulFeedThumbnail(e.currentTarget)) setShowThumbnail(false); }}
            onError={() => setShowThumbnail(false)}
          />
        )}
      </div>
    </article>
  );
}

/* ── Article Detail (fullscreen overlay) ── */
function ArticleDetail({
  article,
  onClose,
  onCopyLink,
}: {
  article: any;
  onClose: () => void;
  onCopyLink: (url: string) => void | Promise<void>;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef(0);
  const startScrollRef = useRef(0);

  const sourceLabel = extractSourceLabel(article);
  const title = cleanTitle(article.title);

  // Auto-scroll detail panel to top when article changes
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [article.id]);

  // Split summary into TL;DR and Body
  const summaryParts = useMemo(() => {
    const tldr = (article.tldr || '').trim();
    const rest = (article.summary_text || '').trim();
    return { tldr, rest };
  }, [article.tldr, article.summary_text]);

  // Pull-to-close gesture
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startYRef.current = e.touches[0].clientY;
    startScrollRef.current = contentRef.current?.scrollTop || 0;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const currentY = e.touches[0].clientY;
    const diff = currentY - startYRef.current;
    // Only allow drag-down when scrolled to top
    if (startScrollRef.current <= 0 && diff > 0) {
      setIsDragging(true);
      setDragY(Math.min(diff * 0.6, 300));
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (isDragging) {
      if (dragY > 120) {
        onClose();
      } else {
        setDragY(0);
      }
      setIsDragging(false);
    }
  }, [isDragging, dragY, onClose]);

  // Backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  const opacity = isDragging ? Math.max(0.2, 1 - dragY / 300) : 1;

  return (
    <div
      className="detail-overlay"
      ref={overlayRef}
      onClick={handleBackdropClick}
      style={{ backgroundColor: `rgba(0,0,0,${0.5 * opacity})` }}
    >
      <div
        className="detail-panel"
        ref={contentRef}
        style={{
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.16,1,0.3,1)',
          opacity,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Pull indicator */}
        <div className="detail-pull-bar">
          <div className="detail-pull-indicator" />
        </div>

        <div className="detail-mobile-header">
          <button className="detail-mobile-close" onClick={onClose} title="Close">x</button>
          <div className="detail-mobile-meta">
            <span className={`feed-item-source source-${sourceLabel.toLowerCase().replace(/[^a-z0-9]/g, '')}`}>
              {sourceLabel}
            </span>
            <span className="detail-mobile-title">{title}</span>
          </div>
        </div>

        {/* Close button */}
        <button className="detail-close" onClick={onClose} title="Đóng (Esc)">✕</button>

        {/* Content */}
        <div className="detail-content">
          <div className="detail-meta-centered">
            <span className={`feed-item-source source-${sourceLabel.toLowerCase().replace(/[^a-z0-9]/g, '')}`}>
              {sourceLabel}
            </span>
            {article.published_at && (
              <span className="feed-item-time">
                {new Date(article.published_at).toLocaleString('vi-VN', {
                  day: 'numeric', month: 'numeric', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </span>
            )}
          </div>

          <h1 className="detail-title-editorial">{title}</h1>

          {summaryParts.tldr && (
            <div className="ai-tldr-box">
              <div className="ai-tldr-header">Tóm tắt nhanh</div>
              <p>{summaryParts.tldr}</p>
            </div>
          )}

          {article.image_url && (
            <img
              src={proxyImgUrl(article.image_url, 'detail', article.url)}
              alt=""
              className="detail-image"
              loading="lazy"
              decoding="async"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}

          <div className="detail-body">
            {article.summary_text ? (
              <div className="article-main-content">
                <ReactMarkdown
                  components={{
                    img: ({ node, ...props }) => (
                      <img {...props} src={proxyImgUrl(props.src, 'detail')} loading="lazy" decoding="async" />
                    )
                  }}
                >
                  {summaryParts.rest}
                </ReactMarkdown>
              </div>
            ) : (
              <p>{article.raw_excerpt || 'Chưa có tóm tắt.'}</p>
            )}
          </div>

          <div className="detail-actions">
            <button className="btn btn-ghost" onClick={() => void onCopyLink(article.url)}>
              Copy link
            </button>
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary"
            >
              Đọc bài gốc ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Digest Tab ── */
function DigestTab() {
  const { data: raw, loading, error } = useFetchRaw(
    () => api.getLatestDigest('vi'), []
  );
  const digest = (raw as any)?.data;

  if (loading) return <div className="loading" style={{ padding: 40 }}>Đang tải bản tin...</div>;
  if (error) return <div className="empty-state"><p>Chưa có bản tin tổng hợp.</p></div>;
  if (!digest) return <div className="empty-state"><p>Chưa có bản tin tổng hợp nào.</p></div>;

  return (
    <div className="feed-container" style={{ padding: '0 20px' }}>
      <h2 className="feed-date-heading" style={{ paddingTop: 0 }}>{digest.title || `Bản tin ${digest.digest_date}`}</h2>
      <div className="digest-content">
        <ReactMarkdown
          components={{
            img: ({ node, ...props }) => (
              <img {...props} src={proxyImgUrl(props.src, 'detail')} loading="lazy" decoding="async" />
            )
          }}
        >
          {digest.body_markdown}
        </ReactMarkdown>
      </div>
    </div>
  );
}
