import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ContextModeStore } from "../lib/store.js";

test("ContextModeStore - initialization, FTS5 schema, indexing, and RRF search", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctxm-test-"));
  const dbPath = path.join(tmpDir, "test.db");
  const store = new ContextModeStore({ dbPath });

  try {
    const doc = store.doctor();
    assert.equal(doc.status, "HEALTHY");
    assert.equal(doc.allOk, true);

    const sampleText = `
      class FlightComputerService {
        calculateOrbitalVelocity(mass, radius) {
          const G = 6.67430e-11;
          return Math.sqrt((G * mass) / radius);
        }
      }
      export default FlightComputerService;
    `;

    const indexRes = store.indexContent({
      sessionId: "session-1",
      worktree: tmpDir,
      agent: "antigravity",
      kind: "content",
      label: "flight_computer.js",
      content: sampleText
    });

    assert.ok(indexRes.sourceId);
    assert.equal(indexRes.chunkCount >= 1, true);
    assert.equal(indexRes.bytesTotal, Buffer.byteLength(sampleText, "utf8"));

    // BM25 / RRF Search: Porter search
    const searchRes = store.search({
      queries: ["calculateOrbitalVelocity"],
      sessionId: "session-1"
    });
    assert.ok(searchRes.hits.length >= 1);
    assert.ok(searchRes.hits[0].snippet.includes("calculateOrbitalVelocity"));

    // Trigram search: symbol substring
    const triRes = store.search({
      queries: ["6.67430e-11"],
      sessionId: "session-1"
    });
    assert.ok(triRes.hits.length >= 1);
    assert.ok(triRes.hits[0].snippet.includes("6.67430e-11"));

    // Event recording and stats
    store.recordEvent({
      sessionId: "session-1",
      worktree: tmpDir,
      agent: "antigravity",
      kind: "execution",
      tool: "ctx_execute",
      bytes: 2048,
      sandboxBytes: 2048,
      returnedBytes: 256
    });

    const stats = store.getStats("session-1");
    assert.equal(stats.calls, 1);
    assert.ok(stats.totalRawBytes >= 2048);
    assert.equal(stats.totalReturnedBytes, 256);
    assert.ok(stats.savingsPercent > 80);

    // Resume state
    const state = store.getResumeState("session-1");
    assert.equal(state.recentSources.length, 1);
    assert.equal(state.recentEvents.length, 1);

    // Chunks inspection by source ID
    const chunks = store.getSourceChunks(indexRes.sourceId);
    assert.ok(chunks.length >= 1);
    assert.ok(chunks[0].body.includes("FlightComputerService"));

    // Purge
    const purgeRes = store.purge({ scope: "session", sessionId: "session-1" });
    assert.equal(purgeRes.ok, true);

    const statsAfterPurge = store.getStats("session-1");
    assert.equal(statsAfterPurge.calls, 0);

    // Active/Paused state toggle
    assert.equal(store.isPaused("session-1"), false);
    store.setPaused(true, "session-1");
    assert.equal(store.isPaused("session-1"), true);
    store.setPaused(false, "session-1");
    assert.equal(store.isPaused("session-1"), false);
  } finally {
    store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("ContextModeStore - file category toggles and custom extensions", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctxm-test-cats-"));
  const dbPath = path.join(tmpDir, "test.db");
  const store = new ContextModeStore({ dbPath });

  try {
    const sid = "test-session-cats";

    // 1. Defaults: Standard media/doc categories active, code inactive
    const defaultCats = store.getExemptCategories(sid);
    assert.ok(defaultCats.includes("images"));
    assert.ok(defaultCats.includes("documents"));
    assert.ok(defaultCats.includes("models3d"));
    assert.ok(defaultCats.includes("music"));
    assert.ok(defaultCats.includes("video"));
    assert.ok(defaultCats.includes("archives"));
    assert.equal(defaultCats.includes("code"), false);

    const defaultCustoms = store.getCustomExemptExtensions(sid);
    assert.deepEqual(defaultCustoms, []);

    const defaultExts = store.getExemptExtensions(sid);
    assert.ok(defaultExts.includes(".png"));
    assert.ok(defaultExts.includes(".pdf"));
    assert.ok(defaultExts.includes(".blend"));
    assert.ok(defaultExts.includes(".mp3"));
    assert.equal(defaultExts.includes(".py"), false);

    // 2. Toggle code ON
    store.toggleExemptCategory("code", true, sid);
    assert.ok(store.getExemptCategories(sid).includes("code"));
    assert.ok(store.getExemptExtensions(sid).includes(".py"));
    assert.ok(store.getExemptExtensions(sid).includes(".js"));

    // 3. Toggle code OFF
    store.toggleExemptCategory("code", false, sid);
    assert.equal(store.getExemptCategories(sid).includes("code"), false);
    assert.equal(store.getExemptExtensions(sid).includes(".py"), false);

    // 4. Add custom extension
    store.addCustomExemptExtension(".parquet", sid);
    assert.deepEqual(store.getCustomExemptExtensions(sid), [".parquet"]);
    assert.ok(store.getExemptExtensions(sid).includes(".parquet"));

    // 5. Remove custom extension
    store.removeCustomExemptExtension(".parquet", sid);
    assert.deepEqual(store.getCustomExemptExtensions(sid), []);
    assert.equal(store.getExemptExtensions(sid).includes(".parquet"), false);

    // 6. Reset exemptions
    store.setExemptExtensions(null, sid);
    assert.deepEqual(store.getCustomExemptExtensions(sid), []);
    assert.equal(store.getExemptCategories(sid).includes("code"), false);
    assert.ok(store.getExemptCategories(sid).includes("images"));
  } finally {
    store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("ContextModeStore - lifetime cutoff updates defaults for new sessions and new conversations", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctxm-test-cutoff-"));
  const dbPath = path.join(tmpDir, "test.db");
  const store = new ContextModeStore({ dbPath });

  try {
    // 1. Initial defaults without any configuration should be 8192 (8 KB)
    assert.equal(store.getCutoff(null), 8192);
    assert.equal(store.getCutoff("app"), 8192);
    assert.equal(store.getCutoff("conv-1"), 8192);

    // 2. Change cutoff in lifetime (scope = "lifetime" / "all") to 4096 (4 KB)
    store.setCutoff(4096, "all");
    assert.equal(store.getCutoff(null), 4096);
    // New sessions and new conversations inherit this global lifetime default
    assert.equal(store.getCutoff("app"), 4096);
    assert.equal(store.getCutoff("conv-new"), 4096);
    assert.equal(store.hasCutoffOverride("conv-new"), false);
    assert.equal(store.hasCutoffOverride("app"), false);

    // 3. User sets a session-specific override (e.g. 16 KB) during an app session
    store.setCutoff(16384, "app");
    assert.equal(store.getCutoff("app"), 16384);
    assert.equal(store.hasCutoffOverride("app"), true);
    // Conversations in this session without an explicit override inherit the session cutoff
    assert.equal(store.getCutoff("conv-in-session"), 16384);

    // 4. User changes cutoff in lifetime to 2048 (2 KB).
    // This MUST change the defaults for new sessions and new conversations by clearing session-level overrides
    store.setCutoff(2048, "lifetime");
    assert.equal(store.getCutoff(null), 2048);
    assert.equal(store.getCutoff("app"), 2048);
    assert.equal(store.getCutoff("conv-brand-new"), 2048);
    assert.equal(store.hasCutoffOverride("app"), false);

    // 5. Test specific conversation override is preserved
    store.setCutoff(32768, "conv-custom");
    assert.equal(store.getCutoff("conv-custom"), 32768);
    assert.equal(store.hasCutoffOverride("conv-custom"), true);
    // New conversation still inherits lifetime default
    assert.equal(store.getCutoff("conv-another-new"), 2048);

    // 6. Test clearSessionOverrides()
    store.setCutoff(8192, "app");
    assert.equal(store.getCutoff("app"), 8192);
    store.clearSessionOverrides();
    // After session reset, session defaults back to lifetime cutoff (2048)
    assert.equal(store.getCutoff("app"), 2048);
    assert.equal(store.hasCutoffOverride("app"), false);

    // 7. Setting cutoff to 0 (disabled) in lifetime
    store.setCutoff(0, "all");
    assert.equal(store.getCutoff(null), 0);
    assert.equal(store.getCutoff("app"), 0);
    assert.equal(store.getCutoff("conv-disabled-test"), 0);
  } finally {
    store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("ContextModeStore - accurate context saved calculations without double-counting", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctxm-test-savings-"));
  const dbPath = path.join(tmpDir, "test.db");
  const store = new ContextModeStore({ dbPath });

  try {
    const convId = "test-conv-savings";

    // 1. Record an execution event (produced 10,000 bytes raw, preview truncated to 2,000 bytes)
    // AND indexed into sources with kind: 'execution' (10,000 bytes)
    store.indexContent({
      sessionId: convId,
      worktree: tmpDir,
      agent: "antigravity",
      kind: "execution",
      label: "python script",
      content: "A".repeat(10000)
    });
    store.recordEvent({
      sessionId: convId,
      worktree: tmpDir,
      agent: "antigravity",
      kind: "execution",
      tool: "ctx_execute",
      bytes: 10000,
      sandboxBytes: 10000,
      returnedBytes: 2000
    });

    const s1 = store.getStats(convId);
    // Raw bytes must be exactly 10,000 (NOT double-counted to 20,000!)
    assert.equal(s1.totalRawBytes, 10000);
    assert.equal(s1.totalReturnedBytes, 2000);
    assert.equal(s1.keptOutBytes, 8000);
    assert.equal(s1.savingsPercent, 80.0);
    assert.equal(s1.tokensKeptOut, 2000);

    // 2. Record an interception event (blocked a 40,000 byte un-paged read)
    store.recordEvent({
      sessionId: convId,
      worktree: tmpDir,
      agent: "researcher-subagent",
      kind: "interception",
      tool: "read_file",
      bytes: 40000,
      sandboxBytes: 40000,
      returnedBytes: 0
    });

    const s2 = store.getStats(convId);
    assert.equal(s2.totalRawBytes, 50000);
    assert.equal(s2.totalReturnedBytes, 2000);
    assert.equal(s2.keptOutBytes, 48000);
    assert.equal(s2.savingsPercent, 96.0);
    assert.equal(s2.tokensKeptOut, 12000);

    // 3. Passthrough command event (returned everything, 0 saved, must not penalize other savings)
    store.recordEvent({
      sessionId: convId,
      worktree: tmpDir,
      agent: "antigravity",
      kind: "cmd",
      tool: "pwsh",
      bytes: 1500,
      sandboxBytes: 0,
      returnedBytes: 1500
    });

    const s3 = store.getStats(convId);
    assert.equal(s3.totalRawBytes, 51500);
    assert.equal(s3.totalReturnedBytes, 3500);
    assert.equal(s3.keptOutBytes, 48000); // 48,000 preserved, not reduced by the passthrough!
    assert.equal(s3.savingsPercent, 93.2);

    // 4. Verify getResumeState returns agent information for subagent
    const resume = store.getResumeState(convId, 10);
    assert.ok(resume.recentEvents.some(e => e.agent === "researcher-subagent"));
  } finally {
    store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
