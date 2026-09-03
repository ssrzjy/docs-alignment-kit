# 从零接入 docs-alignment

本教程把一个普通 Node 项目接入文档维护工具。工具不需要复制源码目录，也不需要网络、数据库或业务服务。

## 1. 安装

在目标项目根目录执行：

```bash
npm install --save-dev ../docs-alignment-kit
```

本工具的版本提交并推送到 GitHub 后，也可以直接使用仓库地址：

```bash
npm install --save-dev git+https://github.com/ssrzjy/docs-alignment-kit.git
```

## 2. 初始化

```bash
npx docs-alignment init --dry-run
npx docs-alignment init
```

先用 `--dry-run` 验收扫描建议；它不会写文件。正式运行后，`init` 会在缺失时创建配置、报告、Wiki index、核心原则、候选模块页、impact map、冲突关系、Legacy manifest、项目 Skill 和 Agent 规则。如果 `AGENTS.md` 已存在，工具只追加带有 `docs-alignment-kit:start/end` 标记的区块，不会覆盖原内容。只有显式 `--force` 才覆盖工具生成文件。

## 3. 配置项目路径

编辑 `docs-alignment.config.json`。默认路径适合常见项目；非标准项目只需修改路径，不需改工具代码：

```json
{
  "wikiRoot": "knowledge",
  "index": "knowledge/index.md",
  "corePrinciples": "knowledge/foundations/core-principles.md",
  "impactMap": "knowledge/references/impact-map.json",
  "entryPoints": ["README.md", "CONTRIBUTING.md"],
  "pullRequestTemplate": null,
  "conflictRegister": null,
  "documentRelations": null,
  "legacyManifest": "knowledge/legacy-manifest.json",
  "agentFile": "AGENTS.md",
  "skillFile": ".agents/skills/docs-alignment/SKILL.md",
  "initReport": "docs-alignment.init-report.json",
  "checkCommand": "npm run docs:check",
  "checks": {
    "pullRequestTemplate": false,
    "conflictRelations": false
  }
}
```

配置路径都相对于 `projectRoot`，并且不能逃逸到项目目录之外。`checkCommand` 决定 impact 输出中始终建议的文档检查命令。

## 4. 编写影响路由

在配置的 `impactMap` 中，每条 route 声明代码路径、必读页面、需要复核的页面、机器契约和验证命令：

```json
{
  "schema_version": 1,
  "global_reading": ["AGENTS.md", "knowledge/index.md"],
  "routes": [{
    "id": "billing",
    "topics": ["billing"],
    "change_paths": ["src/billing/**"],
    "required_reading": ["knowledge/billing.md"],
    "maintained_docs": ["knowledge/billing.md"],
    "machine_contracts": ["schemas/billing.json"],
    "verification": ["npm test"]
  }]
}
```

`change_paths` 支持 `*`、`**` 和 `?`。没有匹配的路径会出现在 `unmatched_paths`，这只是提醒人工复核，不代表没有影响。

## 5. 接入 Agent 和 CI

建议在 `package.json` 中加入：

```json
{
  "scripts": {
    "docs:impact": "docs-alignment impact",
    "docs:check": "docs-alignment check"
  }
}
```

开发前让 Agent 运行 impact 并阅读输出；修改行为、契约、边界或流程时同步更新文档；修改后运行测试和 check。冲突来源要保留并登记，不能由 Agent 猜测“哪个才是真的”。

最后运行：

```bash
npm run docs:impact -- src/billing/invoice.ts
npm run docs:check
npm test
```
