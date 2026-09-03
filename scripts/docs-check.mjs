#!/usr/bin/env node
import { loadConfig } from "../lib/config.mjs";
import { formatCheckResult, runCheck } from "../lib/check.mjs";

const args = process.argv.slice(2);
const configIndex = args.findIndex((argument) => argument === "--config");
const configPath = configIndex === -1 ? args.find((argument) => argument.startsWith("--config="))?.slice("--config=".length) : args[configIndex + 1];
const config = loadConfig({ cwd: process.cwd(), configPath });
const result = runCheck(config);
console.log(formatCheckResult(result));
if (result.errors.length) process.exitCode = 1;
