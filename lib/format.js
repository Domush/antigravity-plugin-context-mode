import {
  formatBytes,
  makeFence,
  inlineCode,
  fencedBlock,
  inferFenceLang,
  escapeMdCell
} from "./markdown.js";

export { makeFence, inlineCode, fencedBlock };

const KNOWN_TOOLS = new Set([
  "ctx_execute",
  "ctx_batch",
  "ctx_search",
  "ctx_resume",
  "ctx_stats",
  "ctx_doctor",
  "ctx_purge"
]);

function isTruncationNotice(candidate) {
  return (
    !candidate.includes("\n") &&
    !candidate.includes("\r") &&
    candidate.startsWith("... [") &&
    candidate.endsWith("]") &&
    candidate.includes("truncated") &&
    candidate.includes("ctx_search(")
  );
}

/**
 * Separate a trailing truncation notice emitted by ctx_execute/ctx_batch from body text.
 */
function splitTruncationNotice(text) {
  if (typeof text !== "string" || text.length === 0) {
    return { body: "", notice: null };
  }
  const normalized = text.replace(/\r\n|\r/g, "\n");
  const marker = "\n\n... [";
  const idx = normalized.lastIndexOf(marker);
  if (idx !== -1 && normalized.endsWith("]")) {
    const candidate = normalized.slice(idx + 2).trim();
    if (isTruncationNotice(candidate)) {
      return {
        body: normalized.slice(0, idx),
        notice: candidate
      };
    }
  }
  if (!normalized.includes("\n") && isTruncationNotice(normalized)) {
    return { body: "", notice: normalized };
  }
  return { body: normalized, notice: null };
}

/**
 * Render an output body with optional trailing truncation note.
 */
function renderOutputSection(rawOutput, lang = "text") {
  const { body, notice } = splitTruncationNotice(rawOutput);
  const parts = [];
  if (body.length > 0) {
    parts.push(fencedBlock(body, lang));
  } else if (!notice) {
    parts.push("_No output._");
  }
  if (notice) {
    parts.push(`> **Note:** ${notice}`);
  }
  return parts.join("\n\n");
}

function formatExecute(result) {
  const statusStr = `${result.ok ? "OK" : "FAILED"} (exit ${result.exitCode ?? "n/a"})`;
  const lines = [
    "## ctx_execute",
    "",
    `- **Status:** ${statusStr}`,
    `- **Language:** ${result.language || "unknown"}`,
    `- **Elapsed:** ${result.elapsedMs ?? 0} ms`
  ];
  if (result.intent) {
    lines.push(`- **Intent:** ${result.intent}`);
  }
  lines.push(`- **Indexed Path:** ${result.path ? inlineCode(result.path) : "_none_"}`);
  lines.push(`- **Payload:** ${formatBytes(result.rawBytes)} raw -> ${formatBytes(result.returnedBytes)} returned`);
  lines.push("", "### Output", "", renderOutputSection(result.output || "", "text"));
  return lines.join("\n");
}

function formatBatch(result) {
  const lines = [
    "## ctx_batch",
    "",
    `- **Commands Run:** ${result.commandsRun ?? 0}`,
    `- **Indexed Path:** ${result.path ? inlineCode(result.path) : "_none_"}`,
    `- **Payload:** ${formatBytes(result.rawBytes)} raw -> ${formatBytes(result.returnedBytes)} returned`,
    "",
    "### Output",
    "",
    renderOutputSection(result.content || "", "text")
  ];
  return lines.join("\n");
}

function formatSearch(result) {
  const queryList = Array.isArray(result.queries)
    ? result.queries
    : result.queries
      ? [result.queries]
      : [];
  const queryText = queryList.length > 0
    ? queryList.map((q) => inlineCode(String(q))).join(", ")
    : "_none_";
  const scopeText = result.path ? inlineCode(result.path) : "session";
  const isReverse = Boolean(result.reverse);
  const orderText = isReverse ? "reverse (tail-first)" : "relevance";

  const lines = [
    "## ctx_search",
    "",
    `- **Queries:** ${queryText}`,
    `- **Scope / Path:** ${scopeText}`,
    `- **Order:** ${orderText} (\`reverse: ${isReverse}\`)`,
    `- **Matches:** ${result.returned ?? 0} of ${result.totalMatches ?? 0} (offset ${result.offset ?? 0})`
  ];

  const hits = Array.isArray(result.hits) ? result.hits : [];
  if (hits.length === 0) {
    lines.push("", "_No matching results found._");
    return lines.join("\n");
  }

  for (let i = 0; i < hits.length; i += 1) {
    const hit = hits[i] || {};
    const hitPath = hit.path || "unknown";
    const startLine = hit.startLine ?? 1;
    const endLine = hit.endLine ?? 1;
    const ord = hit.ord ?? 0;
    const ctx = hit.context || hit.title || hitPath;
    const score = hit.rrfScore ?? 0;
    const matches = hit.matches ?? 0;

    lines.push(
      "",
      `### ${i + 1}. ${inlineCode(hitPath)} (lines ${startLine}-${endLine}, ord ${ord})`,
      "",
      `- **Context:** ${inlineCode(ctx)} | **RRF Score:** ${score} | **Matches:** ${matches}`,
      "",
      hit.snippet ? fencedBlock(hit.snippet, inferFenceLang(hitPath)) : "_Empty snippet._"
    );
  }

  return lines.join("\n");
}

function formatResumeEvent(ev) {
  const rawBytes = Math.max(ev.sandbox_bytes ?? 0, ev.bytes ?? 0, ev.returned_bytes ?? 0);
  const lines = [
    "## ctx_resume",
    "",
    `### Event #${ev.seq ?? "n/a"}`,
    "",
    `- **Tool:** ${ev.tool || "unknown"}`,
    `- **Kind:** ${ev.kind || "unknown"}`,
    `- **Key:** ${ev.key || "—"}`,
    `- **Path:** ${ev.path ? inlineCode(ev.path) : "_none_"}`,
    `- **Agent:** ${ev.agent || "unknown"}`,
    `- **Status:** ${ev.ok ? "OK" : "FAILED"}${ev.exit_code !== null && ev.exit_code !== undefined ? ` (exit ${ev.exit_code})` : ""}`,
    `- **Bytes:** ${formatBytes(rawBytes)} raw -> ${formatBytes(ev.returned_bytes ?? 0)} returned`,
    `- **Created At:** ${ev.created_at || "unknown"}`
  ];
  if (ev.body) {
    lines.push("", "### Body", "", fencedBlock(ev.body, "text"));
  }
  return lines.join("\n");
}

function formatResume(result) {
  if (result.event) {
    return formatResumeEvent(result.event);
  }

  const lines = [
    "## ctx_resume",
    "",
    `- **Session:** ${inlineCode(result.sessionId || "default")}`
  ];

  if (result.stats) {
    const st = result.stats;
    lines.push(
      `- **Stats:** ${st.calls ?? 0} calls | ${st.savedBytes ?? "0 B"} saved (${st.savingsPercent ?? "0%"}) | ~${st.tokensSaved ?? 0} tokens saved`
    );
  }

  const sources = Array.isArray(result.recentSources) ? result.recentSources : [];
  lines.push("", "### Recent Sources", "");
  if (sources.length === 0) {
    lines.push("_No recent sources._");
  } else {
    lines.push(
      "| Source | Kind | Size | Chunks | Created |",
      "| :--- | :--- | ---: | ---: | :--- |"
    );
    for (const src of sources) {
      const target = src.path || src.label || src.id || "—";
      lines.push(
        `| ${escapeMdCell(target)} | ${escapeMdCell(src.kind)} | ${escapeMdCell(formatBytes(src.bytes_total ?? 0))} | ${escapeMdCell(src.chunk_count ?? 0)} | ${escapeMdCell(src.created_at)} |`
      );
    }
  }

  const events = Array.isArray(result.recentEvents) ? result.recentEvents : [];
  lines.push("", "### Recent Events", "");
  if (events.length === 0) {
    lines.push("_No recent events._");
  } else {
    lines.push(
      "| Seq | Tool | Kind | Path | Status | Payload | Agent |",
      "| ---: | :--- | :--- | :--- | :--- | :--- | :--- |"
    );
    for (const ev of events) {
      const rawBytes = Math.max(ev.sandbox_bytes ?? 0, ev.bytes ?? 0, ev.returned_bytes ?? 0);
      const payload = `${formatBytes(rawBytes)} -> ${formatBytes(ev.returned_bytes ?? 0)}`;
      lines.push(
        `| ${escapeMdCell(ev.seq)} | ${escapeMdCell(ev.tool)} | ${escapeMdCell(ev.kind)} | ${escapeMdCell(ev.path)} | ${ev.ok ? "OK" : "FAILED"} | ${escapeMdCell(payload)} | ${escapeMdCell(ev.agent)} |`
      );
    }
  }

  return lines.join("\n");
}

function formatStats(result) {
  const s = result.stats || {};
  const exemptCats = Array.isArray(s.exemptCategories) && s.exemptCategories.length > 0
    ? s.exemptCategories.join(", ")
    : "_none_";
  const exemptExtsCount = Array.isArray(s.exemptExtensions) ? s.exemptExtensions.length : 0;
  const customExts = Array.isArray(s.customExemptExtensions) && s.customExemptExtensions.length > 0
    ? s.customExemptExtensions.join(", ")
    : "_none_";

  const lines = [
    "## ctx_stats",
    "",
    `- **Total Operations:** ${s.calls ?? 0}`,
    `- **Raw Data Handled:** ${formatBytes(s.totalRawBytes ?? 0)} (${(s.totalRawBytes ?? 0).toLocaleString()} bytes)`,
    `- **Data Fed into LLM:** ${formatBytes(s.totalReturnedBytes ?? 0)} (${(s.totalReturnedBytes ?? 0).toLocaleString()} bytes)`,
    `- **Tokens Kept Out:** ~${(s.tokensKeptOut ?? 0).toLocaleString()} tokens (${formatBytes(s.keptOutBytes ?? 0)})`,
    `- **Reduction Rate:** ${s.savingsPercent ?? 0}% saved`,
    `- **Active Read Cutoff:** ${s.activeCutoffFormatted || formatBytes(s.activeCutoffBytes ?? 0)}`,
    `- **Auto-Index Ceiling:** ${s.maxAutoIndexFormatted || formatBytes(s.maxAutoIndexBytes ?? 0)}`,
    `- **Exempt Categories:** ${exemptCats}`,
    `- **Exempt Extensions:** ${exemptExtsCount} extensions`,
    `- **Custom Exemptions:** ${customExts}`
  ];

  if (result.report) {
    lines.push("", "### Report", "", fencedBlock(result.report, "text"));
  }

  return lines.join("\n");
}

function formatDoctor(result) {
  const d = result.doctor || {};
  const r = result.runtimes || {};
  const exemptCats = Array.isArray(d.exemptCategories) && d.exemptCategories.length > 0
    ? d.exemptCategories.join(", ")
    : "_none_";

  const lines = [
    "## ctx_doctor",
    "",
    "### Health",
    "",
    `- **Status:** ${d.status || "UNKNOWN"} (allOk: ${Boolean(d.allOk)})`
  ];

  if (d.error) {
    lines.push(`- **Error:** ${d.error}`);
  }
  if (d.dbPath !== undefined) {
    lines.push(`- **Database Path:** ${inlineCode(d.dbPath)}`);
  }
  if (d.dbSizeBytes !== undefined) {
    lines.push(`- **Database Size:** ${formatBytes(d.dbSizeBytes)} (${d.dbSizeBytes} bytes)`);
  }
  if (d.schemaVersion !== undefined) {
    lines.push(`- **Schema Version:** ${d.schemaVersion}`);
  }
  if (d.totalChunksIndexed !== undefined) {
    lines.push(`- **Total Chunks Indexed:** ${d.totalChunksIndexed}`);
  }
  if (d.sqliteVersion !== undefined) {
    lines.push(`- **SQLite / Node Version:** ${d.sqliteVersion}`);
  }
  lines.push(`- **Active Read Cutoff:** ${d.activeCutoffFormatted || formatBytes(d.activeCutoffBytes ?? 0)}`);
  lines.push(`- **Exempt Categories:** ${exemptCats}`);
  lines.push(`- **Exempt Extensions Count:** ${d.exemptExtensionsCount ?? 0}`);

  lines.push(
    "",
    "### Runtimes",
    "",
    `- **Node:** ${r.node || process.version}`,
    `- **Platform:** ${r.platform || process.platform}`,
    `- **Arch:** ${r.arch || process.arch}`
  );

  return lines.join("\n");
}

function formatPurge(result) {
  const lines = [
    "## ctx_purge",
    "",
    `- **OK:** ${Boolean(result.ok)}`,
    `- **Scope:** ${result.purged || "unknown"}`
  ];
  if (result.sessionId !== undefined) {
    lines.push(`- **Session:** ${inlineCode(result.sessionId)}`);
  }
  if (result.worktree !== undefined) {
    lines.push(`- **Worktree:** ${inlineCode(result.worktree)}`);
  }
  if (result.count !== undefined) {
    lines.push(`- **Purged Count:** ${result.count}`);
  }
  return lines.join("\n");
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Format an MCP tool result into clean Markdown text for LLM consumption.
 */
export function formatToolResultMarkdown(toolName, result) {
  if (KNOWN_TOOLS.has(toolName)) {
    if (!isPlainObject(result)) {
      throw new TypeError(`Tool "${toolName}" expected a plain object result`);
    }
  } else {
    if (typeof result === "string") {
      return result;
    }
    if (result === null || result === undefined) {
      return `## ${toolName || "Result"}\n\n_No result returned._`;
    }
    if (typeof result !== "object") {
      return `## ${toolName || "Result"}\n\n${String(result)}`;
    }
    if (Array.isArray(result)) {
      return `## ${toolName || "Result"}\n\n${fencedBlock(JSON.stringify(result, null, 2), "json")}`;
    }
  }

  switch (toolName) {
    case "ctx_execute":
      return formatExecute(result);
    case "ctx_batch":
      return formatBatch(result);
    case "ctx_search":
      return formatSearch(result);
    case "ctx_resume":
      return formatResume(result);
    case "ctx_stats":
      return formatStats(result);
    case "ctx_doctor":
      return formatDoctor(result);
    case "ctx_purge":
      return formatPurge(result);
    default:
      return `## ${toolName || "Result"}\n\n${fencedBlock(JSON.stringify(result, null, 2), "json")}`;
  }
}
