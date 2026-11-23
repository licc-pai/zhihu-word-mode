# 贡献指南

## 开发方式

- 运行时无依赖，直接编辑 `zhihu-word-mode.user.js`。
- 测试使用 dev-only jsdom：先 `npm install`，再 `npm test`。
- 在 Tampermonkey 面板中新建脚本，粘贴文件内容；改完后保存并刷新知乎/天涯页面。
- 建议在四类页面各测一次：一篇知乎专栏文章、一个回答页、一个问题页、一个天涯帖子页。

## 代码约定

- 保持单文件、原生 JavaScript，不引入运行时依赖；jsdom 只用于测试。
- 选择器要容错：知乎/天涯 DOM 会变，新增逻辑尽量带兜底，不要让异常打断正文渲染。
- 只向 `zhihu.com` / `tianya.net` 发请求；不要加入统计、埋点、远程配置或第三方接口。
- 知乎评论 HTML 和天涯楼层内容都必须先清洗再插入 DOM；天涯正文按纯文本转义，不要直接信任接口内容。
- 修改后同步更新版本号与 `CHANGELOG.md`。

## 提交信息

使用 Conventional Commits，type 前缀用英文，描述用简体中文：

```text
feat(comments): 支持加载更多评论
fix(ui): 修复退出后标签页标题未还原
```

## 提 PR 前

- [ ] 运行 `npm test` 通过
- [ ] 在知乎文章页、回答页、问题页、天涯帖子页各测一次
- [ ] 确认退出后标签页标题/图标、页面滚动都恢复
- [ ] 确认知乎评论接口失败时能回退到页面评论
- [ ] 确认天涯楼层加载、只看楼主、目录拖拽在真实页面可用
- [ ] 没有新增第三方请求或隐私风险
- [ ] 已更新 `CHANGELOG.md` 和版本号

## 发布到 Greasy Fork / 脚本猫

这两个站点都自己托管脚本更新，发布版不应带指向 GitHub 的 `@updateURL` / `@downloadURL`。

```bash
python scripts/build-greasyfork.py
```

把 `dist/zhihu-word-mode.greasyfork.user.js` 上传到 Greasy Fork 和脚本猫；其余代码与主文件一致。
