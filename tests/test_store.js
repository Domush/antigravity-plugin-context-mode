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

    // Purge
    const purgeRes = store.purge({ scope: "session", sessionId: "session-1" });
    assert.equal(purgeRes.ok, true);

    const statsAfterPurge = store.getStats("session-1");
    assert.equal(statsAfterPurge.calls, 0);
  } finally {
    store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
