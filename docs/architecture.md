# Harness — Architecture

This document describes the high-level architecture of the Harness VSCode extension and CLI orchestrator.

---

## System Overview

Harness is structured as a **monorepo** containing two npm packages:

| Package | Runtime | Purpose |
|---|---|---|
| `packages/extension` | VSCode Extension Host | UI, context management, IPC bridge |
| `packages/cli` | Node.js process | File I/O, spec parsing, agent routing |

The two processes communicate through **newline-delimited JSON frames** over `stdin`/`stdout` (see [ipc-protocol.md](ipc-protocol.md)).

---

## Layer Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│  VSCode UI Thread                                                │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Webview (Chat)            Webview (Spec Manager)          │ │
│  │  • HTML / CSS / TS         • HTML / CSS / TS               │ │
│  │  • @vscode/webview-        • Spec list + editor            │ │
│  │    ui-toolkit              • YAML frontmatter form         │ │
│  └──────────┬─────────────────────────┬────────────────────────┘ │
│             │ postMessage             │ postMessage              │
│  ┌──────────▼─────────────────────────▼────────────────────────┐ │
│  │  Extension Host Process                                     │ │
│  │                                                             │ │
│  │  ChatViewProvider    ContextProvider    McpClientManager    │ │
│  │  SpecManagerPanel    AgentService       ConfigurationPanel  │ │
│  │                                                             │ │
│  │  ┌──────────────────────────────────────────────────────┐  │ │
│  │  │  CliService — IPC Bridge                             │  │ │
│  │  │  • Spawns CLI daemon (child_process.spawn)           │  │ │
│  │  │  • Writes JSON frames to stdin                       │  │ │
│  │  │  • Reads JSON frames from stdout (line buffer)       │  │ │
│  │  │  • Auto-reconnect with exponential backoff           │  │ │
│  │  └────────────────────────────┬─────────────────────────┘  │ │
│  └───────────────────────────────┼─────────────────────────────┘ │
└──────────────────────────────────┼──────────────────────────────┘
                                   │ stdin / stdout (JSON + \n)
                                   │ stderr (debug logs only)
┌──────────────────────────────────▼──────────────────────────────┐
│  CLI Daemon (separate Node.js process)                          │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  IpcServer                                               │  │
│  │  • Reads stdin line-by-line                              │  │
│  │  • Parses JSON frames                                    │  │
│  │  • Dispatches to handlers                                │  │
│  │  • Writes response frames to stdout                      │  │
│  └────────┬───────────────────────────────────┬─────────────┘  │
│           │                                   │                  │
│  ┌────────▼────────┐              ┌───────────▼──────────────┐  │
│  │ Context Builder │              │     Agent Router          │  │
│  │ • fs.readFile   │              │  • Copilot (SSE)          │  │
│  │ • dir scan      │              │  • Devin (REST)           │  │
│  │ • token count   │              │  • Cursor (OpenAI-compat) │  │
│  └─────────────────┘              │  • Claude Code (CLI)      │  │
│                                   │  • AWS KIRO (REST)        │  │
│  ┌──────────────────┐             └──────────────────────────┘  │
│  │   Spec Parser    │                                            │
│  │ • .md frontmatter│                                            │
│  │ • .yaml (legacy) │                                            │
│  │ • Zod validation │                                            │
│  └──────────────────┘                                            │
└──────────────────────────────────────────────────────────────────┘
```

---

## Key Design Decisions

### 1. Separation of concerns: Extension Host vs CLI

The Extension Host is responsible for:
- VSCode UI lifecycle (views, commands, menus)
- User interactions (context selection, agent switching)
- Routing webview ↔ CLI messages
- MCP connections from configuration

The CLI daemon is responsible for:
- All **file system I/O** (reading context files, scanning directories)
- Spec parsing and validation
- Agent connector calls (HTTP, subprocess, SSE streaming)
- Configuration loading from `.harness/config.yaml`

This separation keeps the Extension Host lean and avoids blocking the VSCode UI thread with heavy file operations.

### 2. Absolute paths as the context contract

When a user right-clicks a file or folder in the Explorer and selects *Add to Harness Context*, the `ContextProvider` resolves it to an **absolute file-system path** using `uri.fsPath`. This absolute path is sent to the CLI via `ChatSendPayload.contextPaths`.

The CLI then reads the actual file contents inside `IpcServer.readContextFiles()` and injects them as a `<system>` message before dispatching to the agent.

**Why?** The Extension Host does not need to know about file contents. URIs are VSCode abstractions; absolute paths are universal.

### 3. Newline-delimited JSON over stdio

Instead of Node.js native IPC (`execaNode`), Harness uses `stdin`/`stdout` with `\n` as a frame delimiter. This has several advantages:
- Works with any Node.js process (not just `execaNode` workers)
- Easy to debug (plain text in terminal)
- Enables future non-Node daemon implementations
- Keeps stdout a data channel; stderr stays a log channel

### 4. Streaming via server-push events

When the CLI sends a `chat:chunk` frame, it does **not** match the request `id` in the pending-request map — it's a server-push event. `CliService` emits these via `EventEmitter`, and `AgentService` subscribes before sending the `chat:send` request to avoid race conditions.

### 5. Auto-reconnect with exponential backoff

`CliService` monitors the daemon process and schedules restarts with delays of `1s`, `2s`, `4s`, `8s`, `16s` (capped at 30s). All pending requests are rejected immediately on daemon exit so the UI doesn't freeze.

### 6. Markdown-first SDD specs

Spec files use Markdown with YAML frontmatter (`.md`) as the primary authoring format. This allows:
- Machine-readable spec data (frontmatter parsed by the CLI)
- Human-readable documentation (Markdown body)
- Version-controllable alongside source code
- Rendered nicely in GitHub/GitLab

---

## Data Flow: Chat Message (end-to-end)

```
User types message in Chat webview
         │
         ▼ postMessage({ command: 'sendMessage', payload: { text, agent } })
ChatViewProvider.handleWebviewMessage()
         │
         ▼ await agentService.chat({ sessionId, messages, contextPaths, agent })
AgentService registers onCliMessage('chat:chunk') listener
         │
         ▼ cliService.send({ id, action: 'chat:send', payload: { ... } })
CliService writes JSON frame to CLI stdin
         │
         ▼ [CLI daemon receives frame]
IpcServer.dispatchMessage() → handleChatSend()
         │
         ├─ readContextFiles(contextPaths)  ← reads actual file contents from disk
         │
         ▼ AgentRouter.route({ agent, messages+context, config, onChunk, onDone })
[agent connector streams response]
         │
         ▼ onChunk(chunk) called for each token
IpcServer writes { id, action: 'chat:chunk', payload: { chunk, done:false } }\n to stdout
         │
         ▼ [Extension Host receives frame]
CliService.parseFrame() → emit('chat:chunk', msg)
         │
         ▼ AgentService onCliMessage handler
ChatViewProvider.post({ command: 'appendChunk', payload: { messageId, chunk } })
         │
         ▼ postMessage to webview
Webview appends chunk to message bubble
         │
[when done=true]
         ▼ AgentService calls onComplete()
ChatViewProvider.post({ command: 'messageComplete' })
         │
         ▼ Webview removes blinking cursor, marks message as complete
```

---

## MCP Integration

`McpClientManager` (Extension Host) handles connections to external MCP servers defined in `harness.mcp.servers`. It supports:

- **stdio transport** — spawns a local MCP server process
- **HTTP transport** — connects to a remote `StreamableHTTP` MCP endpoint

The manager pre-fetches all available `tools` and `resources` on connect (with pagination), and exposes `listAllTools()`, `callTool()`, and `readResource()` methods to other services.

The CLI's `McpConnection` class provides the same interface for use in autonomous agent workflows invoked from the command line.
