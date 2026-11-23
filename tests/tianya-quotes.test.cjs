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

test('tianya quotes, sub-floors and deleted floors render', async () => {
  const post = makePage({
    floors: [
      { pid: 1, author: '路人甲', content: '被引用的内容。' },
      { pid: 2, author: '路人乙', content: '回复内容。', quotePid: 1 },
      { pid: 3, author: '路人丙', content: '引用未加载。', quotePid: 999 },
      { pid: 4, author: '路人丁', content: '不应出现。', deleted: true }
    ]
  });
  const { document } = createWindow({ url: THREAD_URL, html: '<body></body>', fetch: makeFetch(post) });
  document.getElementById('zhihu-word-mode-launcher').click();
  await sleep(60);

  const floor2 = document.getElementById('floor-2');
  assert.ok(floor2, 'quoted floor should exist');
  assert.equal(floor2.dataset.sub, '1');
  const quote = floor2.querySelector('.zwm-quote');
  assert.ok(quote, 'quote block should render');
  assert.match(quote.textContent, /路人甲/);
  assert.match(quote.textContent, /被引用的内容/);
  assert.equal(quote.classList.contains('zwm-expanded'), false);
  quote.click();
  assert.ok(quote.classList.contains('zwm-expanded'));

  const floor3 = document.getElementById('floor-3');
  assert.match(floor3.textContent, /引用 #999（未加载）/);

  const floor4 = document.getElementById('floor-4');
  assert.match(floor4.textContent, /该楼层已被删除/);
  assert.doesNotMatch(floor4.textContent, /不应出现/);
});
