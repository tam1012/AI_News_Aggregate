/**
 * Browser Host Proxy — runs on VPS HOST (not inside Docker).
 *
 * Strategy: Connect to a running Chromium GUI via CDP (Remote Debugging Protocol)
 * and fetch allowlisted pages with the existing verified browser session.
 *
 * Setup:
 *   1. Start Chromium on VPS desktop with --remote-debugging-port=9222
 *   2. Visit challenged source sites once to pass antibot verification
 *   3. This proxy will reuse the browser session for subsequent requests
 */
import { createServer } from 'node:http';
import { chromium, type BrowserContext, type Browser } from 'playwright';
import { refreshCookies, type RefreshResult } from './cookie-refresher.js';

const PORT = parseInt(process.env.VOZ_HOST_PROXY_PORT || '8788', 10);
const BIND_HOST = process.env.VOZ_HOST_PROXY_BIND || '0.0.0.0';
const CDP_URL = process.env.VOZ_CDP_URL || 'http://127.0.0.1:9222';
const AUTO_REFRESH_HOURS = parseInt(process.env.AUTO_REFRESH_HOURS || '8', 10);
let lastRefreshResult: { results: RefreshResult[]; allOk: boolean; timestamp: string } | null = null;
const BROWSER_PROXY_SOURCES = [
  {
    id: 'voz',
    label: 'VOZ',
    hosts: ['voz.vn', 'www.voz.vn'],
    verifyUrl: 'https://voz.vn',
    cookieName: 'cf_clearance',
    requiresCookie: true,
  },
  {
    id: 'reuters',
    label: 'Reuters',
    hosts: ['reuters.com', 'www.reuters.com'],
    verifyUrl: 'https://www.reuters.com',
    cookieName: 'cf_clearance',
    requiresCookie: false,
  },
];
const EXTRA_ALLOWED_HOSTS = (process.env.BROWSER_PROXY_ALLOWED_HOSTS || '')
  .split(',')
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);
const ALLOWED_HOSTS = new Set([
  ...BROWSER_PROXY_SOURCES.flatMap((source) => source.hosts),
  ...EXTRA_ALLOWED_HOSTS,
]);
const CHALLENGE_MARKERS = [
  'Just a moment...',
  'Chờ một chút...',
  'cf-challenge',
  'challenges.cloudflare.com',
  'token.awswaf.com',
  'AwsWafIntegration',
  'awsWafCookieDomainList',
  'challenge-container',
  "verify that you're not a robot",
];

// ---------------------------------------------------------------------------
// CDP connection — connects to running Chromium GUI
// ---------------------------------------------------------------------------
let cdpBrowser: Browser | null = null;
let cdpCtx: BrowserContext | null = null;
let lastConnectAttempt = 0;
const RECONNECT_COOLDOWN = 10_000; // 10s

async function getCdpContext(): Promise<BrowserContext> {
  if (cdpBrowser?.isConnected() && cdpCtx) return cdpCtx;

  const now = Date.now();
  if (now - lastConnectAttempt < RECONNECT_COOLDOWN) {
    throw new Error('CDP reconnect cooldown — Chromium GUI not available');
  }
  lastConnectAttempt = now;

  try {
    cdpBrowser?.close().catch(() => {});
  } catch {}

  console.log(`[browser-proxy] Connecting to Chromium via CDP at ${CDP_URL}...`);
  cdpBrowser = await chromium.connectOverCDP(CDP_URL);
  cdpCtx = cdpBrowser.contexts()[0] ?? await cdpBrowser.newContext();

  cdpBrowser.on('disconnected', () => {
    console.warn('[browser-proxy] CDP disconnected — Chromium GUI closed or crashed');
    cdpBrowser = null;
    cdpCtx = null;
  });

  console.log('[browser-proxy] CDP connected ✅');
  return cdpCtx;
}

function isChallengeHtml(text: string): boolean {
  return CHALLENGE_MARKERS.some((m) => text.includes(m));
}

async function getBrowserProxySourceStatuses(ctx: BrowserContext) {
  return Promise.all(BROWSER_PROXY_SOURCES.map(async (source) => {
    const cookies = await ctx.cookies([source.verifyUrl]);
    const cookie = cookies.find((c) => c.name === source.cookieName);
    const cookieExpiresAt = cookie?.expires && cookie.expires > 0
      ? new Date(cookie.expires * 1000).toISOString()
      : null;
    const needsBrowser = source.requiresCookie && !cookie;

    return {
      id: source.id,
      label: source.label,
      hosts: source.hosts,
      verifyUrl: source.verifyUrl,
      ok: !needsBrowser,
      needsBrowser,
      cookieFound: !!cookie,
      cookieName: source.cookieName,
      cookieExpiresAt,
      cookieCount: cookies.length,
      message: needsBrowser
        ? `${source.label} cần mở Chromium trên VPS, truy cập ${source.verifyUrl} và vượt Cloudflare để làm mới cookie.`
        : `${source.label} proxy đang sẵn sàng.`,
    };
  }));
}

// ---------------------------------------------------------------------------
// Fetch an allowlisted URL using the existing browser context (with user cookies)
// ---------------------------------------------------------------------------
async function fetchProxiedPage(targetUrl: string): Promise<{ html: string; status: number; challenged: boolean }> {
  const url = new URL(targetUrl);
  const isRss = url.pathname.endsWith('.rss');
  const isVoz = url.hostname.endsWith('voz.vn');
  const ctx = await getCdpContext();
  const page = await ctx.newPage();

  try {
    await page.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (['image', 'font', 'media', 'stylesheet'].includes(type)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const status = response?.status() ?? 0;

    if (isRss) {
      await page.waitForTimeout(500);
    } else if (isVoz) {
      await page.waitForSelector('article.message--post', { timeout: 10000 }).catch(() => page.waitForTimeout(2000));
    } else {
      await page.waitForSelector('article, main, [data-testid*="article"]', { timeout: 10000 }).catch(() => page.waitForTimeout(2500));
    }

    const html = isRss
      ? await page.evaluate(() => document.body?.innerText || document.documentElement?.textContent || '')
      : await page.content();
    const challenged = isChallengeHtml(html);

    if (challenged) {
      console.warn(`[browser-proxy] Challenge detected for ${targetUrl} — browser verification may be needed`);
    }

    return { html, status, challenged };
  } finally {
    await page.close();
  }
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
function sendJson(res: import('node:http').ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=UTF-8' });
  res.end(JSON.stringify(data));
}

// ---------------------------------------------------------------------------
// HTTP Server
// ---------------------------------------------------------------------------
const server = createServer(async (req, res) => {
  try {
    const reqUrl = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);

    // Health check
    if (reqUrl.pathname === '/health') {
      const connected = cdpBrowser?.isConnected() ?? false;
      sendJson(res, 200, { ok: true, cdp: connected, cdpUrl: CDP_URL });
      return;
    }

    // Check CDP status
    if (reqUrl.pathname === '/status') {
      try {
        const ctx = await getCdpContext();
        const sources = await getBrowserProxySourceStatuses(ctx);
        const voz = sources.find((source) => source.id === 'voz');
        const vozCookies = await ctx.cookies(['https://voz.vn']);
        const cf = vozCookies.find((c) => c.name === 'cf_clearance');
        sendJson(res, 200, {
          ok: sources.every((source) => source.ok),
          cdpConnected: true,
          cfClearanceFound: !!cf,
          cfClearanceLen: cf?.value.length ?? 0,
          cfClearanceExpiresAt: voz?.cookieExpiresAt || null,
          cookieCount: voz?.cookieCount ?? vozCookies.length,
          sources,
        });
      } catch (err: any) {
        sendJson(res, 503, { ok: false, error: err.message });
      }
      return;
    }

    // Cookie refresh endpoint
    if (reqUrl.pathname === '/refresh') {
      if (req.method !== 'POST' && req.method !== 'GET') {
        sendJson(res, 405, { error: 'Use GET or POST' });
        return;
      }
      console.log('[browser-proxy] Cookie refresh triggered via HTTP');
      try {
        const refreshResult = await refreshCookies(CDP_URL);
        lastRefreshResult = {
          ...refreshResult,
          timestamp: new Date().toISOString(),
        };
        const httpStatus = refreshResult.allOk ? 200 : 207;
        sendJson(res, httpStatus, {
          ok: refreshResult.allOk,
          ...lastRefreshResult,
        });
      } catch (err: any) {
        sendJson(res, 503, { ok: false, error: err.message });
      }
      return;
    }

    // Last refresh status
    if (reqUrl.pathname === '/refresh-status') {
      sendJson(res, 200, lastRefreshResult || { message: 'No refresh has been performed yet.' });
      return;
    }

    // Main fetch endpoint
    if (reqUrl.pathname !== '/fetch') {
      sendJson(res, 404, { error: 'Not found. Use /fetch?url=..., /refresh, /status' });
      return;
    }

    const target = reqUrl.searchParams.get('url');
    if (!target) {
      sendJson(res, 400, { error: 'Missing url param' });
      return;
    }

    const targetUrl = new URL(target);
    if (targetUrl.protocol !== 'https:' || !ALLOWED_HOSTS.has(targetUrl.hostname.toLowerCase())) {
      sendJson(res, 400, { error: 'Only configured HTTPS hosts are allowed' });
      return;
    }

    console.log(`[browser-proxy] Fetching ${targetUrl.pathname}`);
    const { html, status, challenged } = await fetchProxiedPage(targetUrl.toString());

    const isRss = targetUrl.pathname.endsWith('.rss');
    const contentType = isRss ? 'application/rss+xml; charset=UTF-8' : 'text/html; charset=UTF-8';
    res.writeHead(challenged ? 409 : status, { 'Content-Type': contentType });
    res.end(html);
    console.log(`[browser-proxy] Done ${targetUrl.pathname} (status=${status}, challenged=${challenged}, size=${html.length})`);
  } catch (err: any) {
    const message = err.message || String(err);
    console.error(`[browser-proxy] Error: ${message}`);
    sendJson(res, 503, { error: message });
  }
});

server.listen(PORT, BIND_HOST, () => {
  console.log(`Browser host proxy listening on http://${BIND_HOST}:${PORT}`);
  console.log(`CDP target: ${CDP_URL}`);
  console.log(`Strategy: reuse verified Chromium GUI session`);
  console.log(`Auto-refresh: every ${AUTO_REFRESH_HOURS}h`);
  console.log('');
  console.log('⚠️  Requires Chromium GUI running with --remote-debugging-port=9222');
  console.log('   Run your Chromium launcher with remote debugging enabled.');
  console.log('');
  console.log('Endpoints:');
  console.log('   GET  /health         — health check');
  console.log('   GET  /status         — cookie & CDP status');
  console.log('   GET  /fetch?url=...  — proxy fetch');
  console.log('   POST /refresh        — trigger cookie refresh');
  console.log('   GET  /refresh-status — last refresh result');

  // Auto-refresh: run immediately after startup (30s delay), then every N hours
  const autoRefreshMs = AUTO_REFRESH_HOURS * 60 * 60 * 1000;
  const runAutoRefresh = async () => {
    console.log('[auto-refresh] Starting scheduled cookie refresh...');
    try {
      const result = await refreshCookies(CDP_URL);
      lastRefreshResult = {
        ...result,
        timestamp: new Date().toISOString(),
      };
      const icon = result.allOk ? '✅' : '⚠️';
      console.log(`[auto-refresh] ${icon} Completed: ${result.results.map((r) => `${r.label}=${r.success ? 'OK' : 'FAIL'}`).join(', ')}`);
    } catch (err: any) {
      console.error(`[auto-refresh] Failed: ${err.message}`);
    }
  };

  // First refresh 30s after startup (give Chromium time to settle)
  setTimeout(runAutoRefresh, 30_000);
  // Then every AUTO_REFRESH_HOURS
  setInterval(runAutoRefresh, autoRefreshMs);
});
