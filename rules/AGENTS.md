# Context Mode Behavioral Standards

When `antigravity-plugin-context-mode` is active, agents MUST adhere to context budgeting laws while understanding active limits:

1. **Active Read Cutoff vs LLM Context Window**:
   - The active cutoff limit (default 8 KB per file/command, or as configured per session) is a **single-operation tool read/command cutoff** enforced by `PreToolUse` to prevent accidental token bloat.
   - It is **NOT your LLM context window**. Your LLM context window is vastly larger. Do NOT assume your context window is 8 KB.
   - Files or command outputs within the active cutoff limit can always be read directly.

2. **Non-Exempt Text and Code Files & Automatic Indexing**:
   - For non-exempt text files (code, logs, json, yaml, etc.) that exceed the active cutoff:
     - **Automatic Indexing**: Intercepted file reads and unpaged dumps of files up to 50 MB are **automatically indexed** into Context Mode. The denial notice provides the intuitive file-path `sourceId` (e.g. `Logs/Editor.log`) so you can immediately search it via `ctx_search(queries: [...], sourceId: "...")` without needing to call `ctx_index` manually.
     - **Line Slices**: Or read only the lines needed with `StartLine` and `EndLine` (within the active line limit).
     - **Script Filtering**: Or inspect/filter with short scripts via `ctx_execute`.

3. **Zero Raw Log Dumps**: Never run unbounded terminal commands (`cat`, `Get-Content`, `type`, unpaged `git log`, direct `curl`/`wget` to stdout). Pipe to limiters for only the specific lines needed (e.g. `| Select-Object -First <lines>` or `| head -n <lines>`) or run via `ctx_execute`.

4. **Token Verification & Active Status**:
   - The active cutoff limit and currently active exempt file types are dynamically announced in the session status message and on configuration changes.
   - To inspect live token savings, the active cutoff, and live exemption status at any time, run `ctx_stats` or `ctx_doctor`.
