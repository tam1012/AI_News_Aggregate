export const LOCAL_DATE_SQL = `DATE(COALESCE(a.published_at, a.created_at) AT TIME ZONE 'Asia/Ho_Chi_Minh')`;
export const LOCAL_DATE_TEXT_SQL = `TO_CHAR(${LOCAL_DATE_SQL}, 'YYYY-MM-DD')`;

const VALID_SUMMARY_STATUSES = ['pending', 'processing', 'done', 'failed', 'skipped'];

export interface ArticleListFilterInput {
  sourceId?: string;
  status?: string;
  date?: string;
  tag?: string;
  minScore?: string;
}

export interface ArticleListFilters {
  where: string;
  params: any[];
  nextParamIndex: number;
}

function parseMinScore(value?: string): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10) {
    throw new Error('minScore must be between 1 and 10');
  }
  return parsed;
}

export function buildArticleListFilters(input: ArticleListFilterInput): ArticleListFilters {
  if (input.status && !VALID_SUMMARY_STATUSES.includes(input.status)) {
    throw new Error('Invalid status');
  }

  if (input.date && !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new Error('date must be YYYY-MM-DD');
  }

  const minScore = parseMinScore(input.minScore);
  const params: any[] = [];
  const clauses = ['1=1'];
  let paramIndex = 1;

  if (input.sourceId) {
    clauses.push(`a.source_id = $${paramIndex++}`);
    params.push(input.sourceId);
  }
  if (input.status) {
    clauses.push(`a.summary_status = $${paramIndex++}`);
    params.push(input.status);
  }
  if (input.date) {
    clauses.push(`${LOCAL_DATE_SQL} = $${paramIndex++}`);
    params.push(input.date);
  }
  if (input.tag?.trim()) {
    clauses.push(`$${paramIndex++} = ANY(a.tags)`);
    params.push(input.tag.trim());
  }
  if (minScore !== null) {
    clauses.push(`a.hot_score >= $${paramIndex++}`);
    params.push(minScore);
  }

  return {
    where: `WHERE ${clauses.join(' AND ')}`,
    params,
    nextParamIndex: paramIndex,
  };
}
