import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ContextModeStore } from "../lib/store.js";
import { createTools } from "../lib/tools.js";

test("Tools suite - ctx_execute, ctx_index, ctx_search, ctx_stats", async () => {
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

    // 2. ctx_index
    const indexRes = await tools.ctx_index({
      content: "Alpha Beta Gamma Delta Epsilon Zeta Eta Theta",
      label: "Greek Alphabet"
    });
    assert.ok(indexRes.sourceId);

    // 3. ctx_search
    const searchRes = await tools.ctx_search({
      queries: ["Epsilon"]
    });
    assert.ok(searchRes.hits.length >= 1);
    assert.ok(searchRes.hits[0].snippet.includes("Epsilon"));

    // 4. ctx_stats
    const statsRes = await tools.ctx_stats();
    assert.ok(statsRes.report.includes("Antigravity context-mode stats"));
    assert.ok(statsRes.report.includes("Active Read Cutoff:"));
    assert.ok(statsRes.report.includes("Exempt Categories:"));
    assert.ok(statsRes.stats.calls >= 1);
    assert.equal(statsRes.stats.activeCutoffBytes, 8192);
    assert.ok(statsRes.stats.exemptCategories.includes("images"));
    assert.ok(statsRes.stats.exemptExtensions.includes(".png"));
    assert.ok(statsRes.stats.exemptExtensions.includes(".pdf"));

    // 5. ctx_doctor
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
