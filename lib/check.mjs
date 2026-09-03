import fs from "node:fs";
import path from "node:path";
import { isInsideProject, relativeToProject } from "./config.mjs";
import { readImpactMap } from "./impact.mjs";

const ALLOWED_STATUSES = new Set(["draft", "active", "deprecated", "superseded", "archived"]);
const REQUIRED_FIELDS = [
  "title", "status", "canonical", "owners", "source_of_truth_for", "code_paths",
  "sources", "summary", "keywords", "created", "updated", "last_verified_commit",
];
const REQUIRED_PR_MARKERS = [
  "## Problem and Context", "## Goals and Non-Goals", "## Solution and Feature Design",
  "## Existing Architecture and Conflict Assessment", "Architecture Conflict:",
  "### Flow or Architecture Diagram", "### Behavior and Boundaries", "### Contracts, Data, and Migration",
  "## Code Changes and Logic", "### Key Logic Walkthrough", "### Intentionally Unchanged",
  "## Risks, Rollback, and Follow-Ups", "## Review Guide", "## Documentation Impact",
  "Documentation Impact:", "### Canonical Pages", "### Machine Contracts", "### Conflicts",
  "## Verification",
];

export function runCheck(config) {
  const errors = [];
  const wikiFiles = listMarkdownFiles(config.wikiRootPath, errors, config);
  if (config.indexPath && fs.existsSync(config.indexPath) && !wikiFiles.includes(config.indexPath) && config.indexPath.endsWith(".md")) wikiFiles.push(config.indexPath);
  wikiFiles.sort();
  const indexText = readRequired(config.indexPath, errors, config);
  const pages = wikiFiles.map((filePath) => parsePage(filePath, errors, config));

  for (const page of pages) {
    if (enabled(config, "frontmatter")) {
      validateFrontmatter(page, errors, config);
      validateDeclaredPaths(page, errors, config);
    }
    if (enabled(config, "links")) validateLinks(page.filePath, page.body, errors, config);
    if (enabled(config, "navigation") && page.filePath !== config.indexPath && page.frontmatter.status === "active") {
      const relativeFromIndex = path.relative(path.dirname(config.indexPath), page.filePath).split(path.sep).join("/");
      if (!indexText.includes(`(${relativeFromIndex})`)) {
        errors.push(`${relativeToProject(config, page.filePath)}: active page is not linked from configured index`);
      }
    }
    if (enabled(config, "frontmatter") && page.frontmatter.status === "superseded") validateSupersededPage(page, errors, config);
  }

  if (enabled(config, "configuration")) validateConfiguration(errors, config);
  if (enabled(config, "sourceOfTruth")) validateOwnership(pages, errors, config);
  if (enabled(config, "impactMap")) validateImpactMap(errors, config);
  if (enabled(config, "conflictRelations")) validateRelations(errors, config);
  if (enabled(config, "legacyManifest")) validateLegacyManifest(errors, config);
  if (enabled(config, "entryPoints")) for (const entryPointPath of config.entryPointPaths) validateEntryPoint(entryPointPath, errors, config, enabled(config, "links"));
  if (enabled(config, "pullRequestTemplate") && config.pullRequestTemplatePath) validatePullRequestTemplate(config.pullRequestTemplatePath, errors, config, enabled(config, "links"));

  return { errors, wiki_pages: wikiFiles.length };
}

export function formatCheckResult(result) {
  if (result.errors.length) {
    return [
      `Documentation checks failed with ${result.errors.length} issue(s):`,
      ...result.errors.map((error) => `- ${error}`),
    ].join("\n");
  }
  return `Documentation checks passed for ${result.wiki_pages} Wiki pages.`;
}

function listMarkdownFiles(directory, errors, config) {
  if (!directory || !fs.existsSync(directory)) {
    errors.push(`${relativeToProject(config, directory || config.projectRoot)}: configured wikiRoot does not exist`);
    return [];
  }
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listMarkdownFiles(absolutePath, errors, config));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(absolutePath);
  }
  return files.sort();
}

function parsePage(filePath, errors, config) {
  const text = fs.readFileSync(filePath, "utf8");
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
  if (!match) {
    errors.push(`${relativeToProject(config, filePath)}: missing YAML frontmatter`);
    return { filePath, frontmatter: {}, body: text };
  }
  try {
    return { filePath, frontmatter: parseFrontmatter(match[1]), body: match[2] };
  } catch (error) {
    errors.push(`${relativeToProject(config, filePath)}: invalid frontmatter (${error.message})`);
    return { filePath, frontmatter: {}, body: match[2] };
  }
}

function parseFrontmatter(text) {
  const result = {};
  let activeList = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const listItem = /^\s+-\s+(.+)$/.exec(rawLine);
    if (listItem && activeList) {
      result[activeList].push(parseScalar(listItem[1]));
      continue;
    }
    const field = /^([A-Za-z0-9_]+):(?:\s*(.*))?$/.exec(rawLine);
    if (!field) {
      if (rawLine.trim()) throw new Error(`unsupported frontmatter line: ${rawLine}`);
      continue;
    }
    const [, key, rawValue = ""] = field;
    if (!rawValue.trim()) {
      result[key] = [];
      activeList = key;
    } else {
      result[key] = parseScalar(rawValue.trim());
      activeList = null;
    }
  }
  return result;
}

function parseScalar(rawValue) {
  if (rawValue === "true") return true;
  if (rawValue === "false") return false;
  if (rawValue === "null") return null;
  if (rawValue === "[]") return [];
  if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
    return rawValue.slice(1, -1).split(",").map((item) => item.trim()).filter(Boolean).map(parseScalar);
  }
  return rawValue.replace(/^['"]|['"]$/g, "");
}

function validateFrontmatter(page, errors, config) {
  for (const field of REQUIRED_FIELDS) {
    if (!(field in page.frontmatter)) errors.push(`${relativeToProject(config, page.filePath)}: missing frontmatter field "${field}"`);
  }
  if (!ALLOWED_STATUSES.has(page.frontmatter.status)) errors.push(`${relativeToProject(config, page.filePath)}: unsupported status "${page.frontmatter.status}"`);
  if (typeof page.frontmatter.canonical !== "boolean") errors.push(`${relativeToProject(config, page.filePath)}: canonical must be boolean`);
  if (!Array.isArray(page.frontmatter.owners) || !page.frontmatter.owners.length) errors.push(`${relativeToProject(config, page.filePath)}: owners must be non-empty`);
  for (const field of ["source_of_truth_for", "code_paths", "sources", "keywords"]) {
    if (!Array.isArray(page.frontmatter[field])) errors.push(`${relativeToProject(config, page.filePath)}: ${field} must be an array`);
  }
  if (typeof page.frontmatter.summary !== "string" || page.frontmatter.summary.trim().length < 20) errors.push(`${relativeToProject(config, page.filePath)}: summary must be at least 20 characters`);
}

function validateDeclaredPaths(page, errors, config) {
  for (const field of ["code_paths", "sources"]) {
    for (const value of arrayValue(page.frontmatter[field])) {
      const absolutePath = path.resolve(config.projectRoot, String(value));
      if (!isInsideProject(config, absolutePath) || !fs.existsSync(absolutePath)) errors.push(`${relativeToProject(config, page.filePath)}: ${field} target does not exist: ${value}`);
    }
  }
}

function validateLinks(filePath, text, errors, config) {
  for (const match of text.matchAll(/\[[^\]]*]\(([^)]+)\)/g)) {
    const target = match[1].trim().replace(/^<|>$/g, "").split(/\s+["']/)[0];
    if (!target || target.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    const absolutePath = path.resolve(path.dirname(filePath), decodeURIComponent(target.split("#", 1)[0]));
    if (!isInsideProject(config, absolutePath) || !fs.existsSync(absolutePath)) errors.push(`${relativeToProject(config, filePath)}: broken local link: ${target}`);
  }
}

function validateSupersededPage(page, errors, config) {
  const replacement = page.frontmatter.superseded_by;
  if (typeof replacement !== "string" || !replacement) {
    errors.push(`${relativeToProject(config, page.filePath)}: superseded page must declare superseded_by`);
    return;
  }
  const absolutePath = path.resolve(path.dirname(page.filePath), replacement);
  if (!isInsideProject(config, absolutePath) || !fs.existsSync(absolutePath)) errors.push(`${relativeToProject(config, page.filePath)}: superseded_by target does not exist: ${replacement}`);
}

function validateOwnership(pages, errors, config) {
  const ownersByTopic = new Map();
  for (const page of pages) {
    if (page.frontmatter.status !== "active" || page.frontmatter.canonical !== true) continue;
    for (const topic of arrayValue(page.frontmatter.source_of_truth_for)) {
      if (ownersByTopic.has(topic)) errors.push(`source_of_truth_for "${topic}" is claimed by both ${relativeToProject(config, ownersByTopic.get(topic))} and ${relativeToProject(config, page.filePath)}`);
      else ownersByTopic.set(topic, page.filePath);
    }
  }
}

function validateImpactMap(errors, config) {
  if (!config.impactMapPath || !fs.existsSync(config.impactMapPath)) {
    errors.push(`${relativeToProject(config, config.impactMapPath || config.projectRoot)}: configured impact map does not exist`);
    return;
  }
  let impactMap;
  try { impactMap = readImpactMap(config); }
  catch (error) { errors.push(error.message); return; }
  if (impactMap.schema_version !== 1) errors.push(`${relativeToProject(config, config.impactMapPath)}: schema_version must be 1`);
  validateImpactPathList("global_reading", impactMap.global_reading, errors, config);
  if (!Array.isArray(impactMap.routes) || !impactMap.routes.length) {
    errors.push(`${relativeToProject(config, config.impactMapPath)}: routes must be a non-empty array`);
    return;
  }
  const routeIds = new Set();
  for (const route of impactMap.routes) {
    if (!route || typeof route.id !== "string" || !/^[a-z0-9-]+$/.test(route.id)) {
      errors.push(`${relativeToProject(config, config.impactMapPath)}: every route must have a lowercase hyphenated id`);
      continue;
    }
    if (routeIds.has(route.id)) errors.push(`${relativeToProject(config, config.impactMapPath)}: duplicate route id: ${route.id}`);
    routeIds.add(route.id);
    for (const field of ["topics", "change_paths", "required_reading", "maintained_docs", "machine_contracts", "verification"]) {
      if (!Array.isArray(route[field])) errors.push(`${relativeToProject(config, config.impactMapPath)}: route ${route.id} field ${field} must be an array`);
    }
    for (const field of ["required_reading", "maintained_docs", "machine_contracts"]) validateImpactPathList(`${route.id}.${field}`, route[field], errors, config);
    for (const pattern of arrayValue(route.change_paths)) {
      if (typeof pattern !== "string" || !pattern || path.isAbsolute(pattern) || pattern.startsWith("../")) errors.push(`${relativeToProject(config, config.impactMapPath)}: route ${route.id} has an invalid change path pattern`);
      else validateImpactPattern(route.id, pattern, errors, config);
    }
  }
}

function validateImpactPattern(routeId, pattern, errors, config) {
  const wildcardIndex = pattern.search(/[?*]/);
  const staticPrefix = wildcardIndex === -1 ? pattern : pattern.slice(0, wildcardIndex);
  const existingPrefix = wildcardIndex === -1
    ? staticPrefix
    : staticPrefix.endsWith("/")
      ? staticPrefix.replace(/\/+$/, "")
      : path.posix.dirname(staticPrefix);
  if (!existingPrefix || existingPrefix === ".") return;
  const absolutePath = path.resolve(config.projectRoot, existingPrefix);
  if (!isInsideProject(config, absolutePath) || !fs.existsSync(absolutePath)) errors.push(`${relativeToProject(config, config.impactMapPath)}: route ${routeId} pattern prefix does not exist: ${pattern}`);
}

function validateImpactPathList(field, values, errors, config) {
  if (!Array.isArray(values)) {
    errors.push(`${relativeToProject(config, config.impactMapPath)}: ${field} must be an array`);
    return;
  }
  for (const value of values) {
    if (typeof value !== "string" || !value || path.isAbsolute(value) || value.startsWith("../")) {
      errors.push(`${relativeToProject(config, config.impactMapPath)}: ${field} contains an invalid path: ${value}`);
      continue;
    }
    const absolutePath = path.resolve(config.projectRoot, value);
    if (!isInsideProject(config, absolutePath) || !fs.existsSync(absolutePath)) errors.push(`${relativeToProject(config, config.impactMapPath)}: ${field} target does not exist: ${value}`);
  }
}

function validateRelations(errors, config) {
  if (!config.documentRelationsPath && !config.conflictRegisterPath) return;
  if (!config.documentRelationsPath || !fs.existsSync(config.documentRelationsPath)) {
    errors.push(`${relativeToProject(config, config.documentRelationsPath || config.projectRoot)}: configured document relations file does not exist`);
    return;
  }
  if (!config.conflictRegisterPath || !fs.existsSync(config.conflictRegisterPath)) {
    errors.push(`${relativeToProject(config, config.conflictRegisterPath || config.projectRoot)}: configured conflict register does not exist`);
    return;
  }
  let registry;
  try { registry = JSON.parse(fs.readFileSync(config.documentRelationsPath, "utf8")); }
  catch (error) { errors.push(`${relativeToProject(config, config.documentRelationsPath)}: invalid JSON (${error.message})`); return; }
  if (registry.schema_version !== 1) errors.push(`${relativeToProject(config, config.documentRelationsPath)}: schema_version must be 1`);
  if (!registry.documents || typeof registry.documents !== "object" || Array.isArray(registry.documents)) {
    errors.push(`${relativeToProject(config, config.documentRelationsPath)}: documents must be an object keyed by source path`);
    return;
  }
  const conflictText = fs.readFileSync(config.conflictRegisterPath, "utf8");
  const conflictStatuses = parseConflictStatuses(conflictText);
  for (const [source, node] of Object.entries(registry.documents)) {
    const sourcePath = path.resolve(config.projectRoot, source);
    if (!isInsideProject(config, sourcePath) || !fs.existsSync(sourcePath)) errors.push(`${relativeToProject(config, config.documentRelationsPath)}: source node does not exist: ${source}`);
    if (!node || !Array.isArray(node.relations)) {
      errors.push(`${relativeToProject(config, config.documentRelationsPath)}: ${source} must declare a relations array`);
      continue;
    }
    for (const relation of node.relations) {
      if (relation?.type !== "conflicts_with") errors.push(`${relativeToProject(config, config.documentRelationsPath)}: ${source} has unsupported relation type`);
      if (typeof relation?.target !== "string") {
        errors.push(`${relativeToProject(config, config.documentRelationsPath)}: ${source} relation is missing target`);
        continue;
      }
      const targetPath = path.resolve(config.projectRoot, relation.target);
      if (!isInsideProject(config, targetPath) || !fs.existsSync(targetPath)) errors.push(`${relativeToProject(config, config.documentRelationsPath)}: relation target does not exist: ${relation.target}`);
      if (typeof relation.conflict_id !== "string" || !/^KCR-[A-Z0-9-]+$/.test(relation.conflict_id)) errors.push(`${relativeToProject(config, config.documentRelationsPath)}: invalid conflict_id for ${source} -> ${relation.target}`);
      else if (!conflictText.includes(`### ${relation.conflict_id}`)) errors.push(`${relativeToProject(config, config.documentRelationsPath)}: ${relation.conflict_id} is missing from conflict register`);
      if (typeof relation.conflict_kind !== "string" || !relation.conflict_kind) errors.push(`${relativeToProject(config, config.documentRelationsPath)}: missing conflict_kind for ${source} -> ${relation.target}`);
      if (typeof relation.detected_at !== "string" || !relation.detected_at.includes("T")) errors.push(`${relativeToProject(config, config.documentRelationsPath)}: missing timestamped detected_at for ${source} -> ${relation.target}`);
      if (!["pending-human-review", "resolved-human-decision"].includes(relation.status)) errors.push(`${relativeToProject(config, config.documentRelationsPath)}: unsupported relation status for ${source} -> ${relation.target}`);
      const registeredStatus = conflictStatuses.get(relation.conflict_id);
      if (!registeredStatus) errors.push(`${relativeToProject(config, config.documentRelationsPath)}: ${relation.conflict_id} is missing a registered status`);
      else if (relation.status !== registeredStatus) errors.push(`${relativeToProject(config, config.documentRelationsPath)}: relation status must match ${relation.conflict_id} (${registeredStatus})`);
      const reciprocal = registry.documents[relation.target]?.relations?.some((candidate) => candidate.type === "conflicts_with" && candidate.target === source && candidate.conflict_id === relation.conflict_id && candidate.conflict_kind === relation.conflict_kind);
      if (!reciprocal) errors.push(`${relativeToProject(config, config.documentRelationsPath)}: missing reciprocal relation ${relation.target} -> ${source}`);
    }
  }
}

function parseConflictStatuses(text) {
  const statuses = new Map();
  for (const section of text.split(/\n(?=### KCR-[A-Z0-9-]+\b)/)) {
    const id = section.match(/^### (KCR-[A-Z0-9-]+)\b/m)?.[1];
    const status = section.match(/^-?\s*Status:\s*`?([^`\n]+)`?/m)?.[1]?.trim();
    if (id && status) statuses.set(id, status);
  }
  return statuses;
}

function validateEntryPoint(filePath, errors, config, checkLinks = true) {
  if (!filePath) return;
  if (!fs.existsSync(filePath)) {
    errors.push(`${relativeToProject(config, filePath)}: configured entry point does not exist`);
    return;
  }
  if (checkLinks) validateLinks(filePath, fs.readFileSync(filePath, "utf8"), errors, config);
}

function validatePullRequestTemplate(filePath, errors, config, checkLinks = true) {
  if (!fs.existsSync(filePath)) {
    errors.push(`${relativeToProject(config, filePath)}: configured pull request template does not exist`);
    return;
  }
  const template = fs.readFileSync(filePath, "utf8");
  for (const marker of REQUIRED_PR_MARKERS) if (!template.includes(marker)) errors.push(`${relativeToProject(config, filePath)}: missing required marker: ${marker}`);
  if (!template.includes("docs-alignment impact") && !template.includes("npm run docs:impact")) errors.push(`${relativeToProject(config, filePath)}: missing documentation impact command`);
  if (!template.includes("docs-alignment check") && !template.includes("npm run docs:check")) errors.push(`${relativeToProject(config, filePath)}: missing documentation check command`);
  if (checkLinks) validateLinks(filePath, template, errors, config);
}

function validateConfiguration(errors, config) {
  if (!config.configExists || !fs.existsSync(config.configPath)) {
    errors.push(`${relativeToProject(config, config.configPath)}: configuration file does not exist; run docs-alignment init`);
  }
  if (!config.corePrinciplesPath || !fs.existsSync(config.corePrinciplesPath)) {
    errors.push(`${relativeToProject(config, config.corePrinciplesPath)}: configured core principles page does not exist`);
  }
  if (config.skillFile && (!config.skillFilePath || !fs.existsSync(config.skillFilePath))) {
    errors.push(`${relativeToProject(config, config.skillFilePath)}: configured Agent Skill does not exist`);
  } else if (config.skillFilePath && fs.existsSync(config.skillFilePath)) {
    validateSkill(config.skillFilePath, errors, config);
  }
}

function validateSkill(filePath, errors, config) {
  const text = fs.readFileSync(filePath, "utf8");
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  if (!match) {
    errors.push(`${relativeToProject(config, filePath)}: Skill is missing YAML frontmatter`);
    return;
  }
  if (!/^name:\s*docs-alignment\s*$/m.test(match[1])) errors.push(`${relativeToProject(config, filePath)}: Skill name must be docs-alignment`);
  if (!/^description:\s*\S.+$/m.test(match[1])) errors.push(`${relativeToProject(config, filePath)}: Skill description is required`);
}

function validateLegacyManifest(errors, config) {
  if (!config.legacyManifestPath) return;
  if (!fs.existsSync(config.legacyManifestPath)) {
    errors.push(`${relativeToProject(config, config.legacyManifestPath)}: configured legacy manifest does not exist`);
    return;
  }
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(config.legacyManifestPath, "utf8")); }
  catch (error) { errors.push(`${relativeToProject(config, config.legacyManifestPath)}: invalid JSON (${error.message})`); return; }
  if (manifest.schema_version !== 1) errors.push(`${relativeToProject(config, config.legacyManifestPath)}: schema_version must be 1`);
  if (!Array.isArray(manifest.documents)) errors.push(`${relativeToProject(config, config.legacyManifestPath)}: documents must be an array`);
  else if (manifest.source_count !== manifest.documents.length) errors.push(`${relativeToProject(config, config.legacyManifestPath)}: source_count does not match documents length`);
}

function readRequired(filePath, errors, config) {
  if (!filePath || !fs.existsSync(filePath)) {
    errors.push(`${relativeToProject(config, filePath || config.projectRoot)}: configured index file does not exist`);
    return "";
  }
  return fs.readFileSync(filePath, "utf8");
}

function arrayValue(value) { return Array.isArray(value) ? value : []; }
function enabled(config, checkName) { return config.checks?.[checkName] !== false; }
