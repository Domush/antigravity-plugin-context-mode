import fs from "node:fs";
import path from "node:path";

export const PLUGIN_DIR_NAME = "context-mode";
export const LEGACY_PLUGIN_DIR_NAME = "antigravity-plugin-context-mode";

const REQUIRED_FILES = [
  "plugin.json",
  "hooks.json",
  "mcp_config.json",
  "server.js",
  "package.json",
  "README.md",
  "LICENSE",
  "CHANGELOG.md"
];

const REQUIRED_DIRS = ["lib", "hooks", "skills", "rules", "assets", "sidecars"];
const VALID_INSTALL_FLAGS = new Set(["--global", "-g", "--workspace", "-w"]);

/**
 * Load and validate the plugin version from package.json.
 */
export function loadPackageVersion(rootDir) {
  if (typeof rootDir !== "string" || rootDir.trim().length === 0) {
    throw new TypeError("loadPackageVersion requires a non-empty rootDir string");
  }

  const pkgPath = path.join(rootDir, "package.json");
  let raw;
  try {
    raw = fs.readFileSync(pkgPath, "utf8");
  } catch (err) {
    throw new Error(`Failed to read package.json at ${pkgPath}: ${err.message}`);
  }

  let pkg;
  try {
    pkg = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse package.json at ${pkgPath}: ${err.message}`);
  }

  if (!pkg || typeof pkg.version !== "string" || pkg.version.trim().length === 0) {
    throw new Error(`Invalid or missing "version" field in ${pkgPath}`);
  }

  return pkg.version.trim();
}

/**
 * Normalize a path and strip trailing path separators while preserving filesystem roots.
 */
function stripTrailingSeparators(targetPath) {
  const resolved = path.resolve(targetPath);
  const root = path.parse(resolved).root;
  if (resolved === root) return resolved;
  return resolved.replace(/[\\/]+$/, "");
}

/**
 * Resolve canonical realpath (case-folded on Windows), handling non-existent leaf segments.
 */
function canonicalizePath(targetPath) {
  const resolved = stripTrailingSeparators(targetPath);
  let canonical = resolved;
  try {
    canonical = fs.realpathSync.native ? fs.realpathSync.native(resolved) : fs.realpathSync(resolved);
  } catch (err) {
    if (!err || err.code !== "ENOENT") {
      throw err;
    }
    const parent = path.dirname(resolved);
    if (parent !== resolved) {
      canonical = path.join(canonicalizePath(parent), path.basename(resolved));
    }
  }
  return process.platform === "win32" ? canonical.toLowerCase() : canonical;
}

/**
 * Normalize a path case-insensitively on Windows without resolving symlinks.
 */
function normalizeLiteralPath(targetPath) {
  const resolved = stripTrailingSeparators(targetPath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

/**
 * Check whether normalized child path equals or is nested inside normalized parent path.
 */
function isNormalizedPathSameOrNested(parentCanonical, childCanonical) {
  if (parentCanonical === childCanonical) return true;
  const prefix = parentCanonical.endsWith(path.sep) ? parentCanonical : parentCanonical + path.sep;
  return childCanonical.startsWith(prefix);
}

/**
 * Resolve canonical path for an entry without dereferencing a symbolic link/junction leaf.
 */
function canonicalizeEntryPath(targetPath) {
  const resolved = stripTrailingSeparators(targetPath);
  const parent = path.dirname(resolved);
  let canonical = resolved;
  try {
    const stat = fs.lstatSync(resolved);
    if (!stat.isSymbolicLink()) {
      return canonicalizePath(resolved);
    }
    canonical = parent === resolved
      ? resolved
      : path.join(canonicalizePath(parent), path.basename(resolved));
  } catch (err) {
    if (!err || err.code !== "ENOENT") {
      throw err;
    }
    canonical = parent === resolved
      ? resolved
      : path.join(canonicalizePath(parent), path.basename(resolved));
  }
  return process.platform === "win32" ? canonical.toLowerCase() : canonical;
}

/**
 * Check whether an entry path literally or canonically matches or encloses sourceDir.
 */
function isEntrySameOrEnclosesSource(entryPath, sourceDir) {
  const entryCanonical = canonicalizeEntryPath(entryPath);
  return (
    isNormalizedPathSameOrNested(entryCanonical, canonicalizePath(sourceDir)) ||
    isNormalizedPathSameOrNested(entryCanonical, canonicalizeEntryPath(sourceDir)) ||
    isNormalizedPathSameOrNested(normalizeLiteralPath(entryPath), normalizeLiteralPath(sourceDir))
  );
}

/**
 * Check whether sourceDir literally or canonically matches or encloses an entry path.
 */
function isSourceEnclosingEntry(sourceDir, entryPath) {
  const entryCanonical = canonicalizeEntryPath(entryPath);
  return (
    isNormalizedPathSameOrNested(canonicalizePath(sourceDir), entryCanonical) ||
    isNormalizedPathSameOrNested(canonicalizeEntryPath(sourceDir), entryCanonical)
  );
}

/**
 * Safely remove a plugin directory or symlink/junction without deleting symlink targets.
 */
export function removePluginEntry(entryPath) {
  if (typeof entryPath !== "string" || entryPath.trim().length === 0) {
    throw new TypeError("removePluginEntry requires a non-empty entryPath string");
  }

  const normalizedPath = stripTrailingSeparators(entryPath);
  if (normalizedPath === path.parse(normalizedPath).root) {
    throw new Error(`Refusing to remove filesystem root: ${normalizedPath}`);
  }

  let stat;
  try {
    stat = fs.lstatSync(normalizedPath);
  } catch (err) {
    if (err && err.code === "ENOENT") return false;
    throw err;
  }

  if (stat.isSymbolicLink()) {
    try {
      fs.unlinkSync(normalizedPath);
    } catch (unlinkErr) {
      if (unlinkErr && (unlinkErr.code === "EPERM" || unlinkErr.code === "EISDIR")) {
        fs.rmdirSync(normalizedPath);
      } else {
        throw unlinkErr;
      }
    }
    return true;
  }

  fs.rmSync(normalizedPath, { recursive: true, force: true });
  return true;
}

function validateInstallSourceBundle(rootDir) {
  for (const file of REQUIRED_FILES) {
    const src = path.join(rootDir, file);
    if (!fs.existsSync(src) || !fs.statSync(src).isFile()) {
      throw new Error(`Missing required plugin file: ${src}`);
    }
  }
  for (const dir of REQUIRED_DIRS) {
    const srcDir = path.join(rootDir, dir);
    if (!fs.existsSync(srcDir) || !fs.statSync(srcDir).isDirectory()) {
      throw new Error(`Missing required plugin directory: ${srcDir}`);
    }
  }
}

function parseInstallScopeFlags(cmd, flags) {
  for (const flag of flags) {
    if (!VALID_INSTALL_FLAGS.has(flag)) {
      throw new Error(`Unknown option "${flag}" for ${cmd}. Run with --help for usage.`);
    }
  }
  const isWorkspace = flags.includes("--workspace") || flags.includes("-w");
  const isGlobal = flags.includes("--global") || flags.includes("-g");
  if (isWorkspace && isGlobal) {
    throw new Error(`Cannot specify both --global and --workspace for ${cmd}.`);
  }
  return { isWorkspace };
}

function printHelp(pkgVersion, stdout) {
  stdout(`
Antigravity Context Mode CLI (v${pkgVersion})

Usage:
  npx antigravity-plugin-context-mode install [options]     Install plugin into Google Antigravity
  npx antigravity-plugin-context-mode uninstall [options]   Remove installed plugin
  npx antigravity-plugin-context-mode                      Start MCP stdio JSON-RPC server

Options:
  --global, -g     Install globally in ~/.gemini/config/plugins/context-mode (default)
  --workspace, -w  Install in current workspace (.gemini/plugins/context-mode)
`);
}

/**
 * Execute CLI subcommands when arguments are supplied.
 * Returns { handled: boolean, exitCode: number }.
 */
export function runCli({
  argv = process.argv.slice(2),
  rootDir,
  cwd = process.cwd(),
  env = process.env,
  stdout = console.log,
  stderr = console.error
} = {}) {
  if (!Array.isArray(argv)) {
    throw new TypeError("runCli requires argv to be an array");
  }
  if (!env || typeof env !== "object" || Array.isArray(env)) {
    throw new TypeError("runCli requires env to be an object");
  }
  if (argv.length === 0) {
    return { handled: false, exitCode: 0 };
  }
  if (typeof rootDir !== "string" || rootDir.trim().length === 0) {
    throw new TypeError("runCli requires a non-empty rootDir string");
  }

  const pkgVersion = loadPackageVersion(rootDir);
  const [cmd, ...rest] = argv;

  if (cmd === "--version" || cmd === "-v") {
    if (rest.length > 0) {
      stderr(`Unknown option(s) for ${cmd}: ${rest.join(" ")}. Run with --help for usage.`);
      return { handled: true, exitCode: 1 };
    }
    stdout(`antigravity-plugin-context-mode v${pkgVersion}`);
    return { handled: true, exitCode: 0 };
  }

  if (cmd === "--help" || cmd === "-h") {
    if (rest.length > 0) {
      stderr(`Unknown option(s) for ${cmd}: ${rest.join(" ")}. Run with --help for usage.`);
      return { handled: true, exitCode: 1 };
    }
    printHelp(pkgVersion, stdout);
    return { handled: true, exitCode: 0 };
  }

  if (cmd !== "install" && cmd !== "uninstall") {
    stderr(`Unknown CLI command or option: ${argv.join(" ")}. Run with --help for usage.`);
    return { handled: true, exitCode: 1 };
  }

  let isWorkspace;
  try {
    ({ isWorkspace } = parseInstallScopeFlags(cmd, rest));
  } catch (err) {
    stderr(`\n❌ ${err.message}\n`);
    return { handled: true, exitCode: 1 };
  }

  const rawUserProfile = typeof env.USERPROFILE === "string" ? env.USERPROFILE.trim() : "";
  const rawHome = typeof env.HOME === "string" ? env.HOME.trim() : "";
  const homeDir = rawUserProfile || rawHome;
  if (!isWorkspace && !homeDir) {
    stderr("\n❌ Could not determine home directory (USERPROFILE/HOME is not set).\n");
    return { handled: true, exitCode: 1 };
  }
  if (isWorkspace && (typeof cwd !== "string" || cwd.trim().length === 0)) {
    throw new TypeError("runCli requires a non-empty cwd string when using --workspace");
  }

  const pluginsDir = isWorkspace
    ? path.join(cwd, ".gemini", "plugins")
    : path.join(homeDir, ".gemini", "config", "plugins");
  const targetDir = path.join(pluginsDir, PLUGIN_DIR_NAME);
  const legacyDir = path.join(pluginsDir, LEGACY_PLUGIN_DIR_NAME);

  if (cmd === "uninstall") {
    try {
      const removedTarget = removePluginEntry(targetDir);
      const removedLegacy = removePluginEntry(legacyDir);

      if (removedTarget) {
        stdout(`\n✔ Antigravity Context Mode successfully removed from:`);
        stdout(`  ${targetDir}\n`);
      }
      if (removedLegacy) {
        stdout(`\n🧹 Removed legacy plugin directory:`);
        stdout(`  ${legacyDir}\n`);
      }
      if (!removedTarget && !removedLegacy) {
        stdout(`\nℹ Plugin not found at: ${targetDir}\n`);
      }
      return { handled: true, exitCode: 0 };
    } catch (err) {
      stderr(`\n❌ Uninstall failed: ${err.message}\n`);
      return { handled: true, exitCode: 1 };
    }
  }

  stdout(`\n📦 Installing Antigravity Context Mode v${pkgVersion}...`);
  try {
    if (isEntrySameOrEnclosesSource(targetDir, rootDir)) {
      throw new Error(`Target directory (${targetDir}) matches or encloses source directory (${rootDir}); refusing self-overwrite.`);
    }
    for (const dir of REQUIRED_DIRS) {
      if (isSourceEnclosingEntry(path.join(rootDir, dir), targetDir)) {
        throw new Error(`Target directory (${targetDir}) cannot be inside source bundle directory (${dir}).`);
      }
    }

    validateInstallSourceBundle(rootDir);

    try {
      const targetStat = fs.lstatSync(targetDir);
      if (targetStat.isSymbolicLink()) {
        removePluginEntry(targetDir);
        stdout(`🧹 Replaced symlinked plugin directory: ${targetDir}`);
      }
    } catch (statErr) {
      if (!statErr || statErr.code !== "ENOENT") {
        throw statErr;
      }
    }

    fs.mkdirSync(targetDir, { recursive: true });

    for (const file of REQUIRED_FILES) {
      fs.copyFileSync(path.join(rootDir, file), path.join(targetDir, file));
    }

    for (const dir of REQUIRED_DIRS) {
      fs.cpSync(path.join(rootDir, dir), path.join(targetDir, dir), { recursive: true });
    }

    if (canonicalizeEntryPath(legacyDir) !== canonicalizeEntryPath(targetDir)) {
      if (isEntrySameOrEnclosesSource(legacyDir, rootDir)) {
        if (fs.existsSync(legacyDir)) {
          stdout(`ℹ Skipping automatic removal of active source directory: ${legacyDir}`);
        }
      } else {
        try {
          if (removePluginEntry(legacyDir)) {
            stdout(`🧹 Migrated legacy plugin directory (removed ${legacyDir})`);
          }
        } catch (legacyErr) {
          if (
            legacyErr?.code === "EPERM" ||
            legacyErr?.code === "EBUSY" ||
            legacyErr?.code === "ENOTEMPTY"
          ) {
            stderr(
              `⚠ Could not remove legacy plugin directory (${legacyDir}) because it is currently in use by an active session (${legacyErr.code}). Restart Antigravity and remove it manually or re-run install/uninstall.`
            );
          } else {
            throw legacyErr;
          }
        }
      }
    }

    stdout(`\n✨ Installation complete!`);
    stdout(`📍 Location: ${targetDir}`);
    stdout(`🚀 Restart or open the Google Antigravity App to activate Context Mode.\n`);
    return { handled: true, exitCode: 0 };
  } catch (err) {
    stderr(`\n❌ Installation failed: ${err.message}\n`);
    return { handled: true, exitCode: 1 };
  }
}
