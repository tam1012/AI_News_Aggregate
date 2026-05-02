import { useState } from 'react';
import { api } from '../services/api';
import { useFetch, useFetchRaw } from '../hooks/useApi';

export function Admin() {
  const [tab, setTab] = useState<'overview' | 'ai' | 'articles'>('overview');
  const { data: health, loading, reload } = useFetch(() => api.getHealth());
  const [actionLoading, setActionLoading] = useState('');

  const trigger = async (action: string, fn: () => Promise<any>) => {
    setActionLoading(action);
    try {
      await fn();
      setTimeout(reload, 3000);
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    } finally {
      setActionLoading('');
    }
  };

  return (
    <div style={{ padding: '16px 0' }}>
      <div className="page-header">
        <h1 className="page-title">Quản trị hệ thống</h1>
      </div>

      {/* Tab buttons */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { key: 'overview', label: '📊 Tổng quan' },
          { key: 'ai', label: '🤖 AI Providers' },
          { key: 'articles', label: '📄 Bài viết' },
        ].map(t => (
          <button
            key={t.key}
            className={`btn btn-sm ${tab === t.key ? 'btn-primary' : ''}`}
            onClick={() => setTab(t.key as any)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div>
          {loading ? (
            <div className="loading">Đang tải...</div>
          ) : health ? (
            <div style={{ display: 'grid', gap: 12 }}>
              {/* Stats cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                <div className="card" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{health.sources?.enabled || 0}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>Nguồn tin</div>
                </div>
                <div className="card" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{health.articles?.total || 0}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>Bài viết</div>
                </div>
                <div className="card" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{health.articles?.done || 0}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>Đã tóm tắt</div>
                </div>
                <div className="card" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: health.articles?.pending > 0 ? 'var(--color-warning)' : 'inherit' }}>
                    {health.articles?.pending || 0}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>Chờ xử lý</div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="card">
                <div style={{ fontWeight: 600, marginBottom: 10 }}>Kích hoạt thủ công</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-sm" onClick={() => trigger('scrape', api.triggerScrape)} disabled={!!actionLoading}>
                    {actionLoading === 'scrape' ? 'Đang chạy...' : '🔄 Cào tin'}
                  </button>
                  <button className="btn btn-sm" onClick={() => trigger('summarize', api.triggerSummarize)} disabled={!!actionLoading}>
                    {actionLoading === 'summarize' ? 'Đang chạy...' : '📝 Tóm tắt'}
                  </button>
                  <button className="btn btn-sm" onClick={() => trigger('digest', api.triggerDigest)} disabled={!!actionLoading}>
                    {actionLoading === 'digest' ? 'Đang chạy...' : '📰 Tạo bản tin'}
                  </button>
                  <button className="btn btn-sm" onClick={reload}>Tải lại</button>
                </div>
              </div>

              {/* Recent logs */}
              {health.recentLogs?.length > 0 && (
                <div className="card">
                  <div style={{ fontWeight: 600, marginBottom: 10 }}>Log gần đây</div>
                  {health.recentLogs.map((log: any, i: number) => (
                    <div key={i} style={{ fontSize: '0.82rem', padding: '6px 0', borderBottom: i < health.recentLogs.length - 1 ? '1px solid var(--color-border-light)' : 'none' }}>
                      <span className={`badge badge-${log.status === 'success' ? 'success' : log.status === 'failed' ? 'error' : 'pending'}`}>
                        {log.status}
                      </span>
                      {' '}
                      <span style={{ color: 'var(--color-text-muted)' }}>
                        {new Date(log.started_at).toLocaleString('vi-VN')}
                      </span>
                      {log.items_inserted > 0 && <span> · {log.items_inserted} bài mới</span>}
                      {log.error_message && (
                        <div style={{ color: 'var(--color-error)', fontSize: '0.75rem', marginTop: 2 }}>
                          {log.error_message.substring(0, 100)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {tab === 'ai' && <AiProvidersTab />}
      {tab === 'articles' && <ArticlesTab />}
    </div>
  );
}

/* ===== AI Providers Tab ===== */
function AiProvidersTab() {
  const { data: providers, loading, reload } = useFetch(() => api.getAiProviders());
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState('');

  const handleActivate = async (id: string) => {
    try {
      await api.activateAiProvider(id);
      reload();
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    }
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    try {
      const result = await api.testAiProvider(id);
      setTestResult(prev => ({ ...prev, [id]: `✅ ${result.data?.response?.substring(0, 100) || 'OK'}` }));
    } catch (err: any) {
      setTestResult(prev => ({ ...prev, [id]: `❌ ${err.message}` }));
    } finally {
      setTesting('');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Xóa provider này?')) return;
    await api.deleteAiProvider(id);
    reload();
  };

  if (loading) return <div className="loading">Đang tải...</div>;

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {(providers || []).map((p: any) => (
        <div key={p.id} className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 600 }}>
                {p.name}
                {p.is_active && <span className="badge badge-success" style={{ marginLeft: 6 }}>Active</span>}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                {p.provider_type} · {p.model} · {p.total_calls} calls
              </div>
              {p.last_error_message && (
                <div style={{ fontSize: '0.75rem', color: 'var(--color-error)', marginTop: 2 }}>
                  {p.last_error_message.substring(0, 80)}
                </div>
              )}
              {testResult[p.id] && (
                <div style={{ fontSize: '0.75rem', marginTop: 4 }}>{testResult[p.id]}</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {!p.is_active && (
                <button className="btn btn-sm btn-primary" onClick={() => handleActivate(p.id)}>Kích hoạt</button>
              )}
              <button className="btn btn-sm" onClick={() => handleTest(p.id)} disabled={testing === p.id}>
                {testing === p.id ? '...' : 'Test'}
              </button>
              <button className="btn btn-sm btn-danger" onClick={() => handleDelete(p.id)}>Xóa</button>
            </div>
          </div>
        </div>
      ))}
      {(!providers || providers.length === 0) && (
        <div className="empty-state"><p>Chưa có AI provider nào.</p></div>
      )}
    </div>
  );
}

/* ===== Articles Tab ===== */
function ArticlesTab() {
  const { data: raw, loading, reload } = useFetchRaw(
    () => api.getArticles({ page: 1, limit: 30 }), []
  );
  const articles: any[] = raw?.data || [];

  const handleDelete = async (id: string) => {
    if (!confirm('Xóa bài viết này?')) return;
    await api.deleteArticle(id);
    reload();
  };

  const handleReset = async (id: string) => {
    await api.resetArticleSummary(id);
    reload();
  };

  if (loading) return <div className="loading">Đang tải...</div>;

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
        Hiển thị {articles.length} bài mới nhất
      </div>
      {articles.map((a: any) => (
        <div key={a.id} className="card" style={{ padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {a.title}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span>{a.source_name}</span>
                <span className={`badge badge-${a.summary_status === 'done' ? 'success' : a.summary_status === 'failed' ? 'error' : 'pending'}`}>
                  {a.summary_status}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <button className="btn btn-sm" onClick={() => handleReset(a.id)} title="Tóm tắt lại">🔄</button>
              <button className="btn btn-sm btn-danger" onClick={() => handleDelete(a.id)} title="Xóa">🗑</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}


