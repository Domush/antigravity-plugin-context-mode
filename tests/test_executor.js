import test from "node:test";
import assert from "node:assert/strict";
import { executeCode } from "../lib/executor.js";

test("executeCode - Node.js snippet execution", async () => {
  const result = await executeCode({
    language: "javascript",
    code: "console.log(JSON.stringify({ status: 'success', value: 42 }));"
  });

  assert.equal(result.ok, true);
  assert.equal(result.exitCode, 0);
  assert.ok(result.stdout.includes('"value": 42') || result.stdout.includes('"value":42'));
});

test("executeCode - Timeout handling", async () => {
  const result = await executeCode({
    language: "javascript",
    code: "setTimeout(() => {}, 5000);",
    timeoutMs: 300
  });

  assert.equal(result.ok, false);
  assert.equal(result.timedOut, true);
});
