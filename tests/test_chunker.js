import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  detectFormat,
  chunkContent,
  chunkMarkdown,
  chunkPython,
  chunkBraceCode,
  chunkRuby,
  chunkShell,
  chunkSQL,
  chunkJSON,
  chunkYAML,
  chunkTOML_INI,
  chunkHTML_XML,
  chunkCSS,
  chunkLogs,
  chunkDiff,
  generateContextSnippet
} from "../lib/chunker.js";
import { ContextModeStore } from "../lib/store.js";

test("Chunker - Format detection across extensions and content heuristics", () => {
  assert.equal(detectFormat("src/service.ts"), "typescript");
  assert.equal(detectFormat("app/models.py"), "python");
  assert.equal(detectFormat("docs/api.md"), "markdown");
  assert.equal(detectFormat("config/settings.json"), "json");
  assert.equal(detectFormat(".github/workflows/ci.yml"), "yaml");
  assert.equal(detectFormat("Cargo.toml"), "toml_ini");
  assert.equal(detectFormat("index.html"), "html_xml");
  assert.equal(detectFormat("styles/main.scss"), "css");
  assert.equal(detectFormat("var/log/app.log"), "log");
  assert.equal(detectFormat("migrations/001_init.sql"), "sql");
  assert.equal(detectFormat("scripts/deploy.sh"), "shell");
  assert.equal(detectFormat("scripts/setup.ps1"), "powershell");
  assert.equal(detectFormat("lib/core.rb"), "ruby");
  assert.equal(detectFormat("changes.patch"), "diff");

  // Content heuristics when no extension
  assert.equal(detectFormat("", "# Main Title\n\nSome documentation"), "markdown");
  assert.equal(detectFormat("", '{"name": "test", "version": "1.0.0"}'), "json");
  assert.equal(detectFormat("", "diff --git a/file b/file\n--- a/file\n+++ b/file"), "diff");
  assert.equal(detectFormat("", "[2026-11-21 12:00:00] [INFO] Server started"), "log");
  assert.equal(detectFormat("", "<!DOCTYPE html><html><body>Hello</body></html>"), "html_xml");
});

test("Chunker - Markdown heading hierarchy, code blocks, and section preservation", () => {
  const md = `# System Architecture

High level overview of the architecture.

## Storage Engine

Details on the storage engine and SQLite integration.

\`\`\`javascript
// Fenced code block must not be broken or mistaken for markdown headers
function initDb() {
  # Not a header
  return true;
}
\`\`\`

### SQLite Virtual Tables

Using FTS5 virtual tables with trigram tokenizers.

| Table | Tokenizer |
| :--- | :--- |
| chunks | porter |
| chunks_tri | trigram |

## Execution Sandbox

Details on execution and security boundaries.
`;

  const chunks = chunkMarkdown(md, { filePath: "docs/architecture.md" });
  assert.ok(chunks.length >= 3);

  // First chunk covers # System Architecture
  assert.ok(chunks[0].text.includes("High level overview"));
  assert.ok(chunks[0].context.includes("System Architecture"));

  // Storage Engine section contains the code block intact
  const storageChunk = chunks.find((c) => c.text.includes("Storage Engine"));
  assert.ok(storageChunk);
  assert.ok(storageChunk.text.includes("function initDb()"));
  assert.ok(storageChunk.context.includes("System Architecture > ## Storage Engine"));

  // SQLite Virtual Tables subsection
  const ftsChunk = chunks.find((c) => c.text.includes("SQLite Virtual Tables"));
  assert.ok(ftsChunk);
  assert.ok(ftsChunk.context.includes("Storage Engine > ### SQLite Virtual Tables"));
  assert.ok(ftsChunk.text.includes("| chunks | porter |"));
});

test("Chunker - Python class, method, decorator, and docstring boundaries", () => {
  const pythonCode = `
import os
import sys

"""Module docstring for flight systems."""

@decorator_one
@decorator_two(arg="value")
class FlightController:
    """Manages orbital telemetry and attitude adjustments."""

    def __init__(self, vehicle_id):
        self.vehicle_id = vehicle_id
        self.speed = 0

    @property
    def current_speed(self):
        return self.speed

    async def calculate_trajectory(self, target_coords, delta_v):
        # Calculate Hohmann transfer
        gravitational_param = 398600.4418
        r1 = 6378.137 + 400
        r2 = target_coords.get("radius", 35786)
        v1 = (gravitational_param / r1) ** 0.5
        v2 = (gravitational_param / r2) ** 0.5
        return v1 + v2 + delta_v

def standalone_helper(x, y):
    """Utility function outside classes."""
    return x * y + 42
`;

  const chunks = chunkPython(pythonCode, { filePath: "flight.py" });
  assert.ok(chunks.length >= 2);

  // Method chunk check
  const trajMethod = chunks.find((c) => c.text.includes("def calculate_trajectory"));
  assert.ok(trajMethod);
  assert.ok(trajMethod.context.includes("class FlightController > def calculate_trajectory"));
  assert.ok(trajMethod.text.includes("gravitational_param"));
  assert.equal(trajMethod.kind, "code_function");
  assert.ok(trajMethod.startLine > 10);
  assert.ok(trajMethod.endLine >= trajMethod.startLine);

  // Standalone function check
  const helperFn = chunks.find((c) => c.text.includes("def standalone_helper"));
  assert.ok(helperFn);
  assert.ok(helperFn.context.includes("def standalone_helper"));
  assert.ok(helperFn.text.includes("Utility function outside classes"));
});

test("Chunker - TypeScript & JavaScript classes, methods, arrow functions, and annotations", () => {
  const tsCode = `
import { Injectable } from "@core/di";

/**
 * Service managing user profiles and security tokens
 */
@Injectable()
export class AuthService {
  private secretKey: string;

  constructor(secretKey: string) {
    this.secretKey = secretKey;
  }

  /**
   * Validate JSON Web Token with HMAC SHA-256
   */
  public async verifyToken(token: string, options: { maxAge?: number } = {}): Promise<boolean> {
    if (!token) return false;
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const [header, payload, signature] = parts;
    return header.length > 0 && payload.length > 0 && signature.length > 0;
  }

  public revokeToken = (tokenId: string): boolean => {
    return tokenId.startsWith("tok_");
  };
}

export function generateKeyPair(bits: number = 2048) {
  return { publicKey: "pub_" + bits, privateKey: "priv_" + bits };
}
`;

  const chunks = chunkBraceCode(tsCode, { filePath: "src/auth.ts", lang: "typescript" });
  assert.ok(chunks.length >= 2);

  const verifyMethod = chunks.find((c) => c.text.includes("verifyToken"));
  assert.ok(verifyMethod);
  assert.ok(verifyMethod.context.includes("verifyToken()"));
  assert.ok(verifyMethod.text.includes("HMAC SHA-256"));
  assert.ok(verifyMethod.text.includes("Promise<boolean>"));

  const keyFn = chunks.find((c) => c.text.includes("generateKeyPair"));
  assert.ok(keyFn);
  assert.ok(keyFn.context.includes("generateKeyPair()"));
});

test("Chunker - Go, Rust, Java, and C# source chunking", () => {
  // Go
  const goCode = `
package main

type TelemetryServer struct {
    port int
}

func (s *TelemetryServer) ListenAndServe() error {
    println("Listening on port", s.port)
    return nil
}
`;
  const goChunks = chunkContent(goCode, { path: "server.go" });
  const goMethod = goChunks.find((c) => c.text.includes("ListenAndServe"));
  assert.ok(goMethod);
  assert.ok(goMethod.context.includes("ListenAndServe()"));

  // Rust
  const rsCode = `
pub struct Matrix {
    rows: usize,
    cols: usize,
}

impl Matrix {
    pub fn new(rows: usize, cols: usize) -> Self {
        Matrix { rows, cols }
    }
}
`;
  const rsChunks = chunkContent(rsCode, { path: "matrix.rs" });
  const rsMethod = rsChunks.find((c) => c.text.includes("pub fn new"));
  assert.ok(rsMethod);
  assert.ok(rsMethod.context.includes("new()"));

  // C#
  const csCode = `
namespace CloudEngine {
    public class StorageManager {
        public async Task<bool> UploadBlockAsync(string blockId, byte[] data) {
            return data.Length > 0;
        }
    }
}
`;
  const csChunks = chunkContent(csCode, { path: "Storage.cs" });
  const csMethod = csChunks.find((c) => c.text.includes("UploadBlockAsync"));
  assert.ok(csMethod);
  assert.ok(csMethod.context.includes("UploadBlockAsync()"));
});

test("Chunker - Ruby classes, modules, and method boundaries", () => {
  const rubyCode = `
module Analytics
  class Tracker
    def initialize(app_id)
      @app_id = app_id
    end

    def track_event(name, properties = {})
      payload = { event: name, props: properties, ts: Time.now.to_i }
      send_to_queue(payload)
    end
  end
end
`;
  const chunks = chunkRuby(rubyCode, { filePath: "tracker.rb" });
  assert.ok(chunks.length >= 1);
  const trackMethod = chunks.find((c) => c.text.includes("track_event"));
  assert.ok(trackMethod);
  assert.ok(trackMethod.context.includes("Analytics") || trackMethod.context.includes("Tracker"));
});

test("Chunker - Shell and PowerShell functions", () => {
  const bashScript = `
#!/bin/bash

setup_environment() {
  export NODE_ENV="production"
  mkdir -p /var/log/app
}

deploy_release() {
  git pull origin main
  npm install --production
  systemctl restart app
}

setup_environment
deploy_release
`;
  const shChunks = chunkShell(bashScript, { filePath: "deploy.sh", lang: "shell" });
  const deployFn = shChunks.find((c) => c.text.includes("deploy_release"));
  assert.ok(deployFn);
  assert.ok(deployFn.context.includes("deploy_release"));

  // PowerShell
  const psScript = `
function Test-DatabaseConnection {
    param([string]$Server, [string]$Database)
    Write-Host "Connecting to $Server / $Database"
    return $true
}
`;
  const psChunks = chunkShell(psScript, { filePath: "db.ps1", lang: "powershell" });
  assert.ok(psChunks.some((c) => c.context.includes("Test-DatabaseConnection")));
});

test("Chunker - SQL statements and DDL", () => {
  const sql = `
-- Migration 001
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE OR REPLACE PROCEDURE archive_inactive_users(threshold_days INT)
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM sessions WHERE last_seen < NOW() - INTERVAL '1 day' * threshold_days;
END;
$$;

SELECT id, email FROM users WHERE created_at > NOW() - INTERVAL '30 days';
`;
  const sqlChunks = chunkSQL(sql, { filePath: "migration.sql" });
  assert.ok(sqlChunks.length >= 2);
  assert.ok(sqlChunks.some((c) => c.context.includes("CREATE TABLE")));
  assert.ok(sqlChunks.some((c) => c.context.includes("CREATE OR REPLACE PROCEDURE") || c.context.includes("PROCEDURE")));
});

test("Chunker - Structured configs: JSON, YAML, TOML, and INI", () => {
  // JSON
  const jsonText = JSON.stringify(
    {
      name: "super-app",
      version: "2.0.0",
      scripts: {
        build: "tsc",
        test: "node --test",
        start: "node dist/index.js"
      },
      dependencies: {
        express: "^4.18.2",
        sqlite: "^5.1.1"
      }
    },
    null,
    2
  );
  const jsonChunks = chunkJSON(jsonText, { softLimit: 50, filePath: "package.json" });
  assert.ok(jsonChunks.length >= 2);
  assert.ok(jsonChunks.some((c) => c.context.includes("scripts")));
  assert.ok(jsonChunks.some((c) => c.context.includes("dependencies")));

  // YAML
  const yamlText = `
name: CI Pipeline

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test

  deploy:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - run: echo "Deploying"
`;
  const yamlChunks = chunkYAML(yamlText, { softLimit: 50, filePath: ".github/ci.yml" });
  assert.ok(yamlChunks.length >= 2);
  assert.ok(yamlChunks.some((c) => c.context.includes("jobs")));

  // TOML
  const tomlText = `
[package]
name = "vector-db"
version = "0.5.0"
edition = "2021"

[dependencies]
serde = { version = "1.0", features = ["derive"] }
tokio = { version = "1.0", features = ["full"] }

[profile.release]
opt-level = 3
`;
  const tomlChunks = chunkTOML_INI(tomlText, { filePath: "Cargo.toml" });
  assert.ok(tomlChunks.length >= 2);
  assert.ok(tomlChunks.some((c) => c.context.includes("[package]")));
  assert.ok(tomlChunks.some((c) => c.context.includes("[dependencies]")));
});

test("Chunker - HTML, XML, and Stylesheets", () => {
  // HTML
  const html = `
<!DOCTYPE html>
<html>
<body>
  <header>
    <h1>Context Mode Documentation</h1>
  </header>
  <section id="features">
    <h2>Core Capabilities</h2>
    <p>Zero token bloat with SQLite FTS5.</p>
  </section>
  <section id="api">
    <h2>Tool Interface</h2>
    <table>
      <tr><th>Tool</th><th>Action</th></tr>
      <tr><td>ctx_search</td><td>Search</td></tr>
    </table>
  </section>
</body>
</html>
`;
  const htmlChunks = chunkHTML_XML(html, { softLimit: 100, filePath: "index.html" });
  assert.ok(htmlChunks.length >= 2);
  assert.ok(htmlChunks.some((c) => c.context.includes("<section>")));

  // CSS
  const css = `
@media (min-width: 1024px) {
  .dashboard-grid {
    display: grid;
    grid-template-columns: 280px 1fr;
  }
}

.terminal-panel {
  background-color: #0d1117;
  color: #58a6ff;
  font-family: monospace;
}
`;
  const cssChunks = chunkCSS(css, { softLimit: 50, filePath: "theme.css" });
  assert.ok(cssChunks.length >= 1);
});

test("Chunker - Log files: keeps multi-line stack traces grouped with error headers", () => {
  const logContent = `
2026-11-21 12:00:01 [INFO] Worker pool initialized with 8 threads
2026-11-21 12:00:15 [WARN] Memory pressure threshold reached: 82%
2026-11-21 12:00:30 [ERROR] Failed to connect to Redis upstream
    at Socket.<anonymous> (/app/node_modules/ioredis/lib/redis.js:42:12)
    at Socket.emit (node:events:517:28)
    at emitErrorNT (node:internal/streams/destroy:151:8)
    Caused by: ConnectionRefusedException: Connection refused on port 6379
        at RedisClient.connect (/app/lib/redis.js:10:5)
        ... 15 more
2026-11-21 12:01:00 [INFO] Fallback to local memory cache activated
`;

  const chunks = chunkLogs(logContent, { softLimit: 100, filePath: "server.log" });
  assert.ok(chunks.length >= 2);

  // The error log chunk must retain its entire stack trace without splitting it
  const errChunk = chunks.find((c) => c.text.includes("Failed to connect to Redis upstream"));
  assert.ok(errChunk);
  assert.ok(errChunk.text.includes("Caused by: ConnectionRefusedException"));
  assert.ok(errChunk.text.includes("... 15 more"));
  assert.ok(errChunk.context.includes("[ERROR] Failed to connect"));
});

test("Chunker - Diff files and hunk preservation", () => {
  const patch = `
diff --git a/lib/store.js b/lib/store.js
index 4b825dc..a79f123 100644
--- a/lib/store.js
+++ b/lib/store.js
@@ -293,10 +293,25 @@ export class ContextModeStore {
-  chunkContent(text, maxBytes = MAX_CHUNK_BYTES) {
+  chunkContent(text, options = {}) {
+    return semanticChunkContent(text, options);
   }
`;
  const diffChunks = chunkDiff(patch, { filePath: "changes.diff" });
  assert.ok(diffChunks.length >= 1);
  assert.ok(diffChunks[0].context.includes("diff --git") || diffChunks[0].context.includes("@@"));
});

test("generateContextSnippet - returns entire method when within snippet budget", () => {
  const methodCode = `  async calculateOrbitalVelocity(mass, radius) {
    const G = 6.67430e-11;
    const orbitalSpeed = Math.sqrt((G * mass) / radius);
    return {
      speedKmPerSec: orbitalSpeed / 1000,
      periodSeconds: (2 * Math.PI * radius) / orbitalSpeed
    };
  }`;

  const snippet = generateContextSnippet({
    body: methodCode,
    queryList: ["orbitalSpeed"],
    context: "FlightComputer > calculateOrbitalVelocity",
    startLine: 25,
    endLine: 32,
    maxBytes: 2048
  });

  // Because the method is well within 2048 bytes, the entire method is returned intact!
  assert.equal(snippet, methodCode);
  assert.ok(snippet.includes("calculateOrbitalVelocity"));
  assert.ok(snippet.includes("periodSeconds"));
});

test("generateContextSnippet - expands to clean line boundaries with context indicators when large", () => {
  const lines = [];
  lines.push("// Flight computer routine start");
  for (let i = 1; i <= 80; i++) {
    lines.push(`  const telemetry_variable_${i} = ${i * 42};`);
  }
  lines.push("  const CRITICAL_ALTITUDE_METERS = 400000;");
  for (let i = 82; i <= 150; i++) {
    lines.push(`  const secondary_telemetry_${i} = ${i * 10};`);
  }
  lines.push("// Flight computer routine end");

  const longBody = lines.join("\n");
  const snippet = generateContextSnippet({
    body: longBody,
    queryList: ["CRITICAL_ALTITUDE_METERS"],
    context: "class FlightComputer > runTelemetry",
    startLine: 100,
    endLine: 252,
    maxBytes: 1000
  });

  // Truncation was needed, but must be line-aligned with structural context
  assert.ok(snippet.includes("CRITICAL_ALTITUDE_METERS"));
  assert.ok(snippet.includes("lines above omitted") || snippet.includes("lines below omitted"));
  assert.ok(snippet.includes("class FlightComputer > runTelemetry"));
  // Never cut mid-line
  assert.equal(snippet.includes("undefined"), false);
});

test("Store integration - ctx_search returns startLine, endLine, context, and intact methods", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctxm-int-test-"));
  const dbPath = path.join(tmpDir, "test.db");
  const store = new ContextModeStore({ dbPath });

  try {
    const jsSource = `
import fs from "fs";

export class NavigationService {
  constructor(orbit) {
    this.orbit = orbit;
  }

  computeDeltaV(burnTimeSeconds) {
    const thrustNewtons = 450000;
    const massKg = 25000;
    const acceleration = thrustNewtons / massKg;
    return acceleration * burnTimeSeconds;
  }

  performDeorbitBurn(targetLat, targetLon) {
    const deltaV = this.computeDeltaV(180);
    return { targetLat, targetLon, burnDeltaV: deltaV, status: "COMMITTED" };
  }
}
`;

    store.indexContent({
      path: "src/navigation.js",
      content: jsSource,
      sessionId: "test-sess"
    });

    const searchRes = store.search({
      queries: ["computeDeltaV"],
      path: "src/navigation.js",
      sessionId: "test-sess"
    });

    assert.ok(searchRes.hits.length >= 1);
    const hit = searchRes.hits[0];

    assert.equal(hit.path, "src/navigation.js");
    assert.ok(hit.startLine >= 1);
    assert.ok(hit.endLine >= hit.startLine);
    assert.ok(hit.context.includes("computeDeltaV") || hit.context.includes("NavigationService"));
    // Snippet contains the entire method
    assert.ok(hit.snippet.includes("thrustNewtons = 450000"));
    assert.ok(hit.snippet.includes("return acceleration * burnTimeSeconds"));
  } finally {
    store.close();
  }
});
