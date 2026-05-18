# Harness — Meta-Agent Orchestrator for VSCode

> **One interface. Every AI agent.**
> Harness abstracts GitHub Copilot, Devin, Cursor AI, Claude Code and AWS KIRO behind a unified conversational and spec-driven workflow inside VSCode.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-green)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)](https://www.typescriptlang.org)
[![VSCode](https://img.shields.io/badge/VSCode-%3E%3D1.85-007ACC)](https://code.visualstudio.com)

---

## What is Harness?

Harness is a VSCode extension that acts as a **Meta-Agent Orchestrator**: instead of switching between different AI tools, you interact through a single sidebar panel and Harness routes your requests to the right agent — based on your configured preferences, Spec-Driven Development (SDD) definitions, and the context you've selected.

```
┌──────────────────────────────────────────────────────────┐
│                     VSCode Sidebar                        │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Chat View   │  │ Spec Manager │  │  Agent Menu   │  │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘  │
└─────────┼─────────────────┼──────────────────┼──────────┘
          │                 │                  │
          └─────────────────┴──────────────────┘
                            │ stdin/stdout JSON (IPC)
                            ▼
          ┌─────────────────────────────────────────────────┐
          │           CLI Daemon (Node.js)                   │
          │  ┌────────────┐ ┌──────────┐ ┌───────────────┐ │
          │  │  Context   │ │  Spec    │ │ Agent Router  │ │
          │  │  Builder   │ │  Parser  │ │               │ │
          │  └────────────┘ └──────────┘ └───────┬───────┘ │
          └──────────────────────────────────────┼─────────┘
                                                 │
          ┌────────────┬──────────────┬──────────┴──────────┐
          ▼            ▼              ▼                      ▼
    GitHub Copilot   Devin       Cursor AI    Claude Code / AWS KIRO
```

---

## Features

| Feature | Description |
|---|---|
| **Chat Sidebar** | Conversational interface with streaming responses and message history |
| **Context Selector** | Add files and directories to the agent context with right-click → *Add to Harness Context* |
| **Spec Manager** | Browse, create and edit SDD specs (Skills, Tools, Workflows) in Markdown format |
| **Agent Menu** | Quick-pick to switch between agents mid-conversation |
| **Configuration Panel** | Set API keys, endpoints, CLI path, and MCP server definitions |
| **CLI Orchestrator** | Node.js daemon that handles all file I/O, spec parsing and agent routing |
| **MCP Support** | Connect to any Model Context Protocol server (stdio or HTTP) |
| **Auto-reconnect** | CLI daemon restarts automatically if it crashes |

---

## Quick Start

### Prerequisites

| Requirement | Version |
|---|---|
| Node.js | ≥ 20 |
| npm | ≥ 10 |
| VSCode | ≥ 1.85 |

### 1. Clone and install

```bash
git clone https://github.com/nbsjunior/harness.git
cd harness
npm install
```

### 2. Build the CLI (required before running the extension)

```bash
npm run build:cli
```

### 3. Run in development mode (F5)

```bash
# Watch mode for both packages
npm run watch
```

Open `packages/extension` in VSCode, then press **F5**. A new *Extension Development Host* window opens with the Harness icon in the Activity Bar.

### 4. Initialize your workspace

In the Extension Development Host window, open a project folder and run:

```
Ctrl+Shift+P → Harness: Initialize Workspace
```

This creates `.harness/` with example specs and a configuration template.

---

## Project Structure

```
harness/
├── packages/
│   ├── extension/               # VSCode Extension (esbuild)
│   │   ├── src/
│   │   │   ├── extension.ts     # Entry point — activates all providers
│   │   │   ├── providers/
│   │   │   │   ├── ChatViewProvider.ts    # Sidebar chat webview
│   │   │   │   └── ContextProvider.ts     # File/dir context management
│   │   │   ├── panels/
│   │   │   │   ├── SpecManagerPanel.ts    # SDD spec browser/editor
│   │   │   │   └── ConfigurationPanel.ts  # Settings UI
│   │   │   ├── services/
│   │   │   │   ├── CliService.ts          # IPC bridge to CLI daemon
│   │   │   │   └── AgentService.ts        # Agent call orchestration
│   │   │   ├── mcp/
│   │   │   │   └── McpClientManager.ts    # MCP server connections
│   │   │   └── webview/
│   │   │       ├── chat/main.ts           # Chat UI bundle
│   │   │       └── spec/main.ts           # Spec Manager UI bundle
│   │   └── esbuild.mjs          # Dual build: extension host + webviews
│   │
│   └── cli/                     # CLI Orchestrator (tsup/ESM)
│       ├── src/
│       │   ├── index.ts         # Entry: Commander CLI + IPC daemon mode
│       │   ├── config.ts        # Config loader (YAML + env vars)
│       │   ├── ipc/
│       │   │   └── IpcServer.ts       # stdin/stdout JSON frame server
│       │   ├── commands/
│       │   │   ├── init.ts            # harness init
│       │   │   ├── agentRun.ts        # harness agent:run
│       │   │   ├── specParse.ts       # harness spec:parse
│       │   │   └── contextBuild.ts    # harness context:build
│       │   ├── router/
│       │   │   └── AgentRouter.ts     # Routes to Copilot/Devin/Cursor/Claude/KIRO
│       │   ├── parsers/
│       │   │   ├── specParser.ts      # Markdown + YAML spec parser (Zod)
│       │   │   └── markdownParser.ts  # Remark-based MD parser
│       │   └── mcp/
│       │       └── McpConnection.ts   # MCP SDK client wrapper
│       └── tsup.config.ts
│
├── .harness/                    # Workspace SDD directory (per project)
│   ├── config.yaml              # Agent connector configuration
│   └── specs/                   # Skill and Workflow definitions
│       ├── skill-code-review.md
│       └── workflow-refactor-solid.md
│
├── docs/                        # Technical documentation
│   ├── architecture.md
│   ├── ipc-protocol.md
│   ├── sdd-specs.md
│   └── agent-connectors.md
│
├── tsconfig.base.json           # Shared strict TypeScript config
└── package.json                 # Monorepo root (npm workspaces)
```

---

## CLI Usage

The CLI can be used standalone (outside VSCode) for scripting and automation.

```bash
# Initialize a project
harness init ./my-project

# Run an agent with a one-shot prompt
harness agent:run --agent copilot --prompt "Review the auth module for security issues"

# Run with context directories
harness agent:run --agent claude --prompt "Refactor for SOLID" --dirs src,lib

# Parse and validate spec files
harness spec:parse .harness/specs/
harness spec:parse .harness/specs/skill-code-review.md --output json

# Build a context payload from directories
harness context:build --dirs src,docs --output summary
harness context:build --dirs src --max-tokens 50000 --output json
```

---

## Spec-Driven Development (SDD)

Harness uses Markdown files with YAML frontmatter as the primary spec format. Specs define reusable **Skills**, **Tools**, and **Workflows** that guide agent behavior.

### Example Spec (`skill-code-review.md`)

```markdown
---
kind: Skill
name: code-review
agents:
  preferred: copilot
  fallback: claude
tools:
  - name: read_file
    description: "Reads a source file from the workspace"
  - name: suggest_fix
    description: "Suggests a code fix for a flagged issue"
---

# Code Review

Performs a thorough code review focused on correctness, security and SOLID principles.

## Tools

- `read_file` — reads a source file from the workspace
- `suggest_fix` — suggests a code fix for a flagged issue
```

### Spec kinds

| Kind | Purpose |
|---|---|
| `Skill` | A reusable capability (e.g. code-review, test-generation) |
| `Tool` | A single atomic function exposed to an agent |
| `Workflow` | A multi-step process with ordered tool invocations |

---

## Agent Connectors

Configure connectors in `.harness/config.yaml` or VSCode Settings (`Ctrl+Shift+P → Harness: Open Configuration`).

| Agent | Protocol | Config Key | Env Variable |
|---|---|---|---|
| GitHub Copilot | REST / SSE | `harness.connectors.copilot.token` | `GITHUB_TOKEN` |
| Devin | REST | `harness.connectors.devin.apiKey` | `DEVIN_API_KEY` |
| Cursor AI | OpenAI-compat HTTP | `harness.connectors.cursor.endpoint` | `CURSOR_API_KEY` |
| Claude Code | CLI subprocess | `harness.connectors.claude.path` | `ANTHROPIC_API_KEY` |
| AWS KIRO | REST | `harness.connectors.kiro.endpoint` | `KIRO_API_KEY` |

### MCP Servers

Add MCP servers to `.harness/config.yaml`:

```yaml
mcp:
  enabled: true
  servers:
    - name: filesystem
      transport: stdio
      command: npx
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/workspace"]

    - name: my-api-server
      transport: http
      url: http://localhost:3000/mcp
```

---

## IPC Architecture

The Extension Host and CLI communicate via **newline-delimited JSON** over `stdin`/`stdout`.

```
Extension Host                      CLI Daemon (stdin/stdout)
─────────────                       ─────────────────────────
{"id":"…","action":"chat:send",  →  parsed from stdin
 "payload":{…}}⏎                    dispatched to AgentRouter
                                 ←  {"id":"…","action":"chat:chunk",
                                     "payload":{"chunk":"…","done":false}}⏎
                                 ←  {"id":"…","action":"chat:chunk",
                                     "payload":{"chunk":"…","done":true}}⏎
Debug logs                       →  stderr only (never stdout)
```

See [docs/ipc-protocol.md](docs/ipc-protocol.md) for the full protocol specification.

---

## Development

### Build commands

```bash
# Build everything
npm run build

# Watch mode (both packages)
npm run watch

# Build CLI only
npm run build:cli

# Build extension only
npm run build:extension

# Clean all build artifacts
npm run clean
```

### Tech stack

| Area | Technology |
|---|---|
| Language | TypeScript 5.8 (strict) |
| Extension bundler | esbuild |
| CLI bundler | tsup |
| Webview UI | @vscode/webview-ui-toolkit |
| IPC transport | stdin/stdout newline-delimited JSON |
| Spec validation | Zod |
| YAML parsing | js-yaml |
| Markdown parsing | remark + remark-frontmatter |
| MCP client | @modelcontextprotocol/sdk |
| CLI framework | commander + @commander-js/extra-typings |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines, commit conventions, and how to add a new agent connector.

---

## Roadmap

- [ ] Session persistence across VSCode restarts
- [ ] Token usage tracking and budget alerts
- [ ] Spec auto-discovery from repository structure
- [ ] Multi-agent parallel execution (fan-out)
- [ ] GitHub Actions integration for CI agent runs
- [ ] Plugin marketplace for community connectors
- [ ] Web UI for remote Harness instances

---

## License

MIT © Nelson Borges
