---
title: Document Migration Guide
status: active
canonical: true
owners: [maintainers]
source_of_truth_for:
  - document-migration
  - migration-status
code_paths:
  - lib/check.mjs
  - scripts/docs-check.mjs
  - docs/wiki/references/code-document-impact-map.json
sources:
  - docs/README.md
  - README.md
summary: Provides a repeatable guide for inventorying legacy documents, compiling canonical Wiki pages, preserving provenance, and recording unresolved conflicts.
keywords: [migration, legacy, provenance, classification, conflict]
created: 2026-09-03
updated: 2026-09-03
last_verified_commit: 09b7af91df353deee75bd47a344154497d280682
---

# Document Migration Guide

本指南适用于把已有 `docs/`、设计稿、运行手册和机器契约接入本维护系统。迁移的目标是增加可导航的当前知识，不是抹平历史差异。

## 四步迁移法

1. **盘点**：列出旧文档路径、类型、拥有者、最后更新时间和对应代码/契约。
2. **分类**：标记为 `canonical-candidate`、`historical`、`machine-contract` 或 `retained-reference`，并记录迁移状态 `unreviewed`、`classified`、`compiled`、`human-review-required` 或 `retained-reference`。
3. **编译**：将已经验证的稳定意图写入一个 active Wiki 页面；页面 frontmatter 的 `sources` 指回原文，`code_paths` 指向真实存在的实现或契约。
4. **复核**：对矛盾来源建立冲突记录，保留双方 claim、时间和 commit，等待人工决策。运行 `npm run docs:check`，确认链接和导航完整。

## 推荐记录格式

```yaml
- original_path: docs/legacy/design.md
  document_kind: historical-design
  migration_status: compiled
  current_path: docs/wiki/foundations/project-overview.md
  compiled_into:
    - docs/wiki/foundations/project-overview.md
  conflict_ids: []
  notes: "稳定的边界已编译；原文保留不改。"
```

## 冲突登记

对每一组冲突记录唯一 ID、双方来源、各自 claim、发现时间、状态（`pending-human-review` 或 `resolved-human-decision`）和后续决定。不要仅仅因为某篇文档更新较晚，就自动把另一篇标记为错误。

来源级的双向关系写入 [`../references/document-knowledge-relations.json`](../references/document-knowledge-relations.json)，摘要和人工决定写入 [`../references/knowledge-conflict-register.md`](../references/knowledge-conflict-register.md)。没有冲突时保留空关系表即可。

## 完成标准

- 每个 active 页面都能从 Wiki index 找到；
- 每个来源路径和机器契约路径都存在；
- 每个主题只有一个 canonical owner；
- 未决冲突有 provenance，历史文档未被静默改写；
- `npm run docs:check` 和迁移相关测试通过。
