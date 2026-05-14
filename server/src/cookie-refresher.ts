/**
 * Cookie Refresher — Proactively keeps antibot cookies alive.
 *
 * Connects to the running Chromium GUI via CDP and navigates to each
 * configured source site BEFORE cookies expire.  When the browser already
 * has a valid session the page simply loads → the cookie gets refreshed by
 * the site automatically.  No manual intervention needed unless a fresh
 * challenge is presented.
 *
 * Usage:
 *   - Standalone:  npx tsx server/src/cookie-refresher.ts
 *   - Via proxy:   POST http://localhost:8788/refresh
 *   - Cron:        0 *‌/8 * * *  node /path/to/cookie-refresher.js
 *
 * Environment variables:
 *   VOZ_CDP_URL     — CDP endpoint (default http://127.0.0.1:9222)
 *   TELEGRAM_BOT_TOKEN  — optional, for failure alerts
 *   TELEGRAM_CHAT_ID    — optional, for failure alerts
 */
import { chromium, type Browser, type BrowserContext } from 'playwright';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const CDP_URL = process.env.VOZ_CDP_URL || 'http://127.0.0.1:9222';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

const CHALLENGE_MARKERS = [
  'Just a moment...',
  'Chờ một chút...',
  'cf-challenge',
  'challenges.cloudflare.com',
  'Verify you are human',
  'Please verify',
  'captcha',
];

interface RefreshTarget {
  id: string;
  label: string;
  url: string;
  /** CSS selector to confirm the page loaded real content */
  contentSelector: string;
  /** Max ms to wait for content selector */
  waitMs: number;
  /** Cookie name to check after refresh */
  cookieName?: string;
}

const TARGETS: RefreshTarget[] = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isChallengeHtml(text: string): boolean {
  const lowered = text.toLowerCase();
  return CHALLENGE_MARKERS.some((m) => lowered.includes(m.toLowerCase()));
}

function formatDate(date: Date): string {
  return date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

async function sendTelegramAlert(message: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML',
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err: any) {
    console.error(`[cookie-refresher] Telegram alert failed: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Main refresh logic
// ---------------------------------------------------------------------------
export interface RefreshResult {
  id: string;
  label: string;
  url: string;
  success: boolean;
  challenged: boolean;
  cookieStatus: string | null;
  message: string;
  durationMs: number;
}

export async function refreshCookies(
  cdpUrl = CDP_URL,
): Promise<{ results: RefreshResult[]; allOk: boolean }> {
  let browser: Browser | null = null;
  const results: RefreshResult[] = [];

  try {
    console.log(`[cookie-refresher] Connecting to Chromium via CDP at ${cdpUrl}...`);
    browser = await chromium.connectOverCDP(cdpUrl);
    const ctx: BrowserContext = browser.contexts()[0] ?? await browser.newContext();
    console.log('[cookie-refresher] CDP connected ✅');

    for (const target of TARGETS) {
      const start = Date.now();
      const result: RefreshResult = {
        id: target.id,
        label: target.label,
        url: target.url,
        success: false,
        challenged: false,
        cookieStatus: null,
        message: '',
        durationMs: 0,
      };

      try {
        // Open a new page in the existing browser context
        const page = await ctx.newPage();
        try {
          // Block heavy resources to speed up load
          await page.route('**/*', (route) => {
            const type = route.request().resourceType();
            if (['image', 'font', 'media'].includes(type)) {
              route.abort();
            } else {
              route.continue();
            }
          });

          console.log(`[cookie-refresher] Navigating to ${target.url}...`);
          const response = await page.goto(target.url, {
            waitUntil: 'domcontentloaded',
            timeout: 30_000,
          });

          const status = response?.status() ?? 0;

          // Wait for real content to appear
          try {
            await page.waitForSelector(target.contentSelector, {
              timeout: target.waitMs,
            });
          } catch {
            // Content selector not found — might be a challenge page
          }

          // Small settle delay
          await page.waitForTimeout(2000);

          const html = await page.content();
          const challenged = isChallengeHtml(html);

          // Check cookie status
          if (target.cookieName) {
            const cookies = await ctx.cookies([target.url]);
            const cookie = cookies.find((c) => c.name === target.cookieName);
            if (cookie) {
              const expiresAt = cookie.expires && cookie.expires > 0
                ? formatDate(new Date(cookie.expires * 1000))
                : 'session';
              result.cookieStatus = `${target.cookieName} found, expires ${expiresAt}`;
            } else {
              result.cookieStatus = `${target.cookieName} NOT found`;
            }
          }

          if (challenged) {
            result.challenged = true;
            result.message = `Challenge detected (status=${status}). Manual verification required.`;
            console.warn(`[cookie-refresher] ⚠️ ${target.label}: ${result.message}`);
          } else if (status >= 200 && status < 400) {
            result.success = true;
            result.message = `Page loaded OK (status=${status}). Cookie refreshed.`;
            console.log(`[cookie-refresher] ✅ ${target.label}: ${result.message}`);
          } else {
            result.message = `Unexpected status ${status}.`;
            console.warn(`[cookie-refresher] ⚠️ ${target.label}: ${result.message}`);
          }
        } finally {
          await page.close();
        }
      } catch (err: any) {
        result.message = `Error: ${err.message}`;
        console.error(`[cookie-refresher] ❌ ${target.label}: ${result.message}`);
      }

      result.durationMs = Date.now() - start;
      results.push(result);

      // Small delay between targets
      if (TARGETS.indexOf(target) < TARGETS.length - 1) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  } catch (err: any) {
    console.error(`[cookie-refresher] CDP connection failed: ${err.message}`);
    for (const target of TARGETS) {
      if (!results.find((r) => r.id === target.id)) {
        results.push({
          id: target.id,
          label: target.label,
          url: target.url,
          success: false,
          challenged: false,
          cookieStatus: null,
          message: `CDP connection failed: ${err.message}`,
          durationMs: 0,
        });
      }
    }
  }

  const allOk = results.every((r) => r.success);

  // Send Telegram alert for failures
  if (!allOk) {
    const failedTargets = results.filter((r) => !r.success);
    const alertLines = [
      '🔴 <b>Cookie Refresh Failed</b>',
      '',
      ...failedTargets.map((r) => {
        const icon = r.challenged ? '⚠️' : '❌';
        return `${icon} <b>${r.label}</b>: ${r.message}`;
      }),
      '',
      `🕐 ${formatDate(new Date())}`,
      '',
      '👉 Cần mở Chromium trên VPS, truy cập trang bị challenge để verify thủ công.',
    ];
    await sendTelegramAlert(alertLines.join('\n'));
  } else {
    console.log(`[cookie-refresher] All ${results.length} targets refreshed successfully ✅`);
  }

  return { results, allOk };
}

// ---------------------------------------------------------------------------
// CLI entry point — run when called directly
// ---------------------------------------------------------------------------
const isDirectRun = process.argv[1]?.endsWith('cookie-refresher.ts') ||
  process.argv[1]?.endsWith('cookie-refresher.js');

if (isDirectRun) {
  refreshCookies()
    .then(({ results, allOk }) => {
      console.log('\n--- Cookie Refresh Summary ---');
      for (const r of results) {
        const icon = r.success ? '✅' : r.challenged ? '⚠️' : '❌';
        console.log(`${icon} ${r.label}: ${r.message} (${r.durationMs}ms)`);
        if (r.cookieStatus) console.log(`   Cookie: ${r.cookieStatus}`);
      }
      console.log(`\nOverall: ${allOk ? 'ALL OK ✅' : 'NEEDS ATTENTION ⚠️'}`);
      process.exit(allOk ? 0 : 1);
    })
    .catch((err) => {
      console.error('Fatal error:', err);
      process.exit(2);
    });
}
