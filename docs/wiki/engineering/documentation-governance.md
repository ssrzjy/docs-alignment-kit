---
title: Documentation Governance
status: active
canonical: true
owners: [maintainers]
source_of_truth_for:
  - documentation-governance
  - page-frontmatter
  - alignment-workflow
code_paths:
  - lib/check.mjs
  - lib/impact.mjs
  - scripts/docs-check.mjs
  - scripts/docs-impact.mjs
sources:
  - AGENTS.md
  - docs/README.md
summary: Describes page metadata, navigation coverage, impact-driven review, lifecycle transitions, and the definition of done for documentation changes.
keywords: [governance, frontmatter, lifecycle, alignment, review]
created: 2026-09-03
updated: 2026-09-03
last_verified_commit: 09b7af91df353deee75bd47a344154497d280682
---

# Documentation Governance

## Page contract

每个 Wiki Markdown 页面都以 YAML-like frontmatter 开头，必须声明 `title`、`status`、`canonical`、`owners`、`source_of_truth_for`、`code_paths`、`sources`、`summary`、`keywords`、`created`、`updated` 和 `last_verified_commit`。`summary` 应能独立帮助搜索者判断页面是否相关。

`active` 页面必须从配置的 Wiki index 可达；声明相同主题的 canonical active 页面会被检查器拒绝。页面进入 `superseded` 时必须提供存在的 `superseded_by` 路径。具体 Wiki、核心原则、影响映射、冲突登记、Legacy、Agent Skill 和 PR 模板路径全部来自 `docs-alignment.config.json`。

## Alignment workflow

1. 运行 `docs-alignment impact <planned-path>...`（本仓库也可使用 `npm run docs:impact -- <planned-path>...`）。
2. 阅读 `required_reading`，检查 `maintained_docs` 与 `machine_contracts`。
3. 同步修改代码、契约和维护页面；若只有内部重构，也在交付记录中说明“不需要文档变更”的具体原因。
4. 运行 `docs-alignment check`（或项目配置的 npm script）和最小相关测试，并报告真实结果。

impact map 是最低复核集合。`unmatched_paths` 需要人工判断，不能当作无影响。
