import { getOne, query } from '../db/index.js';
import { DEFAULT_PROMPT_CONFIG, PROMPT_CONFIG_KEY, PromptConfig, mergePromptConfig, validatePromptConfigPatch } from '../lib/promptConfig.js';

export async function getPromptConfig(): Promise<PromptConfig> {
  const row = await getOne<{ value_json: string }>(
    'SELECT value_json FROM app_settings WHERE key = $1',
    [PROMPT_CONFIG_KEY]
  );

  if (!row?.value_json) return DEFAULT_PROMPT_CONFIG;

  try {
    return mergePromptConfig(JSON.parse(row.value_json));
  } catch {
    return DEFAULT_PROMPT_CONFIG;
  }
}

export async function savePromptConfig(payload: unknown): Promise<PromptConfig> {
  const config = validatePromptConfigPatch(payload);
  await query(
    `INSERT INTO app_settings (key, value_json, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()`,
    [PROMPT_CONFIG_KEY, JSON.stringify(config)]
  );
  return config;
}
