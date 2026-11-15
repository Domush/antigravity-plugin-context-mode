import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { ContextModeStore } from "../lib/store.js";

function runHook(hookPath, stdinJson, env = {}) {
  return new Promise((resolve, reject) => {
    const childEnv = { ...process.env, ...env };
    delete childEnv.ANTIGRAVITY_CONVERSATION_ID;
    const child = spawn(process.execPath, [hookPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: childEnv
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

test("PreToolUse hook - exempts PDF documents over cutoff", async () => {
  const hookFile = path.resolve("hooks/pre-tool-use.js");
  const tmpFile = path.join(os.tmpdir(), "sample.pdf");
  // Write 50 KB dummy PDF
  fs.writeFileSync(tmpFile, "%PDF-1.5 dummy binary stream content " + "0".repeat(50 * 1024));

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

test("PreToolUse hook - exempts images and binary files over cutoff", async () => {
  const hookFile = path.resolve("hooks/pre-tool-use.js");
  const tmpFile = path.join(os.tmpdir(), "screenshot.png");
  // Write 40 KB PNG
  fs.writeFileSync(tmpFile, "\x89PNG\r\n\x1a\n" + "X".repeat(40 * 1024));

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

test("PreToolUse hook - exempts user prompt attachments in .user_uploaded", async () => {
  const hookFile = path.resolve("hooks/pre-tool-use.js");
  const uploadDir = path.join(os.tmpdir(), ".user_uploaded");
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  const tmpFile = path.join(uploadDir, "drag_drop_doc.txt");
  // Write 30 KB text file inside .user_uploaded
  fs.writeFileSync(tmpFile, "C".repeat(30 * 1024));

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
    fs.rmdirSync(uploadDir);
  }
});

test("PreToolUse hook - exempts MS Office documents (.docx, .xlsx) over cutoff", async () => {
  const hookFile = path.resolve("hooks/pre-tool-use.js");
  const tmpDocx = path.join(os.tmpdir(), "quarterly_report.docx");
  fs.writeFileSync(tmpDocx, "PK\x03\x04" + "D".repeat(40 * 1024));

  try {
    const result = await runHook(hookFile, {
      toolCall: {
        name: "read_file",
        args: { Path: tmpDocx }
      }
    });

    assert.equal(result.decision, "allow");
  } finally {
    fs.unlinkSync(tmpDocx);
  }
});

test("PreToolUse hook - denies un-paged .md and .cs files with quoted Path and records interception", async () => {
  const hookFile = path.resolve("hooks/pre-tool-use.js");
  const tmpMd = path.join(os.tmpdir(), "large_doc.md");
  const tmpCs = path.join(os.tmpdir(), "large_code.cs");
  const testConv = `test-conv-${Date.now()}`;

  fs.writeFileSync(tmpMd, "# Header\n" + "Word ".repeat(6000)); // ~30 KB
  fs.writeFileSync(tmpCs, "namespace Foo {\n" + "  int x = 1;\n".repeat(2000) + "}"); // ~28 KB

  try {
    // 1. Test .md with outer double quotes in Path
    const resMd = await runHook(hookFile, {
      conversationId: testConv,
      toolCall: {
        name: "read_file",
        args: { Path: `"${tmpMd}"` }
      }
    });

    assert.equal(resMd.decision, "deny");
    assert.ok(resMd.reason.includes("context-mode protection"));

    // 2. Test .cs with outer double quotes in Path
    const resCs = await runHook(hookFile, {
      conversationId: testConv,
      toolCall: {
        name: "read_file",
        args: { Path: `"${tmpCs}"` }
      }
    });

    assert.equal(resCs.decision, "deny");
    assert.ok(resCs.reason.includes("context-mode protection"));

    // 3. Verify interception events were recorded in store
    const { ContextModeStore } = await import("../lib/store.js");
    const store = new ContextModeStore();
    const stats = store.getStats(testConv);
    assert.ok(stats.calls >= 2, `Expected at least 2 calls, got ${stats.calls}`);
    assert.ok(stats.keptOutBytes > 20000, `Expected >20KB kept out, got ${stats.keptOutBytes}`);
    assert.equal(stats.savingsPercent, 100);
  } finally {
    fs.unlinkSync(tmpMd);
    fs.unlinkSync(tmpCs);
  }
});

test("PreToolUse hook - denies unbounded Get-Content/cat on .md and .cs files with quotes", async () => {
  const hookFile = path.resolve("hooks/pre-tool-use.js");
  const testConv = `test-conv-cmd-${Date.now()}`;

  // 1. Quoted Get-Content on .md
  const res1 = await runHook(hookFile, {
    conversationId: testConv,
    toolCall: {
      name: "run_command",
      args: { CommandLine: 'Get-Content "examples\\GDD.md"' }
    }
  });
  assert.equal(res1.decision, "deny");

  // 2. Quoted gc on .cs
  const res2 = await runHook(hookFile, {
    conversationId: testConv,
    toolCall: {
      name: "run_command",
      args: { CommandLine: "gc 'src\\App.cs'" }
    }
  });
  assert.equal(res2.decision, "deny");

  // 3. curl on raw github .md
  const res3 = await runHook(hookFile, {
    conversationId: testConv,
    toolCall: {
      name: "run_command",
      args: { CommandLine: "curl.exe -s https://raw.githubusercontent.com/WinMerge/winmerge/master/Plugins/README.md" }
    }
  });
  assert.equal(res3.decision, "deny");

  // 4. Bounded Get-Content with -Head 100 should be allowed
  const res4 = await runHook(hookFile, {
    conversationId: testConv,
    toolCall: {
      name: "run_command",
      args: { CommandLine: 'Get-Content ".\\examples\\GDD.md" -Head 100' }
    }
  });
  assert.equal(res4.decision, "allow");
});

test("PreToolUse hook - run_command dynamically checks file size and user exemptions without hardcoded extensions", async () => {
  const hookFile = path.resolve("hooks/pre-tool-use.js");
  const testConv = `test-conv-dyn-${Date.now()}`;
  const { ContextModeStore } = await import("../lib/store.js");
  const store = new ContextModeStore();

  const tmpSmall = path.join(os.tmpdir(), "small_sample.anyext");
  const tmpLarge = path.join(os.tmpdir(), "large_sample.anyext");
  fs.writeFileSync(tmpSmall, "Hello world small file"); // ~22 bytes
  fs.writeFileSync(tmpLarge, "A".repeat(30 * 1024)); // ~30 KB

  try {
    // 1. Safe small file dump via cat is allowed without false positive
    const resSmall = await runHook(hookFile, {
      conversationId: testConv,
      toolCall: {
        name: "run_command",
        args: { CommandLine: `cat "${tmpSmall}"` }
      }
    });
    assert.equal(resSmall.decision, "allow");

    // 2. Large un-exempt file dump via cat is denied
    const resLarge = await runHook(hookFile, {
      conversationId: testConv,
      toolCall: {
        name: "run_command",
        args: { CommandLine: `cat "${tmpLarge}"` }
      }
    });
    assert.equal(resLarge.decision, "deny");
    assert.ok(resLarge.reason.includes("Command attempts an un-paged dump"));

    // 3. User configures .anyext as exempt in SQLite store
    store.addExemptExtension(".anyext", testConv);

    // 4. Large file dump is now allowed because .anyext is in user's dynamic exemptions
    const resExempt = await runHook(hookFile, {
      conversationId: testConv,
      toolCall: {
        name: "run_command",
        args: { CommandLine: `cat "${tmpLarge}"` }
      }
    });
    assert.equal(resExempt.decision, "allow");

    // 5. Wildcard dumps are always denied
    const resWildcard = await runHook(hookFile, {
      conversationId: testConv,
      toolCall: {
        name: "run_command",
        args: { CommandLine: 'Get-Content *.anyext' }
      }
    });
    assert.equal(resWildcard.decision, "deny");
    assert.ok(resWildcard.reason.includes("Wildcard file dump"));
  } finally {
    fs.unlinkSync(tmpSmall);
    fs.unlinkSync(tmpLarge);
  }
});

test("PreToolUse hook - allows all tool calls through without interception when paused", async () => {
  const hookFile = path.resolve("hooks/pre-tool-use.js");
  const tmpFile = path.join(os.tmpdir(), "large_paused_test.txt");
  fs.writeFileSync(tmpFile, "x".repeat(30000)); // 30 KB
  const testConv = `test-paused-${Date.now()}`;
  const store = new ContextModeStore();

  try {
    // 1. Verify it denies when active
    const resActive = await runHook(hookFile, {
      conversationId: testConv,
      toolCall: {
        name: "read_file",
        args: { Path: tmpFile }
      }
    });
    assert.equal(resActive.decision, "deny");

    // 2. Pause protection
    store.setPaused(true, testConv);

    // 3. Verify it allows when paused
    const resPaused = await runHook(hookFile, {
      conversationId: testConv,
      toolCall: {
        name: "read_file",
        args: { Path: tmpFile }
      }
    });
    assert.equal(resPaused.decision, "allow");

    // 4. Resume protection
    store.setPaused(false, testConv);
    const resResumed = await runHook(hookFile, {
      conversationId: testConv,
      toolCall: {
        name: "read_file",
        args: { Path: tmpFile }
      }
    });
    assert.equal(resResumed.decision, "deny");
  } finally {
    store.close();
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
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
