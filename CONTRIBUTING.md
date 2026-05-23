# Contributing to Todd of AIDLC

Thank you for your interest in contributing! This document covers the development workflow, code standards, and how to extend Todd of AIDLC with new agent connectors.

---

## Table of Contents

1. [Development Setup](#development-setup)
2. [Project Conventions](#project-conventions)
3. [Architecture Overview](#architecture-overview)
4. [Adding a New Agent Connector](#adding-a-new-agent-connector)
5. [Commit Convention](#commit-convention)
6. [Pull Request Checklist](#pull-request-checklist)

---

## Development Setup

### Requirements

- Node.js ≥ 20
- npm ≥ 10
- VSCode ≥ 1.85
- Git

### First-time setup

```bash
git clone https://github.com/nbsjunior/todd.git
cd toddspect
npm install
npm run build:cli         # Build CLI first (extension depends on it)
```

### Running in development

1. Open the **`packages/extension`** folder in VSCode (not the monorepo root)
2. Press **F5** — the *Extension Development Host* opens
3. In a terminal, run `npm run watch` in both `packages/cli` and `packages/extension` to get live recompilation

### Project scripts

| Command | Description |
|---|---|
| `npm run build` | Build all packages |
| `npm run build:cli` | Build CLI only |
| `npm run build:extension` | Build extension only |
| `npm run watch` | Watch mode for all packages |
| `npm run clean` | Remove all `dist/` directories |

---

## Project Conventions

### TypeScript

- **`strict: true`** is mandatory — no exceptions
- No `any` in the IPC core, router, or type definitions
- Use `IPCMessage<TPayload>` with explicit generics at every call site
- Prefer `unknown` over `any` when type is not known at compile time
- Use exhaustive `never` checks in all `switch` statements over union types

### Naming

| Element | Convention | Example |
|---|---|---|
| Files | camelCase | `CliService.ts` |
| Classes | PascalCase | `class AgentRouter` |
| Interfaces | PascalCase | `interface IPCMessage<T>` |
| Types | PascalCase | `type AgentId` |
| Constants | SCREAMING_SNAKE | `MAX_RESTART_ATTEMPTS` |
| IPC actions | `namespace:verb` | `'chat:send'`, `'spec:parse'` |

### stdout / stderr discipline (CLI)

> **The CLI daemon's `stdout` is a data channel, not a log channel.**

- `process.stdout` — JSON IPC frames **only** (`JSON.stringify(msg) + '\n'`)
- `process.stderr` — all debug logs, progress info, warnings
- Never use `console.log` in `--ipc` mode (it writes to stdout and breaks the frame parser)

### File I/O ownership

- The **Extension Host** resolves absolute paths and sends them to the CLI
- The **CLI daemon** performs all `fs.readFile` / directory scanning
- The Extension Host never reads file contents — it keeps the UI thread free

---

## Architecture Overview

```
packages/
├── extension/          VSCode Extension (runs in Extension Host process)
│   ├── CliService      Spawns CLI daemon; sends/receives JSON frames via stdin/stdout
│   ├── AgentService    Sends chat requests; dispatches streaming chunks to webview
│   ├── ContextProvider Tracks selected files/dirs; exposes absolute paths
│   ├── ChatViewProvider  Webview lifecycle + bidirectional postMessage
│   └── McpClientManager  Connects to MCP servers from workspace config
│
└── cli/                CLI Daemon (separate Node.js process)
    ├── IpcServer       Reads JSON frames from stdin; dispatches to handlers
    ├── AgentRouter     Routes requests to the correct connector
    ├── specParser      Parses .md (frontmatter) and .yaml spec files
    ├── contextBuild    Scans directories; estimates token counts
    └── McpConnection   Thin wrapper over @modelcontextprotocol/sdk
```

### IPC message flow

```
Webview  →  postMessage  →  Extension Host  →  CliService.send()  →  stdin JSON frame  →  CLI
CLI  →  stdout JSON frame  →  CliService.parseFrame()  →  emit(action)  →  AgentService  →  postMessage  →  Webview
```

---

## Adding a New Agent Connector

### Step 1 — Register the `AgentId`

In both `packages/extension/src/types.ts` and `packages/cli/src/types.ts`:

```typescript
export type AgentId = 'copilot' | 'devin' | 'cursor' | 'claude' | 'kiro' | 'my-agent';
```

Add a descriptor in `packages/extension/src/types.ts`:

```typescript
export const AGENT_DESCRIPTORS: Record<AgentId, AgentDescriptor> = {
  // ...existing entries
  'my-agent': {
    id: 'my-agent',
    label: 'My Agent',
    description: 'Description of what My Agent does',
    supportsStreaming: true,
    supportsMcp: false,
  },
};
```

### Step 2 — Add connector config

In `packages/extension/package.json` under `contributes.configuration.properties`:

```json
"toddspect.connectors.myAgent.apiKey": {
  "type": "string",
  "default": "",
  "description": "My Agent API key.",
  "scope": "machine"
},
"toddspect.connectors.myAgent.endpoint": {
  "type": "string",
  "default": "https://api.myagent.com/v1",
  "description": "My Agent API endpoint.",
  "scope": "machine"
}
```

In `packages/cli/src/config.ts`, add to `AgentConnectorConfig` and `loadAgentConfig()`:

```typescript
export interface AgentConnectorConfig {
  // ...existing
  myAgent: { apiKey: string; endpoint: string };
}

// inside loadAgentConfig():
myAgent: {
  apiKey: c.myAgent?.apiKey ?? process.env['MY_AGENT_API_KEY'] ?? '',
  endpoint: c.myAgent?.endpoint ?? 'https://api.myagent.com/v1',
},
```

### Step 3 — Implement the connector

In `packages/cli/src/router/AgentRouter.ts`, add a case to `route()`:

```typescript
case 'my-agent':
  await this.routeMyAgent(req);
  break;
```

Then implement the connector method. Choose the right pattern:

**Streaming (SSE / OpenAI-compatible):**
```typescript
private async routeMyAgent(req: AgentRequest): Promise<void> {
  const cfg = req.config.myAgent;
  if (!cfg.apiKey) {
    req.onError('My Agent API key not configured.');
    return;
  }
  const url = new URL('/chat/completions', cfg.endpoint);
  const body = JSON.stringify({
    messages: this.buildOpenAiMessages(req.messages),
    stream: true,
  });
  await this.streamSseRequest(
    url,
    { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body,
    req.onChunk,
    req.onDone,
    req.onError,
  );
}
```

**Non-streaming (single REST response):**
```typescript
private async routeMyAgent(req: AgentRequest): Promise<void> {
  const cfg = req.config.myAgent;
  const url = new URL('/invoke', cfg.endpoint);
  const lastUser = [...req.messages].reverse().find(m => m.role === 'user');
  try {
    const text = await this.httpPost(url, cfg.apiKey, JSON.stringify({ prompt: lastUser?.content }));
    const data = JSON.parse(text) as { response: string };
    req.onChunk(data.response);
    req.onDone();
  } catch (err) {
    req.onError(`My Agent request failed: ${(err as Error).message}`);
  }
}
```

### Step 4 — Update the Configuration Panel UI

In `packages/extension/src/panels/ConfigurationPanel.ts`, add your connector to the `renderConnector()` call list in `sendCurrentConfig()` and in the HTML template.

### Step 5 — Test locally

```bash
npm run build:cli
# Press F5 in VSCode, select My Agent from the dropdown, send a message
```

---

## Commit Convention

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

<body> (optional — use for non-obvious changes)
```

**Types:**

| Type | When to use |
|---|---|
| `feat` | New feature or new agent connector |
| `fix` | Bug fix |
| `refactor` | Code change that doesn't add features or fix bugs |
| `docs` | Documentation only |
| `chore` | Build scripts, deps, configs |
| `test` | Adding or fixing tests |
| `perf` | Performance improvement |

**Scopes:** `extension`, `cli`, `ipc`, `router`, `specs`, `mcp`, `docs`

**Examples:**
```
feat(router): add My Agent connector with SSE streaming
fix(ipc): handle partial JSON frames at stdin chunk boundary
docs(specs): add workflow authoring guide
refactor(cli): extract AgentConnectorConfig to config.ts
```

---

## Pull Request Checklist

- [ ] `npm run build` passes with zero errors
- [ ] TypeScript strict mode — no `any` in new code
- [ ] New agent connectors include a config key entry in `package.json` and `config.ts`
- [ ] All `console.log` removed from CLI code — use `process.stderr.write` or pass errors via `onError`
- [ ] Spec files use Markdown-first format (YAML frontmatter in `.md`)
- [ ] IPC message types added to `IpcAction` union in both `types.ts` files
- [ ] Commit message follows Conventional Commits format
