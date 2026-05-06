import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadTsModule(relativePath, stubs = {}) {
  const source = readFileSync(resolve(__dirname, relativePath), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const moduleContext = { exports: {} };
  vm.runInNewContext(outputText, {
    URL,
    exports: moduleContext.exports,
    module: moduleContext,
    require: (name) => {
      if (stubs[name]) return stubs[name];
      throw new Error(`Unexpected require ${name}`);
    },
  });
  return moduleContext.exports;
}

test('forum discussion threshold requires at least 10 replies by default', () => {
  const { hasMinimumForumDiscussion } = loadTsModule('../src/services/fetchers/forum-utils.ts', {
    cheerio: { load: () => ({}) },
    '../../lib/utils.js': { normalizePublicHttpUrl: (value) => value },
  });

  assert.equal(hasMinimumForumDiscussion(9), false);
  assert.equal(hasMinimumForumDiscussion(10), true);
  assert.equal(hasMinimumForumDiscussion(11), true);
});

test('forum discussion threshold can be overridden for tests and config', () => {
  const { hasMinimumForumDiscussion } = loadTsModule('../src/services/fetchers/forum-utils.ts', {
    cheerio: { load: () => ({}) },
    '../../lib/utils.js': { normalizePublicHttpUrl: (value) => value },
  });

  assert.equal(hasMinimumForumDiscussion(4, 5), false);
  assert.equal(hasMinimumForumDiscussion(5, 5), true);
});

test('forum insert policy applies minimum discussion to Reddit and VOZ', () => {
  const { shouldInsertForumArticle } = loadTsModule('../src/services/fetchers/forum-utils.ts', {
    cheerio: { load: () => ({}) },
    '../../lib/utils.js': { normalizePublicHttpUrl: (value) => value },
  });
  const usefulComments = [
    { body: 'Mình đã triển khai cách này ở công ty và thấy chi phí giảm rõ sau vài tuần.', reactions: 1, page: 1, order: 1, score: 1 },
    { body: 'Điểm quan trọng là phải đo latency thực tế trước khi kết luận kiến trúc này tốt.', reactions: 2, page: 1, order: 2, score: 1 },
    { body: 'Nếu team nhỏ thì giải pháp đơn giản hơn có thể dễ vận hành và ít lỗi hơn nhiều.', reactions: 3, page: 1, order: 3, score: 1 },
  ];

  assert.equal(shouldInsertForumArticle('voz', 9, 10, usefulComments), false);
  assert.equal(shouldInsertForumArticle('voz', 10, 10, usefulComments), true);
  assert.equal(shouldInsertForumArticle('reddit', 4, 5, usefulComments), false);
  assert.equal(shouldInsertForumArticle('reddit', 5, 5, usefulComments), true);
  assert.equal(shouldInsertForumArticle('reddit', 12, 5, usefulComments.slice(0, 2)), false);
});

test('forum comment selector removes noisy short duplicate replies', () => {
  const { isUsefulForumComment, selectForumComments } = loadTsModule('../src/services/fetchers/forum-utils.ts', {
    cheerio: { load: () => ({}) },
    '../../lib/utils.js': { normalizePublicHttpUrl: (value) => value },
  });

  assert.equal(isUsefulForumComment('lol'), false);
  assert.equal(isUsefulForumComment('+1'), false);
  assert.equal(isUsefulForumComment('Mình dùng thử rồi, phần khó nhất là vận hành lâu dài chứ không phải setup ban đầu.'), true);

  const comments = [
    { author: 'a', body: 'lol', reactions: 10, page: 1, order: 1, score: 10 },
    { author: 'b', body: 'Mình dùng thử rồi, phần khó nhất là vận hành lâu dài chứ không phải setup ban đầu.', reactions: 1, page: 1, order: 2, score: 2 },
    { author: 'c', body: 'Mình dùng thử rồi phần khó nhất là vận hành lâu dài chứ không phải setup ban đầu', reactions: 5, page: 1, order: 3, score: 4 },
    { author: 'd', body: 'Một điểm khác là chi phí monitoring và log sẽ tăng nếu traffic biến động mạnh.', reactions: 3, page: 1, order: 4, score: 3 },
  ];

  const selected = selectForumComments(comments, 10);
  assert.equal(selected.length, 2);
  assert.deepEqual(selected.map((comment) => comment.author), ['b', 'd']);
});

