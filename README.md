# SynthNews

SynthNews là một hệ thống đọc tin cá nhân theo mô hình full-stack monorepo. Ứng dụng tự động lấy bài viết từ RSS, web và forum, lưu vào PostgreSQL, gọi AI để tóm tắt bằng tiếng Việt, rồi hiển thị dưới dạng giao diện đọc nhanh tối ưu cho desktop lẫn mobile.

Trọng tâm của project này không phải là một cổng tin tức công cộng quy mô lớn. Nó được thiết kế cho nhu cầu cá nhân: mở lên là đọc nhanh, lọc theo nguồn, xem lại theo ngày, và có một khu quản trị gọn để vận hành scraper, AI provider, cùng các job nền.

## Mục lục

- [Tính năng chính](#tính-năng-chính)
- [Kiến trúc tổng thể](#kiến-trúc-tổng-thể)
- [Tech stack](#tech-stack)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [Luồng xử lý dữ liệu](#luồng-xử-lý-dữ-liệu)
- [Frontend](#frontend)
- [Backend API](#backend-api)
- [Database](#database)
- [AI providers được hỗ trợ](#ai-providers-được-hỗ-trợ)
- [Cài đặt môi trường local](#cài-đặt-môi-trường-local)
- [Chạy project ở chế độ development](#chạy-project-ở-chế-độ-development)
- [Build production](#build-production)
- [Deploy VPS với Docker Compose](#deploy-vps-với-docker-compose)
- [Biến môi trường](#biến-môi-trường)
- [Cron jobs và vận hành](#cron-jobs-và-vận-hành)
- [Bảo mật và auth](#bảo-mật-và-auth)
- [Ghi chú vận hành thực tế](#ghi-chú-vận-hành-thực-tế)
- [Các cải tiến gần đây](#các-cải-tiến-gần-đây)
- [Scraping Strategies](#scraping-strategies)

## Tính năng chính

### 1. Tự động thu thập tin tức

- Hỗ trợ nguồn **RSS** chuẩn.
- Hỗ trợ **web scraping** với selector cấu hình theo từng nguồn.
- Hỗ trợ **Reddit** theo hướng RSS + enrich thêm nội dung, comment top-level và reply nổi bật qua JSON khi khả dụng.
- Hỗ trợ **VOZ forum** theo hướng riêng: lấy thread từ RSS rồi vào trang thread thật để bóc tách bài gốc và bình luận thành viên trên nhiều page (tối đa 15 page).

### 2. Tóm tắt bài viết bằng AI

- Mỗi bài mới được đưa vào hàng đợi `pending`.
- Backend chọn provider AI đang active và sinh tóm tắt tiếng Việt.
- Có prompt riêng, được tinh chỉnh cho từng loại bài:
  - **Tin báo**: prompt biên tập viên cấp cao — yêu cầu 3-6 sections, 400-800 từ, trích dẫn quotes và số liệu cụ thể, phân tích tác động.
  - **Forum (Reddit, VOZ)**: prompt phóng viên cộng đồng — trích dẫn ít nhất 2-3 comment nổi bật kèm tên user, phân tích sentiment, 400-700 từ.
- TLDR tự động được trích xuất từ tag `<tldr>` trong output AI, chuẩn hóa tối đa 200 ký tự.
- Có retry cho bài lỗi hoặc bài bị kẹt ở trạng thái `processing`.

### 3. Tạo bản tin tổng hợp

- Gom các bài đã tóm tắt thành một digest định kỳ.
- Digest viết theo phong cách editorial: nhóm tin theo chủ đề, viết liền mạch, có section "Điểm nhấn trong ngày" cuối bản tin.
- Digest được hiển thị ngay trong app ở tab **Bản tin**.

### 4. Giao diện đọc nhanh

- Split view trên desktop: list bên trái, nội dung bên phải.
- Overlay chi tiết trên mobile, có gesture kéo xuống để đóng.
- Lọc theo nguồn.
- Điều hướng theo ngày.
- Thumbnail trong feed.
- Đánh dấu bài đã đọc bằng localStorage.
- Copy link bài gốc ngay trong khung chi tiết.
- Dark mode / light mode.

### 5. Khu quản trị vận hành

- Quản lý nguồn tin.
- Quản lý bài viết.
- Quản lý AI provider.
- Kích hoạt thủ công các job scrape / summarize / digest / cleanup.

## Kiến trúc tổng thể

Project được tổ chức theo mô hình monorepo:

- `client/`: ứng dụng React + Vite.
- `server/`: API Hono + PostgreSQL + scheduler.
- `docker-compose.yml`: khởi chạy app + database trên VPS.
- `Dockerfile`: multi-stage build cho frontend và backend.

Ở production, backend phục vụ luôn static frontend đã build sẵn từ thư mục `server/public`, đồng thời expose API dưới prefix `/api/*`.

## Tech stack

### Frontend

- React 19
- Vite 6
- TypeScript
- React Router 7
- react-markdown
- CSS thuần tùy biến trong `client/src/styles/global.css`

### Backend

- Node.js 22
- Hono
- PostgreSQL qua `pg`
- `node-cron` cho background jobs
- `rss-parser`
- `cheerio`

### DevOps / Deploy

- Docker
- Docker Compose
- Nginx reverse proxy
- Ubuntu VPS

## Cấu trúc thư mục

```text
.
├── client/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── styles/
│   │   ├── main.tsx
│   │   └── router.tsx
│   ├── package.json
│   └── tsconfig.json
├── server/
│   ├── src/
│   │   ├── db/
│   │   │   ├── migrations/
│   │   │   ├── index.ts
│   │   │   └── migrate.ts
│   │   ├── jobs/
│   │   ├── lib/
│   │   ├── routes/
│   │   ├── services/
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
├── .env.example
├── .dockerignore
├── docker-compose.yml
├── Dockerfile
├── nginx-newstamhv.conf
├── package.json
└── README.md
```

## Luồng xử lý dữ liệu

### Bước 1: Thu thập nguồn

Scheduler chạy `runScrapeJob()` để quét tất cả source đang `is_enabled = true`.

Tùy loại nguồn, hệ thống đi theo một trong các nhánh:

- `scrapeRssSource()`
- `scrapeWebSource()`
- `scrapeRedditSource()`
- `scrapeVozSource()`

Mỗi bài sau khi lấy được sẽ được lưu vào bảng `articles` với:

- `raw_excerpt`
- `raw_content`
- `image_url`
- `content_hash`
- `summary_status = 'pending'`

### Bước 2: Tóm tắt bằng AI

Scheduler hoặc manual trigger gọi `summarizePendingArticles()`.

Cơ chế hiện tại đã được sửa để tránh race condition:

- batch bài `pending` được claim theo kiểu atomic,
- chuyển ngay sang `processing`,
- dùng `FOR UPDATE SKIP LOCKED` để tránh 2 worker cùng lấy 1 bài.

Sau đó:

- thành công → `summary_status = 'done'`
- không đủ dữ liệu → `summary_status = 'skipped'`
- lỗi AI / timeout → `summary_status = 'failed'`

### Bước 3: Tạo digest

`generateDigest()` lấy các bài đã `done` trong khoảng thời gian gần nhất, ghép thành prompt lớn rồi yêu cầu AI sinh ra bản tin tổng hợp markdown. Kết quả được lưu vào bảng `digests` và map quan hệ qua `digest_items`.

## Frontend ứng dụng

### Các route chính

- `/` → trang đọc tin chính
- `/sources` → quản lý nguồn tin
- `/admin` → dashboard quản trị

### Home page

Trang chủ là trung tâm trải nghiệm đọc:

- tab **News**
- tab **Bản tin**
- lọc theo nguồn
- đổi ngày
- chọn bài từ feed
- xem chi tiết bài với markdown render

Một số hành vi UI đáng chú ý:

- Desktop dùng split layout.
- Mobile dùng overlay detail.
- Feed item có thumbnail nếu bài có `image_url`.
- Khi click bài, ID bài được lưu vào localStorage để đánh dấu đã đọc.
- Trong chi tiết bài có nút **Copy link** và nút **Đọc bài gốc**.
- Header công khai được giản lược: icon Admin/Sources chỉ hiện khi đã có `admin_token` trong localStorage hoặc đang ở route quản trị.

### Sources page

Trang này cho phép:

- thêm nguồn mới,
- auto-detect RSS / web source,
- bật / tắt nguồn,
- chỉnh sửa selector với web scraping,
- xóa nguồn.

### Admin page

Trang quản trị tập trung vào vận hành:

- xem health tổng quan,
- trigger job thủ công,
- reset summary của bài,
- xóa bài,
- quản lý AI provider active.

## Backend API

### Nhóm route chính

- `/api/health`
- `/api/sources`
- `/api/articles`
- `/api/digests`
- `/api/ai-providers`

### Health

`GET /api/health/live` (public)

Kiểm tra nhanh kết nối DB, trả `{ success: true }`.

`GET /api/health` (cần auth)

Trả về:

- tình trạng DB,
- số lượng sources,
- số lượng articles theo trạng thái,
- digest mới nhất,
- scrape logs gần đây.

Ngoài ra có các endpoint trigger thủ công:

- `POST /api/health/trigger/scrape`
- `POST /api/health/trigger/summarize`
- `POST /api/health/trigger/digest`
- `POST /api/health/trigger/cleanup`

### Sources

Chức năng chính:

- CRUD nguồn tin,
- detect feed / parser config,
- bật tắt nguồn.

### Articles

Chức năng chính:

- lấy danh sách bài theo ngày,
- lấy danh sách ngày có bài,
- lấy chi tiết bài,
- reset summary,
- xóa bài.

### AI Providers

Hỗ trợ:

- tạo provider,
- cập nhật provider,
- xóa provider,
- activate provider,
- test provider.

Thông tin nhạy cảm như `api_key` hoặc `service_account_json` không được trả nguyên văn cho frontend.

## Database

Database migrations hiện có trong:

- `server/src/db/migrations/001_initial.sql`
- `server/src/db/migrations/002_ai_providers.sql`
- `server/src/db/migrations/003_add_tldr.sql`
- `server/src/db/migrations/004_add_rescraped_count.sql`

Migrations tự động chạy khi server khởi động.

Các nhóm bảng quan trọng:

- `sources`
- `articles` (có cột `tldr`, `rescraped_count`)
- `scrape_logs`
- `digests`
- `digest_items`
- `ai_providers`

### Trạng thái summary của bài

Các trạng thái thường gặp:

- `pending`
- `processing`
- `done`
- `failed`
- `skipped`

## AI providers được hỗ trợ

Theo backend hiện tại, project hỗ trợ các kiểu provider sau:

- `vertex_ai`
- `openai`
- `gemini`
- `xai`
- `mimo`
- `anthropic`
- `deepseek`
- `groq`
- `custom`

Mỗi provider có thể cấu hình:

- model
- endpoint
- api key
- project / region
- temperature
- max tokens
- extra config

Provider active sẽ được dùng cho mọi tác vụ tóm tắt / digest mới.

## Cài đặt môi trường local

### Yêu cầu

- Node.js 22+ được khuyến nghị
- npm
- PostgreSQL 16+ hoặc Docker

### 1. Clone project

```bash
git clone <repo-url>
cd newstamhv
```

### 2. Cài dependencies

Ở root:

```bash
npm install
```

Hoặc cài riêng từng workspace:

```bash
cd server && npm install
cd ../client && npm install
```

### 3. Tạo file môi trường

Tạo `.env` ở root cho môi trường Docker hoặc production style, và/hoặc `.env` trong `server/` cho môi trường dev backend.

Có thể bắt đầu từ:

- `.env.example`
- `server/.env.example`

Ví dụ `server/.env` cho local dev:

```env
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://newstamhv:newstamhv@localhost:5432/newstamhv
ADMIN_TOKEN=change-me-to-a-random-string
SCRAPE_INTERVAL_HOURS=3
MAX_ARTICLES_PER_SOURCE=20
MAX_AI_CALLS_PER_RUN=30
VOZ_MAX_THREAD_PAGES=15
FORUM_MAX_COMMENTS=70
FORUM_RAW_CONTENT_MAX_LENGTH=80000
REDDIT_COMMENT_LIMIT=30
REDDIT_COMMENT_DEPTH=3
```

### 4. Tạo database và migrate

Nếu dùng PostgreSQL local, tạo DB trước rồi chạy:

```bash
npm run db:migrate
```

Nếu muốn chạy DB nhanh bằng Docker:

```bash
docker run --name newstamhv-db \
  -e POSTGRES_USER=newstamhv \
  -e POSTGRES_PASSWORD=newstamhv \
  -e POSTGRES_DB=newstamhv \
  -p 5433:5432 \
  -d postgres:16-alpine
```

Khi đó `DATABASE_URL` cần trỏ tới cổng `5433`.

## Chạy project ở chế độ development

### Cách 1: chạy cả 2 workspace từ root

```bash
npm run dev
```

### Cách 2: chạy riêng

Backend:

```bash
npm run dev --workspace=server
```

Frontend:

```bash
npm run dev --workspace=client
```

Frontend thường chạy qua Vite dev server, backend chạy Hono trên cổng cấu hình trong `server/.env`.

## Build production

Build toàn bộ project:

```bash
npm run build
```

Hoặc build từng phần:

```bash
npm run build --workspace=client
npm run build --workspace=server
```

### Lưu ý production runtime

Dockerfile hiện tại đã được chỉnh để chạy backend theo kiểu compile trước:

- build frontend ra `client/dist`
- build backend TypeScript ra `server/dist`
- production container chạy bằng:

```bash
node dist/index.js
```

Cách này ổn định hơn so với chạy `tsx` trực tiếp trong container production.

## Deploy VPS với Docker Compose

### 1. Chuẩn bị file `.env` ở thư mục project trên VPS

Ví dụ:

```env
DB_PASSWORD=thay-bang-mat-khau-manh
ADMIN_TOKEN=thay-bang-chuoi-ngau-nhien-dai
SCRAPE_INTERVAL_HOURS=3
MAX_ARTICLES_PER_SOURCE=20
MAX_AI_CALLS_PER_RUN=30
VOZ_MAX_THREAD_PAGES=15
FORUM_MAX_COMMENTS=70
FORUM_RAW_CONTENT_MAX_LENGTH=80000
REDDIT_COMMENT_LIMIT=30
REDDIT_COMMENT_DEPTH=3
CORS_ORIGIN=https://newstamhv.duckdns.org
```

### 2. Build và chạy

```bash
docker compose up -d --build
```

### 3. Kiểm tra container

```bash
docker compose ps
docker compose logs -f app
```

### 4. Reverse proxy bằng Nginx

Sử dụng `nginx-newstamhv.conf` làm mẫu để trỏ domain public vào app đang map cục bộ qua `127.0.0.1:3001`.

## Biến môi trường

### Root `.env.example`

```env
DB_PASSWORD=thay-bang-mat-khau-manh
ADMIN_TOKEN=thay-bang-chuoi-ngau-nhien-dai
SCRAPE_INTERVAL_HOURS=3
MAX_ARTICLES_PER_SOURCE=20
MAX_AI_CALLS_PER_RUN=30
CORS_ORIGIN=https://newstamhv.duckdns.org
```

### `server/.env.example`

```env
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://newstamhv:newstamhv@localhost:5432/newstamhv
ADMIN_TOKEN=change-me-to-a-random-string
SCRAPE_INTERVAL_HOURS=3
MAX_ARTICLES_PER_SOURCE=20
MAX_AI_CALLS_PER_RUN=30
VOZ_MAX_THREAD_PAGES=15
FORUM_MAX_COMMENTS=70
FORUM_RAW_CONTENT_MAX_LENGTH=80000
REDDIT_COMMENT_LIMIT=30
REDDIT_COMMENT_DEPTH=3
```

### Ý nghĩa chính

- `PORT`: cổng backend
- `NODE_ENV`: môi trường chạy
- `DATABASE_URL`: chuỗi kết nối PostgreSQL
- `ADMIN_TOKEN`: token cho thao tác quản trị. **Bắt buộc phải đặt giá trị mạnh khi `NODE_ENV=production`** — server sẽ crash nếu token yếu hoặc mặc định.
- `SCRAPE_INTERVAL_HOURS`: chu kỳ scrape / summarize / digest
- `MAX_ARTICLES_PER_SOURCE`: số bài tối đa lấy từ mỗi nguồn mỗi đợt
- `MAX_AI_CALLS_PER_RUN`: số bài tối đa được tóm tắt mỗi lần job chạy
- `VOZ_MAX_THREAD_PAGES`: số page VOZ tối đa được đọc cho mỗi thread
- `FORUM_MAX_COMMENTS`: số comment/reply forum tối đa được chọn đưa vào `raw_content`
- `FORUM_RAW_CONTENT_MAX_LENGTH`: trần độ dài `raw_content` cho Reddit/VOZ sau khi enrich discussion
- `REDDIT_COMMENT_LIMIT`: số comment/reply Reddit tối đa được giữ lại sau khi chọn lọc
- `REDDIT_COMMENT_DEPTH`: độ sâu reply tree Reddit tối đa được flatten
- `CORS_ORIGIN`: origin được phép gọi API

## Cron jobs và vận hành

Các job chính trong `server/src/jobs/scheduler.ts`:

### Scrape & Summarize

- Chạy mỗi `SCRAPE_INTERVAL_HOURS` tại phút `00`
- Luồng:
  - scrape source
  - insert bài mới
  - summarize ngay sau đó

### Digest

- Chạy mỗi `SCRAPE_INTERVAL_HOURS` tại phút `30`
- Sinh bản tin tổng hợp từ các bài đã `done`

### Retry job

- Chạy mỗi 10 phút
- Reset:
  - bài `processing` bị kẹt quá lâu,
  - bài `failed` đủ điều kiện retry

### Cleanup job

- Chạy hằng ngày lúc `02:43`
- Xóa log cũ và làm gọn `raw_content` của bài quá cũ

## Bảo mật và auth

Middleware auth đang hoạt động theo nguyên tắc đơn giản:

- phần lớn `GET` public để frontend đọc dữ liệu,
- các thao tác thay đổi dữ liệu cần `Authorization: Bearer <ADMIN_TOKEN>`.

Ở frontend:

- khi gặp `401`, app có thể prompt yêu cầu nhập token admin,
- token được lưu ở `localStorage` dưới key `admin_token`.

Đây là mô hình phù hợp cho tool cá nhân nội bộ hoặc self-hosted nhỏ. Nếu muốn public rộng hơn, nên nâng cấp lên session auth hoặc một cơ chế xác thực chặt chẽ hơn.

## Ghi chú vận hành thực tế

### 1. VPS hiện tại có thể không phải git clone sạch

Trong quá trình deploy thực tế, môi trường VPS từng có trạng thái không phải working tree git chuẩn. Khi đó deploy bằng cách copy file + rebuild Docker là phương án an toàn hơn so với giả định `git pull` luôn chạy được.

### 2. Không nên để artifact build lẫn trong `src/`

Trước đây từng phát sinh lỗi build khi có các file `.js`, `.map`, `.d.ts` nằm trong `client/src/`. Vite có thể resolve nhầm file build artifact thay vì file TypeScript gốc.

### 3. VOZ cần scraper riêng

Nếu chỉ đọc RSS của VOZ, hệ thống sẽ thiếu phần bình luận. Cách đúng hiện tại là:

- lấy danh sách thread từ RSS,
- fetch trang thread thật,
- parse bài gốc + comment,
- đưa vào `raw_content` để AI có đủ ngữ cảnh.

## Các cải tiến gần đây

### UI/UX

- Thu gọn layout desktop để đỡ bị tràn ngang.
- Giảm độ rộng list bài bên trái.
- Feed item có thumbnail.
- Bài đã đọc được làm dịu màu để quét nhanh hơn.
- Thêm nút copy link bài gốc.
- Ẩn icon Admin/Sources khỏi header public để giao diện sạch hơn.
- Auto-scroll lên đầu khi chọn bài mới.
- Font chữ DM Sans cho cả tiêu đề và nội dung.
- Dark mode dịu mắt, giảm tương phản.
- Welcome card với GitHub link và danh sách tính năng.

### Hạ tầng backend

- Sửa race condition của summarizer bằng cơ chế claim atomic với `FOR UPDATE SKIP LOCKED`.
- Dockerfile production chuyển sang runtime từ `dist/` thay vì chạy `tsx` trực tiếp.
- Tăng max_tokens AI provider lên 4096 để tóm tắt không bị cắt.

### AI Summarization

- Prompt editorial chuyên sâu cho tin báo: yêu cầu 3-6 sections, 400-800 từ, trích dẫn trực tiếp quotes và số liệu, phân tích tác động.
- Prompt phóng viên cộng đồng cho forum: trích dẫn 2-3 comment cụ thể kèm tên user, phân tích sentiment, xu hướng community.
- Digest viết liền mạch như bản tin editorial, 800-1500 từ, có section "Điểm nhấn trong ngày".
- TLDR tự động trích xuất từ tag `<tldr>` trong output AI, chuẩn hóa tối đa 200 ký tự, hiển thị trong list preview.
- Scraper metrics chính xác: dùng `RETURNING id` để chỉ đếm bài thực sự được insert (không đếm sai khi `ON CONFLICT DO NOTHING`).

### Scraping

- Đã có scraper riêng cho VOZ để lấy nội dung thread và bình luận thành viên tốt hơn so với RSS thuần.
- Tăng VOZ_MAX_THREAD_PAGES lên 15, FORUM_MAX_COMMENTS lên 70, FORUM_RAW_CONTENT_MAX_LENGTH lên 80000.
- Giảm sleep giữa các page VOZ từ 800ms xuống 500ms.

---

Nếu dùng đúng theo mục tiêu ban đầu của project này, SynthNews hoạt động tốt nhất như một hệ thống đọc tin cá nhân self-hosted: ít thao tác, dễ vận hành, và tập trung vào tốc độ đọc hơn là bề mặt tính năng quá rộng.

## Lịch trình Scraping (Cron Jobs)
- **Đại cào toàn bộ (Mỗi 3 giờ):** Hệ thống tự động quét tất cả các nguồn tin (RSS, web, Voz, Reddit) theo các khung giờ cố định: 00h, 03h, 06h, 09h... Mục đích để tối ưu hoá máy chủ và đảm bảo chu kỳ nhận tin ổn định.
- **Tiểu cào Forum (Mỗi 30 phút):** Để theo dõi thảo luận (comment) nóng từ các nguồn Reddit và Voz, hệ thống có cron job phụ chạy vào phút :00 (nếu không trùng giờ đại cào) và phút :30. Nó sẽ cào lại những bài Reddit/Voz mới nhất tối đa 2 lần để cập nhật bình luận mới, sau đó tự động kích hoạt AI tóm tắt lại.
- **Bản tin tổng hợp (Mỗi 3 giờ):** Sau mỗi đợt đại cào 30 phút (tại phút :30), hệ thống sẽ tổng hợp "Bản tin thời sự" gộp tất cả các bài đã xử lý.

## CI/CD Deployment
This project uses GitHub Actions for automatic deployment to the Oracle VPS.
- **Lưu ý:** Quy trình này sẽ tự động chạy lệnh git pull và docker compose up -d --build trên VPS. Do đó, KHÔNG CẦN SSH vào VPS để restart service thủ công.

## Scraping Strategies

### Reddit — Waterfall 4-layer Comment Extraction

Reddit chặn API gắt gao (rate-limit, Cloudflare, Data API yêu cầu trả phí). Project giải quyết bằng cơ chế **waterfall**: thử từng strategy theo thứ tự ưu tiên, strategy đầu tiên thành công sẽ được dùng, nếu thất bại thì tự động fallback xuống strategy tiếp theo.

#### Bước 1: Lấy danh sách bài mới

Dùng **Subreddit RSS Feed** (`/r/{sub}/hot/.rss`) để lấy danh sách thread hot. RSS feed là endpoint ổn định nhất của Reddit, hiếm khi bị block.

#### Bước 2: Lấy comment cho từng bài (Waterfall)

Với mỗi bài mới, hệ thống thử lấy comment theo thứ tự:

| # | Strategy | Endpoint | Ưu điểm | Nhược điểm |
|---|----------|----------|----------|------------|
| 0 | **Reddit OAuth API** | `oauth.reddit.com` | Full data (score, replies, selftext) | Cần Reddit app credentials |
| 1 | **Puppeteer Headless** | `old.reddit.com/.json` | Bypass Cloudflare, full JSON | Chậm (~25s), tốn RAM |
| 2 | **Comment RSS Feed** | `reddit.com/{path}.rss` | Nhẹ, nhanh, không bị block | Không có score, giới hạn số comment |
| 3 | **Cloudflare Worker Proxy** | Custom proxy URL | Truy cập API từ IP sạch | Cần deploy Worker riêng |
| 4 | **Pullpush Archive** | `api.pullpush.io` | Backup cuối cùng | Data có thể chậm index vài giờ |

**Thứ tự ưu tiên thực tế:**
- Nếu có OAuth credentials (`REDDIT_CLIENT_ID`, etc.) → dùng **Strategy 0** trực tiếp, bỏ qua waterfall.
- Nếu không có OAuth → chạy waterfall **1 → 2 → 3 → 4**, dừng ngay khi strategy nào trả comment thành công.
- Giới hạn tối đa **8 bài được enrich** mỗi lần cào (tránh quá tải Puppeteer/proxy).

> **📌 Trạng thái production (05/2026):** Hiện tại OAuth chưa được cấu hình. Trong waterfall, cả Puppeteer (old.reddit.com chặn headless), RSS Comment (thường trả rỗng), và Cloudflare Worker Proxy đều fail → **Pullpush Archive API (Strategy 4) là strategy duy nhất đang hoạt động thành công**. Pullpush trả comment kèm score nhưng là flat list (không có nested replies). Bài mới đăng có thể chưa có comment trên Pullpush (chậm index vài giờ) → retry job mỗi 10 phút sẽ bổ sung sau.

#### Chi tiết từng strategy

**Strategy 0 — Reddit OAuth API** (`hasRedditOAuth()`)
- Gọi `oauth.reddit.com/{postPath}.json` với Bearer token.
- Token lấy qua Reddit OAuth password grant, tự cache và refresh.
- Trả về full JSON: selftext, outbound URL, comments tree với score.
- Env vars: `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USERNAME`, `REDDIT_PASSWORD`.

**Strategy 1 — Puppeteer Headless Browser** (`browserFetch()`)
- Dùng Chromium headless (Puppeteer) truy cập `old.reddit.com/{postPath}.json`.
- Anti-detection: xóa `navigator.webdriver`, set user agent Chrome thật, viewport 1920×1080.
- Tự dismiss cookie consent wall nếu có.
- Parse JSON từ `document.body.innerText` (rawText mode).
- Timeout: 25 giây.

**Strategy 2 — Comment RSS Feed**
- Fetch `reddit.com/{postPath}.rss` — endpoint RSS của chính thread đó.
- Reddit cung cấp RSS cho cả comment (ít người biết), không bị Cloudflare block.
- Hạn chế: không có score/upvote, chỉ lấy được ~25 comment gần nhất.
- Dù vậy đủ để AI có ngữ cảnh thảo luận cho tóm tắt.

**Strategy 3 — Cloudflare Worker Proxy**
- Gửi request qua proxy URL tự deploy (`REDDIT_PROXY_URL`).
- Proxy fetch Reddit API từ IP Cloudflare sạch, trả JSON nguyên bản.
- Chỉ active nếu env `REDDIT_PROXY_URL` được set.

**Strategy 4 — Pullpush Archive API**
- Gọi `api.pullpush.io/reddit/comment/search?link_id={postId}`.
- Pullpush lưu trữ Reddit data nhưng index chậm (có thể vài giờ sau khi post).
- Sort theo score, trả về comment kèm score.

#### Comment Processing Pipeline

Sau khi lấy được raw comments từ bất kỳ strategy nào:

1. **Flatten**: Comments tree (nested replies) được flatten thành mảng phẳng, giữ lại depth info.
2. **Filter**: Loại `[deleted]`, `[removed]`, comment < 20 ký tự.
3. **Score**: Tính điểm dựa trên `upvote score × 0.35 + length bonus + early thread bonus + depth bonus`.
4. **Dedupe**: Loại comment trùng nội dung (normalize text → lowercase → remove punctuation).
5. **Select**: Chọn top N comment (mặc định 30), sort lại theo thứ tự xuất hiện gốc.
6. **Build content**: Ghép thành `raw_content` cấu trúc: `[Nội dung bài viết] + [Link chia sẻ] + [Dữ liệu thảo luận] + [Bình luận cộng đồng]`.

#### Retry cơ chế (mỗi 10 phút)

Bài Reddit tạo trong 48 giờ qua mà vẫn có "Đã trích 0 comment" sẽ được retry tự động:
- Dùng **Pullpush API** để lấy comment (vì lúc này Pullpush đã index xong).
- Nếu lấy được → cập nhật `raw_content`, reset `summary_status = 'pending'` → AI tóm tắt lại.
- Tối đa 10 bài mỗi lần retry.

#### Env vars liên quan

| Biến | Mặc định | Mô tả |
|------|----------|-------|
| `REDDIT_COMMENT_LIMIT` | `30` | Số comment tối đa được giữ lại |
| `REDDIT_COMMENT_DEPTH` | `3` | Độ sâu reply tree tối đa |
| `REDDIT_CLIENT_ID` | *(trống)* | Reddit OAuth app client ID |
| `REDDIT_CLIENT_SECRET` | *(trống)* | Reddit OAuth app secret |
| `REDDIT_USERNAME` | *(trống)* | Reddit account username |
| `REDDIT_PASSWORD` | *(trống)* | Reddit account password |
| `REDDIT_PROXY_URL` | *(trống)* | URL Cloudflare Worker proxy |

### VOZ — Multi-page Thread Crawler

- Lấy danh sách thread mới từ **VOZ RSS feed**.
- Với mỗi thread, fetch trang HTML thật bằng `curl` (bypass Cloudflare TLS fingerprinting).
- Parse bài gốc (OP) + bình luận thành viên bằng **Cheerio**.
- Tự phát hiện và duyệt pagination (tối đa `VOZ_MAX_THREAD_PAGES` trang, mặc định 15).
- Comment được scoring, dedup, chọn lọc top `FORUM_MAX_COMMENTS` (mặc định 70).
- Sleep 500ms giữa các page để tránh rate-limit.

