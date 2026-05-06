# Roadmap tiếp theo cho SynthNews

Cập nhật lần cuối: 06/05/2026

## 1. Mục tiêu chung

SynthNews đang đi theo hướng:

- Tự host trên VPS, dùng hằng ngày qua web/mobile tại `https://synthnews.site`.
- Cào nguồn tự động, fetch nội dung bài, tóm tắt AI bằng tiếng Việt và tạo digest.
- Ưu tiên chất lượng nội dung: đọc ít hơn nhưng nắm được tin đáng đọc hơn.
- Giảm chi phí AI bằng cách lọc nguồn/bài/comment kém chất lượng trước khi gửi tóm tắt.
- Vận hành ổn định hơn, ít phải SSH hoặc soi database thủ công.
- Admin phải dễ hiểu bằng tiếng Việt, nhìn vào biết hệ thống đang nghẽn ở đâu.
- Mobile/PWA đủ tốt để dùng như app đọc tin hằng ngày.

## 2. Những việc đã hoàn thành

### 2.1. Nền tảng ban đầu

Đã có:

- Frontend React/Vite.
- Backend Node/Hono/TypeScript.
- PostgreSQL.
- Docker Compose deploy trên Oracle VPS.
- GitHub Actions deploy: push `main` → SSH VPS → pull/build/restart.
- Public domain `https://synthnews.site`.

### 2.2. Image proxy và tối ưu ảnh mobile

Đã xử lý/verify:

- Ảnh feed/detail đi qua `/api/img`.
- Có preset ảnh `thumb`, `detail`, `og`.
- Helper xử lý ảnh relative URL theo URL bài viết.
- Giảm rủi ro mobile bị treo vì ảnh gốc quá lớn.

### 2.3. Specialized GitHub Trending fetcher

Đã làm xong.

- Có fetcher riêng cho GitHub Trending.
- Discover repo trending từ trang GitHub Trending.
- Lưu metadata repo: tên repo, mô tả, language, stars, stars today.
- Fetch README raw nếu có để AI có nội dung tốt hơn.
- Đăng ký fetcher trước generic fetcher.
- Có test cho registry, resolver, fetcher.

### 2.4. Article fetch queue và Admin queue UI

Đã làm xong.

- Có `article_fetch_jobs` queue riêng.
- Fetch bài chi tiết độc lập khỏi discovery.
- Có retry/delete job lỗi.
- Admin có tab “Hàng đợi lấy bài”.
- UI xem được trạng thái: chờ lấy bài, đang lấy bài, đã xong, lỗi.

### 2.5. Summary queue và retry hardening

Đã làm xong.

- Summary queue có trạng thái `pending/processing/done/failed/skipped`.
- Admin có tab “Hàng đợi tóm tắt”.
- Retry policy reset bài `failed` còn retry được.
- Reset `processing` bị kẹt theo helper retry policy, không hard-code rải rác.
- Có trường vận hành: `last_summary_error`, `retry_count`.

### 2.6. Job lock và write/auth hardening

Đã làm xong và deploy.

- Cron jobs quan trọng chạy qua PostgreSQL advisory lock:
  - scrape
  - article fetch
  - summarize
  - digest
  - retry
- Tránh overlap khi job trước chưa xong.
- Admin/write endpoints có rate limit in-memory.
- Heavy actions như scrape/retry/summarize/digest bị limit chặt hơn.
- Auth admin token dùng timing-safe compare.
- Invalid admin token attempts có rate limit riêng.

Commit liên quan:

- `f137021 chore: harden background jobs and admin writes`

### 2.7. Source-specific scheduling/backoff

Đã làm xong bước cơ bản.

- Mỗi source có `fetch_interval_minutes` và `next_run_at`.
- Source mặc định cào mỗi 60 phút.
- Cron cào source kiểm tra source đến hạn mỗi giờ tại phút `00`.
- Source lỗi sẽ backoff, tối đa 24h.
- Source thành công reset failure count và lên lịch lần tiếp theo.
- Admin/Sources hiển thị health cơ bản.
- Có nút `Cào ngay` cho từng nguồn trong trang Nguồn tin.

### 2.8. Safe summarization fallback và AI output quality gate

Đã làm xong.

- Nếu AI provider reject vì safety/high-risk, backend retry một lần bằng safe prompt.
- Safe prompt yêu cầu tóm tắt trung lập, high-level, không quote nội dung nhạy cảm, không đưa hướng dẫn nguy hiểm.
- Nếu vẫn fail thì mark `skipped` và ghi rõ `last_summary_error`.
- Parser structured JSON hỗ trợ cả key chuẩn và key legacy như `summaryShort`, `hotScore`, `editorialmarkdown`.
- AI output có `isUsable` quality gate.
- Nếu output không usable, summarizer gọi repair prompt một lần để ép về JSON hợp lệ.

### 2.9. Repair metadata summary cũ

Đã làm xong và đã chạy production.

- Thêm script `repair:summary-metadata` chạy từ build output `node dist/scripts/repair-summary-metadata.js`.
- Repair các bài cũ có `summary_text` dạng fenced JSON hoặc thiếu metadata.
- Không gọi AI lại, chỉ parse output cũ để lấp:
  - `tldr`
  - `summary_short`
  - `hot_score`
  - `tags`
  - clean `summary_text`
- Production repair đã chạy:
  - `candidates=1022`
  - `repairable=3`
  - `changed=3`

Commits liên quan:

- `ace956b fix: repair legacy summary metadata`
- `f76472b fix: run summary repair script from build output`

### 2.10. Prompt config/admin settings polish

Đã làm xong bước tốt hơn.

- Admin có màn hình cấu hình prompt.
- Có preview JSON payload.
- Có cảnh báo cấu hình rỗng/quá dài/thiếu tag.
- Có nút nạp mặc định.
- Có nút reset mặc định.
- Backend có endpoint default/reset prompt config.

### 2.11. Reddit/VOZ forum quality filtering

Đã làm xong bước đầu.

- Không chỉ dựa vào số comment nữa.
- Lọc comment rác/ngắn/trùng trước khi đưa vào AI:
  - `lol`, `+1`, `hóng`, `chấm`, `same`, `agree`, comment quá ngắn, comment lặp ít từ.
- Ưu tiên comment có kinh nghiệm/thảo luận thực tế:
  - “mình dùng”, “triển khai”, “công ty”, câu hỏi, kinh nghiệm, v.v.
- Reddit/VOZ chỉ insert bài khi có đủ số comment và đủ comment hữu ích.
- Log skip rõ hơn: tổng comment và số comment hữu ích.
- Có test cho lọc comment forum.

### 2.12. Forum observability cho Reddit/VOZ

Đã làm xong.

- `scrape_logs.metadata` lưu metadata JSONB.
- Reddit/VOZ scraper ghi `metadata.forum` cho từng lượt cào:
  - loại forum: Reddit hoặc VOZ
  - số thread đã xem
  - số thread insert thành bài
  - số thread bỏ qua vì ít comment
  - số thread bỏ qua vì ít comment hữu ích
  - số thread trùng URL/content hash
  - số lỗi fetch comment/thread
- Reddit scraper ghi thêm số lần thử/thành công theo strategy:
  - OAuth
  - Puppeteer/old Reddit JSON
  - Reddit RSS comments
  - Cloudflare proxy
  - Pullpush
- `/api/health` trả thêm `forum.totals24h` và `forum.recent`.
- Admin Tổng quan có card “Theo dõi forum Reddit/VOZ”.
- Có test client kiểm tra nhãn observability forum.

### 2.13. Source quality dashboard

Đã làm xong và deploy.

- `/api/health` trả thêm:
  - `sourceQuality`
  - `sourceQualitySummary`
- Backend phân loại source:
  - `healthy`
  - `low_yield`
  - `failing`
  - `stale`
  - `disabled`
- Admin Tổng quan có card “Chất lượng nguồn tin”.
- Nhãn UI tiếng Việt:
  - `Ổn`
  - `Ít bài mới`
  - `Đang lỗi`
  - `Lâu chưa thành công`
  - `Đã tắt`
- Card hiển thị số lần cào, số bài tìm thấy, số bài insert, tỷ lệ insert và note lỗi.

Commit liên quan:

- `e29bd95 feat: show source quality in admin overview`

### 2.14. Admin operations dashboard dễ hiểu hơn

Đã làm xong.

Trang Admin Tổng quan đã được gom lại thành các khối tiếng Việt dễ đọc:

- Cần xử lý.
- Tình trạng nguồn tin.
- Tình trạng bài viết.
- Hàng đợi lấy bài.
- Hàng đợi tóm tắt.
- Bản tin gần nhất.
- Theo dõi forum Reddit/VOZ.
- Chất lượng nguồn tin.
- Chạy thủ công.
- Lần cào gần đây.

Đã Việt hóa nhiều nhãn Admin:

- Queue → Hàng đợi tóm tắt.
- Fetch Jobs → Hàng đợi lấy bài.
- AI Providers → Nhà cung cấp AI.
- Retry → Thử lại.
- Active → Đang dùng.
- calls → lượt gọi.
- Các trạng thái `failed/done/pending/...` hiển thị tiếng Việt.

### 2.15. PWA/offline reader cache

Đã làm xong bước đầu.

- `manifest.webmanifest`.
- `sw.js` service worker.
- Đăng ký service worker ở production.
- Persistent API cache bằng `localStorage` cho public GET endpoints.
- Cache/fallback cho `/articles`, `/articles/dates`, `/digests/latest`, `/sources`.
- UI có trạng thái offline/cache/stale.
- Service worker cache version đã bump lên `synthnews-v2` sau mobile/PWA polish.

### 2.16. Mobile reader polish

Đã làm xong một vòng đáng kể.

- Mobile refresh row.
- Scroll-to-top floating button.
- Empty/offline state rõ hơn.
- Article deep link không bị mất detail pane khi hard refresh.
- Layout split feed/detail ổn hơn.
- Feed mobile gọn hơn: title/preview/thumbnail cân lại, preview clamp 2-3 dòng.
- Reader mobile dễ đọc hơn: title responsive, content max-width, blockquote/link wrap tốt hơn.
- Nút hành động trong article detail sticky ở đáy, có safe-area cho mobile.
- Header/feed toolbar có safe-area top.
- Tab `News` đổi thành `Tin mới`.
- Đã fix lỗi tab `Bản tin` làm tràn ngang mobile bằng cách contain overflow ngang ở app shell và tab scroller.

Commits liên quan:

- `d37affb feat: polish mobile reading experience`
- `e4b470b fix: contain mobile digest tabs`
- `a2fcdc7 fix: prevent mobile page overflow`

### 2.17. Fix lỗi ngày/local date và tab pagination

Đã làm xong.

- Backend trả `local_date` dạng text `YYYY-MM-DD` theo giờ Việt Nam.
- Frontend ưu tiên `local_date`, tránh lỗi cắt `published_at` theo UTC.
- Thêm `feedTab` filter ở backend để lọc News/Reddit/VOZ/YouTube trước khi LIMIT/OFFSET.
- Frontend gửi `feedTab` theo tab hiện tại.
- Có nút tải thêm bài cũ.

### 2.18. Hot feed ranking / Tin nóng

Đã làm xong và deploy.

- Backend `/api/articles` hỗ trợ `sort=latest|hot`.
- `sort=hot` sắp xếp theo:
  1. `hot_score` cao trước.
  2. nếu bằng điểm thì bài mới hơn trước.
- UI feed có toggle:
  - `Mới nhất`
  - `Tin nóng`
- Load-more giữ đúng sort đang chọn.
- API client truyền `sort` xuống server.
- Có test backend + frontend.
- Production đã verify:
  - `latest` trả bài mới nhất với score lẫn lộn.
  - `hot` trả bài score 10/9 lên đầu.

Commit liên quan:

- `a7a7698 feat: add hot feed ranking`

### 2.19. Deploy workflow ổn định hơn

Đã làm xong.

- Workflow dùng `git pull --ff-only origin main`.
- Public health check có retry, không fail ngay nếu app/nginx 502 vài giây lúc restart.
- Public articles smoke check cũng có retry.
- Nếu fail thật thì in `docker compose ps` và app logs.

## 3. Trạng thái kiểm thử gần nhất

Các lệnh verify local nên chạy trước commit/deploy:

```bash
npm --prefix "D:\Antigravity\newstamhv" run build
npm --prefix "D:\Antigravity\newstamhv" test --workspace=server
npm --prefix "D:\Antigravity\newstamhv" test --workspace=client
```

Gần nhất sau hot feed ranking:

- Build full project: pass.
- Server tests: 50/50 pass.
- Client tests: 29/29 pass.

Production gần nhất:

- VPS commit gần nhất: `a7a7698 feat: add hot feed ranking`.
- `newstamhv-app` healthy.
- `newstamhv-db` healthy.
- `/`: 200.
- `/api/health/live`: 200.
- `/api/articles?limit=5&status=done&sort=hot`: 200.
- `/api/articles?limit=5&status=done&sort=latest`: 200.

## 4. Những việc nên làm tiếp

### 4.1. Quality feed filters theo tag/chủ đề

Ưu tiên cao nhất lần sau.

Hiện đã có `hot_score` và `tags`, đã repair metadata cũ, và đã có `Tin nóng`. Bước tiếp theo hợp lý là thêm filter nhanh theo chủ đề để người đọc vào đúng nhóm tin mình quan tâm.

Nên làm:

- Thêm chip/filter ở feed:
  - `Tất cả`
  - `AI & Tech`
  - `Kinh tế`
  - `Việt Nam`
  - `Bảo mật`
- Mapping tag hiện có sang nhóm chủ đề.
- Dùng API `tag` hiện có hoặc mở rộng query nếu cần nhiều tag cùng nhóm.
- Giữ tương thích với `sort=latest|hot` và `feedTab`.
- UI nên nhỏ gọn, không làm tab bar quá chật trên mobile.

Mục tiêu:

- Biến feed từ “danh sách bài mới” thành “bảng tin có thể lọc nhanh theo nhu cầu”.
- Tận dụng metadata AI đã có.

### 4.2. Admin quality control cho bài tóm tắt

Ưu tiên sau topic filters.

Nên làm:

- Admin section nhỏ để xem bài có vấn đề:
  - `summary_status='done'` nhưng thiếu `tldr`.
  - thiếu `summary_short`.
  - thiếu `hot_score` hoặc `tags`.
  - `summary_text` quá ngắn.
  - `hot_score` thấp bất thường.
- Có nút `Tóm tắt lại` cho từng bài.
- Có filter theo source để biết source nào tạo bài kém.

Mục tiêu:

- Phát hiện nhanh AI/source nào đang tạo nội dung rác.
- Không cần query DB thủ công.

### 4.3. Theo dõi và tinh chỉnh forum quality sau khi chạy thật

Vẫn nên theo dõi định kỳ.

Cần kiểm tra:

- Reddit/VOZ còn lọt thread rác không.
- Có bị lọc quá tay làm ít bài forum quá không.
- Admin card “Theo dõi forum Reddit/VOZ” có nhiều skip do ít comment hữu ích hay do fetch comment lỗi.
- Reddit strategy nào đang lấy comment tốt nhất: OAuth, Puppeteer, RSS, proxy hay Pullpush.
- Những source Reddit/VOZ nào bị thiếu comment do fetch comment lỗi thay vì thread thật sự rác.

Có thể làm tiếp nếu số liệu cho thấy cần:

- Cho cấu hình `FORUM_MIN_USEFUL_COMMENTS` qua env.
- Điều chỉnh rule `isUsefulForumComment` nếu quá gắt/quá lỏng.
- Nếu Pullpush vẫn `empty/failed` nhiều, ưu tiên Cloudflare proxy/OAuth hơn thay vì kỳ vọng retry Pullpush.

### 4.4. Source quality nâng cao ngoài forum

Đã có dashboard bước đầu, nhưng còn có thể làm sâu hơn.

Ý tưởng:

- Tách lỗi network/parser/content-too-short/duplicate cho RSS/web/YouTube.
- Hiển thị xu hướng theo ngày thay vì chỉ 24h/7d hiện tại.
- Có cảnh báo nguồn bị backoff nhiều lần.
- Gợi ý source nên tắt nếu lâu ngày không insert được bài.

Mục đích:

- Biết source nào nên tắt hoặc chỉnh parser.
- Không cần SSH/log để hiểu vì sao nguồn ít bài.

### 4.5. YouTube source polish

Chưa làm sâu.

Nên làm khi YouTube bắt đầu nhiều rác.

Ý tưởng:

- Lọc video theo duration/view/title nếu có metadata.
- Tránh Shorts hoặc video quá ít nội dung.
- Ưu tiên transcript tốt.
- Nếu không có transcript, fallback description tốt hơn.
- Tách UX YouTube rõ hơn nếu cần.

### 4.6. Cache/service worker polish

PWA/cache đã dùng được nhưng còn polish.

Ý tưởng:

- Có UI báo “Có bản mới, bấm để tải lại”.
- Tránh cache cũ giữ API shape cũ quá lâu.
- Tự unregister/reload mềm khi service worker version đổi.
- Kiểm tra kỹ flow trên Chrome mobile sau deploy.

### 4.7. Prompt config nâng cao hơn

Đã có polish cơ bản, nhưng còn nâng cấp được.

Ý tưởng:

- Test prompt với một bài mẫu ngay trong Admin.
- Version/history prompt config.
- Mô tả rõ từng setting ảnh hưởng gì.
- Cho xem prompt cuối cùng sau khi ghép config với template.

### 4.8. Cost/token observability

Chưa làm.

Ý tưởng:

- Log token/call nếu provider trả usage.
- Thống kê số lần gọi AI theo ngày/provider.
- Ước lượng chi phí theo provider/model.
- Admin hiển thị provider nào lỗi nhiều, tốn nhiều.

## 5. Đề xuất thứ tự làm tiếp lần sau

### Bước 1: Topic filters cho feed

Làm trước.

Việc cần làm:

- Thêm filter chủ đề nhanh trong feed.
- Tận dụng `tags` hiện có.
- Đảm bảo kết hợp được với:
  - `Tin mới` / `Tin nóng`
  - tab News/VOZ/Reddit/YT
  - date picker
  - load-more
- Có test API client/UI.
- Verify production bằng API query và UI endpoint.

Lý do:

- Hot ranking vừa xong, bước này nối tiếp tự nhiên để tăng chất lượng trải nghiệm đọc.
- ROI cao, ít rủi ro hơn so với thay đổi crawler/summarizer.

### Bước 2: Admin quality control cho bài tóm tắt

Làm sau topic filters.

Việc cần làm:

- Thêm API hoặc dùng API hiện có để list bài thiếu metadata/chất lượng thấp.
- Admin card/table xem nhanh bài cần xử lý.
- Có nút `Tóm tắt lại`.
- Có filter theo source/status.

Lý do:

- Sau khi dùng `hot_score/tags` cho ranking/filter, cần màn hình giám sát metadata xấu.

### Bước 3: Theo dõi forum/source quality theo số liệu thật

Làm song song định kỳ hoặc khi thấy feed forum ít/rác.

Việc cần làm:

- Xem Admin cards sau vài vòng cào.
- Kiểm tra source nào `low_yield/failing/stale`.
- Điều chỉnh forum filter/source nếu cần.

### Bước 4: PWA update UX

Làm khi cache/service worker gây khó chịu sau vài lần deploy.

Việc cần làm:

- Banner/nút reload khi có version mới.
- Verify kỹ trên mobile Chrome.

### Bước 5: YouTube/cost/prompt nâng cao

Làm khi có nhu cầu rõ hơn:

- YouTube nhiều rác → polish YouTube.
- Chi phí AI khó kiểm soát → cost/token observability.
- Prompt hay phải chỉnh → prompt version/test UI.

## 6. Ghi chú vận hành

### 6.1. Production domain

```text
https://synthnews.site
```

### 6.2. VPS

- VPS Oracle Singapore.
- IP: `158.178.239.119`.
- Project path: `/home/ubuntu/newstamhv`.
- Deploy: push `main` → GitHub Actions SSH vào VPS → pull → docker build/restart.

### 6.3. API nên check sau deploy

```text
https://synthnews.site/api/health/live
https://synthnews.site/api/articles/dates
https://synthnews.site/api/articles?limit=1&status=done
https://synthnews.site/api/articles?limit=5&status=done&sort=hot
https://synthnews.site/admin
```

### 6.4. Lưu ý về deploy

GitHub Actions đã được sửa để retry public health/articles smoke check, tránh fail giả do 502 vài giây khi app vừa restart.

Nếu VPS commit chưa lên ngay sau push, đợi một chút rồi check lại:

```bash
ssh ubuntu@158.178.239.119 "cd /home/ubuntu/newstamhv && git rev-parse --short HEAD && docker compose ps"
```

## 7. Kết luận ngắn

SynthNews hiện đã hoàn thành nhiều mục lớn:

- GitHub Trending fetcher riêng.
- PWA/offline cache bước đầu.
- Mobile reader polish + fix overflow mobile digest.
- Fix local date và tab pagination.
- Article Fetch Jobs UI.
- Summary Queue UI.
- Source scheduling/backoff.
- Cào từng nguồn thủ công.
- Job advisory locks.
- Admin/write rate limit và timing-safe auth.
- Safe summarization fallback.
- AI output quality gate + repair prompt.
- Repair metadata summary cũ trên production.
- Prompt config polish.
- Admin dashboard dễ hiểu hơn bằng tiếng Việt.
- Deploy workflow ổn định hơn.
- Reddit/VOZ forum quality filtering bước đầu.
- Forum observability cho Reddit/VOZ.
- Source quality dashboard.
- Hot feed ranking / `Tin nóng`.

Việc nên làm tiếp nhất:

1. Thêm topic filters cho feed dựa trên `tags`.
2. Thêm Admin quality control cho bài thiếu metadata/chất lượng thấp.
3. Theo dõi forum/source quality theo số liệu thật và tinh chỉnh nếu cần.
4. PWA update UX nếu cache/service worker còn gây khó chịu.
