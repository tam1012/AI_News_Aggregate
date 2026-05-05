/**
 * Image proxy route – serves optimized WebP thumbnails.
 *
 * Usage:
 *   /api/img?url=<encoded-source-url>&p=thumb   → 240×160 q60
 *   /api/img?url=<encoded-source-url>&p=detail  → 800×600 q72  (default)
 *   /api/img?url=<encoded-source-url>&p=og      → 1200×630 q75
 *
 * Response headers include long-term cache control so browsers and CDN
 * cache the converted images.  The endpoint is public (no admin auth)
 * since images themselves are already public.
 */
import { Hono } from 'hono';
import { getOptimizedImage, type ImagePreset } from '../lib/imageProxy.js';

export const imageProxy = new Hono();

const VALID_PRESETS = new Set<ImagePreset>(['thumb', 'detail', 'og']);

// 1×1 transparent WebP for fallback
const FALLBACK_WEBP = Buffer.from(
  'UklGRlYAAABXRUJQVlA4IEoAAADQAQCdASoBAAEAAkA4JZQCdAEO/hepgAAA/v3dT//+7f/6XcP/4mUCv/LG9v/+2K///4v///rHwAAAAA==',
  'base64'
);

imageProxy.get('/', async (c) => {
  const sourceUrl = c.req.query('url');
  const presetParam = (c.req.query('p') || 'detail') as ImagePreset;
  const preset = VALID_PRESETS.has(presetParam) ? presetParam : 'detail';

  if (!sourceUrl) {
    return c.json({ error: 'Missing ?url= parameter' }, 400);
  }

  // Basic URL validation
  try {
    const parsed = new URL(sourceUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return c.json({ error: 'Invalid URL protocol' }, 400);
    }
  } catch {
    return c.json({ error: 'Invalid URL' }, 400);
  }

  try {
    const result = await getOptimizedImage(sourceUrl, preset);

    c.header('Content-Type', result.contentType);
    c.header('Cache-Control', 'public, max-age=604800, immutable'); // 7 days
    c.header('X-Cache', result.cacheHit ? 'HIT' : 'MISS');
    c.header('Vary', 'Accept');

    return c.body(result.data as any);
  } catch (err: any) {
    console.warn(`[img-proxy] Failed for ${sourceUrl}: ${err.message}`);

    // Return 1×1 transparent WebP instead of error — prevents broken images
    c.header('Content-Type', 'image/webp');
    c.header('Cache-Control', 'public, max-age=3600'); // short cache for errors
    return c.body(FALLBACK_WEBP as any);
  }
});
