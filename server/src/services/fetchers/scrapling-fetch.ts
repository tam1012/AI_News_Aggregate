import { playwrightFetch, type PlaywrightFetchOptions } from './http-utils.js';

const SCRAPLING_SERVICE_URL = process.env.SCRAPLING_SERVICE_URL || '';

export class ScraplingUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScraplingUnavailableError';
  }
}

export interface ScraplingFetchOptions {
  mode?: 'stealth' | 'fast';
  rawText?: boolean;
  waitSelector?: string;
  waitMs?: number;
  blockResources?: boolean;
  timeoutMs?: number;
  solveCloudflare?: boolean;
}

interface ScraplingResponse {
  ok: boolean;
  html?: string;
  error?: string;
  status_code: number;
  elapsed_ms: number;
}

export async function scraplingFetch(url: string, options: ScraplingFetchOptions = {}): Promise<string> {
  if (!SCRAPLING_SERVICE_URL) {
    throw new ScraplingUnavailableError('SCRAPLING_SERVICE_URL not configured');
  }

  const timeout = options.timeoutMs || 60000;

  let res: Response;
  try {
    res = await fetch(`${SCRAPLING_SERVICE_URL}/fetch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        mode: options.mode || 'stealth',
        options: {
          wait_selector: options.waitSelector,
          wait_ms: options.waitMs,
          block_resources: options.blockResources ?? true,
          raw_text: options.rawText ?? false,
          timeout_ms: timeout,
          solve_cloudflare: options.solveCloudflare ?? false,
        },
      }),
      signal: AbortSignal.timeout(timeout + 5000),
    });
  } catch (err: any) {
    throw new ScraplingUnavailableError(`Scrapling service unreachable: ${err.message}`);
  }

  if (!res.ok) {
    throw new ScraplingUnavailableError(`Scrapling service returned HTTP ${res.status}`);
  }

  const data: ScraplingResponse = await res.json();

  if (!data.ok) {
    throw new Error(`Scrapling fetch failed: ${data.error || 'unknown error'}`);
  }

  return data.html || '';
}

export async function scraplingFetchWithFallback(
  url: string,
  scraplingOpts: ScraplingFetchOptions,
  playwrightOpts: PlaywrightFetchOptions,
): Promise<string> {
  try {
    return await scraplingFetch(url, scraplingOpts);
  } catch (err: any) {
    if (err instanceof ScraplingUnavailableError) {
      console.warn(`[scrapling] Service unavailable, falling back to Playwright for ${url}`);
      return playwrightFetch(url, playwrightOpts);
    }
    throw err;
  }
}
