export interface ParsedSummaryOutput {
  tldr: string;
  summaryShort: string | null;
  hotScore: number | null;
  tags: string[];
  editorialMarkdown: string;
  usedStructuredOutput: boolean;
}

interface StructuredSummaryOutput {
  tldr?: unknown;
  summary_short?: unknown;
  hot_score?: unknown;
  tags?: unknown;
  editorial_markdown?: unknown;
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function extractLegacyTldr(text: string): string {
  const match = text.match(/<tldr>([\s\S]*?)<\/tldr>/i);
  return match ? match[1].trim() : '';
}

function removeLegacyTldr(text: string): string {
  return text.replace(/<tldr>[\s\S]*?<\/tldr>/i, '').trim();
}

function parseJsonCandidate(raw: string): StructuredSummaryOutput | null {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [trimmed];
  if (fenced?.[1]) candidates.unshift(fenced[1].trim());

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as StructuredSummaryOutput;
      }
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function normalizeScore(value: unknown): number | null {
  const raw = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(raw)) return null;
  return Math.max(1, Math.min(10, Math.round(raw)));
}

function normalizeTags(value: unknown, allowedTags: string[]): string[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Map(allowedTags.map((tag) => [tag.toLowerCase(), tag]));
  const out: string[] = [];

  for (const item of value) {
    if (typeof item !== 'string') continue;
    const key = item.trim().toLowerCase();
    const canonical = allowed.get(key);
    if (!canonical || out.includes(canonical)) continue;
    out.push(canonical);
    if (out.length >= 3) break;
  }

  return out;
}

export function parseAiSummaryOutput(raw: string, allowedTags: string[]): ParsedSummaryOutput {
  const parsed = parseJsonCandidate(raw);
  const editorialMarkdown = cleanText(parsed?.editorial_markdown);

  if (parsed && editorialMarkdown) {
    return {
      tldr: cleanText(parsed.tldr),
      summaryShort: cleanText(parsed.summary_short) || null,
      hotScore: normalizeScore(parsed.hot_score),
      tags: normalizeTags(parsed.tags, allowedTags),
      editorialMarkdown,
      usedStructuredOutput: true,
    };
  }

  return {
    tldr: extractLegacyTldr(raw),
    summaryShort: null,
    hotScore: null,
    tags: [],
    editorialMarkdown: removeLegacyTldr(raw),
    usedStructuredOutput: false,
  };
}
