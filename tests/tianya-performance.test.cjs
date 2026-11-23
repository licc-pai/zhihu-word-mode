const test = require('node:test');
const assert = require('node:assert/strict');
const { createWindow } = require('./helpers/load-userscript.cjs');
const { makePage } = require('./fixtures/tianya.js');

const BASE = 'https://tianya.net/post-legend-11955258-';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function makeRouter() {
  return async url => {
    const href = String(url);
    if (href.includes('/api/bbs_post')) {
      const page = Number(new URL(href, 'https://tianya.net').searchParams.get('page'));
      const floors = Array.from({ length: 50 }, (_, index) => {
        const pid = (page - 1) * 50 + index + 1;
        return {
          pid,
          author: pid % 2 === 0 ? '揭育润' : '路人',
          content: `第 ${pid} 楼正文。`
        };
      });
      return {
        ok: true,
        status: 200,
        json: async () => makePage({ page, totalPages: 40, totalCount: 2000, floors })
      };
    }
    if (href.includes('/api/bbs_list')) {
      return { ok: true, status: 200, json: async () => ({ status: 'success', boardName: '天涯荟萃' }) };
    }
    return { ok: true, status: 200, json: async () => ({ data: [], paging: { is_end: true, totals: 0 } }) };
  };
}

test('2000-floor thread can be loaded and filtered', { timeout: 30000 }, async () => {
  const { window, document } = createWindow({
    url: BASE + '1.html',
    html: '<body></body>',
    fetch: makeRouter()
  });
  document.getElementById('zhihu-word-mode-launcher').click();
  await sleep(80);
  const overlay = document.getElementById('zhihu-word-mode-overlay');
  overlay.querySelector('.zwm-navtoggle').click();
  const button = overlay.querySelector('.zwm-nav-load');
  const floorCount = () => document.querySelectorAll('.zwm-tianya-floor:not(.zwm-tianya-main)').length;

  for (let page = 2; page <= 40; page++) {
    const expected = page * 50;
    button.click();
    const start = Date.now();
    while (floorCount() < expected && Date.now() - start < 3000) {
      await sleep(10);
    }
    assert.ok(floorCount() >= expected, `page ${page} did not load`);
  }

  assert.equal(floorCount(), 2000);
  assert.equal(overlay.querySelectorAll('.zwm-tianya-toc-item').length, 2001);

  const filter = overlay.querySelector('.zwm-tianya-only-poster');
  filter.checked = true;
  filter.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(document.querySelectorAll('.zwm-tianya-floor:not([hidden]):not(.zwm-tianya-main)').length, 1000);
  assert.equal(overlay.querySelectorAll('.zwm-tianya-toc-item:not([hidden])').length, 1001);
});
