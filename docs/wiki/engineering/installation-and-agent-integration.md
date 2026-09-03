---
title: Installation and Agent Integration
status: active
canonical: true
owners: [maintainers]
source_of_truth_for:
  - npm-installation
  - cli-integration
  - agent-integration
code_paths:
  - bin/docs-alignment.mjs
  - lib/config.mjs
  - lib/init.mjs
  - lib/scan.mjs
  - package.json
sources:
  - README.md
  - docs/getting-started.md
  - templates/AGENTS.md
  - package.json
summary: Explains how another project installs the npm CLI, configures repository paths, initializes agent guidance, and separates deterministic checks from agent instructions.
keywords: [npm, cli, install, init, agent, codex, configuration]
created: 2026-09-03
updated: 2026-09-03
last_verified_commit: 09b7af91df353deee75bd47a344154497d280682
---

# Installation and Agent Integration

其他项目只安装 npm 包，不复制本仓库源码。`docs-alignment impact` 和 `docs-alignment check` 在调用目录中读取 `docs-alignment.config.json`；配置缺失时使用默认路径，也可以通过 `--config` 指向其他文件。包同时导出 `loadConfig`、`scanProject`、`analyzeImpact`、`runCheck` 和 `initializeProject`，供需要自定义集成的 ESM 工具调用。

`docs-alignment init` 扫描目标项目，创建 Wiki 初稿、影响映射、初始化报告和项目内 `.agents/skills/docs-alignment/SKILL.md`，并安全追加 [Agent 规则模板](../../../templates/AGENTS.md)。`--dry-run` 只报告计划，默认模式不覆盖文件，`--force` 才刷新工具生成的初稿。规则模板负责提醒 Agent 执行顺序和冲突处理；CLI 负责确定性扫描、匹配、结构校验和退出码，两者互不替代。

建议把 CLI 放进目标项目的 npm scripts 和 CI，把 `AGENTS.md` 纳入 Coding Agent 的默认上下文。工具不包含任何业务实体、私有 URL 或凭证。
