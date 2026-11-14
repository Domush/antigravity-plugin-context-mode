import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { ContextModeStore } from "../../lib/store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const store = new ContextModeStore();
const HTML_FILE = path.join(__dirname, "index.html");

let SidecarApp = null;
let ResponseClass = null;

try {
  const sdkModule = await import("file:///C:/Users/domus/.gemini/config/node_modules/sidecar_sdk/index.mjs");
  SidecarApp = sdkModule.SidecarApp;
  ResponseClass = sdkModule.Response;
} catch {
  try {
    const sdkModule = await import("sidecar_sdk");
    SidecarApp = sdkModule.SidecarApp;
    ResponseClass = sdkModule.Response;
  } catch {
    // Standalone fallback
  }
}

const isSidecarEnv = Boolean(
  process.env.ANTIGRAVITY_LS_ADDRESS &&
  process.env.ANTIGRAVITY_CSRF_TOKEN &&
  process.env.ANTIGRAVITY_SIDECAR_WEB_PORT &&
  SidecarApp
);

if (isSidecarEnv) {
  const app = new SidecarApp();

  app.page("/", () => {
    return fs.readFileSync(HTML_FILE, "utf8");
  });

  app.api("/api/stats", (data) => {
    const sessionId = data.sessionId || app.config.conversationId || "default";
    return store.getStats(sessionId);
  }, "GET");

  app.api("/api/doctor", () => {
    return store.doctor();
  }, "GET");

  app.api("/api/resume", (data) => {
    const sessionId = data.sessionId || app.config.conversationId || "default";
    return store.getResumeState(sessionId, 10);
  }, "GET");

  app.api("/api/search", (data) => {
    const queries = Array.isArray(data.queries) ? data.queries : [data.query || ""];
    return store.search({ queries, limit: 5 });
  }, "POST");

  app.api("/api/purge", (data) => {
    const sessionId = data.sessionId || app.config.conversationId || "default";
    return store.purge({ scope: data.scope || "session", sessionId });
  }, "POST");

  await app.run();
  console.log(`[context-mode sidecar] registered and running`);
} else {
  // Standalone HTTP server for preview/testing
  const port = process.env.PORT || 8765;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(fs.readFileSync(HTML_FILE, "utf8"));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/stats") {
      const sessionId = url.searchParams.get("sessionId") || "default";
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(store.getStats(sessionId)));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/doctor") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(store.doctor()));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/resume") {
      const sessionId = url.searchParams.get("sessionId") || "default";
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(store.getResumeState(sessionId, 10)));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/search") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          const data = JSON.parse(body || "{}");
          const queries = Array.isArray(data.queries) ? data.queries : [data.query || ""];
          const result = store.search({ queries, limit: 5 });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (e) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`[context-mode dashboard] standalone server listening at http://127.0.0.1:${port}`);
  });
}
