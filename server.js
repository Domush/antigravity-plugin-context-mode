#!/usr/bin/env node
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { ContextModeStore } from "./lib/store.js";
import { createTools } from "./lib/tools.js";
import { formatToolResultMarkdown } from "./lib/format.js";
import { loadPackageVersion, runCli } from "./lib/cli.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgVersion = loadPackageVersion(__dirname);

const cliResult = runCli({ rootDir: __dirname });
if (cliResult.handled) {
  process.exit(cliResult.exitCode);
}

const store = new ContextModeStore();
let currentCwd = process.cwd();
let currentSessionId =
  process.env.ANTIGRAVITY_CONVERSATION_ID ||
  process.env.CONVERSATION_ID ||
  "default";

const tools = createTools({
  store,
  getCwd: () => currentCwd,
  getSessionId: () =>
    process.env.ANTIGRAVITY_ROOT_CONVERSATION_ID ||
    process.env.ANTIGRAVITY_PARENT_CONVERSATION_ID ||
    process.env.ANTIGRAVITY_CONVERSATION_ID ||
    process.env.CONVERSATION_ID ||
    currentSessionId ||
    "default"
});

const TOOL_DEFINITIONS = [
  {
    name: "ctx_execute",
    description:
      "Execute JavaScript, Python, PowerShell, or Shell code in a local sandbox to process large logs, filter data, or compute results without dumping raw output into the context window.",
    inputSchema: {
      type: "object",
      properties: {
        language: {
          type: "string",
          enum: ["javascript", "nodejs", "python", "shell", "powershell", "cmd"],
          description: "Runtime language"
        },
        code: { type: "string", description: "Source code snippet to execute" },
        file: { type: "string", description: "Optional script file path to execute" },
        args: { type: "array", items: { type: "string" }, description: "Optional command-line arguments" },
        intent: { type: "string", description: "One-line explanation of what this script analyzes" }
      }
    }
  },
  {
    name: "ctx_batch",
    description:
      "Execute multiple shell commands in batch, indexing all outputs and returning only matching search snippets to preserve tokens.",
    inputSchema: {
      type: "object",
      properties: {
        commands: { type: "array", items: { type: "string" }, description: "List of shell commands to execute" },
        queries: {
          type: "array",
          items: { type: "string" },
          description: "Search queries to filter and extract from the combined output"
        }
      },
      required: ["commands"]
    }
  },
  {
    name: "ctx_search",
    description:
      "Search the local SQLite FTS5 database across indexed logs, files, tool outputs, and documentation using BM25 + Trigram RRF. If path is a file, directory, or URL, it is automatically indexed Just-In-Time if unindexed or modified.",
    inputSchema: {
      type: "object",
      properties: {
        queries: { type: "array", items: { type: "string" }, description: "Search queries or tokens to match" },
        path: {
          type: "string",
          description: "Path to a file, directory, or URL to search (auto-indexed Just-In-Time if unindexed or changed). Omit to search active session."
        },
        scope: {
          type: "string",
          enum: ["session", "worktree", "all"],
          description: "Search scope when path is omitted (default: session)"
        },
        limit: { type: "integer", description: "Max number of snippets to return (default 5)" },
        offset: { type: "integer", description: "Offset for pagination" },
        reverse: {
          type: "boolean",
          description: "Search in reverse order (tail-first), prioritizing the newest lines/entries at the end of log files (default: false)"
        }
      },
      required: ["queries"]
    }
  },
  {
    name: "ctx_resume",
    description: "Retrieve current session state, active sources, indexed items, and compaction pointers.",
    inputSchema: {
      type: "object",
      properties: {
        seq: { type: "integer", description: "Optional journal event sequence to retrieve" }
      }
    }
  },
  {
    name: "ctx_stats",
    description:
      "Show context window savings report (raw bytes vs tokens returned to LLM, savings percentage, and database metrics).",
    inputSchema: {
      type: "object",
      properties: {
        reset: { type: "boolean", description: "Reset session statistics" }
      }
    }
  },
  {
    name: "ctx_doctor",
    description: "Check database health, FTS5 availability, SQLite schema, and active sandbox runtimes.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "ctx_purge",
    description: "Purge indexed sources and journal records for this session, worktree, or entire database.",
    inputSchema: {
      type: "object",
      properties: {
        scope: { type: "string", enum: ["session", "worktree", "all"], description: "Purge scope" }
      }
    }
  }
];

function sendJsonRpc(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function sendResponse(id, result) {
  sendJsonRpc({
    jsonrpc: "2.0",
    id,
    result
  });
}

function sendError(id, code, message, data) {
  sendJsonRpc({
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      ...(data !== undefined ? { data } : {})
    }
  });
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on("line", async (line) => {
  try {
    const trimmed = line.trim();
    if (!trimmed) return;

    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch (err) {
      sendError(null, -32700, "Parse error", String(err));
      return;
    }

    if (!msg || typeof msg !== "object" || Array.isArray(msg)) {
      sendError(null, -32600, "Invalid Request: expected JSON-RPC object");
      return;
    }

    const { id, method, params } = msg;

    // Notifications carry no id and require no JSON-RPC response
    if (id === undefined || id === null) {
      return;
    }

    if (typeof method !== "string" || method.trim().length === 0) {
      sendError(id, -32600, "Invalid Request: method must be a non-empty string");
      return;
    }

    // Handle requests
    try {
      switch (method) {
        case "initialize": {
          if (params !== undefined && !isPlainObject(params)) {
            sendError(id, -32602, "Invalid params: expected plain object");
            break;
          }
          if (
            params?.rootPath !== undefined &&
            (typeof params.rootPath !== "string" || params.rootPath.trim().length === 0)
          ) {
            sendError(id, -32602, "Invalid params: rootPath must be a non-empty string");
            break;
          }
          if (
            params?.sessionId !== undefined &&
            (typeof params.sessionId !== "string" || params.sessionId.trim().length === 0)
          ) {
            sendError(id, -32602, "Invalid params: sessionId must be a non-empty string");
            break;
          }
          if (params?.rootPath !== undefined) {
            currentCwd = params.rootPath;
          }
          if (params?.sessionId !== undefined) {
            currentSessionId = params.sessionId.trim();
          }
          sendResponse(id, {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: "context-mode",
              version: pkgVersion
            }
          });
          break;
        }

        case "ping": {
          sendResponse(id, {});
          break;
        }

        case "tools/list": {
          sendResponse(id, {
            tools: TOOL_DEFINITIONS
          });
          break;
        }

        case "tools/call": {
          if (!params || typeof params !== "object" || Array.isArray(params)) {
            sendError(id, -32602, "Invalid params: expected object");
            break;
          }

          const toolName = params.name;
          if (typeof toolName !== "string" || toolName.length === 0) {
            sendError(id, -32602, "Invalid params: name must be a non-empty string");
            break;
          }
          if (!Object.hasOwn(tools, toolName) || typeof tools[toolName] !== "function") {
            sendError(id, -32601, `Unknown tool: ${toolName}`);
            break;
          }

          const rawArgs = params.arguments;
          if (
            rawArgs !== undefined &&
            (rawArgs === null || typeof rawArgs !== "object" || Array.isArray(rawArgs))
          ) {
            sendError(id, -32602, "Invalid params: arguments must be a plain object");
            break;
          }

          const toolArgs = rawArgs || {};
          const callSessionId = [
            toolArgs.sessionId,
            params._meta?.conversationId,
            params._meta?.sessionId,
            params.sessionId
          ].find((candidate) => typeof candidate === "string" && candidate.trim().length > 0);
          if (callSessionId) {
            currentSessionId = callSessionId.trim();
          }

          try {
            const result = await tools[toolName](toolArgs);
            sendResponse(id, {
              content: [
                {
                  type: "text",
                  text: formatToolResultMarkdown(toolName, result)
                }
              ],
              isError: false
            });
          } catch (toolErr) {
            sendResponse(id, {
              content: [
                {
                  type: "text",
                  text: `Tool error (${toolName}): ${toolErr?.message || String(toolErr)}`
                }
              ],
              isError: true
            });
          }
          break;
        }

        default: {
          sendError(id, -32601, `Method not found: ${method}`);
          break;
        }
      }
    } catch (handlerErr) {
      sendError(id, -32603, "Internal server error", String(handlerErr));
    }
  } catch (listenerErr) {
    sendError(null, -32603, "Internal server error", String(listenerErr));
  }
});

rl.on("close", () => {
  store.close();
});

process.on("exit", () => {
  store.close();
});

process.on("SIGINT", () => {
  store.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  store.close();
  process.exit(0);
});
