import test, { mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  PLUGIN_DIR_NAME,
  LEGACY_PLUGIN_DIR_NAME,
  loadPackageVersion,
  removePluginEntry,
  runCli
} from "../lib/cli.js";

const REQUIRED_FILES = [
  "plugin.json", "hooks.json", "mcp_config.json", "server.js",
  "package.json", "README.md", "LICENSE", "CHANGELOG.md"
];
const REQUIRED_DIRS = ["lib", "hooks", "skills", "rules", "assets", "sidecars"];

function createFakeBundle(bundleDir, version = "2.0.0") {
  fs.mkdirSync(bundleDir, { recursive: true });
  for (const file of REQUIRED_FILES) {
    const content =
      file === "package.json"
        ? JSON.stringify({ name: "antigravity-plugin-context-mode", version })
        : `content:${file}`;
    fs.writeFileSync(path.join(bundleDir, file), content, "utf8");
  }
  for (const dir of REQUIRED_DIRS) {
    const subDir = path.join(bundleDir, dir);
    fs.mkdirSync(subDir, { recursive: true });
    fs.writeFileSync(path.join(subDir, "marker.txt"), `dir:${dir}`, "utf8");
  }
  return bundleDir;
}

function execCli(opts) {
  const outLines = [];
  const errLines = [];
  const res = runCli({
    ...opts,
    stdout: (msg = "") => outLines.push(String(msg)),
    stderr: (msg = "") => errLines.push(String(msg))
  });
  return { res, out: outLines.join("\n"), err: errLines.join("\n") };
}

function createDirLink(targetDir, linkPath) {
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  fs.symlinkSync(targetDir, linkPath, process.platform === "win32" ? "junction" : "dir");
}

test("loadPackageVersion - valid and fail-fast error cases", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ctxm-cli-ver-"));
  try {
    for (const invalid of ["", "   ", null, undefined, 42]) {
      assert.throws(
        () => loadPackageVersion(invalid),
        (err) => err instanceof TypeError && err.message.includes("non-empty rootDir string")
      );
    }

    const missingDir = path.join(tmpRoot, "missing");
    fs.mkdirSync(missingDir);
    assert.throws(() => loadPackageVersion(missingDir), /Failed to read package\.json/);

    const badJsonDir = path.join(tmpRoot, "bad-json");
    fs.mkdirSync(badJsonDir);
    fs.writeFileSync(path.join(badJsonDir, "package.json"), "{invalid json", "utf8");
    assert.throws(() => loadPackageVersion(badJsonDir), /Failed to parse package\.json/);

    for (const [idx, payload] of [{}, { version: "" }, { version: "   " }, { version: 123 }].entries()) {
      const badVerDir = path.join(tmpRoot, `bad-ver-${idx}`);
      fs.mkdirSync(badVerDir);
      fs.writeFileSync(path.join(badVerDir, "package.json"), JSON.stringify(payload), "utf8");
      assert.throws(() => loadPackageVersion(badVerDir), /Invalid or missing "version" field/);
    }

    const validDir = path.join(tmpRoot, "valid");
    fs.mkdirSync(validDir);
    fs.writeFileSync(path.join(validDir, "package.json"), JSON.stringify({ version: " 2.4.0 " }), "utf8");
    assert.equal(loadPackageVersion(validDir), "2.4.0");
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("runCli - empty argv, --help, and --version", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ctxm-cli-help-"));
  try {
    const bundleDir = createFakeBundle(path.join(tmpRoot, "bundle"), "2.3.1");

    const empty = execCli({ argv: [], rootDir: bundleDir, env: {} });
    assert.deepEqual(empty.res, { handled: false, exitCode: 0 });
    assert.equal(empty.out, "");
    assert.equal(empty.err, "");

    for (const flag of ["--version", "-v"]) {
      const r = execCli({ argv: [flag], rootDir: bundleDir, env: {} });
      assert.deepEqual(r.res, { handled: true, exitCode: 0 });
      assert.equal(r.out, "antigravity-plugin-context-mode v2.3.1");
      assert.equal(r.err, "");
    }

    for (const flag of ["--help", "-h"]) {
      const r = execCli({ argv: [flag], rootDir: bundleDir, env: {} });
      assert.deepEqual(r.res, { handled: true, exitCode: 0 });
      assert.ok(r.out.includes("Antigravity Context Mode CLI (v2.3.1)"));
      assert.ok(r.out.includes("--global, -g"));
      assert.ok(r.out.includes("--workspace, -w"));
    }

    const extraVer = execCli({ argv: ["--version", "--extra"], rootDir: bundleDir, env: {} });
    assert.deepEqual(extraVer.res, { handled: true, exitCode: 1 });
    assert.ok(extraVer.err.includes("Unknown option(s) for --version"));

    const extraHelp = execCli({ argv: ["-h", "extra"], rootDir: bundleDir, env: {} });
    assert.deepEqual(extraHelp.res, { handled: true, exitCode: 1 });
    assert.ok(extraHelp.err.includes("Unknown option(s) for -h"));
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("runCli - global and workspace install/uninstall in isolated temp directories", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ctxm-cli-inst-"));
  try {
    const bundleDir = createFakeBundle(path.join(tmpRoot, "bundle"), "2.0.0");
    const tmpHome = path.join(tmpRoot, "home-userprofile");
    const tmpAltHome = path.join(tmpRoot, "home-posix");
    const tmpWorkspace = path.join(tmpRoot, "workspace");
    fs.mkdirSync(tmpHome);
    fs.mkdirSync(tmpAltHome);
    fs.mkdirSync(tmpWorkspace);

    // Global install via USERPROFILE
    const inst = execCli({ argv: ["install"], rootDir: bundleDir, cwd: tmpRoot, env: { USERPROFILE: tmpHome } });
    assert.deepEqual(inst.res, { handled: true, exitCode: 0 });
    const globalTarget = path.join(tmpHome, ".gemini", "config", "plugins", PLUGIN_DIR_NAME);
    assert.ok(inst.out.includes(globalTarget));
    for (const file of REQUIRED_FILES) {
      assert.equal(fs.existsSync(path.join(globalTarget, file)), true, `Missing installed file ${file}`);
    }
    for (const dir of REQUIRED_DIRS) {
      assert.equal(fs.readFileSync(path.join(globalTarget, dir, "marker.txt"), "utf8"), `dir:${dir}`);
    }
    assert.equal(fs.statSync(path.join(globalTarget, "sidecars")).isDirectory(), true);
    assert.equal(fs.readFileSync(path.join(globalTarget, "sidecars", "marker.txt"), "utf8"), "dir:sidecars");

    // Global uninstall via USERPROFILE
    const uninst = execCli({ argv: ["uninstall", "-g"], rootDir: bundleDir, cwd: tmpRoot, env: { USERPROFILE: tmpHome } });
    assert.deepEqual(uninst.res, { handled: true, exitCode: 0 });
    assert.equal(fs.existsSync(globalTarget), false);
    assert.equal(fs.existsSync(path.join(globalTarget, "sidecars")), false);
    assert.equal(fs.existsSync(path.join(globalTarget, "sidecars", "marker.txt")), false);
    assert.ok(uninst.out.includes("successfully removed"));

    // Uninstall when already absent
    const absent = execCli({ argv: ["uninstall"], rootDir: bundleDir, cwd: tmpRoot, env: { USERPROFILE: tmpHome } });
    assert.deepEqual(absent.res, { handled: true, exitCode: 0 });
    assert.ok(absent.out.includes("Plugin not found at:"));

    // Global install fallback to HOME
    const homeFb = execCli({ argv: ["install", "--global"], rootDir: bundleDir, cwd: tmpRoot, env: { HOME: tmpAltHome } });
    assert.deepEqual(homeFb.res, { handled: true, exitCode: 0 });
    assert.equal(
      fs.existsSync(path.join(tmpAltHome, ".gemini", "config", "plugins", PLUGIN_DIR_NAME, "server.js")),
      true
    );

    // Workspace install and uninstall without USERPROFILE/HOME
    const wsInst = execCli({ argv: ["install", "--workspace"], rootDir: bundleDir, cwd: tmpWorkspace, env: {} });
    assert.deepEqual(wsInst.res, { handled: true, exitCode: 0 });
    const wsTarget = path.join(tmpWorkspace, ".gemini", "plugins", PLUGIN_DIR_NAME);
    assert.equal(fs.existsSync(path.join(wsTarget, "plugin.json")), true);
    for (const dir of REQUIRED_DIRS) {
      assert.equal(fs.readFileSync(path.join(wsTarget, dir, "marker.txt"), "utf8"), `dir:${dir}`);
    }

    const wsUninst = execCli({ argv: ["uninstall", "-w"], rootDir: bundleDir, cwd: tmpWorkspace, env: {} });
    assert.deepEqual(wsUninst.res, { handled: true, exitCode: 0 });
    assert.equal(fs.existsSync(wsTarget), false);
    assert.equal(fs.existsSync(path.join(wsTarget, "sidecars")), false);
    assert.equal(fs.existsSync(path.join(wsTarget, "sidecars", "marker.txt")), false);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("runCli - legacy directory and symlink/junction migration preserves target files", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ctxm-cli-legacy-"));
  try {
    const bundleDir = createFakeBundle(path.join(tmpRoot, "bundle"), "2.0.0");
    const tmpHome = path.join(tmpRoot, "home");
    const pluginsDir = path.join(tmpHome, ".gemini", "config", "plugins");
    const targetDir = path.join(pluginsDir, PLUGIN_DIR_NAME);
    const legacyDir = path.join(pluginsDir, LEGACY_PLUGIN_DIR_NAME);

    // 1. Real legacy directory removed on install
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, "old.txt"), "legacy", "utf8");
    const r1 = execCli({ argv: ["install"], rootDir: bundleDir, cwd: tmpRoot, env: { USERPROFILE: tmpHome } });
    assert.deepEqual(r1.res, { handled: true, exitCode: 0 });
    assert.equal(fs.existsSync(legacyDir), false);
    assert.equal(fs.existsSync(path.join(targetDir, "server.js")), true);
    assert.ok(r1.out.includes("Migrated legacy plugin directory"));

    // 2. Real legacy directory removed on uninstall
    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, "old2.txt"), "legacy2", "utf8");
    const r2 = execCli({ argv: ["uninstall"], rootDir: bundleDir, cwd: tmpRoot, env: { USERPROFILE: tmpHome } });
    assert.deepEqual(r2.res, { handled: true, exitCode: 0 });
    assert.equal(fs.existsSync(legacyDir), false);
    assert.ok(r2.out.includes("Removed legacy plugin directory"));

    // 3. Symlink/junction at legacyDir AND targetDir: target files preserved on install & uninstall
    const externalTarget = path.join(tmpRoot, "external-repo");
    fs.mkdirSync(externalTarget, { recursive: true });
    const protectedFile = path.join(externalTarget, "keep.txt");
    fs.writeFileSync(protectedFile, "DO_NOT_DELETE", "utf8");

    createDirLink(externalTarget, legacyDir);
    createDirLink(externalTarget, targetDir);

    const r3 = execCli({ argv: ["install"], rootDir: bundleDir, cwd: tmpRoot, env: { USERPROFILE: tmpHome } });
    assert.deepEqual(r3.res, { handled: true, exitCode: 0 });
    assert.equal(fs.existsSync(legacyDir), false);
    assert.equal(fs.lstatSync(targetDir).isSymbolicLink(), false);
    assert.ok(r3.out.includes("Replaced symlinked plugin directory"));
    assert.equal(fs.readFileSync(protectedFile, "utf8"), "DO_NOT_DELETE");

    createDirLink(externalTarget, legacyDir);
    const r4 = execCli({ argv: ["uninstall"], rootDir: bundleDir, cwd: tmpRoot, env: { USERPROFILE: tmpHome } });
    assert.deepEqual(r4.res, { handled: true, exitCode: 0 });
    assert.equal(fs.existsSync(legacyDir), false);
    assert.equal(fs.existsSync(targetDir), false);
    assert.equal(fs.readFileSync(protectedFile, "utf8"), "DO_NOT_DELETE");

    // 4. Active source inside legacyDir skips removal of legacyDir
    const activeWs = path.join(tmpRoot, "active-legacy-ws");
    const activeLegacySrc = createFakeBundle(path.join(activeWs, ".gemini", "plugins", LEGACY_PLUGIN_DIR_NAME));
    const r5 = execCli({ argv: ["install", "-w"], rootDir: activeLegacySrc, cwd: activeWs, env: {} });
    assert.deepEqual(r5.res, { handled: true, exitCode: 0 });
    assert.equal(fs.existsSync(activeLegacySrc), true);
    assert.ok(r5.out.includes("Skipping automatic removal of active source directory"));
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("runCli and removePluginEntry - negative paths, validation guards, and self-overwrite protection", () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ctxm-cli-neg-"));
  try {
    const bundleDir = createFakeBundle(path.join(tmpRoot, "bundle"), "2.0.0");

    for (const badArgv of [null, "install", {}]) {
      assert.throws(
        () => runCli({ argv: badArgv, rootDir: bundleDir, env: {} }),
        (err) => err instanceof TypeError && err.message.includes("argv to be an array")
      );
    }
    for (const badEnv of [null, [], "env"]) {
      assert.throws(
        () => runCli({ argv: ["install"], rootDir: bundleDir, env: badEnv }),
        (err) => err instanceof TypeError && err.message.includes("env to be an object")
      );
    }
    for (const badRoot of ["", "   ", null]) {
      assert.throws(
        () => runCli({ argv: ["--version"], rootDir: badRoot, env: {} }),
        (err) => err instanceof TypeError && err.message.includes("non-empty rootDir string")
      );
    }
    for (const badCwd of ["", "   ", null]) {
      assert.throws(
        () => runCli({ argv: ["install", "--workspace"], rootDir: bundleDir, cwd: badCwd, env: {} }),
        (err) => err instanceof TypeError && err.message.includes("non-empty cwd string")
      );
    }

    const unknownCmd = execCli({ argv: ["status"], rootDir: bundleDir, env: {} });
    assert.deepEqual(unknownCmd.res, { handled: true, exitCode: 1 });
    assert.ok(unknownCmd.err.includes("Unknown CLI command or option"));

    const unknownFlag = execCli({ argv: ["install", "--bogus"], rootDir: bundleDir, env: {} });
    assert.deepEqual(unknownFlag.res, { handled: true, exitCode: 1 });
    assert.ok(unknownFlag.err.includes('Unknown option "--bogus"'));

    const conflict = execCli({
      argv: ["install", "--global", "--workspace"],
      rootDir: bundleDir,
      cwd: tmpRoot,
      env: { USERPROFILE: tmpRoot }
    });
    assert.deepEqual(conflict.res, { handled: true, exitCode: 1 });
    assert.ok(conflict.err.includes("Cannot specify both --global and --workspace"));

    const spaceHome = execCli({
      argv: ["install"],
      rootDir: bundleDir,
      cwd: tmpRoot,
      env: { USERPROFILE: "   ", HOME: "\t\n" }
    });
    assert.deepEqual(spaceHome.res, { handled: true, exitCode: 1 });
    assert.ok(spaceHome.err.includes("Could not determine home directory"));

    // Self-overwrite & nested-path refusals
    const selfWs = path.join(tmpRoot, "self-ws");
    const selfRoot = createFakeBundle(path.join(selfWs, ".gemini", "plugins", PLUGIN_DIR_NAME));
    const selfRes = execCli({ argv: ["install", "-w"], rootDir: selfRoot, cwd: selfWs, env: {} });
    assert.deepEqual(selfRes.res, { handled: true, exitCode: 1 });
    assert.ok(selfRes.err.includes("refusing self-overwrite"));

    const encWs = path.join(tmpRoot, "enc-ws");
    const nestedBundle = createFakeBundle(path.join(encWs, ".gemini", "plugins", PLUGIN_DIR_NAME, "nested"));
    const encRes = execCli({ argv: ["install", "-w"], rootDir: nestedBundle, cwd: encWs, env: {} });
    assert.deepEqual(encRes.res, { handled: true, exitCode: 1 });
    assert.ok(encRes.err.includes("matches or encloses source directory"));

    const nestedRes = execCli({ argv: ["install", "-w"], rootDir: bundleDir, cwd: path.join(bundleDir, "lib"), env: {} });
    assert.deepEqual(nestedRes.res, { handled: true, exitCode: 1 });
    assert.ok(nestedRes.err.includes("cannot be inside source bundle directory (lib)"));

    // Missing required file and missing required dir in source bundle
    const missingFileBundle = createFakeBundle(path.join(tmpRoot, "missing-file"));
    fs.rmSync(path.join(missingFileBundle, "hooks.json"));
    const mfRes = execCli({ argv: ["install", "-w"], rootDir: missingFileBundle, cwd: tmpRoot, env: {} });
    assert.deepEqual(mfRes.res, { handled: true, exitCode: 1 });
    assert.ok(mfRes.err.includes("Missing required plugin file"));

    const missingDirBundle = createFakeBundle(path.join(tmpRoot, "missing-dir"));
    fs.rmSync(path.join(missingDirBundle, "assets"), { recursive: true, force: true });
    const mdRes = execCli({ argv: ["install", "-w"], rootDir: missingDirBundle, cwd: tmpRoot, env: {} });
    assert.deepEqual(mdRes.res, { handled: true, exitCode: 1 });
    assert.ok(mdRes.err.includes("Missing required plugin directory"));

    const missingSidecarsBundle = createFakeBundle(path.join(tmpRoot, "missing-sidecars"));
    fs.rmSync(path.join(missingSidecarsBundle, "sidecars"), { recursive: true, force: true });
    const msRes = execCli({ argv: ["install", "-w"], rootDir: missingSidecarsBundle, cwd: tmpRoot, env: {} });
    assert.deepEqual(msRes.res, { handled: true, exitCode: 1 });
    assert.ok(msRes.err.includes("Missing required plugin directory"));
    assert.ok(msRes.err.includes("sidecars"));

    // Uninstall error catch path
    const lstatMock = mock.method(fs, "lstatSync", () => {
      const err = new Error("Simulated EACCES");
      err.code = "EACCES";
      throw err;
    });
    try {
      const uninstErr = execCli({ argv: ["uninstall", "-w"], rootDir: bundleDir, cwd: tmpRoot, env: {} });
      assert.deepEqual(uninstErr.res, { handled: true, exitCode: 1 });
      assert.ok(uninstErr.err.includes("Uninstall failed: Simulated EACCES"));
    } finally {
      lstatMock.mock.restore();
    }

    // removePluginEntry guards
    for (const invalidPath of ["", "   ", null, undefined]) {
      assert.throws(
        () => removePluginEntry(invalidPath),
        (err) => err instanceof TypeError && err.message.includes("non-empty entryPath string")
      );
    }
    const fsRoot = path.parse(tmpRoot).root;
    assert.throws(() => removePluginEntry(fsRoot), /Refusing to remove filesystem root/);
    assert.equal(removePluginEntry(path.join(tmpRoot, "does-not-exist")), false);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("runCli - active-session lock on legacyDir logs warning and completes install with exitCode 0", async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ctxm-cli-lock-"));
  let lockHolder = null;
  let spawnErrored = false;

  try {
    const bundleDir = createFakeBundle(path.join(tmpRoot, "bundle"), "2.0.0");
    const tmpHome = path.join(tmpRoot, "home");
    const pluginsDir = path.join(tmpHome, ".gemini", "config", "plugins");
    const targetDir = path.join(pluginsDir, PLUGIN_DIR_NAME);
    const legacyDir = path.join(pluginsDir, LEGACY_PLUGIN_DIR_NAME);
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, "active.lock"), "in-use", "utf8");

    lockHolder = spawn(
      process.execPath,
      ["-e", "process.stdout.write('READY\\n'); process.stdin.resume();"],
      { cwd: legacyDir, stdio: ["pipe", "pipe", "pipe"] }
    );
    lockHolder.on("error", () => {
      spawnErrored = true;
    });

    await new Promise((resolve, reject) => {
      let buf = "";
      let timer = null;
      const cleanup = () => {
        clearTimeout(timer);
        lockHolder.off("error", onError);
        lockHolder.off("exit", onExit);
        lockHolder.stdout.off("data", onData);
      };
      const onError = (err) => {
        spawnErrored = true;
        cleanup();
        reject(err);
      };
      const onExit = (code) => {
        cleanup();
        reject(new Error(`Lock-holder child exited prematurely with code ${code}`));
      };
      const onData = (chunk) => {
        buf += chunk.toString("utf8");
        if (buf.includes("READY")) {
          cleanup();
          resolve();
        }
      };
      timer = setTimeout(() => {
        cleanup();
        reject(new Error("Timed out waiting for lock-holder child process to become ready"));
      }, 5000);
      lockHolder.once("error", onError);
      lockHolder.once("exit", onExit);
      lockHolder.stdout.on("data", onData);
    });

    const r = execCli({ argv: ["install"], rootDir: bundleDir, cwd: tmpRoot, env: { USERPROFILE: tmpHome } });
    assert.deepEqual(r.res, { handled: true, exitCode: 0 });
    assert.equal(fs.existsSync(path.join(targetDir, "server.js")), true);
    assert.ok(r.out.includes("Installation complete!"));

    if (process.platform === "win32") {
      assert.equal(fs.existsSync(legacyDir), true);
      assert.equal(r.out.includes("Migrated legacy plugin directory"), false);
      assert.ok(r.err.includes(legacyDir), `Expected legacyDir in stderr warning: ${r.err}`);
      assert.ok(r.err.includes("currently in use by an active session"));
      assert.match(r.err, /\((EPERM|EBUSY|ENOTEMPTY)\)/);
    } else {
      assert.equal(r.err, "");
      assert.equal(fs.existsSync(legacyDir), false);
      assert.ok(r.out.includes("Migrated legacy plugin directory"));
    }
  } finally {
    if (
      lockHolder &&
      lockHolder.pid !== undefined &&
      !spawnErrored &&
      lockHolder.exitCode === null &&
      lockHolder.signalCode === null
    ) {
      await new Promise((resolve) => {
        let settled = false;
        let killTimer = null;
        let hardTimer = null;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(killTimer);
          clearTimeout(hardTimer);
          lockHolder.off("exit", finish);
          resolve();
        };
        lockHolder.once("exit", finish);
        killTimer = setTimeout(() => {
          if (lockHolder.exitCode === null && lockHolder.signalCode === null) {
            lockHolder.kill("SIGKILL");
          }
        }, 1500);
        hardTimer = setTimeout(finish, 3000);
        lockHolder.kill();
      });
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
