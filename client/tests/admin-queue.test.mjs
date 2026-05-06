import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('admin exposes a dedicated summary queue tab', () => {
  const source = readFileSync(resolve(__dirname, '../src/pages/Admin.tsx'), 'utf8');

  assert.match(source, /type AdminTab = 'overview' \| 'queue'/);
  assert.match(source, /\{ key: 'queue', label: 'Hàng đợi tóm tắt' \}/);
  assert.match(source, /tab === 'queue' && <SummaryQueueTab \/>/);
});

test('summary queue filters articles by summary status and shows operational fields', () => {
  const source = readFileSync(resolve(__dirname, '../src/pages/Admin.tsx'), 'utf8');

  assert.match(source, /type SummaryQueueStatus = 'failed' \| 'pending' \| 'processing' \| 'skipped' \| 'done'/);
  assert.match(source, /api\.getArticles\(\{ page, limit: 50, status \}\)/);
  assert.match(source, /last_summary_error/);
  assert.match(source, /retry_count/);
  assert.match(source, /Tóm tắt lại/);
  assert.match(source, /Chạy tóm tắt/);
});

test('admin overview exposes forum observability labels', () => {
  const source = readFileSync(resolve(__dirname, '../src/pages/Admin.tsx'), 'utf8');

  assert.match(source, /Theo dõi forum Reddit\/VOZ/);
  assert.match(source, /Bỏ qua: ít comment/);
  assert.match(source, /Bỏ qua: ít comment hữu ích/);
  assert.match(source, /Lỗi fetch comment/);
  assert.match(source, /health\.forum\.totals24h/);
});
