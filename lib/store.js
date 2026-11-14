import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";

export const MAX_CHUNK_BYTES = 4096;
export const SNIPPET_MAX_BYTES = 800;
export const RRF_K = 60;
export const STATE_BUDGET = 2048;

/** Default path to context database (~/.context-mode/context.db) */
export function getDefaultDbPath() {
  const dir = path.join(os.homedir(), ".context-mode");
  return path.join(dir, "context.db");
}

/** Sanitize an input query string for safe FTS5 queries */
export function sanitizeFtsQuery(query) {
  if (!query || typeof query !== "string") return "";
  const cleaned = query.trim().replace(/[\x00-\x1f]/g, " ");
  const tokens = cleaned.match(/[a-zA-Z0-9_\u0080-\uffff]+/g);
  if (!tokens || tokens.length === 0) return "";
  return tokens.map((t) => `"${t.replace(/"/g, '""')}"`).join(" ");
}

/** Sanitize query specifically for trigram index (must have at least 3 characters) */
export function sanitizeTrigramQuery(query) {
  if (!query || typeof query !== "string") return "";
  const tokens = query.match(/[a-zA-Z0-9_\u0080-\uffff]{3,}/g);
  if (!tokens || tokens.length === 0) return "";
  return tokens.map((t) => `"${t.replace(/"/g, '""')}"`).join(" ");
}

export class ContextModeStore {
  constructor(optionsOrDbPath) {
    if (typeof optionsOrDbPath === "string" && optionsOrDbPath.trim()) {
      this.dbPath = optionsOrDbPath.trim();
    } else if (optionsOrDbPath && typeof optionsOrDbPath.dbPath === "string" && optionsOrDbPath.dbPath.trim()) {
      this.dbPath = optionsOrDbPath.dbPath.trim();
    } else {
      this.dbPath = getDefaultDbPath();
    }
    this.db = null;
    this.sourceCounter = 0;
  }

  /** Open or initialize SQLite database */
  open() {
    if (this.db) return this.db;
    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    this.db = new DatabaseSync(this.dbPath);
    this.initSchema();
    return this.db;
  }

  close() {
    if (this.db) {
      try {
        this.db.close();
      } catch {
        // ignore close error
      }
      this.db = null;
    }
  }

  /** Initialize tables, FTS5 virtual tables, and indexes */
  initSchema() {
    if (!this.db) return;
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA synchronous = NORMAL;");

    // Standard tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        worktree TEXT NOT NULL,
        agent TEXT NOT NULL,
        kind TEXT NOT NULL,
        label TEXT NOT NULL,
        bytes_total INTEGER NOT NULL DEFAULT 0,
        chunk_count INTEGER NOT NULL DEFAULT 0,
        created_ts INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        accessed_ts INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sources_session ON sources(session_id);
      CREATE INDEX IF NOT EXISTS idx_sources_worktree ON sources(worktree);

      CREATE TABLE IF NOT EXISTS events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        worktree TEXT NOT NULL,
        agent TEXT NOT NULL,
        kind TEXT NOT NULL,
        tool TEXT,
        key TEXT,
        path TEXT,
        ok INTEGER NOT NULL DEFAULT 1,
        exit_code INTEGER,
        bytes INTEGER NOT NULL DEFAULT 0,
        body TEXT,
        turn INTEGER NOT NULL DEFAULT 0,
        sandbox_bytes INTEGER NOT NULL DEFAULT 0,
        returned_bytes INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        accessed_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
      CREATE INDEX IF NOT EXISTS idx_events_turn ON events(session_id, turn);
    `);

    // Virtual FTS5 tables
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks USING fts5(
        source_id UNINDEXED,
        session_id UNINDEXED,
        worktree UNINDEXED,
        agent UNINDEXED,
        ord UNINDEXED,
        body,
        title,
        tokenize = 'porter unicode61 remove_diacritics 2'
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_tri USING fts5(
        source_id UNINDEXED,
        session_id UNINDEXED,
        ord UNINDEXED,
        body,
        tokenize = 'trigram'
      );
    `);

    const versionRow = this.db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get();
    if (!versionRow) {
      this.db.prepare("INSERT INTO meta(key, value) VALUES ('schema_version', '2')").run();
    }
  }

  /** Split content into chunks by byte budget on newline boundaries */
  chunkContent(text, maxBytes = MAX_CHUNK_BYTES) {
    if (!text) return [];
    const chunks = [];
    const lines = text.split("\n");
    let currentChunk = [];
    let currentBytes = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineBytes = Buffer.byteLength(line, "utf8") + 1;

      if (currentBytes + lineBytes > maxBytes && currentChunk.length > 0) {
        chunks.push(currentChunk.join("\n"));
        currentChunk = [line];
        currentBytes = lineBytes;
      } else {
        currentChunk.push(line);
        currentBytes += lineBytes;
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join("\n"));
    }

    return chunks;
  }

  /** Index a text, file output, or tool response into SQLite FTS5 */
  indexContent({ sessionId, worktree, agent, kind, label, content, sourceId }) {
    this.open();
    const sid = sessionId || "default";
    const wt = worktree || process.cwd();
    const ag = agent || "antigravity";
    const k = kind || "content";
    const lbl = label || "untitled";
    const rawText = typeof content === "string" ? content : String(content || "");
    const totalBytes = Buffer.byteLength(rawText, "utf8");

    const id = sourceId || `s_${Date.now()}_${(++this.sourceCounter).toString(36)}`;
    const now = Date.now();
    const isoDate = new Date(now).toISOString();

    const chunks = this.chunkContent(rawText);
    const chunkCount = chunks.length;

    const insertSource = this.db.prepare(`
      INSERT OR REPLACE INTO sources (
        id, session_id, worktree, agent, kind, label, bytes_total, chunk_count, created_ts, created_at, accessed_ts
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertChunk = this.db.prepare(`
      INSERT INTO chunks (source_id, session_id, worktree, agent, ord, body, title)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertChunkTri = this.db.prepare(`
      INSERT INTO chunks_tri (source_id, session_id, ord, body)
      VALUES (?, ?, ?, ?)
    `);

    insertSource.run(id, sid, wt, ag, k, lbl, totalBytes, chunkCount, now, isoDate, now);

    for (let ord = 0; ord < chunkCount; ord++) {
      const chunkText = chunks[ord];
      insertChunk.run(id, sid, wt, ag, ord, chunkText, lbl);
      insertChunkTri.run(id, sid, ord, chunkText);
    }

    return {
      sourceId: id,
      bytesTotal: totalBytes,
      chunkCount,
      label: lbl,
      chunks
    };
  }

  /** Search indexed chunks using BM25 + Trigram Reciprocal Rank Fusion */
  search({ queries, sourceId, sessionId, worktree, scope = "session", limit = 5, offset = 0 }) {
    this.open();
    const queryList = Array.isArray(queries) ? queries : [queries];
    const maxHits = Math.min(Math.max(1, limit || 5), 20);
    const skipHits = Math.max(0, offset || 0);

    const scores = new Map();

    for (const q of queryList) {
      if (!q || typeof q !== "string") continue;
      const porterQ = sanitizeFtsQuery(q);
      const trigramQ = sanitizeTrigramQuery(q);

      // 1. Porter FTS5 with BM25 ranking
      if (porterQ) {
        let sql = `
          SELECT rowid, source_id, ord, body, title, session_id, worktree, bm25(chunks) AS rank
          FROM chunks
          WHERE chunks MATCH ?
        `;
        const params = [porterQ];

        if (sourceId) {
          sql += " AND source_id = ?";
          params.push(sourceId);
        } else if (scope === "session" && sessionId) {
          sql += " AND session_id = ?";
          params.push(sessionId);
        } else if (scope === "worktree" && worktree) {
          sql += " AND worktree = ?";
          params.push(worktree);
        }

        sql += " ORDER BY rank LIMIT 30";

        try {
          const rows = this.db.prepare(sql).all(...params);
          rows.forEach((row, rankIdx) => {
            const key = `${row.source_id}:${row.ord}`;
            const rrf = 1.0 / (RRF_K + rankIdx + 1);
            const existing = scores.get(key);
            if (existing) {
              existing.rrfScore += rrf;
              existing.matches.push({ query: q, type: "porter", rank: rankIdx + 1 });
            } else {
              scores.set(key, {
                rowid: row.rowid,
                sourceId: row.source_id,
                ord: row.ord,
                body: row.body,
                title: row.title,
                sessionId: row.session_id,
                worktree: row.worktree,
                rrfScore: rrf,
                matches: [{ query: q, type: "porter", rank: rankIdx + 1 }]
              });
            }
          });
        } catch {
          // Porter match error ignored
        }
      }

      // 2. Trigram FTS5
      if (trigramQ) {
        let sqlTri = `
          SELECT rowid, source_id, ord, body, session_id
          FROM chunks_tri
          WHERE chunks_tri MATCH ?
        `;
        const paramsTri = [trigramQ];

        if (sourceId) {
          sqlTri += " AND source_id = ?";
          paramsTri.push(sourceId);
        } else if (scope === "session" && sessionId) {
          sqlTri += " AND session_id = ?";
          paramsTri.push(sessionId);
        }

        sqlTri += " LIMIT 30";

        try {
          const rowsTri = this.db.prepare(sqlTri).all(...paramsTri);
          rowsTri.forEach((row, rankIdx) => {
            const key = `${row.source_id}:${row.ord}`;
            const rrf = 1.0 / (RRF_K + rankIdx + 1);
            const existing = scores.get(key);
            if (existing) {
              existing.rrfScore += rrf;
              existing.matches.push({ query: q, type: "trigram", rank: rankIdx + 1 });
            } else {
              scores.set(key, {
                rowid: row.rowid,
                sourceId: row.source_id,
                ord: row.ord,
                body: row.body,
                title: "",
                sessionId: row.session_id,
                worktree: "",
                rrfScore: rrf,
                matches: [{ query: q, type: "trigram", rank: rankIdx + 1 }]
              });
            }
          });
        } catch {
          // Trigram match error ignored
        }
      }
    }

    const allHits = Array.from(scores.values()).sort((a, b) => b.rrfScore - a.rrfScore);
    const paginated = allHits.slice(skipHits, skipHits + maxHits);

    const formatted = paginated.map((hit) => {
      let snippet = hit.body;
      if (Buffer.byteLength(snippet, "utf8") > SNIPPET_MAX_BYTES) {
        snippet = snippet.slice(0, SNIPPET_MAX_BYTES) + "\n... [truncated, use ctx_search or ctx_index to inspect full]";
      }
      return {
        sourceId: hit.sourceId,
        ord: hit.ord,
        title: hit.title || hit.sourceId,
        rrfScore: parseFloat(hit.rrfScore.toFixed(5)),
        matches: hit.matches.length,
        snippet
      };
    });

    return {
      hits: formatted,
      totalMatches: allHits.length,
      returned: formatted.length,
      offset: skipHits,
      limit: maxHits
    };
  }

  /** Record an event in the session journal */
  recordEvent({
    sessionId,
    worktree,
    agent,
    kind,
    tool,
    key,
    path: filePath,
    ok = 1,
    exitCode,
    bytes = 0,
    body = "",
    turn = 0,
    sandboxBytes = 0,
    returnedBytes = 0
  }) {
    this.open();
    const now = new Date().toISOString();
    const insert = this.db.prepare(`
      INSERT INTO events (
        session_id, worktree, agent, kind, tool, key, path, ok, exit_code, bytes, body, turn, sandbox_bytes, returned_bytes, created_at, accessed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = insert.run(
      sessionId || "default",
      worktree || process.cwd(),
      agent || "antigravity",
      kind || "tool",
      tool || null,
      key || null,
      filePath || null,
      ok ? 1 : 0,
      exitCode ?? (ok ? 0 : 1),
      bytes,
      body || null,
      turn,
      sandboxBytes,
      returnedBytes,
      now,
      now
    );

    return { seq: result.lastInsertRowid };
  }

  /** Retrieve compaction / state resume block */
  getResumeState(sessionId, limit = 5) {
    this.open();
    const sid = sessionId || "default";

    const sources = this.db
      .prepare(
        `
      SELECT id, label, kind, bytes_total, chunk_count, created_at
      FROM sources
      WHERE session_id = ?
      ORDER BY created_ts DESC
      LIMIT ?
    `
      )
      .all(sid, limit);

    const events = this.db
      .prepare(
        `
      SELECT seq, tool, kind, ok, sandbox_bytes, returned_bytes, created_at
      FROM events
      WHERE session_id = ?
      ORDER BY seq DESC
      LIMIT ?
    `
      )
      .all(sid, limit);

    return {
      sessionId: sid,
      recentSources: sources,
      recentEvents: events
    };
  }

  /** Retrieve full event body by sequence number */
  getEventBySeq(seq) {
    this.open();
    const row = this.db.prepare("SELECT * FROM events WHERE seq = ?").get(seq);
    return row || null;
  }

  /** Calculate token savings & statistics */
  getStats(sessionId) {
    this.open();
    const sid = sessionId || "default";

    const eventStats = sid === "all"
      ? this.db.prepare(`
          SELECT
            COUNT(*) AS total_calls,
            SUM(sandbox_bytes) AS total_sandbox_bytes,
            SUM(returned_bytes) AS total_returned_bytes
          FROM events
        `).get()
      : this.db.prepare(`
          SELECT
            COUNT(*) AS total_calls,
            SUM(sandbox_bytes) AS total_sandbox_bytes,
            SUM(returned_bytes) AS total_returned_bytes
          FROM events
          WHERE session_id = ?
        `).get(sid);

    const sourceStats = sid === "all"
      ? this.db.prepare(`
          SELECT
            COUNT(*) AS total_sources,
            SUM(bytes_total) AS total_source_bytes,
            SUM(chunk_count) AS total_chunks
          FROM sources
        `).get()
      : this.db.prepare(`
          SELECT
            COUNT(*) AS total_sources,
            SUM(bytes_total) AS total_source_bytes,
            SUM(chunk_count) AS total_chunks
          FROM sources
          WHERE session_id = ?
        `).get(sid);

    const totalRawBytes = (eventStats?.total_sandbox_bytes || 0) + (sourceStats?.total_source_bytes || 0);
    const totalReturnedBytes = eventStats?.total_returned_bytes || 0;
    const keptOutBytes = Math.max(0, totalRawBytes - totalReturnedBytes);
    const savingsPercent = totalRawBytes > 0 ? Number(((keptOutBytes / totalRawBytes) * 100).toFixed(1)) : 0;
    const tokensKeptOut = Math.round(keptOutBytes / 4);

    return {
      sessionId: sid,
      calls: eventStats?.total_calls || 0,
      totalRawBytes,
      totalReturnedBytes,
      keptOutBytes,
      savingsPercent,
      tokensKeptOut,
      sourcesCount: sourceStats?.total_sources || 0,
      chunksCount: sourceStats?.total_chunks || 0
    };
  }

  /** Purge stored data */
  purge({ scope = "session", sessionId, worktree }) {
    this.open();
    if (scope === "all") {
      this.db.exec(`
        DELETE FROM chunks;
        DELETE FROM chunks_tri;
        DELETE FROM sources;
        DELETE FROM events;
        VACUUM;
      `);
      return { ok: true, purged: "all" };
    }

    if (scope === "worktree" && worktree) {
      this.db.prepare("DELETE FROM chunks WHERE worktree = ?").run(worktree);
      this.db.prepare("DELETE FROM sources WHERE worktree = ?").run(worktree);
      this.db.prepare("DELETE FROM events WHERE worktree = ?").run(worktree);
      return { ok: true, purged: "worktree", worktree };
    }

    const sid = sessionId || "default";
    this.db.prepare("DELETE FROM chunks WHERE session_id = ?").run(sid);
    this.db.prepare("DELETE FROM chunks_tri WHERE session_id = ?").run(sid);
    this.db.prepare("DELETE FROM sources WHERE session_id = ?").run(sid);
    this.db.prepare("DELETE FROM events WHERE session_id = ?").run(sid);
    return { ok: true, purged: "session", sessionId: sid };
  }

  /** Run diagnostic checks */
  doctor() {
    try {
      this.open();
      const versionRow = this.db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get();
      const ftsCheck = this.db.prepare("SELECT count(*) as cnt FROM chunks").get();
      const stat = fs.existsSync(this.dbPath) ? fs.statSync(this.dbPath) : null;

      return {
        status: "HEALTHY",
        allOk: true,
        dbPath: this.dbPath,
        dbSizeBytes: stat ? stat.size : 0,
        schemaVersion: versionRow ? versionRow.value : "unknown",
        totalChunksIndexed: ftsCheck ? ftsCheck.cnt : 0,
        sqliteVersion: process.versions.node
      };
    } catch (err) {
      return {
        status: "ERROR",
        allOk: false,
        error: String(err && err.message ? err.message : err)
      };
    }
  }
}
