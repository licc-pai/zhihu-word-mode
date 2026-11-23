const test = require('node:test');
const assert = require('node:assert/strict');
const { createWindow } = require('./helpers/load-userscript.cjs');
const { makePage } = require('./fixtures/tianya.js');

const THREAD_URL = 'https://tianya.net/post-legend-11955258-1.html';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function makeFetch({ post, board = { status: 'success', boardName: '天涯荟萃' }, postStatus = 200 } = {}) {
  return async url => {
    const href = String(url);
    if (href.includes('/api/bbs_post')) {
      if (postStatus !== 200) return { ok: false, status: postStatus, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => post };
    }
    if (href.includes('/api/bbs_list')) {
      if (!board) return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => board };
    }
    return { ok: true, status: 200, json: async () => ({ data: [], paging: { is_end: true, totals: 0 } }) };
  };
}

async function open(document) {
  document.getElementById('zhihu-word-mode-launcher').click();
  await sleep(60);
  return document.getElementById('zhihu-word-mode-overlay');
}

test('tianya thread renders title, meta, main post and floors', async () => {
  const post = makePage({
    floors: [{ content: '第一楼正文。' }, { content: '第二楼正文。' }]
  });
  const { document } = createWindow({ url: THREAD_URL, html: '<body></body>', fetch: makeFetch({ post }) });
  const overlay = await open(document);

  assert.ok(overlay.classList.contains('zhihu-word-mode-visible'));
  assert.equal(overlay.querySelector('.zwm-document-title').textContent, '赌坛风云');
  const meta = overlay.querySelector('.zwm-document-meta').textContent;
  assert.match(meta, /天涯荟萃/);
  assert.match(meta, /揭育润/);
  assert.match(meta, /2011-1-2/);

  const content = overlay.querySelector('.zwm-article-content');
  assert.match(content.textContent, /楼主正文。/);
  assert.match(content.textContent, /第一楼正文。/);
  assert.equal(content.querySelectorAll('.zwm-tianya-floor:not(.zwm-tianya-main)').length, 2);
  assert.equal(overlay.querySelector('.zwm-comments'), null);
});

test('tianya text is escaped and http links are linkified', async () => {
  const content = '第一段 <script>alert(1)</script>\n\n第二段 https://example.com/a?b=1。\n<img src=x onerror="alert(2)">';
  const post = makePage({ post: { content }, floors: [{ content }] });
  const { document } = createWindow({ url: THREAD_URL, html: '<body></body>', fetch: makeFetch({ post }) });
  const overlay = await open(document);
  const article = overlay.querySelector('.zwm-article-content');

  assert.equal(article.querySelector('script'), null);
  assert.equal(article.querySelector('[onerror]'), null);
  assert.match(article.textContent, /<script>alert\(1\)<\/script>/);
  const link = article.querySelector('a[href="https://example.com/a?b=1"]');
  assert.ok(link, 'safe URL should become a link');
  assert.equal(link.textContent, 'https://example.com/a?b=1');
  assert.match(article.textContent, /https:\/\/example\.com\/a\?b=1。/);
});

test('tianya not_found shows an error with retry', async () => {
  const { document } = createWindow({
    url: THREAD_URL,
    html: '<body></body>',
    fetch: makeFetch({ post: { status: 'not_found' } })
  });
  const overlay = await open(document);
  assert.match(overlay.textContent, /帖子不存在或已删除/);
  assert.ok(overlay.querySelector('.zwm-tianya-retry'));
});

test('tianya http error shows a retryable message', async () => {
  const { document } = createWindow({
    url: THREAD_URL,
    html: '<body></body>',
    fetch: makeFetch({ post: makePage(), postStatus: 403 })
  });
  const overlay = await open(document);
  assert.match(overlay.textContent, /接口不可用/);
  assert.ok(overlay.querySelector('.zwm-tianya-retry'));
});

test('tianya board name falls back to the board alias', async () => {
  const { document } = createWindow({
    url: THREAD_URL,
    html: '<body></body>',
    fetch: makeFetch({ post: makePage(), board: null })
  });
  const overlay = await open(document);
  assert.match(overlay.querySelector('.zwm-document-meta').textContent, /legend/);
});
