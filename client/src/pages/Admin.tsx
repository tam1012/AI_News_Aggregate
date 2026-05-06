import { useState } from 'react';
import { api } from '../services/api';
import { useEffect } from 'react';
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

type PromptConfigFormData = {
  output_language: string;
  topic_priorities: string;
  allowed_tags: string;
  digest_headings: string;
  custom_context: string;
};

type AdminTab = 'overview' | 'queue' | 'fetchJobs' | 'ai' | 'prompt' | 'articles';
type SummaryQueueStatus = 'failed' | 'pending' | 'processing' | 'skipped' | 'done';
type FetchJobStatus = 'failed' | 'discovered' | 'fetching' | 'done';

const AI_PROVIDER_TYPES = ['vertex_ai', 'openai', 'gemini', 'xai', 'mimo', 'anthropic', 'deepseek', 'groq', 'custom'];
const SUMMARY_QUEUE_STATUSES: { key: SummaryQueueStatus; label: string }[] = [
  { key: 'failed', label: 'Lỗi' },
  { key: 'pending', label: 'Chờ' },
  { key: 'processing', label: 'Đang chạy' },
  { key: 'skipped', label: 'Bỏ qua' },
  { key: 'done', label: 'Đã xong' },
];
const FETCH_JOB_STATUSES: { key: FetchJobStatus; label: string }[] = [
  { key: 'failed', label: 'Lỗi' },
  { key: 'discovered', label: 'Chờ fetch' },
  { key: 'fetching', label: 'Đang fetch' },
  { key: 'done', label: 'Đã xong' },
];

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

function numberText(value: unknown): string {
  return String(Number(value || 0));
}

function statusLabel(value: string): string {
  const labels: Record<string, string> = {
    success: 'Thành công',
    partial: 'Một phần',
    failed: 'Lỗi',
    pending: 'Đang chờ',
    discovered: 'Chờ lấy bài',
    fetching: 'Đang lấy bài',
    done: 'Đã xong',
    skipped: 'Bỏ qua',
    processing: 'Đang xử lý',
  };
  return labels[value] || value;
}

function forumKindLabel(kind: string): string {
  const labels: Record<string, string> = {
    reddit: 'Reddit',
    voz: 'VOZ',
  };
  return labels[kind] || kind;
}

function forumStatsValue(row: any, key: string): number {
  return Number(row?.[key] || row?.forum?.[key] || 0);
}

function sourceQualityLabel(status: string): string {
  const labels: Record<string, string> = {
    healthy: 'Ổn',
    low_yield: 'Ít bài mới',
    failing: 'Đang lỗi',
    stale: 'Lâu chưa thành công',
    disabled: 'Đã tắt',
  };
  return labels[status] || status;
}

function sourceQualityBadgeClass(status: string): string {
  if (status === 'healthy') return 'success';
  if (status === 'disabled') return 'pending';
  if (status === 'low_yield' || status === 'stale') return 'pending';
  return 'error';
}

function sourceQualityNote(source: any): string {
  if (source.status === 'disabled') return 'Nguồn đang tắt, không cào tự động.';
  if (source.status === 'failing') return source.lastErrorMessage || `${source.consecutiveFailures || 0} lần lỗi liên tiếp.`;
  if (source.status === 'stale') return 'Nguồn bật nhưng lâu chưa có lần cào thành công.';
  if (source.status === 'low_yield') return 'Có cào và tìm thấy bài nhưng gần đây không thêm được bài mới.';
  return 'Nguồn đang hoạt động bình thường.';
}

function percentText(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${Math.round(value * 100)}%`;
}

export function Admin() {
  const [tab, setTab] = useState<AdminTab>('overview');
  const { data: health, loading, error, reload } = useFetch<any>(() => api.getHealth());
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
          { key: 'overview', label: 'Tổng quan' },
          { key: 'queue', label: 'Hàng đợi tóm tắt' },
          { key: 'fetchJobs', label: 'Hàng đợi lấy bài' },
          { key: 'ai', label: 'Nhà cung cấp AI' },
          { key: 'prompt', label: 'Cấu hình prompt' },
          { key: 'articles', label: 'Bài viết' },
        ].map(t => (
          <button
            key={t.key}
            className={`btn btn-sm ${tab === t.key ? 'btn-primary' : ''}`}
            onClick={() => setTab(t.key as AdminTab)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div>
          {loading ? (
            <div className="loading">Đang tải...</div>
          ) : error ? (
            <div className="empty-state">
              <p style={{ color: 'var(--color-error)' }}>{error}</p>
              <button className="btn btn-primary" onClick={reload} style={{ marginTop: 12 }}>Nhập lại token</button>
            </div>
          ) : health ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <div className="card" style={{ borderColor: health.sources?.failing || health.articles?.failed || health.articleFetchJobs?.failed ? 'var(--color-warning)' : 'var(--color-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>Cần xử lý</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                      Những mục này đáng xem trước nếu hệ thống chạy không như ý.
                    </div>
                  </div>
                  <button className="btn btn-sm" onClick={reload}>Tải lại số liệu</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
                  {[
                    ['Nguồn đang lỗi', health.sources?.failing, health.sources?.failing > 0 ? 'var(--color-error)' : 'var(--color-success)', `${numberText(health.sources?.backed_off)} nguồn đang chờ thử lại`],
                    ['URL chưa lấy bài', health.articleFetchJobs?.discovered, health.articleFetchJobs?.failed > 0 ? 'var(--color-error)' : 'var(--color-warning)', `${numberText(health.articleFetchJobs?.failed)} lỗi · ${numberText(health.articleFetchJobs?.retryable_failed)} có thể thử lại`],
                    ['Bài chờ tóm tắt', health.articles?.pending, health.articles?.failed > 0 ? 'var(--color-error)' : 'var(--color-warning)', `${numberText(health.articles?.failed)} lỗi · ${numberText(health.articles?.retryable_failed)} sẽ thử lại`],
                    ['Bài bị bỏ qua', health.articles?.skipped, 'var(--color-text-muted)', 'Thường do nội dung quá ngắn hoặc AI từ chối'],
                  ].map(([label, value, color, note]) => (
                    <div key={String(label)} style={{ padding: '10px 12px', border: '1px solid var(--color-border-light)', borderRadius: 8 }}>
                      <div style={{ fontSize: '1.55rem', lineHeight: 1, fontWeight: 800, color: String(color) }}>{value || 0}</div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, marginTop: 6 }}>{label}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: 3 }}>{note}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                <div className="card">
                  <div style={{ fontWeight: 700, marginBottom: 10 }}>Tình trạng nguồn tin</div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {[
                      ['Tổng nguồn', health.sources?.total],
                      ['Đang bật', health.sources?.enabled],
                      ['Đến hạn cào', health.sources?.due],
                      ['Đang backoff', health.sources?.backed_off],
                      ['Nguồn ổn', health.sourceQualitySummary?.healthy],
                      ['Ít bài mới', health.sourceQualitySummary?.low_yield],
                    ].map(([label, value]) => (
                      <div key={String(label)} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.86rem' }}>
                        <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
                        <strong>{value || 0}</strong>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card">
                  <div style={{ fontWeight: 700, marginBottom: 10 }}>Tình trạng bài viết</div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {[
                      ['Tổng bài', health.articles?.total],
                      ['Đã tóm tắt', health.articles?.done],
                      ['Đang tóm tắt', health.articles?.processing],
                      ['Tóm tắt lỗi', health.articles?.failed],
                    ].map(([label, value]) => (
                      <div key={String(label)} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.86rem' }}>
                        <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
                        <strong>{value || 0}</strong>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card">
                  <div style={{ fontWeight: 700, marginBottom: 10 }}>Hàng đợi lấy bài</div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {[
                      ['Tổng URL', health.articleFetchJobs?.total],
                      ['Chờ lấy bài', health.articleFetchJobs?.discovered],
                      ['Đang lấy bài', health.articleFetchJobs?.fetching],
                      ['Lấy bài lỗi', health.articleFetchJobs?.failed],
                    ].map(([label, value]) => (
                      <div key={String(label)} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.86rem' }}>
                        <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
                        <strong>{value || 0}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {health.sourceQuality?.length > 0 && (
                <div className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>Chất lượng nguồn tin</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                        Theo dõi nguồn lỗi, nguồn ít bài mới và tỷ lệ thêm bài trong 24h gần nhất.
                      </div>
                    </div>
                    <button className="btn btn-sm" onClick={() => window.location.href = '/sources'}>Mở trang Nguồn tin</button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 12 }}>
                    {[
                      ['Ổn', health.sourceQualitySummary?.healthy, 'var(--color-success)'],
                      ['Ít bài mới', health.sourceQualitySummary?.low_yield, 'var(--color-warning)'],
                      ['Đang lỗi', health.sourceQualitySummary?.failing, 'var(--color-error)'],
                      ['Lâu chưa thành công', health.sourceQualitySummary?.stale, 'var(--color-warning)'],
                      ['Đã tắt', health.sourceQualitySummary?.disabled, 'var(--color-text-muted)'],
                    ].map(([label, value, color]) => (
                      <div key={String(label)} style={{ padding: '10px 12px', border: '1px solid var(--color-border-light)', borderRadius: 8 }}>
                        <div style={{ fontSize: '1.35rem', lineHeight: 1, fontWeight: 800, color: String(color) }}>{value || 0}</div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 600, marginTop: 6 }}>{label}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'grid', gap: 8 }}>
                    {health.sourceQuality
                      .filter((source: any) => source.status !== 'healthy')
                      .slice(0, 8)
                      .map((source: any, i: number) => (
                        <div key={source.id} style={{ fontSize: '0.8rem', paddingTop: i === 0 ? 0 : 8, borderTop: i === 0 ? 'none' : '1px solid var(--color-border-light)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                            <strong>{source.name}</strong>
                            <span className={`badge badge-${sourceQualityBadgeClass(source.status)}`}>{sourceQualityLabel(source.status)}</span>
                          </div>
                          <div style={{ color: 'var(--color-text-muted)', marginTop: 3 }}>
                            24h: {source.runs24h || 0} lần cào · tìm thấy {source.itemsFound24h || 0} · thêm {source.itemsInserted24h || 0} · tỷ lệ thêm {percentText(source.insertRate24h)}
                          </div>
                          <div style={{ color: source.status === 'failing' ? 'var(--color-error)' : 'var(--color-text-muted)', marginTop: 3 }}>
                            {sourceQualityNote(source).substring(0, 180)}
                          </div>
                        </div>
                      ))}
                    {health.sourceQuality.filter((source: any) => source.status !== 'healthy').length === 0 && (
                      <div style={{ color: 'var(--color-text-muted)', fontSize: '0.82rem' }}>Tất cả nguồn đang ổn.</div>
                    )}
                  </div>
                </div>
              )}

              {health.forum && ((health.forum.totals24h?.length || 0) > 0 || (health.forum.recent?.length || 0) > 0) && (
                <div className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>Theo dõi forum Reddit/VOZ</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                        Số liệu 24h gần nhất để biết thread bị bỏ qua vì ít comment, ít comment hữu ích hay lỗi fetch.
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginBottom: 12 }}>
                    {health.forum.totals24h?.map((row: any) => (
                      <div key={row.kind} style={{ padding: '10px 12px', border: '1px solid var(--color-border-light)', borderRadius: 8 }}>
                        <div style={{ fontSize: '0.86rem', fontWeight: 700, marginBottom: 8 }}>{forumKindLabel(row.kind)}</div>
                        <div style={{ display: 'grid', gap: 5, fontSize: '0.78rem' }}>
                          {[
                            ['Thread đã xem', row.threadsSeen],
                            ['Đã thêm', row.inserted],
                            ['Bỏ qua: ít comment', row.skippedFewComments],
                            ['Bỏ qua: ít comment hữu ích', row.skippedFewUsefulComments],
                            ['Trùng bài', row.skippedDuplicate],
                            ['Lỗi fetch comment', row.fetchErrors],
                          ].map(([label, value]) => (
                            <div key={String(label)} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                              <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
                              <strong>{value || 0}</strong>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {health.forum.recent?.length > 0 && (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {health.forum.recent.slice(0, 4).map((log: any, i: number) => (
                        <div key={`${log.source_id || 'forum'}-${log.started_at}-${i}`} style={{ fontSize: '0.78rem', paddingTop: i === 0 ? 0 : 8, borderTop: i === 0 ? 'none' : '1px solid var(--color-border-light)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                            <strong>{log.source_name || log.source_id || forumKindLabel(log.forum?.kind)}</strong>
                            <span style={{ color: 'var(--color-text-muted)' }}>{new Date(log.started_at).toLocaleString('vi-VN')}</span>
                          </div>
                          <div style={{ color: 'var(--color-text-muted)', marginTop: 3 }}>
                            {forumKindLabel(log.forum?.kind)} · xem {forumStatsValue(log, 'threadsSeen')} · thêm {forumStatsValue(log, 'inserted')} · ít comment {forumStatsValue(log, 'skippedFewComments')} · ít hữu ích {forumStatsValue(log, 'skippedFewUsefulComments')} · lỗi fetch {forumStatsValue(log, 'fetchErrors')}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {health.lastDigest && (
                <div className="card">
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Bản tin gần nhất</div>
                  <div style={{ fontSize: '0.86rem' }}>{health.lastDigest.title || `Bản tin ${health.lastDigest.digest_date}`}</div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)', marginTop: 3 }}>
                    {health.lastDigest.article_count || 0} bài · ngày {health.lastDigest.digest_date}
                  </div>
                </div>
              )}

              <div className="card">
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Chạy thủ công</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: 10 }}>
                  Dùng khi anh muốn ép hệ thống chạy ngay, không cần chờ lịch tự động.
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-sm" onClick={() => trigger('scrape', api.triggerScrape)} disabled={!!actionLoading}>
                    {actionLoading === 'scrape' ? 'Đang chạy...' : 'Cào nguồn đến hạn'}
                  </button>
                  <button className="btn btn-sm" onClick={() => trigger('fetch-articles', api.triggerFetchArticles)} disabled={!!actionLoading}>
                    {actionLoading === 'fetch-articles' ? 'Đang chạy...' : 'Lấy nội dung bài'}
                  </button>
                  <button className="btn btn-sm" onClick={() => trigger('summarize', api.triggerSummarize)} disabled={!!actionLoading}>
                    {actionLoading === 'summarize' ? 'Đang chạy...' : 'Tóm tắt bài'}
                  </button>
                  <button className="btn btn-sm" onClick={() => trigger('digest', api.triggerDigest)} disabled={!!actionLoading}>
                    {actionLoading === 'digest' ? 'Đang chạy...' : 'Tạo bản tin'}
                  </button>
                </div>
              </div>

              {health.recentLogs?.length > 0 && (
                <div className="card">
                  <div style={{ fontWeight: 700, marginBottom: 10 }}>Lần cào gần đây</div>
                  {health.recentLogs.map((log: any, i: number) => (
                    <div key={i} style={{ fontSize: '0.82rem', padding: '8px 0', borderBottom: i < health.recentLogs.length - 1 ? '1px solid var(--color-border-light)' : 'none' }}>
                      <span className={`badge badge-${log.status === 'success' ? 'success' : log.status === 'failed' ? 'error' : 'pending'}`}>
                        {statusLabel(log.status)}
                      </span>
                      {' '}
                      <span style={{ color: 'var(--color-text-muted)' }}>
                        {new Date(log.started_at).toLocaleString('vi-VN')}
                      </span>
                      <span> · tìm thấy {log.items_found || 0}, thêm mới {log.items_inserted || 0}</span>
                      {log.error_message && (
                        <div style={{ color: 'var(--color-error)', fontSize: '0.75rem', marginTop: 2 }}>
                          {log.error_message.substring(0, 140)}
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

      {tab === 'queue' && <SummaryQueueTab />}
      {tab === 'fetchJobs' && <FetchJobsTab />}
      {tab === 'ai' && <AiProvidersTab />}
      {tab === 'prompt' && <PromptConfigTab />}
      {tab === 'articles' && <ArticlesTab />}
    </div>
  );
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinLines(value: unknown): string {
  return Array.isArray(value) ? value.join('\n') : '';
}

function buildPromptConfigPayload(formData: PromptConfigFormData) {
  return {
    output_language: formData.output_language.trim(),
    topic_priorities: splitLines(formData.topic_priorities),
    allowed_tags: splitLines(formData.allowed_tags),
    digest_headings: splitLines(formData.digest_headings),
    custom_context: formData.custom_context.trim(),
  };
}

function getPromptConfigWarnings(formData: PromptConfigFormData): string[] {
  const payload = buildPromptConfigPayload(formData);
  const warnings: string[] = [];
  if (!payload.output_language) warnings.push('Ngôn ngữ output đang trống.');
  if (payload.allowed_tags.length === 0) warnings.push('Danh sách nhãn cần ít nhất 1 nhãn để AI trả kết quả hợp lệ.');
  if (payload.allowed_tags.length > 24) warnings.push('Danh sách nhãn quá nhiều có thể làm AI chọn nhãn thiếu nhất quán.');
  if (payload.topic_priorities.length === 0) warnings.push('Chủ đề ưu tiên đang trống, điểm nóng sẽ ít định hướng hơn.');
  if (payload.digest_headings.length === 0) warnings.push('Nhóm bản tin đang trống, bản tin sẽ khó gom nhóm ổn định.');
  if (payload.custom_context.length > 1500) warnings.push('Ngữ cảnh bổ sung dài hơn 1500 ký tự có thể tốn token và kém ổn định.');
  if (/[<>]/.test(payload.custom_context)) warnings.push('Ngữ cảnh bổ sung không được chứa dấu < hoặc >.');
  return warnings;
}

function PromptConfigTab() {
  const { data: config, loading, error, reload } = useFetch<any>(() => api.getPromptConfig());
  const [formData, setFormData] = useState<PromptConfigFormData>({
    output_language: '',
    topic_priorities: '',
    allowed_tags: '',
    digest_headings: '',
    custom_context: '',
  });
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const warnings = getPromptConfigWarnings(formData);
  const previewPayload = buildPromptConfigPayload(formData);

  useEffect(() => {
    if (!config) return;
    setFormData({
      output_language: config.output_language || '',
      topic_priorities: joinLines(config.topic_priorities),
      allowed_tags: joinLines(config.allowed_tags),
      digest_headings: joinLines(config.digest_headings),
      custom_context: config.custom_context || '',
    });
  }, [config]);

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveMessage('');
    try {
      await api.updatePromptConfig(previewPayload);
      setSaveMessage('Đã lưu cấu hình prompt.');
      reload();
    } catch (err: any) {
      setSaveMessage(`Lỗi: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const applyDefaultConfig = async () => {
    setSaving(true);
    setSaveMessage('');
    try {
      const result = await api.getDefaultPromptConfig();
      const defaultConfig = result.data;
      setFormData({
        output_language: defaultConfig.output_language || '',
        topic_priorities: joinLines(defaultConfig.topic_priorities),
        allowed_tags: joinLines(defaultConfig.allowed_tags),
        digest_headings: joinLines(defaultConfig.digest_headings),
        custom_context: defaultConfig.custom_context || '',
      });
      setSaveMessage('Đã nạp cấu hình mặc định, bấm Lưu nếu muốn áp dụng.');
    } catch (err: any) {
      setSaveMessage(`Lỗi: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const resetDefaultConfig = async () => {
    if (!confirm('Đưa cấu hình prompt về mặc định?')) return;
    setSaving(true);
    setSaveMessage('');
    try {
      const result = await api.resetPromptConfig();
      const resetConfig = result.data;
      setFormData({
        output_language: resetConfig.output_language || '',
        topic_priorities: joinLines(resetConfig.topic_priorities),
        allowed_tags: joinLines(resetConfig.allowed_tags),
        digest_headings: joinLines(resetConfig.digest_headings),
        custom_context: resetConfig.custom_context || '',
      });
      setSaveMessage('Đã reset prompt config về mặc định.');
      reload();
    } catch (err: any) {
      setSaveMessage(`Lỗi: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading">Đang tải...</div>;
  if (error) return <div className="empty-state" style={{ color: 'var(--color-error)' }}>{error}</div>;

  return (
    <form className="card" onSubmit={handleSubmit}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Cấu hình prompt</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
            Cấu hình này áp dụng cho bài tóm tắt mới và digest mới. Mỗi dòng là một giá trị.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-sm" onClick={() => setShowPreview(value => !value)}>
            {showPreview ? 'Ẩn preview' : 'Xem trước JSON'}
          </button>
          <button type="button" className="btn btn-sm" onClick={applyDefaultConfig} disabled={saving}>Nạp mặc định</button>
          <button type="button" className="btn btn-sm btn-danger" onClick={resetDefaultConfig} disabled={saving}>Đưa về mặc định</button>
        </div>
      </div>

      {warnings.length > 0 && (
        <div style={{ marginBottom: 12, padding: 10, border: '1px solid var(--color-warning)', borderRadius: 6, color: 'var(--color-warning)', fontSize: '0.82rem' }}>
          {warnings.map((warning) => <div key={warning}>{warning}</div>)}
        </div>
      )}

      {showPreview && (
        <pre style={{ marginBottom: 12, padding: 12, border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-bg)', color: 'var(--color-text)', overflowX: 'auto', fontSize: '0.78rem' }}>
          {JSON.stringify(previewPayload, null, 2)}
        </pre>
      )}

      <div className="form-group">
        <label>Ngôn ngữ output</label>
        <input
          type="text"
          value={formData.output_language}
          placeholder="Vietnamese"
          onChange={(e) => setFormData({ ...formData, output_language: e.target.value })}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <div className="form-group">
          <label>Chủ đề ưu tiên</label>
          <textarea
            rows={7}
            value={formData.topic_priorities}
            onChange={(e) => setFormData({ ...formData, topic_priorities: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>Nhãn được phép</label>
          <textarea
            rows={7}
            value={formData.allowed_tags}
            onChange={(e) => setFormData({ ...formData, allowed_tags: e.target.value })}
          />
        </div>
      </div>

      <div className="form-group">
        <label>Nhóm tiêu đề bản tin</label>
        <textarea
          rows={5}
          value={formData.digest_headings}
          onChange={(e) => setFormData({ ...formData, digest_headings: e.target.value })}
        />
      </div>

      <div className="form-group">
        <label>Ngữ cảnh bổ sung</label>
        <textarea
          rows={5}
          value={formData.custom_context}
          placeholder="Không dùng XML tags hoặc markup đặc biệt."
          onChange={(e) => setFormData({ ...formData, custom_context: e.target.value })}
        />
      </div>

      {saveMessage && (
        <div style={{ marginBottom: 12, fontSize: '0.85rem', color: saveMessage.startsWith('Lỗi') ? 'var(--color-error)' : 'var(--color-success)' }}>
          {saveMessage}
        </div>
      )}

      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving ? 'Đang lưu...' : 'Lưu prompt config'}
      </button>
    </form>
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
      setTestResult(prev => ({ ...prev, [id]: `Thành công: ${result.data?.response?.substring(0, 100) || 'OK'}` }));
    } catch (err: any) {
      setTestResult(prev => ({ ...prev, [id]: `Lỗi: ${err.message}` }));
    } finally {
      setTesting('');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Xóa nhà cung cấp AI này?')) return;
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
        throw new Error('Độ sáng tạo phải là số hợp lệ');
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
          <div style={{ fontWeight: 600 }}>Quản lý nhà cung cấp AI</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
            Thêm dịch vụ AI dự phòng, đổi model, thử kết nối và kích hoạt dịch vụ đang dùng.
          </div>
        </div>
        <button className="btn btn-primary" onClick={openCreateForm}>Thêm nhà cung cấp AI</button>
      </div>

      {showForm && (
        <form className="card" onSubmit={handleSubmit}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <h3>{editingId ? 'Sửa nhà cung cấp AI' : 'Thêm nhà cung cấp AI'}</h3>
            <button type="button" className="btn btn-sm" onClick={resetForm}>
              Hủy
            </button>
          </div>

          {loadingDetails ? (
            <div className="loading">Đang tải chi tiết nhà cung cấp...</div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Tên nhà cung cấp *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    placeholder="VD: OpenAI chính, Anthropic backup..."
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Loại nhà cung cấp *</label>
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
                    placeholder="Dùng cho Vertex hoặc dịch vụ tương tự"
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
                    placeholder={editingId ? 'Để trống để giữ nguyên key hiện tại' : 'Nhập API key nếu dịch vụ cần'}
                    onChange={(e) => {
                      setFormData({ ...formData, api_key: e.target.value });
                      if (e.target.value) setClearApiKey(false);
                    }}
                  />
                  {editingId && hasExistingApiKey && (
                    <div style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                      Nhà cung cấp này đang có API key lưu sẵn.
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
                    placeholder={editingId ? 'Để trống để giữ nguyên service account hiện tại' : 'Dán JSON nếu dịch vụ cần'}
                    onChange={(e) => {
                      setFormData({ ...formData, service_account_json: e.target.value });
                      if (e.target.value) setClearServiceAccount(false);
                    }}
                  />
                  {editingId && hasExistingServiceAccount && (
                    <div style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                      Nhà cung cấp này đang có service account JSON lưu sẵn.
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
                  <label>Số token tối đa</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.max_tokens}
                    onChange={(e) => setFormData({ ...formData, max_tokens: parseInt(e.target.value, 10) || 1024 })}
                  />
                </div>
                <div className="form-group">
                  <label>Độ sáng tạo</label>
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
                <label>Cấu hình thêm (JSON)</label>
                <textarea
                  rows={6}
                  value={formData.extra_config}
                  placeholder='Ví dụ: {"reasoning_effort":"medium"}'
                  onChange={(e) => setFormData({ ...formData, extra_config: e.target.value })}
                />
              </div>

              {formError && <div style={{ color: 'var(--color-error)', marginBottom: 12, fontSize: '0.875rem' }}>{formError}</div>}

              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Đang lưu...' : editingId ? 'Cập nhật nhà cung cấp AI' : 'Thêm nhà cung cấp AI'}
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
                {p.is_active && <span className="badge badge-success" style={{ marginLeft: 6 }}>Đang dùng</span>}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                {p.provider_type} · {p.model} · {p.total_calls} lượt gọi
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
                {testing === p.id ? '...' : 'Thử'}
              </button>
              <button className="btn btn-sm btn-danger" onClick={() => handleDelete(p.id)}>Xóa</button>
            </div>
          </div>
        </div>
      ))}

      {(!providers || providers.length === 0) && (
        <div className="empty-state"><p>Chưa có nhà cung cấp AI nào.</p></div>
      )}
    </div>
  );
}

function SummaryQueueTab() {
  const [status, setStatus] = useState<SummaryQueueStatus>('failed');
  const [page, setPage] = useState(1);
  const [actionLoading, setActionLoading] = useState('');
  const { data: raw, loading, error, reload } = useFetchRaw(
    () => api.getArticles({ page, limit: 50, status }), [page, status]
  );
  const articles: any[] = raw?.data || [];
  const meta = raw?.meta || { page, total: 0, totalPages: 0 };

  const runAction = async (key: string, fn: () => Promise<any>) => {
    setActionLoading(key);
    try {
      await fn();
      reload();
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    } finally {
      setActionLoading('');
    }
  };

  const handleStatusChange = (nextStatus: SummaryQueueStatus) => {
    setStatus(nextStatus);
    setPage(1);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Xóa bài viết này?')) return;
    await runAction(`delete-${id}`, () => api.deleteArticle(id));
  };

  const handleReset = async (id: string) => {
    await runAction(`reset-${id}`, () => api.resetArticleSummary(id));
  };

  const handleRescrape = async (article: any) => {
    await runAction(`rescrape-${article.id}`, () => api.rescrapeArticle(article.id));
  };

  const handleTriggerSummarize = async () => {
    await runAction('trigger-summarize', api.triggerSummarize);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700 }}>Hàng đợi tóm tắt</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
            Theo dõi bài đang chờ, đang xử lý hoặc lỗi tóm tắt.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn btn-sm" onClick={handleTriggerSummarize} disabled={!!actionLoading}>
            {actionLoading === 'trigger-summarize' ? 'Đang chạy...' : 'Chạy tóm tắt'}
          </button>
          <button className="btn btn-sm" onClick={reload} disabled={loading}>Tải lại</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {SUMMARY_QUEUE_STATUSES.map(item => (
          <button
            key={item.key}
            className={`btn btn-sm ${status === item.key ? 'btn-primary' : ''}`}
            onClick={() => handleStatusChange(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading">Đang tải queue...</div>
      ) : error ? (
        <div className="empty-state">
          <p style={{ color: 'var(--color-error)' }}>{error}</p>
          <button className="btn btn-primary" onClick={reload} style={{ marginTop: 12 }}>Thử lại</button>
        </div>
      ) : (
        <>
          <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
            Hiển thị {articles.length} / {meta.total || 0} bài · Trang {meta.page || page}/{meta.totalPages || 1}
          </div>

          {articles.map((a: any) => (
            <div key={a.id} className="card" style={{ padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.92rem', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.title}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span>{a.source_name || 'Không rõ nguồn'}</span>
                    {a.published_at && <span>{new Date(a.published_at).toLocaleString('vi-VN')}</span>}
                    <span className={`badge badge-${a.summary_status === 'done' ? 'success' : a.summary_status === 'failed' ? 'error' : 'pending'}`}>
                      {statusLabel(a.summary_status)}
                    </span>
                    <span>đã thử lại: {a.retry_count || 0}</span>
                  </div>
                  {a.last_summary_error && (
                    <div style={{ color: 'var(--color-error)', fontSize: '0.75rem', marginTop: 8, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                      {String(a.last_summary_error).substring(0, 500)}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {/voz|reddit/i.test(a.source_name || '') && (
                    <button className="btn btn-sm" onClick={() => handleRescrape(a)} disabled={!!actionLoading}>Cào lại</button>
                  )}
                  <button className="btn btn-sm" onClick={() => handleReset(a.id)} disabled={!!actionLoading}>Tóm tắt lại</button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(a.id)} disabled={!!actionLoading}>Xóa</button>
                </div>
              </div>
            </div>
          ))}

          {articles.length === 0 && (
            <div className="empty-state"><p>Không có bài nào ở trạng thái này.</p></div>
          )}

          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1 || loading}>Trang trước</button>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{page}/{meta.totalPages || 1}</span>
            <button className="btn btn-sm" onClick={() => setPage(p => p + 1)} disabled={page >= (meta.totalPages || 1) || loading}>Trang sau</button>
          </div>
        </>
      )}
    </div>
  );
}

function FetchJobsTab() {
  const [status, setStatus] = useState<FetchJobStatus>('failed');
  const [page, setPage] = useState(1);
  const [actionLoading, setActionLoading] = useState('');
  const { data: raw, loading, error, reload } = useFetchRaw(
    () => api.getArticleFetchJobs({ page, limit: 50, status }), [page, status]
  );
  const jobs: any[] = raw?.data || [];
  const meta = raw?.meta || { page, total: 0, totalPages: 0 };

  const runAction = async (key: string, fn: () => Promise<any>) => {
    setActionLoading(key);
    try {
      await fn();
      reload();
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    } finally {
      setActionLoading('');
    }
  };

  const handleStatusChange = (nextStatus: FetchJobStatus) => {
    setStatus(nextStatus);
    setPage(1);
  };

  const handleRetry = async (id: string) => {
    await runAction(`retry-${id}`, () => api.retryArticleFetchJob(id));
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Xóa mục lấy bài này?')) return;
    await runAction(`delete-${id}`, () => api.deleteArticleFetchJob(id));
  };

  const handleTriggerFetch = async () => {
    await runAction('trigger-fetch', api.triggerFetchArticles);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700 }}>Hàng đợi lấy bài</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
            Theo dõi URL đang chờ lấy nội dung, đang lấy hoặc bị lỗi trước khi tạo bài viết.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn btn-sm" onClick={handleTriggerFetch} disabled={!!actionLoading}>
            {actionLoading === 'trigger-fetch' ? 'Đang chạy...' : 'Chạy fetch bài'}
          </button>
          <button className="btn btn-sm" onClick={reload} disabled={loading}>Tải lại</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {FETCH_JOB_STATUSES.map(item => (
          <button
            key={item.key}
            className={`btn btn-sm ${status === item.key ? 'btn-primary' : ''}`}
            onClick={() => handleStatusChange(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading">Đang tải hàng đợi lấy bài...</div>
      ) : error ? (
        <div className="empty-state">
          <p style={{ color: 'var(--color-error)' }}>{error}</p>
          <button className="btn btn-primary" onClick={reload} style={{ marginTop: 12 }}>Thử lại</button>
        </div>
      ) : (
        <>
          <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
            Hiển thị {jobs.length} / {meta.total || 0} mục · Trang {meta.page || page}/{meta.totalPages || 1}
          </div>

          {jobs.map((job: any) => (
            <div key={job.id} className="card" style={{ padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.92rem', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {job.title || job.url}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span>{job.source_name || 'Không rõ nguồn'}</span>
                    <span className={`badge badge-${job.status === 'done' ? 'success' : job.status === 'failed' ? 'error' : 'pending'}`}>
                      {statusLabel(job.status)}
                    </span>
                    <span>đã thử lại: {job.retry_count || 0}</span>
                    {job.updated_at && <span>{new Date(job.updated_at).toLocaleString('vi-VN')}</span>}
                  </div>
                  <a href={job.url} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: '0.75rem', marginTop: 6, overflowWrap: 'anywhere' }}>
                    {job.url}
                  </a>
                  {job.last_error && (
                    <div style={{ color: 'var(--color-error)', fontSize: '0.75rem', marginTop: 8, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                      {String(job.last_error).substring(0, 500)}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button className="btn btn-sm" onClick={() => handleRetry(job.id)} disabled={!!actionLoading}>Thử lại</button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(job.id)} disabled={!!actionLoading}>Xóa</button>
                </div>
              </div>
            </div>
          ))}

          {jobs.length === 0 && (
            <div className="empty-state"><p>Không có mục lấy bài nào ở trạng thái này.</p></div>
          )}

          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1 || loading}>Trang trước</button>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{page}/{meta.totalPages || 1}</span>
            <button className="btn btn-sm" onClick={() => setPage(p => p + 1)} disabled={page >= (meta.totalPages || 1) || loading}>Trang sau</button>
          </div>
        </>
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

  if (loading) return <div className="loading">Đang tải...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
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
              <button className="btn btn-sm" onClick={() => handleReset(a.id)} title="Tóm tắt lại">Tóm tắt lại</button>
              <button className="btn btn-sm btn-danger" onClick={() => handleDelete(a.id)} title="Xóa">Xóa</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
