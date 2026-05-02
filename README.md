# AI News Aggregator

Hệ thống tổng hợp và tóm tắt tin tức tự động sử dụng AI. 
Dự án được xây dựng với cấu trúc Monorepo gồm Client (React + Vite) và Server (Node.js + Hono + PostgreSQL).

## 🚀 Tính năng chính

- **Cào dữ liệu đa dạng:** Hỗ trợ cào tin tức qua RSS Feed và Web Scraping trực tiếp.
- **Tự động tóm tắt bằng AI:** Tích hợp đa dạng AI Providers (Vertex AI, OpenAI, Gemini, Anthropic, DeepSeek, Mimo, Groq, xAI...) để tự động tạo tóm tắt tin tức mỗi khi có bài mới.
- **Tự động hóa hoàn toàn:** Tích hợp Cron job chạy mỗi giờ để lấy tin, tự động tóm tắt bài mới, và tự động thử lại khi API AI có lỗi.
- **Bản tin tổng hợp (Digest):** Hệ thống tạo bản tin định kỳ (daily/weekly).
- **Giao diện hiện đại & Responsive:** Tối ưu hóa UI/UX cho cả màn hình lớn và thiết bị di động (Mobile-friendly với sticky nav).
- **Trang Quản trị (Admin):** Quản lý Nguồn tin (Sources), Bài viết (Articles), và Cấu hình AI (Providers) được bảo vệ bằng Token. Toàn bộ thông tin nhạy cảm của API Keys được mã hóa và ẩn ở phía Frontend.

## 🛠 Tech Stack

- **Frontend:** React 18, Vite, React Router v6, TailwindCSS (Vanilla CSS customized), Lucide Icons.
- **Backend:** Node.js, Hono.js (Web framework siêu nhẹ), pg (PostgreSQL client).
- **Database:** PostgreSQL.
- **Triển khai:** Docker & Docker Compose, Nginx.

## 📁 Cấu trúc thư mục

```text
.
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/     # UI Components (Article Card, Feed, v.v.)
│   │   ├── pages/          # Các trang chính (Home, Admin, Digests)
│   │   ├── services/       # Giao tiếp API (axios/fetch wrapper)
│   │   └── styles/         # Global styles & CSS utilities
│   └── package.json
├── server/                 # Backend Node.js API
│   ├── src/
│   │   ├── db/             # Database connection & setup
│   │   ├── jobs/           # Cron jobs (Scraper, Summarizer, Cleanup, Retry)
│   │   ├── lib/            # Utilities & Auth Middleware
│   │   ├── routes/         # API Controllers
│   │   └── services/       # Logic cốt lõi (Scraper, AI Client)
│   └── package.json
├── docker-compose.yml      # Cấu hình Docker cho cả App (Build) và DB
├── Dockerfile              # Dockerfile build production cho App
└── nginx-newstamhv.conf    # Cấu hình Nginx Reverse Proxy
```

## ⚙️ Cài đặt & Chạy Local

### Yêu cầu
- Node.js v20+
- PostgreSQL v14+
- (Tùy chọn) Docker & Docker Compose để chạy DB nhanh chóng.

### 1. Thiết lập Database Local
Bạn có thể cài PostgreSQL trực tiếp hoặc dùng Docker:
```bash
docker run --name newstamhv-db -e POSTGRES_USER=newstamhv -e POSTGRES_PASSWORD=newstamhv -e POSTGRES_DB=newstamhv -p 5433:5432 -d postgres:14-alpine
```

### 2. Cấu hình biến môi trường
Tạo file `.env` tại thư mục gốc dựa trên `.env.example`:
```env
# Database URL
DATABASE_URL=postgres://newstamhv:newstamhv@localhost:5433/newstamhv

# Server Port
PORT=3001

# Admin Token (Bắt buộc phải có để truy cập trang quản trị)
ADMIN_TOKEN=your_secure_admin_token_here

# Chu kỳ cào tin (giờ)
SCRAPE_INTERVAL_HOURS=1
```

### 3. Cài đặt dependencies
```bash
# Cài npm packages cho Backend
cd server
npm install

# Cài npm packages cho Frontend
cd ../client
npm install
```

### 4. Khởi chạy môi trường Dev
Chạy Backend (Terminal 1):
```bash
cd server
npm run dev
```

Chạy Frontend (Terminal 2):
```bash
cd client
npm run dev
```

Truy cập `http://localhost:5173` để xem ứng dụng.

## 🚢 Triển khai lên VPS (Production)

Toàn bộ ứng dụng được đóng gói sẵn để deploy dễ dàng với Docker Compose.

1. **Chuẩn bị file môi trường trên VPS:** Tạo file `.env` chứa `DATABASE_URL` (trỏ vào db container), `PORT=3001`, và `ADMIN_TOKEN`.
2. **Khởi động Docker:**
```bash
docker compose up -d --build
```
3. **Cấu hình Nginx:** Sử dụng file `nginx-newstamhv.conf` làm mẫu để setup Reverse Proxy trỏ domain vào cổng `3001` (hoặc cổng mapping của docker).

## 🔒 Bảo mật

- Mọi thao tác thay đổi dữ liệu (POST, PUT, DELETE) và các thiết lập nhạy cảm (AI Providers) đều yêu cầu `ADMIN_TOKEN`.
- Client sẽ yêu cầu nhập Token qua Prompt khi thao tác lỗi 401 Unauthorized và lưu vào `localStorage`.
- Trên Client tuyệt đối KHÔNG bao giờ có thể đọc được `api_key` của AI Provider (Backend đã loại bỏ khỏi payload response khi list danh sách).

## 📝 Quy trình phát triển

1. Toàn bộ mã nguồn nên được chỉnh sửa và test tại **Local**.
2. Khi mọi thứ ổn định, sử dụng lệnh `git commit` & `git push` lên GitHub.
3. Trên VPS, kéo mã nguồn mới nhất (`git pull`) và chạy `docker compose up -d --build` để tái tạo môi trường Production.
