#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ContextModeStore } from "../lib/store.js";

export const DEFAULT_MAX_READ_BYTES = 8192; // 8 KB default cutoff
export const DEFAULT_MAX_LINE_RANGE = 200; // 200 lines max un-indexed slice

function getMaxReadBytes(sessionId = null) {
  try {
    const store = new ContextModeStore();
    return store.getCutoff(sessionId);
  } catch {
    const envVal = process.env.CONTEXT_MODE_MAX_READ_BYTES;
    if (envVal) {
      const parsed = parseInt(envVal, 10);
      if (!Number.isNaN(parsed)) return parsed;
    }
    return DEFAULT_MAX_READ_BYTES;
  }
}

function getMaxLineRange() {
  const envVal = process.env.CONTEXT_MODE_MAX_LINE_RANGE;
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_MAX_LINE_RANGE;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${Number.isInteger(kb) ? kb : kb.toFixed(1)} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb : mb.toFixed(2)} MB`;
}

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      resolve(data);
    });
  });
}

const UNBOUNDED_COMMAND_PATTERNS = [
  /^\s*(cat|type|Get-Content)\s+.*?\.(log|json|xml|csv|tsv|dump|sql|txt)\s*$/i,
  /^\s*git\s+log\s*$/i,
  /^\s*git\s+log\s+--oneline\s*$/i,
  /^\s*curl(\.exe)?\s+-s?\s+https?:\/\/.*?\.(json|log|txt)\s*$/i
];

async function main() {
  const rawInput = await readStdin();
  if (!rawInput.trim()) {
    process.stdout.write(JSON.stringify({ decision: "allow" }) + "\n");
    return;
  }

  let payload;
  try {
    payload = JSON.parse(rawInput);
  } catch {
    process.stdout.write(JSON.stringify({ decision: "allow" }) + "\n");
    return;
  }

  const toolCall = payload.toolCall || {};
  const toolName = toolCall.name || "";
  const args = toolCall.args || {};
  const cwd = payload.cwd || process.cwd();
  const sessionId =
    payload.sessionId ||
    payload.session_id ||
    payload.conversationId ||
    process.env.ANTIGRAVITY_CONVERSATION_ID ||
    null;

  // 1. Guard read_file
  if (toolName === "read_file") {
    const filePath = args.Path || args.path || args.filePath || "";
    const startLine = args.StartLine ?? args.startLine ?? 1;
    const endLine = args.EndLine ?? args.endLine ?? null;
    const maxReadBytes = getMaxReadBytes(sessionId);
    const maxLineRange = getMaxLineRange();

    if (filePath) {
      const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
      try {
        if (fs.existsSync(absPath)) {
          const stat = fs.statSync(absPath);
          const isLargeFile = maxReadBytes > 0 && stat.size > maxReadBytes;
          const isWideRange = endLine === null || endLine - startLine > maxLineRange;

          if (isLargeFile && isWideRange) {
            const reason =
              `[context-mode protection] File is ${formatBytes(stat.size)} (~${Math.round(stat.size / 4).toLocaleString()} tokens), exceeding the ${formatBytes(maxReadBytes)} context limit. ` +
              `Reading the entire file risks severe context bloat. ` +
              `Please use 'mcp_context-mode_ctx_index(path: "${filePath}")' followed by 'mcp_context-mode_ctx_search', ` +
              `or provide a tight StartLine/EndLine range (<= ${maxLineRange} lines).`;

            process.stdout.write(
              JSON.stringify({
                decision: "deny",
                reason
              }) + "\n"
            );
            return;
          }
        }
      } catch {
        // ignore stat error, allow tool to report error
      }
    }
  }

  // 2. Guard run_command
  if (toolName === "run_command") {
    const commandLine = args.CommandLine || args.commandLine || args.command || "";
    for (const pattern of UNBOUNDED_COMMAND_PATTERNS) {
      if (pattern.test(commandLine)) {
        const reason =
          `[context-mode protection] Command matches an unbounded dump pattern that could flood the context window. ` +
          `Please use 'mcp_context-mode_ctx_execute' (runs in local sandbox with token bounding) or append a limiter ` +
          `such as '| Select-Object -First 50' or '| head -n 50'.`;

        process.stdout.write(
          JSON.stringify({
            decision: "deny",
            reason
          }) + "\n"
        );
        return;
      }
    }
  }

  // Default allow
  process.stdout.write(JSON.stringify({ decision: "allow" }) + "\n");
}

main().catch(() => {
  process.stdout.write(JSON.stringify({ decision: "allow" }) + "\n");
});
