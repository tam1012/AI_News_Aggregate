import { api } from '../../services/api';
import { FetchJobStatus, SummaryQueueStatus, forumKindLabel, forumStatsValue, numberText, percentText, sourceQualityBadgeClass, sourceQualityLabel, sourceQualityNote, statusLabel } from './adminHelpers';

function formatVozCookieExpiry(expiresAt: string | null | undefined): string | null {
  if (!expiresAt) return null;
  const expiresMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresMs)) return null;
  const diffHours = Math.max(0, Math.round((expiresMs - Date.now()) / 3600000));
  return `Cookie VOZ dự kiến hết hạn lúc ${new Date(expiresAt).toLocaleString('vi-VN')} (${diffHours} giờ nữa).`;
}

export function OverviewTab({
  health,
  loading,
  error,
  reload,
  trigger,
  actionLoading,
  goToQueue,
  goToFetch,
  goToQuality,
}: {
  health: any;
  loading: boolean;
  error: string | null;
  reload: () => void;
  trigger: (action: string, fn: () => Promise<any>) => Promise<void>;
  actionLoading: string;
  goToQueue: (status: SummaryQueueStatus) => void;
  goToFetch: (status: FetchJobStatus) => void;
  goToQuality: () => void;
}) {
  return (
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
              {health.vozProxy?.needsBrowser && (
                <div className="card" style={{ borderColor: 'var(--color-error)', background: 'rgba(239, 68, 68, 0.08)' }}>
                  <div style={{ fontWeight: 800, color: 'var(--color-error)', marginBottom: 6 }}>VOZ cần mở Chromium trên VPS</div>
                  <div style={{ fontSize: '0.86rem', color: 'var(--color-text)', marginBottom: 6 }}>
                    {health.vozProxy.message || 'VOZ proxy chưa sẵn sàng để vượt Cloudflare.'}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                    SSH/VNC vào VPS, mở Chromium đang bật remote debugging, truy cập voz.vn và vượt Cloudflare. Sau đó bấm “Tải lại số liệu”.
                  </div>
                </div>
              )}

              {!health.vozProxy?.needsBrowser && health.vozProxy?.cfClearanceExpiresAt && (
                <div className="card" style={{ borderColor: 'var(--color-warning)', background: 'rgba(245, 158, 11, 0.08)' }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>VOZ proxy đang hoạt động</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                    {formatVozCookieExpiry(health.vozProxy.cfClearanceExpiresAt)} Cloudflare vẫn có thể hết hạn sớm hơn, nếu VOZ lỗi thì mở lại voz.vn trên Chromium VPS.
                  </div>
                </div>
              )}

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
                    { label: 'Nguồn đang lỗi', value: health.sources?.failing, color: health.sources?.failing > 0 ? 'var(--color-error)' : 'var(--color-success)', note: `${numberText(health.sources?.backed_off)} nguồn đang chờ thử lại`, onClick: () => window.location.href = '/sources', tip: 'Mở trang Nguồn tin để xem chi tiết' },
                    { label: 'URL chưa lấy bài', value: health.articleFetchJobs?.discovered, color: health.articleFetchJobs?.failed > 0 ? 'var(--color-error)' : 'var(--color-warning)', note: `${numberText(health.articleFetchJobs?.failed)} lỗi · ${numberText(health.articleFetchJobs?.retryable_failed)} có thể thử lại`, onClick: () => goToFetch('discovered'), tip: 'Xem danh sách URL đang chờ lấy nội dung' },
                    { label: 'Bài chờ tóm tắt', value: health.articles?.pending, color: health.articles?.failed > 0 ? 'var(--color-error)' : 'var(--color-warning)', note: `${numberText(health.articles?.failed)} lỗi · ${numberText(health.articles?.retryable_failed)} sẽ thử lại`, onClick: () => goToQueue('pending'), tip: 'Xem danh sách bài đang chờ AI tóm tắt' },
                    { label: 'Bài bị bỏ qua', value: health.articles?.skipped, color: 'var(--color-text-muted)', note: 'Thường do nội dung quá ngắn hoặc AI từ chối', onClick: () => goToQueue('skipped'), tip: 'Xem bài bị bỏ qua — có thể xóa hoặc tóm tắt lại' },
                  ].map((item) => (
                    <div key={item.label} onClick={item.onClick} title={item.tip} style={{ padding: '10px 12px', border: '1px solid var(--color-border-light)', borderRadius: 8, cursor: 'pointer', transition: 'background 0.15s' }} className="admin-clickable-card">
                      <div style={{ fontSize: '1.55rem', lineHeight: 1, fontWeight: 800, color: item.color }}>{item.value || 0}</div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, marginTop: 6 }}>{item.label} ›</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: 3 }}>{item.note}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                <div className="card admin-clickable-card" onClick={() => window.location.href = '/sources'} title="Mở trang Nguồn tin" style={{ cursor: 'pointer' }}>
                  <div style={{ fontWeight: 700, marginBottom: 10 }}>Tình trạng nguồn tin ›</div>
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
                      { label: 'Tổng bài', value: health.articles?.total, tip: 'Tổng số bài viết trong hệ thống' },
                      { label: 'Đã tóm tắt', value: health.articles?.done, onClick: () => goToQueue('done'), tip: 'Bài đã được AI tóm tắt thành công' },
                      { label: 'Đang tóm tắt', value: health.articles?.processing, onClick: () => goToQueue('processing'), tip: 'Bài đang được AI xử lý' },
                      { label: 'Tóm tắt lỗi', value: health.articles?.failed, onClick: () => goToQueue('failed'), tip: 'Bài tóm tắt bị lỗi — bấm để xem và xử lý' },
                      { label: 'Kiểm tra metadata', value: 'Mở', onClick: goToQuality, tip: 'Xem bài đã tóm tắt nhưng thiếu TL;DR, nhãn hoặc điểm nóng' },
                    ].map((item) => (
                      <div key={item.label} onClick={item.onClick} title={item.tip} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.86rem', cursor: item.onClick ? 'pointer' : 'default', padding: '2px 4px', borderRadius: 4, transition: 'background 0.15s' }} className={item.onClick ? 'admin-clickable-row' : undefined}>
                        <span style={{ color: 'var(--color-text-muted)' }}>{item.label}{item.onClick ? ' ›' : ''}</span>
                        <strong>{item.value || 0}</strong>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card">
                  <div style={{ fontWeight: 700, marginBottom: 10 }}>Hàng đợi lấy bài</div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {[
                      { label: 'Tổng URL', value: health.articleFetchJobs?.total, tip: 'Tổng URL đã phát hiện từ các nguồn' },
                      { label: 'Chờ lấy bài', value: health.articleFetchJobs?.discovered, onClick: () => goToFetch('discovered'), tip: 'URL đã phát hiện nhưng chưa lấy nội dung' },
                      { label: 'Đang lấy bài', value: health.articleFetchJobs?.fetching, onClick: () => goToFetch('fetching'), tip: 'URL đang được hệ thống lấy nội dung' },
                      { label: 'Lấy bài lỗi', value: health.articleFetchJobs?.failed, onClick: () => goToFetch('failed'), tip: 'URL lấy nội dung bị lỗi — bấm để xem và thử lại' },
                    ].map((item) => (
                      <div key={item.label} onClick={item.onClick} title={item.tip} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.86rem', cursor: item.onClick ? 'pointer' : 'default', padding: '2px 4px', borderRadius: 4, transition: 'background 0.15s' }} className={item.onClick ? 'admin-clickable-row' : undefined}>
                        <span style={{ color: 'var(--color-text-muted)' }}>{item.label}{item.onClick ? ' ›' : ''}</span>
                        <strong>{item.value || 0}</strong>
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

  );
}
