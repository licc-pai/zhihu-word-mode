const test = require('node:test');
const assert = require('node:assert/strict');
const { createWindow } = require('./helpers/load-userscript.cjs');
const { makePage } = require('./fixtures/tianya.js');

const THREAD_URL = 'https://tianya.net/post-legend-11955258-1.html';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function makeFetch(post) {
  return async url => {
    const href = String(url);
    if (href.includes('/api/bbs_post')) return { ok: true, status: 200, json: async () => post };
    if (href.includes('/api/bbs_list')) {
      return { ok: true, status: 200, json: async () => ({ status: 'success', boardName: '天涯荟萃' }) };
    }
    return { ok: true, status: 200, json: async () => ({ data: [], paging: { is_end: true, totals: 0 } }) };
  };
}

test('tianya floor toc and only-poster filter', async () => {
  const post = makePage({
    floors: [
      { pid: 1, author: '揭育润', content: '楼主一楼。' },
      { pid: 2, author: '路人甲', content: '路人二楼。' },
      { pid: 3, author: '揭育润', content: '楼主回复。', quotePid: 2 },
      { pid: 4, author: '路人乙', content: '路人四楼。' }
    ]
  });
  const { window, document } = createWindow({ url: THREAD_URL, html: '<body></body>', fetch: makeFetch(post) });
  document.getElementById('zhihu-word-mode-launcher').click();
  await sleep(60);

  const overlay = document.getElementById('zhihu-word-mode-overlay');
  const toggle = overlay.querySelector('.zwm-navtoggle');
  assert.ok(toggle && !toggle.hidden, 'floor toc toggle should be visible');
  toggle.click();
  const nav = overlay.querySelector('.zwm-nav');
  assert.equal(nav.hidden, false);

  const items = [...nav.querySelectorAll('.zwm-tianya-toc-item')];
  assert.equal(items.length, 4, 'toc should contain main post + 3 top-level floors');
  assert.equal(items.filter(item => item.dataset.pid === '3').length, 0, 'sub-floor should not be in toc');

  const floor2 = document.getElementById('zwm-floor-2');
  let scrolled = false;
  floor2.scrollIntoView = () => { scrolled = true; };
  items.find(item => item.dataset.pid === '2').click();
  assert.ok(scrolled, 'toc click should scroll to the floor');

  const filter = overlay.querySelector('.zwm-tianya-only-poster');
  assert.ok(filter, 'only-poster filter should exist');
  filter.checked = true;
  filter.dispatchEvent(new window.Event('change', { bubbles: true }));

  assert.equal(document.getElementById('zwm-floor-2').hidden, true);
  assert.equal(document.getElementById('zwm-floor-4').hidden, true);
  assert.equal(document.getElementById('zwm-floor-1').hidden, false);
  const floor3 = document.getElementById('zwm-floor-3');
  assert.equal(floor3.hidden, false, 'poster sub-floor should stay visible');
  const quote = floor3.querySelector('.zwm-quote');
  assert.ok(quote, 'quote stays inside the visible poster floor');
  assert.match(quote.textContent, /路人甲/);
  assert.match(quote.textContent, /路人二楼/);
  assert.equal(items.find(item => item.dataset.pid === '2').hidden, true);
  assert.equal(items.find(item => item.dataset.pid === '1').hidden, false);

  filter.checked = false;
  filter.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(document.getElementById('zwm-floor-2').hidden, false);
});
