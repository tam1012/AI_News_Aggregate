/**
 * Image proxy with on-the-fly resizing + WebP conversion.
 * Downloads the source image once, resizes to the requested preset,
 * converts to WebP, and caches the result on disk so subsequent
 * requests are served instantly without re-processing.
 */
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';

/* ── Presets ── */
export type ImagePreset = 'thumb' | 'detail' | 'og';

interface PresetConfig {
  width: number;
  height: number;
  quality: number;
}

const PRESETS: Record<ImagePreset, PresetConfig> = {
  thumb:  { width: 240,  height: 160, quality: 60 },
  detail: { width: 800,  height: 600, quality: 72 },
  og:     { width: 1200, height: 630, quality: 75 },
};

/* ── Cache config ── */
const CACHE_DIR = process.env.IMAGE_CACHE_DIR || '/tmp/img-cache';
const MAX_CACHE_SIZE_MB = parseInt(process.env.IMAGE_CACHE_MAX_MB || '200', 10);
const FETCH_TIMEOUT_MS = 8000;
const MAX_SOURCE_BYTES = 10 * 1024 * 1024; // 10 MB source limit

/* Ensure cache dir exists */
function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/* ── Cache key ── */
function cacheKey(url: string, preset: ImagePreset): string {
  const hash = createHash('sha256').update(`${preset}:${url}`).digest('hex').slice(0, 16);
  return `${preset}_${hash}.webp`;
}

/* ── Eviction: oldest-first when cache exceeds limit ── */
function evictIfNeeded(): void {
  try {
    const files = readdirSync(CACHE_DIR)
      .map(f => {
        const fullPath = join(CACHE_DIR, f);
        try {
          const stat = statSync(fullPath);
          return { path: fullPath, size: stat.size, mtimeMs: stat.mtimeMs };
        } catch {
          return null;
        }
      })
      .filter(Boolean) as { path: string; size: number; mtimeMs: number }[];

    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    if (totalBytes <= MAX_CACHE_SIZE_MB * 1024 * 1024) return;

    // Sort oldest first
    files.sort((a, b) => a.mtimeMs - b.mtimeMs);
    let freed = 0;
    const target = totalBytes - MAX_CACHE_SIZE_MB * 1024 * 1024;
    for (const f of files) {
      if (freed >= target) break;
      try { unlinkSync(f.path); freed += f.size; } catch { /* ignore */ }
    }
  } catch { /* ignore errors during eviction */ }
}

/* ── Main processor ── */
export async function getOptimizedImage(
  sourceUrl: string,
  preset: ImagePreset = 'detail',
): Promise<{ data: Buffer; contentType: string; cacheHit: boolean }> {
  ensureCacheDir();

  const filename = cacheKey(sourceUrl, preset);
  const cachePath = join(CACHE_DIR, filename);

  // Cache hit
  if (existsSync(cachePath)) {
    return {
      data: readFileSync(cachePath),
      contentType: 'image/webp',
      cacheHit: true,
    };
  }

  // Download source image
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(sourceUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SynthNewsBot/1.0)',
        'Accept': 'image/*',
      },
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Source returned ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) {
    throw new Error(`Not an image: ${contentType}`);
  }

  const buf = Buffer.from(await response.arrayBuffer());
  if (buf.length > MAX_SOURCE_BYTES) {
    throw new Error(`Source image too large: ${(buf.length / 1024 / 1024).toFixed(1)}MB`);
  }

  // Resize + convert
  const config = PRESETS[preset];
  const webpBuf = await sharp(buf)
    .resize(config.width, config.height, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: config.quality })
    .toBuffer();

  // Write to cache
  try {
    writeFileSync(cachePath, webpBuf);
    evictIfNeeded();
  } catch (e) {
    console.warn('[img-proxy] Cache write failed:', e);
  }

  return {
    data: webpBuf,
    contentType: 'image/webp',
    cacheHit: false,
  };
}
