import { Hono } from 'hono';
import { DEFAULT_PROMPT_CONFIG } from '../lib/promptConfig.js';
import { getPromptConfig, resetPromptConfig, savePromptConfig } from '../services/prompt-settings.js';

const settings = new Hono();

settings.get('/prompt', async (c) => {
  const config = await getPromptConfig();
  return c.json({ success: true, data: config });
});

settings.get('/prompt/default', async (c) => {
  return c.json({ success: true, data: DEFAULT_PROMPT_CONFIG });
});

settings.post('/prompt/reset', async (c) => {
  const config = await resetPromptConfig();
  return c.json({ success: true, data: config });
});

settings.patch('/prompt', async (c) => {
  try {
    const body = await c.req.json();
    const config = await savePromptConfig(body);
    return c.json({ success: true, data: config });
  } catch (err: any) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION', message: err.message || 'Invalid prompt config' },
    }, 400);
  }
});

export { settings };
