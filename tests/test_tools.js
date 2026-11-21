import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ContextModeStore } from "../lib/store.js";
import { createTools } from "../lib/tools.js";

test("Tools suite - ctx_execute, ctx_search (JIT indexing), ctx_stats", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctxm-tools-"));
  const dbPath = path.join(tmpDir, "tools.db");
  const store = new ContextModeStore({ dbPath });

  const tools = createTools({
    store,
    getCwd: () => tmpDir,
    getSessionId: () => "tools-session"
  });

  try {
    // 1. ctx_execute
    const execRes = await tools.ctx_execute({
      language: "javascript",
      code: "console.log('ANTIGRAVITY_SANDBOX_OUTPUT_123');",
      intent: "Verify sandbox execution"
    });

    assert.equal(execRes.ok, true);
    assert.ok(execRes.output.includes("ANTIGRAVITY_SANDBOX_OUTPUT_123"));
    assert.ok(execRes.sourceId);

    // 2. ctx_index is completely removed
    assert.equal(tools.ctx_index, undefined);

    // 3. ctx_search with Just-In-Time auto-indexing of unindexed file
    const sampleFile = path.join(tmpDir, "physics.js");
    fs.writeFileSync(sampleFile, "export function calculateOrbitalVelocity(mass, radius) { return 7800; }");

    const searchRes1 = await tools.ctx_search({
      queries: ["calculateOrbitalVelocity"],
      path: "physics.js"
    });
    assert.ok(searchRes1.hits.length >= 1);
    assert.ok(searchRes1.hits[0].snippet.includes("calculateOrbitalVelocity"));
    assert.equal(searchRes1.hits[0].path, "physics.js");

    // 4. ctx_search updates JIT when file is modified
    fs.writeFileSync(sampleFile, "export function calculateEscapeVelocity(mass, radius) { return 11200; }");
    const searchRes2 = await tools.ctx_search({
      queries: ["calculateEscapeVelocity"],
      path: "physics.js"
    });
    assert.ok(searchRes2.hits.length >= 1);
    assert.ok(searchRes2.hits[0].snippet.includes("calculateEscapeVelocity"));

    // 5. ctx_search on directory path
    const srcDir = path.join(tmpDir, "sub");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, "module.js"), "const SUPER_TOKEN_X99 = 42;");

    const searchDirRes = await tools.ctx_search({
      queries: ["SUPER_TOKEN_X99"],
      path: "sub/"
    });
    assert.ok(searchDirRes.hits.length >= 1);
    assert.ok(searchDirRes.hits[0].snippet.includes("SUPER_TOKEN_X99"));

    // 6. ctx_search with reverse: true for tail-first log searching
    const logFile = path.join(tmpDir, "Editor.log");
    // Generate multi-chunk log (> 4096 bytes per section to ensure multiple chunks)
    const logChunk0 = "[08:00:00] ERROR: Early morning worker hiccup\n" + "normal log info padding line\n".repeat(200);
    const logChunk1 = "[14:00:00] ERROR: Afternoon network timeout\n" + "normal log info padding line\n".repeat(200);
    const logChunk2 = "[19:00:00] ERROR: LATEST_FATAL_CRASH_PANIC at shutdown\n" + "normal log info padding line\n".repeat(200);
    fs.writeFileSync(logFile, logChunk0 + "\n" + logChunk1 + "\n" + logChunk2);

    const reverseRes = await tools.ctx_search({
      queries: ["ERROR"],
      path: "Editor.log",
      reverse: true,
      limit: 3
    });

    assert.ok(reverseRes.hits.length >= 2);
    assert.equal(reverseRes.reverse, true);
    // The top hit must be the newest log chunk from the bottom of the file
    assert.ok(reverseRes.hits[0].snippet.includes("LATEST_FATAL_CRASH_PANIC"));

    // 7. ctx_stats
    const statsRes = await tools.ctx_stats();
    assert.ok(statsRes.report.includes("Antigravity context-mode stats"));
    assert.ok(statsRes.report.includes("Active Read Cutoff:"));
    assert.ok(statsRes.report.includes("Exempt Categories:"));
    assert.ok(statsRes.stats.calls >= 1);
    assert.equal(statsRes.stats.activeCutoffBytes, 8192);
    assert.ok(statsRes.stats.exemptCategories.includes("images"));
    assert.ok(statsRes.stats.exemptExtensions.includes(".png"));
    assert.ok(statsRes.stats.exemptExtensions.includes(".pdf"));

    // 7. ctx_doctor
    const docRes = await tools.ctx_doctor();
    assert.equal(docRes.doctor.status, "HEALTHY");
    assert.equal(docRes.doctor.activeCutoffBytes, 8192);
    assert.ok(docRes.doctor.exemptCategories.includes("images"));
    assert.ok(docRes.doctor.exemptExtensionsCount > 0);
  } finally {
    store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
