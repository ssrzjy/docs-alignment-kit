import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const node = process.execPath;
const cli = path.join(root, "bin/docs-alignment.mjs");

test("docs:check passes for the baseline", () => {
  const output = execFileSync(node, ["scripts/docs-check.mjs"], { cwd: root, encoding: "utf8" });
  assert.match(output, /Documentation checks passed/);
});

test("docs:impact routes application paths and includes global reading", () => {
  const output = execFileSync(node, ["scripts/docs-impact.mjs", "--json", "lib/impact.mjs"], { cwd: root, encoding: "utf8" });
  const report = JSON.parse(output);
  assert.deepEqual(report.changed_paths, ["lib/impact.mjs"]);
  assert.deepEqual(report.matched_routes.map((route) => route.id), ["application-code"]);
  assert.ok(report.required_reading.includes("AGENTS.md"));
  assert.deepEqual(report.unmatched_paths, []);
});

test("docs:impact reports unmatched paths without failing", () => {
  const output = execFileSync(node, ["scripts/docs-impact.mjs", "--json", "vendor/generated.bin"], { cwd: root, encoding: "utf8" });
  const report = JSON.parse(output);
  assert.deepEqual(report.matched_routes, []);
  assert.deepEqual(report.unmatched_paths, ["vendor/generated.bin"]);
});

test("CLI prints the text impact report", () => {
  const output = execFileSync(node, [cli, "impact", "lib/impact.mjs"], { cwd: root, encoding: "utf8" });
  assert.match(output, /Documentation impact/);
  assert.match(output, /Required reading:/);
  assert.match(output, /Maintained documentation to review:/);
  assert.match(output, /Machine contracts to review:/);
  assert.match(output, /Suggested verification:/);
});

test("globstar matches both direct and nested descendants", async () => {
  const { globMatches } = await import("../lib/impact.mjs");
  assert.equal(globMatches("docs/**/*.md", "docs/index.md"), true);
  assert.equal(globMatches("docs/**/*.md", "docs/guides/start.md"), true);
  assert.equal(globMatches("docs/**/*.md", "docs/index.txt"), false);
});

test("CLI reads a custom configuration and routes paths outside docs/wiki", () => {
  const project = createCustomProject();
  const output = execFileSync(node, [cli, "impact", "--config", "alignment.json", "--json", "lib/report.js"], {
    cwd: project,
    encoding: "utf8",
  });
  const report = JSON.parse(output);
  assert.deepEqual(report.matched_routes.map((route) => route.id), ["library"]);
  assert.deepEqual(report.required_reading, ["GUIDE.md", "knowledge/home.md"]);

  const checkOutput = execFileSync(node, [cli, "check", "--config", "alignment.json"], {
    cwd: project,
    encoding: "utf8",
  });
  assert.match(checkOutput, /Documentation checks passed/);
});

test("check returns non-zero and explains broken links", () => {
  const project = createCustomProject();
  fs.appendFileSync(path.join(project, "knowledge/home.md"), "\n[Broken](missing.md)\n");
  const result = spawnSync(node, [cli, "check", "--config", "alignment.json"], {
    cwd: project,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /broken local link: missing\.md/);
});

test("check rejects impact maps that point at missing documents", () => {
  const project = createCustomProject();
  const impactPath = path.join(project, "impact.json");
  const impact = JSON.parse(fs.readFileSync(impactPath, "utf8"));
  impact.routes[0].maintained_docs = ["knowledge/not-found.md"];
  fs.writeFileSync(impactPath, `${JSON.stringify(impact, null, 2)}\n`, "utf8");
  const result = spawnSync(node, [cli, "check", "--config", "alignment.json"], {
    cwd: project,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /maintained_docs target does not exist/);
});

test("check rejects impact maps with a missing change-path prefix", () => {
  const project = createCustomProject();
  const impactPath = path.join(project, "impact.json");
  const impact = JSON.parse(fs.readFileSync(impactPath, "utf8"));
  impact.routes[0].change_paths = ["does-not-exist/**"];
  fs.writeFileSync(impactPath, `${JSON.stringify(impact, null, 2)}\n`, "utf8");
  const result = spawnSync(node, [cli, "check", "--config", "alignment.json"], {
    cwd: project,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /pattern prefix does not exist/);
});

test("check rejects incomplete reciprocal conflict relations", () => {
  const project = createCustomProject();
  const configPath = path.join(project, "alignment.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  config.conflictRegister = "conflicts.md";
  config.documentRelations = "relations.json";
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(project, "conflicts.md"), "### KCR-001 — Example\n\n- Status: `pending-human-review`\n", "utf8");
  fs.writeFileSync(path.join(project, "relations.json"), JSON.stringify({
    schema_version: 1,
    documents: {
      "GUIDE.md": {
        relations: [{
          type: "conflicts_with",
          target: "knowledge/home.md",
          conflict_id: "KCR-001",
          conflict_kind: "behavior-conflict",
          detected_at: "2026-09-03T12:00:00Z",
          status: "pending-human-review",
        }],
      },
      "knowledge/home.md": { relations: [] },
    },
  }, null, 2) + "\n", "utf8");
  const result = spawnSync(node, [cli, "check", "--config", "alignment.json"], {
    cwd: project,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /missing reciprocal relation/);
});

test("check rejects duplicate active source-of-truth owners", () => {
  const project = createCustomProject();
  fs.writeFileSync(path.join(project, "knowledge/duplicate.md"), `---
title: Duplicate Owner
status: active
canonical: true
owners: [maintainers]
source_of_truth_for:
  - custom-navigation
code_paths: []
sources:
  - GUIDE.md
summary: Second active canonical page that intentionally claims an already owned topic for a failure test.
keywords: [duplicate, owner, test]
created: 2026-09-03
updated: 2026-09-03
last_verified_commit: test
---

# Duplicate Owner
`, "utf8");
  fs.appendFileSync(path.join(project, "knowledge/home.md"), "\n[Duplicate](duplicate.md)\n");
  const result = spawnSync(node, [cli, "check", "--config", "alignment.json"], {
    cwd: project,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /source_of_truth_for "custom-navigation" is claimed by both/);
});

test("init creates a usable scaffold and appends without overwriting AGENTS.md", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "docs-alignment-init-"));
  fs.writeFileSync(path.join(project, "AGENTS.md"), "Existing instructions.\n", "utf8");
  const first = execFileSync(node, [cli, "init"], { cwd: project, encoding: "utf8" });
  assert.match(first, /Initialized docs-alignment/);
  assert.equal(fs.readFileSync(path.join(project, "AGENTS.md"), "utf8").startsWith("Existing instructions."), true);
  assert.equal(fs.readFileSync(path.join(project, "AGENTS.md"), "utf8").match(/docs-alignment-kit:start/g).length, 1);
  assert.ok(fs.existsSync(path.join(project, "docs-alignment.config.json")));
  assert.ok(fs.existsSync(path.join(project, "docs/wiki/index.md")));

  const checkOutput = execFileSync(node, [cli, "check"], { cwd: project, encoding: "utf8" });
  assert.match(checkOutput, /Documentation checks passed/);

  const second = execFileSync(node, [cli, "init"], { cwd: project, encoding: "utf8" });
  assert.match(second, /Already existed/);
  assert.equal(fs.readFileSync(path.join(project, "AGENTS.md"), "utf8").match(/docs-alignment-kit:start/g).length, 1);
});

test("package exports the reusable programmatic API", async () => {
  const api = await import("../lib/index.mjs");
  assert.equal(typeof api.loadConfig, "function");
  assert.equal(typeof api.analyzeImpact, "function");
  assert.equal(typeof api.runCheck, "function");
  assert.equal(typeof api.initializeProject, "function");
});

test("the minimal example is valid and routes its source file", () => {
  const exampleRoot = path.join(root, "examples/minimal-project");
  const checkOutput = execFileSync(node, [cli, "check"], { cwd: exampleRoot, encoding: "utf8" });
  assert.match(checkOutput, /Documentation checks passed for 2 Wiki pages/);
  const report = JSON.parse(execFileSync(node, [cli, "impact", "--json", "src/example.ts"], {
    cwd: exampleRoot,
    encoding: "utf8",
  }));
  assert.deepEqual(report.matched_routes.map((route) => route.id), ["application"]);
});

test("CLI version is read from package metadata", () => {
  const packageVersion = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
  const output = execFileSync(node, [cli, "--version"], { cwd: root, encoding: "utf8" }).trim();
  assert.equal(output, packageVersion);
});

test("init scans modules, database, storage, contracts, tests, and writes an acceptance report", () => {
  const project = createScannableProject();
  const businessFile = path.join(project, "src/billing/invoice.ts");
  const businessBefore = fs.readFileSync(businessFile, "utf8");
  execFileSync(node, [cli, "init"], { cwd: project, encoding: "utf8" });
  assert.equal(fs.readFileSync(businessFile, "utf8"), businessBefore);

  const report = JSON.parse(fs.readFileSync(path.join(project, "docs-alignment.init-report.json"), "utf8"));
  assert.ok(report.scanned_modules.some((module) => module.paths.includes("src/billing")));
  assert.ok(report.scanned_modules.some((module) => module.paths.includes("services/notifications")));
  assert.ok(report.database_paths.includes("db"));
  assert.ok(report.database_paths.includes("prisma"));
  assert.ok(report.database_contract_paths.includes("db/migrations/001.sql"));
  assert.ok(report.database_contract_paths.includes("prisma/schema.prisma"));
  assert.ok(report.object_storage_paths.includes("object-storage"));
  assert.ok(report.object_storage_paths.includes("src/storage"));
  assert.ok(report.api_schema_paths.includes("openapi/service.yaml"));
  assert.ok(report.api_schema_paths.includes("schemas"));
  assert.ok(report.test_paths.includes("tests"));
  assert.ok(report.existing_documentation.includes("docs/notes/history.md"));
  assert.ok(report.generated_files.includes("docs-alignment.config.json"));
  assert.ok(report.generated_files.includes(".agents/skills/docs-alignment/SKILL.md"));
  assert.equal(report.safety.business_code_modified, false);

  const config = JSON.parse(fs.readFileSync(path.join(project, "docs-alignment.config.json"), "utf8"));
  assert.equal(config.corePrinciples, "docs/wiki/foundations/core-principles.md");
  assert.equal(config.legacyManifest, "docs/legacy/manifest.json");
  assert.equal(config.skillFile, ".agents/skills/docs-alignment/SKILL.md");

  const map = JSON.parse(fs.readFileSync(path.join(project, config.impactMap), "utf8"));
  const databaseRoute = map.routes.find((route) => route.id === "database");
  assert.deepEqual(databaseRoute.machine_contracts, ["db/migrations/001.sql", "prisma/schema.prisma"]);
  const storageRoute = map.routes.find((route) => route.id === "object-storage");
  assert.deepEqual(storageRoute.machine_contracts, []);
  const apiRoute = map.routes.find((route) => route.id === "api-and-schemas");
  assert.ok(apiRoute.machine_contracts.includes("openapi/service.yaml"));
  assert.ok(apiRoute.machine_contracts.every((relativePath) => fs.existsSync(path.join(project, relativePath))));

  assert.ok(fs.existsSync(path.join(project, "docs/wiki/modules/src-billing/index.md")));
  assert.match(fs.readFileSync(path.join(project, "docs/wiki/modules/src-billing/index.md"), "utf8"), /status: draft/);
  assert.ok(fs.existsSync(path.join(project, "docs/wiki/modules/database/index.md")));
  assert.ok(fs.existsSync(path.join(project, "docs/wiki/modules/object-storage/index.md")));
});

test("init --dry-run scans and reports without writing any files", () => {
  const project = createScannableProject();
  const before = listRelativeFiles(project);
  const output = execFileSync(node, [cli, "init", "--dry-run"], { cwd: project, encoding: "utf8" });
  assert.match(output, /Dry-run initialization plan/);
  assert.match(output, /Dry-run made no filesystem changes/);
  assert.deepEqual(listRelativeFiles(project), before);
  assert.equal(fs.existsSync(path.join(project, "docs-alignment.config.json")), false);
  assert.equal(fs.existsSync(path.join(project, "docs-alignment.init-report.json")), false);
});

test("safe init preserves existing generated files and --force replaces them", () => {
  const project = createScannableProject();
  execFileSync(node, [cli, "init"], { cwd: project, encoding: "utf8" });
  const pagePath = path.join(project, "docs/wiki/modules/src-billing/index.md");
  fs.writeFileSync(pagePath, "user-owned module page\n", "utf8");
  execFileSync(node, [cli, "init"], { cwd: project, encoding: "utf8" });
  assert.equal(fs.readFileSync(pagePath, "utf8"), "user-owned module page\n");
  execFileSync(node, [cli, "init", "--force"], { cwd: project, encoding: "utf8" });
  assert.match(fs.readFileSync(pagePath, "utf8"), /status: draft/);
});

test("init scans process.cwd instead of the package repository", () => {
  const project = createScannableProject();
  execFileSync(node, [cli, "init"], { cwd: project, encoding: "utf8" });
  const report = JSON.parse(fs.readFileSync(path.join(project, "docs-alignment.init-report.json"), "utf8"));
  assert.equal(fs.realpathSync(report.project_root), fs.realpathSync(project));
  assert.ok(report.scanned_modules.some((module) => module.paths.includes("src/billing")));
  assert.equal(report.scanned_modules.some((module) => module.paths.includes("lib/init.mjs")), false);
});

test("installed npm CLI exposes init, impact, and check without install-time mutation", () => {
  const project = createScannableProject();
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), "docs-alignment-npm-cache-"));
  execFileSync("npm", ["install", "--ignore-scripts", "--cache", cache, root], {
    cwd: project,
    encoding: "utf8",
    stdio: "pipe",
  });
  assert.equal(fs.existsSync(path.join(project, "docs-alignment.config.json")), false);
  const installedCli = path.join(project, "node_modules/.bin/docs-alignment");
  assert.ok(fs.existsSync(installedCli));
  execFileSync(installedCli, ["init"], { cwd: project, encoding: "utf8" });
  const impact = JSON.parse(execFileSync(installedCli, ["impact", "--json", "src/billing/invoice.ts"], {
    cwd: project,
    encoding: "utf8",
  }));
  assert.ok(impact.matched_routes.some((route) => route.id === "src-billing"));
  assert.match(execFileSync(installedCli, ["check"], { cwd: project, encoding: "utf8" }), /Documentation checks passed/);
});

function createCustomProject() {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "docs-alignment-config-"));
  fs.mkdirSync(path.join(project, "knowledge"), { recursive: true });
  fs.mkdirSync(path.join(project, "lib"), { recursive: true });
  fs.writeFileSync(path.join(project, "GUIDE.md"), "# Guide\n\n[Home](knowledge/home.md)\n", "utf8");
  fs.writeFileSync(path.join(project, "lib/report.js"), "export {};\n", "utf8");
  fs.writeFileSync(path.join(project, "knowledge/home.md"), `---
title: Knowledge Home
status: active
canonical: true
owners: [maintainers]
source_of_truth_for:
  - custom-navigation
code_paths: []
sources:
  - GUIDE.md
summary: Custom Wiki entry point used to verify configuration-driven documentation checks and path resolution.
keywords: [custom, configuration, example]
created: 2026-09-03
updated: 2026-09-03
last_verified_commit: test
---

# Knowledge Home
`, "utf8");
  fs.writeFileSync(path.join(project, "impact.json"), JSON.stringify({
    schema_version: 1,
    global_reading: ["GUIDE.md", "knowledge/home.md"],
    routes: [{
      id: "library",
      topics: ["library"],
      change_paths: ["lib/**"],
      required_reading: ["knowledge/home.md"],
      maintained_docs: ["knowledge/home.md"],
      machine_contracts: [],
      verification: ["node --test"],
    }],
  }, null, 2) + "\n", "utf8");
  fs.writeFileSync(path.join(project, "alignment.json"), JSON.stringify({
    version: 1,
    wikiRoot: "knowledge",
    index: "knowledge/home.md",
    impactMap: "impact.json",
    entryPoints: ["GUIDE.md"],
    pullRequestTemplate: null,
    conflictRegister: null,
    documentRelations: null,
    legacyManifest: "legacy.json",
    agentFile: "AGENTS.md",
    skillFile: null,
    checks: {
      configuration: false,
      legacyManifest: false,
    },
  }, null, 2) + "\n", "utf8");
  return project;
}

function createScannableProject() {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "docs-alignment-scan-"));
  for (const directory of [
    "src/billing", "src/storage", "services/notifications", "db/migrations", "prisma",
    "object-storage", "openapi", "schemas", "tests", "docs/notes",
  ]) fs.mkdirSync(path.join(project, directory), { recursive: true });
  fs.writeFileSync(path.join(project, "src/billing/invoice.ts"), "export const invoice = true;\n", "utf8");
  fs.writeFileSync(path.join(project, "src/storage/client.ts"), "export const storage = true;\n", "utf8");
  fs.writeFileSync(path.join(project, "services/notifications/index.js"), "export {};\n", "utf8");
  fs.writeFileSync(path.join(project, "db/migrations/001.sql"), "select 1;\n", "utf8");
  fs.writeFileSync(path.join(project, "prisma/schema.prisma"), "datasource db { provider = \"sqlite\" url = \"file:test.db\" }\n", "utf8");
  fs.writeFileSync(path.join(project, "object-storage/adapter.js"), "export {};\n", "utf8");
  fs.writeFileSync(path.join(project, "openapi/service.yaml"), "openapi: 3.1.0\ninfo: {title: Example, version: 1.0.0}\npaths: {}\n", "utf8");
  fs.writeFileSync(path.join(project, "schemas/event.schema.json"), "{}\n", "utf8");
  fs.writeFileSync(path.join(project, "tests/invoice.test.js"), "// test fixture\n", "utf8");
  fs.writeFileSync(path.join(project, "docs/notes/history.md"), "# Historical note\n", "utf8");
  fs.writeFileSync(path.join(project, "README.md"), "# Scannable project\n", "utf8");
  fs.writeFileSync(path.join(project, "AGENTS.md"), "Existing agent rules.\n", "utf8");
  fs.writeFileSync(path.join(project, "package.json"), JSON.stringify({
    name: "scannable-project",
    private: true,
    scripts: { test: "node --test" },
  }, null, 2) + "\n", "utf8");
  return project;
}

function listRelativeFiles(rootPath) {
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolutePath);
      else files.push(path.relative(rootPath, absolutePath).split(path.sep).join("/"));
    }
  };
  walk(rootPath);
  return files.sort();
}
