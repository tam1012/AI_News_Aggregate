// Cloudflare Worker proxy for Reddit API
// Deploy to Cloudflare Workers (free tier: 100k requests/day)
// Set REDDIT_PROXY_URL env var in your app to the Worker URL

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const redditPath = url.searchParams.get('path');
    if (!redditPath) {
      return new Response(JSON.stringify({ error: 'Missing ?path= parameter' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Only allow Reddit paths
    if (!redditPath.startsWith('/r/') && !redditPath.startsWith('/comments/')) {
      return new Response(JSON.stringify({ error: 'Invalid path' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const redditUrl = `https://www.reddit.com${redditPath}${url.search.includes('?') ? '&' : '?'}${url.searchParams.toString().replace(/path=[^&]+&?/, '')}`;

    try {
      const resp = await fetch(redditUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
      });
      const body = await resp.text();
      return new Response(body, {
        status: resp.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
};
