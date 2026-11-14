import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import readline from "node:readline";

test("MCP Server - JSON-RPC stdio handshake and tools/call", async () => {
  const serverPath = path.resolve("server.js");
  const child = spawn(process.execPath, [serverPath], {
    stdio: ["pipe", "pipe", "pipe"]
  });

  const rl = readline.createInterface({
    input: child.stdout,
    terminal: false
  });

  const responses = [];
  rl.on("line", (line) => {
    if (line.trim()) {
      responses.push(JSON.parse(line));
    }
  });

  function send(msg) {
    child.stdin.write(JSON.stringify(msg) + "\n");
  }

  function waitForResponse(id) {
    return new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        const found = responses.find((r) => r.id === id);
        if (found) {
          clearInterval(interval);
          resolve(found);
        }
      }, 20);

      setTimeout(() => {
        clearInterval(interval);
        reject(new Error(`Timed out waiting for response id ${id}`));
      }, 5000);
    });
  }

  try {
    // 1. Initialize
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05" }
    });
    const initRes = await waitForResponse(1);
    assert.equal(initRes.result.serverInfo.name, "antigravity-plugin-context-mode");

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
    assert.ok(toolNames.includes("ctx_index"));

    // 3. tools/call -> ctx_doctor
    send({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "ctx_doctor",
        arguments: {}
      }
    });
    const callRes = await waitForResponse(3);
    assert.equal(callRes.result.isError, false);
    const parsed = JSON.parse(callRes.result.content[0].text);
    assert.equal(parsed.doctor.status, "HEALTHY");
  } finally {
    child.kill();
  }
});
