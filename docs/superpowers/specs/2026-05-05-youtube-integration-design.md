# YouTube Integration Design

## Goal

Add YouTube as a first-class SynthNews source so a user can add a channel, discover recent videos, fetch transcripts, summarize them with the existing AI pipeline, and read them in a dedicated YouTube tab.

## Reference

The implementation follows the useful split from `trongnguyen24/NewsDigest`: source discovery lists new channel videos, while a separate content fetch step retrieves a transcript for each video. SynthNews already has the same shape through `SourceFetcher.discover`, `article_fetch_jobs`, and `SourceFetcher.fetchArticle`.

## Architecture

YouTube will be added as source type `youtube`. The source resolver accepts `youtube.com/@handle`, `youtube.com/channel/<id>`, video URLs, and `youtu.be` links. Channel sources are canonicalized and stored as sources. Direct video URLs can be detected, but the first implementation focuses on recurring channel sources.

Discovery resolves a channel id, stores it in `source.parser_config.youtubeChannelId`, then reads `https://www.youtube.com/feeds/videos.xml?channel_id=<id>`. If RSS fails and `YOUTUBE_API_KEY` is configured, it falls back to YouTube Data API v3 uploads playlist lookup. Discovered videos are enqueued into the existing `article_fetch_jobs` table.

Article fetch extracts the video id, gets transcript text through RapidAPI `yt-api` when `RAPIDAPI_KEY` or `YOUTUBE_TRANSCRIPT_RAPIDAPI_KEY` is set, and returns an `ArticleInsertInput` with `contentType: "video"`, video metadata, description as excerpt, transcript as raw content, and a YouTube thumbnail.

## Data Model

Add migration `008_allow_youtube_sources.sql`:

- Change `sources.type` check to allow `youtube`.
- No separate `channel_id` column is required; cache source-specific data in `parser_config`.
- Existing `articles.content_type` already allows `video`.
- Extend article writer to insert `content_type` and optional `metadata`.

## Frontend

Add route and tab `/youtube`. Feed classification treats `source_type === "youtube"` or YouTube URLs as YouTube. Sources UI allows adding and editing type `youtube`, and the detect panel no longer marks YouTube unsupported.

## Error Handling

Missing transcript key causes article fetch jobs to fail with a clear configuration error. Videos without subtitles fail the fetch job and retry according to the existing article fetch retry policy. Discovery errors are recorded in scrape logs like other sources.

## Testing

Server tests cover source resolver behavior, fetcher registry selection, YouTube helper parsing, YouTube RSS discovery, transcript parsing, and article writer support for video content. Client tests cover the YouTube route/tab classifier where existing test structure allows it. Full verification is `npm test --workspace=server`, `npm test --workspace=client`, and `npm run build`.
