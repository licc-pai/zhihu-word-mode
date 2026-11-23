const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const SCRIPT = fs.readFileSync(path.join(__dirname, '..', '..', 'zhihu-word-mode.user.js'), 'utf8');

const RECT = {
  top: 0,
  bottom: 100,
  height: 100,
  width: 600,
  left: 0,
  right: 600,
  x: 0,
  y: 0
};

function createWindow({ url, html, fetch: fetchImpl }) {
  const dom = new JSDOM(html, {
    url,
    runScripts: 'dangerously',
    pretendToBeVisual: true
  });
  const { window } = dom;
  Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
  window.HTMLElement.prototype.getClientRects = function () {
    return [RECT];
  };
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    return RECT;
  };
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.matchMedia = query => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {}
  });
  window.fetch = fetchImpl || (async () => ({
    ok: true,
    json: async () => ({ data: [], paging: { is_end: true, totals: 0 } })
  }));
  window.eval(SCRIPT);
  return { window, document: window.document };
}

module.exports = { createWindow, SCRIPT };
