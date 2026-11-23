const test = require('node:test');
const assert = require('node:assert/strict');
const { createWindow } = require('./helpers/load-userscript.cjs');
const { makePage } = require('./fixtures/tianya.js');

const BASE = 'https://tianya.net/post-legend-11955258-';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function makeRouter(pages, { delays = {} } = {}) {
  const calls = [];
  const fetch = async url => {
    const href = String(url);
    calls.push(href);
    if (href.includes('/api/bbs_post')) {
      const page = Number(new URL(href, 'https://tianya.net').searchParams.get('page'));
      if (delays[page]) await sleep(delays[page]);
      const payload = pages[page];
      if (!payload) return { ok: false, status: 403, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => payload };
    }
    if (href.includes('/api/bbs_list')) {
      return { ok: true, status: 200, json: async () => ({ status: 'success', boardName: '天涯荟萃' }) };
    }
    return { ok: true, status: 200, json: async () => ({ data: [], paging: { is_end: true, totals: 0 } }) };
  };
  return { fetch, calls };
}

async function openThread(url, fetch, { nav = true } = {}) {
  const { window, document } = createWindow({ url, html: '<body></body>', fetch });
  document.getElementById('zhihu-word-mode-launcher').click();
  await sleep(60);
  const overlay = document.getElementById('zhihu-word-mode-overlay');
  if (nav) overlay.querySelector('.zwm-navtoggle').click();
  return { window, document, overlay };
}

function postCalls(calls) {
  return calls.filter(url => url.includes('/api/bbs_post'));
}

test('load more button appends the next page', async () => {
  const page1 = makePage({ page: 1, totalPages: 2, totalCount: 3, floors: [{ pid: 1, content: '一楼。' }, { pid: 2, content: '二楼。' }] });
  const page2 = makePage({ page: 2, totalPages: 2, totalCount: 3, floors: [{ pid: 3, content: '三楼。' }] });
  const { fetch, calls } = makeRouter({ 1: page1, 2: page2 });
  const { document, overlay } = await openThread(BASE + '1.html', fetch);

  const foot = overlay.querySelector('.zwm-nav-foot');
  assert.equal(foot.hidden, false, 'footer should be visible');
  const button = overlay.querySelector('.zwm-nav-load');
  assert.match(overlay.querySelector('.zwm-nav-status').textContent, /2 \/ 3/);

  button.click();
  await sleep(50);
  assert.equal(document.querySelectorAll('.zwm-tianya-floor:not(.zwm-tianya-main)').length, 3);
  assert.match(overlay.querySelector('.zwm-nav-status').textContent, /已加载全部 3/);
  assert.equal(button.hidden, true);
  assert.equal(postCalls(calls).length, 2);
});

test('scroll auto-load loads one page per gesture', async () => {
  const page1 = makePage({ page: 1, totalPages: 3, totalCount: 53, floors: [{ pid: 1, content: '一楼。' }, { pid: 2, content: '二楼。' }] });
  const page2 = makePage({
    page: 2,
    totalPages: 3,
    totalCount: 53,
    floors: Array.from({ length: 50 }, (_, index) => ({ pid: 3 + index, content: `第 ${3 + index} 楼。` }))
  });
  const page3 = makePage({ page: 3, totalPages: 3, totalCount: 53, floors: [{ pid: 53, content: '最后一楼。' }] });
  const { fetch, calls } = makeRouter({ 1: page1, 2: page2, 3: page3 });
  const { window, document, overlay } = await openThread(BASE + '1.html', fetch);

  const docscroll = overlay.querySelector('.zwm-docscroll');
  Object.defineProperty(docscroll, 'scrollHeight', { value: 1000, configurable: true });
  Object.defineProperty(docscroll, 'clientHeight', { value: 200, configurable: true });
  docscroll.scrollTop = 800;
  docscroll.dispatchEvent(new window.Event('scroll'));
  await sleep(50);
  assert.equal(postCalls(calls).filter(url => url.includes('page=2')).length, 1);

  docscroll.dispatchEvent(new window.Event('scroll'));
  await sleep(30);
  assert.equal(postCalls(calls).filter(url => url.includes('page=3')).length, 0, 'same gesture must not chain');

  docscroll.scrollTop = 0;
  docscroll.dispatchEvent(new window.Event('scroll'));
  docscroll.scrollTop = 800;
  docscroll.dispatchEvent(new window.Event('scroll'));
  await sleep(50);
  assert.equal(postCalls(calls).filter(url => url.includes('page=3')).length, 1);
  assert.equal(document.querySelectorAll('.zwm-tianya-floor:not(.zwm-tianya-main)').length, 53);
});

test('duplicate floor ids are not rendered twice', async () => {
  const page1 = makePage({ page: 1, totalPages: 2, totalCount: 3, floors: [{ pid: 1, content: '一楼。' }, { pid: 2, content: '二楼。' }] });
  const page2 = makePage({ page: 2, totalPages: 2, totalCount: 3, floors: [{ pid: 2, content: '重复二楼。' }, { pid: 3, content: '三楼。' }] });
  const { fetch } = makeRouter({ 1: page1, 2: page2 });
  const { document, overlay } = await openThread(BASE + '1.html', fetch);

  overlay.querySelector('.zwm-nav-load').click();
  await sleep(50);
  assert.equal(document.querySelectorAll('.zwm-tianya-floor:not(.zwm-tianya-main)').length, 3);
  assert.equal(document.querySelectorAll('#zwm-floor-2').length, 1);
  assert.equal(overlay.querySelectorAll('.zwm-tianya-toc-item[data-pid="2"]').length, 1);
});

test('a failed next page keeps loaded floors and can be retried', async () => {
  const page1 = makePage({ page: 1, totalPages: 2, totalCount: 3, floors: [{ pid: 1, content: '一楼。' }, { pid: 2, content: '二楼。' }] });
  const page2 = makePage({ page: 2, totalPages: 2, totalCount: 3, floors: [{ pid: 3, content: '三楼。' }] });
  const pages = { 1: page1 };
  const { fetch } = makeRouter(pages);
  const { document, overlay } = await openThread(BASE + '1.html', fetch);
  const button = overlay.querySelector('.zwm-nav-load');

  button.click();
  await sleep(50);
  assert.match(overlay.querySelector('.zwm-nav-status').textContent, /接口不可用/);
  assert.equal(document.querySelectorAll('.zwm-tianya-floor:not(.zwm-tianya-main)').length, 2);
  assert.equal(button.textContent, '重试');

  pages[2] = page2;
  button.click();
  await sleep(50);
  assert.equal(document.querySelectorAll('.zwm-tianya-floor:not(.zwm-tianya-main)').length, 3);
  assert.match(overlay.querySelector('.zwm-nav-status').textContent, /已加载全部 3/);
});

test('entry page 2 starts from page 2 and never requests page 1', async () => {
  const page2 = makePage({ page: 2, totalPages: 2, totalCount: 3, floors: [{ pid: 3, content: '三楼。' }] });
  const { fetch, calls } = makeRouter({ 2: page2 });
  const { overlay } = await openThread(BASE + '2.html', fetch);

  assert.match(overlay.querySelector('.zwm-article-content').textContent, /三楼。/);
  const posts = postCalls(calls);
  assert.ok(posts.every(url => url.includes('page=2')), posts.join('\n'));
  assert.equal(posts.filter(url => url.includes('page=1')).length, 0);
});

test('a short page ends pagination even when totalPages is stale', async () => {
  const page1 = makePage({ page: 1, totalPages: 5, totalCount: 100, floors: [{ pid: 1 }, { pid: 2 }] });
  const page2 = makePage({
    page: 2,
    totalPages: 5,
    totalCount: 100,
    floors: Array.from({ length: 10 }, (_, index) => ({ pid: 3 + index }))
  });
  const { fetch } = makeRouter({ 1: page1, 2: page2 });
  const { overlay } = await openThread(BASE + '1.html', fetch);
  const button = overlay.querySelector('.zwm-nav-load');

  button.click();
  await sleep(50);
  assert.equal(button.hidden, true);
  assert.match(overlay.querySelector('.zwm-nav-status').textContent, /已加载全部/);
});

test('string pagination page numbers do not break the next request', async () => {
  const page1 = makePage({ page: 1, totalPages: 3, totalCount: 52, floors: [{ pid: 1 }] });
  const page2 = makePage({
    page: 2,
    totalPages: 3,
    totalCount: 52,
    floors: Array.from({ length: 50 }, (_, index) => ({ pid: 2 + index }))
  });
  page2.replies.pagination.currentPage = '2';
  const page3 = makePage({ page: 3, totalPages: 3, totalCount: 52, floors: [{ pid: 52 }] });
  const { fetch, calls } = makeRouter({ 1: page1, 2: page2, 3: page3 });
  const { document, overlay } = await openThread(BASE + '1.html', fetch);
  const button = overlay.querySelector('.zwm-nav-load');

  button.click();
  await sleep(50);
  button.click();
  await sleep(50);

  assert.equal(document.querySelectorAll('.zwm-tianya-floor:not(.zwm-tianya-main)').length, 52);
  assert.equal(postCalls(calls).filter(url => url.includes('page=3')).length, 1);
});

test('closing aborts a pending load and does not append its result', async () => {
  const page1 = makePage({ page: 1, totalPages: 2, totalCount: 3, floors: [{ pid: 1, content: '一楼。' }, { pid: 2, content: '二楼。' }] });
  const page2 = makePage({ page: 2, totalPages: 2, totalCount: 3, floors: [{ pid: 3, content: '三楼。' }] });
  const { fetch, calls } = makeRouter({ 1: page1, 2: page2 }, { delays: { 2: 100 } });
  const { document, overlay } = await openThread(BASE + '1.html', fetch);

  overlay.querySelector('.zwm-nav-load').click();
  overlay.querySelector('[data-action="close"]').click();
  await sleep(160);

  assert.equal(overlay.classList.contains('zhihu-word-mode-visible'), false);
  assert.equal(document.querySelectorAll('.zwm-tianya-floor:not(.zwm-tianya-main)').length, 2);
  assert.equal(postCalls(calls).filter(url => url.includes('page=2')).length, 1);
});
