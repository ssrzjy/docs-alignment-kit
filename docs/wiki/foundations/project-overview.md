---
title: Project Overview
status: active
canonical: true
owners: [maintainers]
source_of_truth_for:
  - project-identity
  - documentation-tooling-scope
code_paths:
  - bin/docs-alignment.mjs
  - lib/config.mjs
  - lib/check.mjs
  - lib/impact.mjs
  - lib/init.mjs
  - lib/scan.mjs
  - scripts/docs-impact.mjs
  - scripts/docs-check.mjs
sources:
  - README.md
  - package.json
summary: Defines the generic documentation alignment kit, its offline commands, and the boundary between reusable maintenance tooling and project-specific knowledge.
keywords: [overview, scope, tooling, offline, reusable]
created: 2026-09-03
updated: 2026-09-03
last_verified_commit: 09b7af91df353deee75bd47a344154497d280682
---

# Project Overview

`docs-alignment-kit` 是一个通用的文档维护骨架，不是业务运行时。它提供三类能力：

- 用 Wiki 页面承载当前设计意图和维护边界；
- 用 impact map 把代码路径路由到最低阅读、维护页面、机器契约和验证命令；
- 用只读扫描器生成候选模块、数据库、对象存储、契约、测试和现有文档的初始化报告；
- 用离线检查器发现配置、frontmatter、链接、导航、映射和冲突关系的漂移。

工具不会替项目决定产品语义，也不会自动把历史方案升级成当前事实。接入项目后，应把项目自己的 schema、源码、测试和历史文档加入映射与迁移记录。
