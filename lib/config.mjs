import fs from "node:fs";
import path from "node:path";

export const DEFAULT_CONFIG = Object.freeze({
  version: 1,
  projectRoot: ".",
  wikiRoot: "docs/wiki",
  index: "docs/wiki/index.md",
  corePrinciples: "docs/wiki/foundations/core-principles.md",
  impactMap: "docs/wiki/references/code-document-impact-map.json",
  entryPoints: ["AGENTS.md"],
  pullRequestTemplate: ".github/pull_request_template.md",
  conflictRegister: "docs/wiki/references/knowledge-conflict-register.md",
  documentRelations: "docs/wiki/references/document-knowledge-relations.json",
  legacyManifest: "docs/legacy/manifest.json",
  agentFile: "AGENTS.md",
  skillFile: ".agents/skills/docs-alignment/SKILL.md",
  initReport: "docs-alignment.init-report.json",
  checkCommand: "docs-alignment check",
  checks: {
    configuration: true,
    frontmatter: true,
    links: true,
    navigation: true,
    sourceOfTruth: true,
    impactMap: true,
    conflictRelations: true,
    legacyManifest: true,
    entryPoints: true,
    pullRequestTemplate: true,
  },
});

export function loadConfig({ cwd = process.cwd(), configPath } = {}) {
  const invocationRoot = path.resolve(cwd);
  const resolvedConfigPath = path.resolve(invocationRoot, configPath || "docs-alignment.config.json");
  const configExists = fs.existsSync(resolvedConfigPath);
  if (configPath && !configExists) {
    throw new Error(`configuration file does not exist: ${path.relative(invocationRoot, resolvedConfigPath) || resolvedConfigPath}`);
  }

  let userConfig = {};
  if (configExists) {
    try {
      userConfig = JSON.parse(fs.readFileSync(resolvedConfigPath, "utf8"));
    } catch (error) {
      throw new Error(`invalid configuration JSON at ${resolvedConfigPath}: ${error.message}`);
    }
    if (!userConfig || typeof userConfig !== "object" || Array.isArray(userConfig)) {
      throw new Error(`configuration must be a JSON object: ${resolvedConfigPath}`);
    }
  }

  return resolveConfig(userConfig, {
    cwd: invocationRoot,
    configPath: resolvedConfigPath,
    configExists,
  });
}

export function resolveConfig(userConfig = {}, { cwd = process.cwd(), configPath, configExists = false } = {}) {
  const invocationRoot = path.resolve(cwd);
  const resolvedConfigPath = path.resolve(invocationRoot, configPath || "docs-alignment.config.json");
  const merged = {
    ...DEFAULT_CONFIG,
    ...userConfig,
    entryPoints: userConfig.entryPoints === undefined ? [...DEFAULT_CONFIG.entryPoints] : userConfig.entryPoints,
    checks: { ...DEFAULT_CONFIG.checks, ...(userConfig.checks || {}) },
  };
  if (merged.version !== 1) throw new Error("configuration version must be 1");
  if (typeof merged.projectRoot !== "string") throw new Error("configuration projectRoot must be a string");
  if (!Array.isArray(merged.entryPoints)) throw new Error("configuration entryPoints must be an array");
  for (const field of ["wikiRoot", "index", "corePrinciples", "impactMap", "initReport"]) {
    if (typeof merged[field] !== "string") throw new Error(`configuration ${field} must be a string`);
  }
  for (const field of ["conflictRegister", "documentRelations", "legacyManifest", "agentFile", "skillFile"]) {
    if (merged[field] !== null && typeof merged[field] !== "string") {
      throw new Error(`configuration ${field} must be a string or null`);
    }
  }
  if (merged.pullRequestTemplate !== null && typeof merged.pullRequestTemplate !== "string") {
    throw new Error("configuration pullRequestTemplate must be a string or null");
  }
  if (typeof merged.checkCommand !== "string" || !merged.checkCommand.trim()) {
    throw new Error("configuration checkCommand must be a non-empty string");
  }
  if (!merged.checks || typeof merged.checks !== "object" || Array.isArray(merged.checks)) {
    throw new Error("configuration checks must be an object");
  }
  for (const [name, enabled] of Object.entries(merged.checks)) {
    if (typeof enabled !== "boolean") throw new Error(`configuration checks.${name} must be boolean`);
  }
  if (merged.entryPoints.some((value) => typeof value !== "string")) throw new Error("configuration entryPoints must contain only strings");

  const projectRoot = path.resolve(invocationRoot, String(merged.projectRoot || "."));
  const resolveProjectPath = (value) => value === null ? null : path.resolve(projectRoot, value);
  const resolved = {
    ...merged,
    projectRoot,
    configPath: resolvedConfigPath,
    configExists,
    wikiRootPath: resolveProjectPath(merged.wikiRoot),
    indexPath: resolveProjectPath(merged.index),
    corePrinciplesPath: resolveProjectPath(merged.corePrinciples),
    impactMapPath: resolveProjectPath(merged.impactMap),
    entryPointPaths: merged.entryPoints.map((value) => resolveProjectPath(value)),
    pullRequestTemplatePath: resolveProjectPath(merged.pullRequestTemplate),
    conflictRegisterPath: resolveProjectPath(merged.conflictRegister),
    documentRelationsPath: resolveProjectPath(merged.documentRelations),
    legacyManifestPath: resolveProjectPath(merged.legacyManifest),
    agentFilePath: resolveProjectPath(merged.agentFile),
    skillFilePath: resolveProjectPath(merged.skillFile),
    initReportPath: resolveProjectPath(merged.initReport),
  };
  for (const [field, absolutePath] of Object.entries({
    wikiRoot: resolved.wikiRootPath,
    index: resolved.indexPath,
    corePrinciples: resolved.corePrinciplesPath,
    impactMap: resolved.impactMapPath,
    pullRequestTemplate: resolved.pullRequestTemplatePath,
    conflictRegister: resolved.conflictRegisterPath,
    documentRelations: resolved.documentRelationsPath,
    legacyManifest: resolved.legacyManifestPath,
    agentFile: resolved.agentFilePath,
    skillFile: resolved.skillFilePath,
    initReport: resolved.initReportPath,
  })) {
    if (absolutePath && !isInsideRoot(projectRoot, absolutePath)) {
      throw new Error(`configuration ${field} must stay inside projectRoot`);
    }
  }
  for (const entryPointPath of resolved.entryPointPaths) {
    if (!isInsideRoot(projectRoot, entryPointPath)) throw new Error("configuration entryPoints must stay inside projectRoot");
  }
  return resolved;
}

export function relativeToProject(config, absolutePath) {
  if (!absolutePath) return ".";
  return path.relative(config.projectRoot, absolutePath).split(path.sep).join("/") || ".";
}

export function isInsideProject(config, absolutePath) {
  return isInsideRoot(config.projectRoot, absolutePath);
}

function isInsideRoot(projectRoot, absolutePath) {
  const relative = path.relative(projectRoot, absolutePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
