import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { formatTime } from '../pages/home/homeHelpers';

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
}

export function SearchModal({ open, onClose }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Focus input when modal opens
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Global Ctrl+K / Cmd+K shortcut
  useEffect(() => {
    const handleGlobal = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (open) onClose();
        else {
          // Parent handles opening — this is just for closing
        }
      }
    };
    window.addEventListener('keydown', handleGlobal);
    return () => window.removeEventListener('keydown', handleGlobal);
  }, [open, onClose]);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await api.searchArticles(q);
      setResults(res.data || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  };

  const handleSelect = (article: any) => {
    onClose();
    navigate(`/article/${article.id}`);
  };

  if (!open) return null;

  return (
    <div className="search-overlay" onClick={onClose}>
      <div className="search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="search-input-wrapper">
          <svg className="search-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="search-input"
            placeholder="Tìm kiếm bài viết..."
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
          />
          <kbd className="search-kbd">Esc</kbd>
        </div>

        <div className="search-results">
          {loading && (
            <div className="search-status">Đang tìm...</div>
          )}
          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="search-status">Không tìm thấy bài viết nào</div>
          )}
          {!loading && query.length < 2 && query.length > 0 && (
            <div className="search-status">Nhập ít nhất 2 ký tự</div>
          )}
          {results.map((article) => {
            return (
              <button
                key={article.id}
                className="search-result-item"
                onClick={() => handleSelect(article)}
              >
                <div className="search-result-title">{article.title}</div>
                <div className="search-result-meta">
                  <span className="search-result-source">
                    {article.source_name || 'Unknown'}
                  </span>
                  {article.published_at && (
                    <span className="search-result-time">
                      {formatTime(article.published_at)}
                    </span>
                  )}
                </div>
                {article.summary_short && (
                  <div className="search-result-excerpt">
                    {article.summary_short.slice(0, 120)}
                    {article.summary_short.length > 120 ? '...' : ''}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
