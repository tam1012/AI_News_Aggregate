# YouTube Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class YouTube channel sources with transcript-backed AI summaries and a dedicated reader tab.

**Architecture:** Add a `youtube` source type and fetcher that plugs into the existing `discover -> article_fetch_jobs -> fetchArticle -> summarizer` pipeline. YouTube discovery uses RSS first and YouTube Data API fallback; video fetch uses a transcript provider and stores articles as `content_type = "video"`.

**Tech Stack:** Node.js 22, Hono, PostgreSQL, rss-parser/cheerio style XML parsing, React/Vite frontend, node:test.

---

### Task 1: Backend Tests

**Files:**
- Modify: `server/tests/source-resolver.test.mjs`
- Modify: `server/tests/fetcher-registry.test.mjs`
- Create: `server/tests/youtube-fetcher.test.mjs`
- Modify: `server/tests/article-writer.test.mjs`

- [ ] Write failing tests that expect YouTube to be detected as supported, registry to return `youtube`, YouTube RSS to discover videos, transcript XML to parse text, and article writer to emit `content_type = "video"`.
- [ ] Run the focused server tests and confirm they fail because YouTube support is missing.

### Task 2: Backend Implementation

**Files:**
- Create: `server/src/services/fetchers/youtube-fetcher.ts`
- Modify: `server/src/services/fetchers/index.ts`
- Modify: `server/src/services/fetchers/registry.ts`
- Modify: `server/src/services/fetchers/article-writer.ts`
- Modify: `server/src/lib/sourceResolver.ts`
- Modify: `server/src/routes/sources.ts`
- Create: `server/src/db/migrations/008_allow_youtube_sources.sql`

- [ ] Add YouTube URL parsing helpers, source detection, RSS discovery, API fallback, transcript fetching, and video article insertion.
- [ ] Run focused server tests until they pass.

### Task 3: Frontend Integration

**Files:**
- Modify: `client/src/router.tsx`
- Modify: `client/src/pages/Home.tsx`
- Modify: `client/src/pages/Sources.tsx`
- Modify: `client/src/styles/global.css` if badge styling needs a YouTube color.

- [ ] Add `/youtube`, tab button, feed classification, source type option, and source badge text.
- [ ] Run focused client tests or full client test suite.

### Task 4: Config, Docs, Verification

**Files:**
- Modify: `.env.example`
- Modify: `.env.vps`
- Modify: `server/.env.example`
- Modify: `docker-compose.yml`
- Modify: `README.md`

- [ ] Document `RAPIDAPI_KEY`, `YOUTUBE_TRANSCRIPT_RAPIDAPI_KEY`, and `YOUTUBE_API_KEY`.
- [ ] Run `npm test --workspace=server`.
- [ ] Run `npm test --workspace=client`.
- [ ] Run `npm run build`.
