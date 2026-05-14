/**
 * Simple VOZ proxy worker — runs on Cloudflare edge.
 * Cloudflare-to-Cloudflare requests bypass Turnstile/managed challenges.
 * No browser rendering needed.
 */
const ALLOWED_HOSTS = new Set(['voz.vn', 'www.voz.vn']);

function createHeaders(contentType) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': contentType || 'text/plain; charset=UTF-8',
    'Cache-Control': 'public, max-age=60',
  };
}

function errorResponse(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: createHeaders('application/json; charset=UTF-8'),
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true }), {
        headers: createHeaders('application/json'),
      });
    }

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const target = url.searchParams.get('url');
    if (!target) return errorResponse('Missing ?url= parameter');

    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      return errorResponse('Invalid url parameter');
    }

    if (targetUrl.protocol !== 'https:' || !ALLOWED_HOSTS.has(targetUrl.hostname.toLowerCase())) {
      return errorResponse('Only https://voz.vn URLs are allowed');
    }

    const isRss = targetUrl.pathname.endsWith('.rss');
    const accept = isRss
      ? 'application/rss+xml, application/xml, text/xml, */*;q=0.8'
      : 'text/html,application/xhtml+xml,*/*;q=0.8';

    try {
      const response = await fetch(targetUrl.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Accept': accept,
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      });

      const text = await response.text();
      const contentType = isRss ? 'application/rss+xml; charset=UTF-8' : 'text/html; charset=UTF-8';

      return new Response(text, {
        status: response.status,
        headers: createHeaders(contentType),
      });
    } catch (err) {
      return errorResponse(err.message || 'Fetch failed', 502);
    }
  },
};
