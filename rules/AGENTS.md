# Context Mode Behavioral Standards

When `antigravity-plugin-context-mode` is active, agents MUST adhere to context budgeting laws while understanding active limits and exemptions:

1. **Active Read Cutoff vs LLM Context Window**:
   - The active cutoff limit (default 8 KB per file/command, or as configured per session) is a **single-operation tool read/command cutoff** enforced by `PreToolUse` to prevent accidental token bloat.
   - It is **NOT your LLM context window**. Your LLM context window is vastly larger. Do NOT assume your context window is 8 KB.
   - Files or command outputs within the active cutoff limit can always be read directly.

2. **Exempt File Types (Never Blocked)**:
   - The following file categories and types are **completely exempt** from cutoff protection and will **NEVER be blocked** by context mode:
     - **Images & Visuals**: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`, `.bmp`, `.ico`, `.tiff`, `.tif`
     - **Documents & Office**: `.pdf`, `.docx`, `.doc`, `.xlsx`, `.xls`, `.pptx`, `.ppt`, `.csv`, `.tsv`
     - **3D Models & CAD**: `.blend`, `.fbx`, `.obj`, `.gltf`, `.glb`, `.stl`, `.dae`, `.3ds`, `.step`, `.iges`
     - **Audio & Video**: `.mp3`, `.wav`, `.ogg`, `.flac`, `.aac`, `.m4a`, `.mp4`, `.mov`, `.avi`, `.mkv`, `.webm`
     - **Archives & Binaries**: `.zip`, `.tar`, `.gz`, `.7z`, `.rar`, `.wasm`, `.exe`, `.dll`, `.so`, `.dylib`, `.bin`
     - **User Prompt Attachments**: Any file in `.user_uploaded/`, `user_uploaded/`, or attached by the user.
     - **Custom Exemptions**: Any additional file extensions configured as exempt in the active session.
   - **Do NOT hesitate to use `read_file` or multimodal inspection on exempt files.** They bypass cutoff protection and are never blocked.

3. **Non-Exempt Text and Code Files & Automatic Indexing**:
   - For non-exempt text files (code, logs, json, yaml, etc.) that exceed the active cutoff:
     - **Automatic Indexing**: Intercepted file reads and unpaged dumps of files up to 50 MB are **automatically indexed** into Context Mode. The denial notice provides the intuitive file-path `sourceId` (e.g. `Logs/Editor.log`) so you can immediately search it via `ctx_search(queries: [...], sourceId: "...")` without needing to call `ctx_index` manually.
     - **Line Slices**: Or provide a tight line range with `StartLine` and `EndLine` (<= 200 lines).
     - **Script Filtering**: Or inspect/filter with short scripts via `ctx_execute`.

4. **Zero Raw Log Dumps**: Never run unbounded terminal commands (`cat`, `Get-Content`, `type`, unpaged `git log`, direct `curl`/`wget` to stdout). Pipe to limiters (e.g. `| Select-Object -First 50` or `| head -n 50`) or run via `ctx_execute`.

5. **Token Verification & Active Status**:
   - You are informed of the active cutoff limit and active exempt types in the session status message and on configuration changes.
   - To inspect live token savings, the active cutoff, and exemption status at any time, run `ctx_stats` or `ctx_doctor`.
