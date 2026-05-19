# Harness — Technical Architecture

> **AI assistants:** read [ai-reference.md](ai-reference.md) first for design *rationale*;
> use [code-map.md](code-map.md) to locate functions. This doc focuses on structure and diagrams.

## Overview

Harness routes natural-language prompts to AI coding agents through a **decoupled
dual-mode architecture**: the user-facing layer (VS Code Extension or CLI commands)
is completely separated from the agent-calling layer (CLI daemon).

---

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Interface                           │
│                                                                 │
│  ┌─────────────────────────┐    ┌──────────────────────────┐   │
│  │  VS Code Extension       │    │  Standalone CLI          │   │
│  │  packages/extension/     │    │  harness chat/run/check  │   │
│  │                         │    │                          │   │
│  │  ChatViewProvider        │    │  commander program       │   │
│  │  SpecManagerPanel        │    │  (index.ts)              │   │
│  │  ConfigurationPanel      │    └────────────┬─────────────┘   │
│  └────────────┬────────────┘                 │ direct call     │
│               │ IPC (stdin/stdout JSON)        │                 │
└───────────────┼───────────────────────────────┼─────────────────┘
                │                               │
                ▼                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CLI Core  (packages/cli/src/)                 │
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────────────────────┐    │
│  │  IpcServer.ts   │    │  AgentRouter.ts                 │    │
│  │                 │───▶│                                 │    │
│  │  Frame parser   │    │  routeCopilot()  ─── Ask mode   │    │
│  │  Dispatcher     │    │                 ─── Agent mode  │    │
│  │  stdin/stdout   │    │                 ─── Spec+Agent  │    │
│  └─────────────────┘    │  routeDevin()                   │    │
│                         │  routeClaude()                  │    │
│  ┌─────────────────┐    │  routeCursor()                  │    │
│  │  config.ts      │───▶│  routeKiro()                    │    │
│  │                 │    └──────────┬──────────────────────┘    │
│  │  loadHarness    │               │                           │
│  │  Config()       │               ▼                           │
│  │  5-layer merge  │    ┌─────────────────────────────────┐    │
│  └─────────────────┘    │  Connectors                     │    │
│                         │                                 │    │
│                         │  copilotAuth.ts  (token exchange│    │
│                         │  ghToken.ts      (gh CLI)       │    │
│                         │  kiroCli.ts      (kiro headless)│    │
│                         └─────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      External APIs                              │
│                                                                 │
│  api.githubcopilot.com   api.devin.ai   api.anthropic.com       │
│  api.github.com (token exchange)        kiro-cli (subprocess)   │
└─────────────────────────────────────────────────────────────────┘
```

---

## IPC Protocol

The extension runs the CLI as a child process and communicates via
**newline-delimited JSON** over stdin/stdout (similar to Language Server Protocol).

### Frame Shape

```typescript
interface IPCMessage<T = unknown> {
  id: string;       // UUID — correlates request ↔ response
  action: IpcAction; // discriminant
  payload: T;
  error?: string;   // present only in error responses
}
```

### Streaming (chat)

Chat responses are streamed as multiple `chat:chunk` push events:

```
Extension ──chat:send──▶ CLI
CLI ──chat:chunk(done=false)──▶ Extension  × N
CLI ──chat:chunk(done=true)──▶  Extension  (signals end)
```

---

## Config Merge Pipeline

```
gh auth token (subprocess)
       ↓
VS Code Secrets API
       ↓
Environment variables
       ↓
HARNESS_SETTINGS_JSON  ← built by configBridge.ts from VS Code settings
       ↓
.harness/config.yaml
       ↓
Defaults
```

`loadHarnessConfig()` in `config.ts` merges these into a single `LoadedHarnessConfig`.

---

## Copilot Mode Execution Paths

### Ask Mode
```
messages ──▶ buildOpenAiMessages(mode='ask')
         ──▶ POST /chat/completions { stream: true }
         ──▶ SSE stream → onChunk() × N → onDone()
```

### Agent Mode
```
messages + tools ──▶ POST /chat/completions { stream: false, tools, tool_choice: 'auto' }
                 ──▶ if tool_calls:
                       executeCopilotTool(name, args)  ← file system ops
                       append tool results
                       repeat (max 10 iterations)
                 ──▶ if finish_reason='stop':
                       onChunk(content) → onDone()
```

### Spec+Agent Mode
```
specPaths ──▶ readContextFiles(specPaths)
          ──▶ prepend <spec> blocks as system message
          ──▶ [same as Agent mode above]
```

---

## Copilot Authentication Flow

```
1. Extension calls `gh auth token` subprocess
        ↓
2. GH_TOKEN set in CLI process env
        ↓
3. AgentRouter calls getCopilotApiToken(ghToken)
        ↓
4a. GET api.github.com/copilot_internal/v2/token   ← individual plan
    → short-lived Copilot token (15 min TTL, cached in-process)
    → use as Bearer in api.githubcopilot.com calls

4b. 404 → token has `copilot` scope (Business/Enterprise)
    → use OAuth token directly as Bearer
```

---

## Kiro + AI-DLC Integration

```
harness chat --agent kiro "implement feature X"
        ↓
AgentRouter.routeKiro()
        ↓
ensureKiroCli()   ← downloads binary if missing (~/.harness/tools/kiro-cli/)
        ↓
ensureAidlcInstalled()  ← copies steering rules to .kiro/steering/
        ↓
buildKiroPrompt()  ← prepends AI-DLC activation prefix
        ↓
runKiroCli({ bin, args: ['chat', '--no-interactive', prompt] })
        ↓
stdout chunks → onChunk() → IPC → Extension → Webview
```

AI-DLC rules are bundled in `packages/cli/vendor/aidlc-rules/` and copied into the
extension `.vsix` at build time by `scripts/bundle-cli.mjs`.

---

## Build & Bundle Pipeline

```
npm run build
    ├── packages/extension/  → esbuild → dist/extension.js + dist/webview/**
    └── packages/cli/        → tsup (ESM, noExternal) → dist/index.js

node scripts/bundle-cli.mjs
    └── copies cli/dist/index.js + vendor/ → extension/cli/

npx @vscode/vsce package
    └── harness-vscode-0.1.0.vsix
```

### CLI Bundle Special Requirements

- **Format**: ESM (`"type": "module"`)
- **`noExternal: [/.*/]`** — all npm deps bundled inline (no `node_modules` at runtime)
- **`createRequire` banner** — CJS packages (commander) can call `require()` inside ESM bundle
- **Node built-ins** explicitly in `external[]` — resolved by the Node.js runtime

---

## Key Design Decisions

### Why CLI as subprocess?
Keeps the extension host process lean. File reads, API calls and long-running processes
don't block the VS Code UI thread. The daemon can be restarted independently.

### Why newline-delimited JSON over HTTP?
No port allocation, no auth between local processes, works through VS Code's process
sandbox. Simpler than WebSockets for this use case.

### Why `gh auth token` instead of stored secrets?
Tokens obtained via `gh auth login` have the `copilot` scope and are automatically
refreshed. Stored secrets go stale. Using the live subprocess result avoids "Bad credentials"
errors from outdated tokens.

### Why bundle CLI into the extension?
The extension must work out-of-the-box with no separate `npm install`. Bundling the
876 KB CLI dist ensures one-click install with no external dependencies.
