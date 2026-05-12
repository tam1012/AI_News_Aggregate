// Cloudflare Worker proxy for VOZ RSS/forum pages.
// Set VOZ_PROXY_URL env var in the app to the deployed Worker URL.

const ALLOWED_HOSTS = new Set(['voz.vn', 'www.voz.vn']);

function createCorsHeaders(contentType) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': contentType || 'text/plain; charset=UTF-8',
    'Cache-Control': 'public, max-age=120',
  };
}

function errorResponse(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: createCorsHeaders('application/json; charset=UTF-8'),
  });
}

export default {
  async fetch(request) {
    const requestUrl = new URL(request.url);
    const target = requestUrl.searchParams.get('url');
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

    try {
      const response = await fetch(targetUrl.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Accept': targetUrl.pathname.endsWith('.rss')
            ? 'application/rss+xml, application/xml, text/xml, application/atom+xml;q=0.9, */*;q=0.8'
            : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
          'Cache-Control': 'no-cache',
        },
        cf: {
          cacheTtl: targetUrl.pathname.endsWith('.rss') ? 120 : 60,
          cacheEverything: false,
        },
      });

      const body = await response.arrayBuffer();
      return new Response(body, {
        status: response.status,
        headers: createCorsHeaders(response.headers.get('Content-Type')),
      });
    } catch (err) {
      return errorResponse(err.message || 'Proxy fetch failed', 502);
    }
  },
};
