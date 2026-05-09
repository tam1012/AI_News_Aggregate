import { execFile } from 'child_process';
import puppeteer from 'puppeteer-core';
import { normalizePublicHttpUrl } from '../../lib/utils.js';

export const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

export function curlFetch(url: string, accept: string, timeoutSec: number): Promise<{ ok: boolean; status: number; text: () => Promise<string>; json: () => Promise<any> }> {
  return new Promise((resolve, reject) => {
    const safeUrl = normalizePublicHttpUrl(url);
    if (!safeUrl) {
      reject(new Error('URL must be a public http(s) URL'));
      return;
    }

    const safeTimeout = Math.max(1, Math.min(timeoutSec, 60));
    const args = [
      '-s',
      '-L',
      '--max-time', String(safeTimeout),
      '-H', `User-Agent: ${BROWSER_UA}`,
      '-H', `Accept: ${accept}`,
      '-H', 'Accept-Language: vi-VN,vi;q=0.9,en;q=0.8',
      safeUrl,
    ];
    execFile('curl', args, { timeout: (safeTimeout + 2) * 1000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) {
        reject(err);
        return;
      }
      const body = stdout || '';
      const isBlocked = body.includes('Just a moment...') || body.includes('<title>Blocked</title>');
      resolve({
        ok: !isBlocked && body.length > 100,
        status: isBlocked ? 403 : 200,
        text: async () => body,
        json: async () => JSON.parse(body),
      });
    });
  });
}

let browserInstance: any = null;

async function getBrowser(): Promise<any> {
  if (browserInstance && browserInstance.connected) return browserInstance;
  browserInstance = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
    headless: true,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1920,1080',
    ],
  });
  return browserInstance;
}

export interface BrowserFetchOptions {
  rawText?: boolean;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
  blockHeavyResources?: boolean;
  settleMs?: number;
}

export async function browserFetch(url: string, timeoutMs: number = 30000, rawTextOrOptions: boolean | BrowserFetchOptions = false): Promise<string> {
  const safeUrl = normalizePublicHttpUrl(url);
  if (!safeUrl) throw new Error('URL must be a public http(s) URL');

  const options: BrowserFetchOptions = typeof rawTextOrOptions === 'boolean' ? { rawText: rawTextOrOptions } : rawTextOrOptions;
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      (window as any).chrome = { runtime: {} };
    });
    if (options.blockHeavyResources) {
      await page.setRequestInterception(true);
      page.on('request', (request: any) => {
        const resourceType = request.resourceType();
        if (['image', 'font', 'media', 'stylesheet'].includes(resourceType)) {
          request.abort();
          return;
        }
        request.continue();
      });
    }
    await page.setUserAgent(BROWSER_UA);
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto(safeUrl, { waitUntil: options.waitUntil || 'networkidle2', timeout: timeoutMs });

    try {
      const acceptBtn = await page.$('button[aria-label="Accept all cookies"], button:has-text("Accept")');
      if (acceptBtn) await acceptBtn.click();
      await new Promise(r => setTimeout(r, options.settleMs ?? 500));
    } catch {}

    if (options.rawText) {
      return await page.evaluate(() => document.body?.innerText || document.documentElement?.textContent || '');
    }
    return await page.content();
  } finally {
    await page.close();
  }
}
