import React, { useState, useMemo } from 'react';
import {
  Shield,
  Zap,
  Terminal,
  Database,
  Search,
  Cpu,
  FileCode,
  CheckCircle,
  Copy,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Filter,
  BarChart3,
  Layers,
  ArrowRight,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  Lock,
  HardDrive,
  Code2,
  Trash2,
  Check,
  Server,
  Activity,
  Maximize2,
  Minimize2,
  Info
} from 'lucide-react';

export default function App() {
  // Navigation & Copy state
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [copiedToolCode, setCopiedToolCode] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Playground / Simulator State
  const [selectedWorkload, setSelectedWorkload] = useState('editor_log');
  const [cutoffKb, setCutoffKb] = useState(8);
  const [isProtected, setIsProtected] = useState(true);
  const [customFileSize, setCustomFileSize] = useState(75);
  const [searchTerm, setSearchTerm] = useState('NullPointerException');
  const [searchActiveCategory, setSearchActiveCategory] = useState('all');

  // MCP Tools Explorer State
  const [selectedToolIndex, setSelectedToolIndex] = useState(0);

  // File Extension Tester State
  const [customExtInput, setCustomExtInput] = useState('');
  const [customExtensions, setCustomExtensions] = useState(['.parquet', '.csv', '.dump']);

  // FAQ Accordion State
  const [openFaq, setOpenFaq] = useState(0);

  // OS config tab
  const [osTab, setOsTab] = useState('windows');

  // Copy helper
  const handleCopy = (text, type = 'cmd') => {
    navigator.clipboard.writeText(text);
    if (type === 'cmd') {
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 2000);
    } else {
      setCopiedToolCode(type);
      setTimeout(() => setCopiedToolCode(null), 2000);
    }
  };

  // Workload data dictionary
  const workloads = {
    editor_log: {
      name: 'Logs/Editor.log',
      type: 'Log File',
      rawKb: 65,
      rawTokens: 16250,
      lines: 2450,
      description: 'Unity/Electron editor trace with thousands of debug logs & 1 critical crash trace.',
      rawSample: `[2026-11-15 18:20:11.102] [DEBUG] Initializing engine core...
[2026-11-15 18:20:11.145] [DEBUG] Loading render subsystem Vulkan 1.3...
[2026-11-15 18:20:12.890] [INFO] Allocated 4096MB VRAM pool
... [2,430 lines of verbose shader compilation & texture loading] ...
[2026-11-15 18:23:45.912] [FATAL] NullPointerException: RenderTargetBuffer is uninitialized at Line 412
[2026-11-15 18:23:45.915] [ERROR] Stacktrace: at VulkanPipeline.renderFrame(pipeline.cc:412)
[2026-11-15 18:23:45.919] [FATAL] Application terminated abnormally with code 0xC0000005`,
      filteredSnippet: `[SQLite FTS5 BM25 match (Score 18.4)]:
[2026-11-15 18:23:45.912] [FATAL] NullPointerException: RenderTargetBuffer is uninitialized at Line 412
[2026-11-15 18:23:45.915] [ERROR] Stacktrace: at VulkanPipeline.renderFrame(pipeline.cc:412)
[2026-11-15 18:23:45.919] [FATAL] Application terminated abnormally with code 0xC0000005`,
      filteredTokens: 85,
    },
    vitest_output: {
      name: 'vitest run --coverage',
      type: 'Test Suite',
      rawKb: 128,
      rawTokens: 32000,
      lines: 4800,
      description: 'Full test runner output across 240 test suites with 1 failed assertion.',
      rawSample: `✓ src/auth/login.test.ts (14 tests) 42ms
✓ src/db/schema.test.ts (28 tests) 110ms
... [4,780 lines of passing unit and integration checks] ...
FAIL src/billing/webhook.test.ts > handles Stripe invoice.payment_failed
AssertionError: expected 'active' to equal 'past_due'
  - Expected: "past_due"
  + Received: "active"
  at /app/src/billing/webhook.test.ts:89:22`,
      filteredSnippet: `[Thinking in Code ctx_execute extraction]:
FAIL src/billing/webhook.test.ts > handles Stripe invoice.payment_failed
AssertionError: expected 'active' to equal 'past_due'
  - Expected: "past_due"
  + Received: "active"
  at /app/src/billing/webhook.test.ts:89:22`,
      filteredTokens: 112,
    },
    git_diff: {
      name: 'git diff main..feature-auth',
      type: 'VCS Diff',
      rawKb: 92,
      rawTokens: 23000,
      lines: 3200,
      description: 'Large refactor diff containing package lockfile changes & 1 breaking signature change.',
      rawSample: `diff --git a/package-lock.json b/package-lock.json
index 4b8c9d1..9e2a1b4 100644
--- a/package-lock.json
+++ b/package-lock.json
... [3,150 lines of dependency hashes and lockfile updates] ...
diff --git a/src/api/auth.ts b/src/api/auth.ts
- export function verifySessionToken(token: string): boolean
+ export async function verifySessionToken(token: string, req: Request): Promise<AuthContext>`,
      filteredSnippet: `[SQLite FTS5 Trigram Diff Analysis]:
File: src/api/auth.ts:44
- export function verifySessionToken(token: string): boolean
+ export async function verifySessionToken(token: string, req: Request): Promise<AuthContext>`,
      filteredTokens: 96,
    },
    api_payload: {
      name: 'fetch("https://api.internal/metrics")',
      type: 'JSON Dump',
      rawKb: 180,
      rawTokens: 45000,
      lines: 7200,
      description: 'High-frequency telemetry payload with thousands of sensor nodes.',
      rawSample: `{
  "timestamp": 1731718000,
  "nodes": [
    {"id": 1, "cpu": 12.4, "temp": 42.1},
    {"id": 2, "cpu": 98.9, "temp": 91.4, "status": "THERMAL_THROTTLING_CRITICAL"},
    ... [7,190 lines of healthy node data] ...
  ]
}`,
      filteredSnippet: `[Sandboxed Node.js ctx_execute: nodes.filter(n => n.cpu > 90)]:
[
  { "id": 2, "cpu": 98.9, "temp": 91.4, "status": "THERMAL_THROTTLING_CRITICAL" }
]`,
      filteredTokens: 72,
    }
  };

  const currentWorkload = workloads[selectedWorkload] || workloads.editor_log;
  const isBlocked = isProtected && (cutoffKb > 0 && currentWorkload.rawKb > cutoffKb);

  // Token calculations
  const effectiveTokens = isBlocked ? currentWorkload.filteredTokens : currentWorkload.rawTokens;
  const tokensSaved = currentWorkload.rawTokens - effectiveTokens;
  const percentSaved = Math.round((tokensSaved / currentWorkload.rawTokens) * 100);
  const estimatedTurnCost = ((effectiveTokens / 1_000_000) * 3.0).toFixed(4); // Based on $3/M tokens
  const savedCost = ((tokensSaved / 1_000_000) * 3.0).toFixed(4);

  // MCP Tools catalog
  const mcpTools = [
    {
      id: 'ctx_execute',
      name: 'ctx_execute',
      tag: 'Sandboxing',
      summary: 'Runs sandboxed Node.js, Python, or PowerShell scripts with token & memory limits.',
      whenToUse: 'When an agent needs to inspect a large JSON payload, filter build errors, or slice logs without loading raw data.',
      params: [
        { name: 'code', type: 'string', required: true, desc: 'Script code to execute' },
        { name: 'runtime', type: "'node' | 'python' | 'powershell'", required: true, desc: 'Runtime environment' },
        { name: 'timeoutMs', type: 'number', required: false, desc: 'Max time before SIGKILL (default 30000ms)' }
      ],
      exampleSnippet: `// Example agent call to inspect a 200MB JSON response
const res = await call_mcp_tool({
  ServerName: "antigravity-plugin-context-mode_context-mode",
  ToolName: "ctx_execute",
  Arguments: {
    runtime: "node",
    code: \`
      const fs = require('fs');
      const data = JSON.parse(fs.readFileSync('output.json', 'utf8'));
      const errors = data.events.filter(e => e.level === 'error');
      console.log(JSON.stringify(errors.slice(0, 3), null, 2));
    \`
  }
});`
    },
    {
      id: 'ctx_search',
      name: 'ctx_search',
      tag: 'Search & RRF',
      summary: 'Queries SQLite FTS5 using BM25 stemming and Trigram matching with Reciprocal Rank Fusion.',
      whenToUse: 'When searching through historical test runs, large documentation files, or server error logs for exact tokens.',
      params: [
        { name: 'query', type: 'string', required: true, desc: 'Keywords or exact phrases' },
        { name: 'limit', type: 'number', required: false, desc: 'Max ranked chunks to return (default: 5)' },
        { name: 'threshold', type: 'number', required: false, desc: 'Min score cutoff' }
      ],
      exampleSnippet: `// Search for stacktrace occurrences in indexed logs
const res = await call_mcp_tool({
  ServerName: "antigravity-plugin-context-mode_context-mode",
  ToolName: "ctx_search",
  Arguments: {
    query: "NullPointerException RenderTargetBuffer",
    limit: 3
  }
});`
    },
    {
      id: 'ctx_index',
      name: 'ctx_index',
      tag: 'Ingestion',
      summary: 'Indexes local files, web URLs, or text chunks into local SQLite FTS5 database.',
      whenToUse: 'Index 1,000+ line specification docs, architecture diagrams, or previous command outputs.',
      params: [
        { name: 'pathOrUrl', type: 'string', required: true, desc: 'Local file path or web URL' },
        { name: 'chunkSize', type: 'number', required: false, desc: 'Tokens per chunk (default 500)' }
      ],
      exampleSnippet: `// Index a 2,500-line API documentation file
const res = await call_mcp_tool({
  ServerName: "antigravity-plugin-context-mode_context-mode",
  ToolName: "ctx_index",
  Arguments: {
    pathOrUrl: "./docs/complete-spec.md",
    chunkSize: 400
  }
});`
    },
    {
      id: 'ctx_batch',
      name: 'ctx_batch',
      tag: 'Batching',
      summary: 'Runs multiple shell commands in batch and indexes the combined output.',
      whenToUse: 'Run git status, git log -n 5, and npm test simultaneously, indexing results without prompt flooding.',
      params: [
        { name: 'commands', type: 'string[]', required: true, desc: 'Array of shell commands to execute' },
        { name: 'indexOutput', type: 'boolean', required: false, desc: 'Whether to push output to SQLite' }
      ],
      exampleSnippet: `// Batch triage commands
const res = await call_mcp_tool({
  ServerName: "antigravity-plugin-context-mode_context-mode",
  ToolName: "ctx_batch",
  Arguments: {
    commands: ["git status --short", "git branch -v", "npm test -- --reporter=tap"]
  }
});`
    },
    {
      id: 'ctx_stats',
      name: 'ctx_stats',
      tag: 'Metrics',
      summary: 'Displays a formatted savings report, prompt tokens spared, and database health metrics.',
      whenToUse: 'Inspect how many tokens and dollars your agent saved during the current session.',
      params: [],
      exampleSnippet: `// Fetch session token savings
const res = await call_mcp_tool({
  ServerName: "antigravity-plugin-context-mode_context-mode",
  ToolName: "ctx_stats",
  Arguments: {}
});
// Output: { totalQueries: 48, rawTokensIntercepted: 412000, deliveredTokens: 12400, savingsRatio: '96.9%' }`
    },
    {
      id: 'ctx_resume',
      name: 'ctx_resume',
      tag: 'Session',
      summary: 'Returns recent indexed sources, active search pointers, and session checkpoints.',
      whenToUse: 'Re-orienting the agent after context compaction or long multi-turn sessions.',
      params: [
        { name: 'sessionId', type: 'string', required: false, desc: 'Target session ID' }
      ],
      exampleSnippet: `const res = await call_mcp_tool({
  ServerName: "antigravity-plugin-context-mode_context-mode",
  ToolName: "ctx_resume",
  Arguments: {}
});`
    },
    {
      id: 'ctx_doctor',
      name: 'ctx_doctor',
      tag: 'Diagnostics',
      summary: 'Performs health checks on SQLite WAL mode, database integrity, and platform runtimes.',
      whenToUse: 'Verify that node:sqlite, python3, and powershell/bash are properly detected.',
      params: [],
      exampleSnippet: `const res = await call_mcp_tool({
  ServerName: "antigravity-plugin-context-mode_context-mode",
  ToolName: "ctx_doctor",
  Arguments: {}
});
// Output: { sqlite: '3.45.1 (node:sqlite)', walMode: true, node: 'v24.13.0', python: '3.12.2', status: 'HEALTHY' }`
    },
    {
      id: 'ctx_purge',
      name: 'ctx_purge',
      tag: 'Maintenance',
      summary: 'Clears stored sources, SQLite FTS5 records, and event logs for a fresh task.',
      whenToUse: 'Wipe conversation index when starting an unrelated project or clearing test artifacts.',
      params: [
        { name: 'olderThanHours', type: 'number', required: false, desc: 'Optional age filter' }
      ],
      exampleSnippet: `const res = await call_mcp_tool({
  ServerName: "antigravity-plugin-context-mode_context-mode",
  ToolName: "ctx_purge",
  Arguments: {
    olderThanHours: 0 // Purge all
  }
});`
    }
  ];

  // Search Inspector Mock Data
  const searchResults = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    const mockDb = [
      {
        id: 1,
        source: 'Logs/Editor.log',
        category: 'logs',
        line: 412,
        score: 19.8,
        matchType: 'BM25 Exact + Trigram',
        content: '[2026-11-15 18:23:45.912] [FATAL] NullPointerException: RenderTargetBuffer is uninitialized at Line 412',
        context: 'Vulkan pipeline initialization failed while binding swapchain framebuffers'
      },
      {
        id: 2,
        source: 'src/engine/vulkan_pipeline.cc',
        category: 'code',
        line: 412,
        score: 16.4,
        matchType: 'BM25 Stemmed',
        content: 'if (!this->renderTargetBuffer) { throw NullPointerException("RenderTargetBuffer is uninitialized"); }',
        context: 'Subsystem: Vulkan backend framebuffer allocator'
      },
      {
        id: 3,
        source: 'tests/pipeline_test.cc',
        category: 'tests',
        line: 98,
        score: 12.1,
        matchType: 'Trigram Substring',
        content: 'TEST(Pipeline, HandlesNullRenderTargetGracefully) { ... }',
        context: 'Unit test suite verifying exception propagation'
      },
      {
        id: 4,
        source: 'docs/troubleshooting.md',
        category: 'docs',
        line: 54,
        score: 8.5,
        matchType: 'Trigram Match',
        content: 'Common crash: If RenderTargetBuffer is uninitialized, verify that window surface has valid dimensions.',
        context: 'Developer FAQ for Linux & Windows rendering targets'
      }
    ];

    if (!q) return mockDb;
    return mockDb.filter(item => {
      const matchesSearch = item.content.toLowerCase().includes(q) ||
                            item.source.toLowerCase().includes(q) ||
                            item.context.toLowerCase().includes(q);
      const matchesCategory = searchActiveCategory === 'all' || item.category === searchActiveCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchTerm, searchActiveCategory]);

  // Custom extension handlers
  const addCustomExtension = (e) => {
    e.preventDefault();
    let ext = customExtInput.trim().toLowerCase();
    if (!ext) return;
    if (!ext.startsWith('.')) ext = '.' + ext;
    if (!customExtensions.includes(ext)) {
      setCustomExtensions([...customExtensions, ext]);
    }
    setCustomExtInput('');
  };

  const removeCustomExtension = (ext) => {
    setCustomExtensions(customExtensions.filter(e => e !== ext));
  };

  // FAQ items
  const faqs = [
    {
      q: 'Does Antigravity Context Mode send any files or prompt data over the internet?',
      a: 'No, absolutely never. Context Mode is 100% local-first. All indexing is performed locally inside your home directory (~/.context-mode/context.db) using Node.js’s native SQLite engine (DatabaseSync). Zero telemetry, zero external APIs, zero network round-trips.'
    },
    {
      q: 'How does Context Mode differ from standard context compression or compaction?',
      a: 'Standard compaction happens reactively after your context window has already filled up, which can cause severe "agent amnesia" (erasing earlier system prompt instructions and constraints). Context Mode is proactive: it uses a Pre-Tool-Use lifecycle hook to intercept massive outputs before they enter the prompt in the first place.'
    },
    {
      q: 'Are images, PDFs, and 3D models blocked by Context Mode?',
      a: 'No. Visual and document attachments (PNG, JPG, PDF, SVG, Blend, FBX, etc.) are exempted by default. Multimodal coding agents need to see actual images and blueprints to understand UI and 3D scenes. Only unbounded text files and source dumps are gated.'
    },
    {
      q: 'What is the "Thinking in Code" pattern?',
      a: 'Instead of an agent reading an entire 100,000-line database dump or log file into its prompt to count errors, the agent calls ctx_execute to run a 3-line sandboxed script (Node.js, Python, or PowerShell). The script filters the data locally and returns only the final summary (e.g. 5 tokens instead of 25,000).'
    },
    {
      q: 'Can I adjust the 8 KB cutoff threshold?',
      a: 'Yes. You can configure it dynamically via the CONTEXT_MODE_MAX_READ_BYTES environment variable (e.g., 2048 for 2 KB, 16384 for 16 KB) or set it to 0 to disable byte limits completely. Line-range slices scale automatically.'
    },
    {
      q: 'Does this require Python or C++ compiler dependencies on Windows?',
      a: 'Zero compilation needed! Context Mode uses native Node 22+ node:sqlite (DatabaseSync) and standard child_process. There is no node-gyp, no Python requirement, and no native C++ rebuild required.'
    }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      
      {/* Top Announcement Banner */}
      <div className="bg-gradient-to-r from-emerald-950/80 via-slate-900 to-cyan-950/80 border-b border-emerald-500/20 py-2 px-4 text-center text-xs sm:text-sm font-mono text-emerald-300 flex items-center justify-center gap-2">
        <Sparkles className="w-4 h-4 text-emerald-400 animate-pulse" />
        <span>Antigravity Context Mode is now officially published on npm:</span>
        <code className="bg-emerald-500/10 px-2 py-0.5 rounded text-emerald-200 border border-emerald-500/30">
          npm i antigravity-plugin-context-mode
        </code>
        <a
          href="https://www.npmjs.com/package/antigravity-plugin-context-mode"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-white transition-colors ml-1 hidden sm:inline"
        >
          View on npm →
        </a>
      </div>

      {/* Main Navigation Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-slate-950/80 border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 border border-emerald-500/30 shadow-inner">
              <Shield className="w-5 h-5 text-emerald-400" />
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight text-white text-base sm:text-lg">
                  Context Mode
                </span>
                <span className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2.5 py-0.5 rounded-full text-xs font-mono">
                  v1.2.0
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                For Google Antigravity AI Agent
              </p>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
            <a href="#how-it-works" className="hover:text-emerald-400 transition-colors">How It Works</a>
            <a href="#simulator" className="hover:text-emerald-400 transition-colors">Simulator</a>
            <a href="#mcp-tools" className="hover:text-emerald-400 transition-colors">8 MCP Tools</a>
            <a href="#search-inspector" className="hover:text-emerald-400 transition-colors">FTS5 Search</a>
            <a href="#installation" className="hover:text-emerald-400 transition-colors">Install</a>
            <a href="#faq" className="hover:text-emerald-400 transition-colors">FAQ</a>
          </nav>

          {/* Action CTAs & Links */}
          <div className="hidden sm:flex items-center gap-3">
            <a
              href="https://github.com/Domush/antigravity-plugin-context-mode"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900/80 text-xs font-medium text-slate-200 hover:border-slate-600 transition-colors"
              title="GitHub Repository"
            >
              <Code2 className="w-3.5 h-3.5 text-slate-400" />
              GitHub
            </a>

            <button
              onClick={() => handleCopy('npm install antigravity-plugin-context-mode')}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm transition-all"
            >
              {copiedCmd ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy Install
                </>
              )}
            </button>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-slate-400 hover:text-white"
            aria-label="Toggle navigation"
          >
            <ChevronDown className={`w-5 h-5 transform transition-transform ${mobileMenuOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Mobile Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-slate-800 bg-slate-900 px-4 py-4 space-y-3">
            <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)} className="block text-slate-300 hover:text-emerald-400">How It Works</a>
            <a href="#simulator" onClick={() => setMobileMenuOpen(false)} className="block text-slate-300 hover:text-emerald-400">Live Simulator</a>
            <a href="#mcp-tools" onClick={() => setMobileMenuOpen(false)} className="block text-slate-300 hover:text-emerald-400">8 MCP Tools</a>
            <a href="#search-inspector" onClick={() => setMobileMenuOpen(false)} className="block text-slate-300 hover:text-emerald-400">FTS5 Search</a>
            <a href="#installation" onClick={() => setMobileMenuOpen(false)} className="block text-slate-300 hover:text-emerald-400">Installation</a>
            <a href="#faq" onClick={() => setMobileMenuOpen(false)} className="block text-slate-300 hover:text-emerald-400">FAQ</a>
            <div className="pt-2 border-t border-slate-800 flex gap-2">
              <a
                href="https://github.com/Domush/antigravity-plugin-context-mode"
                target="_blank"
                rel="noreferrer"
                className="w-1/2 py-2 text-center rounded bg-slate-800 text-xs text-white"
              >
                GitHub
              </a>
              <a
                href="https://www.npmjs.com/package/antigravity-plugin-context-mode"
                target="_blank"
                rel="noreferrer"
                className="w-1/2 py-2 text-center rounded bg-emerald-500 text-slate-950 font-semibold text-xs"
              >
                npm Package
              </a>
            </div>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-20 sm:pt-20 sm:pb-28">
        {/* Glow ambient background elements */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-emerald-500/10 blur-[130px] rounded-full pointer-events-none -z-10" />
        <div className="absolute top-1/3 left-1/4 w-[350px] h-[250px] bg-cyan-500/10 blur-[110px] rounded-full pointer-events-none -z-10" />

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto space-y-6">
            
            {/* Tag Badge */}
            <div className="inline-flex items-center gap-2 bg-slate-900 border border-slate-800 px-3.5 py-1.5 rounded-full text-xs font-medium text-slate-300 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Local-First Plugin for Google Antigravity Agent</span>
              <span className="text-slate-600">|</span>
              <span className="text-emerald-400 font-mono">100% Free & Open Source</span>
            </div>

            {/* H1 Heading */}
            <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight">
              Stop context bloat.{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400">
                Save 90%+
              </span>{' '}
              of prompt tokens.
            </h1>

            {/* Subtitle */}
            <p className="text-lg sm:text-xl text-slate-300 leading-relaxed font-normal">
              Keep your AI coding agents blazing fast, laser-focused, and free from agent amnesia.
              Intercepts raw terminal dumps, huge test logs, and unbounded file reads before they wreck your conversation history.
            </p>

            {/* Hero CTAs */}
            <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
              <a
                href="#simulator"
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold px-6 py-3 rounded-xl flex items-center gap-2 shadow-lg hover:shadow-emerald-500/20 transition-all text-sm sm:text-base"
              >
                <Zap className="w-5 h-5 text-slate-950 fill-slate-950" />
                Try Live Simulator
              </a>

              <a
                href="#installation"
                className="bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold px-6 py-3 rounded-xl flex items-center gap-2 transition-all text-sm sm:text-base"
              >
                <Terminal className="w-5 h-5 text-emerald-400" />
                Quickstart Guide
              </a>

              <a
                href="https://github.com/Domush/antigravity-plugin-context-mode"
                target="_blank"
                rel="noreferrer"
                className="bg-transparent hover:bg-slate-900/80 border border-slate-800 text-slate-400 hover:text-white px-5 py-3 rounded-xl flex items-center gap-2 transition-all text-sm"
              >
                <ExternalLink className="w-4 h-4" />
                GitHub
              </a>
            </div>

            {/* Install pill terminal */}
            <div className="pt-2 max-w-lg mx-auto">
              <div
                onClick={() => handleCopy('npm i antigravity-plugin-context-mode')}
                className="cursor-pointer group bg-black/80 border border-slate-800 hover:border-emerald-500/50 rounded-lg p-2.5 px-4 font-mono text-xs sm:text-sm text-slate-300 flex items-center justify-between transition-colors shadow-inner"
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="text-emerald-500 font-bold">$</span>
                  <span className="text-slate-200">npm i antigravity-plugin-context-mode</span>
                </div>
                <span className="text-slate-500 group-hover:text-emerald-400 flex items-center gap-1 text-xs shrink-0">
                  {copiedCmd ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedCmd ? 'Copied' : 'Copy'}
                </span>
              </div>
            </div>

          </div>

          {/* Key Metrics Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-16 max-w-5xl mx-auto">
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 backdrop-blur-sm hover:border-emerald-500/50 transition-colors duration-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Token Savings</span>
                <Sparkles className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-3xl font-extrabold text-white">94.2%</div>
              <p className="text-xs text-slate-400 mt-1">Spares up to 25k tokens per tool call</p>
            </div>

            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 backdrop-blur-sm hover:border-emerald-500/50 transition-colors duration-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Privacy & Network</span>
                <Lock className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="text-3xl font-extrabold text-white">0 Calls</div>
              <p className="text-xs text-slate-400 mt-1">100% Local SQLite. Zero telemetry</p>
            </div>

            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 backdrop-blur-sm hover:border-emerald-500/50 transition-colors duration-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Search Latency</span>
                <Zap className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-3xl font-extrabold text-white">&lt; 5 ms</div>
              <p className="text-xs text-slate-400 mt-1">FTS5 BM25 + Trigram RRF ranking</p>
            </div>

            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 backdrop-blur-sm hover:border-emerald-500/50 transition-colors duration-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">MCP Protocol</span>
                <Server className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="text-3xl font-extrabold text-white">8 Tools</div>
              <p className="text-xs text-slate-400 mt-1">Native JSON-RPC tool integrations</p>
            </div>
          </div>

        </div>
      </section>

      {/* The Problem vs Solution Comparison Card */}
      <section className="py-12 border-t border-slate-900 bg-slate-950/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Why Unbounded Context Destroys Agents
            </h2>
            <p className="text-sm text-slate-400 mt-2">
              Every raw `Get-Content` or build log dilutes your prompt, slows token generation, and triggers agent amnesia.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
            
            {/* Without Context Mode (Red/Bloat) */}
            <div className="bg-slate-900/70 border border-red-900/40 rounded-xl p-6 backdrop-blur-sm relative flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-red-500"></span>
                    <h3 className="text-lg font-semibold text-white">Without Context Mode</h3>
                  </div>
                  <span className="bg-red-500/10 text-red-400 border border-red-500/20 px-2.5 py-0.5 rounded text-xs font-mono">
                    16,250 Tokens Burned
                  </span>
                </div>
                
                <p className="text-xs text-slate-400">
                  Standard tool runs dump all 65 KB of logs directly into conversation memory:
                </p>

                <div className="bg-black/80 border border-slate-800 rounded-lg font-mono text-xs text-slate-300 p-4 space-y-1.5 overflow-hidden max-h-56">
                  <div className="text-red-400">$ Get-Content Logs/Editor.log</div>
                  <div className="text-slate-500">[0.001s] Subsystem initialized: audio</div>
                  <div className="text-slate-500">[0.012s] Subsystem initialized: physics</div>
                  <div className="text-slate-500">[0.024s] Allocating 1,024 MB staging memory buffer</div>
                  <div className="text-slate-600 italic">... [2,430 lines of irrelevant compiler & texture traces] ...</div>
                  <div className="text-slate-500">[2.145s] Loaded asset pack: textures_high_res_part1.pak</div>
                  <div className="text-slate-500">[2.189s] Checking graphics pipeline validation layers...</div>
                  <div className="text-red-300 font-bold bg-red-950/40 p-1 rounded">
                    [2.340s] NullPointerException: RenderTargetBuffer uninitialized at line 412
                  </div>
                </div>

                <div className="space-y-2 text-xs text-slate-300">
                  <div className="flex items-center gap-2 text-red-400">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span><strong>Agent Amnesia:</strong> Earlier rules & system prompt drown out ("Lost in Middle").</span>
                  </div>
                  <div className="flex items-center gap-2 text-red-400">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span><strong>Slowdown:</strong> Multi-second delay waiting for generation over 16,000 extra tokens.</span>
                  </div>
                  <div className="flex items-center gap-2 text-red-400">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span><strong>Cost Spike:</strong> 10 turns burns $0.48+ on pure log dumps.</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono text-red-400">
                <span>Prompt Cost: ~$0.048 / turn</span>
                <span>Context Health: Degraded (88% Full)</span>
              </div>
            </div>

            {/* With Context Mode (Emerald/Shield) */}
            <div className="bg-slate-900/70 border border-emerald-500/40 rounded-xl p-6 backdrop-blur-sm relative flex flex-col justify-between shadow-lg shadow-emerald-950/20">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-emerald-400 animate-pulse"></span>
                    <h3 className="text-lg font-semibold text-white">With Antigravity Context Mode</h3>
                  </div>
                  <span className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-3 py-1 rounded-full text-xs font-mono">
                    Only 85 Tokens (99.5% Saved)
                  </span>
                </div>

                <p className="text-xs text-slate-400">
                  Lifecycle hook blocks the 65 KB dump and queries SQLite FTS5 for the needle:
                </p>

                <div className="bg-black/80 border border-slate-800 rounded-lg font-mono text-xs text-slate-300 p-4 space-y-2 overflow-hidden max-h-56">
                  <div className="text-emerald-400 flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5" />
                    <span>Hook Gate: Blocked 65 KB dump (exceeds 8 KB limit)</span>
                  </div>
                  <div className="text-cyan-400">$ ctx_search(query="NullPointerException", limit=1)</div>
                  <div className="bg-emerald-950/30 border border-emerald-500/30 p-2.5 rounded text-emerald-200">
                    <div className="text-slate-400 font-semibold mb-1">Rank 1 (BM25: 19.8) - Line 412:</div>
                    <div>[2.340s] NullPointerException: RenderTargetBuffer uninitialized at line 412</div>
                    <div className="text-slate-400 text-[11px] mt-1">at VulkanPipeline.renderFrame(pipeline.cc:412)</div>
                  </div>
                </div>

                <div className="space-y-2 text-xs text-slate-300">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    <span><strong>Razor-Sharp Memory:</strong> Agent preserves 100% of instructions and conversation context.</span>
                  </div>
                  <div className="flex items-center gap-2 text-emerald-400">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    <span><strong>Instant Generation:</strong> Fast inference time with near-zero latency overhead.</span>
                  </div>
                  <div className="flex items-center gap-2 text-emerald-400">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    <span><strong>Micro-Cents Cost:</strong> Token cost dropped by 99.5% on this operation.</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono text-emerald-400">
                <span>Prompt Cost: ~$0.0002 / turn</span>
                <span>Context Health: Optimal (&lt; 2% Full)</span>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* Interactive Live Simulator / Playground */}
      <section id="simulator" className="py-16 sm:py-24 border-t border-slate-900 bg-slate-950">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
            <div>
              <div className="inline-flex items-center gap-2 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-3 py-1 rounded-full text-xs font-mono mb-2">
                <Activity className="w-3.5 h-3.5" />
                Interactive Live Playground
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                Context Savings Simulator
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                Select a workload or toggle protection settings to see how Context Mode intercepts and compresses prompt loads.
              </p>
            </div>

            {/* Quick Status Pill */}
            <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl text-xs font-mono">
              <span className="text-slate-400">Engine State:</span>
              <button
                onClick={() => setIsProtected(!isProtected)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-semibold transition-colors ${
                  isProtected ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-red-500/20 text-red-400 border border-red-500/40'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${isProtected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}></span>
                {isProtected ? 'ACTIVE (Protected)' : 'BYPASS (Unprotected)'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Controls Column (4 cols) */}
            <div className="lg:col-span-4 space-y-4">
              
              {/* Workload Picker */}
              <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-5 backdrop-blur-sm space-y-3">
                <label className="text-xs font-mono text-slate-400 uppercase tracking-wider block">
                  1. Select Workload
                </label>
                <div className="space-y-2">
                  {Object.entries(workloads).map(([key, item]) => (
                    <button
                      key={key}
                      onClick={() => setSelectedWorkload(key)}
                      className={`w-full text-left p-3 rounded-lg border text-xs transition-all flex items-center justify-between ${
                        selectedWorkload === key
                          ? 'bg-emerald-500/10 border-emerald-500 text-white shadow-sm'
                          : 'bg-black/40 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <div className="truncate pr-2">
                        <div className="font-mono font-medium text-slate-200 truncate">{item.name}</div>
                        <div className="text-[11px] text-slate-500">{item.type} • {item.lines} lines</div>
                      </div>
                      <span className="shrink-0 font-mono text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                        {item.rawKb} KB
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Cutoff Threshold Dropdown */}
              <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-5 backdrop-blur-sm space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-mono text-slate-400 uppercase tracking-wider block">
                    2. Cutoff Threshold
                  </label>
                  <span className="text-xs font-mono text-cyan-400">
                    {cutoffKb === 0 ? 'Disabled' : `${cutoffKb} KB (≤ ${cutoffKb * 25} lines)`}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[2, 4, 8, 16, 32, 64].map((kb) => (
                    <button
                      key={kb}
                      onClick={() => setCutoffKb(kb)}
                      className={`py-2 px-3 rounded-lg text-xs font-mono text-center border transition-all ${
                        cutoffKb === kb
                          ? 'bg-emerald-500 text-slate-950 font-bold border-emerald-400'
                          : 'bg-black/50 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white'
                      }`}
                    >
                      {kb} KB
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setCutoffKb(0)}
                  className={`w-full py-1.5 rounded-lg text-xs font-mono text-center border transition-all ${
                    cutoffKb === 0
                      ? 'bg-red-500/20 text-red-300 border-red-500/40'
                      : 'bg-black/30 border-slate-800/80 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  None (Bypass Cutoff)
                </button>
              </div>

              {/* Realtime Economics Card */}
              <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-5 backdrop-blur-sm space-y-3">
                <div className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                  3. Turn Economics
                </div>
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="bg-black/50 border border-slate-800 p-2.5 rounded-lg">
                    <div className="text-[11px] text-slate-500">Tokens Delivered</div>
                    <div className="text-lg font-bold text-white font-mono mt-0.5">
                      {effectiveTokens.toLocaleString()}
                    </div>
                  </div>
                  <div className="bg-black/50 border border-slate-800 p-2.5 rounded-lg">
                    <div className="text-[11px] text-slate-500">Savings Ratio</div>
                    <div className="text-lg font-bold text-emerald-400 font-mono mt-0.5">
                      {isBlocked ? `${percentSaved}%` : '0%'}
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-slate-400 pt-1 flex items-center justify-between">
                  <span>Tokens spared this turn:</span>
                  <span className="font-mono text-emerald-400 font-semibold">
                    +{tokensSaved.toLocaleString()}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 flex items-center justify-between">
                  <span>Approx API cost spared:</span>
                  <span className="font-mono text-emerald-400 font-semibold">
                    +${savedCost}
                  </span>
                </div>
              </div>

            </div>

            {/* Right Simulation Execution Console (8 cols) */}
            <div className="lg:col-span-8 flex flex-col justify-between bg-slate-900/70 border border-slate-800 rounded-xl p-6 backdrop-blur-sm">
              
              <div className="space-y-4">
                
                {/* Simulated Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2 font-mono text-xs text-slate-300">
                    <Terminal className="w-4 h-4 text-emerald-400" />
                    <span>Agent Tool Call:</span>
                    <span className="text-white font-bold bg-slate-800 px-2 py-0.5 rounded">
                      read_file("{currentWorkload.name}")
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-400">
                      Filesize: {currentWorkload.rawKb} KB
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-mono font-medium ${
                      isBlocked
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                        : 'bg-slate-800 text-slate-300'
                    }`}>
                      {isBlocked ? 'INTERCEPTED' : 'PASSED DIRECTLY'}
                    </span>
                  </div>
                </div>

                {/* Hook Interception Flow Banner */}
                {isBlocked ? (
                  <div className="bg-amber-950/20 border border-amber-500/30 rounded-lg p-3 text-xs space-y-1">
                    <div className="flex items-center gap-2 text-amber-300 font-semibold">
                      <Shield className="w-4 h-4 text-amber-400" />
                      <span>Lifecycle Hook Gate: PreToolUse intercept triggered</span>
                    </div>
                    <p className="text-slate-400 text-[11px]">
                      File ({currentWorkload.rawKb} KB) exceeds the configured cutoff of {cutoffKb} KB. Raw dump prevented.
                      Antigravity redirected the query to the local SQLite FTS5 engine.
                    </p>
                  </div>
                ) : (
                  <div className="bg-red-950/20 border border-red-500/30 rounded-lg p-3 text-xs space-y-1">
                    <div className="flex items-center gap-2 text-red-300 font-semibold">
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                      <span>Warning: Protection inactive or below cutoff</span>
                    </div>
                    <p className="text-slate-400 text-[11px]">
                      The full {currentWorkload.rawKb} KB ({currentWorkload.rawTokens.toLocaleString()} tokens) is injected directly into agent context.
                    </p>
                  </div>
                )}

                {/* Terminal Payload Viewer */}
                <div>
                  <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-1.5">
                    <span>Resulting Output Injected into Agent Context:</span>
                    <span className="text-emerald-400">
                      {isBlocked ? 'Filtered via SQLite BM25/Trigram' : 'Raw Un-paged Content'}
                    </span>
                  </div>

                  <div className="bg-black/90 border border-slate-800 rounded-lg font-mono text-xs p-4 text-slate-300 overflow-x-auto min-h-[220px] max-h-[320px]">
                    {isBlocked ? (
                      <div className="space-y-3">
                        <div className="text-cyan-400">
                          // Query executed: ctx_search(query="{searchTerm}", limit=1)
                        </div>
                        <div className="text-emerald-300 font-mono whitespace-pre-wrap leading-relaxed">
                          {currentWorkload.filteredSnippet}
                        </div>
                        <div className="pt-2 text-slate-500 text-[11px] border-t border-slate-800">
                          -- End of filtered context mode slice (85 tokens delivered) --
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2 text-slate-400">
                        <div className="text-red-400">// Warning: 16,000+ raw tokens loaded into prompt!</div>
                        <div className="whitespace-pre-wrap leading-relaxed text-slate-500">
                          {currentWorkload.rawSample}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* Bottom Simulator Stats Footnote */}
              <div className="mt-6 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
                <div className="flex items-center gap-2">
                  <Database className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Local SQLite Index: <code className="text-slate-300">~/.context-mode/context.db</code></span>
                </div>
                <div className="text-emerald-400 font-mono">
                  {isBlocked ? `✓ Saved ${percentSaved}% of prompt bandwidth` : '⚠ Context Bloat in progress'}
                </div>
              </div>

            </div>

          </div>

        </div>
      </section>

      {/* How It Works & Architecture Section */}
      <section id="how-it-works" className="py-16 sm:py-24 border-t border-slate-900 bg-slate-950/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full text-xs font-mono mb-3">
              <Layers className="w-3.5 h-3.5" />
              Engine Pipeline Architecture
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              How Antigravity Context Mode Intercepts & Filters
            </h2>
            <p className="text-slate-400 text-sm sm:text-base mt-2">
              A high-performance local pipeline built on native Node.js lifecycle hooks, sandboxing, and SQLite FTS5.
            </p>
          </div>

          {/* 3 Step Pipeline Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            
            {/* Step 1 */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 backdrop-blur-sm hover:border-emerald-500/50 transition-colors duration-200 relative group">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-mono font-bold mb-4">
                01
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                Pre-Tool-Use Lifecycle Hook
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Before an agent runs an unbounded shell command (<code className="text-slate-300">cat</code>, <code className="text-slate-300">Get-Content</code>) or reads a file over 8 KB, <code className="text-emerald-400">hooks.json</code> intercepts the call.
              </p>
              <div className="mt-4 pt-4 border-t border-slate-800 text-xs font-mono text-slate-500">
                Gate: Enforces 8 KB cutoff & dynamic line slices.
              </div>
            </div>

            {/* Step 2 */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 backdrop-blur-sm hover:border-emerald-500/50 transition-colors duration-200 relative group">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-mono font-bold mb-4">
                02
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                "Thinking in Code" Sandboxing
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Instead of dumping multi-megabyte payloads, the agent executes targeted filtering scripts inside a sandboxed subprocess via <code className="text-cyan-400">ctx_execute</code>.
              </p>
              <div className="mt-4 pt-4 border-t border-slate-800 text-xs font-mono text-slate-500">
                Runtimes: Node.js, Python, or PowerShell.
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 backdrop-blur-sm hover:border-emerald-500/50 transition-colors duration-200 relative group">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-mono font-bold mb-4">
                03
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                SQLite FTS5 + BM25 & Trigram RRF
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Source files and logs are indexed locally in SQLite. Queries use Porter BM25 stemming combined with Trigram sub-token matching, ranked via Reciprocal Rank Fusion.
              </p>
              <div className="mt-4 pt-4 border-t border-slate-800 text-xs font-mono text-slate-500">
                Storage: 100% local database with WAL mode.
              </div>
            </div>

          </div>

          {/* Architecture Flow Diagram */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white font-mono uppercase tracking-wider">
                  Lifecycle Interception Diagram
                </h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">Zero External Network Traffic</span>
            </div>

            <div className="bg-black/80 border border-slate-800 rounded-lg font-mono text-xs p-5 text-slate-300 overflow-x-auto">
              <pre className="text-emerald-400/90 leading-relaxed font-mono">
{`┌────────────────────────────────────────────────────────────────────────┐
│                          ANTIGRAVITY AGENT                             │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                       Tool Call (e.g. read large file/command)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 PRE-TOOL-USE LIFECYCLE HOOK GATE                       │
│  • Intercepts unbounded dumps (cat, Get-Content, git diff)             │
│  • Enforces 8 KB cutoff for un-paged file reads                        │
│  • Automatically exempts binary media, documents, & prompt attachments │
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
                                          Returns only the filtered,
                                          relevant answer to the chat!`}
              </pre>
            </div>
          </div>

        </div>
      </section>

      {/* Interactive FTS5 Search & Query Inspector */}
      <section id="search-inspector" className="py-16 sm:py-24 border-t border-slate-900 bg-slate-950">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
            <div>
              <div className="inline-flex items-center gap-2 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-3 py-1 rounded-full text-xs font-mono mb-2">
                <Search className="w-3.5 h-3.5" />
                Live Index Explorer
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                Interactive SQLite FTS5 Inspector
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                Test how the Porter BM25 + Trigram RRF engine scores and retrieves exact code matches from indexed projects.
              </p>
            </div>

            {/* Quick search keywords presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-400 mr-1">Try searching:</span>
              {['NullPointerException', 'Vulkan', 'RenderTargetBuffer', 'troubleshooting'].map((term) => (
                <button
                  key={term}
                  onClick={() => setSearchTerm(term)}
                  className="text-xs font-mono px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 transition-colors"
                >
                  {term}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 backdrop-blur-sm space-y-6">
            
            {/* Search Input Bar */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Enter keywords, symbols, or error traces..."
                  className="w-full bg-black/70 border border-slate-800 focus:border-emerald-500 focus:outline-none rounded-lg pl-10 pr-4 py-2.5 text-sm text-white font-mono placeholder:text-slate-600 transition-colors"
                />
              </div>

              {/* Category filter pills */}
              <div className="flex items-center gap-1.5 self-center sm:self-auto overflow-x-auto pb-1 sm:pb-0">
                {[
                  { id: 'all', label: 'All Sources' },
                  { id: 'logs', label: 'Logs' },
                  { id: 'code', label: 'Source Code' },
                  { id: 'docs', label: 'Docs' }
                ].map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSearchActiveCategory(cat.id)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                      searchActiveCategory === cat.id
                        ? 'bg-emerald-500 text-slate-950 font-bold'
                        : 'bg-black/50 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Results Grid */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-mono text-slate-400 px-1">
                <span>Ranked Reciprocal Rank Fusion Matches ({searchResults.length})</span>
                <span>SQLite Table: <code className="text-slate-300">fts_sources_idx</code></span>
              </div>

              {searchResults.length === 0 ? (
                <div className="p-8 text-center text-slate-500 bg-black/40 rounded-lg border border-slate-800 font-mono text-xs">
                  No matches found for "{searchTerm}". Try another keyword like "NullPointerException".
                </div>
              ) : (
                searchResults.map((item, idx) => (
                  <div
                    key={item.id}
                    className="bg-black/80 border border-slate-800 hover:border-emerald-500/50 rounded-lg p-4 transition-colors font-mono space-y-2 group"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 truncate">
                        <span className="w-5 h-5 rounded bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-[11px]">
                          #{idx + 1}
                        </span>
                        <span className="text-white font-semibold truncate">{item.source}</span>
                        <span className="text-slate-500">Line {item.line}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded text-[11px]">
                          {item.matchType}
                        </span>
                        <span className="text-slate-400 text-xs">
                          Score: <strong className="text-emerald-400">{item.score}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="p-2.5 rounded bg-slate-950/80 border border-slate-800/80 text-emerald-300 text-xs break-all group-hover:border-slate-700 transition-colors">
                      {item.content}
                    </div>

                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-slate-400" />
                      <span>Context: {item.context}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

          </div>

        </div>
      </section>

      {/* The 8 Available MCP Tools Explorer */}
      <section id="mcp-tools" className="py-16 sm:py-24 border-t border-slate-900 bg-slate-950/90">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full text-xs font-mono mb-3">
              <Cpu className="w-3.5 h-3.5" />
              Native Agent Protocol
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              The 8 Dedicated MCP Tools
            </h2>
            <p className="text-slate-400 text-sm sm:text-base mt-2">
              Context Mode registers 8 lazy-loaded Model Context Protocol tools for search, sandboxing, session recovery, and stats.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Tool list tabs (4 cols) */}
            <div className="lg:col-span-4 space-y-2">
              {mcpTools.map((tool, idx) => (
                <button
                  key={tool.id}
                  onClick={() => setSelectedToolIndex(idx)}
                  className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-center justify-between ${
                    selectedToolIndex === idx
                      ? 'bg-slate-900 border-emerald-500 text-white shadow-md'
                      : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-sm text-emerald-400">
                      {tool.name}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    {tool.tag}
                  </span>
                </button>
              ))}
            </div>

            {/* Selected tool detail view (8 cols) */}
            <div className="lg:col-span-8 bg-slate-900/70 border border-slate-800 rounded-xl p-6 backdrop-blur-sm space-y-6">
              
              {/* Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-2xl font-bold font-mono text-white">
                      {mcpTools[selectedToolIndex].name}
                    </h3>
                    <span className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-3 py-0.5 rounded-full text-xs font-mono">
                      {mcpTools[selectedToolIndex].tag}
                    </span>
                  </div>
                  <p className="text-sm text-slate-300 mt-2">
                    {mcpTools[selectedToolIndex].summary}
                  </p>
                </div>
              </div>

              {/* Best Practice Usage */}
              <div>
                <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-1.5">
                  When the Agent Uses This:
                </h4>
                <p className="text-xs sm:text-sm text-slate-300 bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                  {mcpTools[selectedToolIndex].whenToUse}
                </p>
              </div>

              {/* Parameters Table */}
              <div>
                <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">
                  Parameters Schema
                </h4>
                {mcpTools[selectedToolIndex].params.length === 0 ? (
                  <div className="text-xs font-mono text-slate-500 italic p-3 bg-black/40 rounded-lg border border-slate-800">
                    No arguments required (0 parameters).
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400">
                          <th className="py-2 px-3">Parameter</th>
                          <th className="py-2 px-3">Type</th>
                          <th className="py-2 px-3">Required</th>
                          <th className="py-2 px-3">Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-slate-300">
                        {mcpTools[selectedToolIndex].params.map((p) => (
                          <tr key={p.name} className="hover:bg-slate-800/30">
                            <td className="py-2 px-3 font-bold text-emerald-400">{p.name}</td>
                            <td className="py-2 px-3 text-cyan-400">{p.type}</td>
                            <td className="py-2 px-3">
                              {p.required ? (
                                <span className="text-amber-400">Required</span>
                              ) : (
                                <span className="text-slate-500">Optional</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-slate-400">{p.desc}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Code Snippet */}
              <div>
                <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
                  <span>Example Agent Invocation</span>
                  <button
                    onClick={() => handleCopy(mcpTools[selectedToolIndex].exampleSnippet, mcpTools[selectedToolIndex].id)}
                    className="flex items-center gap-1 hover:text-white transition-colors"
                  >
                    {copiedToolCode === mcpTools[selectedToolIndex].id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Code</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="bg-black/90 border border-slate-800 rounded-lg p-4 font-mono text-xs text-slate-300 overflow-x-auto">
                  <pre className="text-emerald-300/90 whitespace-pre">
                    {mcpTools[selectedToolIndex].exampleSnippet}
                  </pre>
                </div>
              </div>

            </div>

          </div>

        </div>
      </section>

      {/* File Category Rules & Custom Extension Tester */}
      <section className="py-16 sm:py-24 border-t border-slate-900 bg-slate-950">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-3 py-1 rounded-full text-xs font-mono mb-3">
              <FileCode className="w-3.5 h-3.5" />
              Intelligent Filtering Rules
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              File Category & Extension Matrix
            </h2>
            <p className="text-slate-400 text-sm sm:text-base mt-2">
              Context Mode differentiates between visual/binary assets (which models need to inspect) and unbounded source code or log dumps.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            
            {/* Visual Media */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 backdrop-blur-sm hover:border-emerald-500/50 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-white">Images & Media</h3>
                <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded text-xs font-mono">
                  EXEMPT (Allowed)
                </span>
              </div>
              <p className="text-xs text-slate-400 mb-3">
                Vision-capable models must inspect UI screenshots and mockups without size rejection.
              </p>
              <div className="flex flex-wrap gap-1 font-mono text-[11px] text-slate-300">
                {['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif', '.ico'].map(ext => (
                  <span key={ext} className="px-2 py-0.5 bg-black/60 rounded border border-slate-800">{ext}</span>
                ))}
              </div>
            </div>

            {/* Documents */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 backdrop-blur-sm hover:border-emerald-500/50 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-white">Documents</h3>
                <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded text-xs font-mono">
                  EXEMPT (Allowed)
                </span>
              </div>
              <p className="text-xs text-slate-400 mb-3">
                Rich binary documents and spreadsheets are parsed safely without choking the token window.
              </p>
              <div className="flex flex-wrap gap-1 font-mono text-[11px] text-slate-300">
                {['.pdf', '.docx', '.xlsx', '.pptx', '.odt', '.rtf'].map(ext => (
                  <span key={ext} className="px-2 py-0.5 bg-black/60 rounded border border-slate-800">{ext}</span>
                ))}
              </div>
            </div>

            {/* 3D & Audio */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 backdrop-blur-sm hover:border-emerald-500/50 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-white">3D Models & Audio</h3>
                <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded text-xs font-mono">
                  EXEMPT (Allowed)
                </span>
              </div>
              <p className="text-xs text-slate-400 mb-3">
                Binary 3D models and audio tracks are exempted for specialized multimodal tasks.
              </p>
              <div className="flex flex-wrap gap-1 font-mono text-[11px] text-slate-300">
                {['.blend', '.fbx', '.obj', '.gltf', '.mp3', '.wav', '.zip'].map(ext => (
                  <span key={ext} className="px-2 py-0.5 bg-black/60 rounded border border-slate-800">{ext}</span>
                ))}
              </div>
            </div>

            {/* Source Code */}
            <div className="bg-slate-900/70 border border-amber-500/30 rounded-xl p-6 backdrop-blur-sm lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-white">Source Code & Large Text</h3>
                <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2.5 py-0.5 rounded text-xs font-mono">
                  PROTECTED (Gated &gt; 8 KB)
                </span>
              </div>
              <p className="text-xs text-slate-400 mb-3">
                Un-paged file reads over 8 KB or line ranges over 200 lines are intercepted. Agents are instructed to inspect specific line ranges or query via FTS5.
              </p>
              <div className="flex flex-wrap gap-1 font-mono text-[11px] text-slate-300">
                {['.js', '.ts', '.jsx', '.tsx', '.py', '.rs', '.go', '.java', '.cpp', '.cs', '.log', '.sql'].map(ext => (
                  <span key={ext} className="px-2 py-0.5 bg-black/60 rounded border border-slate-800 text-amber-300/90">{ext}</span>
                ))}
              </div>
            </div>

            {/* Chat Attachments */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-white">Chat Attachments</h3>
                <span className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 px-2.5 py-0.5 rounded text-xs font-mono">
                  BYPASS (Always Permitted)
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Files attached directly in chat by the user (via <code className="text-slate-300">@mention</code> or drag-and-drop) always bypass cutoffs so the agent inspects your explicit request in full.
              </p>
            </div>

          </div>

          {/* Interactive Custom Extension Manager */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 backdrop-blur-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">Custom File Extension Whitelist</h3>
                <p className="text-xs text-slate-400">
                  Add user-defined extensions to exempt proprietary binary formats or large dataset logs.
                </p>
              </div>

              {/* Add form */}
              <form onSubmit={addCustomExtension} className="flex gap-2">
                <input
                  type="text"
                  value={customExtInput}
                  onChange={(e) => setCustomExtInput(e.target.value)}
                  placeholder="e.g. .parquet, .dat"
                  className="bg-black/70 border border-slate-800 focus:border-emerald-500 focus:outline-none rounded-lg px-3 py-1.5 text-xs font-mono text-white placeholder:text-slate-600"
                />
                <button
                  type="submit"
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-3 py-1.5 rounded-lg text-xs transition-colors"
                >
                  Add
                </button>
              </form>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              {customExtensions.map((ext) => (
                <span
                  key={ext}
                  className="inline-flex items-center gap-1.5 bg-black/60 border border-emerald-500/40 text-emerald-300 px-3 py-1 rounded-lg text-xs font-mono"
                >
                  {ext}
                  <button
                    onClick={() => removeCustomExtension(ext)}
                    className="hover:text-red-400 transition-colors"
                    title="Remove"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

        </div>
      </section>

      {/* Installation & Configuration Guide */}
      <section id="installation" className="py-16 sm:py-24 border-t border-slate-900 bg-slate-950/90">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full text-xs font-mono mb-3">
              <Terminal className="w-3.5 h-3.5" />
              Quickstart in 60 Seconds
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Installation & Configuration
            </h2>
            <p className="text-slate-400 text-sm sm:text-base mt-2">
              Install via npm into your Antigravity plugins directory or global workspace.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Step 1: Install & Verify (6 cols) */}
            <div className="lg:col-span-6 space-y-6">
              
              <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 backdrop-blur-sm space-y-4">
                <div className="flex items-center gap-2 font-mono text-sm text-white font-bold">
                  <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs">1</span>
                  Install the Plugin
                </div>
                <p className="text-xs text-slate-400">
                  Run the standard npm install in your terminal or install from the Antigravity Plugins Manager:
                </p>
                <div
                  onClick={() => handleCopy('npm install antigravity-plugin-context-mode')}
                  className="cursor-pointer group bg-black/90 border border-slate-800 hover:border-emerald-500/50 rounded-lg p-3.5 font-mono text-xs text-slate-300 flex items-center justify-between"
                >
                  <code>npm install antigravity-plugin-context-mode</code>
                  <span className="text-slate-500 group-hover:text-emerald-400 flex items-center gap-1 text-xs">
                    {copiedCmd ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedCmd ? 'Copied' : 'Copy'}
                  </span>
                </div>
              </div>

              <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 backdrop-blur-sm space-y-4">
                <div className="flex items-center gap-2 font-mono text-sm text-white font-bold">
                  <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs">2</span>
                  Verify Installation
                </div>
                <p className="text-xs text-slate-400">
                  Run the native Node test suite to verify SQLite FTS5 schema initialization & MCP communication:
                </p>
                <div className="bg-black/90 border border-slate-800 rounded-lg p-3.5 font-mono text-xs text-slate-300 space-y-1">
                  <div className="text-emerald-400">$ npm test</div>
                  <div className="text-slate-500">✔ SQLite FTS5 Porter & Trigram tables initialized (4.2ms)</div>
                  <div className="text-slate-500">✔ PreToolUse lifecycle gating verified (2.1ms)</div>
                  <div className="text-slate-500">✔ 8 MCP JSON-RPC tool endpoints verified (6.8ms)</div>
                  <div className="text-emerald-400 font-semibold pt-1"># tests 14 | pass 14 | fail 0</div>
                </div>
              </div>

            </div>

            {/* Step 2: Environment Variables (6 cols) */}
            <div className="lg:col-span-6 bg-slate-900/70 border border-slate-800 rounded-xl p-6 backdrop-blur-sm flex flex-col justify-between">
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-mono text-sm text-white font-bold">
                    <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs">3</span>
                    Environment Customization
                  </div>

                  {/* OS Switcher */}
                  <div className="flex bg-black/60 p-1 rounded-lg border border-slate-800 text-[11px] font-mono">
                    <button
                      onClick={() => setOsTab('windows')}
                      className={`px-2.5 py-1 rounded transition-colors ${
                        osTab === 'windows' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      PowerShell
                    </button>
                    <button
                      onClick={() => setOsTab('bash')}
                      className={`px-2.5 py-1 rounded transition-colors ${
                        osTab === 'bash' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      macOS / Linux
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-400">
                  Configure cutoff thresholds or script execution timeouts via standard environment variables:
                </p>

                <div className="bg-black/90 border border-slate-800 rounded-lg p-3.5 font-mono text-xs text-slate-300">
                  {osTab === 'windows' ? (
                    <div className="space-y-1">
                      <div className="text-slate-500"># Windows 11 PowerShell:</div>
                      <div>$env:CONTEXT_MODE_MAX_READ_BYTES = "8192"</div>
                      <div>$env:CONTEXT_MODE_MAX_LINE_RANGE = "200"</div>
                      <div>$env:CONTEXT_MODE_TIMEOUT_MS = "30000"</div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="text-slate-500"># macOS / Linux Bash or Zsh:</div>
                      <div>export CONTEXT_MODE_MAX_READ_BYTES=8192</div>
                      <div>export CONTEXT_MODE_MAX_LINE_RANGE=200</div>
                      <div>export CONTEXT_MODE_TIMEOUT_MS=30000</div>
                    </div>
                  )}
                </div>

                <div className="space-y-2 pt-2">
                  <div className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                    Config Reference:
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="p-2.5 rounded bg-black/40 border border-slate-800/80">
                      <div className="font-mono text-emerald-400 font-semibold">CONTEXT_MODE_MAX_READ_BYTES</div>
                      <div className="text-slate-400 text-[11px] mt-0.5">Threshold (default 8192 / 8 KB) above which un-paged reads are blocked. Set to 0 to disable.</div>
                    </div>
                    <div className="p-2.5 rounded bg-black/40 border border-slate-800/80">
                      <div className="font-mono text-cyan-400 font-semibold">CONTEXT_MODE_MAX_LINE_RANGE</div>
                      <div className="text-slate-400 text-[11px] mt-0.5">Max allowable slice lines before pagination rejection (scales automatically with cutoff).</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 text-xs font-mono text-slate-500 flex items-center justify-between">
                <span>Database Path:</span>
                <span className="text-slate-300">~/.context-mode/context.db</span>
              </div>

            </div>

          </div>

        </div>
      </section>

      {/* Frequently Asked Questions */}
      <section id="faq" className="py-16 sm:py-24 border-t border-slate-900 bg-slate-950">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Frequently Asked Questions
            </h2>
            <p className="text-slate-400 text-sm mt-2">
              Everything you need to know about safety, privacy, and token optimization.
            </p>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div
                  key={idx}
                  className="bg-slate-900/70 border border-slate-800 rounded-xl overflow-hidden backdrop-blur-sm transition-colors"
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full text-left p-5 flex items-center justify-between gap-4 hover:text-emerald-400 transition-colors"
                  >
                    <span className="font-medium text-sm sm:text-base text-white">
                      {faq.q}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 shrink-0 transform transition-transform duration-200 ${
                        isOpen ? 'rotate-180 text-emerald-400' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 pt-1 text-xs sm:text-sm text-slate-300 leading-relaxed border-t border-slate-800/60">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-black/60 py-12 text-xs text-slate-400">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
              <Shield className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <span className="font-bold text-white tracking-tight">Antigravity Context Mode</span>
              <p className="text-[11px] text-slate-500">
                Stop context bloat. Save 90%+ of your prompt tokens.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 font-mono text-xs">
            <a
              href="https://github.com/Domush/antigravity-plugin-context-mode"
              target="_blank"
              rel="noreferrer"
              className="hover:text-emerald-400 transition-colors"
            >
              GitHub (github.com/Domush)
            </a>
            <a
              href="https://www.npmjs.com/package/antigravity-plugin-context-mode"
              target="_blank"
              rel="noreferrer"
              className="hover:text-emerald-400 transition-colors"
            >
              npm Package
            </a>
            <span className="text-slate-600">|</span>
            <span>MIT License © Phillip Webber</span>
          </div>

          <div className="text-slate-500 text-[11px]">
            Designed natively for Google Antigravity IDE & Agents
          </div>

        </div>
      </footer>

    </div>
  );
}
