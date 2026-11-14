import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

function runHook(hookPath, stdinJson, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [hookPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...env }
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (c) => (stdout += c));
    child.stderr.on("data", (c) => (stderr += c));

    child.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`Hook exited with code ${code}: ${stderr}`));
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (err) {
        reject(new Error(`Failed to parse hook output: ${stdout}`));
      }
    });

    child.stdin.end(JSON.stringify(stdinJson));
  });
}

test("PreToolUse hook - allow safe small read (< 8 KB)", async () => {
  const hookFile = path.resolve("hooks/pre-tool-use.js");
  const tmpFile = path.join(os.tmpdir(), "small_test.txt");
  fs.writeFileSync(tmpFile, "safe small content");

  try {
    const result = await runHook(hookFile, {
      toolCall: {
        name: "read_file",
        args: { Path: tmpFile }
      }
    });

    assert.equal(result.decision, "allow");
  } finally {
    fs.unlinkSync(tmpFile);
  }
});

test("PreToolUse hook - deny un-paged file read over 8 KB default", async () => {
  const hookFile = path.resolve("hooks/pre-tool-use.js");
  const tmpFile = path.join(os.tmpdir(), "large_test.txt");
  // Write 10 KB (> 8 KB default)
  fs.writeFileSync(tmpFile, "A".repeat(10 * 1024));

  try {
    const result = await runHook(hookFile, {
      toolCall: {
        name: "read_file",
        args: { Path: tmpFile }
      }
    });

    assert.equal(result.decision, "deny");
    assert.ok(result.reason.includes("context-mode protection"));
    assert.ok(result.reason.includes("8 KB context limit"));
  } finally {
    fs.unlinkSync(tmpFile);
  }
});

test("PreToolUse hook - allow read over 8 KB when tight line range provided", async () => {
  const hookFile = path.resolve("hooks/pre-tool-use.js");
  const tmpFile = path.join(os.tmpdir(), "paged_test.txt");
  // 500 lines of 50 bytes each (~25 KB)
  const lines = Array.from({ length: 500 }, (_, i) => `line ${i} some content here to fill up space`).join("\n");
  fs.writeFileSync(tmpFile, lines);

  try {
    const result = await runHook(hookFile, {
      toolCall: {
        name: "read_file",
        args: { Path: tmpFile, StartLine: 10, EndLine: 60 }
      }
    });

    assert.equal(result.decision, "allow");
  } finally {
    fs.unlinkSync(tmpFile);
  }
});

test("PreToolUse hook - respects CONTEXT_MODE_MAX_READ_BYTES env variable", async () => {
  const hookFile = path.resolve("hooks/pre-tool-use.js");
  const tmpFile = path.join(os.tmpdir(), "env_test.txt");
  // Write 12 KB
  fs.writeFileSync(tmpFile, "B".repeat(12 * 1024));

  try {
    // With env var set to 16 KB (16384), 12 KB is allowed
    const allowResult = await runHook(
      hookFile,
      {
        toolCall: {
          name: "read_file",
          args: { Path: tmpFile }
        }
      },
      { CONTEXT_MODE_MAX_READ_BYTES: "16384" }
    );
    assert.equal(allowResult.decision, "allow");

    // With env var set to 4 KB (4096), 12 KB is denied
    const denyResult = await runHook(
      hookFile,
      {
        toolCall: {
          name: "read_file",
          args: { Path: tmpFile }
        }
      },
      { CONTEXT_MODE_MAX_READ_BYTES: "4096" }
    );
    assert.equal(denyResult.decision, "deny");
    assert.ok(denyResult.reason.includes("4 KB context limit"));
  } finally {
    fs.unlinkSync(tmpFile);
  }
});

test("PreToolUse hook - deny unbounded command dumps", async () => {
  const hookFile = path.resolve("hooks/pre-tool-use.js");
  const result = await runHook(hookFile, {
    toolCall: {
      name: "run_command",
      args: { CommandLine: "Get-Content build.log" }
    }
  });

  assert.equal(result.decision, "deny");
  assert.ok(result.reason.includes("context-mode protection"));
});

test("SessionStart hook - injects status system message", async () => {
  const hookFile = path.resolve("hooks/session-start.js");
  const result = await runHook(hookFile, {
    conversationId: "test-conv-123"
  });

  assert.ok(result.injectSteps);
  assert.equal(result.injectSteps.length, 1);
  assert.ok(result.injectSteps[0].systemMessage.systemMessage.includes("context-mode active"));
});
