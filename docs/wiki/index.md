---
title: Documentation Alignment Wiki
status: active
canonical: true
owners: [maintainers]
source_of_truth_for:
  - wiki-navigation
code_paths: []
sources:
  - docs/README.md
  - README.md
summary: Authoritative navigation map for the generic documentation alignment workflow, governance rules, migration guidance, and machine-readable impact routes.
keywords: [documentation, wiki, governance, migration, impact-map]
created: 2026-09-03
updated: 2026-09-03
last_verified_commit: 09b7af91df353deee75bd47a344154497d280682
---

# Documentation Alignment Wiki

这是人类和 AI agent 的默认文档入口。页面分为 foundations（项目约束）、engineering（维护流程）和 roadmap（迁移与演进）。可执行 schema、代码和测试仍然是对应行为的最终校验。

## 阅读顺序

1. [Project Overview](foundations/project-overview.md)
2. [Core Principles](foundations/core-principles.md)
3. [Documentation Governance](engineering/documentation-governance.md)
4. 根据变更路径运行 `npm run docs:impact`，阅读输出的 route 页面。
5. 需要迁移旧文档时阅读 [Document Migration](roadmap/document-migration.md)。

## Maintained pages

| 页面 | 作用 |
| --- | --- |
| [Project Overview](foundations/project-overview.md) | 工具包定位、组成和边界。 |
| [Core Principles](foundations/core-principles.md) | source-of-truth、冲突和可重复检查的不可变原则。 |
| [Documentation Governance](engineering/documentation-governance.md) | frontmatter、canonical 页面、变更对齐和验证规则。 |
| [Installation and Agent Integration](engineering/installation-and-agent-integration.md) | npm 安装、配置、init 和 Coding Agent 接入。 |
| [Document Migration](roadmap/document-migration.md) | 旧文档盘点、分类、迁移和冲突登记指南。 |
| [Impact Map](references/code-document-impact-map.json) | 路径到必读文档、维护页面、契约和验证命令的机器契约。 |
| [Conflict Register](references/knowledge-conflict-register.md) | 保留冲突来源、时间和人工决策状态。 |

## Commands

- `npm run docs:impact -- <paths...>`：查询影响路由；加 `--json` 输出机器可读结果。
- `npm run docs:check`：校验 Wiki frontmatter、链接、导航覆盖、source-of-truth 唯一性和 impact map。
- `npm test`：运行脚本行为测试。

机器可读的来源关系保存在 [`references/document-knowledge-relations.json`](references/document-knowledge-relations.json)；当前为空关系表，发现冲突后按迁移指南增加双向边。

## 页面生命周期

页面状态为 `draft`、`active`、`deprecated`、`superseded` 或 `archived`。只有 `active + canonical: true` 页面才能声明主题的 source of truth；superseded 页面必须声明 `superseded_by`。
