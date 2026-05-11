export function ReadmeWelcome() {
  return (
    <div className="card" style={{ padding: 'clamp(20px, 4vw, 32px)', textAlign: 'center', marginTop: '16px' }}>
      <h2 style={{ fontSize: 'clamp(1.4rem, 4vw, 1.8rem)', marginBottom: '10px', fontFamily: 'var(--font-heading)' }}>SynthNews</h2>
      <p style={{ color: 'var(--color-text-secondary)', margin: '0 auto 18px', fontSize: '0.98rem', lineHeight: '1.55', maxWidth: '650px' }}>
        SynthNews là repo đọc tin cá nhân tự host: backend cào RSS, web, Reddit, VOZ và GitHub Trending; AI tóm tắt tiếng Việt; frontend hiển thị feed đọc nhanh cho desktop và mobile.
      </p>

      <div style={{ textAlign: 'left', background: 'var(--color-bg)', padding: 'clamp(14px, 3vw, 18px)', borderRadius: 'var(--radius)', fontSize: '0.9rem', lineHeight: '1.55' }}>
        <ul style={{ paddingLeft: '18px', margin: 0, color: 'var(--color-text-secondary)' }}>
          <li style={{ marginBottom: '6px' }}>Monorepo React + Hono + PostgreSQL, deploy bằng Docker Compose sau Nginx HTTPS.</li>
          <li style={{ marginBottom: '6px' }}>News, VOZ, Reddit và Bản tin tự động trong một giao diện, có deep link bài viết.</li>
          <li style={{ marginBottom: '6px' }}>AI tạo TL;DR, tóm tắt bài dài, lọc quảng cáo/khuyến mãi và tạo digest định kỳ.</li>
          <li>Hỗ trợ dark mode, mobile layout, lưu bài đã đọc, ảnh proxy và điều hướng bàn phím.</li>
        </ul>
      </div>

      <p style={{ color: 'var(--color-text-muted)', fontSize: '0.84rem', margin: '16px 0 0', lineHeight: '1.45' }}>
        Chọn một bài để đọc. Mở tab <strong>Bản tin</strong> để xem tổng hợp gần nhất.<br />
        Thông tin liên hệ hỗ trợ: Telegram - <a href="https://t.me/ThongThaiTuaThanTien" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)' }}>@ThongThaiTuaThanTien</a>
      </p>
    </div>
  );
}

