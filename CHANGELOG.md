# Changelog

All notable changes to `antigravity-plugin-context-mode` will be documented in this file.

## [1.0.2] - 2026-11-14

### Fixed
- Fixed npm publish script

## [1.0.1] - 2026-11-14

### Added
- Added screenshot of sidecar dashboard to README.md

## [1.0.0] - 2026-11-14

### Added
- **Native Antigravity App Plugin Bundle**: Complete manifest and customization suite (`plugin.json`, `hooks.json`, `mcp_config.json`).
- **Stdio MCP Server**: Zero-dependency JSON-RPC server implementing the 8 core context tools (`ctx_execute`, `ctx_batch`, `ctx_index`, `ctx_search`, `ctx_resume`, `ctx_stats`, `ctx_doctor`, `ctx_purge`).
- **SQLite FTS5 Storage Engine**: Native database layer using Node.js `DatabaseSync` (`node:sqlite`) with WAL mode, chunked source storage, and session journaling.
- **Hybrid Search & Ranking**: Combined Porter BM25 stemming and Trigram full-text search merged via Reciprocal Rank Fusion ($RRF_{k=60}$).
- **Antigravity Lifecycle Hooks**:
  - `PreToolUse`: Automated gating that blocks unbounded log dump commands (`cat`, `Get-Content` on raw `.log`) and un-paged file reads over 8 KB.
  - `SessionStart`: Injects session state continuity and active context protection advice.
- **Configurable Cutoffs via Environment Variables**:
  - `CONTEXT_MODE_MAX_READ_BYTES`: Configurable ceiling for un-paged file reads (defaults to 8 KB / 8,192 bytes).
  - `CONTEXT_MODE_MAX_LINE_RANGE`: Maximum allowed line range slice without pagination rejection (defaults to 200 lines).
- **Auxiliary Pane Sidecar Web UI**: Dedicated sidecar dashboard (`sidecars/dashboard/`):
  - `sidecar.json` configured for `SIDECAR_UI_ENTRYPOINT_AUX_PANE`.
  - `server.mjs` backend powered by `sidecar_sdk` with fallback standalone HTTP server.
  - `index.html` real-time telemetry dashboard featuring reduction rate metrics, volume compression visualization, an interactive FTS5 search inspector, recent sources, and session purge controls.
- **Agent Skill & Behavioral Rules**: Bundled `skills/context-mode/SKILL.md` (Thinking in Code) and `rules/AGENTS.md` (context budgeting laws).
- **Test Suite**: Native `node:test` test harness covering storage, execution sandbox, tools, hooks, and MCP JSON-RPC protocol with 100% pass rate.
- **CI/CD Automation**: Automated `publish.yml` GitHub Actions workflow for npm and GitHub Releases.
