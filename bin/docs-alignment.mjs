#!/usr/bin/env node
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadConfig } from "../lib/config.mjs";
import { analyzeImpact } from "../lib/impact.mjs";
import { formatCheckResult, runCheck } from "../lib/check.mjs";
import { initializeProject } from "../lib/init.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageVersion = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8")).version;

try {
  await main(process.argv.slice(2));
} catch (error) {
  console.error(`docs-alignment: ${error.message}`);
  process.exitCode = 1;
}

async function main(args) {
  const command = args.shift() || "help";
  const options = parseOptions(args);
  if (options.help || ["help", "--help", "-h"].includes(command)) return printHelp();
  if (command === "version" || command === "--version") return console.log(packageVersion);

  if (command === "impact") {
    const config = loadConfig({ cwd: process.cwd(), configPath: options.configPath });
    const report = analyzeImpact(config, options.paths);
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else printImpactReport(report);
    return;
  }
  if (command === "check") {
    const config = loadConfig({ cwd: process.cwd(), configPath: options.configPath });
    const result = runCheck(config);
    console.log(formatCheckResult(result));
    if (result.errors.length) process.exitCode = 1;
    return;
  }
  if (command === "init") {
    const result = initializeProject({
      cwd: process.cwd(),
      configPath: options.configPath,
      dryRun: options.dryRun,
      force: options.force,
    });
    console.log(`${result.dryRun ? "Dry-run initialization plan" : "Initialized docs-alignment"} in ${result.config.projectRoot}`);
    if (result.planned.length && result.dryRun) { console.log("Would create or update:"); result.planned.forEach((file) => console.log(`- ${file}`)); }
    if (result.created.length) { console.log("Created or appended:"); result.created.forEach((file) => console.log(`- ${file}`)); }
    if (result.overwritten.length) { console.log("Overwritten with --force:"); result.overwritten.forEach((file) => console.log(`- ${file}`)); }
    if (result.skipped.length) { console.log("Already existed (left unchanged):"); result.skipped.forEach((file) => console.log(`- ${file}`)); }
    console.log(`Detected ${result.scan.modules.length} module candidate(s), ${result.scan.database_paths.length} database path(s), ${result.scan.object_storage_paths.length} object-storage path(s), ${result.scan.api_schema_paths.length} API/schema path(s), and ${result.scan.test_paths.length} test path(s).`);
    if (result.report.needs_user_confirmation.length) {
      console.log("Needs user confirmation:");
      result.report.needs_user_confirmation.forEach((item) => console.log(`- ${item}`));
    }
    console.log(result.dryRun
      ? "Dry-run made no filesystem changes. Run docs-alignment init to write this draft."
      : `Review ${result.config.initReport} and the generated drafts, then run ${result.config.checkCommand}.`);
    return;
  }
  throw new Error(`unknown command "${command}" (use --help)`);
}

function parseOptions(args) {
  const options = { json: false, help: false, dryRun: false, force: false, paths: [], configPath: undefined };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--force") options.force = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--config") {
      if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error("--config requires a file path");
      options.configPath = args[++index];
    }
    else if (arg.startsWith("--config=")) options.configPath = arg.slice("--config=".length);
    else if (arg.startsWith("-")) throw new Error(`unknown option "${arg}"`);
    else options.paths.push(arg);
  }
  return options;
}

function printImpactReport(report) {
  console.log("Documentation impact");
  printSection("Changed or planned paths", report.changed_paths);
  printSection("Matched routes", report.matched_routes.map((route) => `${route.id}: ${route.matched_paths.join(", ")}`));
  printSection("Required reading", report.required_reading);
  printSection("Maintained documentation to review", report.maintained_docs_to_review);
  printSection("Machine contracts to review", report.machine_contracts_to_review);
  printSection("Suggested verification", report.suggested_verification);
  printSection("Unmatched paths (manual review required)", report.unmatched_paths);
  if (!report.changed_paths.length) console.log("\nNo changed paths found. Pass planned paths explicitly: docs-alignment impact src/example.ts");
}

function printSection(title, values) {
  console.log(`\n${title}:`);
  if (!values.length) return console.log("- none");
  values.forEach((value) => console.log(`- ${value}`));
}

function printHelp() {
  console.log(`docs-alignment ${packageVersion}

Usage:
  docs-alignment impact [--json] [--config path] [path ...]
  docs-alignment check [--config path]
  docs-alignment init [--dry-run] [--force] [--config path]
  docs-alignment version

The command reads docs-alignment.config.json from the current project when --config is omitted.
`);
}
