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

## Starter Kit (recommended)

**[→ docs/starter-kit.md](docs/starter-kit.md)** — install the `.vsix`, open the extension, configure **GitHub Copilot**, send your first message, and follow the **update flow**.

**[→ docs/dual-mode.md](docs/dual-mode.md)** — choose **VS Code Extension** or **CLI** (same router, same config).

**[→ docs/aidlc-kiro.md](docs/aidlc-kiro.md)** — **Kiro + AWS AI-DLC** (Kiro CLI auto-installed, steering rules, `aidlc-docs/`).

The release `.vsix` includes the **compiled Harness CLI** (`cli/dist/index.js`) — no separate CLI install required.

---

## Installation

### Option A — Install from VSIX (end users)

1. Download `harness-vscode-0.1.0.vsix` from the [**Releases**](https://github.com/nbsjunior/harness/releases) page.
2. Open VSCode → `Ctrl+Shift+P` → **Extensions: Install from VSIX...**
3. Select the downloaded file and click **Reload**.
4. Click the **Harness** icon in the Activity Bar → follow [starter-kit.md](docs/starter-kit.md).

Or from the terminal:.

```bash
code --install-extension harness-vscode-0.1.0.vsix
```

> The `.vsix` bundles the **Harness CLI** orchestrator (Copilot-first). Node.js 20+ must be on your `PATH`.

> **[→ Full user guide: docs/user-guide.md](docs/user-guide.md)** — covers agent setup, chat, context, Spec Manager, CLI, and troubleshooting.

### Option B — Build from source (contributors / developers)

**Prerequisites**

| Requirement | Version |
|---|---|
| Node.js | ≥ 20 |
| npm | ≥ 10 |
| VSCode | ≥ 1.85 |

```bash
git clone https://github.com/nbsjunior/harness.git
cd harness
npm install
npm run build:cli          # build the CLI daemon first
```

**Run in development mode (F5 hot-reload)**

```bash
npm run watch              # watch both packages
code packages/extension    # open only the extension folder
# Press F5 → Extension Development Host opens
```

**Package as .vsix (extension + bundled CLI)**

```bash
npm run package:vsix       # from monorepo root
# → packages/extension/harness-vscode-0.1.0.vsix
```

This runs: `build:cli` → `bundle:cli` (copy into extension) → `build:prod` → `vsce package`.

> For the full developer workflow see [docs/getting-started.md](docs/getting-started.md).  
> For end-user onboarding see [docs/starter-kit.md](docs/starter-kit.md).

## Quick Setup (after install)

### 1. Initialize your workspace

Open the project you want to use with Harness, then:

```
Ctrl+Shift+P → Harness: Initialize Workspace
```

This creates `.harness/` with example specs and a configuration template.

### 2. Configure an agent

```
Ctrl+Shift+P → Harness: Open Configuration
```

Set an API key for at least one agent. The easiest to start is **GitHub Copilot**:

```jsonc
// settings.json
{ "harness.connectors.copilot.token": "ghp_xxxxxxxxxxxxxxxxxxxx" }
```

### 3. Chat

Click the **Harness icon** in the Activity Bar, type a message, press **Enter**.

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

## Documentation

| Document | Description |
|---|---|
| **[docs/starter-kit.md](docs/starter-kit.md)** | **Quick start** — VSIX, Copilot setup, bundled CLI, update flow |
| **[docs/user-guide.md](docs/user-guide.md)** | Install, configure, and use Harness (full reference) |
| [docs/getting-started.md](docs/getting-started.md) | Developer setup: clone, build, F5 hot-reload |
| [docs/architecture.md](docs/architecture.md) | System design: extension ↔ CLI ↔ agents |
| [docs/ipc-protocol.md](docs/ipc-protocol.md) | stdin/stdout newline-JSON protocol reference |
| [docs/sdd-specs.md](docs/sdd-specs.md) | Spec-Driven Development: Skills, Tools, Workflows |
| [docs/agent-connectors.md](docs/agent-connectors.md) | Per-agent configuration and protocol details |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to add connectors, commit conventions, PR checklist |

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
