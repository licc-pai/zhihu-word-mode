# 天涯整帖阅读实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有「知乎 Word 文档模式」userscript 中加入天涯帖子页的整栋楼连续阅读，复用 Word 外壳、设置和打印，不改变知乎行为。

**Architecture:** 单文件 userscript 内做轻量站点分支：新增天涯 URL 识别、接口拉取和独立渲染器；共享 Overlay、CSS、设置和目录。天涯不走知乎的正文识别、回答导航、评论接口。

**Tech Stack:** 原生 JavaScript（IIFE userscript，无运行时依赖）；开发测试用 Node + jsdom；发布仍用现有 Python 构建脚本。

**Spec:** `docs/superpowers/specs/2026-11-23-tianya-thread-reader-design.md`

## Global Constraints

- 生产代码只改 `zhihu-word-mode.user.js`，保持单文件、`@grant none`、无运行时依赖。
- 知乎文章/回答/问题页行为不能回归；涉及共享代码的任务必须跑知乎回归用例。
- 天涯正文按不可信纯文本处理：只做转义、分段和 http(s) linkify，禁止把接口内容直接 `innerHTML`。
- 天涯不渲染文末评论区；楼层就是正文。
- 首版不渲染图片；样例含图片时按文本/链接处理，不新增图片域规则。
- 性能目标约 2000 楼；不做虚拟滚动/目录窗口化。
- 脚本名保持「知乎 Word 文档模式」；`@description` 增加天涯；仓库名不变。
- 测试放在仓库 `tests/`，dev-only `package.json`（唯一依赖 jsdom），`npm test` 运行；不进入发布构建。
- 提交信息用简体中文；不写裸 URL。
- 入口页 >1 只向后加载；一次滚动手势只自动加载一页。

## Review Focus

- **API 返回 200 但 `status:not_found` / `threadDeleted` / 空数据 / 结构异常**：必须显示明确错误或占位，不能是空白文档。测试放在 Task 3。
- **正文包含 `<script>`、`onerror`、超长不换行 URL**：必须按文本显示、不执行、不撑破页面。测试放在 Task 3。
- **只看楼主 + 引用/子楼层**：引用块保留，非楼主楼层隐藏，目录和计数一致。测试放在 Task 4/5。
- **快速滚动加载、关闭文档模式、路由变化**：不能重复请求、不能把旧响应写进新文档、不能双页加载。测试放在 Task 6。
- **入口页 >1、引用楼层未加载、删除楼层**：只向后加载；引用显示“未加载”；删除显示占位。测试放在 Task 4/6。

---

### Task 1: 仓库内测试基座 + 知乎基线

**Files:**
- Create: `package.json`
- Create: `tests/helpers/load-userscript.cjs`
- Create: `tests/zhihu-baseline.test.cjs`

**Interfaces:**
- Produces: `createWindow({ url, html, fetch }) -> { window, document }`；`SCRIPT` 为用户脚本源码；后续所有测试复用。

- [ ] **Step 1: 写失败的基线测试**

`tests/zhihu-baseline.test.cjs`：
```js
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
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `node --test tests/zhihu-baseline.test.cjs`
Expected: FAIL，提示找不到 `jsdom` 或 `tests/helpers/load-userscript.cjs`。

- [ ] **Step 3: 添加 package.json 和测试 helper**

`package.json`：
```json
{
  "name": "zhihu-word-mode-tests",
  "private": true,
  "scripts": { "test": "node --test tests/*.test.cjs" },
  "devDependencies": { "jsdom": "^24.0.0" },
  "engines": { "node": ">=20" }
}
```

`tests/helpers/load-userscript.cjs` 要点：
- 读 `../../zhihu-word-mode.user.js`。
- `new JSDOM(html, { url, runScripts: 'dangerously', pretendToBeVisual: true })`。
- 覆盖 `innerHeight=768`、`getClientRects`/`getBoundingClientRect` 返回固定可视矩形、`matchMedia` 返回 `{ matches:false }`、`scrollIntoView` 空实现。
- 默认 `fetch` 返回 `{ ok:true, json: async()=>({ data:[], paging:{ is_end:true, totals:0 } }) }`。
- `window.eval(SCRIPT)` 后返回 `{ window, document }`。

- [ ] **Step 4: 运行测试，确认通过**

Run: `npm install && npm test`
Expected: PASS，2 个用例通过。

- [ ] **Step 5: 提交**

```bash
git add package.json package-lock.json tests/helpers/load-userscript.cjs tests/zhihu-baseline.test.cjs
git commit -m "test: 添加 jsdom 测试基座与知乎基线用例"
```

---

### Task 2: 天涯 URL 识别与启动入口

**Files:**
- Modify: `zhihu-word-mode.user.js` 顶部 `@match`、`@description`、`isRelevantPage()`（约 344 行）
- Create: `tests/tianya-url.test.cjs`

**Interfaces:**
- Produces: `isTianyaHost(): boolean`；`parseTianyaThreadUrl(pathname = location.pathname): { boardAlias: string, postId: string, page: number } | null`；`isTianyaThreadPage(): boolean`。

- [ ] **Step 1: 写失败测试**

```js
test('tianya thread url exposes the launcher', () => {
  const { document } = createWindow({ url: 'https://tianya.net/post-legend-11955258-1.html', html: '<body></body>' });
  assert.ok(document.getElementById('zhihu-word-mode-launcher'));
});
test('tianya board page does not expose the launcher', () => {
  const { document } = createWindow({ url: 'https://tianya.net/board-legend-default-1.html', html: '<body></body>' });
  assert.equal(document.getElementById('zhihu-word-mode-launcher'), null);
});
test('zhihu article still exposes the launcher', () => {
  const { document } = createWindow({ url: 'https://zhuanlan.zhihu.com/p/999', html: '<body></body>' });
  assert.ok(document.getElementById('zhihu-word-mode-launcher'));
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `node --test tests/tianya-url.test.cjs`
Expected: FAIL，帖子页没有 launcher。

- [ ] **Step 3: 实现识别**

- `@match` 增加 `https://tianya.net/*`、`https://www.tianya.net/*`。
- `@description` 改为“将知乎专栏、问题和回答，以及天涯帖子转换为 Word 365 风格的文档阅读界面”。
- 新增：
```js
function isTianyaHost() {
  return /(^|\.)tianya\.net$/i.test(location.hostname);
}
function parseTianyaThreadUrl(pathname = location.pathname) {
  const match = pathname.match(/\/post-([a-zA-Z0-9]+)-(\d+)-(\d+)\.html/);
  if (!match) return null;
  return { boardAlias: match[1], postId: match[2], page: Math.max(1, Number(match[3])) };
}
function isTianyaThreadPage() {
  return isTianyaHost() && Boolean(parseTianyaThreadUrl());
}
```
- `isRelevantPage()`：知乎保持原条件；天涯仅 `isTianyaThreadPage()`。
- 确认 `init()`/`ensureInitialized()` 在 SPA 路由变化后会给帖子页加 launcher（现有 MutationObserver 已覆盖）。

- [ ] **Step 4: 运行测试**

Run: `npm test`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add zhihu-word-mode.user.js tests/tianya-url.test.cjs
git commit -m "feat(tianya): 识别帖子页并挂载启动入口"
```

---

### Task 3: 天涯整帖文档（接口 + 纯文本 + 主帖/楼层）

**Files:**
- Modify: `zhihu-word-mode.user.js`（`renderDocument()` 约 1773 行分发；新增天涯状态、接口、文本和渲染函数）
- Create: `tests/tianya-document.test.cjs`
- Create: `tests/fixtures/tianya.js`

**Interfaces:**
- Produces:
  - `tianyaState`
  - `fetchTianyaPost(postId, page, signal): Promise<{ post, replies: { data, pagination } }>`
  - `fetchTianyaBoardName(boardId, signal): Promise<string>`
  - `tianyaTextToFragment(text): DocumentFragment`
  - `renderTianyaDocument(): boolean`
  - `createTianyaFloorElement(floor, state): HTMLElement`
  - `appendTianyaFloors(floors): void`
  - `resetTianyaState(): void`
- Consumes: Task 2 的 URL 信息。

- [ ] **Step 1: 写失败测试**

`tests/fixtures/tianya.js` 提供：
```js
function makePage({ page = 1, totalPages = 10, totalCount = 479, floors = [], post = {} }) {
  return {
    status: 'success',
    post: {
      title: '赌坛风云', author: '揭育润', postTime: '2011-1-2 16:18',
      clickCount: 15413986, content: '楼主正文。', boardId: '1100', boardAlias: 'legend',
      threadDeleted: false, ...post
    },
    replies: {
      data: floors.map((f, i) => ({
        pid: i + 1, replyId: 1000 + i, author: '揭育润', content: '楼层正文。',
        postTime: '2011-1-2 16:20', quotePid: null, deleted: false, ...f
      })),
      pagination: { totalCount, totalPages, currentPage: page, pageSize: 50 }
    }
  };
}
module.exports = { makePage };
```

`tests/tianya-document.test.cjs` 断言：
- 打开帖子页 → 标题/副标题含天涯荟萃、作者、时间；正文有楼主和楼层；没有 `.zwm-comments`。
- 正文含 `<script>alert(1)</script>`、`onerror` 时按文本显示，DOM 里没有 script/事件属性。
- 正文含 `https://example.com/a?b=1。` 时生成 `<a>`，末尾句号不进 href。
- API `status:'not_found'` → 显示“帖子不存在或已删除”。
- HTTP 403 → 显示接口不可用文案 + 重试，不是空白页。
- 板块名失败时副标题退回 `legend`。

- [ ] **Step 2: 运行测试，确认失败**

Run: `node --test tests/tianya-document.test.cjs`
Expected: FAIL。

- [ ] **Step 3: 实现**

- `renderDocument()` 最前面：
```js
if (isTianyaThreadPage()) return renderTianyaDocument();
```
- `fetchTianyaPost`：
  - `GET /api/bbs_post?postId=...&page=...&perPage=50`
  - `credentials:'include'`、`x-requested-with:'fetch'`、`accept:'application/json'`
  - 10 秒 `AbortController`；外层 signal 取消时一并 abort。
  - 校验 `status==='success'`、`post`、`replies.data` 数组、`pagination`；`status==='not_found'`/`threadDeleted` 抛带 `kind` 的错误。
- `fetchTianyaBoardName`：`/api/bbs_list?...`，失败返回空串，不阻塞正文。
- `tianyaTextToFragment`：`\r\n` 归一；空行分段；段内单换行 `<br>`；所有文本 `createTextNode`；`https?://...` linkify（去掉尾部标点）。
- `renderTianyaDocument`：
  - 创建 Overlay，显示“正在加载天涯帖子…”，`isOpen=true`，锁定页面滚动。
  - 并行取 post + boardName，成功后填标题、副标题、主帖、楼层；失败显示错误 + 重试。
  - 不调用 `renderComments()`。
  - 渲染完成后调用 `applySettings()`、`updateStats()`；锁定 `document.documentElement.style.overflow='hidden'`，关闭时由现有 `closeMode()` 恢复。
- `createTianyaFloorElement`：`section.zwm-tianya-floor`，`data-pid/data-poster/data-sub/data-deleted`；头部 `#pid 作者 楼主 时间`；正文用 `tianyaTextToFragment`。
- `appendTianyaFloors`：按 pid 去重，追加到 `.zwm-article-content`，维护 `floorMap`/`loadedPids`。
- `tianyaState`：`{ postId, boardAlias, boardId, boardName, page, totalPages, totalCount, post, floors, floorMap, loadedPids, onlyPoster, loading, ended, error }`。
- `closeMode()` 开头调用 `resetTianyaState()`（abort + 清空）。
- 新增 CSS：楼层 header/body、引用块、子楼层缩进、删除占位、加载/错误提示；沿用 Word 变量。

- [ ] **Step 4: 运行测试**

Run: `npm test`
Expected: PASS；知乎基线仍 PASS。

- [ ] **Step 5: 提交**

```bash
git add zhihu-word-mode.user.js tests/tianya-document.test.cjs tests/fixtures/tianya.js
git commit -m "feat(tianya): 渲染整帖文档与接口加载"
```

---

### Task 4: 引用、子楼层、删除楼层

**Files:**
- Modify: `zhihu-word-mode.user.js`
- Create: `tests/tianya-quotes.test.cjs`

**Interfaces:**
- Extends: `createTianyaFloorElement`；引用查找基于 `state.floorMap`。

- [ ] **Step 1: 写失败测试**

构造 fixture：`quotePid=1` 的回复、`quotePid=999`（未加载）、`deleted=true`。
断言：
- 命中引用显示 `.zwm-quote`，含被引用作者和内容。
- 未命中的引用显示“引用 #999（未加载）”。
- `deleted` 楼层显示“该楼层已被删除”，不渲染原正文。
- `quotePid` 有值的楼层有 `data-sub="1"` 和缩进样式。
- 点击引用块可展开（或至少存在 `data-expanded` 切换逻辑）。

- [ ] **Step 2: 运行测试，确认失败**

Run: `node --test tests/tianya-quotes.test.cjs`
Expected: FAIL。

- [ ] **Step 3: 实现**

- `deleted` 优先渲染占位，跳过正文/引用。
- `quotePid` 有值：加 `data-sub="1"`；从 `floorMap` 找引用；命中渲染 `.zwm-quote`，未命中渲染“引用 #N（未加载）”。
- 引用内容用 `tianyaTextToFragment`，默认 4 行截断；点击切换展开类。
- 跨页引用：父楼层先加载则命中；后加载显示未加载占位。
- 不渲染写操作按钮；“引用 · 回复”只做弱化文字占位。

- [ ] **Step 4: 运行测试**

Run: `npm test`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add zhihu-word-mode.user.js tests/tianya-quotes.test.cjs
git commit -m "feat(tianya): 渲染引用、子楼层与删除楼层"
```

---

### Task 5: 楼层目录与只看楼主（含知乎导航回归）

**Files:**
- Modify: `zhihu-word-mode.user.js`（`navAvailable`/`setNavOpen`/`toggleNav`、nav 头文案、nav list 点击/高亮）
- Create: `tests/tianya-toc.test.cjs`
- Create: `tests/zhihu-nav.test.cjs`

**Interfaces:**
- Produces: `renderTianyaNav()`；`appendTianyaTocItems(floors)`；`setTianyaOnlyPoster(value)`；`syncTianyaNavActive()`。
- Consumes: `tianyaState`、`.zwm-nav`/`.zwm-nav-list`。

- [ ] **Step 1: 写失败测试**

天涯：
- 帖子打开后 nav toggle 可见，目录列出“楼主 + 顶层楼层”，不含子楼层。
- 点击目录项滚动到对应 section；active 类跟随（jsdom 下至少断言点击目标）。
- 只看楼主：非楼主顶层隐藏，楼主楼层的引用块仍存在；目录项和计数同步。
- 关闭只看楼主恢复全部。

知乎回归：
- 问题页 2 个 `.AnswerItem`，打开文档模式，打开 nav，点第二个回答，正文和 URL 切换；nav 仍可开合。

- [ ] **Step 2: 运行测试，确认失败**

Run: `node --test tests/tianya-toc.test.cjs tests/zhihu-nav.test.cjs`
Expected: FAIL。

- [ ] **Step 3: 实现**

- `navAvailable()`：天涯有 `tianyaState?.floors.length > 0` 时返回 true；知乎逻辑不变。
- 天涯打开时把 `.zwm-nav-head` 文案设为“楼层”，填充 `.zwm-nav-list`；切回知乎时恢复“回答”。
- 目录项 `.zwm-tianya-toc-item`，结构 `#pid 作者` + 两行摘要；点击滚动到 `#floor-{pid}`。
- `IntersectionObserver`（root 为 `.zwm-docscroll`）高亮；jsdom 没有时降级为点击高亮。
- `setTianyaOnlyPoster(value)`：每个 floor 按 `data-poster` 设置 hidden；可见楼层内的 `.zwm-quote` 保留；更新目录、计数、状态栏。
- nav list 点击处理区分站点：天涯只处理 `.zwm-tianya-toc-item`，知乎仍处理 `.zwm-nav-item`。
- nav 底部“加载更多”按钮先接占位；Task 6 接真实加载。

- [ ] **Step 4: 运行测试**

Run: `npm test`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add zhihu-word-mode.user.js tests/tianya-toc.test.cjs tests/zhihu-nav.test.cjs
git commit -m "feat(tianya): 楼层目录与只看楼主"
```

---

### Task 6: 加载更多（按钮 + 滚动）

**Files:**
- Modify: `zhihu-word-mode.user.js`
- Create: `tests/tianya-load-more.test.cjs`

**Interfaces:**
- Produces: `loadTianyaPage({ scroll = false, auto = false } = {}): Promise<void>`；`updateTianyaFooter(): void`。
- Consumes: `tianyaState`、`appendTianyaFloors`、`appendTianyaTocItems`。

- [ ] **Step 1: 写失败测试**

断言：
- 底部按钮点击后请求下一页、追加楼层、进度从 `50/100` 变 `100/100`。
- 滚动到底部触发自动加载；一次滚动只加载一页（模拟两次 scroll，第二次未离开底部不重复请求）。
- 重复 pid 不重复渲染。
- `totalPages` 到达后按钮变“已加载全部”，不再请求。
- 下一页 403 时显示错误、保留已加载楼层、按钮可重试。
- 关闭文档模式会 abort；旧响应不写入 DOM。
- 入口页 `/post-...-2.html` 打开时请求 page=2，不请求 page=1。

- [ ] **Step 2: 运行测试，确认失败**

Run: `node --test tests/tianya-load-more.test.cjs`
Expected: FAIL。

- [ ] **Step 3: 实现**

- `loadTianyaPage`：guard（loading/ended/无 state）；`page+1`；fetch；append；更新 page/totalPages/totalCount/ended；错误分类；finally 更新 footer。
- 按钮：天涯走 `loadTianyaPage({ scroll:true })`，知乎仍走 `loadAnswersPage()`。
- 文档滚动监听：距底 200px 且非 loading 时 `loadTianyaPage({ auto:true })`；自动加载不滚动；`tianyaAutoLock` 在离开底部 400px 后解锁，实现一次手势一页。
- 关闭/路由变化：`resetTianyaState()` abort；load 完成后检查 `tianyaState` 仍是同一个对象再写 DOM。
- `updateTianyaFooter`：进度、结束、错误、重试。
- 追加只 append，不重建已加载楼层；目录增量追加；追加后调用 `updateStats()`。

- [ ] **Step 4: 运行测试**

Run: `npm test`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add zhihu-word-mode.user.js tests/tianya-load-more.test.cjs
git commit -m "feat(tianya): 支持按钮与滚动加载更多楼层"
```

---

### Task 7: 共享目录拖拽调宽

**Files:**
- Modify: `zhihu-word-mode.user.js`（`DEFAULTS`、nav CSS/HTML、`applySettings`、pointer 事件）
- Create: `tests/nav-resizer.test.cjs`

**Interfaces:**
- Produces: `navWidth` 设置（默认 260，范围 200–420）；`applyNavWidth(width: number): void`；resizer 元素 `.zwm-nav-resizer`。

- [ ] **Step 1: 写失败测试**

断言：
- nav 默认宽度 260；拖到 320 后 `--zwm-nav-width` 为 320px，设置写入 localStorage。
- 双击恢复 260。
- 低于 200/高于 420 被夹紧。
- 窄屏（matchMedia matches）resizer 不显示/不生效。
- 知乎回答导航仍能开合、点选。

- [ ] **Step 2: 运行测试，确认失败**

Run: `node --test tests/nav-resizer.test.cjs`
Expected: FAIL。

- [ ] **Step 3: 实现**

- `DEFAULTS` 加 `navWidth: 260`。
- CSS `.zwm-nav{flex:0 0 var(--zwm-nav-width,260px);width:var(--zwm-nav-width,260px);position:relative}`；`.zwm-nav-resizer` 右边缘 7px，`cursor:col-resize`；窄屏隐藏。
- `createOverlay` 的 `.zwm-nav` 内加 resizer。
- pointerdown/move/up：`clientX` 夹到 200–420；pointerup 时 `saveSettings`；双击 260。
- `applySettings` 设置 `--zwm-nav-width`；`syncControls` 不需要输入框。
- 天涯和知乎共用同一 nav 元素，无需分站点。

- [ ] **Step 4: 运行测试**

Run: `npm test`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add zhihu-word-mode.user.js tests/nav-resizer.test.cjs
git commit -m "feat(nav): 支持拖拽调整目录宽度"
```

---

### Task 8: 回归、性能、文档与发布构建

**Files:**
- Modify: `zhihu-word-mode.user.js`（`@version`、设置文案、必要的深色/打印/窄屏样式）
- Modify: `README.md`、`CHANGELOG.md`、`CONTRIBUTING.md`
- Create: `tests/tianya-performance.test.cjs`
- Create: `tests/zhihu-regression.test.cjs`
- Build: `dist/zhihu-word-mode.greasyfork.user.js`

**Interfaces:**
- Consumes: 前面所有任务。

- [ ] **Step 1: 写回归与性能测试**

`tests/zhihu-regression.test.cjs`：
- 文章页打开（Task 1 已覆盖，可引用）。
- 回答页评论 target：打开 `/question/1/answer/123`，断言 fetch 请求包含 `/api/v4/answers/123/comments`。
- 回答导航：Task 5 已覆盖。
- 行距：Task 1 已覆盖。

`tests/tianya-performance.test.cjs`：
- 合成 2000 个楼层（40 页 × 50），stub fetch 依次返回；加载完成后断言 `.zwm-tianya-floor` 数量 2000、目录顶层项数量正确、只看楼主计数正确。
- 不设硬性毫秒门槛，记录基准。

- [ ] **Step 2: 运行测试，确认通过/记录问题**

Run: `node --test tests/tianya-performance.test.cjs tests/zhihu-regression.test.cjs`
Expected: PASS；若超过数秒或 DOM 数量异常，先优化追加逻辑。

- [ ] **Step 3: 文档与文案**

- `@version` 0.6.0。
- 设置里“文末评论”文案改为“文末评论（仅知乎）”。
- README：
  - 功能增加“天涯帖子整栋楼连续阅读、楼层目录、只看楼主、加载更多”。
  - 已知限制：只支持帖子页；入口页 >1 只向后加载；纯文本不渲染图片；约 2000 楼内流畅；引用/子楼层缺少真实样本。
  - 安装说明增加天涯帖子页用法。
- CHANGELOG 0.6.0。
- CONTRIBUTING 增加 `npm install` / `npm test`。

- [ ] **Step 4: 全量验证**

Run:
```bash
npm test
node --check zhihu-word-mode.user.js
python -I scripts/build-greasyfork.py
node --check dist/zhihu-word-mode.greasyfork.user.js
```
Expected: 全部通过；dist 版本 0.6.0。

- [ ] **Step 5: 手动验收**

- 真实帖子 `11955258` 第 1 页：主帖、楼层、目录、只看楼主、加载第 2 页。
- 板块页/首页：无 launcher。
- 知乎文章/回答/问题：文档模式、回答切换、评论、打印不回归。
- 窄屏、深色、打印、200% 缩放。
- 入口页 `/post-...-2.html`：从第 2 页开始，不请求第 1 页。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat(tianya): 发布 0.6.0 整帖阅读"
```
