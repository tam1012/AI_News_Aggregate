import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { api } from '../services/api';
import { useFetchRaw } from '../hooks/useApi';

/* ── helpers ── */
function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function formatDateHeading(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric', year: 'numeric' });
}

function getDateKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

interface GroupedDay {
  dateKey: string;
  dateLabel: string;
  articles: any[];
}

/* ── main component ── */

function ReadmeWelcome() {
  return (
    <div className="card" style={{ padding: '40px', textAlign: 'center', marginTop: '20px' }}>
      <h2 style={{ fontSize: '1.8rem', marginBottom: '16px', fontFamily: 'var(--font-heading)' }}>Chào mừng đến với NewsTamHV</h2>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: '24px', fontSize: '1.1rem', lineHeight: '1.6' }}>
        Hệ thống đọc tin tự động bằng Trí Tuệ Nhân Tạo.
      </p>
      
      <div style={{ textAlign: 'left', background: 'var(--color-bg)', padding: '24px', borderRadius: 'var(--radius)', fontSize: '0.95rem', lineHeight: '1.7' }}>
        <h3 style={{ marginBottom: '12px' }}>🚀 Cách hoạt động:</h3>
        <ul style={{ paddingLeft: '20px', marginBottom: '20px', color: 'var(--color-text-secondary)' }}>
          <li><strong>Cào tin (Mỗi 1 giờ):</strong> Hệ thống liên tục quét các nguồn tin RSS và báo mạng để lấy bài viết mới nhất.</li>
          <li><strong>Tóm tắt (Tự động):</strong> AI sẽ đọc toàn bộ nội dung gốc và viết lại thành 3 đoạn ngắn gọn.</li>
          <li><strong>Bản tin (Mỗi 1 giờ):</strong> Gom nhóm tất cả tin tức trong ngày thành một "Bản tin thời sự" duy nhất.</li>
        </ul>
        
        <h3 style={{ marginBottom: '12px' }}>💡 Hướng dẫn:</h3>
        <ul style={{ paddingLeft: '20px', color: 'var(--color-text-secondary)' }}>
          <li>Bấm vào bài viết bên trái để đọc chi tiết tóm tắt.</li>
          <li>Chuyển sang tab <strong>Bản tin</strong> để đọc tổng hợp toàn bộ sự kiện trong ngày.</li>
          <li>Chuyển ngày ở khung bên trái để xem lại tin cũ.</li>
        </ul>
      </div>
    </div>
  );
}

export function Home() {
  const [selected, setSelected] = useState<any | null>(null);
  const [tab, setTab] = useState<'news' | 'digest'>('news');
  const [filterSource, setFilterSource] = useState<string>('all');
  const [showFilter, setShowFilter] = useState(false);
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
      if (availableDates.length > 0 && !selectedDate) return Promise.resolve({ data: [] });
      return api.getArticles({ page: 1, limit: 100, status: 'done', date: selectedDate || undefined, sourceId: filterSource === 'all' ? undefined : filterSource });
    },
    [selectedDate, filterSource, availableDates.length]
  );

  const articles: any[] = useMemo(() => raw?.data || [], [raw]);

  // Unique sources for filter (fetch all sources to be safe, but since we are filtering by date, we might miss sources. Ideally we fetch from a sources list)
  // We'll use api.getSources() for a full list, but for now we keep using the current articles if we don't have a separate fetch.
  // Actually, to make filter work properly across dates, we should fetch /sources.
  const { data: sourcesRaw } = useFetchRaw(() => api.getSources(), []);
  const sources = useMemo(() => (sourcesRaw?.data || []).filter((s: any) => s.is_enabled), [sourcesRaw]);

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
    document.body.classList.toggle('detail-open', !!selected);
    return () => { document.body.classList.remove('detail-open'); };
  }, [selected]);

  // Add split-view-active class for desktop body overflow lock
  useEffect(() => {
    document.body.classList.add('split-view-active');
    return () => { document.body.classList.remove('split-view-active'); };
  }, []);

  if (loading) {
    return (
      <div className="feed-container">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="feed-item-skeleton">
            <div className="skeleton" style={{ height: 14, width: '30%', marginBottom: 10 }} />
            <div className="skeleton" style={{ height: 22, width: '85%', marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 14, width: '100%', marginBottom: 4 }} />
            <div className="skeleton" style={{ height: 14, width: '90%', marginBottom: 4 }} />
            <div className="skeleton" style={{ height: 14, width: '60%' }} />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
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
          <button
            className={`feed-tab ${tab === 'news' ? 'active' : ''}`}
            onClick={() => setTab('news')}
          >
            News
          </button>
          <button
            className={`feed-tab ${tab === 'digest' ? 'active' : ''}`}
            onClick={() => setTab('digest')}
          >
            Bản tin
          </button>
        </div>
      )}

      <div className="home-split-layout">
        <div className={`split-left ${tab === 'digest' ? 'hidden-on-mobile' : ''}`} ref={splitLeftRef}>
          {/* Tab bar inside left pane */}
          <div className="feed-tabs">
            <button
              className={`feed-tab ${tab === 'news' ? 'active' : ''}`}
              onClick={() => {
                if (tab === 'news') {
                  // Already on News — scroll to top
                  splitLeftRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
                setTab('news');
              }}
            >
              News
            </button>
            <button
              className={`feed-tab ${tab === 'digest' ? 'active' : ''}`}
              onClick={() => setTab('digest')}
            >
              Bản tin
            </button>
            <div style={{ position: 'relative' }}>
              <button
                className={`icon-btn ${filterSource !== 'all' ? 'active' : ''}`}
                onClick={() => setShowFilter(!showFilter)}
                title="Lọc theo nguồn"
                style={{ width: 32, height: 32, fontSize: '0.85rem' }}
              >
                ▽
              </button>
              {showFilter && (
                <div className="filter-dropdown">
                  <button
                    className={`filter-option ${filterSource === 'all' ? 'active' : ''}`}
                    onClick={() => { setFilterSource('all'); setShowFilter(false); }}
                  >
                    Tất cả nguồn
                  </button>
                  {sources.map(s => (
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
          {/* Active filter indicator */}
          {filterSource !== 'all' && (
            <div className="filter-active">
              <span>Đang lọc: <strong>{sources.find(s => s.id === filterSource)?.name.replace(/ - .*$/, '')}</strong></span>
              <button className="btn btn-sm" onClick={() => setFilterSource('all')}>✕ Bỏ lọc</button>
            </div>
          )}

          <div className="feed-container">
            {availableDates.length > 0 && selectedDate && (
              <div className="date-navigator">
                <button 
                  className="icon-btn" 
                  onClick={handlePrevDate} 
                  disabled={availableDates.findIndex(d => d.date === selectedDate) === availableDates.length - 1}
                  style={{ width: 28, height: 28, fontSize: '0.8rem' }}
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
                  style={{ width: 28, height: 28, fontSize: '0.8rem' }}
                >
                  ›
                </button>
              </div>
            )}

            {articles.length === 0 && !loading ? (
              <div className="empty-state">
                <h2>Chưa có tin tức</h2>
                <p style={{ marginTop: 8 }}>Hệ thống đang cào và tóm tắt tin. Hãy quay lại sau.</p>
                <button className="btn btn-primary" onClick={reload} style={{ marginTop: 16 }}>Tải lại</button>
              </div>
            ) : (
              <div className="feed-day-group">
                {articles.map(article => (
                  <FeedItem
                    key={article.id}
                    article={article}
                    isActive={selected?.id === article.id}
                    onClick={() => {
                      setSelected(article);
                      if (tab !== 'news') setTab('news');
                    }}
                  />
                ))}
              </div>
            )}

            <div className="reader-footer">
              <p>🤖 Tin tức cập nhật mỗi 1 giờ · Tóm tắt bằng AI</p>
            </div>
          </div>
        </div>
      
        <div className={`split-right ${tab === 'news' && !selected ? 'hidden-on-mobile' : ''}`}>
          {tab === 'digest' ? (
            <DigestTab />
          ) : selected ? (
            <ArticleDetail
              article={selected}
              onClose={() => setSelected(null)}
            />
          ) : (
            <ReadmeWelcome />
          )}
        </div>
      </div>

    </>
  );
}

/* ── Feed Item (list row) ── */
function FeedItem({ article, isActive, onClick }: { article: any; isActive?: boolean; onClick: () => void }) {
  const sourceLabel = extractSourceLabel(article);
  const title = cleanTitle(article.title);
  const time = article.published_at ? formatTime(article.published_at) : '';

  // First 2-3 lines of summary as preview
  const preview = useMemo(() => {
    const text = article.summary_text || article.raw_excerpt || '';
    // Strip markdown formatting for preview
    const plain = text
      .replace(/\*\*[^*]+\*\*:?\s*/g, '') // remove bold labels
      .replace(/^[-•]\s*/gm, '')           // remove bullet markers
      .replace(/#{1,3}\s*/g, '')           // remove headings
      .replace(/\n+/g, ' ')
      .trim();
    return plain.substring(0, 200);
  }, [article]);

  return (
    <article className={`feed-item ${isActive ? 'active' : ''}`} onClick={onClick}>
      <div className="feed-item-meta">
        <span className="feed-item-source">{sourceLabel}</span>
        {time && <span className="feed-item-time">{time}</span>}
      </div>
      <h3 className="feed-item-title">{title}</h3>
      <p className="feed-item-preview">{preview}</p>
    </article>
  );
}

/* ── Article Detail (fullscreen overlay) ── */
function ArticleDetail({ article, onClose }: { article: any; onClose: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef(0);
  const startScrollRef = useRef(0);

  const sourceLabel = extractSourceLabel(article);
  const title = cleanTitle(article.title);

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

        {/* Close button */}
        <button className="detail-close" onClick={onClose} title="Đóng (Esc)">✕</button>

        {/* Content */}
        <div className="detail-content">
          <div className="detail-meta">
            <span className="feed-item-source">{sourceLabel}</span>
            {article.published_at && (
              <span className="feed-item-time">
                {new Date(article.published_at).toLocaleString('vi-VN', {
                  day: 'numeric', month: 'numeric', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </span>
            )}
          </div>

          <h1 className="detail-title">{title}</h1>

          {article.image_url && (
            <img
              src={article.image_url}
              alt=""
              className="detail-image"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}

          <div className="detail-body">
            {article.summary_text ? (
              <ReactMarkdown>{article.summary_text}</ReactMarkdown>
            ) : (
              <p>{article.raw_excerpt || 'Chưa có tóm tắt.'}</p>
            )}
          </div>

          <div className="detail-actions">
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
        <ReactMarkdown>{digest.body_markdown}</ReactMarkdown>
      </div>
    </div>
  );
}
