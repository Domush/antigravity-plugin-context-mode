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
