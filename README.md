# docs-alignment-kit

通用版文档维护工具 v0.1.0。它把“代码变更需要同步哪些文档”变成可执行、可检查、可迁移的仓库约定，适合从空仓库开始接入，也适合逐步迁移已有文档。

这个项目本身不是业务框架，也不绑定 Workfolk 等业务概念。它是一个零依赖 npm CLI：目标项目安装它以后，CLI 在目标项目目录中读取配置、文档和 Git 状态。

## 快速开始

需要 Node.js 18+（推荐 20+）。在本仓库运行：

```bash
npm install
npm run docs:impact
npm run docs:check
npm test
```

在另一个项目中安装（本地目录或 GitHub 地址均可）：

```bash
npm install --save-dev ../docs-alignment-kit
# 或（本仓库版本提交并推送后）
npm install --save-dev git+https://github.com/ssrzjy/docs-alignment-kit.git
```

安装后，`docs-alignment` 会出现在目标项目的 `node_modules/.bin` 中：

```bash
npx docs-alignment init
npx docs-alignment init --dry-run
npx docs-alignment impact src/example.ts
npx docs-alignment check
```

为计划中的路径查询影响范围：

```bash
npm run docs:impact -- src/billing/invoice.ts test/billing.test.js
npm run docs:impact -- --json src/billing/invoice.ts
```

`docs:impact` 会输出最低必读文档、需要复核的维护页面、机器契约和建议验证命令。没有传路径时，它读取 Git 暂存区、工作区和未跟踪文件；也可以显式传入未来计划路径。

## CLI、配置和 Agent 规则

CLI 负责确定性工作：读取配置、匹配路径、检查文件和返回退出码。它不联网、不访问数据库，也不会猜测业务含义。

目标项目根目录可以放置 `docs-alignment.config.json`。没有配置文件时使用合理默认值；运行 `npx docs-alignment init` 会先扫描当前目录，再生成一份可修改的配置、初始化报告和 Wiki 初稿。常见项目可以这样配置：

```json
{
  "version": 1,
  "projectRoot": ".",
  "wikiRoot": "docs/wiki",
  "index": "docs/wiki/index.md",
  "corePrinciples": "docs/wiki/foundations/core-principles.md",
  "impactMap": "docs/wiki/references/code-document-impact-map.json",
  "entryPoints": ["README.md", "AGENTS.md"],
  "pullRequestTemplate": ".github/pull_request_template.md",
  "conflictRegister": "docs/wiki/references/knowledge-conflict-register.md",
  "documentRelations": "docs/wiki/references/document-knowledge-relations.json",
  "legacyManifest": "docs/legacy/manifest.json",
  "agentFile": "AGENTS.md",
  "skillFile": ".agents/skills/docs-alignment/SKILL.md",
  "initReport": "docs-alignment.init-report.json",
  "checkCommand": "npm run docs:check",
  "checks": {
    "frontmatter": true,
    "links": true,
    "navigation": true,
    "sourceOfTruth": true,
    "impactMap": true,
    "conflictRelations": true
  }
}
```

所有路径都相对于 `projectRoot`，并且必须留在该目录内；可选文件可以设为 `null`。`checks` 可以逐项关闭配置、frontmatter、链接、导航、source-of-truth、impact map、冲突关系、Legacy、入口和 PR 模板检查。`checkCommand` 是 impact 报告自动附加的基础检查命令。也可以用 `--config path/to/config.json` 指定配置。

Agent 规则和 CLI 是两层职责：

- `docs-alignment` 做确定性检查和影响分析；
- 初始化生成的 `.agents/skills/docs-alignment/SKILL.md` 告诉 Codex 等 Coding Agent 何时运行 impact/check、阅读哪些文档、何时同步更新文档，以及遇到冲突时必须交给人判断。

这里的 npm 包不是一个必须安装到全局的 Codex Skill。项目级 `AGENTS.md` 已足够让 Agent 获得规则；如果团队另有 Skill 分发体系，可以让 Skill 复用同一套规则并调用这个 CLI。v0.1.0 不会自动修改用户的全局 Codex 配置或全局 Skill 目录。

`init` 扫描 `src/`、`app/`、`lib/`、`packages/`、`services/`、`modules/`、基础设施、数据库/迁移、对象存储、API/Schema、测试和已有文档。它只生成文档维护初稿，不读取或改写业务代码内容。

- `init --dry-run`：只扫描并打印计划，不写任何文件。
- `init`：默认安全模式；不覆盖已有文件，`AGENTS.md` 只追加带 `docs-alignment-kit:start/end` 标记的规则。
- `init --force`：明确覆盖工具管理的生成文件；`AGENTS.md` 仍只进行安全、幂等追加。

初始化报告写入 `docs-alignment.init-report.json`，其中列出候选模块、数据库、对象存储、API/Schema、测试、现有文档、生成/跳过文件和待确认事项。模块页都是 `draft`，不会把目录名虚构成业务事实。

## 从零接入另一个项目

完整教程见 [`docs/getting-started.md`](docs/getting-started.md)，最小可运行示例见 [`examples/minimal-project/`](examples/minimal-project/)。简化流程：

1. 安装包并运行 `npx docs-alignment init`。
2. 在 impact map 中把 `src/**`、`tests/**`、schema 或迁移目录路由到项目 Wiki 页面。
3. 把项目的机器契约和入口文档写入配置及页面 frontmatter 的 `sources`。
4. 将 `docs-alignment impact`、`docs-alignment check` 加入开发脚本或 CI。
5. 让 Agent 读取并遵守 `AGENTS.md`；不要把业务规则硬编码进工具。

## 目录约定

- [`AGENTS.md`](AGENTS.md)：AI/自动化维护入口和 source-of-truth 顺序。
- [`docs/wiki/index.md`](docs/wiki/index.md)：当前文档导航与阅读路线。
- [`docs/wiki/foundations/`](docs/wiki/foundations/)：项目身份和不可变原则。
- [`docs/wiki/engineering/`](docs/wiki/engineering/)：文档治理与变更流程。
- [`docs/wiki/references/code-document-impact-map.json`](docs/wiki/references/code-document-impact-map.json)：代码路径到文档、契约和验证的机器可读映射。
- [`docs/wiki/roadmap/document-migration.md`](docs/wiki/roadmap/document-migration.md)：从旧文档迁移到 Wiki 的指南和记录模板。
- [`docs/examples/`](docs/examples/)：可复制的页面、迁移记录和影响报告示例。
- [`scripts/docs-impact.mjs`](scripts/docs-impact.mjs)：影响分析命令实现。
- [`scripts/docs-check.mjs`](scripts/docs-check.mjs)：文档结构、链接和映射校验实现。
- [`bin/docs-alignment.mjs`](bin/docs-alignment.mjs)：可安装的 CLI 入口。

## 设计原则

1. 机器契约（OpenAPI、JSON Schema、数据库迁移、类型定义）优先于 prose。
2. 当前实现和测试优先于历史计划；Wiki 的 active 页面只表达已验证的当前意图。
3. 发现冲突时保留双方来源，登记冲突，不自动替人做产品决策。
4. 文档检查应快速、离线、可重复；不要求业务服务或数据库才能运行。
5. 本版本只提供维护骨架，不会自动重写历史文档，也不会推送到远端。

## 发布信息

当前版本：`0.1.0`。这是一个可运行的通用基线；接入具体项目时，请先复制示例，再按项目的代码目录和契约补充影响路由。
