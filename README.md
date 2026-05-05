# SynthNews

SynthNews là hệ thống đọc tin cá nhân dạng full-stack monorepo. Ứng dụng lấy bài từ RSS, web, Reddit và VOZ, lưu vào PostgreSQL, dùng AI để tóm tắt tiếng Việt, rồi hiển thị trong giao diện đọc nhanh cho desktop và mobile.

Project này được thiết kế cho nhu cầu tự host cá nhân: ít thao tác, đọc nhanh, có khu quản trị gọn, có cron nền, có deploy Docker Compose trên VPS.

## Mục Lục

- [Tính năng chính](#tính-năng-chính)
- [Kiến trúc](#kiến-trúc)
- [Tech stack](#tech-stack)
- [Cấu trúc repo](#cấu-trúc-repo)
- [Luồng dữ liệu](#luồng-dữ-liệu)
- [Frontend](#frontend)
- [Backend API](#backend-api)
- [Database](#database)
- [AI providers](#ai-providers)
- [Biến môi trường](#biến-môi-trường)
- [Chạy local](#chạy-local)
- [Test và build](#test-và-build)
- [Deploy production](#deploy-production)
- [Thiết lập lần đầu](#thiết-lập-lần-đầu)
- [Nginx, HTTPS và cache](#nginx-https-và-cache)
- [GitHub Actions](#github-actions)
- [Cron jobs](#cron-jobs)
- [Scraping Reddit và VOZ](#scraping-reddit-và-voz)
- [Auth và bảo mật](#auth-và-bảo-mật)
- [Tùy chỉnh domain](#tùy-chỉnh-domain)
- [Ghi chú vận hành](#ghi-chú-vận-hành)

## Tổng Quan Vận Hành

- Production chạy bằng `docker compose up -d --build`.
- Docker expose app nội bộ tại `127.0.0.1:3001`, Nginx reverse proxy ra HTTPS.
- Backend serve luôn frontend build từ `server/public`, đồng thời expose API dưới `/api/*`.
- Deep link đang có route thật trong SPA: `/article/:articleId`, `/voz`, `/reddit`, `/digest`.
- `/article/:id` có Open Graph meta server-side khi chạy production build, dùng `PUBLIC_SITE_URL` để sinh URL chia sẻ.
- Static assets trong `/assets/*` có `Cache-Control: public, max-age=31536000, immutable`.
- API/static text được nén bởi Hono `compress()`, phía Nginx cũng bật gzip.
- **Timezone**: Container chạy `Asia/Ho_Chi_Minh` (set qua `TZ` trong `docker-compose.yml` + `tzdata` trong Dockerfile). Mọi cron schedule đọc theo giờ Việt Nam.

## Tính Năng Chính

### Đọc tin

- Tab `News`, `VOZ`, `Reddit`, `Bản tin`.
- Split view trên desktop: danh sách bên trái, nội dung bên phải.
- Detail overlay trên mobile, có gesture kéo xuống để đóng.
- Deep link bài viết qua `/article/:id`.
- Lọc theo nguồn tin.
- Điều hướng theo ngày có bài.
- Đánh dấu bài đã đọc bằng `localStorage`.
- Thumbnail trong feed khi ảnh đủ hữu ích.
- Copy link bài gốc và mở bài gốc.
- Dark mode/light mode.
- Chỉnh cỡ chữ bằng nút `Aa`.
- Skeleton riêng cho feed và article detail, giúp hard refresh deep link không bị nhảy layout.

### Thu thập và xử lý tin

- RSS parser cho nguồn RSS chuẩn.
- Web scraper dùng selector cấu hình theo từng source.
- Reddit scraper theo hướng RSS + enrich comment theo nhiều fallback.
- VOZ scraper riêng: lấy RSS thread, mở thread thật, đọc nhiều page, chọn comment nổi bật.
- Forum rescrape cho Reddit/VOZ trong vài giờ đầu để cập nhật comment mới.
- AI tóm tắt theo prompt riêng cho tin báo và forum.
- TLDR được trích từ tag `<tldr>` trong output AI.
- Digest định kỳ gom các bài đã tóm tắt trong 24 giờ gần nhất.

### Quản trị

- Trang `/sources` quản lý nguồn tin.
- Trang `/admin` xem health, log gần đây, trigger job thủ công, quản lý AI provider và bài viết.
- Token admin lưu ở `localStorage` key `admin_token` khi nhập qua prompt.

## Kiến Trúc

Repo là monorepo npm workspaces:

- `client/`: React + Vite SPA.
- `server/`: Hono API, PostgreSQL, cron jobs, scraper, summarizer.
- `Dockerfile`: multi-stage build client và server.
- `docker-compose.yml`: PostgreSQL + app container.
- `nginx-synthnews.conf`: reverse proxy production cho `synthnews.site`.

Production flow:

```text
Browser
  -> Nginx HTTPS
  -> 127.0.0.1:3001
  -> Hono app container
  -> /api/* hoặc static frontend
  -> PostgreSQL container
```

Dockerfile build flow:

```text
client/src -> Vite build -> client/dist
server/src -> TypeScript build -> server/dist
client/dist -> copy vào server/public
container start -> node dist/db/migrate.js && node dist/index.js
```

## Tech Stack

Frontend:

- React 19
- React Router 7
- Vite 6
- TypeScript
- react-markdown
- CSS thuần trong `client/src/styles/global.css`

Backend:

- Node.js 22
- Hono
- PostgreSQL qua `pg`
- node-cron
- rss-parser
- cheerio
- puppeteer-core

DevOps:

- Docker
- Docker Compose
- Nginx
- GitHub Actions SSH deploy

## Cấu Trúc Repo

```text
.
├── .github/workflows/deploy.yml
├── client/
│   ├── index.html
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Layout.tsx          # Layout chính
│   │   │   └── layoutShell.ts      # Helper xác định layout mode
│   │   ├── hooks/useApi.ts         # Hook gọi API + cache
│   │   ├── pages/
│   │   │   ├── Home.tsx            # Trang đọc tin chính
│   │   │   ├── Admin.tsx           # Trang quản trị
│   │   │   ├── Sources.tsx         # Quản lý nguồn tin
│   │   │   └── homeUx.ts           # UX helper cho Home
│   │   ├── services/
│   │   │   ├── api.ts              # API client
│   │   │   └── apiCache.ts         # Cache policy
│   │   ├── styles/global.css       # Toàn bộ CSS
│   │   ├── main.tsx
│   │   └── router.tsx
│   └── tests/
├── server/
│   ├── src/
│   │   ├── db/
│   │   │   ├── index.ts            # PostgreSQL connection
│   │   │   ├── migrate.ts          # Migration runner
│   │   │   └── migrations/         # SQL migration files
│   │   ├── jobs/scheduler.ts       # Cron scheduler
│   │   ├── lib/
│   │   │   ├── auth.ts             # Auth middleware
│   │   │   ├── openGraph.ts        # OG meta injection
│   │   │   ├── tldr.ts             # TL;DR extraction
│   │   │   └── utils.ts
│   │   ├── routes/
│   │   │   ├── health.ts           # Health + manual trigger
│   │   │   ├── articles.ts
│   │   │   ├── sources.ts
│   │   │   ├── digests.ts
│   │   │   └── ai-providers.ts
│   │   ├── services/
│   │   │   ├── scraper.ts          # Scraping logic
│   │   │   ├── summarizer.ts       # AI summarization
│   │   │   ├── rescrape.ts         # Forum rescrape
│   │   │   └── ai-client.ts        # Multi-provider AI client
│   │   └── index.ts                # Server entry point
│   └── tests/
├── Dockerfile
├── docker-compose.yml
├── nginx-synthnews.conf            # Nginx config mẫu
├── reddit-proxy-worker.js          # Cloudflare Worker cho Reddit proxy
├── .env.example
├── package.json
└── README.md
```

Một số file `.sql`, script test/debug, ảnh và tài liệu review ở root là artifact vận hành cục bộ, đã được `.gitignore` loại khỏi repo.

## Luồng Dữ Liệu

### 1. Scrape

`startCronJobs()` gọi `runScrapeJob()` theo chu kỳ `SCRAPE_INTERVAL_HOURS`.

`runScrapeJob()` lấy tất cả source đang bật:

```sql
SELECT id, type, name, url, language, category, fetch_interval_minutes, parser_config
FROM sources
WHERE is_enabled = true
ORDER BY name ASC
```

Sau đó `scrapeSource()` chọn nhánh xử lý:

- URL Reddit -> `scrapeRedditSource()`
- URL VOZ -> `scrapeVozSource()`
- `type = rss` -> `scrapeRssSource()`
- `type = web` -> `scrapeWebSource()`

Bài mới được insert vào `articles` với `summary_status = 'pending'`. Insert dùng `ON CONFLICT (url) DO NOTHING RETURNING id`, nên metric `itemsInserted` chỉ tính bài thực sự mới.

### 2. Summarize

`summarizePendingArticles()` claim bài pending bằng query atomic:

```sql
FOR UPDATE SKIP LOCKED
```

Bài được chuyển ngay sang `processing` trước khi gọi AI. Trạng thái sau xử lý:

- `done`: có summary.
- `skipped`: bài thường quá ngắn, không đủ dữ liệu.
- `failed`: lỗi AI/provider/timeout.
- `pending`: chờ xử lý hoặc được reset retry.
- `processing`: đang được worker xử lý.

### 3. Digest

`generateDigest()` lấy tối đa `DIGEST_ARTICLE_LIMIT` bài `done` trong 24 giờ gần nhất, mặc định 100 bài, gọi AI tạo bản tin markdown, lưu vào `digests` và map qua `digest_items`.

## Frontend

Routes chính trong `client/src/router.tsx`:

| Route | Mục đích |
|---|---|
| `/` | Tab News |
| `/voz` | Tab VOZ |
| `/reddit` | Tab Reddit |
| `/digest` | Tab Bản tin |
| `/article/:articleId` | Deep link bài viết |
| `/sources` | Quản lý nguồn |
| `/admin` | Quản trị hệ thống |

Layout chính nằm ở `client/src/components/Layout.tsx`, dùng `container-fluid` cho các route đọc tin, admin và sources để tránh lỗi co layout khi hard refresh. `client/src/components/layoutShell.ts` là helper xác định route nào dùng layout nào.

Client API cache ngắn hạn nằm ở `client/src/services/apiCache.ts`:

- `/articles*`: 60 giây.
- `/sources`: 300 giây.
- `/digests/latest*`: 60 giây.
- Endpoint mutate/admin không cache.

## Backend API

API response dùng format chung:

```json
{
  "success": true,
  "data": {},
  "meta": {}
}
```

Khi lỗi:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Error message"
  }
}
```

Endpoint chính:

| Nhóm | Endpoint | Auth |
|---|---|---|
| Health | `GET /api/health/live` | Public |
| Health | `GET /api/health` | Admin |
| Health | `POST /api/health/trigger/scrape` | Admin |
| Health | `POST /api/health/trigger/summarize` | Admin |
| Health | `POST /api/health/trigger/digest` | Admin |
| Health | `POST /api/health/trigger/cleanup` | Admin |
| Sources | `GET /api/sources` | Public |
| Sources | `GET /api/sources/:id` | Public |
| Sources | `POST /api/sources` | Admin |
| Sources | `PATCH /api/sources/:id` | Admin |
| Sources | `DELETE /api/sources/:id` | Admin |
| Sources | `POST /api/sources/:id/toggle` | Admin |
| Sources | `POST /api/sources/detect` | Admin |
| Articles | `GET /api/articles/dates` | Public |
| Articles | `GET /api/articles` | Public |
| Articles | `GET /api/articles/:id` | Public |
| Articles | `POST /api/articles/:id/reset-summary` | Admin |
| Articles | `POST /api/articles/:id/rescrape` | Admin |
| Articles | `DELETE /api/articles/:id` | Admin |
| Digests | `GET /api/digests/latest` | Public |
| Digests | `GET /api/digests` | Public |
| Digests | `GET /api/digests/:id` | Public |
| Digests | `DELETE /api/digests/:id` | Admin |
| AI Providers | `/api/ai-providers/*` | Admin |

Query đáng dùng:

```bash
curl https://synthnews.site/api/health/live
curl "https://synthnews.site/api/articles?limit=3&status=done"
curl "https://synthnews.site/api/articles/dates"
curl "https://synthnews.site/api/digests/latest?lang=vi"
```

## Database

Migrations hiện có:

- `server/src/db/migrations/001_initial.sql`
- `server/src/db/migrations/002_ai_providers.sql`
- `server/src/db/migrations/003_add_tldr.sql`
- `server/src/db/migrations/004_add_rescraped_count.sql`

Bảng chính:

- `sources`
- `articles`
- `scrape_logs`
- `digests`
- `digest_items`
- `ai_providers`
- `app_settings`
- `_migrations`

Local migrate:

```bash
npm run db:migrate
```

Production container tự chạy migrate trước khi start server:

```bash
node dist/db/migrate.js && node dist/index.js
```

## AI Providers

Các `provider_type` hợp lệ trong backend:

- `vertex_ai`
- `openai`
- `gemini`
- `xai`
- `mimo`
- `anthropic`
- `deepseek`
- `groq`
- `custom`

Provider active được lấy từ bảng `ai_providers`:

```sql
SELECT * FROM ai_providers WHERE is_active = true LIMIT 1
```

Lưu ý:

- `openai`, `xai`, `deepseek`, `groq`, `mimo` dùng format OpenAI-compatible.
- `custom` hỗ trợ format `openai` hoặc `gemini` qua `extra_config.format`.
- `api_key` và `service_account_json` không trả nguyên văn về frontend.
- Mỗi lần gọi AI cập nhật `total_calls`, `total_errors`, `last_used_at`, `last_error_message`.

## Biến Môi Trường

Root `.env.example` dùng cho Docker/production style. `server/.env.example` dùng cho local backend dev.

Biến quan trọng:

| Biến | Mục đích |
|---|---|
| `DB_PASSWORD` | Mật khẩu PostgreSQL trong Docker Compose |
| `PORT` | Cổng Hono server, mặc định `3000` |
| `NODE_ENV` | `development` hoặc `production` |
| `DATABASE_URL` | Connection string PostgreSQL cho server |
| `ADMIN_TOKEN` | Token admin cho endpoint mutate/protected |
| `PUBLIC_SITE_URL` | Base URL public để sinh Open Graph link |
| `CORS_ORIGIN` | Origin được phép gọi API |
| `SCRAPE_INTERVAL_HOURS` | Chu kỳ scrape/summarize/digest chính |
| `MAX_ARTICLES_PER_SOURCE` | Số bài tối đa lấy từ mỗi source mỗi lượt |
| `MAX_AI_CALLS_PER_RUN` | Số bài tối đa tóm tắt mỗi lượt |
| `DIGEST_ARTICLE_LIMIT` | Số bài tối đa đưa vào mỗi bản tin, mặc định 100, trần 200 |
| `VOZ_MAX_THREAD_PAGES` | Số page VOZ tối đa đọc mỗi thread |
| `FORUM_MAX_COMMENTS` | Số comment forum tối đa đưa vào raw content |
| `FORUM_RAW_CONTENT_MAX_LENGTH` | Trần độ dài raw content forum |
| `REDDIT_COMMENT_LIMIT` | Số comment Reddit tối đa giữ lại |
| `REDDIT_COMMENT_DEPTH` | Độ sâu reply tree Reddit |
| `REDDIT_CLIENT_ID` | Reddit OAuth app client ID, optional |
| `REDDIT_CLIENT_SECRET` | Reddit OAuth app secret, optional |
| `REDDIT_USERNAME` | Reddit username, optional |
| `REDDIT_PASSWORD` | Reddit password, optional |
| `REDDIT_PROXY_URL` | Cloudflare Worker proxy URL, optional |
| `PUPPETEER_EXECUTABLE_PATH` | Chromium path trong container |

Default cần chú ý:

- `docker-compose.yml` fallback production: `VOZ_MAX_THREAD_PAGES=15`, `FORUM_MAX_COMMENTS=70`, `FORUM_RAW_CONTENT_MAX_LENGTH=80000`.
- `.env.example` hiện để giá trị thận trọng hơn: `4`, `40`, `60000`. Nếu copy `.env.example` sang `.env`, giá trị trong `.env` sẽ override fallback của Compose.
- Production yêu cầu `ADMIN_TOKEN` không được rỗng hoặc là token mẫu yếu. Nếu yếu, server sẽ crash khi `NODE_ENV=production`.

Ví dụ `.env` cho Docker:

```env
DB_PASSWORD=thay-bang-mat-khau-manh
ADMIN_TOKEN=thay-bang-token-dai-ngau-nhien
PUBLIC_SITE_URL=https://your-domain.example.com
CORS_ORIGIN=https://your-domain.example.com
SCRAPE_INTERVAL_HOURS=3
MAX_ARTICLES_PER_SOURCE=20
MAX_AI_CALLS_PER_RUN=30
DIGEST_ARTICLE_LIMIT=100
VOZ_MAX_THREAD_PAGES=15
FORUM_MAX_COMMENTS=70
FORUM_RAW_CONTENT_MAX_LENGTH=80000
REDDIT_COMMENT_LIMIT=30
REDDIT_COMMENT_DEPTH=3
```

Ví dụ `server/.env` cho local dev:

```env
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://newstamhv:newstamhv@localhost:5432/newstamhv
ADMIN_TOKEN=dev-admin-token-change-this
SCRAPE_INTERVAL_HOURS=3
MAX_ARTICLES_PER_SOURCE=20
MAX_AI_CALLS_PER_RUN=30
DIGEST_ARTICLE_LIMIT=100
```

## Chạy Local

Yêu cầu:

- Node.js 22+
- npm
- PostgreSQL local hoặc Docker

Cài dependencies:

```bash
npm install
```

Chạy PostgreSQL nhanh bằng Docker:

```bash
docker run --name newstamhv-db \
  -e POSTGRES_USER=newstamhv \
  -e POSTGRES_PASSWORD=newstamhv \
  -e POSTGRES_DB=newstamhv \
  -p 5433:5432 \
  -d postgres:16-alpine
```

Khi dùng cổng `5433`, đặt:

```env
DATABASE_URL=postgresql://newstamhv:newstamhv@localhost:5433/newstamhv
```

Migrate:

```bash
npm run db:migrate
```

Chạy full dev:

```bash
npm run dev
```

Chạy riêng:

```bash
npm run dev --workspace=server
npm run dev --workspace=client
```

## Test Và Build

Client tests:

```bash
npm test --workspace=client
```

Server tests:

```bash
npm test --workspace=server
```

Build toàn bộ:

```bash
npm run build
```

Build riêng:

```bash
npm run build --workspace=client
npm run build --workspace=server
```

Root scripts hiện tại:

| Script | Lệnh |
|---|---|
| `npm run dev` | Chạy server và client song song |
| `npm run build` | Build client rồi server |
| `npm run start` | Start server dist |
| `npm run db:migrate` | Chạy migrations server |

## Deploy Production

Trên VPS:

```bash
cd /home/ubuntu/newstamhv
git pull origin main
docker compose up -d --build
docker compose ps
docker compose logs -f app
```

Compose services:

- `db`: PostgreSQL 16 Alpine, volume `pgdata`, bind local `127.0.0.1:5433`.
- `app`: SynthNews app, bind local `127.0.0.1:3001`, depends on DB healthcheck.

Healthcheck app:

```bash
curl -fsS http://127.0.0.1:3001/api/health/live
```

Public healthcheck:

```bash
curl -fsS https://your-domain.example.com/api/health/live
```

## Thiết Lập Lần Đầu

Sau khi `docker compose up -d --build` thành công:

1. **Cấu hình AI provider** — Mở `https://your-domain/admin`, nhập `ADMIN_TOKEN` khi được hỏi, rồi vào tab AI Providers. Thêm ít nhất 1 provider (ví dụ Gemini API key miễn phí). Nếu không có AI provider, hệ thống vẫn scrape nhưng mọi bài sẽ stuck ở `pending` — không có summary.

2. **Thêm nguồn tin** — Mở `https://your-domain/sources`, thêm nguồn RSS hoặc web. Backend tự nhận diện URL Reddit/VOZ và chuyển sang scraper riêng.

3. **Chờ cron hoặc trigger thủ công** — Cron scrape sẽ chạy mỗi `SCRAPE_INTERVAL_HOURS` giờ. Để test ngay, vào `/admin` → bấm nút "Cào tin" và "Tóm tắt".

4. **Kiểm tra** — Sau khi scrape + summarize xong, bài sẽ hiện trên trang chủ với TL;DR preview.

## Nginx, HTTPS Và Cache

File mẫu Nginx reverse proxy nằm ở `nginx-synthnews.conf`. Để thiết lập trên VPS mới:

```bash
# Cài Nginx + Certbot
sudo apt install -y nginx certbot python3-certbot-nginx

# Copy config mẫu (đổi server_name trong file trước khi copy)
sudo cp nginx-synthnews.conf /etc/nginx/sites-available/myapp
sudo ln -s /etc/nginx/sites-available/myapp /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default

# Lấy SSL certificate
sudo certbot --nginx -d your-domain.example.com

# Test và reload
sudo nginx -t && sudo systemctl reload nginx
```

Config mẫu bao gồm:

- Reverse proxy tới `http://127.0.0.1:3001`
- Gzip cho text, CSS, JS, JSON, XML, RSS
- Security headers (HSTS, X-Frame-Options, X-Content-Type-Options)
- Redirect HTTP → HTTPS và www → non-www

Backend cũng có:

- `compress()` của Hono cho response.
- `Cache-Control: public, max-age=31536000, immutable` cho `/assets/*`.

## GitHub Actions

Workflow:

```text
.github/workflows/deploy.yml
```

Trigger:

```text
push vào main
```

Các bước chính:

- SSH vào VPS bằng `appleboy/ssh-action`.
- `cd /home/ubuntu/newstamhv`
- `git pull origin main`
- `docker compose up -d --build`
- smoke test local API `127.0.0.1:3001`
- smoke test frontend bằng Puppeteer trong app container
- smoke test public qua domain HTTPS
- `docker compose ps`

Workflow cần 3 secrets trong repo GitHub (Settings → Secrets → Actions):

| Secret | Giá trị |
|---|---|
| `VPS_HOST` | IP hoặc hostname VPS |
| `VPS_USERNAME` | User SSH (thường `ubuntu`) |
| `VPS_SSH_KEY` | Private key SSH (nội dung file `.pem`) |

Lưu ý: đổi URL smoke test public trong `deploy.yml` nếu dùng domain khác.

## Cron Jobs

`server/src/jobs/scheduler.ts` đăng ký các job khi server start. Lịch chạy theo giờ Việt Nam (container set `TZ=Asia/Ho_Chi_Minh`):

| Job | Lịch | Việc làm |
|---|---|---|
| Scrape & Summarize | `0 */SCRAPE_INTERVAL_HOURS * * *` | Scrape tất cả source bật, rồi summarize bài mới |
| Forum Rescrape | `0,30 * * * *` | Cào lại Reddit/VOZ mới, bỏ qua phút `00` nếu trùng giờ scrape chính |
| Digest | `30 */SCRAPE_INTERVAL_HOURS * * *` | Tạo bản tin sau scrape chính |
| Retry | `*/10 * * * *` | Reset bài kẹt/failed và retry comment Reddit |
| Cleanup | `43 2 * * *` | Xóa scrape logs cũ, dọn raw_content bài cũ, reset processing kẹt |

Cleanup hiện tại:

- Xóa `scrape_logs` cũ hơn 14 ngày.
- Set `raw_content = NULL` cho bài cũ hơn 60 ngày.
- Reset bài `processing` quá 5 phút về `pending`.

Forum rescrape:

- Chỉ xét source name có `reddit` hoặc `voz`.
- Chỉ xét bài tạo trong 4 giờ gần nhất.
- Mỗi bài rescrape tối đa 2 lần qua `rescraped_count`.
- Nếu content đổi, reset `summary_status = 'pending'` để AI tóm tắt lại.

## Scraping Reddit Và VOZ

### Reddit

Source Reddit được add qua `/sources`. Nếu nhập URL dạng `https://www.reddit.com/r/<subreddit>`, backend tự đổi thành RSS ổn định:

```text
https://www.reddit.com/r/<subreddit>/.rss
```

Khi scrape, backend nhận diện host Reddit và dùng `scrapeRedditSource()`:

1. Lấy danh sách thread hot qua RSS.
2. Nếu có OAuth env (`REDDIT_CLIENT_ID`, ...), gọi `oauth.reddit.com` — truy cập đầy đủ comment + score.
3. Nếu không có OAuth, enrich tối đa 8 bài mỗi lượt theo waterfall (dừng ngay khi 1 strategy thành công):
   1. **Puppeteer** vào `old.reddit.com/...json` — lấy được JSON đầy đủ, nhưng nhiều VPS bị Reddit chặn IP.
   2. **RSS Comment Feed** `reddit.com/{postPath}.rss` — **strategy đáng tin nhất** trên hầu hết môi trường. Lấy được nội dung comment đầy đủ, tuy không có upvote score (mặc định `0 điểm`).
   3. **Cloudflare Worker proxy** qua `REDDIT_PROXY_URL` — chỉ dùng nếu cả 2 trên fail. Cần deploy `reddit-proxy-worker.js` lên Workers trước.
   4. **Pullpush archive API** — fallback cuối, data thường bị delay hoặc stale.
4. Flatten comment tree, lọc `[deleted]`, `[removed]`, comment quá ngắn.
5. Score comment theo reaction/length/độ sớm/depth.
6. Chọn top comment, rồi sắp lại theo thứ tự xuất hiện để đưa vào `raw_content`.

> **Lưu ý thực tế:** Trên máy cá nhân hoặc VPS không bị chặn, Puppeteer thường work luôn. Trên VPS bị chặn (ví dụ Oracle Cloud), RSS Comment Feed tự động kick in và đủ dùng. Proxy và Pullpush hiếm khi cần thiết.

Retry Reddit mỗi 10 phút tìm bài trong 48 giờ gần nhất có raw content chứa `Đã trích 0 comment`, thử Pullpush lại, rồi reset summary nếu enrich được comment.

### VOZ

VOZ dùng `scrapeVozSource()`:

1. Lấy danh sách thread từ RSS.
2. Mở trang thread thật bằng `curlFetch()` để tránh một số lỗi TLS/fingerprint của Node fetch.
3. Parse HTML bằng Cheerio.
4. Đọc pagination tối đa `VOZ_MAX_THREAD_PAGES`.
5. Tách OP và comment thành viên.
6. Score, dedupe, chọn `FORUM_MAX_COMMENTS` comment nổi bật.
7. Ghép raw content gồm bài gốc, metadata thread và bình luận tiêu biểu.

Sleep mặc định giữa các page VOZ là 500ms.

## Auth Và Bảo Mật

Middleware auth nằm ở `server/src/lib/auth.ts`.

Luật hiện tại:

- `GET /api/health/live` public.
- `GET` public cho articles, sources, digests.
- `/api/health` và `/api/ai-providers` cần auth cho mọi method, kể cả GET.
- Mọi method không phải GET đều cần `Authorization: Bearer <ADMIN_TOKEN>`.

Frontend sẽ prompt token khi gặp `UNAUTHORIZED`, rồi lưu vào `localStorage`.

Không đưa các file này lên repo:

- `.env`
- `.env.*` trừ `.env.example`
- `*.pem`
- `*.key`
- file SQL thủ công ngoài migrations

`.gitignore` hiện đã chặn các nhóm file trên.

## Tùy Chỉnh Domain

Nếu dùng domain riêng (không phải domain mẫu trong repo), cập nhật đồng bộ:

1. `.env` → `PUBLIC_SITE_URL` và `CORS_ORIGIN`
2. `nginx-synthnews.conf` → `server_name` (hoặc tạo file config riêng)
3. `.github/workflows/deploy.yml` → URL smoke test public (dòng cuối)
4. Chạy `certbot` lấy SSL cho domain mới
5. Reload Nginx: `sudo nginx -t && sudo systemctl reload nginx`

## Ghi Chú Vận Hành

- Nếu sửa frontend layout đọc tin, kiểm tra hard refresh các route `/`, `/voz`, `/reddit`, `/digest`, `/article/:id`.
- Nếu sửa Open Graph hoặc deep link, kiểm tra production build vì server chỉ inject meta khi có `server/public/index.html`.
- Nếu dùng cache assets 1 năm, file build phải có hash như Vite mặc định. Không cache immutable cho HTML.
- Nếu AI provider trả summary không có `<tldr>`, bài vẫn có summary nhưng list preview sẽ fallback sang excerpt/summary.
- Nếu source Reddit/VOZ thiếu comment lúc mới scrape, forum rescrape và retry job sẽ có cơ hội cập nhật lại trong vài giờ đầu.
- `reddit-proxy-worker.js` trong repo là Cloudflare Worker dùng bypass Reddit IP block. Deploy lên Cloudflare Workers rồi set `REDDIT_PROXY_URL` nếu cần.
