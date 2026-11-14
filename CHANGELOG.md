# Changelog

All notable changes to `antigravity-plugin-context-mode` will be documented in this file.

## [1.1.0] - 2026-11-14

### Added
- **3-Way Telemetry Scope Toggle**: Added seamless switching between **Conversation** (active chat UUID), **Session** (current application run since app restart), and **Lifetime** (all-time cumulative database metrics).
- **Interactive Cutoff Dropdown**: Scoped cutoff selector (`2 KB`, `4 KB`, `8 KB`, `16 KB`, `32 KB`, `64 KB`, `none`) with persistent SQLite storage and fallback hierarchy.
- **Dynamic Line Slice Gating**: `PreToolUse` line limit scales dynamically with the cutoff setting (e.g. 2 KB: $\le$50 lines, 4 KB: $\le$100 lines, 8 KB: $\le$200 lines, 16 KB: $\le$400 lines, 32 KB: $\le$800 lines, 64 KB: $\le$1600 lines, none: unrestricted).
- **Dynamic Sandbox Preview Cap**: `ctx_execute` returned preview text automatically scales to double the active cutoff setting.
- **Default MS Office Exemptions**: Added `.docx`, `.doc`, `.xlsx`, `.xls`, `.pptx`, `.ppt` alongside `.pdf`, images, and audio/video files to default exemptions.
- **Clickable Recent Sources**: Click any indexed source in the dashboard to immediately open and view its raw chunks in the Search Inspector.
- **Exemptions Management Panel**: Live tag editor to add/remove custom file extensions with persistence note and default reset.
- **Tooltips on Dashboard Metrics**: Added rich context tooltips across all metric cards, lifecycle gates, and SQLite health indicators.
- **Automated LRU Database Pruning**: Capped stored sources (50 per session, 200 total) to prevent unbounded SQLite growth over long-term use.

### Fixed
- Fixed sidecar token authentication and added dual `GET` & `POST` endpoint support for `/api/cutoff`, `/api/exemptions`, and `/api/purge` to prevent 401/405 errors inside aux pane webviews.
- Fixed MCP tool server defaulting to generic session instead of binding to `process.env.ANTIGRAVITY_CONVERSATION_ID`.
- Fixed dashboard metrics crashing on string formatted numbers by adding explicit numeric coercion.

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
