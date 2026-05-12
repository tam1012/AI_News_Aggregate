/**
 * VOZ Host Proxy — runs on VPS HOST (not inside Docker).
 *
 * Strategy: Connect to a running Chromium GUI via CDP (Remote Debugging Protocol),
 * reuse its cf_clearance cookie (already passed by real user), and fetch VOZ pages.
 *
 * Setup:
 *   1. Start Chromium on VPS desktop with --remote-debugging-port=9222
 *   2. Visit voz.vn once to pass Cloudflare challenge
 *   3. This proxy will reuse the cf_clearance cookie for all subsequent requests
 *
 * Cookie lifetime: ~24h — user needs to revisit voz.vn once per day.
 */
import { createServer } from 'node:http';
import { chromium, type BrowserContext, type Browser } from 'playwright';

const PORT = parseInt(process.env.VOZ_HOST_PROXY_PORT || '8788', 10);
const BIND_HOST = process.env.VOZ_HOST_PROXY_BIND || '0.0.0.0';
const CDP_URL = process.env.VOZ_CDP_URL || 'http://127.0.0.1:9222';
const ALLOWED_HOSTS = new Set(['voz.vn', 'www.voz.vn']);
const CHALLENGE_MARKERS = ['Just a moment...', 'Chờ một chút...', 'cf-challenge', 'challenges.cloudflare.com'];

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

  console.log(`[voz-proxy] Connecting to Chromium via CDP at ${CDP_URL}...`);
  cdpBrowser = await chromium.connectOverCDP(CDP_URL);
  cdpCtx = cdpBrowser.contexts()[0] ?? await cdpBrowser.newContext();

  cdpBrowser.on('disconnected', () => {
    console.warn('[voz-proxy] CDP disconnected — Chromium GUI closed or crashed');
    cdpBrowser = null;
    cdpCtx = null;
  });

  console.log('[voz-proxy] CDP connected ✅');
  return cdpCtx;
}

function isChallengeHtml(text: string): boolean {
  return CHALLENGE_MARKERS.some((m) => text.includes(m));
}

// ---------------------------------------------------------------------------
// Fetch a VOZ URL using the existing browser context (with cf_clearance)
// ---------------------------------------------------------------------------
async function fetchVozPage(targetUrl: string): Promise<{ html: string; status: number; challenged: boolean }> {
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

    // Wait a bit for JS to settle
    await page.waitForTimeout(1000);

    const html = await page.content();
    const challenged = isChallengeHtml(html);

    if (challenged) {
      console.warn(`[voz-proxy] Challenge detected for ${targetUrl} — cf_clearance may have expired`);
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
        const cookies = await ctx.cookies(['https://voz.vn']);
        const cf = cookies.find((c) => c.name === 'cf_clearance');
        sendJson(res, 200, {
          ok: true,
          cdpConnected: true,
          cfClearanceFound: !!cf,
          cfClearanceLen: cf?.value.length ?? 0,
          cookieCount: cookies.length,
        });
      } catch (err: any) {
        sendJson(res, 503, { ok: false, error: err.message });
      }
      return;
    }

    // Main fetch endpoint
    if (reqUrl.pathname !== '/fetch') {
      sendJson(res, 404, { error: 'Not found. Use /fetch?url=...' });
      return;
    }

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

    console.log(`[voz-proxy] Fetching ${targetUrl.pathname}`);
    const { html, status, challenged } = await fetchVozPage(targetUrl.toString());

    const isRss = targetUrl.pathname.endsWith('.rss');
    const contentType = isRss ? 'application/rss+xml; charset=UTF-8' : 'text/html; charset=UTF-8';
    res.writeHead(challenged ? 409 : status, { 'Content-Type': contentType });
    res.end(html);
    console.log(`[voz-proxy] Done ${targetUrl.pathname} (status=${status}, challenged=${challenged}, size=${html.length})`);
  } catch (err: any) {
    const message = err.message || String(err);
    console.error(`[voz-proxy] Error: ${message}`);
    sendJson(res, 503, { error: message });
  }
});

server.listen(PORT, BIND_HOST, () => {
  console.log(`VOZ host proxy listening on http://${BIND_HOST}:${PORT}`);
  console.log(`CDP target: ${CDP_URL}`);
  console.log(`Strategy: reuse cf_clearance from running Chromium GUI`);
  console.log('');
  console.log('⚠️  Requires Chromium GUI running with --remote-debugging-port=9222');
  console.log('   Run: ~/Desktop/voz-browser.sh');
});
