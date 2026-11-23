const test = require('node:test');
const assert = require('node:assert/strict');
const { createWindow } = require('./helpers/load-userscript.cjs');

const ARTICLE = `<!doctype html><html><head><title>测试文章 - 知乎</title>
<meta property="og:title" content="测试文章"></head><body><main><article class="Post">
<h1 class="Post-Title">测试文章</h1>
<div class="Post-RichTextContainer"><div class="RichText ztext">
${'这是一段足够长的正文内容。'.repeat(10)}</div></div></article></main></body></html>`;

function openArticle() {
  const ctx = createWindow({ url: 'https://zhuanlan.zhihu.com/p/999', html: ARTICLE });
  ctx.document.getElementById('zhihu-word-mode-launcher').click();
  const overlay = ctx.document.getElementById('zhihu-word-mode-overlay');
  return { ...ctx, overlay };
}

test('nav width defaults to 260px', () => {
  const { overlay } = openArticle();
  assert.equal(overlay.style.getPropertyValue('--zwm-nav-width'), '260px');
});

test('dragging the nav resizer updates and persists the width', () => {
  const { window, overlay } = openArticle();
  const resizer = overlay.querySelector('.zwm-nav-resizer');
  assert.ok(resizer, 'resizer should exist');

  resizer.dispatchEvent(new window.MouseEvent('pointerdown', { clientX: 260, bubbles: true }));
  window.dispatchEvent(new window.MouseEvent('pointermove', { clientX: 320, bubbles: true }));
  assert.equal(overlay.style.getPropertyValue('--zwm-nav-width'), '320px');
  window.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true }));

  const stored = JSON.parse(window.localStorage.getItem('zhihu-word-mode:settings') || '{}');
  assert.equal(stored.navWidth, 320);
});

test('nav width is clamped and double-click resets it', () => {
  const { window, overlay } = openArticle();
  const resizer = overlay.querySelector('.zwm-nav-resizer');

  resizer.dispatchEvent(new window.MouseEvent('pointerdown', { clientX: 260, bubbles: true }));
  window.dispatchEvent(new window.MouseEvent('pointermove', { clientX: 100, bubbles: true }));
  assert.equal(overlay.style.getPropertyValue('--zwm-nav-width'), '200px');
  window.dispatchEvent(new window.MouseEvent('pointermove', { clientX: 999, bubbles: true }));
  assert.equal(overlay.style.getPropertyValue('--zwm-nav-width'), '420px');
  window.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true }));

  resizer.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
  assert.equal(overlay.style.getPropertyValue('--zwm-nav-width'), '260px');
});

test('narrow screens ignore the resizer', () => {
  const ctx = createWindow({ url: 'https://zhuanlan.zhihu.com/p/999', html: ARTICLE });
  ctx.window.matchMedia = query => ({
    matches: true,
    media: query,
    addEventListener() {},
    removeEventListener() {}
  });
  ctx.document.getElementById('zhihu-word-mode-launcher').click();
  const overlay = ctx.document.getElementById('zhihu-word-mode-overlay');
  const resizer = overlay.querySelector('.zwm-nav-resizer');

  resizer.dispatchEvent(new ctx.window.MouseEvent('pointerdown', { clientX: 260, bubbles: true }));
  ctx.window.dispatchEvent(new ctx.window.MouseEvent('pointermove', { clientX: 320, bubbles: true }));
  assert.equal(overlay.style.getPropertyValue('--zwm-nav-width'), '260px');
});
