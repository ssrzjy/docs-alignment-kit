# Documentation Alignment Agent Guide

这是本仓库的自动化维护入口。开始任何非琐碎变更前：

1. 阅读 [`docs/wiki/index.md`](docs/wiki/index.md) 和 [`docs/wiki/foundations/core-principles.md`](docs/wiki/foundations/core-principles.md)。
2. 使用仓库内的 [`docs-alignment` Skill](.agents/skills/docs-alignment/SKILL.md)，并对已知代码路径运行 `npm run docs:impact -- <planned-path>...`。
3. 检查机器契约、当前实现、测试和对应的 active Wiki 页面是否一致。
4. 代码、契约、边界、流程或用户可见行为变化时，在同一变更中更新维护页面。
5. 发现来源冲突时，保留双方表述并在迁移指南的冲突登记中记录，不要静默选边。

## Source-of-truth 顺序

1. 可执行机器契约（schema、迁移、OpenAPI/AsyncAPI）。
2. 当前生产代码与测试。
3. `docs/wiki/` 下的 `active` canonical 页面。
4. 操作手册和迁移记录。
5. 历史方案、提交说明和草稿。

## 交付前

```bash
npm run docs:impact
npm run docs:check
npm test
```

报告中应说明文档影响、更新的 canonical 页面、机器契约、冲突（如有）以及实际运行过的命令。除非用户另有要求，本仓库任务不执行 `git push`。
