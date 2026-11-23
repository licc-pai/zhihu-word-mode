const test = require('node:test');
const assert = require('node:assert/strict');
const { createWindow } = require('./helpers/load-userscript.cjs');

const ANSWER = `<!doctype html><html><head><title>测试回答 - 知乎</title>
<meta property="og:title" content="测试问题"></head><body><main>
<div class="QuestionHeader"><h1 class="QuestionHeader-title">测试问题</h1></div>
<div class="AnswerItem" data-zop='{"type":"answer","itemId":"123"}'>
  <div class="ContentItem-meta"><span class="AuthorInfo-name">作者</span></div>
  <div class="RichContent-inner"><div class="RichText ztext">${'回答正文。'.repeat(20)}</div></div>
</div>
</main></body></html>`;

test('zhihu answer comments still target the answer id', async () => {
  const calls = [];
  const fetch = async url => {
    calls.push(String(url));
    return { ok: true, json: async () => ({ data: [], paging: { is_end: true, totals: 0 } }) };
  };
  const { document } = createWindow({
    url: 'https://www.zhihu.com/question/1/answer/123',
    html: ANSWER,
    fetch
  });
  document.getElementById('zhihu-word-mode-launcher').click();
  await new Promise(resolve => setTimeout(resolve, 30));

  assert.ok(calls.some(url => url.includes('/api/v4/answers/123/comments')),
    'comment request should target answer 123, got: ' + calls.join('\n'));
});
