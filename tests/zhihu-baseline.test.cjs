const test = require('node:test');
const assert = require('node:assert/strict');
const { createWindow } = require('./helpers/load-userscript.cjs');

const ARTICLE = `<!doctype html><html><head><title>测试文章 - 知乎</title>
<meta property="og:title" content="测试文章"></head><body><main><article class="Post">
<h1 class="Post-Title">测试文章</h1>
<div class="Post-RichTextContainer"><div class="RichText ztext">
<p style="line-height:3;color:#c00">${'这是一段足够长的正文内容。'.repeat(10)}</p>
</div></div></article></main></body></html>`;

test('zhihu article opens the word overlay', () => {
  const { document } = createWindow({ url: 'https://zhuanlan.zhihu.com/p/999', html: ARTICLE });
  document.getElementById('zhihu-word-mode-launcher').click();
  const overlay = document.getElementById('zhihu-word-mode-overlay');
  assert.ok(overlay.classList.contains('zhihu-word-mode-visible'));
  assert.match(overlay.querySelector('.zwm-article-content').textContent, /这是一段足够长的正文内容/);
});

test('inline line-height is stripped from zhihu content', () => {
  const { document } = createWindow({ url: 'https://zhuanlan.zhihu.com/p/999', html: ARTICLE });
  document.getElementById('zhihu-word-mode-launcher').click();
  const p = document.querySelector('#zhihu-word-mode-overlay .zwm-article-content p');
  assert.equal(p.style.lineHeight, '');
  assert.notEqual(p.style.color, '');
});
