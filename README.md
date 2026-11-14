# Antigravity Context Mode

> **Stop context bloat. Save 90%+ of your prompt tokens. Keep your agent fast, focused, and responsive.**

[![npm version](https://img.shields.io/npm/v/antigravity-plugin-context-mode.svg)](https://www.npmjs.com/package/antigravity-plugin-context-mode)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Zero Runtime Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)]()
[![Antigravity App Compatible](https://img.shields.io/badge/Antigravity%20App-Native%20Plugin-6366f1.svg)]()

**Antigravity Context Mode** is a free, local-first plugin built specifically for the **Google Antigravity App**. It prevents terminal commands, build logs, and multi-megabyte files from flooding your conversation history, saving thousands of tokens per turn and stopping "agent amnesia" in its tracks.

---
<img width="962" height="812" alt="image" src="https://github.com/user-attachments/assets/873f818d-3bd9-4746-94a9-fc182a174efb" />

## ⚡ The Problem: Context Window Bloat

When an AI coding agent runs tools, standard workflows dump everything directly into your conversation history:

* Running `Get-Content Logs/Editor.log` dumps **65 KB (~16,000 tokens)** into your prompt.
* Running test suites or compiler logs dumps **100+ KB** of repetitive output.
* Reading large source files or documentation dumps **thousands of lines** of irrelevant boilerplate.

### Why this hurts:
1. **Agent Amnesia**: Important system instructions and recent conversation steps get drowned out in a sea of raw log text ("lost in the middle").
2. **Slow Responses**: Prompt evaluation times climb rapidly as token count grows.
3. **Burned Quota & Limits**: You hit model context ceilings and rate limits after only a few turns.

---

## 🛡️ The Solution: How Context Mode Works

```text
┌────────────────────────────────────────────────────────────────────────┐
│                          ANTIGRAVITY AGENT                             │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                       Tool Call (e.g. read large log)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 PRE-TOOL-USE LIFECYCLE HOOK GATE                       │
│  • Blocks unbounded dumps (cat *.log, Get-Content)                     │
│  • Enforces 8 KB cutoff for un-paged file reads                        │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
            Under 8 KB (Safe)                Over 8 KB (Blocked)
                    │                                │
                    ▼                                ▼
         Executes normally           Redirects to Context Mode Engine:
                                     ┌───────────────────────────────────┐
                                     │ 1. Sandboxed Code Execution       │
                                     │    (Thinking in Code)             │
                                     │ 2. SQLite FTS5 Indexing           │
                                     │ 3. BM25 + Trigram RRF Search      │
                                     └───────────────────────────────────┘
                                                     │
                                                     ▼
                                          Returns only the 550 B
                                          filtered answer to prompt!
```

1. **Smart Lifecycle Gating (`hooks.json`)**: Before a command or file read executes, Context Mode checks if it will cause a token flood. If it exceeds 8 KB or attempts an unbounded log dump, the hook intercepts it and guides the agent to query or sandbox the data instead.
2. **"Thinking in Code" (`ctx_execute`)**: Instead of reading a 5,000-line log into memory, the agent executes a 5-line local script (Node, Python, PowerShell, or Bash). The script filters the log in **50 ms** and returns *only* the specific errors to the conversation.
3. **SQLite FTS5 Storage (`ctx_search`, `ctx_index`)**: Full raw outputs are saved safely on your local disk in `~/.context-mode/context.db`. The agent uses reciprocal rank fusion search to fetch only the exact snippets it needs.
4. **Live Sidecar Dashboard**: A native side pane right inside the Antigravity App that displays your real-time token savings and lets you search indexed logs with a click.

---

## 📊 Proven Results

Tested live on real Unity 6.6 build and engine logs in the Antigravity App:

| Operation | Without Context Mode | With Context Mode | Savings |
| :--- | :---: | :---: | :---: |
| **Parsing 665-line Unity Editor.log** | 65,242 B (~16,300 tokens) | **550 B (~137 tokens)** | **99.2% saved** |
| **Full File Read on 40 KB component** | 40,960 B (~10,240 tokens) | Intercepted & paged to 50 lines (**~800 tokens**) | **92.1% saved** |
| **Searching Compiler Warnings** | Entire log dumped into chat | Top 2 ranked FTS5 snippets (**~350 tokens**) | **97.8% saved** |

---

## 🚀 Quick Start & Installation

### Option 1: Global User Install (Recommended)
Installs Context Mode for all your projects and conversations:

```bash
# Clone directly into your Antigravity user plugins directory
git clone https://github.com/Domush/antigravity-plugin-context-mode.git ~/.gemini/config/plugins/antigravity-plugin-context-mode
```

Restart the Antigravity App once. The plugin, hooks, and MCP tools will be active globally!

### Option 2: Project-Scoped Workspace Install
If you only want Context Mode active in a specific project:

```bash
# From your project root directory:
mkdir -p .agents/plugins
git clone https://github.com/Domush/antigravity-plugin-context-mode.git .agents/plugins/antigravity-plugin-context-mode
```

### Option 3: Via npm
```bash
npm install -g antigravity-plugin-context-mode
```

---

## 🖥️ Live Auxiliary Sidecar Dashboard

Context Mode includes a native web dashboard that opens directly in Antigravity's **Auxiliary (Side) Pane**:

* **One-Click Open Pill:** Click `[Open Context Mode Dashboard](sidecar://antigravity-plugin-context-mode/dashboard/)` in chat anytime.
* **Real-Time Telemetry:** Displays your session's reduction percentage, raw bytes vs prompt bytes, and tokens preserved.
* **Volume Compression Bar:** Visual progress comparing raw data against tokens in context.
* **Interactive FTS5 Search Inspector:** Search your indexed logs and files directly from the UI to see what the agent has indexed.
* **1-Click Session Purge:** Wipe session indexes and reset counters whenever you start a fresh task.

---

## 🧰 Available MCP Tools

Once installed, the following 8 tools are registered in your Antigravity App:

| Tool | What It Does | Example Use Case |
| :--- | :--- | :--- |
| **`ctx_execute`** | Runs sandboxed Node.js, Python, or PowerShell scripts with token limits. | Filtering build errors, extracting JSON keys from large API responses. |
| **`ctx_search`** | Searches SQLite FTS5 using BM25 stemming and Trigram matching. | Finding error codes, method names, or stack traces in past logs. |
| **`ctx_index`** | Indexes local files, web URLs, or text into searchable chunks. | Indexing a 1,000-line documentation file or architecture spec. |
| **`ctx_batch`** | Runs multiple shell commands in batch and indexes the combined output. | Running `git status`, `git log`, and `npm test` in one compact call. |
| **`ctx_stats`** | Displays a formatted ASCII savings report and token metrics. | Checking how many tokens were saved during your session. |
| **`ctx_resume`** | Returns recent indexed sources and state pointers. | Re-orienting the agent after context compaction. |
| **`ctx_doctor`** | Checks SQLite database health, WAL mode, and active runtimes. | Verifying database integrity and platform runtimes. |
| **`ctx_purge`** | Clears stored sources and events from SQLite. | Resetting session or worktree indexes. |

---

## ⚙️ Configuration & Environment Variables

You can customize Context Mode's cutoffs at any time using environment variables:

| Variable | Default | Description |
| :--- | :---: | :--- |
| `CONTEXT_MODE_MAX_READ_BYTES` | `8192` (8 KB) | Maximum file size allowed for an un-paged `read_file` before gating kicks in. Set to `4096` for strict mode or `16384` for relaxed mode. |
| `CONTEXT_MODE_MAX_LINE_RANGE` | `200` lines | Maximum line slice allowed without pagination rejection. |

### How to set on Windows (PowerShell):
```powershell
$env:CONTEXT_MODE_MAX_READ_BYTES = "4096"   # Enforce strict 4 KB cutoff
```

### How to set on macOS / Linux:
```bash
export CONTEXT_MODE_MAX_READ_BYTES=4096
```

---

## 🔒 Privacy & Zero Dependencies

* **100% Local**: All indexed data lives on your machine in `~/.context-mode/context.db`. Zero network calls are made.
* **Zero 3rd-Party Dependencies**: Built exclusively on native Node.js (`node:sqlite` / `DatabaseSync`, `child_process`, and `http`). No native C++ builds, no `node-gyp`, and no dependency security vulnerabilities.
* **Safe Sandboxing**: Process execution in `ctx_execute` enforces strict execution timeouts and output caps to prevent runaway processes.

---

## 🧪 Running Tests

Context Mode ships with a complete test suite using Node's native test runner:

```bash
npm test
```

Verifies:
* SQLite FTS5 schema initialization, chunking, Porter BM25, and Trigram search.
* Reciprocal Rank Fusion (RRF) ranking.
* Sandbox execution and process timeout termination.
* `PreToolUse` and `SessionStart` lifecycle hook gating.
* MCP stdio JSON-RPC protocol compliance.

---

## 📄 License

MIT © [Phillip Webber](https://github.com/Domush)
