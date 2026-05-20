# Harness — AI Agent Reference Guide

> This file is the authoritative quick-reference for any AI model (Cursor, Claude, Copilot,
> Kiro, etc.) working on this codebase. Read it before reading any source file.

**Extended docs (read before diving into source):**

| Doc | Use when |
|-----|----------|
| [docs/ai-reference.md](docs/ai-reference.md) | You need **why** a design exists (auth, IPC, modes, bundling). |
| [docs/code-map.md](docs/code-map.md) | You need **which file/function** to change. |
| [docs/README.md](docs/README.md) | Full documentation index (user + dev + AI). |

---

## What is Harness?

Harness is a **meta-agent orchestrator** — one **VS Code** sidebar (or CLI) for multiple AI
providers (GitHub Copilot, Devin, Cursor AI, Claude Code, Kiro) so developers **do not switch
IDEs per vendor**.

**Product advantages** (documented in [docs/why-harness.md](docs/why-harness.md)):

1. **One IDE, many providers** — same chat UI; switch provider pills or use **Auto** routing.
2. **Spec-Driven Development** — `.harness/specs/` + **Spec+Agent** mode injects specs as context.
3. **Context engineering** — attached files are provider-agnostic; context survives agent switches.

**Core idea:** pick an agent (or Auto), attach context and specs, send a prompt — Harness
handles auth, routing, streaming, and display.

---

## Project Layout

```
harness/
├── packages/
│   ├── cli/          # Node.js CLI daemon + all agent connectors
│   └── extension/    # VS Code Extension (UI + IPC client)
├── docs/             # Architecture, guides, ADRs
├── scripts/          # Build helpers (bundle-cli.mjs, smoke-ipc.mjs)
├── .harness/         # Workspace config (config.yaml, specs/)
└── AGENTS.md         # ← you are here
```

Both packages share the same **conceptual types** but keep separate `types.ts` files to
avoid cross-package runtime imports.

---

## Dual-Mode Architecture

```
┌──────────────────────────────┐       ┌──────────────────────────────┐
│  VS Code Extension (UI)      │  IPC  │  CLI Daemon (Node.js)        │
│  packages/extension/src/     │──────▶│  packages/cli/src/           │
│                              │stdout │                              │
│  ChatViewProvider            │◀──────│  IpcServer → AgentRouter     │
│  ConfigurationPanel          │ JSON  │  connectors/ (copilot, etc.) │
│  SpecManagerPanel            │frames │                              │
└──────────────────────────────┘       └──────────────────────────────┘
         OR (standalone)
┌──────────────────────────────┐
│  harness chat / run / check getGoat │  (CLI commands, no extension needed)
└──────────────────────────────┘
```

The **extension spawns the CLI as a subprocess** and communicates via newline-delimited JSON
on stdin/stdout. The CLI daemon (IpcServer) handles ALL file I/O, API calls and agent routing.
The extension host never reads file contents — keeping the UI thread unblocked.

---

## Key Concepts

### Agents (`AgentId` / `AgentSelectionId`)
`copilot | devin | cursor | claude | kiro` — routable providers.

`auto` — UI/CLI selection; CLI resolves per message via `packages/cli/src/router/autoRouter.ts` (default: Copilot; see [docs/auto-routing.md](docs/auto-routing.md)).

Each agent has a connector in `packages/cli/src/connectors/` or is routed inline in
`AgentRouter.ts`.

### Modes (`CopilotMode`) — Copilot only
| Mode | Behaviour |
|------|-----------|
| `ask` | Conversational Q&A. Simple `chat/completions` call, no tools. |
| `agent` | Autonomous coding agent. Tool-calling loop (read_file, write_file, list_files, search_in_files). Max 10 iterations. |
| `spec+agent` | Like `agent` but injects active Spec YAML files as `<spec>` blocks in the system prompt before any user message. |

Details: [docs/copilot-modes.md](docs/copilot-modes.md)

### Specs (SDD — Spec-Driven Development)
YAML files in `.harness/specs/`. Each spec defines a `Skill`, `Tool` or `Workflow` with
a preferred agent, description and optional tool/parameter schema. In `spec+agent` mode
the spec content is prepended to the conversation as authoritative guidance.

### IPC Protocol
```
Extension → CLI:  { id, action, payload }  newline-delimited JSON on stdin
CLI → Extension:  { id, action, payload, error? }  newline-delimited JSON on stdout
```
All human-readable logs go to **stderr only** — stdout is reserved for JSON frames.

### Config Layering (precedence: high → low)

**Copilot token (extension → CLI child env):**
1. Live `gh auth token` (preferred — `configBridge.ts` refreshes VS Code secret if changed)
2. VS Code Secrets (`harness.connectors.copilot.token`) — fallback only
3. `GH_TOKEN` / `COPILOT_GITHUB_TOKEN` env vars

**All other settings:**
4. `HARNESS_SETTINGS_JSON` (bridged from VS Code settings by `configBridge.ts`)
5. `.harness/config.yaml`
6. Built-in defaults

CLI `loadHarnessConfig()` also calls `getGhCliToken()` when no env token is set.

---

## Module Map (CLI — `packages/cli/src/`)

| Path | Purpose |
|------|---------|
| `index.ts` | CLI entry-point. Registers all commands (`chat`, `run`, `check getGoat`, `init`, `setup`, `aidlc`). |
| `config.ts` | `loadHarnessConfig()` — merges all config sources into `AgentConnectorConfig`. |
| `ipc/IpcServer.ts` | Daemon entry-point. Reads stdin frames, dispatches to handlers, writes stdout frames. |
| `router/AgentRouter.ts` | Routes `AgentRequest` to the correct connector. Implements Ask/Agent/Spec+Agent loops. |
| `router/agentReadiness.ts` | `checkAgentReadiness()` — validates tokens/keys before routing. Used by `check getGoat`. |
| `connectors/cursorLocal.ts` | Cursor **SDK local** runtime (`@cursor/sdk`) — Agent/Spec+Agent edits `HARNESS_WORKSPACE` without Copilot. |
| `connectors/cursorCloud.ts` | Cursor **Cloud Agents API** v1 — Ask mode and `harness.cursor.agentExecution: cloud`. |
| `connectors/copilotAuth.ts` | GitHub Copilot 2-step auth: `getCopilotApiToken()` exchanges `gho_` OAuth token → short-lived Copilot token (15 min TTL, in-process cache). Falls back to direct OAuth if exchange returns 404. |
| `connectors/ghToken.ts` | `getGhCliToken()` — calls `gh auth token` subprocess; skips classic PATs (`ghp_`). |
| `connectors/kiroCli.ts` | `runKiroCli()` — runs kiro-cli headless with AI-DLC steering prompt. |
| `aidlc/` | AI-DLC (AI-Driven Development Life Cycle) integration: install/status/prompt helpers for Kiro steering rules. |
| `kiro/bootstrap.ts` | `ensureKiroCli()` — downloads, installs and caches Kiro CLI binary for the current OS/arch. |
| `parsers/specParser.ts` | Parses `.harness/specs/*.yaml` into `SpecDefinition` objects. |
| `commands/getGoat.ts` | `harness check getGoat` — prints readiness status for all 5 agents. |
| `commands/setup.ts` | `harness setup` — one-shot bootstrap: workspace init + Kiro CLI download + AI-DLC install. |
| `log.ts` | `harnessLog()` / `harnessWarn()` — routes output to stderr in IPC mode, stdout otherwise. Prevents pollution of JSON frames. |

## Module Map (Extension — `packages/extension/src/`)

| Path | Purpose |
|------|---------|
| `extension.ts` | Activation entry-point. Starts CLI daemon, registers all VS Code commands. |
| `types.ts` | **Shared types**: `AgentId`, `CopilotMode`, `IPCMessage`, `ChatSendPayload`, `WebviewCommand`, `ExtensionCommand`. Single source of truth for extension↔webview protocol. |
| `configBridge.ts` | `buildHarnessProcessEnv()` — builds `process.env` for CLI subprocess: reads VS Code secrets, calls `gh auth token`, bridges VS Code settings via `HARNESS_SETTINGS_JSON`. |
| `services/CliService.ts` | Manages CLI subprocess lifecycle: spawn, restart, send/receive IPC frames, `onCliMessage()` event emitter. |
| `services/AgentService.ts` | High-level `chat()` method: registers streaming listeners, sends `chat:send` IPC frame, dispatches chunks/errors to callbacks. |
| `providers/ChatViewProvider.ts` | Webview provider for the main chat panel. Tracks selected agent + mode. For `spec+agent`: resolves spec paths from workspace and passes them to AgentService. |
| `panels/SpecManagerPanel.ts` | Webview panel for browsing, creating and editing Spec YAML files. |
| `panels/ConfigurationPanel.ts` | Webview panel for configuring agent tokens/endpoints with live connection tests. |
| `webview/chat/main.ts` | Browser-side chat UI: renders messages, mode-bar (Ask/Agent/Spec+Agent), agent selector, context chips, slash commands. Communicates via `vscode.postMessage`. |

---

## Data Flow — User Sends a Message

```
1. User types prompt, selects mode (Ask / Agent / Spec+Agent)
2. webview/chat/main.ts  →  postMessage({ command: 'sendMessage', payload: { text, agent, mode } })
3. ChatViewProvider.handleWebviewMessage()
       resolves specPaths if mode === 'spec+agent'
4. AgentService.chat()
       sends IPC frame: { action: 'chat:send', payload: ChatSendPayload }
5. IpcServer.handleChatSend()
       reads context files (fs.readFile)
       if spec+agent: reads spec files, prepends as <spec> system message
       calls router.route(AgentRequest)
6. AgentRouter.routeCopilot() / routeCursor() / routeDevin / …
       Copilot Ask: SSE stream; Copilot Agent: tool loop (read_file, write_file, …)
       Cursor Agent: routeCursorLocal() (@cursor/sdk, local cwd) when API key set; else Cloud or Copilot fallback
7. IPC frames:  chat:chunk { done:false } × N  →  chat:chunk { done:true }
8. AgentService listener dispatches onChunk / onComplete to ChatViewProvider
9. ChatViewProvider posts appendChunk / messageComplete to webview
10. webview renders streamed markdown in real-time
```

---

## Authentication — GitHub Copilot

Copilot needs a GitHub OAuth token with the `copilot` scope. Harness resolves it in this order:

1. **`gh auth token`** (live subprocess call — always fresh, preferred)
2. VS Code Secrets (`harness.connectors.copilot.token`)
3. Env var `GH_TOKEN` / `COPILOT_GITHUB_TOKEN`

Once resolved, the raw `gho_` token is exchanged for a short-lived Copilot API token via
`GET api.github.com/copilot_internal/v2/token`. If that endpoint returns 404 (Business/Enterprise
accounts or no individual plan), the OAuth token is used directly (works when `copilot` scope
is present).

**Fix for missing scope:** `gh auth refresh --scopes copilot`

---

## IPC Message Actions

| Action | Direction | Payload type |
|--------|-----------|--------------|
| `ping` / `pong` | both | `{ ts: number }` |
| `chat:send` | ext→cli | `ChatSendPayload` |
| `chat:chunk` | cli→ext | `ChatChunkPayload` |
| `chat:error` | cli→ext | `{ sessionId, error }` |
| `context:build` | ext→cli | `ContextBuildPayload` |
| `context:result` | cli→ext | `ContextResultPayload` |
| `spec:parse` | ext→cli | `SpecParsePayload` |
| `spec:result` | cli→ext | `SpecResultPayload` |
| `agent:list` | ext→cli | — |
| `aidlc:install` | ext→cli | `{ workspaceRoot, force? }` |
| `aidlc:status` | ext→cli | `{ workspaceRoot }` |
| `setup:bootstrap` | ext→cli | `{ workspaceRoot }` |

---

## Adding a New Agent

1. Add `'myagent'` to `AgentId` union in both `types.ts` files.
2. Add descriptor to `AGENT_DESCRIPTORS` in `packages/extension/src/types.ts`.
3. Add config interface to `AgentConnectorConfig` in `packages/cli/src/config.ts`.
4. Add config loading in `loadHarnessConfig()`.
5. Add readiness check in `router/agentReadiness.ts`.
6. Add `case 'myagent': await this.routeMyAgent(req)` in `AgentRouter.ts`.
7. Add token/key entry in `configBridge.ts` `secretMap`.
8. Add setting to `packages/extension/package.json` `contributes.configuration`.
9. Add UI entry in `packages/extension/src/webview/config/main.ts`.

---

## Build Commands

```bash
npm run build          # build all packages (extension + CLI)
node scripts/bundle-cli.mjs   # copy CLI dist into extension/cli/
cd packages/extension && npx @vscode/vsce package --no-dependencies
```

The CLI is bundled as a **single ESM file** with all npm deps inlined (`noExternal: [/.*/]` in tsup).
A `createRequire` banner is injected so bundled CJS packages (commander, etc.) can call `require()`.
Node built-ins (`fs`, `path`, `child_process`, …) remain external.

---

## Conventions

- **stdout** = JSON IPC frames only. Never `console.log` in CLI daemon code.
- **stderr** = human-readable logs. Use `harnessLog()` / `harnessWarn()` from `log.ts`.
- **Secrets** never go to YAML config. Use VS Code Secrets or env vars.
- **File I/O** is always done in the CLI process, never in the extension host.
- **ESM only** — `"type": "module"` in both packages. No `.cjs` imports.
- **No magic re-exports** — import directly from source paths with `.js` extension in CLI.
