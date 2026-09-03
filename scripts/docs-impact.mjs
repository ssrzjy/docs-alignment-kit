#!/usr/bin/env node
import { loadConfig } from "../lib/config.mjs";
import { analyzeImpact } from "../lib/impact.mjs";

const args = process.argv.slice(2);
const json = args.includes("--json");
const configIndex = args.findIndex((argument) => argument === "--config");
const configPath = configIndex === -1 ? args.find((argument) => argument.startsWith("--config="))?.slice("--config=".length) : args[configIndex + 1];
const paths = args.filter((argument, index) =>
  !argument.startsWith("--") && index !== configIndex + 1);
const config = loadConfig({ cwd: process.cwd(), configPath });
const report = analyzeImpact(config, paths);

if (json) console.log(JSON.stringify(report, null, 2));
else {
  console.log("Documentation impact");
  section("Changed or planned paths", report.changed_paths);
  section("Matched routes", report.matched_routes.map((route) => `${route.id}: ${route.matched_paths.join(", ")}`));
  section("Required reading", report.required_reading);
  section("Maintained documentation to review", report.maintained_docs_to_review);
  section("Machine contracts to review", report.machine_contracts_to_review);
  section("Suggested verification", report.suggested_verification);
  section("Unmatched paths (manual review required)", report.unmatched_paths);
}

function section(title, values) {
  console.log(`\n${title}:`);
  if (!values.length) return console.log("- none");
  values.forEach((value) => console.log(`- ${value}`));
}
