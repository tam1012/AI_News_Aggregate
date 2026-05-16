import { lazy, Suspense } from 'react';
import { api } from '../../services/api';
import { useFetchRaw } from '../../hooks/useApi';
import { formatDateHeading, formatTime, proxyImgUrl } from './homeHelpers';

const ReactMarkdown = lazy(() => import('react-markdown'));

export function DigestTab({ digestId }: { digestId?: string | null }) {
  const { data: digestListRaw, loading: listLoading, error: listError } = useFetchRaw(
    () => api.getDigests(1), []
  );
  const digestList = (digestListRaw as any)?.data || [];
  const activeDigestId = digestId || digestList[0]?.id || null;
  const { data: digestRaw, loading: digestLoading, error: digestError } = useFetchRaw(
    () => activeDigestId ? api.getDigest(activeDigestId) : Promise.resolve({ data: null }),
    [activeDigestId]
  );
  const digest = (digestRaw as any)?.data;
  const loading = listLoading || digestLoading;
  const error = listError || digestError;

  if (loading && !digest) return <div className="loading" style={{ padding: 40 }}>Đang tải bản tin...</div>;
  if (error) return <div className="empty-state"><p>Chưa có bản tin tổng hợp.</p></div>;
  if (!digest) return <div className="empty-state"><p>Chưa có bản tin tổng hợp nào.</p></div>;

  return (
    <div className="feed-container digest-container">
      <h2 className="feed-date-heading" style={{ paddingTop: 0 }}>{digest.title || `Bản tin ${digest.digest_date}`}</h2>
      <div className="digest-meta">
        {formatDateHeading(digest.digest_date)} · {formatTime(digest.created_at)} · {digest.article_count} tin
      </div>
      <div className="digest-content">
        <Suspense fallback={<div className="loading">Đang tải bản tin...</div>}>
          <ReactMarkdown
            components={{
              img: ({ node, ...props }) => (
                <img {...props} src={proxyImgUrl(props.src, 'detail')} loading="lazy" decoding="async" />
              )
            }}
          >
            {digest.body_markdown}
          </ReactMarkdown>
        </Suspense>
      </div>
    </div>
  );
}
