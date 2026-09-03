# Minimal project example

这是一个不绑定业务的最小接入示例。它的 `package.json` 在本仓库中通过 `file:../..` 引用工具；复制到其他位置后，请改为实际的本地路径或 GitHub 地址。

```bash
npm install
npm run docs:check
npm run docs:impact -- --json src/example.ts
```

也可以直接调用 CLI：

```bash
npx docs-alignment check
npx docs-alignment impact --json src/example.ts
```

配置和 Wiki 根目录都可以改名；工具只依赖 [`docs-alignment.config.json`](docs-alignment.config.json)。
