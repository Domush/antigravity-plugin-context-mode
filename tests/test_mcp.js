import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import readline from "node:readline";

async function withMcpServer(fn) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctxm-mcp-"));
  const tmpDbPath = path.join(tmpDir, "mcp-test.db");
  const serverPath = path.resolve("server.js");
  const child = spawn(process.execPath, [serverPath], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, CONTEXT_MODE_DB_PATH: tmpDbPath }
  });

  const rl = readline.createInterface({
    input: child.stdout,
    terminal: false
  });

  const stderrChunks = [];
  child.stderr.on("data", (chunk) => {
    stderrChunks.push(chunk.toString("utf8"));
  });

  const queuedResponses = [];
  const waiters = [];
  let parseError = null;

  function flushWaiters() {
    for (let i = 0; i < waiters.length; i += 1) {
      const waiter = waiters[i];
      if (parseError) {
        waiters.splice(i, 1);
        i -= 1;
        clearTimeout(waiter.timer);
        waiter.reject(parseError);
        continue;
      }
      const matchIdx = queuedResponses.findIndex((r) => r.id === waiter.id);
      if (matchIdx !== -1) {
        const [match] = queuedResponses.splice(matchIdx, 1);
        waiters.splice(i, 1);
        i -= 1;
        clearTimeout(waiter.timer);
        waiter.resolve(match);
      }
    }
  }

  rl.on("line", (line) => {
    if (line.trim()) {
      try {
        queuedResponses.push(JSON.parse(line));
      } catch (err) {
        parseError = new Error(`Malformed JSON on server stdout: ${line} (${err.message})`);
      }
      flushWaiters();
    }
  });

  function sendRaw(rawLine) {
    child.stdin.write(rawLine + "\n");
  }

  function send(msg) {
    sendRaw(JSON.stringify(msg));
  }

  function waitForResponse(id, timeoutMs = 5000) {
    if (parseError) {
      return Promise.reject(parseError);
    }
    const existingIdx = queuedResponses.findIndex((r) => r.id === id);
    if (existingIdx !== -1) {
      const [match] = queuedResponses.splice(existingIdx, 1);
      return Promise.resolve(match);
    }
    return new Promise((resolve, reject) => {
      const entry = { id, resolve, reject, timer: null };
      entry.timer = setTimeout(() => {
        const idx = waiters.indexOf(entry);
        if (idx !== -1) waiters.splice(idx, 1);
        const stderrText = stderrChunks.join("").trim();
        reject(
          new Error(
            `Timed out waiting for response id ${String(id)}${stderrText ? ` (stderr: ${stderrText})` : ""}`
          )
        );
      }, timeoutMs);
      waiters.push(entry);
    });
  }

  try {
    await fn({ tmpDir, send, sendRaw, waitForResponse });
  } finally {
    while (waiters.length > 0) {
      const waiter = waiters.pop();
      clearTimeout(waiter.timer);
      waiter.reject(new Error("MCP server test teardown"));
    }
    rl.close();
    if (child.exitCode === null && child.signalCode === null) {
      await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (!settled) {
            settled = true;
            clearTimeout(termTimer);
            clearTimeout(killTimer);
            clearTimeout(hardTimer);
            resolve();
          }
        };

        child.once("exit", finish);

        const termTimer = setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) {
            child.kill();
          }
        }, 300);

        const killTimer = setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) {
            child.kill("SIGKILL");
          }
        }, 1500);

        const hardTimer = setTimeout(finish, 3000);

        child.stdin.end();
      });
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

test("MCP Server - JSON-RPC stdio handshake, tools/call (ctx_doctor, ctx_execute, ctx_search)", async () => {
  await withMcpServer(async ({ tmpDir, send, waitForResponse }) => {
    // 1. Initialize with rootPath set to isolated tmpDir
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", rootPath: tmpDir, sessionId: "mcp-suite" }
    });
    const initRes = await waitForResponse(1);
    assert.equal(initRes.result.serverInfo.name, "context-mode");

    // 2. tools/list
    send({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {}
    });
    const listRes = await waitForResponse(2);
    assert.ok(Array.isArray(listRes.result.tools));
    const toolNames = listRes.result.tools.map((t) => t.name);
    assert.ok(toolNames.includes("ctx_execute"));
    assert.ok(toolNames.includes("ctx_search"));
    assert.equal(toolNames.includes("ctx_index"), false);

    // 3. tools/call -> ctx_doctor
    send({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "ctx_doctor", arguments: {} }
    });
    const docRes = await waitForResponse(3);
    assert.equal(docRes.result.isError, false);
    const docMd = docRes.result.content[0].text;
    assert.ok(docMd.startsWith("## ctx_doctor"), `Expected Markdown heading, got: ${docMd}`);
    assert.ok(docMd.includes("HEALTHY"), `Doctor reported non-healthy status: ${docMd}`);
    assert.throws(() => JSON.parse(docMd), "Expected Markdown text rather than raw JSON");

    // 4. tools/call -> ctx_execute returns Markdown
    send({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "ctx_execute",
        arguments: {
          language: "javascript",
          code: "console.log('MCP_EXEC_OUTPUT_789');",
          intent: "Verify ctx_execute over MCP"
        }
      }
    });
    const execRes = await waitForResponse(4);
    assert.equal(execRes.result.isError, false);
    const execMd = execRes.result.content[0].text;
    assert.ok(execMd.startsWith("## ctx_execute"));
    assert.ok(execMd.includes("- **Status:** OK (exit 0)"));
    assert.ok(execMd.includes("MCP_EXEC_OUTPUT_789"));
    assert.throws(() => JSON.parse(execMd));

    // 5. tools/call -> ctx_search returns Markdown and enforces 20-hit cap when limit > 20
    const capDir = path.join(tmpDir, "cap-dir");
    fs.mkdirSync(capDir, { recursive: true });
    for (let i = 1; i <= 25; i += 1) {
      const num = String(i).padStart(2, "0");
      fs.writeFileSync(
        path.join(capDir, `item-${num}.txt`),
        `UNIQUE_CAP_TOKEN_2026 entry_${num}\n`,
        "utf8"
      );
    }

    send({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "ctx_search",
        arguments: {
          queries: ["UNIQUE_CAP_TOKEN_2026"],
          path: "cap-dir/",
          limit: 50
        }
      }
    });
    const searchRes = await waitForResponse(5);
    assert.equal(searchRes.result.isError, false);
    const searchMd = searchRes.result.content[0].text;
    assert.ok(searchMd.startsWith("## ctx_search"));
    assert.ok(searchMd.includes("- **Matches:** 20 of 25 (offset 0)"), `Unexpected Matches line in:\n${searchMd}`);
    const hitHeadings = searchMd.match(/^### \d+\./gm) || [];
    assert.equal(hitHeadings.length, 20);
    assert.equal(searchMd.includes("### 21."), false);
    assert.throws(() => JSON.parse(searchMd));

    // 6. tools/call -> ctx_search 0-hit Markdown output
    send({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "ctx_search",
        arguments: {
          queries: ["NONEXISTENT_QUERY_XYZ_999"],
          path: "cap-dir/"
        }
      }
    });
    const zeroSearchRes = await waitForResponse(6);
    assert.equal(zeroSearchRes.result.isError, false);
    const zeroMd = zeroSearchRes.result.content[0].text;
    assert.ok(zeroMd.includes("- **Matches:** 0 of 0 (offset 0)"));
    assert.ok(zeroMd.includes("_No matching results found._"));
  });
});

test("MCP Server - negative-path JSON-RPC protocol validation", async () => {
  await withMcpServer(async ({ send, sendRaw, waitForResponse }) => {
    // 1. Malformed JSON -> -32700
    sendRaw("{not valid json");
    const parseErr = await waitForResponse(null);
    assert.equal(parseErr.id, null);
    assert.equal(parseErr.error.code, -32700);
    assert.equal(parseErr.error.message, "Parse error");

    // 2. JSON null / array / number -> -32600
    for (const raw of ["null", "[1, 2, 3]", "42"]) {
      sendRaw(raw);
      const invalidReq = await waitForResponse(null);
      assert.equal(invalidReq.id, null);
      assert.equal(invalidReq.error.code, -32600);
      assert.ok(invalidReq.error.message.includes("Invalid Request"));
    }

    // 3. Missing, empty, or non-string method -> -32600
    const badMethods = [
      { id: 10 },
      { id: 11, method: "" },
      { id: 12, method: "   " },
      { id: 13, method: 123 }
    ];
    for (const req of badMethods) {
      send({ jsonrpc: "2.0", ...req });
      const res = await waitForResponse(req.id);
      assert.equal(res.id, req.id);
      assert.equal(res.error.code, -32600);
      assert.ok(res.error.message.includes("method must be a non-empty string"));
    }

    // 4. Invalid initialize params -> -32602
    const badInitParams = [
      { id: 20, params: [] },
      { id: 21, params: "bad" },
      { id: 22, params: { rootPath: "" } },
      { id: 23, params: { rootPath: 123 } },
      { id: 24, params: { sessionId: "   " } }
    ];
    for (const req of badInitParams) {
      send({ jsonrpc: "2.0", id: req.id, method: "initialize", params: req.params });
      const res = await waitForResponse(req.id);
      assert.equal(res.error.code, -32602);
    }

    // 5. tools/call invalid params / name / arguments -> -32602
    const badToolCalls = [
      { id: 30, params: null },
      { id: 31, params: [] },
      { id: 32, params: { arguments: {} } },
      { id: 33, params: { name: "", arguments: {} } },
      { id: 34, params: { name: 99, arguments: {} } },
      { id: 35, params: { name: "ctx_doctor", arguments: [] } },
      { id: 36, params: { name: "ctx_doctor", arguments: null } },
      { id: 37, params: { name: "ctx_doctor", arguments: "bad" } }
    ];
    for (const req of badToolCalls) {
      send({ jsonrpc: "2.0", id: req.id, method: "tools/call", params: req.params });
      const res = await waitForResponse(req.id);
      assert.equal(res.error.code, -32602, `Expected -32602 for id ${req.id}`);
    }

    // 6. Unknown tool, prototype property names, and unknown method -> -32601
    for (const [id, toolName] of [
      [40, "ctx_nonexistent"],
      [41, "constructor"],
      [42, "toString"]
    ]) {
      send({
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: { name: toolName, arguments: {} }
      });
      const res = await waitForResponse(id);
      assert.equal(res.error.code, -32601);
      assert.equal(res.error.message, `Unknown tool: ${toolName}`);
    }

    send({ jsonrpc: "2.0", id: 43, method: "unknown/method", params: {} });
    const unknownMethodRes = await waitForResponse(43);
    assert.equal(unknownMethodRes.error.code, -32601);
    assert.equal(unknownMethodRes.error.message, "Method not found: unknown/method");
  });
});
