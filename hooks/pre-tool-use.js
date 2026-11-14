#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
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

  // 1. Guard read_file
  if (toolName === "read_file") {
    const filePath = args.Path || args.path || args.filePath || "";
    const startLine = args.StartLine ?? args.startLine ?? 1;
    const endLine = args.EndLine ?? args.endLine ?? null;

    if (filePath) {
      const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
      try {
        if (fs.existsSync(absPath)) {
          const stat = fs.statSync(absPath);
          const isLargeFile = stat.size > 32 * 1024; // >32 KB
          const isWideRange = endLine === null || endLine - startLine > 400;

          if (isLargeFile && isWideRange) {
            const reason =
              `[context-mode protection] File is ${formatBytes(stat.size)} (~${Math.round(stat.size / 4).toLocaleString()} tokens). ` +
              `Reading the entire file exceeds safe context window limits. ` +
              `Please use 'mcp_context-mode_ctx_index(path: "${filePath}")' followed by 'mcp_context-mode_ctx_search', ` +
              `or provide a tight StartLine/EndLine range (<= 300 lines).`;

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
