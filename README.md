# antigravity-plugin-context-mode

**Native Context Mode plugin for the Antigravity App.**  
Keeps massive tool outputs, long compile logs, web fetch dumps, and bulk files out of the model's context window by running them in a local sandbox and indexing full results in SQLite FTS5 on your machine.

[![npm version](https://img.shields.io/npm/v/antigravity-plugin-context-mode.svg)](https://www.npmjs.com/package/antigravity-plugin-context-mode)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Zero Runtime Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)]()

---

## Features

- **Zero Third-Party Runtime Dependencies**: Built using Node.js native `DatabaseSync` (`node:sqlite`) and standard child process streams.
- **Native Antigravity Lifecycle Hooks**:
  - `PreToolUse`: Transparently blocks unbounded log dumps (`Get-Content`, `cat` on raw `.log`) and un-paged file reads over 32 KB, directing the agent to sandbox execution or BM25/trigram queries.
  - `SessionStart`: Injects session state continuity and active context protection notices.
- **Full Model Context Protocol (MCP) Server**: Exposes 8 tools directly to Antigravity:
  - `ctx_execute`: Sandboxed JavaScript, Python, PowerShell, or Shell code execution (Thinking in Code).
  - `ctx_batch`: Sequential batch command execution with unified output indexing and search.
  - `ctx_index`: Indexes files, URLs, or raw text into SQLite FTS5.
  - `ctx_search`: Reciprocal Rank Fusion (RRF) search across Porter BM25 and Trigram tables.
  - `ctx_resume`: Resumes compacted session states and journal pointers.
  - `ctx_stats`: Generates ASCII bar chart telemetry and token reduction metrics.
  - `ctx_doctor`: SQLite health check and runtime verification.
  - `ctx_purge`: Cleans up session or worktree indexes.
- **Integrated Antigravity Skill & Rule**: Ships with `skills/context-mode/SKILL.md` and `rules/AGENTS.md` for seamless autonomous agent guidance.

---

## Directory Structure

```text
antigravity-plugin-context-mode/
├── plugin.json         # Antigravity App manifest
├── hooks.json          # Antigravity PreToolUse & SessionStart hooks
├── mcp_config.json     # Plugin-scoped MCP server registration
├── server.js           # MCP stdio JSON-RPC server
├── hooks/
│   ├── pre-tool-use.js # Tool gating & anti-bloat enforcement
│   └── session-start.js# Startup notice & session initialization
├── lib/
│   ├── executor.js     # Sandbox process runner (Node, Python, PowerShell, CMD)
│   ├── store.js        # SQLite FTS5 (Porter BM25 + Trigram RRF + Journal)
│   └── tools.js        # 8 context-mode tool handlers
├── skills/
│   └── context-mode/
│       └── SKILL.md    # Agent instructions for "Thinking in Code"
├── rules/
│   └── AGENTS.md       # Behavioral rules
├── assets/
│   └── icon.svg        # High-contrast plugin icon
└── tests/              # Native node:test suite
```

---

## Installation

### A. As an Antigravity Workspace Plugin
Place this repository in your workspace's `.agents/plugins/` directory:
```bash
git clone https://github.com/Domush/antigravity-plugin-context-mode.git .agents/plugins/antigravity-plugin-context-mode
```
Antigravity automatically discovers the plugin on next launch.

### B. As a Global User Plugin
Clone or symlink into your user customization directory:
```bash
git clone https://github.com/Domush/antigravity-plugin-context-mode.git ~/.gemini/config/plugins/antigravity-plugin-context-mode
```

### C. Via npm
```bash
npm install -g antigravity-plugin-context-mode
```

---

## Running Tests

Context Mode includes a full test suite with 100% native Node.js test runner:
```bash
npm test
```

---

## License

MIT © Phillip Webber
