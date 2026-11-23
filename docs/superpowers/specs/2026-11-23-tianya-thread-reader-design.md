# 天涯整帖阅读设计（0.6.0）

- 日期：2026-11-23
- 状态：草案，待用户确认
- 目标版本：0.6.0
- 关联样式预览：`C:\Users\intro\AppData\Local\Temp\zwm-tianya-mock\index.html`（本地临时文件，不入库）

## 1. 背景与目标

现有脚本只支持知乎。用户希望把 `tianya.net`（天涯虚拟社区）的帖子也转成 Word 365 风格的阅读界面。

天涯帖子与知乎回答的结构不同：一个帖子由「楼主首帖 + 多个楼层」组成，长故事经常连载在回复里。用户已明确选择**方案 B：整栋楼连续阅读**，而不是只读楼主首帖、也不是一次只看一楼。

目标：

- 在帖子页打开文档模式，把楼主首帖和楼层连续渲染成一篇文档。
- 左侧楼层目录，支持滚动高亮、点击跳转、拖拽调宽、只看楼主。
- 加载更多同时支持底部按钮和滚到底自动加载。
- 保留引用内容；只看楼主时，楼主楼层里的引用块仍然显示。
- 复用现有 Word 外壳、字体/行距/主题/缩放/打印/文档名设置。
- 不改变现有知乎行为。

非目标：

- 不支持天涯首页/板块列表转文档；只处理帖子页。
- 不做发帖、回复、编辑、登录、账号相关操作。
- 不把楼层加载进度同步到浏览器地址栏。
- 不持久化已加载楼层；刷新或重新打开从当前页面重新开始。
- 首版不专门支持图片/视频/复杂富文本；抽样板块内容为纯文本，先按纯文本渲染。
- 不把天涯和知乎抽成完整的多站点插件架构；先做轻量分支，第三个站点出现时再重构。

## 2. 已核实的事实与约束

tianya.net 是 Vue 3 SPA，页面由 JS 渲染，但读接口公开、同源、无需登录：

- 帖子路由：`/post-{boardAlias}-{postId}-{page}.html`，例如 `/post-legend-11955258-1.html`。
- 帖子接口：`GET /api/bbs_post?postId={id}&page={page}&perPage=50`
  - `post`：`title / author / postTime / clickCount / content / boardId / boardAlias / threadDeleted`
  - `replies.data[]`：`pid / replyId / author / content / postTime / quotePid / deleted`
  - `replies.pagination`：`totalCount / totalPages / currentPage / pageSize`
- 板块接口：`GET /api/bbs_list?boardId={id}&tab={tab}&page={page}`，返回 `boardName`。
- 首页接口：`GET /api/index_main`（本期不用）。
- 引用/楼中楼：`quotePid` 指向被引用楼层；`quotePid` 有值的回复在站点里显示为引用块/子回复。
- 正文和回复在抽样板块是纯文本 + `\n`，无 HTML/图片/URL；站点前端把换行转成 `<p>/<br>`。脚本必须按不可信纯文本处理，不能直接 `innerHTML`。
- 示例帖子：`postId=11955258`，479 楼、10 页、每页 50；楼主 `揭育润`；板块 `天涯荟萃`（`boardAlias=legend`）。

现有脚本约束：

- 单文件 userscript，`@grant none`，无构建依赖（只有发布用的 Python 脚本）。
- 现有知乎逻辑约 2000 行，回答导航、评论接口、正文识别都与知乎耦合。
- `cleanClone` 已在 0.5.3 移除内联 `line-height`；正文行距已统一由 Word 页面控制。
- 发布版 `dist/zhihu-word-mode.greasyfork.user.js` 去掉 GitHub 更新地址；主文件保留。

## 3. 已定决策（用户）

1. 整栋楼连续阅读（方案 B）。
2. 加载更多：按钮 + 滚到底自动加载，两种都要。
3. 只看楼主：保留楼主楼层里的引用内容；被引用的非楼主楼层不单独显示。
4. 左侧目录支持拖拽调宽（200–420px，双击复位），宽度持久化。
5. 字号 16px / 行距 1.9 可接受；行距覆盖问题已在 0.5.3 修复。
6. 样式预览已确认：Word 外壳、楼层连续、目录、引用/楼中楼/删除楼层示例。
7. 首版按纯文本 + 链接渲染，不渲染图片。
8. 性能目标：约 2000 楼级；不做虚拟滚动/目录窗口化。
9. 脚本名保持「知乎 Word 文档模式」；`@description` 和 README 增加天涯；仓库名不变。

## 4. 方案选择

产品方案：

- A. 只读楼主首帖，回复当评论：改动最小，但故事连载在回复里，回复被当评论不合适。不选。
- B. 整栋楼连续阅读：选中。
- C. 楼层切换：一次看一楼，不符合论坛连续阅读习惯。不选。

实现架构：

- 1. 完整站点适配器（`SiteAdapter` 接口 + Zhihu/Tianya 两套实现）：最干净，但要大改现有知乎逻辑，回归风险高。
- 2. 轻量分支：保留现有知乎代码，新增 `isTianyaThreadPage()` 和 `renderTianyaDocument()`；共享 Overlay、CSS、设置、打印。**选中**。
- 3. 单独写一个天涯脚本：重复 Word 外壳和设置，不选。

选择 2 的理由：天涯的阅读模型（整帖连续 + 楼层目录）与知乎（单回答 + 评论 + 回答导航）差异大，硬套适配器会把两套逻辑搅在一起；轻量分支只动分发点，风险小。等第三个站点出现再抽适配器。

## 5. 页面识别与接入点

- `@match` 增加 `https://tianya.net/*`、`https://www.tianya.net/*`。
- `isRelevantPage()`：知乎保持原逻辑；天涯只认帖子路由 `/post-{boardAlias}-{postId}-{page}.html`。板块页/首页不注入启动按钮。
- `renderDocument()` 最前面分发：`if (isTianyaThreadPage()) return renderTianyaDocument();`
- 天涯不走 `renderComments()`：楼层就是正文，没有独立的文末评论。
- 天涯不走 `findContent/findTitle/findMeta/collectAnswers`：标题、作者、正文全部来自接口。
- `cleanClone`、`sanitizeAnswerHtml`、回答导航、评论接口、`getContentTarget` 保持知乎专用，不改语义。
- `onRouteChange()` 保持现状：URL 变化关闭文档模式。天涯翻页是整页导航，会重新加载；文档模式内的「加载更多」不修改 URL，所以不会触发关闭。
- 启动按钮只在帖子页出现；在首页/板块页按 `Alt+W` 不做任何事（或仅在控制台提示），不弹窗。

## 6. 数据与状态模型

新增模块级状态：

```js
let tianyaState = null;
// {
//   postId, boardId, boardAlias, boardName,
//   post: { title, author, postTime, clickCount, content },
//   page, totalPages, totalCount,
//   floors: [], floorMap: Map<pid, floor>,
//   loadedPids: Set<number>,
//   onlyPoster: false,
//   loading: false, ended: false, error: ''
// }
```

- 入口页：从 URL 解析 `page`，从该页开始向前加载后续页；不自动回补前面的页。
- 主帖：第一次接口响应里的 `post`；后续页重复返回时忽略。
- 楼层：每个回复一个 section；`pid` 唯一；跨页按 pid 去重。
- 子回复/引用：`quotePid` 有值的楼层渲染为缩进的子楼层，并带引用块；`quotePid` 为空的是顶层楼层。
- 删除：`deleted: true` 渲染为删除占位；不渲染正文，不作为引用内容。
- 只看楼主：按 `author === post.author` 精确匹配；顶层和子楼层都参与过滤。
  - 被隐藏楼层的引用块不影响可见楼层：可见楼层里的引用块始终保留（用户明确要求）。
  - 如果楼主的子回复挂在非楼主楼层下，只看楼主时仍然显示该子回复（它是楼主内容），并保留对父楼层的引用/占位。
- 计数：`loadedPids.size` 作为“已加载楼层数”；`totalCount` 来自接口，用于进度显示。楼中楼也计入。

## 7. 渲染设计

复用现有 Overlay：

- 标题栏、选项卡、功能区、状态栏、纸张、设置、打印、深色、窄屏全部复用。
- 页面标题 = 帖子标题。
- 副标题 = `boardName · author · postTime · 点击量（万）`；`boardName` 通过板块接口获取，失败时退回 `boardAlias`。
- 正文区 = 楼主首帖 + 楼层 section 连续排列。
- 不渲染知乎评论区和「文末评论」；设置里的该项对天涯无效（文案标注“仅知乎”）。

楼层结构：

```
<section class="zwm-tianya-floor" data-pid data-poster data-sub data-deleted>
  <div class="zwm-floor-head">
    #pid  作者  楼主徽标  时间  引用/回复（演示）
  </div>
  <div class="zwm-floor-body">纯文本段落</div>
  <blockquote class="zwm-quote">回复 #N 作者：被引用内容</blockquote>
  <div class="zwm-sub-zone">…（同 section，缩进样式，不做 DOM 嵌套）…</div>
</section>
```

- 顶层和子楼层都渲染成独立的 section，用 `data-sub` + 缩进样式区分，避免跨页父子关系的 DOM 嵌套难题；只看楼主直接按 section 过滤。
- 楼层头：`#pid`、作者、楼主徽标、时间、右侧“引用 · 回复”占位（不接写操作）。
- 纯文本渲染：
  - 统一 `\r\n` → `\n`。
  - 空行分段；段内单换行用 `<br>`；全部文本先 `textContent`/转义，禁止 `innerHTML`。
  - `https?://` 链接做 linkify（`<a target="_blank" rel="noopener noreferrer">`），其余保持文本。
  - 长文本用 `overflow-wrap:anywhere`。
- 引用块：
  - `quotePid` 能在 `floorMap` 找到：显示“回复 #N 作者：” + 被引用内容；默认 4 行截断，点击展开。
  - 找不到（前面的页未加载/已删除）：显示“引用 #N（未加载）”，不伪造内容。
  - 只看楼主时，引用块属于可见楼层，保留显示；被引用的非楼主楼层不单独出现。
- 删除楼层：`该楼层已被删除` 占位；只看楼主时保留/隐藏按作者规则处理。
- 空回复：只显示楼主首帖和“暂无回复”。
- 加载/错误：
  - 首屏加载：Overlay 内显示“正在加载天涯帖子…”。
  - 首屏失败：显示原因（HTTP/超时/not_found）和“重试”。
  - 后续页失败：底部显示错误 + 重试，不丢已加载楼层。

左侧楼层目录：

- 头部：“楼层目录” + 总数。
- 过滤：只看楼主开关 + 当前可见数量。
- 列表：只列顶层楼层（`quotePid` 为空）和楼主；`#pid 作者` + 两行摘要；当前滚动位置高亮。
- 子楼层不单独进目录，避免目录爆炸。
- 目录项点击滚动到对应 section；`IntersectionObserver` 高亮。
- 目录可收起（QAT/功能区按钮）。
- 目录右边缘可拖拽调宽 200–420px，双击复位 260px；宽度写入设置（`navWidth`），知乎回答导航共用。
- 窄屏（≤760px）：目录改为绝对定位覆盖层，拖拽手柄隐藏；选中楼层/跳转后自动收起。

加载更多：

- 底部按钮“加载更多楼层” + 进度“已加载 X / total 楼”。
- 文档区滚动到底部附近（约 200px）自动加载下一页；自动加载不滚动页面，按钮加载可以滚到新楼层。
- 一次滚动手势只自动加载一页；加载完成后必须由用户继续滚动才会触发下一页，避免在只看楼主时坐在底部连续拉完整帖。
- 加载中禁用按钮，防重复请求。
- `page >= totalPages`、空数组、`replies.data.length < perPage` 任一成立即标记结束；按钮变为“已加载全部 / 暂无更多”。
- 自动加载只在可滚动且非加载中时触发，加 400ms 节流。
- 入口页大于 1 时，只向后加载；不自动补前面的页（已知限制，写进 README）。

## 8. API 与错误处理

```js
fetchTianyaPost(postId, page, signal)
```

- `GET /api/bbs_post?postId=...&page=...&perPage=50`
- `credentials: 'include'`
- `headers: { 'x-requested-with': 'fetch', accept: 'application/json' }`
- `AbortController` 10 秒超时；关闭文档模式时 abort。
- 校验：`status === 'success'`、`post` 存在、`replies.data` 是数组、`pagination` 存在；否则抛错。
- `status === 'not_found'` / `threadDeleted`：显示“帖子不存在或已删除”。
- 错误分类：HTTP 401/403/429、超时、空数据、网络错误；分类提示，不吞错。
- 板块名：`GET /api/bbs_list?boardId=...&tab=default&page=1`，同帖子缓存一次；失败不影响正文。

## 9. 设置与持久化

- 新增 `navWidth`（默认 260，范围 200–420）：目录宽度；知乎回答导航和天涯楼层目录共用。
- 复用 `fontSize / lineHeight / pageWidth / theme / zoom / docName`。
- `includeComments` 对天涯无效；设置文案改为“文末评论（仅知乎）”。
- 只看楼主状态、已加载楼层不持久化；刷新/重新打开从当前页面开始。
- 文档名仍用 `docName`，默认“文档1.docx”；是否改成“天涯帖子.docx”由用户决定（见第 12 节）。

## 10. 性能与安全

- 每页 50 楼、约 200KB JSON；按需加载，不预取全部页。
- 性能目标：约 2000 楼内保持流畅；超过后仍可继续加载，但不做虚拟滚动，楼层极多时可能变慢。
- 用 `DocumentFragment` 追加；加载更多只追加新楼层，不重渲染已加载楼层；目录增量追加。
- 所有接口内容按不可信文本处理：转义后再插入；禁止 `innerHTML`；链接只允许 http(s)。
- 接口为同源读接口，不需要 token；不调用任何写接口。
- 图片/HTML：首版不渲染；如果内容含 URL，只做链接。若后续样本出现图片，再单独设计图片域/防盗链/尺寸。

## 11. 测试

测试放进仓库，不再依赖临时目录：

- 新增 `tests/` + dev-only `package.json`（唯一依赖 jsdom），`npm test` 运行；`package.json` 标记 `private`，不进入发布构建。
- fixture 提交到 `tests/fixtures/`：帖子页 URL、接口响应（主帖/楼层/引用/子楼层/删除/空回复/错误）、板块响应。
- 用 jsdom 以黑盒方式 `window.eval` 加载 userscript；不为了测试给生产代码加导出。
- 更新 CONTRIBUTING：本地跑 `npm install` / `npm test`；发布仍只用现有 Python 构建脚本。

用例：

1. URL 解析：帖子路由、板块页、首页、带 query/hash。
2. 主帖 + 楼层渲染：标题、板块/作者/时间、段落、楼主徽标。
3. 纯文本转义：`<script>`、`<img onerror>`、HTML 实体按文本显示。
4. 引用：`quotePid` 命中显示引用块；未命中显示“未加载”；点击展开。
5. 子楼层：缩进、时间、作者；只看楼主时保留楼主子回复。
6. 删除楼层：占位；不被引用内容使用。
7. 只看楼主：顶层/子楼层过滤；引用块保留；目录同步；计数正确。
8. 加载更多：按钮加载下一页；滚动到底自动加载；防重复；结束态；错误重试。
9. 目录：点击滚动、滚动高亮、收起/展开、拖拽调宽、双击复位、宽度持久化。
10. 行距：0.5.3 的回归（内联 line-height 被移除，设置生效）。
11. 知乎回归：文章页、回答页、问题页、回答切换、评论、打印。
12. 边界：空回复、not_found、threadDeleted、入口页 >1、窄屏。
13. 性能：合成 2000 楼，验证追加、目录、只看楼主过滤能完成（记录基准，不设硬性毫秒门槛）。

手动验证：

- 真实帖子 `11955258` 第 1 页，加载到第 2 页。
- 找一篇含 `quotePid`/楼中楼/删除楼层的帖子（当前样本没有，需要另找）。
- 板块页/首页：不出现启动按钮。
- 窄屏、深色、打印、缩放。

## 12. 风险与待用户拍板

风险：

- 天涯站点仍在“恢复元气中”，接口可能变化。
- 抽样板块是纯文本；其它板块的图片/BBCode/HTML 可能破坏渲染，需要真实样本确认。
- 已抽查 10 页共 479 楼、33 个帖子约 1650 条回复，均未发现非空 `quotePid`；引用/子楼层 UI 按站点 bundle 的语义实现，但只能用构造 fixture 验证，无法对真实数据回归。若后续找到真实样本，再补一条手动验证。
- `deleted: true` 在真实数据中存在，删除楼层可以真实验证。
- 楼中楼/删除楼层样本不足；`quotePid` 的跨页引用可能显示“未加载”。
- 只看楼主只基于已加载页；未加载页面的楼主楼层不会提前出现。
- 入口页 >1 时不回补前面的页（已定为只向后加载，写进 README 限制）。

待用户拍板：无。

已定：脚本名保持「知乎 Word 文档模式」，`@description` 与 README 增加天涯；仓库名不变。知乎和天涯共用同一个脚本与更新地址。

Builder 检查后已定的实现决定：

- 入口页 >1 时只向后加载，不回补前面的页；写进 README 限制。
- 一次滚动手势只自动加载一页；加载后需要用户继续滚动才会触发下一页。
- 测试放进仓库（`tests/` + dev-only `package.json` + jsdom），fixture 提交。
- 引用/子楼层按站点 bundle 语义实现，用构造 fixture 测试；真实 `quotePid` 样本暂缺，标记为未对真实数据回归。

## 13. 实施顺序

1. 站点识别/URL 解析/API 拉取 + 纯文本渲染 + 主帖/楼层。
2. 楼层目录 + 只看楼主 + 引用/子楼层/删除。
3. 加载更多（按钮 + 自动）+ 错误/结束态。
4. 目录拖拽调宽（共享设置）+ 窄屏/深色/打印。
5. 测试、README/CHANGELOG、`@description` 加天涯、0.6.0 发布。
