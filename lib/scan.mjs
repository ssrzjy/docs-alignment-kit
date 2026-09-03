import fs from "node:fs";
import path from "node:path";

const SOURCE_ROOTS = ["src", "app", "lib", "packages", "services", "modules", "infrastructure", "infra"];
const DATABASE_ROOTS = ["db", "database", "migrations", "prisma", "drizzle"];
const OBJECT_STORAGE_ROOTS = ["storage", "object-storage"];
const API_SCHEMA_ROOTS = ["openapi", "asyncapi", "schemas"];
const TEST_ROOTS = ["test", "tests"];
const DATABASE_NAMES = new Set(DATABASE_ROOTS);
const OBJECT_STORAGE_NAMES = new Set([...OBJECT_STORAGE_ROOTS, "file-storage", "blob-storage", "uploads"]);
const API_SCHEMA_NAMES = new Set(API_SCHEMA_ROOTS);
const TEST_NAMES = new Set([...TEST_ROOTS, "__tests__"]);
const NON_BUSINESS_MODULE_NAMES = new Set([
  ...DATABASE_NAMES,
  ...OBJECT_STORAGE_NAMES,
  ...API_SCHEMA_NAMES,
  ...TEST_NAMES,
]);
const DOCUMENT_EXTENSIONS = new Set([".md", ".mdx", ".rst", ".txt"]);
const CONTRACT_EXTENSIONS = new Set([".json", ".yaml", ".yml", ".graphql", ".gql", ".proto", ".avsc"]);
const IGNORED_DIRECTORIES = new Set([
  ".git", ".hg", ".svn", "node_modules", "vendor", "dist", "build", "coverage",
  ".next", ".nuxt", ".cache", "target", "tmp", "temp", "docs",
]);

export function scanProject(projectRoot) {
  const root = path.resolve(projectRoot);
  const sourceRoots = existingDirectories(root, SOURCE_ROOTS);
  const nestedRecognized = discoverNestedRecognizedDirectories(root);
  const databasePaths = unique([...existingDirectories(root, DATABASE_ROOTS), ...nestedRecognized.database]);
  const databaseContractPaths = discoverDatabaseContractFiles(root, databasePaths);
  const objectStoragePaths = unique([...existingDirectories(root, OBJECT_STORAGE_ROOTS), ...nestedRecognized.objectStorage]);
  const apiSchemaPaths = unique([
    ...existingDirectories(root, API_SCHEMA_ROOTS),
    ...nestedRecognized.apiSchema,
    ...discoverContractFiles(root),
  ]);
  const testPaths = unique([...existingDirectories(root, TEST_ROOTS), ...nestedRecognized.tests]);
  const existingDocumentation = discoverDocumentation(root);
  const modules = discoverModules(root, sourceRoots);
  const detectedFiles = ["README.md", "AGENTS.md", "package.json"]
    .filter((relativePath) => fs.existsSync(path.join(root, relativePath)));
  const packageInfo = readPackageInfo(root);

  return {
    project_root: root,
    source_roots: sourceRoots,
    scanned_roots: unique([
      ...sourceRoots,
      ...databasePaths,
      ...objectStoragePaths,
      ...apiSchemaPaths,
      ...testPaths,
    ]),
    modules,
    database_paths: databasePaths,
    database_contract_paths: databaseContractPaths,
    object_storage_paths: objectStoragePaths,
    api_schema_paths: apiSchemaPaths,
    test_paths: testPaths,
    existing_documentation: existingDocumentation,
    detected_files: detectedFiles,
    suggested_verification: packageInfo.testCommand ? [packageInfo.testCommand] : [],
    package_manager: packageInfo.packageManager,
  };
}

function discoverNestedRecognizedDirectories(root) {
  const result = { database: [], objectStorage: [], apiSchema: [], tests: [] };
  walk(root, 3, (absolutePath, entry) => {
    if (!entry.isDirectory()) return;
    const relativePath = posix(path.relative(root, absolutePath));
    if (!relativePath) return;
    const name = entry.name.toLowerCase();
    if (DATABASE_NAMES.has(name)) result.database.push(relativePath);
    if (OBJECT_STORAGE_NAMES.has(name)) result.objectStorage.push(relativePath);
    if (API_SCHEMA_NAMES.has(name)) result.apiSchema.push(relativePath);
    if (TEST_NAMES.has(name)) result.tests.push(relativePath);
  });
  for (const key of Object.keys(result)) result[key] = unique(result[key]);
  return result;
}

function discoverModules(root, sourceRoots) {
  const candidates = [];
  for (const sourceRoot of sourceRoots) {
    const absoluteRoot = path.join(root, sourceRoot);
    const entries = safeReadDirectory(absoluteRoot);
    const childDirectories = entries
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && !IGNORED_DIRECTORIES.has(entry.name) && !NON_BUSINESS_MODULE_NAMES.has(entry.name.toLowerCase()) && !entry.name.startsWith("."))
      .flatMap((entry) => {
        if ((sourceRoot === "packages" || sourceRoot === "services" || sourceRoot === "modules") && entry.name.startsWith("@")) {
          return safeReadDirectory(path.join(absoluteRoot, entry.name))
            .filter((nested) => nested.isDirectory() && !nested.isSymbolicLink() && !IGNORED_DIRECTORIES.has(nested.name))
            .map((nested) => `${entry.name}/${nested.name}`);
        }
        return [entry.name];
      });
    const hasDirectSourceFiles = entries.some((entry) => entry.isFile() && isProbableSourceFile(entry.name));

    for (const child of childDirectories) {
      const relativePath = posix(path.join(sourceRoot, child));
      candidates.push(moduleCandidate(relativePath, "direct child of a recognized source root"));
    }
    if (hasDirectSourceFiles) {
      candidates.push(moduleCandidate(sourceRoot, "recognized source root with direct implementation files"));
    }
  }
  const byId = new Map();
  for (const candidate of candidates) if (!byId.has(candidate.id)) byId.set(candidate.id, candidate);
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function moduleCandidate(relativePath, reason) {
  return {
    id: slugify(relativePath),
    label: relativePath,
    paths: [relativePath],
    confidence: "candidate",
    reason,
  };
}

function discoverContractFiles(root) {
  const results = [];
  walk(root, 3, (absolutePath, entry) => {
    if (!entry.isFile()) return;
    const relativePath = posix(path.relative(root, absolutePath));
    const basename = entry.name.toLowerCase();
    const segments = relativePath.toLowerCase().split("/");
    if ((segments.some((segment) => API_SCHEMA_NAMES.has(segment)) && CONTRACT_EXTENSIONS.has(path.extname(basename)))
      || /^(openapi|asyncapi)(\.[^.]+)?\.(ya?ml|json)$/.test(basename)
      || /\.schema\.json$/.test(basename)) {
      results.push(relativePath);
    }
  });
  return unique(results);
}

function discoverDatabaseContractFiles(root, databasePaths) {
  const results = [];
  for (const databasePath of databasePaths) {
    const absolutePath = path.join(root, databasePath);
    walk(absolutePath, 3, (candidatePath, entry) => {
      if (!entry.isFile()) return;
      const extension = path.extname(entry.name).toLowerCase();
      if ([".sql", ".prisma", ".drizzle", ".dbml"].includes(extension)) results.push(posix(path.relative(root, candidatePath)));
    });
  }
  return unique(results);
}

function discoverDocumentation(root) {
  const results = [];
  for (const entryPoint of ["README.md", "AGENTS.md"]) {
    if (fs.existsSync(path.join(root, entryPoint))) results.push(entryPoint);
  }
  const docsRoot = path.join(root, "docs");
  if (fs.existsSync(docsRoot) && fs.statSync(docsRoot).isDirectory()) {
    walk(docsRoot, 6, (absolutePath, entry) => {
      if (entry.isFile() && DOCUMENT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        results.push(posix(path.relative(root, absolutePath)));
      }
    });
  }
  walk(root, 2, (absolutePath, entry) => {
    if (entry.isFile() && DOCUMENT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      results.push(posix(path.relative(root, absolutePath)));
    }
  });
  return unique(results);
}

function readPackageInfo(root) {
  const packagePath = path.join(root, "package.json");
  if (!fs.existsSync(packagePath)) return { packageManager: null, testCommand: null };
  try {
    const manifest = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    const declaredManager = typeof manifest.packageManager === "string" ? manifest.packageManager.split("@")[0] : null;
    const packageManager = declaredManager
      || (fs.existsSync(path.join(root, "pnpm-lock.yaml")) ? "pnpm"
        : fs.existsSync(path.join(root, "yarn.lock")) ? "yarn"
          : fs.existsSync(path.join(root, "bun.lockb")) || fs.existsSync(path.join(root, "bun.lock")) ? "bun"
            : "npm");
    const hasTests = manifest.scripts && typeof manifest.scripts.test === "string";
    const commands = { npm: "npm test", pnpm: "pnpm test", yarn: "yarn test", bun: "bun test" };
    return { packageManager, testCommand: hasTests ? commands[packageManager] || `${packageManager} test` : null };
  } catch {
    return { packageManager: "npm", testCommand: null };
  }
}

function existingDirectories(root, candidates) {
  return candidates.filter((relativePath) => {
    const absolutePath = path.join(root, relativePath);
    try { return fs.statSync(absolutePath).isDirectory(); }
    catch { return false; }
  });
}

function walk(directory, depth, visitor) {
  if (depth < 0) return;
  for (const entry of safeReadDirectory(directory)) {
    if (entry.isSymbolicLink()) continue;
    const absolutePath = path.join(directory, entry.name);
    visitor(absolutePath, entry);
    if (entry.isDirectory() && depth > 0 && !IGNORED_DIRECTORIES.has(entry.name) && !entry.name.startsWith(".")) {
      walk(absolutePath, depth - 1, visitor);
    }
  }
}

function safeReadDirectory(directory) {
  try { return fs.readdirSync(directory, { withFileTypes: true }); }
  catch { return []; }
}

function isProbableSourceFile(name) {
  return /\.(?:[cm]?[jt]sx?|py|rb|php|go|rs|java|kt|swift|cs|cpp|cc|c|h)$/i.test(name);
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "module";
}

function posix(value) { return value.split(path.sep).join("/"); }
function unique(values) { return [...new Set(values)].sort(); }
