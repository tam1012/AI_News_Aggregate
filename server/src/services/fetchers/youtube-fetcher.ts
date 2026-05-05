import { query } from '../../db/index.js';
import { normalizePublicHttpUrl } from '../../lib/utils.js';
import { insertArticleIfNew } from './article-writer.js';
import type { DiscoveredArticle } from '../article-fetch-queue.js';
import type { SourceFetcher, SourceRow } from './types.js';

const YOUTUBE_FEED_ACCEPT = 'application/atom+xml, application/xml, text/xml, */*;q=0.8';
const YOUTUBE_TRANSCRIPT_HOST = 'yt-api.p.rapidapi.com';

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function getTagText(xml: string, tagName: string): string {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = xml.match(new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'i'));
  return decodeXmlEntities(match?.[1] || '').replace(/\s+/g, ' ').trim();
}

function getTagAttr(xml: string, tagName: string, attrName: string): string | null {
  const escapedTag = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedAttr = attrName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tag = xml.match(new RegExp(`<${escapedTag}\\b[^>]*>`, 'i'))?.[0] || '';
  const attr = tag.match(new RegExp(`${escapedAttr}\\s*=\\s*(['"])(.*?)\\1`, 'i'));
  return attr?.[2] ? decodeXmlEntities(attr[2]) : null;
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

export function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (host === 'youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean)[0];
      return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }

    if (host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com') {
      const watchId = parsed.searchParams.get('v');
      if (watchId && /^[a-zA-Z0-9_-]{11}$/.test(watchId)) return watchId;

      const pathMatch = parsed.pathname.match(/^\/(?:embed|shorts|live)\/([a-zA-Z0-9_-]{11})/);
      if (pathMatch) return pathMatch[1];
    }
  } catch {
    return null;
  }

  return null;
}

function extractYouTubeHandle(url: string): string | null {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/^\/@([a-zA-Z0-9._-]+)\/?$/);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

function extractChannelIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/^\/channel\/(UC[a-zA-Z0-9_-]+)\/?$/);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

async function saveYouTubeChannelId(source: SourceRow, channelId: string): Promise<void> {
  const parserConfig = {
    ...(source.parser_config || {}),
    youtubeChannelId: channelId,
  };
  source.parser_config = parserConfig;
  await query('UPDATE sources SET parser_config = $1 WHERE id = $2', [JSON.stringify(parserConfig), source.id]);
}

async function resolveYouTubeChannelId(source: SourceRow): Promise<string> {
  const cached = source.parser_config?.youtubeChannelId || source.parser_config?.channel_id;
  if (typeof cached === 'string' && cached.startsWith('UC')) return cached;

  const directChannelId = extractChannelIdFromUrl(source.url);
  if (directChannelId) {
    await saveYouTubeChannelId(source, directChannelId);
    return directChannelId;
  }

  const handle = extractYouTubeHandle(source.url);
  if (!handle) throw new Error(`Cannot resolve YouTube channel from URL: ${source.url}`);

  try {
    const pageResponse = await fetch(`https://www.youtube.com/@${handle}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SynthNews/1.0)',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (pageResponse.ok) {
      const html = await pageResponse.text();
      const rssMatch = html.match(/"rssUrl":"https:\/\/www\.youtube\.com\/feeds\/videos\.xml\?channel_id=([a-zA-Z0-9_-]+)"/);
      const externalIdMatch = html.match(/"externalId":"(UC[a-zA-Z0-9_-]+)"/);
      const channelId = rssMatch?.[1] || externalIdMatch?.[1];
      if (channelId) {
        await saveYouTubeChannelId(source, channelId);
        return channelId;
      }
    }
  } catch {
    // Fall through to API fallback.
  }

  if (process.env.YOUTUBE_API_KEY) {
    const apiResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(handle)}&key=${encodeURIComponent(process.env.YOUTUBE_API_KEY)}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (apiResponse.ok) {
      const data: any = await apiResponse.json();
      const channelId = data.items?.[0]?.id;
      if (typeof channelId === 'string') {
        await saveYouTubeChannelId(source, channelId);
        return channelId;
      }
    }
  }

  throw new Error(`Could not resolve YouTube channel_id for @${handle}`);
}

export interface DiscoverYouTubeFeedOptions {
  sourceId: string;
  maxItems: number;
  now?: Date;
  recentDays?: number;
}

export function discoverYouTubeVideosFromFeed(xml: string, options: DiscoverYouTubeFeedOptions): DiscoveredArticle[] {
  const entries = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  const now = options.now || new Date();
  const recentDays = options.recentDays || 7;
  const oldestAllowed = new Date(now.getTime() - recentDays * 24 * 60 * 60 * 1000);

  return entries.flatMap((entry) => {
    const videoId = getTagText(entry, 'yt:videoId');
    const channelId = getTagText(entry, 'yt:channelId');
    const title = getTagText(entry, 'title');
    const link = getTagAttr(entry, 'link', 'href') || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : '');
    const publishedRaw = getTagText(entry, 'published') || getTagText(entry, 'updated');
    const publishedAt = publishedRaw ? new Date(publishedRaw) : null;
    if (!videoId || !title || !link) return [];
    if (publishedAt && publishedAt < oldestAllowed) return [];

    const description = getTagText(entry, 'media:description');
    const thumbnail = getTagAttr(entry, 'media:thumbnail', 'url') || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    const normalizedUrl = normalizePublicHttpUrl(link);
    if (!normalizedUrl) return [];

    return [{
      sourceId: options.sourceId,
      url: normalizedUrl,
      title,
      externalId: videoId,
      publishedAt: publishedAt ? publishedAt.toISOString() : null,
      payload: {
        videoId,
        channelId: channelId || null,
        description: truncate(description, 1000),
        imageUrl: thumbnail,
        contentHashSeed: `${videoId}:${title}`,
      },
    }];
  }).slice(0, options.maxItems);
}

async function fetchYouTubeViaRss(channelId: string, sourceId: string): Promise<DiscoveredArticle[] | null> {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  const response = await fetch(feedUrl, {
    headers: {
      'User-Agent': 'SynthNews/1.0 (YouTube RSS Reader)',
      Accept: YOUTUBE_FEED_ACCEPT,
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) return null;
  const xml = await response.text();
  return discoverYouTubeVideosFromFeed(xml, {
    sourceId,
    maxItems: parsePositiveInt(process.env.MAX_ARTICLES_PER_SOURCE, 20),
    recentDays: parsePositiveInt(process.env.YOUTUBE_RECENT_DAYS, 7),
  });
}

async function fetchYouTubeViaApi(channelId: string, sourceId: string): Promise<DiscoveredArticle[]> {
  if (!process.env.YOUTUBE_API_KEY) throw new Error('YOUTUBE_API_KEY is not configured');

  const key = encodeURIComponent(process.env.YOUTUBE_API_KEY);
  const channelResponse = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${encodeURIComponent(channelId)}&key=${key}`,
    { signal: AbortSignal.timeout(10000) }
  );
  if (!channelResponse.ok) throw new Error(`YouTube API channels failed: ${channelResponse.status}`);
  const channelData: any = await channelResponse.json();
  const playlistId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!playlistId) throw new Error(`No uploads playlist found for YouTube channel ${channelId}`);

  const itemsResponse = await fetch(
    `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${encodeURIComponent(playlistId)}&maxResults=${parsePositiveInt(process.env.MAX_ARTICLES_PER_SOURCE, 20)}&key=${key}`,
    { signal: AbortSignal.timeout(10000) }
  );
  if (!itemsResponse.ok) throw new Error(`YouTube API playlistItems failed: ${itemsResponse.status}`);
  const itemsData: any = await itemsResponse.json();
  const now = new Date();
  const oldestAllowed = new Date(now.getTime() - parsePositiveInt(process.env.YOUTUBE_RECENT_DAYS, 7) * 24 * 60 * 60 * 1000);

  return (itemsData.items || []).flatMap((item: any) => {
    const videoId = item.contentDetails?.videoId;
    const snippet = item.snippet || {};
    const publishedAt = snippet.publishedAt ? new Date(snippet.publishedAt) : null;
    if (!videoId || !snippet.title) return [];
    if (publishedAt && publishedAt < oldestAllowed) return [];
    return [{
      sourceId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      title: snippet.title,
      externalId: videoId,
      publishedAt: publishedAt ? publishedAt.toISOString() : null,
      payload: {
        videoId,
        channelId,
        description: truncate(snippet.description || '', 1000),
        imageUrl: snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        contentHashSeed: `${videoId}:${snippet.title}`,
      },
    }];
  });
}

export function parseYouTubeTranscriptXml(xml: string): string {
  const text = [...xml.matchAll(/<text\b[^>]*>([^<]*)<\/text>/gi)]
    .map((match) => decodeXmlEntities(match[1]))
    .join(' ');
  return text.replace(/\s+/g, ' ').trim();
}

function pickSubtitleUrl(subtitles: any[]): string | null {
  if (!Array.isArray(subtitles)) return null;
  const candidates = subtitles
    .filter((subtitle) => typeof subtitle?.url === 'string' && subtitle.url)
    .map((subtitle) => {
      const code = String(subtitle.languageCode || '').toLowerCase();
      const isAutoGenerated = /(?:[?&])kind=asr(?:&|$)/.test(String(subtitle.url));
      let score = 0;
      if (code === 'vi') score += 5;
      if (code === 'en') score += 4;
      if (code.startsWith('en-')) score += 3;
      if (!isAutoGenerated) score += 4;
      return { url: subtitle.url, score };
    })
    .sort((a, b) => b.score - a.score);
  return candidates[0]?.url || null;
}

async function fetchYouTubeTranscript(videoId: string): Promise<string> {
  const rapidApiKey = process.env.YOUTUBE_TRANSCRIPT_RAPIDAPI_KEY || process.env.RAPIDAPI_KEY;
  if (!rapidApiKey) throw new Error('RAPIDAPI_KEY or YOUTUBE_TRANSCRIPT_RAPIDAPI_KEY is required for YouTube transcripts');

  const subtitlesResponse = await fetch(`https://${YOUTUBE_TRANSCRIPT_HOST}/subtitles?id=${encodeURIComponent(videoId)}`, {
    headers: {
      'x-rapidapi-host': YOUTUBE_TRANSCRIPT_HOST,
      'x-rapidapi-key': rapidApiKey,
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!subtitlesResponse.ok) throw new Error(`YouTube transcript subtitles failed: ${subtitlesResponse.status}`);
  const subtitlesData: any = await subtitlesResponse.json();
  const subtitleUrl = pickSubtitleUrl(subtitlesData?.subtitles);
  if (!subtitleUrl) throw new Error('No subtitles available for this YouTube video');

  const transcriptResponse = await fetch(subtitleUrl, { signal: AbortSignal.timeout(30000) });
  if (!transcriptResponse.ok) throw new Error(`YouTube transcript XML failed: ${transcriptResponse.status}`);
  const text = parseYouTubeTranscriptXml(await transcriptResponse.text());
  if (!text) throw new Error('YouTube transcript is empty');
  return truncate(text, parsePositiveInt(process.env.YOUTUBE_TRANSCRIPT_MAX_CHARS, 30000));
}

export const youtubeFetcher: SourceFetcher = {
  key: 'youtube',
  canHandle: (source) => source.type === 'youtube',
  async discover(source) {
    const channelId = await resolveYouTubeChannelId(source);
    const rssItems = await fetchYouTubeViaRss(channelId, source.id);
    if (rssItems) return rssItems;
    return fetchYouTubeViaApi(channelId, source.id);
  },
  async fetchArticle(job, source) {
    const payload = job.payload_json || {};
    const videoId = payload.videoId || job.external_id || extractYouTubeVideoId(job.url);
    if (!videoId) throw new Error(`Cannot extract YouTube video id from ${job.url}`);

    let transcript = '';
    try {
      transcript = await fetchYouTubeTranscript(videoId);
    } catch (err: any) {
      console.log(`[YouTube Fetcher] Failed to fetch transcript for ${videoId}: ${err.message}. Using description fallback.`);
    }

    // Delay 3s to avoid rate limiting from YouTube
    await new Promise(resolve => setTimeout(resolve, 3000));

    return {
      source,
      externalId: videoId,
      url: job.url,
      title: job.title,
      author: source.name,
      publishedAt: job.published_at,
      rawExcerpt: payload.description || '',
      rawContent: transcript || payload.description || job.title || '',
      contentHashSeed: payload.contentHashSeed || `${videoId}:${job.title}`,
      imageUrl: payload.imageUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      contentType: 'video',
      metadata: {
        videoId,
        channelId: payload.channelId || source.parser_config?.youtubeChannelId || null,
      },
    };
  },
  async fetch(source) {
    const result = { itemsFound: 0, itemsInserted: 0, errors: [] as string[] };
    try {
      const discovered = await youtubeFetcher.discover!(source);
      result.itemsFound = discovered.length;
      for (const item of discovered) {
        const articleInput = await youtubeFetcher.fetchArticle!({
          id: '',
          source_id: source.id,
          url: item.url,
          title: item.title,
          external_id: item.externalId || null,
          published_at: item.publishedAt || null,
          payload_json: item.payload || null,
        }, source);
        if (articleInput && await insertArticleIfNew(articleInput)) result.itemsInserted++;
      }
    } catch (err: any) {
      result.errors.push(err.message);
    }
    return result;
  },
};
