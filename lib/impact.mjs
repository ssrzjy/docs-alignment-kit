import path from "node:path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

export function analyzeImpact(config, requestedPaths = []) {
  const changedPaths = unique((requestedPaths.length ? requestedPaths : discoverChangedPaths(config.projectRoot))
    .map((value) => normalizeRepositoryPath(config, value))
    .filter(Boolean));
  const impactMap = readImpactMap(config);
  const matchedRoutes = impactMap.routes.filter((route) =>
    changedPaths.some((changedPath) => route.change_paths.some((pattern) => globMatches(pattern, changedPath))));

  return {
    changed_paths: changedPaths,
    matched_routes: matchedRoutes.map((route) => ({
      id: route.id,
      topics: route.topics,
      matched_paths: changedPaths.filter((changedPath) =>
        route.change_paths.some((pattern) => globMatches(pattern, changedPath))),
    })),
    required_reading: unique([
      ...(impactMap.global_reading || []),
      ...matchedRoutes.flatMap((route) => route.required_reading || []),
    ]),
    maintained_docs_to_review: unique(matchedRoutes.flatMap((route) => route.maintained_docs || [])),
    machine_contracts_to_review: unique(matchedRoutes.flatMap((route) => route.machine_contracts || [])),
    suggested_verification: unique([
      ...matchedRoutes.flatMap((route) => route.verification || []),
      config.checkCommand,
    ]),
    unmatched_paths: changedPaths.filter((changedPath) =>
      !matchedRoutes.some((route) => route.change_paths.some((pattern) => globMatches(pattern, changedPath)))),
  };
}

export function readImpactMap(config) {
  try {
    return JSON.parse(fs.readFileSync(config.impactMapPath, "utf8"));
  } catch (error) {
    throw new Error(`cannot read impact map ${config.impactMapPath}: ${error.message}`);
  }
}

function discoverChangedPaths(projectRoot) {
  const candidates = [
    ...gitLines(projectRoot, ["diff", "--name-only", "--cached"]),
    ...gitLines(projectRoot, ["diff", "--name-only"]),
    ...gitLines(projectRoot, ["ls-files", "--others", "--exclude-standard"]),
  ];
  if (candidates.length) return unique(candidates);
  const base = gitLines(projectRoot, ["merge-base", "HEAD", "origin/main"])[0];
  return base ? gitLines(projectRoot, ["diff", "--name-only", `${base}...HEAD`]) : [];
}

function gitLines(projectRoot, args) {
  try {
    return execFileSync("git", args, {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim().split(/\r?\n/).filter(Boolean);
  } catch { return []; }
}

export function normalizeRepositoryPath(config, inputPath) {
  const absolutePath = path.isAbsolute(inputPath)
    ? path.resolve(inputPath)
    : path.resolve(config.projectRoot, inputPath);
  const relativePath = path.relative(config.projectRoot, absolutePath);
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) return "";
  return relativePath.split(path.sep).join("/");
}

export function globMatches(pattern, candidate) {
  const segments = String(pattern).split("/");
  let expression = "^";
  segments.forEach((segment, index) => {
    if (segment === "**") {
      expression += index === segments.length - 1 ? ".*" : "(?:[^/]+/)*";
      return;
    }
    expression += segment
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replaceAll("*", "[^/]*")
      .replaceAll("?", "[^/]");
    if (index < segments.length - 1) expression += "/";
  });
  return new RegExp(`${expression}$`).test(candidate);
}

function unique(values) { return [...new Set(values)].sort(); }
