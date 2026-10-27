# 贡献指南

## 开发方式

- 项目无构建、无依赖，直接编辑 `zhihu-word-mode.user.js`。
- 在 Tampermonkey 面板中新建脚本，粘贴文件内容；改完后保存并刷新知乎页面。
- 建议在三种页面各测一次：一篇专栏文章、一个回答页、一个问题页。

## 代码约定

- 保持单文件、原生 JavaScript，不引入运行时依赖。
- 选择器要容错：知乎 DOM 会变，新增逻辑尽量带兜底，不要让异常打断正文渲染。
- 只向 `zhihu.com` 发请求；不要加入统计、埋点、远程配置或第三方接口。
- 评论区 HTML 必须先清洗再插入 DOM；不要直接信任接口或页面内容。
- 修改后同步更新版本号与 `CHANGELOG.md`。

## 提交信息

使用 Conventional Commits，type 前缀用英文，描述用简体中文：

```text
feat(comments): 支持加载更多评论
fix(ui): 修复退出后标签页标题未还原
```

## 提 PR 前

- [ ] 在文章页、回答页、问题页各测一次
- [ ] 确认退出后标签页标题/图标、页面滚动都恢复
- [ ] 确认评论接口失败时能回退到页面评论
- [ ] 没有新增第三方请求或隐私风险
- [ ] 已更新 `CHANGELOG.md` 和版本号

## 发布到 Greasy Fork

油叉自己托管脚本更新，发布到油叉的版本不应带指向 GitHub 的 `@updateURL` / `@downloadURL`。

```bash
python scripts/build-greasyfork.py
```

上传 `dist/zhihu-word-mode.greasyfork.user.js`，其余代码与主文件一致。
