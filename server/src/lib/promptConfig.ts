export interface PromptConfig {
  output_language: string;
  topic_priorities: string[];
  allowed_tags: string[];
  digest_headings: string[];
  custom_context: string;
}

export const PROMPT_CONFIG_KEY = 'prompt_config';

export const DEFAULT_PROMPT_CONFIG: PromptConfig = {
  output_language: 'Vietnamese',
  topic_priorities: ['AI/LLM', 'Security', 'Dev Tools', 'Startup/Business', 'Economy', 'Society', 'Policy'],
  allowed_tags: ['AI', 'Tech', 'Security', 'Business', 'Economy', 'Society', 'Vietnam', 'World', 'Dev', 'Science', 'Crypto', 'Policy', 'Entertainment'],
  digest_headings: ['AI & LLM', 'Security', 'Tools & Infrastructure', 'Startup & Business', 'Economy & Society', 'Policy & Society'],
  custom_context: '',
};

function uniq(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function stringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const cleaned = uniq(
    value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
  );
  return cleaned.length > 0 ? cleaned : fallback;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function mergePromptConfig(value: unknown): PromptConfig {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<PromptConfig>
    : {};

  return {
    output_language: stringValue(raw.output_language, DEFAULT_PROMPT_CONFIG.output_language),
    topic_priorities: stringArray(raw.topic_priorities, DEFAULT_PROMPT_CONFIG.topic_priorities),
    allowed_tags: stringArray(raw.allowed_tags, DEFAULT_PROMPT_CONFIG.allowed_tags),
    digest_headings: stringArray(raw.digest_headings, DEFAULT_PROMPT_CONFIG.digest_headings),
    custom_context: typeof raw.custom_context === 'string' ? raw.custom_context.trim() : DEFAULT_PROMPT_CONFIG.custom_context,
  };
}

function assertStringArray(name: string, value: unknown, requireNonEmpty: boolean) {
  if (value === undefined) return;
  if (!Array.isArray(value)) throw new Error(`${name} must be an array of strings`);
  const cleaned = value.filter((item) => typeof item === 'string' && item.trim());
  if (requireNonEmpty && cleaned.length === 0) throw new Error(`${name} must contain at least one value`);
}

export function validatePromptConfigPatch(value: unknown): PromptConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Prompt config payload must be an object');
  }

  const raw = value as Partial<PromptConfig>;
  if (raw.output_language !== undefined && (typeof raw.output_language !== 'string' || !raw.output_language.trim())) {
    throw new Error('output_language must be a non-empty string');
  }
  if (raw.custom_context !== undefined) {
    if (typeof raw.custom_context !== 'string') throw new Error('custom_context must be a string');
    if (/[<>]/.test(raw.custom_context)) throw new Error('custom_context must not contain angle brackets');
  }

  assertStringArray('topic_priorities', raw.topic_priorities, false);
  assertStringArray('allowed_tags', raw.allowed_tags, true);
  assertStringArray('digest_headings', raw.digest_headings, false);

  return mergePromptConfig(raw);
}
