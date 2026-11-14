# Changelog

All notable changes to `antigravity-plugin-context-mode` will be documented in this file.

## [1.0.0] - 2026-11-14

### Added
- Native Antigravity App plugin bundle (`plugin.json`, `hooks.json`, `mcp_config.json`).
- Stdio MCP server implementing 8 context tools (`ctx_execute`, `ctx_batch`, `ctx_index`, `ctx_search`, `ctx_resume`, `ctx_stats`, `ctx_doctor`, `ctx_purge`).
- Zero-dependency SQLite FTS5 database store using Node `DatabaseSync` (`node:sqlite`).
- Porter stemming (BM25) and Trigram full-text search merged via Reciprocal Rank Fusion (RRF).
- `PreToolUse` lifecycle hook gating unbounded `run_command` and `read_file` calls > 32 KB.
- `SessionStart` lifecycle hook injecting session start notification and advice.
- Antigravity agent skill (`skills/context-mode/SKILL.md`) and behavioral rule (`rules/AGENTS.md`).
- Automated `publish.yml` GitHub Actions workflow for npm and GitHub Releases.
- Complete unit test suite passing with 0 external dependencies.
