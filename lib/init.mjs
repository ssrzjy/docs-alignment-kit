import fs from "node:fs";
import path from "node:path";
import { DEFAULT_CONFIG, loadConfig, relativeToProject, resolveConfig } from "./config.mjs";
import { scanProject } from "./scan.mjs";

const AGENT_START = "<!-- docs-alignment-kit:start -->";
const AGENT_END = "<!-- docs-alignment-kit:end -->";

export function initializeProject({ cwd = process.cwd(), configPath, dryRun = false, force = false } = {}) {
  const invocationRoot = path.resolve(cwd);
  const requestedConfigPath = path.resolve(invocationRoot, configPath || "docs-alignment.config.json");
  const existingConfig = fs.existsSync(requestedConfigPath);
  const existingResolvedConfig = existingConfig
    ? loadConfig({ cwd: invocationRoot, configPath: path.relative(invocationRoot, requestedConfigPath) })
    : null;
  const scanRoot = existingResolvedConfig?.projectRoot || invocationRoot;
  const scan = scanProject(scanRoot);
  const existingConfigDocument = existingConfig ? JSON.parse(fs.readFileSync(requestedConfigPath, "utf8")) : null;
  const configDocument = existingConfig && !force ? existingConfigDocument : buildInitialConfig(scan, existingConfigDocument || {});
  const config = resolveConfig(configDocument, {
    cwd: invocationRoot,
    configPath: requestedConfigPath,
    configExists: existingConfig,
  });

  const state = { created: [], overwritten: [], skipped: [], planned: [], needsConfirmation: [] };
  const operations = buildOperations(config, scan, configDocument, existingConfig);
  assertOperationsDoNotTargetBusinessCode(config, scan, operations);
  for (const operation of operations) applyOperation(operation, { config, dryRun, force, state });

  state.needsConfirmation.push(...buildConfirmationList(scan, state));
  const reportRelative = relativeToProject(config, config.initReportPath);
  const reportExists = fs.existsSync(config.initReportPath);
  if (reportExists && !force) state.skipped.push(reportRelative);
  else state.planned.push(reportRelative);
  if (!dryRun && (!reportExists || force)) {
    if (reportExists) state.overwritten.push(reportRelative);
    else state.created.push(reportRelative);
  }
  const report = buildReport(config, scan, state, { dryRun, force });
  if (!dryRun && (!reportExists || force)) {
    ensureParent(config.initReportPath);
    fs.writeFileSync(config.initReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  return {
    config,
    scan,
    report,
    created: unique(state.created),
    overwritten: unique(state.overwritten),
    skipped: unique(state.skipped),
    planned: unique(state.planned),
    dryRun,
    force,
  };
}

function buildInitialConfig(scan, existing = {}) {
  const entryPoints = ["README.md", "AGENTS.md", "package.json"]
    .filter((relativePath) => scan.detected_files.includes(relativePath) || relativePath === "AGENTS.md");
  return {
    ...DEFAULT_CONFIG,
    ...existing,
    entryPoints: existing.entryPoints || entryPoints,
    checks: { ...DEFAULT_CONFIG.checks, ...(existing.checks || {}) },
  };
}

function buildOperations(config, scan, configDocument, existingConfig) {
  const operations = [];
  operations.push({
    path: config.configPath,
    content: `${JSON.stringify(configDocument, null, 2)}\n`,
    kind: "configuration",
  });
  operations.push({ path: config.corePrinciplesPath, content: renderCorePrinciples(config, scan), kind: "documentation" });

  const modulePages = scan.modules.map((module) => ({
    module,
    path: path.join(config.wikiRootPath, "modules", module.id, "index.md"),
  }));
  for (const page of modulePages) {
    operations.push({ path: page.path, content: renderModulePage(config, page.module), kind: "documentation" });
  }

  const specialPages = [];
  if (scan.database_paths.length) specialPages.push({ id: "database", title: "Database", paths: scan.database_paths, kind: "database" });
  if (scan.object_storage_paths.length) specialPages.push({ id: "object-storage", title: "Object and File Storage", paths: scan.object_storage_paths, kind: "object storage" });
  for (const special of specialPages) {
    const existingModulePage = modulePages.some((page) => page.module.id === special.id);
    if (!existingModulePage) operations.push({
      path: path.join(config.wikiRootPath, "modules", special.id, "index.md"),
      content: renderSpecialPage(config, special),
      kind: "documentation",
    });
  }

  operations.push({
    path: config.indexPath,
    content: renderIndex(config, scan, modulePages, specialPages),
    kind: "documentation",
  });
  operations.push({ path: config.impactMapPath, content: renderImpactMap(config, scan, modulePages, specialPages), kind: "mapping" });
  if (config.documentRelationsPath) operations.push({
    path: config.documentRelationsPath,
    content: `${JSON.stringify({
      schema_version: 1,
      description: "Reciprocal source-level conflict edges. Add both directions for every registered conflict.",
      documents: {},
    }, null, 2)}\n`,
    kind: "conflict-relations",
  });
  if (config.conflictRegisterPath) operations.push({ path: config.conflictRegisterPath, content: renderConflictRegister(config), kind: "documentation" });
  if (config.legacyManifestPath) operations.push({
    path: config.legacyManifestPath,
    content: `${JSON.stringify({
      schema_version: 1,
      description: "Initial legacy-document inventory. Review and classify existing documents before treating them as current authority.",
      source_count: legacySources(config, scan).length,
      documents: legacySources(config, scan).map((originalPath) => ({
        original_path: originalPath,
        document_kind: "unclassified",
        migration_status: "unreviewed",
        compiled_into: [],
        conflict_ids: [],
      })),
    }, null, 2)}\n`,
    kind: "legacy-manifest",
  });
  if (config.skillFilePath) operations.push({ path: config.skillFilePath, content: renderSkill(config), kind: "agent-skill" });
  if (config.agentFilePath) operations.push({ path: config.agentFilePath, content: renderAgentBlock(config), kind: "agent-rules", appendMarked: true });
  if (config.pullRequestTemplatePath) operations.push({ path: config.pullRequestTemplatePath, content: renderPullRequestTemplate(), kind: "pull-request-template" });
  return operations;
}

function legacySources(config, scan) {
  const wikiPrefix = `${config.wikiRoot.replace(/\/+$/, "")}/`;
  const legacyManifest = relativeToProject(config, config.legacyManifestPath);
  return scan.existing_documentation.filter((relativePath) => !relativePath.startsWith(wikiPrefix) && relativePath !== legacyManifest);
}

function applyOperation(operation, { config, dryRun, force, state }) {
  const relativePath = relativeToProject(config, operation.path);
  const exists = fs.existsSync(operation.path);
  if (operation.appendMarked && exists) {
    const existing = fs.readFileSync(operation.path, "utf8");
    if (existing.includes(AGENT_START)) {
      state.skipped.push(relativePath);
      return;
    }
    state.planned.push(`${relativePath} (append)`);
    if (dryRun) return;
    ensureParent(operation.path);
    const separator = existing.length && !existing.endsWith("\n") ? "\n\n" : existing.length ? "\n" : "";
    fs.writeFileSync(operation.path, `${existing}${separator}${operation.content}\n`, "utf8");
    state.created.push(`${relativePath} (appended)`);
    return;
  }
  if (exists && !force) {
    state.skipped.push(relativePath);
    return;
  }
  state.planned.push(relativePath);
  if (dryRun) return;
  ensureParent(operation.path);
  fs.writeFileSync(operation.path, operation.content, "utf8");
  if (exists) state.overwritten.push(relativePath);
  else state.created.push(relativePath);
}

function buildReport(config, scan, state, options) {
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    project_root: config.projectRoot,
    mode: options.dryRun ? "dry-run" : options.force ? "force" : "safe",
    scanned_modules: scan.modules,
    database_paths: scan.database_paths,
    database_contract_paths: scan.database_contract_paths,
    object_storage_paths: scan.object_storage_paths,
    api_schema_paths: scan.api_schema_paths,
    test_paths: scan.test_paths,
    existing_documentation: scan.existing_documentation,
    generated_files: unique(options.dryRun ? state.planned : [...state.created, ...state.overwritten]),
    skipped_existing_files: unique(state.skipped),
    needs_user_confirmation: unique(state.needsConfirmation),
    next_commands: ["docs-alignment impact <planned-path>...", config.checkCommand],
    safety: {
      business_code_modified: false,
      git_commit_executed: false,
      git_push_executed: false,
    },
  };
}

function assertOperationsDoNotTargetBusinessCode(config, scan, operations) {
  const businessRoots = scan.scanned_roots.map((relativePath) => path.resolve(config.projectRoot, relativePath));
  for (const operation of operations) {
    if (businessRoots.some((root) => operation.path === root || operation.path.startsWith(`${root}${path.sep}`))) {
      throw new Error(`refusing to initialize inside detected business code: ${relativeToProject(config, operation.path)}`);
    }
  }
}

function buildConfirmationList(scan, state) {
  const confirmations = [];
  if (scan.modules.length) confirmations.push("Confirm that scanned module candidates match actual business and ownership boundaries before promoting draft pages.");
  else confirmations.push("No source module candidates were detected; add project-specific routes and module pages manually if needed.");
  if (scan.existing_documentation.length) confirmations.push("Classify existing documents and decide which sources are current authorities versus historical references.");
  if (scan.api_schema_paths.length) confirmations.push("Confirm which detected API/schema artifacts are authoritative machine contracts.");
  if (scan.database_paths.length) confirmations.push("Confirm database ownership, migration authority, and operational boundaries in the generated database draft.");
  if (scan.object_storage_paths.length) confirmations.push("Confirm object/file storage durability, security, and ownership boundaries in the generated storage draft.");
  if (state.skipped.length) confirmations.push("Review skipped existing files; safe init left them unchanged, so manual merging may be required.");
  return confirmations;
}

function renderIndex(config, scan, modulePages, specialPages) {
  const source = firstExistingSource(config, scan);
  const links = [
    `- [Core Principles](${relativeLink(config.indexPath, config.corePrinciplesPath)})`,
    ...modulePages.map(({ module, path: pagePath }) => `- [${escapeMarkdown(module.label)}](${relativeLink(config.indexPath, pagePath)}) — candidate module; requires human confirmation.`),
    ...specialPages.filter((special) => !modulePages.some((page) => page.module.id === special.id)).map((special) => {
      const pagePath = path.join(config.wikiRootPath, "modules", special.id, "index.md");
      return `- [${special.title}](${relativeLink(config.indexPath, pagePath)}) — detected ${special.kind}; requires human confirmation.`;
    }),
  ];
  return `---
title: Documentation Wiki
status: active
canonical: true
owners: [maintainers]
source_of_truth_for:
  - wiki-navigation
code_paths: []
sources:
  - ${source}
summary: Initial navigation map generated from repository structure for human review before it becomes authoritative project documentation.
keywords: [documentation, wiki, navigation, initialization]
created: ${today()}
updated: ${today()}
last_verified_commit: unverified-initial-draft
---

# Documentation Wiki

This is an initialization draft generated from repository paths. It does not assert product behavior or module ownership. Review every candidate before relying on it as design authority.

## Reading order

${links.join("\n")}

Run \`docs-alignment impact <path>\` before a change and \`${config.checkCommand}\` before handoff.
`;
}

function renderCorePrinciples(config, scan) {
  return `---
title: Documentation Core Principles
status: active
canonical: true
owners: [maintainers]
source_of_truth_for:
  - documentation-source-of-truth
  - documentation-conflict-handling
code_paths: []
sources:
  - ${firstExistingSource(config, scan)}
summary: Initial governance principles for aligning implementation, machine contracts, maintained documentation, and unresolved source conflicts.
keywords: [principles, alignment, contracts, conflicts]
created: ${today()}
updated: ${today()}
last_verified_commit: unverified-initial-draft
---

# Documentation Core Principles

- Machine contracts and current tests outrank historical prose for the behavior they execute or validate.
- One active canonical page owns each declared source-of-truth topic.
- Preserve contradictory claims and ask the user to resolve intent; do not guess a winner.
- Update maintained documentation in the same change when behavior, contracts, boundaries, or workflows change.
- Generated module pages are drafts until a human verifies their boundaries and sources.
`;
}

function renderModulePage(config, module) {
  return `---
title: ${frontmatterText(module.label)} Module
status: draft
canonical: false
owners: [unassigned]
source_of_truth_for: []
code_paths:
${yamlList(module.paths)}
sources: []
summary: Initial module candidate inferred from repository structure; responsibilities, boundaries, contracts, and owners require human confirmation.
keywords: [module, draft, initialization, ${module.id}]
created: ${today()}
updated: ${today()}
last_verified_commit: unverified-initial-draft
---

# ${escapeMarkdown(module.label)} Module

Detected from: ${module.paths.map((value) => `\`${value}\``).join(", ")}.

This page is intentionally a draft. Confirm the module boundary, owner, public behavior, dependencies, machine contracts, and verification commands before promoting it.
`;
}

function renderSpecialPage(config, special) {
  return `---
title: ${special.title}
status: draft
canonical: false
owners: [unassigned]
source_of_truth_for: []
code_paths:
${yamlList(special.paths)}
sources: []
summary: Initial ${special.kind} documentation draft inferred only from existing repository paths and awaiting human confirmation of behavior and authority.
keywords: [${special.id}, draft, initialization]
created: ${today()}
updated: ${today()}
last_verified_commit: unverified-initial-draft
---

# ${special.title}

Detected paths: ${special.paths.map((value) => `\`${value}\``).join(", ")}.

Confirm ownership, authority, lifecycle, security, recovery, and operational boundaries. No business facts have been inferred from directory names alone.
`;
}

function renderImpactMap(config, scan, modulePages, specialPages) {
  const globalReading = unique([config.agentFilePath, config.skillFilePath, config.indexPath, config.corePrinciplesPath]
    .filter(Boolean).map((filePath) => relativeToProject(config, filePath)));
  const verification = unique([...scan.suggested_verification, config.checkCommand]);
  const routes = [];
  for (const { module, path: pagePath } of modulePages) {
    routes.push(route(module.id, [`candidate module ${module.label}`], module.paths.map((value) => `${value}/**`), [pagePath], [], verification, config));
  }
  if (scan.database_paths.length) {
    const pagePath = path.join(config.wikiRootPath, "modules/database/index.md");
    routes.push(route("database", ["database", "persistence", "migrations"], scan.database_paths.map((value) => `${value}/**`), [pagePath], scan.database_contract_paths, verification, config));
  }
  if (scan.object_storage_paths.length) {
    const pagePath = path.join(config.wikiRootPath, "modules/object-storage/index.md");
    routes.push(route("object-storage", ["object storage", "file storage"], scan.object_storage_paths.map((value) => `${value}/**`), [pagePath], [], verification, config));
  }
  if (scan.api_schema_paths.length) {
    const contractFiles = scan.api_schema_paths.filter((value) => isFile(config.projectRoot, value));
    routes.push(route("api-and-schemas", ["API", "machine contracts", "schemas"], scan.api_schema_paths.map((value) => asChangePattern(config, value)), [config.indexPath], contractFiles, verification, config));
  }
  if (scan.test_paths.length) {
    routes.push(route("tests", ["tests", "verification"], scan.test_paths.map((value) => `${value}/**`), [config.indexPath], [], verification, config));
  }
  if (!routes.length) routes.push(route("project", ["project files"], ["**"], [config.indexPath], [], verification, config));
  return `${JSON.stringify({
    schema_version: 1,
    description: "Initial path-to-document routes generated only from repository paths that existed during initialization.",
    global_reading: globalReading,
    routes: dedupeRoutes(routes),
  }, null, 2)}\n`;
}

function route(id, topics, changePaths, maintainedDocs, machineContracts, verification, config) {
  const maintained = unique(maintainedDocs.map((value) => typeof value === "string" && path.isAbsolute(value) ? relativeToProject(config, value) : value));
  return {
    id,
    topics,
    change_paths: unique(changePaths),
    required_reading: unique([relativeToProject(config, config.corePrinciplesPath), ...maintained]),
    maintained_docs: maintained,
    machine_contracts: unique(machineContracts),
    verification,
  };
}

function renderConflictRegister(config) {
  return `---
title: Knowledge Conflict Register
status: archived
canonical: false
owners: [maintainers]
source_of_truth_for: []
code_paths: []
sources:
  - ${relativeToProject(config, config.indexPath)}
summary: Neutral register for contradictory documentation, code, and machine-contract claims awaiting an explicit human decision.
keywords: [conflict, provenance, human-review]
created: ${today()}
updated: ${today()}
last_verified_commit: unverified-initial-draft
---

# Knowledge Conflict Register

No conflicts have been registered. When sources disagree, preserve both claims and record a stable KCR identifier, provenance, detection time, and status instead of guessing.
`;
}

function renderSkill(config) {
  return `---
name: docs-alignment
description: Keep project code, machine contracts, and maintained documentation aligned during development; use before and after changes that may affect behavior, boundaries, contracts, workflows, or documentation.
---

# Documentation Alignment

For Codex and compatible Coding Agents, follow this workflow whenever a development change can affect maintained knowledge.

Use the repository configuration at \`${relativeToProject(config, config.configPath)}\`.

1. Before modifying code, run \`docs-alignment impact <planned-path>...\`.
2. Read every reported \`required_reading\` item and inspect the reported machine contracts and maintained documentation.
3. When behavior, boundaries, contracts, or workflows change, update the relevant maintained documentation in the same change.
4. Run the smallest relevant code and contract tests after implementation.
5. Run \`${config.checkCommand}\` last.
6. If documentation, code, tests, or contracts disagree and intent is uncertain, preserve the evidence and report the conflict to the user. Do not guess a winner.

Generated module pages are candidates, not business truth. Do not promote a draft or assign authority without evidence or user confirmation.
`;
}

function renderAgentBlock(config) {
  return `${AGENT_START}
## Documentation Alignment

Use the repository [docs-alignment Skill](${relativeLink(config.agentFilePath, config.skillFilePath)}) for code or documentation changes. Run \`docs-alignment impact <planned-path>...\` before editing, read the reported documentation and machine contracts, update maintained docs when behavior or boundaries change, run relevant tests, and finish with \`${config.checkCommand}\`. Report unresolved conflicts to the user instead of guessing.
${AGENT_END}`;
}

function renderPullRequestTemplate() {
  return `## Problem and Context

## Goals and Non-Goals

## Solution and Feature Design

## Existing Architecture and Conflict Assessment

Architecture Conflict:

### Flow or Architecture Diagram

### Behavior and Boundaries

### Contracts, Data, and Migration

## Code Changes and Logic

### Key Logic Walkthrough

### Intentionally Unchanged

## Risks, Rollback, and Follow-Ups

## Review Guide

## Documentation Impact

Documentation Impact:

### Canonical Pages

### Machine Contracts

### Conflicts

## Verification

docs-alignment impact
docs-alignment check
`;
}

function firstExistingSource(config, scan) {
  const source = [config.agentFile, "README.md", "package.json"]
    .filter(Boolean)
    .find((relativePath) => scan.detected_files.includes(relativePath));
  return source || relativeToProject(config, config.configPath);
}

function relativeLink(fromFile, toFile) {
  return path.relative(path.dirname(fromFile), toFile).split(path.sep).join("/");
}

function yamlList(values) {
  return values.length ? values.map((value) => `  - ${value}`).join("\n") : "  []";
}

function asChangePattern(config, relativePath) {
  try {
    return fs.statSync(path.resolve(config.projectRoot, relativePath)).isDirectory() ? `${relativePath}/**` : relativePath;
  } catch {
    return relativePath;
  }
}

function isFile(projectRoot, relativePath) {
  try { return fs.statSync(path.resolve(projectRoot, relativePath)).isFile(); }
  catch { return false; }
}

function dedupeRoutes(routes) {
  const byId = new Map();
  for (const candidate of routes) {
    const current = byId.get(candidate.id);
    if (!current) {
      byId.set(candidate.id, candidate);
      continue;
    }
    for (const field of ["topics", "change_paths", "required_reading", "maintained_docs", "machine_contracts", "verification"]) {
      current[field] = unique([...current[field], ...candidate[field]]);
    }
  }
  return [...byId.values()];
}

function frontmatterText(value) {
  return String(value).replace(/[\r\n]/g, " ").replace(/:/g, "-");
}

function escapeMarkdown(value) { return String(value).replace(/[\[\]]/g, ""); }
function ensureParent(filePath) { fs.mkdirSync(path.dirname(filePath), { recursive: true }); }
function today() { return new Date().toISOString().slice(0, 10); }
function unique(values) { return [...new Set(values)].sort(); }
