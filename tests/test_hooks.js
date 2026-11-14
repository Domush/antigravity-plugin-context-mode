import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

function runHook(hookPath, stdinJson) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [hookPath], {
      stdio: ["pipe", "pipe", "pipe"]
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

test("PreToolUse hook - allow safe small read", async () => {
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

test("PreToolUse hook - deny oversized un-paged file read", async () => {
  const hookFile = path.resolve("hooks/pre-tool-use.js");
  const tmpFile = path.join(os.tmpdir(), "large_test.txt");
  // Write > 32KB
  fs.writeFileSync(tmpFile, "A".repeat(40 * 1024));

  try {
    const result = await runHook(hookFile, {
      toolCall: {
        name: "read_file",
        args: { Path: tmpFile }
      }
    });

    assert.equal(result.decision, "deny");
    assert.ok(result.reason.includes("context-mode protection"));
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
