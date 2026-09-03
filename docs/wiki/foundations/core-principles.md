---
title: Core Principles
status: active
canonical: true
owners: [maintainers]
source_of_truth_for:
  - documentation-source-of-truth
  - documentation-conflict-handling
  - reproducible-documentation-checks
code_paths:
  - lib/check.mjs
  - lib/impact.mjs
  - scripts/docs-impact.mjs
  - scripts/docs-check.mjs
sources:
  - AGENTS.md
  - README.md
summary: States the non-negotiable rules for source precedence, conflict preservation, canonical documentation, and reproducible offline validation.
keywords: [principles, source-of-truth, conflicts, canonical, reproducibility]
created: 2026-09-03
updated: 2026-09-03
last_verified_commit: 09b7af91df353deee75bd47a344154497d280682
---

# Core Principles

1. 机器契约优先于 prose；实现与测试优先于历史计划。
2. 一个主题只能由一个 active canonical 页面声明 source of truth。
3. 历史来源保留原文和时间；冲突必须显式登记，不能通过重写或链接顺序静默解决。
4. 影响分析是最低复核集合，不是“没有匹配就代表没有影响”的证明。
5. `docs:check` 必须在无网络、无数据库、无业务服务的环境中稳定运行。
6. 文档和代码属于同一个变更闭环：行为、边界、契约或流程改变时，同步更新维护页面。
