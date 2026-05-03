import { useState } from 'react';
import { api } from '../services/api';
import { useFetch, useFetchRaw } from '../hooks/useApi';

type AiProviderFormData = {
  name: string;
  provider_type: string;
  model: string;
  api_endpoint: string;
  api_key: string;
  project_id: string;
  region: string;
  service_account_json: string;
  max_tokens: number;
  temperature: string;
  extra_config: string;
};

const AI_PROVIDER_TYPES = ['vertex_ai', 'openai', 'gemini', 'xai', 'mimo', 'anthropic', 'deepseek', 'groq', 'custom'];

function createEmptyAiProviderForm(): AiProviderFormData {
  return {
    name: '',
    provider_type: 'openai',
    model: '',
    api_endpoint: '',
    api_key: '',
    project_id: '',
    region: '',
    service_account_json: '',
    max_tokens: 1024,
    temperature: '0.3',
    extra_config: '',
  };
}

function formatExtraConfig(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}

export function Admin() {
  const [tab, setTab] = useState<'overview' | 'ai' | 'articles'>('overview');
  const { data: health, loading, reload } = useFetch<any>(() => api.getHealth());
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

function AiProvidersTab() {
  const { data: providers, loading, reload } = useFetch<any[]>(() => api.getAiProviders());
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [formError, setFormError] = useState('');
  const [formData, setFormData] = useState<AiProviderFormData>(() => createEmptyAiProviderForm());
  const [hasExistingApiKey, setHasExistingApiKey] = useState(false);
  const [hasExistingServiceAccount, setHasExistingServiceAccount] = useState(false);
  const [clearApiKey, setClearApiKey] = useState(false);
  const [clearServiceAccount, setClearServiceAccount] = useState(false);

  const resetForm = () => {
    setFormData(createEmptyAiProviderForm());
    setEditingId(null);
    setShowForm(false);
    setFormError('');
    setLoadingDetails(false);
    setHasExistingApiKey(false);
    setHasExistingServiceAccount(false);
    setClearApiKey(false);
    setClearServiceAccount(false);
  };

  const openCreateForm = () => {
    setFormData(createEmptyAiProviderForm());
    setEditingId(null);
    setFormError('');
    setHasExistingApiKey(false);
    setHasExistingServiceAccount(false);
    setClearApiKey(false);
    setClearServiceAccount(false);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

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
    try {
      await api.deleteAiProvider(id);
      reload();
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    }
  };

  const handleEdit = async (id: string) => {
    setLoadingDetails(true);
    setFormError('');
    setShowForm(true);
    setEditingId(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    try {
      const result = await api.getAiProvider(id);
      const provider = result.data;
      setFormData({
        name: provider.name || '',
        provider_type: provider.provider_type || 'openai',
        model: provider.model || '',
        api_endpoint: provider.api_endpoint || '',
        api_key: '',
        project_id: provider.project_id || '',
        region: provider.region || '',
        service_account_json: '',
        max_tokens: provider.max_tokens || 1024,
        temperature: provider.temperature !== undefined && provider.temperature !== null ? String(provider.temperature) : '0.3',
        extra_config: formatExtraConfig(provider.extra_config),
      });
      setHasExistingApiKey(Boolean(provider.has_api_key));
      setHasExistingServiceAccount(Boolean(provider.has_service_account));
      setClearApiKey(false);
      setClearServiceAccount(false);
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');

    try {
      let parsedExtraConfig: any = undefined;
      const extraConfigText = formData.extra_config.trim();
      if (extraConfigText) {
        parsedExtraConfig = JSON.parse(extraConfigText);
      }

      const payload: Record<string, any> = {
        name: formData.name.trim(),
        provider_type: formData.provider_type,
        model: formData.model.trim(),
        api_endpoint: formData.api_endpoint.trim() || null,
        project_id: formData.project_id.trim() || null,
        region: formData.region.trim() || null,
        max_tokens: Number(formData.max_tokens) || 1024,
        temperature: formData.temperature.trim() === '' ? 0.3 : Number(formData.temperature),
        extra_config: parsedExtraConfig,
      };

      if (Number.isNaN(payload.temperature)) {
        throw new Error('Temperature phải là số hợp lệ');
      }

      if (editingId) {
        if (formData.api_key.trim()) {
          payload.api_key = formData.api_key.trim();
        } else if (clearApiKey) {
          payload.api_key = '';
        }

        if (formData.service_account_json.trim()) {
          payload.service_account_json = formData.service_account_json.trim();
        } else if (clearServiceAccount) {
          payload.service_account_json = '';
        }

        await api.updateAiProvider(editingId, payload);
      } else {
        payload.api_key = formData.api_key.trim() || null;
        payload.service_account_json = formData.service_account_json.trim() || null;
        await api.createAiProvider(payload);
      }

      resetForm();
      reload();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading">Đang tải...</div>;

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 600 }}>Quản lý AI Providers</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
            Thêm provider dự phòng, đổi model, test kết nối và kích hoạt provider đang dùng.
          </div>
        </div>
        <button className="btn btn-primary" onClick={openCreateForm}>Thêm AI Provider</button>
      </div>

      {showForm && (
        <form className="card" onSubmit={handleSubmit}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <h3>{editingId ? 'Sửa AI Provider' : 'Thêm AI Provider'}</h3>
            <button type="button" className="btn btn-sm" onClick={resetForm}>
              Hủy
            </button>
          </div>

          {loadingDetails ? (
            <div className="loading">Đang tải chi tiết provider...</div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Tên provider *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    placeholder="VD: OpenAI chính, Anthropic backup..."
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Loại provider *</label>
                  <select value={formData.provider_type} onChange={(e) => setFormData({ ...formData, provider_type: e.target.value })}>
                    {AI_PROVIDER_TYPES.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Model *</label>
                  <input
                    type="text"
                    required
                    value={formData.model}
                    placeholder="VD: gpt-4.1-mini, claude-sonnet-4-6..."
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>API endpoint</label>
                  <input
                    type="text"
                    value={formData.api_endpoint}
                    placeholder="Để trống nếu dùng endpoint mặc định"
                    onChange={(e) => setFormData({ ...formData, api_endpoint: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Project ID</label>
                  <input
                    type="text"
                    value={formData.project_id}
                    placeholder="Dùng cho Vertex hoặc provider tương tự"
                    onChange={(e) => setFormData({ ...formData, project_id: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Region</label>
                  <input
                    type="text"
                    value={formData.region}
                    placeholder="VD: us-central1"
                    onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>{editingId ? 'API key mới' : 'API key'}</label>
                  <input
                    type="password"
                    value={formData.api_key}
                    placeholder={editingId ? 'Để trống để giữ nguyên key hiện tại' : 'Nhập API key nếu provider cần'}
                    onChange={(e) => {
                      setFormData({ ...formData, api_key: e.target.value });
                      if (e.target.value) setClearApiKey(false);
                    }}
                  />
                  {editingId && hasExistingApiKey && (
                    <div style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                      Provider này đang có API key lưu sẵn.
                    </div>
                  )}
                  {editingId && hasExistingApiKey && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: '0.82rem' }}>
                      <input
                        type="checkbox"
                        checked={clearApiKey}
                        onChange={(e) => {
                          setClearApiKey(e.target.checked);
                          if (e.target.checked) {
                            setFormData({ ...formData, api_key: '' });
                          }
                        }}
                      />
                      Xóa API key hiện tại
                    </label>
                  )}
                </div>
                <div className="form-group">
                  <label>{editingId ? 'Service account JSON mới' : 'Service account JSON'}</label>
                  <textarea
                    rows={5}
                    value={formData.service_account_json}
                    placeholder={editingId ? 'Để trống để giữ nguyên service account hiện tại' : 'Dán JSON nếu provider cần'}
                    onChange={(e) => {
                      setFormData({ ...formData, service_account_json: e.target.value });
                      if (e.target.value) setClearServiceAccount(false);
                    }}
                  />
                  {editingId && hasExistingServiceAccount && (
                    <div style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                      Provider này đang có service account JSON lưu sẵn.
                    </div>
                  )}
                  {editingId && hasExistingServiceAccount && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: '0.82rem' }}>
                      <input
                        type="checkbox"
                        checked={clearServiceAccount}
                        onChange={(e) => {
                          setClearServiceAccount(e.target.checked);
                          if (e.target.checked) {
                            setFormData({ ...formData, service_account_json: '' });
                          }
                        }}
                      />
                      Xóa service account hiện tại
                    </label>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Max tokens</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.max_tokens}
                    onChange={(e) => setFormData({ ...formData, max_tokens: parseInt(e.target.value, 10) || 1024 })}
                  />
                </div>
                <div className="form-group">
                  <label>Temperature</label>
                  <input
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    value={formData.temperature}
                    onChange={(e) => setFormData({ ...formData, temperature: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Extra config (JSON)</label>
                <textarea
                  rows={6}
                  value={formData.extra_config}
                  placeholder='Ví dụ: {"reasoning_effort":"medium"}'
                  onChange={(e) => setFormData({ ...formData, extra_config: e.target.value })}
                />
              </div>

              {formError && <div style={{ color: 'var(--color-error)', marginBottom: 12, fontSize: '0.875rem' }}>{formError}</div>}

              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Đang lưu...' : editingId ? 'Cập nhật AI Provider' : 'Thêm AI Provider'}
              </button>
            </>
          )}
        </form>
      )}

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
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {!p.is_active && (
                <button className="btn btn-sm btn-primary" onClick={() => handleActivate(p.id)}>Kích hoạt</button>
              )}
              <button className="btn btn-sm" onClick={() => handleEdit(p.id)} disabled={loadingDetails && editingId === p.id}>
                {loadingDetails && editingId === p.id ? '...' : 'Sửa'}
              </button>
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

function ArticlesTab() {
  const { data: raw, loading, reload } = useFetchRaw(
    () => api.getArticles({ page: 1, limit: 500 }), []
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

  const handleRescrape = async (id: string) => {
    try {
      const res = await api.rescrapeArticle(id);
      if (res.success) {
        alert(res.message || 'ÄĂ£ láº¥y láº¡i comment vĂ  gá»i yĂªu cáº§u tĂ³m táº¯t');
      } else {
        alert(res.message || 'Không có gì để cập nhật');
      }
      reload();
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    }
  };

  if (loading) return <div className="loading">Äang táº£i...</div>;

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
              {/voz|reddit/i.test(a.source_name || '') && (
                <button className="btn btn-sm" style={{ background: '#2563eb', color: '#fff', fontSize: '0.72rem' }} onClick={() => handleRescrape(a.id)} title="Cào lại bình luận mới nhất">Cào lại</button>
              )}
              <button className="btn btn-sm" onClick={() => handleReset(a.id)} title="Tóm tắt lại">🔄</button>
              <button className="btn btn-sm btn-danger" onClick={() => handleDelete(a.id)} title="Xóa">🗑</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
