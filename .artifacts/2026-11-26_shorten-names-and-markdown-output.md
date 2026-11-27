# Plan: Shorten Plugin/MCP Naming & Markdown MCP Tool Outputs

**Date:** 2026-11-26
**Scope:** Full Pipeline (`@team-coder` -> `@team-auditor` -> `@team-test` -> `@team-auditor` -> `@team-qa` -> `@team-planner` acceptance + live plugin migration)

## Goal
1. Shorten the Antigravity plugin ID, install directory name, and MCP server identifier so tool headers render as `<tool> · context-mode_ctx` and the install folder matches `agent-team` / `suggest-next-steps` (`~/.gemini/config/plugins/context-mode`), with automatic migration/cleanup of the legacy `antigravity-plugin-context-mode` install folder.
2. Format all MCP `tools/call` text responses as clean, compact Markdown instead of pretty-printed JSON, preserving the existing 20-hit cap in `lib/store.js`.

## Implementation Phases

### Phase 1: Plugin & MCP Identifier Shortening + Install Migration
- **`plugin.json`**: Change `"name"` from `"antigravity-plugin-context-mode"` to `"context-mode"` (retaining `"displayName": "Context Mode"` and npm package `"antigravity-plugin-context-mode"` in `package.json`).
- **`mcp_config.json`**: Rename `"mcpServers"` key from `"context-mode"` to `"ctx"` (resulting in Antigravity server ID `context-mode_ctx`).
- **`server.js`**:
  - Update CLI install/uninstall target directories to `context-mode` (`~/.gemini/config/plugins/context-mode` and `.gemini/plugins/context-mode`) and update CLI help text.
  - Update `initialize` `serverInfo.name` to `"context-mode"`.
  - Add safe migration/cleanup during `install` (and `uninstall`): if the legacy `antigravity-plugin-context-mode` folder (or symlink/junction) exists in the same plugins parent directory, remove/migrate it safely without following symlink targets.

### Phase 2: Markdown Formatting for MCP Tool Responses
- **`lib/format.js`** (new focused module, keeping `server.js` well under the 500-line ceiling):
  - Implement `formatToolResultMarkdown(toolName, result)` covering all 7 MCP tools: `ctx_execute`, `ctx_batch`, `ctx_search`, `ctx_resume`, `ctx_stats`, `ctx_doctor`, `ctx_purge`, plus a safe fallback for unknown structured values.
  - Ensure safe Markdown code fencing (using fence lengths strictly exceeding any backtick run inside output/snippets) so embedded Markdown or code snippets never fracture the output block.
  - Preserve all key fields and pagination/truncation hints, while keeping `lib/store.js` hit cap at `20` and `lib/tools.js` structured return contracts intact.
- **`server.js`**: Route `tools/call` success payloads through `formatToolResultMarkdown(toolName, result)` instead of `JSON.stringify(result, null, 2)`.

### Phase 3: Documentation & Test Alignment
- **`README.md` & `CHANGELOG.md`**: Update plugin install folder references and document the streamlined tool display (`context-mode_ctx`) and Markdown-formatted MCP tool outputs per `AGENTS.md` guidelines.
- **`tests/test_mcp.js` & new/expanded tests**: Update `serverInfo.name` assertion to `"context-mode"`, verify MCP `tools/call` returns Markdown rather than raw JSON, verify `lib/format.js` edge cases (empty hits, embedded backtick fences, error/truncation notices), and verify CLI install migrates/cleans up legacy `antigravity-plugin-context-mode` directories.

## Edge Cases
- Embedded triple/quadruple backticks inside `ctx_search` snippets or `ctx_execute` outputs must use dynamically sized fences.
- Empty result sets (`ctx_search` 0 hits, empty `ctx_resume` sources/events) must render cleanly without empty tables or undefined fields.
- Windows junctions/symlinks in legacy `~/.gemini/config/plugins/antigravity-plugin-context-mode` must be unlinked/removed without deleting target repository files.
- `ctx_search` hit limit remains capped at 20 (`Math.min(Math.max(1, limit || 5), 20)`).

## Verification Strategy
- Run `node "C:/Users/domus/.gemini/config/plugins/agent-team/scripts/audit-gate.js" -f "<modified files>"`
- Adversarial code audit via `@team-auditor`
- Test authoring via `@team-test` + test audit via `@team-auditor`
- Full test suite execution via `@team-qa` (`npm test`) writing logs to `Logs/`
- Live install migration (`node server.js install`) verifying `C:/Users/domus/.gemini/config/plugins/context-mode` exists and `C:/Users/domus/.gemini/config/plugins/antigravity-plugin-context-mode` is removed.
