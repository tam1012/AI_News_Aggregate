import { Hono } from 'hono';
import { getPromptConfig, savePromptConfig } from '../services/prompt-settings.js';

const settings = new Hono();

settings.get('/prompt', async (c) => {
  const config = await getPromptConfig();
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
