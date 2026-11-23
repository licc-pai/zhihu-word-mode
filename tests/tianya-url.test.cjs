const test = require('node:test');
const assert = require('node:assert/strict');
const { createWindow } = require('./helpers/load-userscript.cjs');

test('tianya thread url exposes the launcher', () => {
  const { document } = createWindow({
    url: 'https://tianya.net/post-legend-11955258-1.html',
    html: '<body></body>'
  });
  assert.ok(document.getElementById('zhihu-word-mode-launcher'));
});

test('tianya board page does not expose the launcher', () => {
  const { document } = createWindow({
    url: 'https://tianya.net/board-legend-default-1.html',
    html: '<body></body>'
  });
  assert.equal(document.getElementById('zhihu-word-mode-launcher'), null);
});

test('zhihu article still exposes the launcher', () => {
  const { document } = createWindow({
    url: 'https://zhuanlan.zhihu.com/p/999',
    html: '<body></body>'
  });
  assert.ok(document.getElementById('zhihu-word-mode-launcher'));
});
