# 文档维护

本项目采用分层 Wiki。默认入口是 [`wiki/index.md`](wiki/index.md)，其中的 active canonical 页面描述当前可验证的设计意图；历史材料和迁移记录只作为 provenance。

## 日常流程

```bash
npm run docs:impact -- <changed-or-planned-path>...
npm run docs:check
```

先读 impact 输出，再修改对应页面和机器契约。页面 frontmatter、链接、导航覆盖和影响映射由 `docs:check` 离线校验。

## 接入已有仓库

按 [`wiki/roadmap/document-migration.md`](wiki/roadmap/document-migration.md) 盘点旧文档，先分类，再创建 canonical 页面，最后把来源和迁移状态写入清单。不要为了通过检查而删除历史来源。

从零接入 npm 工具请阅读 [`getting-started.md`](getting-started.md)；可运行的最小目录见 [`../examples/minimal-project/`](../examples/minimal-project/)。
