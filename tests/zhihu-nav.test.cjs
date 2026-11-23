const test = require('node:test');
const assert = require('node:assert/strict');
const { createWindow } = require('./helpers/load-userscript.cjs');

const QUESTION = `<!doctype html><html><head><title>测试问题 - 知乎</title>
<meta property="og:title" content="测试问题"></head><body><main>
<div class="QuestionHeader"><h1 class="QuestionHeader-title">测试问题</h1></div>
<div class="AnswerItem" data-zop='{"type":"answer","itemId":"1001"}'>
  <div class="ContentItem-meta"><span class="AuthorInfo-name">作者甲</span></div>
  <div class="RichContent-inner"><div class="RichText ztext">${'甲的回答。'.repeat(20)}</div></div>
</div>
<div class="AnswerItem" data-zop='{"type":"answer","itemId":"1002"}'>
  <div class="ContentItem-meta"><span class="AuthorInfo-name">作者乙</span></div>
  <div class="RichContent-inner"><div class="RichText ztext">${'乙的回答。'.repeat(20)}</div></div>
</div>
</main></body></html>`;

test('zhihu answer navigation still works after the shared nav changes', async () => {
  const { document } = createWindow({ url: 'https://www.zhihu.com/question/123', html: QUESTION });
  document.getElementById('zhihu-word-mode-launcher').click();
  const overlay = document.getElementById('zhihu-word-mode-overlay');
  const toggle = overlay.querySelector('.zwm-navtoggle');
  assert.ok(toggle && !toggle.hidden);
  toggle.click();
  assert.equal(overlay.querySelector('.zwm-nav').hidden, false);

  const items = [...overlay.querySelectorAll('.zwm-nav-item')];
  assert.equal(items.length, 2);
  items.find(item => item.dataset.answerKey === 'answer:1002').click();

  assert.match(overlay.querySelector('.zwm-article-content').textContent, /乙的回答/);
  assert.match(document.defaultView.location.pathname, /\/question\/123\/answer\/1002$/);
  assert.equal(overlay.querySelector('.zwm-nav').hidden, false);
});
