const test = require('node:test');
const assert = require('node:assert/strict');
const { createWindow } = require('./helpers/load-userscript.cjs');
const { makePage } = require('./fixtures/tianya.js');

const BASE = 'https://tianya.net/post-legend-11955258-';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function makeRouter(pages) {
  return async url => {
    const href = String(url);
    if (href.includes('/api/bbs_post')) {
      const page = Number(new URL(href, 'https://tianya.net').searchParams.get('page'));
      const payload = pages[page];
      if (!payload) return { ok: false, status: 403, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => payload };
    }
    if (href.includes('/api/bbs_list')) {
      return { ok: true, status: 200, json: async () => ({ status: 'success', boardName: '天涯荟萃' }) };
    }
    return { ok: true, status: 200, json: async () => ({ data: [], paging: { is_end: true, totals: 0 } }) };
  };
}

async function openThread(url, pages) {
  const { window, document } = createWindow({ url, html: '<body></body>', fetch: makeRouter(pages) });
  document.getElementById('zhihu-word-mode-launcher').click();
  await sleep(60);
  const overlay = document.getElementById('zhihu-word-mode-overlay');
  overlay.querySelector('.zwm-navtoggle').click();
  return { window, document, overlay };
}

test('only-poster visually hides non-poster TOC items', async () => {
  const page = makePage({
    page: 1,
    totalPages: 1,
    totalCount: 2,
    floors: [
      { pid: 1, author: '揭育润', content: '楼主一楼。' },
      { pid: 2, author: '路人甲', content: '路人二楼。' }
    ]
  });
  const { window, overlay } = await openThread(BASE + '1.html', { 1: page });
  const filter = overlay.querySelector('.zwm-tianya-only-poster');
  filter.checked = true;
  filter.dispatchEvent(new window.Event('change', { bubbles: true }));

  const item = overlay.querySelector('.zwm-tianya-toc-item[data-pid="2"]');
  assert.equal(item.hidden, true);
  assert.equal(window.getComputedStyle(item).display, 'none');
});

test('deleted floor TOC excerpt does not leak hidden content', async () => {
  const page = makePage({
    page: 1,
    totalPages: 1,
    totalCount: 2,
    floors: [
      { pid: 1, content: '敏感正文。', deleted: true },
      { pid: 2, content: '正常二楼。' }
    ]
  });
  const { overlay } = await openThread(BASE + '1.html', { 1: page });
  const item = overlay.querySelector('.zwm-tianya-toc-item[data-pid="1"]');
  assert.match(item.textContent, /该楼层已被删除/);
  assert.doesNotMatch(item.textContent, /敏感正文/);
});

test('loaded follow-up floors are observed for TOC highlighting', async () => {
  const page1 = makePage({ page: 1, totalPages: 2, totalCount: 3, floors: [{ pid: 1 }, { pid: 2 }] });
  const page2 = makePage({ page: 2, totalPages: 2, totalCount: 3, floors: [{ pid: 3 }] });
  const ctx = createWindow({
    url: BASE + '1.html',
    html: '<body></body>',
    fetch: makeRouter({ 1: page1, 2: page2 })
  });
  const observed = [];
  ctx.window.IntersectionObserver = class {
    constructor() { this.targets = observed; ctx.window.__observer = this; }
    observe(el) { this.targets.push(el.id); }
    disconnect() {}
  };
  ctx.document.getElementById('zhihu-word-mode-launcher').click();
  await sleep(60);
  const overlay = ctx.document.getElementById('zhihu-word-mode-overlay');
  overlay.querySelector('.zwm-navtoggle').click();
  overlay.querySelector('.zwm-nav-load').click();
  await sleep(60);
  assert.ok(observed.includes('floor-3'), 'new floor should be observed: ' + observed.join(','));
});

test('leaving a thread removes the launcher and Alt+W on a board page does nothing', async () => {
  const page = makePage({ page: 1, totalPages: 1, totalCount: 1, floors: [{ pid: 1 }] });
  const { window, document } = createWindow({
    url: BASE + '1.html',
    html: '<body></body>',
    fetch: makeRouter({ 1: page })
  });
  document.getElementById('zhihu-word-mode-launcher').click();
  await sleep(60);
  window.history.pushState({}, '', '/board-legend-default-1.html');
  await sleep(300);
  assert.equal(document.getElementById('zhihu-word-mode-launcher'), null);

  const board = createWindow({ url: 'https://tianya.net/board-legend-default-1.html', html: '<body></body>' });
  let alerts = 0;
  board.window.alert = () => { alerts += 1; };
  board.document.dispatchEvent(new board.window.KeyboardEvent('keydown', {
    key: 'w',
    altKey: true,
    bubbles: true
  }));
  assert.equal(alerts, 0);
  assert.equal(board.document.getElementById('zhihu-word-mode-overlay'), null);
});

test('empty replies show a note and do not expose an inert TOC toggle', async () => {
  const page = makePage({ page: 1, totalPages: 1, totalCount: 0, floors: [] });
  const { document } = createWindow({ url: BASE + '1.html', html: '<body></body>', fetch: makeRouter({ 1: page }) });
  document.getElementById('zhihu-word-mode-launcher').click();
  await sleep(60);
  const overlay = document.getElementById('zhihu-word-mode-overlay');
  assert.match(overlay.querySelector('.zwm-article-content').textContent, /暂无回复/);
  assert.equal(overlay.querySelector('.zwm-navtoggle').hidden, true);
});
