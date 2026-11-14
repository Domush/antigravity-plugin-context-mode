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

function getExemptExtensions(sessionId = null) {
  try {
    const store = new ContextModeStore();
    return store.getExemptExtensions(sessionId);
  } catch {
    return Array.from(BINARY_EXTENSIONS);
  }
}

function getMaxLineRange(maxReadBytes = DEFAULT_MAX_READ_BYTES) {
  const envVal = process.env.CONTEXT_MODE_MAX_LINE_RANGE;
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  if (maxReadBytes === 0) return 0;
  return Math.max(50, Math.round(maxReadBytes / 40));
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

const BINARY_EXTENSIONS = new Set([
  // Documents & Office
  ".pdf", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt",
  // Images
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico", ".tiff", ".tif",
  // Audio & Video
  ".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac", ".mp4", ".webm", ".mkv", ".avi", ".mov",
  // Archives & Executables
  ".zip", ".tar", ".gz", ".7z", ".rar", ".exe", ".dll", ".so", ".dylib", ".bin",
  // 3D & Models
  ".blend", ".fbx", ".obj", ".gltf", ".glb", ".wasm"
]);

function isUserAttachedFile(filePath, absPath) {
  const normalized = (absPath || filePath || "").replace(/\\/g, "/");
  return (
    normalized.includes("/.user_uploaded/") ||
    normalized.includes("/user_uploaded/") ||
    normalized.includes("/.system_generated/uploads/")
  );
}

function isBinaryFile(absPath, ext) {
  if (BINARY_EXTENSIONS.has((ext || "").toLowerCase())) {
    return true;
  }
  try {
    const fd = fs.openSync(absPath, "r");
    const buf = Buffer.alloc(512);
    const bytesRead = fs.readSync(fd, buf, 0, 512, 0);
    fs.closeSync(fd);
    if (bytesRead === 0) return false;

    // Check for PDF magic header (%PDF)
    if (bytesRead >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
      return true;
    }

    // Check for null bytes indicating binary content
    for (let i = 0; i < bytesRead; i++) {
      if (buf[i] === 0) return true;
    }
  } catch {
    // ignore inspection error
  }
  return false;
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
    const maxLineRange = getMaxLineRange(maxReadBytes);

    if (filePath) {
      const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
      try {
        if (fs.existsSync(absPath)) {
          const ext = path.extname(absPath).toLowerCase();
          const isUserAttachment = isUserAttachedFile(filePath, absPath);
          const exemptExtensions = getExemptExtensions(sessionId);
          const isExemptExt = exemptExtensions.includes(ext);
          const isBinary = isBinaryFile(absPath, ext);

          // Prompt attachments (drag-and-drop / user-uploaded), exempt extensions, or binary files bypass cutoff
          if (isUserAttachment || isExemptExt || isBinary) {
            process.stdout.write(JSON.stringify({ decision: "allow" }) + "\n");
            return;
          }

          const stat = fs.statSync(absPath);
          const isLargeFile = maxReadBytes > 0 && stat.size > maxReadBytes;
          const isWideRange = maxLineRange > 0 && (endLine === null || endLine - startLine > maxLineRange);

          if (isLargeFile && isWideRange) {
            const lineInstruction = maxLineRange > 0 ? ` or provide a tight StartLine/EndLine range (<= ${maxLineRange} lines).` : "";
            const reason =
              `[context-mode protection] File is ${formatBytes(stat.size)} (~${Math.round(stat.size / 4).toLocaleString()} tokens), exceeding the ${formatBytes(maxReadBytes)} context limit. ` +
              `Reading the entire file risks severe context bloat. ` +
              `Please use 'mcp_context-mode_ctx_index(path: "${filePath}")' followed by 'mcp_context-mode_ctx_search'${lineInstruction}`;

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
