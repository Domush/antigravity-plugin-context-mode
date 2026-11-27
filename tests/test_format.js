import test from "node:test";
import assert from "node:assert/strict";
import {
  formatBytes,
  makeFence,
  inlineCode,
  fencedBlock,
  inferFenceLang,
  escapeMdCell
} from "../lib/markdown.js";
import { formatToolResultMarkdown } from "../lib/format.js";

const KNOWN_TOOLS = [
  "ctx_execute",
  "ctx_batch",
  "ctx_search",
  "ctx_resume",
  "ctx_stats",
  "ctx_doctor",
  "ctx_purge"
];

test("markdown helpers - formatBytes, inferFenceLang, escapeMdCell", () => {
  assert.equal(formatBytes(-1), "0 B");
  assert.equal(formatBytes(Number.NaN), "0 B");
  assert.equal(formatBytes(Number.POSITIVE_INFINITY), "0 B");
  assert.equal(formatBytes("512"), "0 B");
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1023), "1023 B");
  assert.equal(formatBytes(1024), "1.0 KB");
  assert.equal(formatBytes(1024 * 1024), "1.00 MB");

  assert.equal(inferFenceLang("src/app.ts"), "typescript");
  assert.equal(inferFenceLang("SCRIPT.PY"), "python");
  assert.equal(inferFenceLang("no_extension"), "text");
  assert.equal(inferFenceLang(null), "text");

  assert.equal(escapeMdCell(null), "—");
  assert.equal(escapeMdCell(undefined), "—");
  assert.equal(escapeMdCell(""), "—");
  assert.equal(escapeMdCell(0), "0");
  assert.equal(escapeMdCell("col1|col2\r\nrow2\rrow3\nrow4"), "col1\\|col2 row2 row3 row4");
});

test("markdown helpers - makeFence and fencedBlock dynamic fences and CR/CRLF normalization", () => {
  assert.equal(makeFence("plain text"), "```");
  assert.equal(makeFence("has ``` triple"), "````");
  assert.equal(makeFence("has ```` quad and ``` triple"), "`````");
  assert.equal(makeFence(null), "```");

  assert.equal(
    fencedBlock("line1\rline2\r\nline3\n", "javascript"),
    "```javascript\nline1\nline2\nline3\n```"
  );
  assert.equal(
    fencedBlock("before\n```\ncode\n````\nafter", "markdown"),
    "`````markdown\nbefore\n```\ncode\n````\nafter\n`````"
  );
  assert.equal(
    fencedBlock("```js\nconst x = 1;\n```", ""),
    "````\n```js\nconst x = 1;\n```\n````"
  );
});

test("markdown helpers - CommonMark inlineCode edge cases", () => {
  assert.equal(inlineCode("plain"), "`plain`");
  assert.equal(inlineCode("a`b"), "``a`b``");
  assert.equal(inlineCode("`leading"), "`` `leading ``");
  assert.equal(inlineCode("trailing`"), "`` trailing` ``");
  assert.equal(inlineCode("`both`"), "`` `both` ``");
  assert.equal(inlineCode(" foo "), "`  foo  `");
  assert.equal(inlineCode("   "), "`   `");
  assert.equal(inlineCode(""), "``");
  assert.equal(inlineCode("one\r\ntwo\rthree\nfour"), "`one two three four`");
});

test("formatToolResultMarkdown - ctx_execute and ctx_batch with truncation notice extraction", () => {
  const execNotice =
    "... [10.0 KB truncated to protect context window; full output indexed into run.log. Use ctx_search(queries: [\"err\"], path: \"run.log\") to query it]";
  const execMd = formatToolResultMarkdown("ctx_execute", {
    ok: true,
    exitCode: 0,
    language: "javascript",
    elapsedMs: 42,
    intent: "Check logs",
    path: "run.log",
    rawBytes: 12288,
    returnedBytes: 2048,
    output: `first line\r\nsecond line\r\n\r\n${execNotice}`
  });

  assert.equal(
    execMd,
    [
      "## ctx_execute",
      "",
      "- **Status:** OK (exit 0)",
      "- **Language:** javascript",
      "- **Elapsed:** 42 ms",
      "- **Intent:** Check logs",
      "- **Indexed Path:** `run.log`",
      "- **Payload:** 12.0 KB raw -> 2.0 KB returned",
      "",
      "### Output",
      "",
      "```text\nfirst line\nsecond line\n```",
      "",
      `> **Note:** ${execNotice}`
    ].join("\n")
  );

  // Normal multi-line output ending in "\n\n... [text]" stays inside the code fence
  const normalBracketsMd = formatToolResultMarkdown("ctx_execute", {
    ok: false,
    exitCode: null,
    language: "",
    elapsedMs: 7,
    intent: null,
    path: null,
    rawBytes: 30,
    returnedBytes: 30,
    output: "header line\n\n... [normal trailing bracket text]"
  });
  assert.ok(normalBracketsMd.includes("- **Status:** FAILED (exit n/a)"));
  assert.ok(normalBracketsMd.includes("- **Language:** unknown"));
  assert.ok(normalBracketsMd.includes("- **Indexed Path:** _none_"));
  assert.equal(normalBracketsMd.includes("> **Note:**"), false);
  assert.ok(
    normalBracketsMd.includes("```text\nheader line\n\n... [normal trailing bracket text]\n```")
  );

  // Notice-only output renders blockquote without empty code fence
  const noticeOnlyMd = formatToolResultMarkdown("ctx_execute", {
    ok: true,
    exitCode: 0,
    language: "shell",
    elapsedMs: 1,
    path: "only.log",
    rawBytes: 5000,
    returnedBytes: 0,
    output: execNotice
  });
  assert.equal(noticeOnlyMd.includes("```"), false);
  assert.ok(noticeOnlyMd.includes(`> **Note:** ${execNotice}`));

  // ctx_batch with real truncation notice vs empty output
  const batchNotice =
    "... [truncated. Use ctx_search(queries: [...], path: \"batch.log\") to search full batch output]";
  const batchMd = formatToolResultMarkdown("ctx_batch", {
    commandsRun: 2,
    path: "batch.log",
    rawBytes: 8192,
    returnedBytes: 512,
    content: `cmd output\n\n${batchNotice}`
  });
  assert.ok(batchMd.startsWith("## ctx_batch\n\n- **Commands Run:** 2"));
  assert.ok(batchMd.includes("```text\ncmd output\n```"));
  assert.ok(batchMd.includes(`> **Note:** ${batchNotice}`));

  const emptyBatchMd = formatToolResultMarkdown("ctx_batch", {});
  assert.ok(emptyBatchMd.includes("- **Commands Run:** 0"));
  assert.ok(emptyBatchMd.includes("- **Indexed Path:** _none_"));
  assert.ok(emptyBatchMd.endsWith("_No output._"));
});

test("formatToolResultMarkdown - ctx_search 0-hit vs populated hits", () => {
  const zeroMd = formatToolResultMarkdown("ctx_search", {
    queries: ["missing"],
    path: null,
    reverse: false,
    totalMatches: 0,
    returned: 0,
    offset: 0,
    hits: []
  });
  assert.equal(
    zeroMd,
    [
      "## ctx_search",
      "",
      "- **Queries:** `missing`",
      "- **Scope / Path:** session",
      "- **Order:** relevance (`reverse: false`)",
      "- **Matches:** 0 of 0 (offset 0)",
      "",
      "_No matching results found._"
    ].join("\n")
  );

  const hitsMd = formatToolResultMarkdown("ctx_search", {
    queries: ["alpha", "beta`tick"],
    path: "src/",
    reverse: true,
    totalMatches: 4,
    returned: 2,
    offset: 2,
    hits: [
      {
        path: "src/worker.py",
        startLine: 10,
        endLine: 15,
        ord: 3,
        context: "run_task()",
        rrfScore: 0.0325,
        matches: 2,
        snippet: "def run_task():\n    return ```raw```"
      },
      {
        path: "notes.unknown",
        startLine: 1,
        endLine: 1,
        ord: 0,
        title: "Fallback Title",
        rrfScore: 0.015,
        matches: 1,
        snippet: ""
      }
    ]
  });

  assert.ok(hitsMd.includes("- **Queries:** `alpha`, ``beta`tick``"));
  assert.ok(hitsMd.includes("- **Scope / Path:** `src/`"));
  assert.ok(hitsMd.includes("- **Order:** reverse (tail-first) (`reverse: true`)"));
  assert.ok(hitsMd.includes("- **Matches:** 2 of 4 (offset 2)"));
  assert.ok(hitsMd.includes("### 1. `src/worker.py` (lines 10-15, ord 3)"));
  assert.ok(hitsMd.includes("- **Context:** `run_task()` | **RRF Score:** 0.0325 | **Matches:** 2"));
  assert.ok(hitsMd.includes("````python\ndef run_task():\n    return ```raw```\n````"));
  assert.ok(hitsMd.includes("### 2. `notes.unknown` (lines 1-1, ord 0)"));
  assert.ok(hitsMd.includes("- **Context:** `Fallback Title` | **RRF Score:** 0.015 | **Matches:** 1"));
  assert.ok(hitsMd.endsWith("_Empty snippet._"));
});

test("formatToolResultMarkdown - ctx_resume event rawBytes calculation and session tables", () => {
  const evSandboxMax = formatToolResultMarkdown("ctx_resume", {
    event: {
      seq: 7,
      tool: "ctx_execute",
      kind: "execution",
      key: "javascript",
      path: "out.log",
      agent: "antigravity",
      ok: 1,
      exit_code: 0,
      sandbox_bytes: 4096,
      bytes: 1024,
      returned_bytes: 512,
      created_at: "2026-11-26T00:00:00Z",
      body: "event body"
    }
  });
  assert.ok(evSandboxMax.includes("### Event #7"));
  assert.ok(evSandboxMax.includes("- **Status:** OK (exit 0)"));
  assert.ok(evSandboxMax.includes("- **Bytes:** 4.0 KB raw -> 512 B returned"));
  assert.ok(evSandboxMax.includes("### Body\n\n```text\nevent body\n```"));

  const evBytesMax = formatToolResultMarkdown("ctx_resume", {
    event: {
      seq: 8,
      ok: 0,
      exit_code: null,
      sandbox_bytes: 128,
      bytes: 2048,
      returned_bytes: 256
    }
  });
  assert.ok(evBytesMax.includes("- **Status:** FAILED"));
  assert.equal(evBytesMax.includes("(exit"), false);
  assert.ok(evBytesMax.includes("- **Bytes:** 2.0 KB raw -> 256 B returned"));

  const evReturnedMax = formatToolResultMarkdown("ctx_resume", {
    event: {
      seq: 9,
      ok: 1,
      sandbox_bytes: 0,
      bytes: 64,
      returned_bytes: 1024
    }
  });
  assert.ok(evReturnedMax.includes("- **Bytes:** 1.0 KB raw -> 1.0 KB returned"));

  const summaryMd = formatToolResultMarkdown("ctx_resume", {
    sessionId: "sess-1",
    stats: {
      calls: 3,
      savedBytes: "5.0 KB",
      savingsPercent: "80%",
      tokensSaved: 1280
    },
    recentSources: [
      {
        path: "dir|name\nfile.log",
        kind: "file",
        bytes_total: 2048,
        chunk_count: 4,
        created_at: "2026-11-26"
      }
    ],
    recentEvents: [
      {
        seq: 1,
        tool: "ctx_search",
        kind: "search",
        path: "a|b",
        ok: 1,
        sandbox_bytes: 500,
        bytes: 3072,
        returned_bytes: 512,
        agent: "antigravity"
      }
    ]
  });
  assert.ok(summaryMd.includes("- **Session:** `sess-1`"));
  assert.ok(summaryMd.includes("- **Stats:** 3 calls | 5.0 KB saved (80%) | ~1280 tokens saved"));
  assert.ok(summaryMd.includes("| dir\\|name file.log | file | 2.0 KB | 4 | 2026-11-26 |"));
  assert.ok(summaryMd.includes("| 1 | ctx_search | search | a\\|b | OK | 3.0 KB -> 512 B | antigravity |"));

  const emptySummaryMd = formatToolResultMarkdown("ctx_resume", {});
  assert.ok(emptySummaryMd.includes("_No recent sources._"));
  assert.ok(emptySummaryMd.includes("_No recent events._"));
});

test("formatToolResultMarkdown - ctx_stats, ctx_doctor, ctx_purge, and unknown fallbacks", () => {
  const statsMd = formatToolResultMarkdown("ctx_stats", {
    stats: {
      calls: 5,
      totalRawBytes: 10240,
      totalReturnedBytes: 2048,
      tokensKeptOut: 2048,
      keptOutBytes: 8192,
      savingsPercent: 80,
      activeCutoffFormatted: "8.0 KB (8,192 bytes)",
      maxAutoIndexFormatted: "2.00 MB (2,097,152 bytes)",
      exemptCategories: ["images", "archives"],
      exemptExtensions: [".png", ".pdf", ".zip"],
      customExemptExtensions: [".bak"]
    },
    report: "summary report line"
  });
  assert.ok(statsMd.startsWith("## ctx_stats\n\n- **Total Operations:** 5"));
  assert.ok(statsMd.includes("- **Exempt Categories:** images, archives"));
  assert.ok(statsMd.includes("- **Exempt Extensions:** 3 extensions"));
  assert.ok(statsMd.includes("- **Custom Exemptions:** .bak"));
  assert.ok(statsMd.includes("### Report\n\n```text\nsummary report line\n```"));

  const doctorMd = formatToolResultMarkdown("ctx_doctor", {
    doctor: {
      status: "HEALTHY",
      allOk: true,
      dbPath: "/tmp/test.db",
      dbSizeBytes: 4096,
      schemaVersion: 3,
      totalChunksIndexed: 12,
      sqliteVersion: "3.46.0",
      activeCutoffBytes: 8192,
      exemptCategories: ["images"],
      exemptExtensionsCount: 25
    },
    runtimes: { node: "v22.0.0", platform: "win32", arch: "x64" }
  });
  assert.ok(doctorMd.includes("- **Status:** HEALTHY (allOk: true)"));
  assert.ok(doctorMd.includes("- **Database Path:** `/tmp/test.db`"));
  assert.ok(doctorMd.includes("- **Database Size:** 4.0 KB (4096 bytes)"));
  assert.ok(doctorMd.includes("- **Node:** v22.0.0"));

  const doctorErrMd = formatToolResultMarkdown("ctx_doctor", {
    doctor: { status: "UNHEALTHY", allOk: false, error: "sqlite missing" }
  });
  assert.ok(doctorErrMd.includes("- **Status:** UNHEALTHY (allOk: false)"));
  assert.ok(doctorErrMd.includes("- **Error:** sqlite missing"));

  const purgeMd = formatToolResultMarkdown("ctx_purge", {
    ok: true,
    purged: "session",
    sessionId: "s-1",
    worktree: "/repo",
    count: 4
  });
  assert.equal(
    purgeMd,
    [
      "## ctx_purge",
      "",
      "- **OK:** true",
      "- **Scope:** session",
      "- **Session:** `s-1`",
      "- **Worktree:** `/repo`",
      "- **Purged Count:** 4"
    ].join("\n")
  );

  // Unknown tool / primitive / null / array / plain object fallbacks
  assert.equal(formatToolResultMarkdown("custom_tool", "already markdown"), "already markdown");
  assert.equal(formatToolResultMarkdown("custom_tool", null), "## custom_tool\n\n_No result returned._");
  assert.equal(formatToolResultMarkdown("", undefined), "## Result\n\n_No result returned._");
  assert.equal(formatToolResultMarkdown("custom_tool", 123), "## custom_tool\n\n123");
  assert.equal(formatToolResultMarkdown("custom_tool", false), "## custom_tool\n\nfalse");
  assert.equal(
    formatToolResultMarkdown("custom_tool", ["a", "b"]),
    "## custom_tool\n\n```json\n[\n  \"a\",\n  \"b\"\n]\n```"
  );
  assert.equal(
    formatToolResultMarkdown("custom_tool", { ok: true }),
    "## custom_tool\n\n```json\n{\n  \"ok\": true\n}\n```"
  );
});

test("formatToolResultMarkdown - KNOWN_TOOLS plain-object negative paths and null-prototype acceptance", () => {
  const invalidValues = [
    null,
    undefined,
    42,
    "string",
    true,
    [1, 2, 3],
    new Date(),
    new Map([["a", 1]]),
    new Set([1]),
    /abc/
  ];

  for (const toolName of KNOWN_TOOLS) {
    for (const invalid of invalidValues) {
      assert.throws(
        () => formatToolResultMarkdown(toolName, invalid),
        (err) => err instanceof TypeError && err.message.includes(`Tool "${toolName}" expected a plain object result`)
      );
    }

    const emptyPlain = formatToolResultMarkdown(toolName, {});
    assert.ok(emptyPlain.startsWith(`## ${toolName}`), `Expected heading for ${toolName}`);

    const nullProto = Object.create(null);
    const nullProtoMd = formatToolResultMarkdown(toolName, nullProto);
    assert.ok(nullProtoMd.startsWith(`## ${toolName}`), `Expected heading for null-proto ${toolName}`);
  }
});
