import { createServer } from 'node:http';
import { URL } from 'node:url';
import { chromium, type BrowserContext } from 'playwright';

const PORT = parseInt(process.env.VOZ_HOST_PROXY_PORT || '8788', 10);
const PROFILE_DIR = process.env.VOZ_HOST_PROFILE_DIR || '/home/ubuntu/.config/chromium';
const CHROMIUM_PATH = process.env.VOZ_HOST_CHROMIUM_PATH || '/usr/bin/chromium';
const HEADLESS = process.env.VOZ_HOST_HEADLESS === '1';
const ALLOWED_HOSTS = new Set(['voz.vn', 'www.voz.vn']);
const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const CHALLENGE_MARKERS = ['Just a moment...', 'Chờ một chút...', 'cf-challenge', 'challenges.cloudflare.com'];

let contextPromise: Promise<BrowserContext> | null = null;
let warmupPromise: Promise<void> | null = null;

function isChallengeHtml(text: string): boolean {
  return CHALLENGE_MARKERS.some((marker) => text.includes(marker));
}

async function waitForVozVerification(page: import('playwright').Page): Promise<void> {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const title = await page.title().catch(() => '');
    const html = await page.content().catch(() => '');
    if (!isChallengeHtml(`${title}\n${html}`)) {
      return;
    }
    await page.waitForTimeout(3000);
  }
}

async function warmupVozSession(context: BrowserContext): Promise<void> {
  const page = await context.newPage();
  try {
    await page.goto('https://voz.vn/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await waitForVozVerification(page);
    await page.waitForTimeout(3000);
  } finally {
    await page.close();
  }
}

async function ensureWarmup(context: BrowserContext): Promise<void> {
  if (!warmupPromise) {
    warmupPromise = warmupVozSession(context).catch((error) => {
      warmupPromise = null;
      throw error;
    });
  }
  await warmupPromise;
}

async function getChallengeSummary(context: BrowserContext): Promise<{
  title: string;
  cookies: Array<{ name: string; domain: string; expires: number }>;
}> {
  const page = await context.newPage();
  try {
    await page.goto('https://voz.vn/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2000);
    const title = await page.title();
    const cookies = await context.cookies('https://voz.vn/');
    return {
      title,
      cookies: cookies.map((cookie) => ({
        name: cookie.name,
        domain: cookie.domain,
        expires: cookie.expires,
      })),
    };
  } finally {
    await page.close();
  }
}

async function getContext(): Promise<BrowserContext> {
  if (!contextPromise) {
    contextPromise = chromium.launchPersistentContext(PROFILE_DIR, {
      executablePath: CHROMIUM_PATH,
      headless: HEADLESS,
      viewport: { width: 1440, height: 900 },
      userAgent: DEFAULT_UA,
      locale: 'vi-VN',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1440,900',
      ],
    });
  }
  return contextPromise;
}

function sendJson(res: import('node:http').ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=UTF-8' });
  res.end(JSON.stringify(data));
}

const server = createServer(async (req, res) => {
  try {
    const reqUrl = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);

    if (reqUrl.pathname === '/health') {
      sendJson(res, 200, { ok: true, profileDir: PROFILE_DIR, headless: HEADLESS });
      return;
    }

    const context = await getContext();

    if (reqUrl.pathname === '/warmup') {
      await ensureWarmup(context);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (reqUrl.pathname === '/debug/cookies') {
      const summary = await getChallengeSummary(context);
      sendJson(res, 200, summary);
      return;
    }

    if (reqUrl.pathname !== '/fetch') {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    await ensureWarmup(context);

    const target = reqUrl.searchParams.get('url');
    if (!target) {
      sendJson(res, 400, { error: 'Missing url param' });
      return;
    }

    const targetUrl = new URL(target);
    if (targetUrl.protocol !== 'https:' || !ALLOWED_HOSTS.has(targetUrl.hostname.toLowerCase())) {
      sendJson(res, 400, { error: 'Only https://voz.vn URLs are allowed' });
      return;
    }

    const page = await context.newPage();

    try {
      await page.goto(targetUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(3000);
      const html = await page.content();
      const challenge = isChallengeHtml(html);
      const contentType = targetUrl.pathname.endsWith('.rss') ? 'application/rss+xml; charset=UTF-8' : 'text/html; charset=UTF-8';
      res.writeHead(challenge ? 409 : 200, { 'Content-Type': contentType });
      res.end(html);
    } finally {
      await page.close();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendJson(res, 500, { error: message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`VOZ host proxy listening on http://127.0.0.1:${PORT}`);
  console.log(`Profile dir: ${PROFILE_DIR}`);
  console.log(`Headless: ${HEADLESS}`);
});
