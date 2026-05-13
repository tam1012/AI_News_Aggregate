# 🎨 SythNews UI Redesign Roadmap

> **Created**: 2026-05-13
> **Project**: newstamhv (SynthNews)
> **Approach**: Incremental — low risk, visual checkpoints at each phase
> **Prerequisite**: Test locally at `synthnews.local` before each commit/push

---

## Tổng quan

| Phase | Tên | Rủi ro | Thời gian ước tính | Output |
|-------|------|--------|-------------------|--------|
| 0 | Audit tổng hợp + baseline snapshot | — | 1 ngày | File này |
| **1** | **Design tokens + Font foundation** | 🔴 Thấp | 2–3 ngày | CSS mới, screenshot |
| 2 | Header + icon buttons | 🟡 Trung bình | 1–2 ngày | Header mới, screenshot |
| 3 | Feed item — editorial row-card | 🟡 Trung bình | 2–3 ngày | Feed visual mới, screenshot |
| 4 | Article detail polish | 🟡 Trung bình | 1–2 ngày | Detail mới, screenshot |
| 5 | Digest + footer polish | 🟢 Thấp | 1 ngày | Digest/footer mới |
| 6 | Skeleton + empty state | 🟢 Thấp | 0.5 ngày | Loading states |

> **Tổng**: ~8–12 ngày, có thể rút ngắn nếu mỗi phase chỉ mất 1 ngày

---

## Trạng thái hiện tại (2026-05-14)

| Phase | Tên | Trạng thái |
|-------|------|-----------|
| 0 | Audit tổng hợp + baseline snapshot | ✅ Hoàn thành |
| **1** | **Design tokens + Font foundation** | ✅ Hoàn thành |
| 2 | Header + icon buttons | ✅ Hoàn thành |
| 3 | Feed item — editorial row-card | ✅ Hoàn thành |
| 4 | Article detail polish | ⬜ Chưa làm |
| 5 | Digest + footer polish | ⬜ Chưa làm |
| 6 | Skeleton + empty state | ⬜ Chưa làm |

**Đã deploy production**: Commit `1e653a4` — `fix: UI redesign - improve dark mode text contrast and color tokens`

---

## Phase 0 — Baseline (✅ Hoàn thành)

### Mục tiêu
Chụp screenshot trạng thái hiện tại để so sánh trước/sau mỗi phase.

### Hành động
1. Chạy app ở `synthnews.local`
2. Chụp ảnh:
   - [ ] Desktop — split view, feed + article open
   - [ ] Desktop — light mode, full feed
   - [ ] Desktop — dark mode, full feed
   - [ ] Mobile — feed, 1 article open
   - [ ] Mobile — digest tab
3. Lưu vào `docs/ui-redesign/baseline/` để reference

### Điều kiện để tiếp tục
- Có baseline screenshot cho mỗi view chính

---

## Phase 1 — Design Tokens + Font Foundation ✅ Hoàn thành

### Mục tiêu
Thay đổi visual identity cơ bản nhất: font stack, màu nền, màu accent. Không đụng component markup.

### File cần sửa

#### `client/src/styles/tokens.css`

**Thay đổi**:
```diff
- @import url('https://fonts.googleapis.com/css2?family=Inter:...&family=Noto+Sans:...&family=Open+Sans:...&family=Roboto:...&family=Source+Sans+3:...&display=swap');
+ @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&family=JetBrains+Mono:wght@400;500;600&display=swap');

:root {
+   --font-body: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif;
+   --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
-   --font-heading: 'Noto Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
-   --font-body: 'Noto Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

-   --color-bg: #fbfaf6;        /* cream */
+   --color-bg: #FAFAFA;         /* warm white */
-   --color-bg-card: #fffdf8;
+   --color-bg-card: #FFFFFF;
-   --color-bg-hover: #f4f0e8;
+   --color-bg-hover: #F3F2EF;
-   --color-accent: #a77424;     /* amber */
+   --color-accent: #5B4AE4;     /* violet */
-   --color-accent-hover: #875a17;
+   --color-accent-hover: #4A39C8;
-   --color-text: #181511;
+   --color-text: #0A0808;
-   --color-text-secondary: #51493f;
+   --color-text-secondary: #4A4642;
-   --color-border: #ebe3d6;
+   --color-border: #E8E6E2;
-   --color-border-light: #f3eddf;
+   --color-border-light: #F0EEEA;
-   --color-shadow: rgba(54, 39, 18, 0.07);
+   --color-shadow: rgba(10, 8, 20, 0.07);
-   --radius: 16px;
-   --radius-sm: 10px;
+   --radius: 14px;
+   --radius-sm: 8px;
+   --font-size: 16px;
+   --header-height: 64px;
}

[data-theme="dark"] {
-   --color-bg: #0d1117;          /* GitHub dark */
-   --color-bg-card: #161b22;
-   --color-bg-hover: #21262d;
-   --color-text: #f0f6fc;
-   --color-text-secondary: #c9d1d9;
-   --color-accent: #58a6ff;     /* GitHub blue */
-   --color-accent-hover: #79c0ff;
+   --color-bg: #0C0B10;          /* deep charcoal */
+   --color-bg-card: #161520;
+   --color-bg-hover: #1E1B2E;
+   --color-text: #F0EEE8;
+   --color-text-secondary: #A8A4A0;
+   --color-accent: #7C5EED;      /* violet */
+   --color-accent-hover: #9B7FF5;
    ...giữ nguyên success/warning/error...
-   --color-border: #30363d;
-   --color-border-light: #21262d;
+   --color-border: #2A2638;
+   --color-border-light: #1E1B2E;
-   --color-shadow: rgba(1, 4, 9, 0.45);
+   --color-shadow: rgba(0, 0, 0, 0.35);
}
```

#### `client/src/styles/base.css`

**Thay đổi**:
```diff
- body {
-   font-family: var(--font-body);
+ body {
+   font-family: var(--font-body);
    ...giữ nguyên rest...
-   background:
-     radial-gradient(circle at top left, rgba(167, 116, 36, 0.08), transparent 34rem),
-     var(--color-bg);
+   background: var(--color-bg);
}

[data-theme="dark"] body::before {
-   background:
-     radial-gradient(ellipse at top left, rgba(30, 58, 110, 0.12) 0%, transparent 45%),
-     radial-gradient(ellipse at bottom right, rgba(30, 58, 110, 0.08) 0%, transparent 45%);
+   /* Remove edge glow — rely on shadow and border instead */
}
```

#### `client/src/styles/header.css`

**Thay đổi nhẹ**:
```diff
- .header-logo {
-   font-family: var(--font-heading);
-   font-size: 1.42rem; font-weight: 800;
-   color: var(--color-text); letter-spacing: -0.7px;
- }
+ .header-logo {
+   font-family: var(--font-body);
+   font-size: 1.4rem; font-weight: 800;
+   color: var(--color-text); letter-spacing: -0.5px;
+ }
```

#### `client/src/styles/home.css` — hard-coded amber cleanup

**Tìm và thay tất cả các chỗ hard-code amber**:

```css
/* home.css:71 — sort btn active background */
- background: rgba(184, 134, 11, 0.06);
+ background: var(--color-accent-subtle, rgba(91, 74, 228, 0.08));

/* home.css:145 — btn-active background */
- background: rgba(184, 134, 11, 0.08);
+ background: rgba(91, 74, 228, 0.08);

/* home.css:1065 — topic-chip active background */
- background: rgba(184, 134, 11, 0.1);
- background: rgba(212, 168, 85, 0.12);  /* dark mode */
+ background: rgba(91, 74, 228, 0.1);
+ background: rgba(124, 94, 237, 0.12);
```

#### `client/src/styles/components.css` — hard-coded amber cleanup

```css
/* components.css:59 — focus ring on input */
- box-shadow: 0 0 0 3px rgba(184, 134, 11, 0.12);
+ box-shadow: 0 0 0 3px rgba(91, 74, 228, 0.12);
```

### Verification checklist Phase 1

- [ ] Font chỉ load IBM Plex Sans + JetBrains Mono (check Network tab)
- [ ] Light mode: nền trắng ấm, accent violet, không còn cream
- [ ] Dark mode: nền charcoal sâu, accent violet nhẹ, không còn GitHub blue
- [ ] Ấn F12 → Elements → search `rgba(184, 134, 11` → không còn kết quả nào
- [ ] Screenshot: desktop light, desktop dark, mobile light, mobile dark
- [ ] Pull request / commit riêng cho Phase 1

---

## Phase 2 — Header + Icon Buttons ✅ Hoàn thành

> Hoàn thành trong commit `1e653a4`: Header sticky với backdrop blur, icon buttons rounded-square với hover lift + shadow, font-size button rounded-square, text settings menu.

### Mục tiêu
Header sạch hơn, icon buttons có personality hơn nhưng không quá thay đổi layout.

### File cần sửa

#### `client/src/styles/header.css`

**Thay đổi**:

```css
/* Icon buttons — từ circle → rounded-square nhẹ */
.icon-btn {
  width: 36px; height: 36px;
- border-radius: 50%;
+ border-radius: 10px;
  border: 1px solid var(--color-border-light);
  background: color-mix(in srgb, var(--color-bg-card) 72%, transparent);
  color: var(--color-text-secondary);
  display: flex; align-items: center; justify-content: center;
  font-size: 1rem;
+ transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
}

.icon-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-accent);
  border-color: var(--color-accent);
+ transform: translateY(-1px);
+ box-shadow: 0 4px 10px var(--color-shadow);
}

.icon-btn.active {
  border-color: var(--color-accent);
  color: var(--color-accent);
+ background: rgba(91, 74, 228, 0.08);  /* subtle violet fill */
}

.font-size-btn {
  ...giữ nguyên...
+ border-radius: 10px;  /* thay vì 999px pill */
}
```

**Thêm subtle accent glow trong dark mode**:
```css
[data-theme="dark"] .icon-btn.active {
  background: rgba(124, 94, 237, 0.15);
  box-shadow: 0 0 0 1px rgba(124, 94, 237, 0.3);
}
```

### Verification checklist Phase 2

- [ ] Icon buttons có rounded-square thay vì circle
- [ ] Hover có subtle lift + shadow
- [ ] Active state có violet fill nhẹ
- [ ] Không break mobile layout (icon size giữ nguyên)
- [ ] Screenshot header desktop + mobile

---

## Phase 3 — Feed Item: Editorial Row-Card ✅ Hoàn thành

> Hoàn thành trong commit `1e653a4`: Feed items chuyển từ divider-based sang row-card có nền + border + border-radius. Thêm source badge circle. Preview tăng lên 5 dòng. Active state có violet left rail + outline. Read state opacity 0.55. Hover có shadow nhẹ.

### Mục tiêu
Feed item có visual depth nhưng không quá "card dashboard". Scan nhanh vẫn là ưu tiên.

### File cần sửa

#### `client/src/styles/home.css`

**Thay đổi feed item** — section `/* ===== Feed Item (list row) ===== */`:

```css
.feed-item {
  padding: 18px 16px;
  margin: 0 0 10px;
- border-bottom: none;
- border-left: none;
- border-radius: 0;
+ border-radius: 14px;
+ border: 1px solid var(--color-border-light);
+ background: var(--color-bg-card);
  cursor: pointer;
- transition: opacity 0.15s, transform 0.15s;
+ transition: border-color 0.18s, box-shadow 0.18s, transform 0.18s;
  position: relative;
  -webkit-user-select: none; user-select: none;
}

.feed-item + .feed-item {
- border-top: 1px solid var(--color-border);
+ border-top: none;  /* margin-bottom đã tách item */
}

.feed-item:hover {
- opacity: 0.88; transform: translateY(-1px);
+ border-color: var(--color-border);
+ box-shadow: 0 4px 16px var(--color-shadow);
+ transform: translateY(-1px);
}

.feed-item:active {
- opacity: 0.72; transform: translateY(0);
+ transform: translateY(0);
+ box-shadow: none;
}

.feed-item.active {
- opacity: 1;
+ border-color: var(--color-accent);
+ box-shadow: 0 0 0 2px rgba(91, 74, 228, 0.12), 0 4px 16px var(--color-shadow);
}

.feed-item.active::before {
  /* Left accent rail — signature editorial indicator */
  content: '';
  position: absolute;
  top: 16px; bottom: 16px;
  left: -1px;  /* gắn vào border trái */
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--color-accent);
}

/* Source label */
.feed-item-source {
  font-size: 0.68rem; font-weight: 800;
  color: var(--color-accent);
  text-transform: uppercase; letter-spacing: 0.08em;
}

/* Read state */
.feed-item.is-read {
+ opacity: 0.55;
}
.feed-item.is-read .feed-item-title {
  color: var(--color-text-muted); font-weight: 500;
}
.feed-item.is-read .feed-item-source { opacity: 0.6; }

/* Meta row — thêm space cho source badge */
.feed-item-meta {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 8px;
}

/* Title — tăng line-height cho readable */
.feed-item-title {
  font-family: var(--font-body);
  font-size: 1.0rem; font-weight: 700; line-height: 1.38;
  margin-bottom: 6px; color: var(--color-text);
  letter-spacing: -0.01em;
}

/* Preview */
.feed-item-preview {
  font-size: 0.88rem; line-height: 1.65;
  color: var(--color-text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

**Thêm skeleton mới**:
```css
/* Feed item skeleton — cập nhật cho row-card */
.feed-item-skeleton {
- padding: 20px 0;
- border-bottom: 1px solid var(--color-border-light);
+ padding: 0;
+ border-radius: 14px;
+ background: var(--color-bg-card);
+ border: 1px solid var(--color-border-light);
+ margin-bottom: 10px;
+ overflow: hidden;
}
```

**Mobile adjustments**:
```css
@media (max-width: 640px) {
  .feed-item {
-   padding: 24px 0;
+   padding: 16px 14px;
+   border-radius: 12px;
+   margin: 0 0 8px;
  }
}
```

#### `client/src/pages/home/FeedItem.tsx`

**Thêm source icon circle** (chỉ thay đổi markup, không thay đổi logic):

```tsx
// Trong FeedItem component, thay đổi phần meta:
// Cũ:
<span className={`feed-item-source source-${sourceLabel.toLowerCase().replace(/[^a-z0-9]/g, '')}`}>
  {sourceLabel}
</span>

// Mới: thêm icon circle trước source label
<div className="feed-item-meta">
  <span className="feed-item-source-badge" aria-hidden="true">
    {sourceLabel.charAt(0).toUpperCase()}
  </span>
  <span className={`feed-item-source source-${sourceLabel.toLowerCase().replace(/[^a-z0-9]/g, '')}`}>
    {sourceLabel}
  </span>
  {time && <span className="feed-item-time">{time}</span>}
</div>
```

**Thêm CSS cho source badge** (home.css):
```css
.feed-item-source-badge {
  width: 18px; height: 18px;
  border-radius: 5px;
  background: var(--color-accent);
  color: white;
  font-size: 0.55rem; font-weight: 900;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  font-family: var(--font-body);
}

[data-theme="dark"] .feed-item-source-badge {
  background: var(--color-accent);
  opacity: 0.9;
}
```

### Verification checklist Phase 3

- [ ] Feed items có nền trắng + border + border-radius (row-card nhẹ)
- [ ] Active item có violet left rail + outline
- [ ] Hover có border đổi + shadow nhẹ, không lift mạnh
- [ ] Source badge hiện dạng icon circle
- [ ] Skeleton shimmer vẫn hoạt động
- [ ] Read state: opacity 0.55, title muted
- [ ] Mobile: padding giảm cho row-card, vẫn fit viewport
- [ ] Screenshot: desktop feed, mobile feed, 1 item active

---

## Phase 4 — Article Detail Polish

### Mục tiêu
Polishing detail panel: TL;DR box, typography, image treatment, close button.

### File cần sửa

#### `client/src/styles/home.css` — detail section

```css
/* TL;DR box — giảm shadow, thêm top accent rule */
.ai-tldr-box {
  margin: 0 0 24px;
  padding: 16px 18px;
  border-radius: var(--radius);
  background: var(--color-bg);
  border: 1px solid var(--color-border-light);
- box-shadow: 0 10px 28px var(--color-shadow);
+ box-shadow: none;
+ border-top: 2px solid var(--color-accent);
  position: relative;
}

.ai-tldr-header {
  font-size: 0.72rem; font-weight: 800;
  text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--color-accent);
  margin-bottom: 8px;
  display: flex; align-items: center; gap: 6px;
+ font-family: var(--font-mono);
}

.ai-tldr-box p {
  font-size: 0.98rem; line-height: 1.68;
  margin-bottom: 0; color: var(--color-text);
  font-weight: 500;
}

/* Detail title — editorial style */
.detail-title-editorial {
  font-family: var(--font-body);
  font-size: clamp(1.6rem, 3vw, 2rem); font-weight: 800; line-height: 1.22;
  margin-bottom: 28px; color: var(--color-text);
  text-align: center;
  letter-spacing: -0.025em;
}

/* Source link */
.detail-source-link:hover {
  color: var(--color-accent-hover);
  text-decoration: none;
}

/* Blockquote — dùng accent border */
.detail-body blockquote {
  margin: 18px 0;
  padding: 12px 16px;
  border-left: 3px solid var(--color-accent);
  background: var(--color-bg);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  color: var(--color-text-secondary);
}
.detail-body blockquote p {
  color: var(--color-text-secondary);
  font-style: italic;
}

/* Close button — polish */
.detail-close {
  position: sticky; top: 8px; float: right;
  margin-right: 14px; z-index: 3;
+ width: 34px; height: 34px;
+ border-radius: 10px;
- width: 32px; height: 32px; border-radius: 50%;
  border: 1px solid var(--color-border);
  background: var(--color-bg-card); color: var(--color-text-muted);
  display: flex; align-items: center; justify-content: center;
  font-size: 0.9rem;
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
}
.detail-close:hover {
+ background: var(--color-bg-hover);
+ color: var(--color-accent);
+ border-color: var(--color-accent);
+ transform: scale(1.05);
- background: var(--color-bg-hover); color: var(--color-text);
}
```

**Dark mode detail close**:
```css
[data-theme="dark"] .detail-close {
  background: rgba(22, 21, 32, 0.9);
}
[data-theme="dark"] .detail-close:hover {
  background: var(--color-accent);
  color: white;
  border-color: var(--color-accent);
}
```

#### `client/src/pages/home/ArticleDetail.tsx` — TL;DR label

```tsx
// Line 233: thay đổi label
// Cũ: <div className="ai-tldr-header">Tóm tắt nhanh</div>
// Mới: <div className="ai-tldr-header">⟡ AI tóm tắt</div>
```

### Verification checklist Phase 4

- [ ] TL;DR box có top accent line thay vì shadow nặng
- [ ] Blockquote dùng accent border left
- [ ] Close button: rounded-square thay vì circle, hover có scale
- [ ] TL;DR label có icon prefix
- [ ] Dark mode close button có special treatment
- [ ] Screenshot: article detail desktop + mobile, dark mode

---

## Phase 5 — Digest + Footer

### Mục tiêu
Digest đọc dễ hơn, footer user-friendly thay vì technical.

### File cần sửa

#### `client/src/styles/home.css` — digest section

```css
/* Digest content — editorial reading feel */
.digest-content {
  line-height: 1.85; font-size: 1.02rem;
  max-width: 680px; margin: 0 auto;
}

.digest-content h2 {
  font-family: var(--font-body);
+ font-size: 1.2rem; font-weight: 700;
+ color: var(--color-accent);
- color: var(--color-accent); font-size: 1.16rem;
- letter-spacing: -0.02em;
+ letter-spacing: -0.01em;
  margin-top: 32px; margin-bottom: 12px;
+ padding-bottom: 8px;
+ border-bottom: 1px solid var(--color-border-light);
+ display: flex; align-items: center; gap: 8px;
}

.digest-content h2::before {
+ content: '';
+ width: 16px; height: 3px;
+ border-radius: 2px;
+ background: var(--color-accent);
+ flex-shrink: 0;
}

.digest-content ul {
  padding-left: 0;
  margin-bottom: 16px;
+ list-style: none;
  display: grid; gap: 8px;
}

.digest-content li {
  margin-bottom: 0;
+ padding: 12px 16px;
+ border-radius: var(--radius-sm);
+ background: var(--color-bg);
+ border: 1px solid var(--color-border-light);
+ font-size: 0.95rem;
+ color: var(--color-text-secondary);
}

.digest-content li::marker { color: var(--color-accent); font-size: 0.9em; }
.digest-content p { margin-bottom: 14px; color: var(--color-text-secondary); }
```

#### `client/src/pages/Home.tsx` — footer

```tsx
// Tìm trong Home component, phần reader-footer
// Cũ:
<div className="reader-footer">
  <p>Nguồn mặc định cào mỗi 60 phút và tự backoff khi lỗi · Fetch bài mỗi 5 phút · Tóm tắt AI mỗi 10 phút</p>
</div>

// Mới:
<div className="reader-footer">
  <p>Tin tức tổng hợp tự động · Cập nhật liên tục trong ngày</p>
  <p style={{ marginTop: 4, opacity: 0.6 }}>Tóm tắt bằng AI</p>
</div>
```

**Thêm CSS cho footer** (home.css hoặc components.css):
```css
.reader-footer {
  text-align: center; padding: 20px 16px 28px;
  color: var(--color-text-muted); font-size: 0.8rem;
+ line-height: 1.7;
}
.reader-footer a { color: var(--color-accent); }
```

### Verification checklist Phase 5

- [ ] Digest heading có top rule + accent rule prefix
- [ ] Digest list items có background nhẹ + border
- [ ] Footer không còn technical noise
- [ ] Screenshot digest tab desktop + mobile

---

## Phase 6 — Skeleton + Empty State (nhanh)

### Mục tiêu
Loading states nhất quán với design mới.

### File cần sửa

#### `client/src/styles/base.css` — skeleton shimmer

```css
/* Skeleton loading — shimmer tốt hơn */
.skeleton {
+ background: linear-gradient(
+   90deg,
+   var(--color-border-light) 0%,
+   color-mix(in srgb, var(--color-bg-hover) 60%, var(--color-border-light)) 50%,
+   var(--color-border-light) 100%
+ );
  background-size: 200% 100%;
  animation: shimmer 1.6s ease-in-out infinite;
  border-radius: var(--radius-sm);
}

@keyframes shimmer {
- 0% { background-position: 200% 0; }
- 100% { background-position: -200% 0; }
+ 0% { background-position: -200% 0; }
+ 100% { background-position: 200% 0; }
}

/* Feed item skeleton — row-card shape */
.feed-item-skeleton {
  padding: 0;
  border-radius: 14px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-light);
  margin-bottom: 10px;
  overflow: hidden;
}
```

#### `client/src/styles/home.css` — empty state

```css
/* Empty state */
.empty-state {
  text-align: center; padding: 48px 20px;
  color: var(--color-text-muted);
}
.empty-state h2 {
  font-family: var(--font-body);
  font-size: 1.1rem; font-weight: 700;
  color: var(--color-text);
  margin-bottom: 8px;
}
.empty-state p {
  font-size: 0.9rem; color: var(--color-text-secondary);
}
```

### Verification checklist Phase 6

- [ ] Skeleton shimmer mượt hơn
- [ ] Feed item skeleton có border-radius đúng
- [ ] Empty state có typography rõ ràng
- [ ] Screenshot loading state + empty state

---

## Checklist tổng cuối (trước khi push lên production)

### Pre-deploy verification

- [ ] Light mode: tất cả các view (feed, article, digest, admin)
- [ ] Dark mode: tất cả các view
- [ ] Mobile: tất cả các view, safe-area đúng
- [ ] Font load: chỉ IBM Plex Sans + JetBrains Mono trong Network tab
- [ ] Không còn hard-coded amber/golden在任何地方
- [ ] Reading progress bar hoạt động
- [ ] Split view desktop: feed + article cùng hiện
- [ ] Swipe prev/next trong article hoạt động
- [ ] Pull-to-close trên mobile hoạt động
- [ ] Deep link `/article/:id` hoạt động
- [ ] Load more pagination hoạt động
- [ ] Topic chips filter hoạt động
- [ ] Source filter hoạt động
- [ ] Date navigation hoạt động
- [ ] Keyboard ← → chuyển bài hoạt động

### Accessibility check

- [ ] Contrast ratio đạt WCAG AA (4.5:1 cho body text)
- [ ] Focus-visible states có trên tất cả interactive elements
- [ ] Icon buttons có `title` attribute
- [ ] Reading progress bar có aria-label

---

## Commit convention

Mỗi phase nên là một commit riêng để dễ revert nếu cần:

```
chore(ui): Phase 1 — design tokens + font foundation
chore(ui): Phase 2 — header + icon button polish
chore(ui): Phase 3 — feed item editorial row-card
chore(ui): Phase 4 — article detail polish
chore(ui): Phase 5 — digest + footer refinement
chore(ui): Phase 6 — skeleton + empty state
```

## Branch strategy

```
main (production)
└── ui-redesign/
    ├── tokens-font-foundation   ← Phase 1
    ├── header-icon-polish        ← Phase 2
    ├── feed-row-card             ← Phase 3
    ├── detail-polish             ← Phase 4
    ├── digest-footer             ← Phase 5
    ├── skeleton-empty             ← Phase 6
    └── PR merge to main
```

---

*Nếu cần hỗ trợ triển khai bất kỳ phase nào, cho em biết. Em có thể làm trực tiếp trên repo.*