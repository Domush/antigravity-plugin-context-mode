import path from "node:path";

const EXTENSION_LANG_MAP = {
  ".js": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".jsx": "jsx",
  ".ts": "typescript",
  ".tsx": "tsx",
  ".py": "python",
  ".ps1": "powershell",
  ".psm1": "powershell",
  ".sh": "bash",
  ".bash": "bash",
  ".zsh": "bash",
  ".json": "json",
  ".jsonc": "json",
  ".jsonl": "json",
  ".md": "markdown",
  ".markdown": "markdown",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".sql": "sql",
  ".cs": "csharp",
  ".rs": "rust",
  ".go": "go",
  ".java": "java",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".hpp": "cpp",
  ".html": "html",
  ".htm": "html",
  ".xml": "xml",
  ".svg": "xml",
  ".css": "css",
  ".scss": "scss",
  ".log": "text",
  ".txt": "text"
};

/**
 * Format a byte count into a human-readable string.
 */
export function formatBytes(bytes) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) {
    return "0 B";
  }
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Find the longest consecutive backtick run in a string.
 */
function maxBacktickRun(str) {
  let maxRun = 0;
  let currentRun = 0;
  for (let i = 0; i < str.length; i += 1) {
    if (str.charCodeAt(i) === 96) {
      currentRun += 1;
      if (currentRun > maxRun) maxRun = currentRun;
    } else {
      currentRun = 0;
    }
  }
  return maxRun;
}

/**
 * Compute a Markdown backtick fence longer than any consecutive backtick run in text.
 */
export function makeFence(text) {
  const maxRun = maxBacktickRun(String(text ?? ""));
  return "`".repeat(Math.max(3, maxRun + 1));
}

/**
 * Wrap a single-line string in a CommonMark-safe inline Markdown code span.
 */
export function inlineCode(text) {
  const str = String(text ?? "").replace(/\r?\n|\r/g, " ");
  const maxRun = maxBacktickRun(str);
  const fence = "`".repeat(maxRun + 1);
  const needsPadding =
    str.length > 0 &&
    (str.startsWith("`") ||
      str.endsWith("`") ||
      (str.startsWith(" ") && str.endsWith(" ") && str.trim().length > 0));
  return needsPadding ? `${fence} ${str} ${fence}` : `${fence}${str}${fence}`;
}

/**
 * Wrap content in a safe dynamically-fenced Markdown code block.
 */
export function fencedBlock(content, lang = "text") {
  const normalized = String(content ?? "").replace(/\r\n|\r/g, "\n");
  const body = normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;
  const fence = makeFence(body);
  const tag = lang ? String(lang) : "";
  return `${fence}${tag}\n${body}\n${fence}`;
}

/**
 * Infer a Markdown code fence language identifier from a file path.
 */
export function inferFenceLang(filePath) {
  if (!filePath || typeof filePath !== "string") return "text";
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_LANG_MAP[ext] || "text";
}

/**
 * Escape pipe characters and newlines for Markdown table cells.
 */
export function escapeMdCell(value) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n|\r/g, " ");
}
