import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ContextModeStore, FILE_CATEGORIES } from "../../lib/store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const store = new ContextModeStore();
const HTML_FILE = path.join(__dirname, "index.html");

let appStartTime = null;
try {
  const out = execSync(
    'powershell -NoProfile -Command "(Get-Process -Name language_server, Antigravity | Measure-Object -Property StartTime -Minimum).Minimum.ToUniversalTime().ToString(\'yyyy-MM-ddTHH:mm:ss.fffZ\')"',
    { encoding: "utf8", timeout: 3000 }
  );
  const ts = new Date(out.trim()).getTime();
  if (!Number.isNaN(ts) && ts > 0) appStartTime = ts;
} catch {}
if (!appStartTime) {
  appStartTime = Date.now() - Math.round(process.uptime() * 1000);
}

function resolveTargetSession(data, defaultConvId = "default") {
  const scope = data.scope || (data.sessionId === "all" ? "lifetime" : (data.sessionId === "app" ? "app" : "conversation"));
  const convId = data.conversationId || (data.sessionId !== "all" && data.sessionId !== "app" && data.sessionId ? data.sessionId : (defaultConvId || "default"));
  let targetSid = convId;
  if (scope === "lifetime" || scope === "all") targetSid = "all";
  else if (scope === "app" || scope === "session") targetSid = "app";
  return { scope, convId, targetSid };
}

function getStatsPayload(data, defaultConvId = "default") {
  const { scope, convId, targetSid } = resolveTargetSession(data, defaultConvId);
  let stats;
  if (scope === "lifetime" || scope === "all") {
    stats = store.getStats("all");
  } else if (scope === "app" || scope === "session") {
    stats = store.getStats("app", { sinceTs: appStartTime });
  } else {
    stats = store.getStats(convId);
  }

  stats.scope = scope;
  stats.conversationId = convId;
  stats.appStartTime = appStartTime;
  stats.conversationCutoffBytes = store.getCutoff(convId);
  stats.appCutoffBytes = store.getCutoff("app");
  stats.globalCutoffBytes = store.getCutoff(null);
  stats.cutoffBytes = scope === "lifetime"
    ? stats.globalCutoffBytes
    : (scope === "app" ? stats.appCutoffBytes : stats.conversationCutoffBytes);

  stats.conversationExemptExtensions = store.getExemptExtensions(convId);
  stats.appExemptExtensions = store.getExemptExtensions("app");
  stats.globalExemptExtensions = store.getExemptExtensions(null);
  stats.exemptExtensions = scope === "lifetime"
    ? stats.globalExemptExtensions
    : (scope === "app" ? stats.appExemptExtensions : stats.conversationExemptExtensions);

  stats.fileCategories = Object.values(FILE_CATEGORIES);
  stats.conversationExemptCategories = store.getExemptCategories(convId);
  stats.appExemptCategories = store.getExemptCategories("app");
  stats.globalExemptCategories = store.getExemptCategories(null);
  stats.exemptCategories = scope === "lifetime"
    ? stats.globalExemptCategories
    : (scope === "app" ? stats.appExemptCategories : stats.conversationExemptCategories);

  stats.conversationCustomExtensions = store.getCustomExemptExtensions(convId);
  stats.appCustomExtensions = store.getCustomExemptExtensions("app");
  stats.globalCustomExtensions = store.getCustomExemptExtensions(null);
  stats.customExtensions = scope === "lifetime"
    ? stats.globalCustomExtensions
    : (scope === "app" ? stats.appCustomExtensions : stats.conversationCustomExtensions);

  // Sandbox cap is always double the current cutoff setting (or default 32 KB if none)
  stats.sandboxCapBytes = stats.cutoffBytes > 0
    ? (stats.cutoffBytes * 2)
    : parseInt(process.env.CONTEXT_MODE_MAX_OUTPUT_BYTES || "32768", 10);
  stats.isPaused = store.isPaused(targetSid);

  let pluginVersion = "1.2.0";
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "../../package.json"), "utf8"));
    if (pkg.version) pluginVersion = pkg.version;
  } catch {}
  stats.version = pluginVersion;

  return stats;
}

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
    return getStatsPayload(data, app.config.conversationId);
  }, "GET");

  const handleCutoff = (data) => {
    const { scope, targetSid } = resolveTargetSession(data, app.config.conversationId);
    const cutoffBytes = data.cutoff === "none" || data.cutoff === 0 || data.cutoff === "0" ? 0 : parseInt(data.cutoff, 10);
    const saved = store.setCutoff(cutoffBytes, targetSid);
    return { ok: true, cutoffBytes: saved, scope, sessionId: targetSid };
  };
  app.api("/api/cutoff", handleCutoff, "GET");
  app.api("/api/cutoff", handleCutoff, "POST");

  const handleExemptions = (data) => {
    const { scope, targetSid } = resolveTargetSession(data, app.config.conversationId);
    const action = data.action || "get";
    if (action === "toggleCategory" && data.category) {
      store.toggleExemptCategory(data.category, data.enabled !== undefined ? (data.enabled === true || data.enabled === "true" || data.enabled === "1") : null, targetSid);
    } else if (action === "setCategories" && Array.isArray(data.categories)) {
      store.setExemptCategories(data.categories, targetSid);
    } else if (action === "add" && data.ext) {
      store.addCustomExemptExtension(data.ext, targetSid);
    } else if (action === "remove" && data.ext) {
      store.removeCustomExemptExtension(data.ext, targetSid);
    } else if (action === "reset") {
      store.setExemptCategories(null, targetSid);
      store.setCustomExemptExtensions([], targetSid);
    } else if (action === "set" && Array.isArray(data.extensions)) {
      store.setExemptExtensions(data.extensions, targetSid);
    }
    return {
      ok: true,
      exemptCategories: store.getExemptCategories(targetSid),
      customExtensions: store.getCustomExemptExtensions(targetSid),
      exemptExtensions: store.getExemptExtensions(targetSid),
      scope,
      sessionId: targetSid
    };
  };
  app.api("/api/exemptions", handleExemptions, "GET");
  app.api("/api/exemptions", handleExemptions, "POST");

  const handleToggleActive = (data) => {
    const { scope, targetSid } = resolveTargetSession(data, app.config.conversationId);
    const current = store.isPaused(targetSid);
    const newPaused = data.paused !== undefined ? (data.paused === true || data.paused === "true" || data.paused === "1") : !current;
    const saved = store.setPaused(newPaused, targetSid);
    return { ok: true, isPaused: saved, scope, sessionId: targetSid };
  };
  app.api("/api/toggle-active", handleToggleActive, "GET");
  app.api("/api/toggle-active", handleToggleActive, "POST");
  app.api("/api/paused", handleToggleActive, "GET");
  app.api("/api/paused", handleToggleActive, "POST");

  app.api("/api/doctor", () => {
    return store.doctor();
  }, "GET");

  const handleResume = (data) => {
    const { scope, convId } = resolveTargetSession(data, app.config.conversationId);
    if (scope === "lifetime" || scope === "all") {
      return store.getResumeState("all", 10);
    } else if (scope === "app" || scope === "session") {
      return store.getResumeState("app", 10, { sinceTs: appStartTime });
    } else {
      return store.getResumeState(convId, 10);
    }
  };
  app.api("/api/resume", handleResume, "GET");

  const handleSourceChunks = (data) => {
    const sourceId = data.sourceId;
    if (!sourceId) return { ok: false, chunks: [] };
    const chunks = store.getSourceChunks(sourceId);
    return { ok: true, sourceId, chunks };
  };
  app.api("/api/source-chunks", handleSourceChunks, "GET");

  const handleSearch = (data) => {
    const queries = Array.isArray(data.queries) ? data.queries : [data.query || ""];
    return store.search({ queries, limit: 5 });
  };
  app.api("/api/search", handleSearch, "GET");
  app.api("/api/search", handleSearch, "POST");

  const handlePurge = (data) => {
    const { scope, convId } = resolveTargetSession(data, app.config.conversationId);
    if (scope === "lifetime" || scope === "all") {
      return store.purge({ scope: "all" });
    } else if (scope === "app" || scope === "session") {
      return store.purge({ scope: "app", sinceTs: appStartTime });
    } else {
      return store.purge({ scope: "conversation", sessionId: convId });
    }
  };
  app.api("/api/purge", handlePurge, "GET");
  app.api("/api/purge", handlePurge, "POST");

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
      const data = Object.fromEntries(url.searchParams.entries());
      const stats = getStatsPayload(data);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(stats));
      return;
    }

    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/cutoff") {
      const handleCutoffReq = (data) => {
        const { scope, targetSid } = resolveTargetSession(data);
        const cutoffBytes = data.cutoff === "none" || data.cutoff === 0 || data.cutoff === "0" ? 0 : parseInt(data.cutoff, 10);
        const saved = store.setCutoff(cutoffBytes, targetSid);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, cutoffBytes: saved, scope, sessionId: targetSid }));
      };
      if (req.method === "GET") {
        const data = Object.fromEntries(url.searchParams.entries());
        handleCutoffReq(data);
      } else {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          try {
            handleCutoffReq(JSON.parse(body || "{}"));
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      }
      return;
    }

    if ((req.method === "GET" || req.method === "POST") && (url.pathname === "/api/toggle-active" || url.pathname === "/api/paused")) {
      const handleToggleReq = (data) => {
        const { scope, targetSid } = resolveTargetSession(data);
        const current = store.isPaused(targetSid);
        const newPaused = data.paused !== undefined ? (data.paused === true || data.paused === "true" || data.paused === "1") : !current;
        const saved = store.setPaused(newPaused, targetSid);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, isPaused: saved, scope, sessionId: targetSid }));
      };
      if (req.method === "GET") {
        const data = Object.fromEntries(url.searchParams.entries());
        handleToggleReq(data);
      } else {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          try {
            handleToggleReq(JSON.parse(body || "{}"));
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      }
      return;
    }

    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/exemptions") {
      const handleExemptReq = (data) => {
        const { scope, targetSid } = resolveTargetSession(data);
        const action = data.action || "get";
        if (action === "toggleCategory" && data.category) {
          store.toggleExemptCategory(data.category, data.enabled !== undefined ? (data.enabled === true || data.enabled === "true" || data.enabled === "1") : null, targetSid);
        } else if (action === "setCategories" && Array.isArray(data.categories)) {
          store.setExemptCategories(data.categories, targetSid);
        } else if (action === "add" && data.ext) {
          store.addCustomExemptExtension(data.ext, targetSid);
        } else if (action === "remove" && data.ext) {
          store.removeCustomExemptExtension(data.ext, targetSid);
        } else if (action === "reset") {
          store.setExemptCategories(null, targetSid);
          store.setCustomExemptExtensions([], targetSid);
        } else if (action === "set" && Array.isArray(data.extensions)) {
          store.setExemptExtensions(data.extensions, targetSid);
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          ok: true,
          exemptCategories: store.getExemptCategories(targetSid),
          customExtensions: store.getCustomExemptExtensions(targetSid),
          exemptExtensions: store.getExemptExtensions(targetSid),
          scope,
          sessionId: targetSid
        }));
      };
      if (req.method === "GET") {
        const data = Object.fromEntries(url.searchParams.entries());
        handleExemptReq(data);
      } else {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          try {
            handleExemptReq(JSON.parse(body || "{}"));
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      }
      return;
    }
    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/purge") {
      const handlePurgeReq = (data) => {
        const { scope, convId } = resolveTargetSession(data);
        let result;
        if (scope === "lifetime" || scope === "all") {
          result = store.purge({ scope: "all" });
        } else if (scope === "app" || scope === "session") {
          result = store.purge({ scope: "app", sinceTs: appStartTime });
        } else {
          result = store.purge({ scope: "conversation", sessionId: convId });
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      };
      if (req.method === "GET") {
        const data = Object.fromEntries(url.searchParams.entries());
        handlePurgeReq(data);
      } else {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          try {
            handlePurgeReq(JSON.parse(body || "{}"));
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/doctor") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(store.doctor()));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/resume") {
      const data = Object.fromEntries(url.searchParams.entries());
      const { scope, convId } = resolveTargetSession(data);
      let resume;
      if (scope === "lifetime" || scope === "all") {
        resume = store.getResumeState("all", 10);
      } else if (scope === "app" || scope === "session") {
        resume = store.getResumeState("app", 10, { sinceTs: appStartTime });
      } else {
        resume = store.getResumeState(convId, 10);
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(resume));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/source-chunks") {
      const sourceId = url.searchParams.get("sourceId");
      const chunks = store.getSourceChunks(sourceId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, sourceId, chunks }));
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
