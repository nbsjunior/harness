<p align="center">
  <img src="docs/images/toddspect-icon.png" alt="ToddSpect logo" width="96" />
</p>

# ToddSpect — Meta-Agent Orchestrator for VSCode

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-green)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)](https://www.typescriptlang.org)
[![VSCode](https://img.shields.io/badge/VSCode-%3E%3D1.85-007ACC)](https://code.visualstudio.com)

> **One sidebar. Every agent. One conversation.**
> Stop juggling Copilot in VS Code, Cursor in another IDE, Claude in a browser tab, and Devin in yet another panel. **ToddSpect** keeps chat, file context, specs, and provider routing in a **single interaction** — so you stay in flow.

---

## Why one interaction matters

Today most teams use several AI tools. Each has its own window, login, and context. You re-attach the same files, re-explain the repo, and lose thread when you switch vendors.

**ToddSpect** fixes that with one unified surface:

| Benefit | What you get |
|---------|----------------|
| **Single chat panel** | Copilot, Claude, Cursor, Devin, and Kiro from one composer — switch with a pill or **Auto** routing. |
| **Shared context** | Attach files once (**Add to ToddSpect Context**). The same chips go to **every** provider on the next message. |
| **Spending dashboard** | See **requests**, **tokens in/out**, and **agent time** per provider — plus recent chat turns — in one **Spending** tab (workspace-local). |
| **Prompt optimization** | Built-in pipeline trims history, dedupes messages, caps context files, and injects quality rules — **fewer tokens**, **better answers** on every provider. |
| **One setup flow** | API keys, MCP servers, workspace defaults, and usage stats — one configuration panel (plus a dedicated **User Manual** tab in the app). |
| **Spec-Driven Development** | ToddSpect specs (`.toddspect/specs/`) + **spec-kit** workflow (`.toddspect/sdd/`) — constitution → specify → plan → tasks → implement in the **SDD** view. |
| **Same CLI under the hood** | Extension and standalone CLI share routing, auth, and file I/O — no duplicate logic. |

**[→ User Manual](docs/user-manual.md)** · [Wiki](https://github.com/nbsjunior/todd/wiki/User-Manual) · [Why ToddSpect?](docs/why-toddspect.md)

---

## Contribute — we want your help

ToddSpect is **open source** ([MIT](LICENSE)). Whether you fix a connector, improve docs, add a locale, or share UX feedback — **contributions are welcome**.

| How to help | Link |
|-------------|------|
| Report bugs & ideas | [GitHub Issues](https://github.com/nbsjunior/todd/issues) |
| Submit code | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Read the architecture | [docs/architecture.md](docs/architecture.md) · [AGENTS.md](AGENTS.md) |
| Improve the Wiki | Edit [`wiki/`](wiki/) and run `node scripts/publish-wiki.mjs` |

**Quick dev setup:** `npm install` → `npm run build` → `npm run package:vsix` → install the `.vsix` locally. See [docs/getting-started.md](docs/getting-started.md).

If ToddSpect saves you time switching between AI tools, consider **starring the repo** and telling others — it helps the project grow.

---

## What is ToddSpect?

ToddSpect is a VSCode extension that acts as a **Meta-Agent Orchestrator**: you interact through one sidebar panel; ToddSpect routes each request to the right agent using your provider choice (or **Auto**), your **SDD** specs, and the **context** you attached.

```
┌──────────────────────────────────────────────────────────┐
│                     VSCode Sidebar                        │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Chat View   │  │  SDD View    │  │  Agent Menu   │  │
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
| **Spending & usage** | Track **calls**, **tokens (in/out)**, and **duration** per provider; summary cards + recent turns — see [Spending](#spending--usage-tracking) |
| **Prompt optimization** | Pre-route pipeline for **efficiency** (dedupe, history trim, file caps) and **quality** (response contract, mode hints) — see [Prompt optimization](#prompt-optimization) |
| **Multi-provider chat** | Copilot, Claude, Cursor, Devin, Kiro — one UI; switch with a pill or **Auto** routing |
| **Chat Sidebar** | Conversational interface with streaming responses and message history |
| **Context engineering** | Right-click → *Add to ToddSpect Context*; chips above composer; shared across providers |
| **SDD view (spec-kit)** | Full spec-kit pipeline: `/speckit.*` steps, feature wizard, scaffold + **Run in chat** — [docs/sdd-speckit.md](docs/sdd-speckit.md) |
| **ToddSpect specs** | Skills, Tools, Workflows in `.toddspect/specs/` (Specs tab in SDD view) |
| **Spec+Agent mode** | Inject active specs + SDD artifacts as context before agent runs |
| **Configuration Panel** | Agents, MCP, workspace, and **Spending** — API keys and endpoints in one place |
| **CLI Orchestrator** | Node.js daemon: file I/O, spec parsing, agent routing (bundled in `.vsix`) |
| **MCP Support** | Connect Model Context Protocol servers (stdio or HTTP) |
| **Auto-reconnect** | CLI daemon restarts automatically if it crashes |

---

## Spending & usage tracking

When you use multiple AI providers, it is easy to lose track of how much each one is used. ToddSpect records usage **per workspace** after every chat turn and shows it in the configuration UI.

**Open:** `Ctrl+Shift+P` → **ToddSpect: Open Configuration** → **Spending** tab.

| What you see | Details |
|--------------|---------|
| **Summary cards** | Total tokens, total requests, total agent time, active workspace |
| **By provider** | Copilot, Cursor, Claude, Devin, Kiro — requests, tokens (total and in/out), cumulative duration |
| **Recent turns** | Last messages with timestamp, provider, tokens, duration, and mode (Ask / Agent / Spec+Agent) |

Data is stored in **`.toddspect/usage-stats.json`** (created on first chat). Token counts are **estimates** (~4 characters per token) from prompt and response text, so you can compare providers even when an API does not return official usage headers.

**Actions:** **Refresh** reloads stats from disk; **Reset stats** clears the workspace file (with confirmation).

Use this view to spot which provider you use most, whether Agent mode drives higher token use, and when to switch providers before hitting vendor quotas (for example Copilot HTTP 429).

Pair with **prompt optimization** (below) to reduce tokens before they show up here.

---

## Prompt optimization

Before any provider sees your message, ToddSpect runs a **prompt engineering pipeline** (`optimizeMessagesForRouting`). It is **on by default** for every provider — not Copilot-only.

**Configure:** `Ctrl+Shift+P` → **ToddSpect: Open Configuration** → **Workspace** → *Prompt optimization (token efficiency)*.

### Efficiency (fewer tokens)

| Technique | Effect |
|-----------|--------|
| **History trim** | Keeps the last 24 non-system messages (configurable) — long threads stop growing without bound |
| **Dedupe** | Removes consecutive duplicate user messages |
| **Prune** | Drops empty assistant placeholders |
| **Merge guidance** | One system block instead of stacked duplicates |
| **Context file cap** | Truncates each attached file at 12 000 chars (head + tail preserved) with a clear notice |
| **Normalize** | Strips trailing spaces and excessive blank lines |

### Quality (better answers)

| Technique | Effect |
|-----------|--------|
| **Response contract** | Goal first; bullets for lists; no repeating the question or pasted context verbatim |
| **Code discipline** | Minimal diffs and paths — no full-file dumps unless you ask |
| **Mode hints** | Ask = Q&A; Agent = focused edits; Spec+Agent = specs are authoritative |
| **Agent planning** | Short plan, small steps, self-check before finish (Agent / Spec+Agent) |

Because guidance is **provider-agnostic**, switching from Copilot to Claude or Cursor keeps the same efficiency and quality rules.

**Settings:** `toddspect.promptOptimization.enabled`, `maxContextCharsPerFile`, `maxHistoryMessages`.

Full reference: [docs/prompt-optimization.md](docs/prompt-optimization.md) · Wiki: [Prompt Optimization](https://github.com/nbsjunior/todd/wiki/Prompt-Optimization)

---

## Documentation

| Audience | Start here |
|----------|------------|
| **User Manual** | [docs/user-manual.md](docs/user-manual.md) · [Wiki: User-Manual](https://github.com/nbsjunior/todd/wiki/User-Manual) |
| **Why ToddSpect?** | [docs/why-toddspect.md](docs/why-toddspect.md) · [Wiki: Why ToddSpect](https://github.com/nbsjunior/todd/wiki/Why-ToddSpect) |
| **Wiki (users)** | **[GitHub Wiki](https://github.com/nbsjunior/todd/wiki)** · [Getting Started](https://github.com/nbsjunior/todd/wiki/Getting-Started) |
| **AI assistants** | [AGENTS.md](AGENTS.md) → [docs/ai-reference.md](docs/ai-reference.md) → [docs/code-map.md](docs/code-map.md) |
| **End users** | [docs/starter-kit.md](docs/starter-kit.md) · [docs/user-guide.md](docs/user-guide.md) |
| **Developers** | [docs/README.md](docs/README.md) · [docs/architecture.md](docs/architecture.md) · [docs/ipc-protocol.md](docs/ipc-protocol.md) |

Wiki source is in [`wiki/`](wiki/) — publish with `node scripts/publish-wiki.mjs`.

## Starter Kit (recommended)

**[→ docs/starter-kit.md](docs/starter-kit.md)** — install the `.vsix`, open the extension, configure **GitHub Copilot**, send your first message, and follow the **update flow**.

**[→ docs/dual-mode.md](docs/dual-mode.md)** — choose **VS Code Extension** or **CLI** (same router, same config).

**[→ docs/aidlc-kiro.md](docs/aidlc-kiro.md)** — **Kiro + AWS AI-DLC** (Kiro CLI auto-installed, steering rules, `aidlc-docs/`).

The release `.vsix` includes the **compiled ToddSpect CLI** (`cli/dist/index.js`) — no separate CLI install required.

---

## Installation

### Option A — Install from VSIX (end users)

1. Download `toddspect-vscode-0.1.2.vsix` from the [**Releases**](https://github.com/nbsjunior/todd/releases) page.
2. Open VSCode → `Ctrl+Shift+P` → **Extensions: Install from VSIX...**
3. Select the downloaded file and click **Reload**.
4. Click the **ToddSpect** icon in the Activity Bar → follow [starter-kit.md](docs/starter-kit.md) or [user-manual.md](docs/user-manual.md).

Or from the terminal:.

```bash
code --install-extension toddspect-vscode-0.1.2.vsix
```

> The `.vsix` bundles the **ToddSpect CLI** orchestrator (Copilot-first). Node.js 20+ must be on your `PATH`.

> **[→ Full user guide: docs/user-guide.md](docs/user-guide.md)** — covers agent setup, chat, context, Spec Manager, CLI, and troubleshooting.

### Option B — Build from source (contributors / developers)

**Prerequisites**

| Requirement | Version |
|---|---|
| Node.js | ≥ 20 |
| npm | ≥ 10 |
| VSCode | ≥ 1.85 |

```bash
git clone https://github.com/nbsjunior/todd.git
cd toddspect
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
# → packages/extension/toddspect-vscode-0.1.0.vsix
```

This runs: `build:cli` → `bundle:cli` (copy into extension) → `build:prod` → `vsce package`.

> For the full developer workflow see [docs/getting-started.md](docs/getting-started.md).  
> For end-user onboarding see [docs/starter-kit.md](docs/starter-kit.md).

## Quick Setup (after install)

### 1. Initialize your workspace

Open the project you want to use with ToddSpect, then:

```
Ctrl+Shift+P → ToddSpect: Initialize Workspace
```

This creates `.toddspect/` with example specs and a configuration template.

### 2. Configure an agent

```
Ctrl+Shift+P → ToddSpect: Open Configuration
```

Set an API key for at least one agent. The easiest to start is **GitHub Copilot**:

```jsonc
// settings.json
{ "toddspect.connectors.copilot.token": "ghp_xxxxxxxxxxxxxxxxxxxx" }
```

### 3. Chat

Click the **ToddSpect icon** in the Activity Bar, type a message, press **Enter**.

### 4. Check usage (Spending)

After a few messages:

```
Ctrl+Shift+P → ToddSpect: Open Configuration → Spending
```

You will see request counts and estimated tokens **per provider**, plus a short history of recent turns.

---

## Project Structure

```
toddspect/
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
│       │   │   ├── init.ts            # toddspect init
│       │   │   ├── agentRun.ts        # toddspect agent:run
│       │   │   ├── specParse.ts       # toddspect spec:parse
│       │   │   └── contextBuild.ts    # toddspect context:build
│       │   ├── router/
│       │   │   └── AgentRouter.ts     # Routes to Copilot/Devin/Cursor/Claude/KIRO
│       │   ├── parsers/
│       │   │   ├── specParser.ts      # Markdown + YAML spec parser (Zod)
│       │   │   └── markdownParser.ts  # Remark-based MD parser
│       │   └── mcp/
│       │       └── McpConnection.ts   # MCP SDK client wrapper
│       └── tsup.config.ts
│
├── .toddspect/                    # Workspace config (per project)
│   ├── specs/                   # ToddSpect Skills, Tools, Workflows
│   └── sdd/                     # spec-kit workflow (constitution, features)
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
toddspect init ./my-project

# Run an agent with a one-shot prompt
toddspect agent:run --agent copilot --prompt "Review the auth module for security issues"

# Run with context directories
toddspect agent:run --agent claude --prompt "Refactor for SOLID" --dirs src,lib

# Parse and validate spec files
toddspect spec:parse .toddspect/specs/
toddspect spec:parse .toddspect/specs/skill-code-review.md --output json

# Build a context payload from directories
toddspect context:build --dirs src,docs --output summary
toddspect context:build --dirs src --max-tokens 50000 --output json
```

---

## Spec-Driven Development (SDD)

ToddSpect supports **two complementary SDD layers**:

| Layer | Path | Use case |
|-------|------|----------|
| **ToddSpect specs** | `.toddspect/specs/` | Reusable Skills, Tools, Workflows for chat (`spec+agent`) |
| **spec-kit workflow** | `.toddspect/sdd/` | Product development: constitution → spec → plan → tasks → implement ([GitHub spec-kit](https://github.com/github/spec-kit)) |

Open the **SDD** sidebar tab → **SDD Workflow** to initialize `.toddspect/sdd/`, create a feature, and run each `/speckit.*` step in chat. See **[docs/sdd-speckit.md](docs/sdd-speckit.md)**.

ToddSpect specs use Markdown with YAML frontmatter:

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

Configure connectors in `.toddspect/config.yaml` or VSCode Settings (`Ctrl+Shift+P → ToddSpect: Open Configuration`).

| Agent | Protocol | Config Key | Env Variable |
|---|---|---|---|
| GitHub Copilot | REST / SSE | `toddspect.connectors.copilot.token` | `GITHUB_TOKEN` |
| Devin | REST | `toddspect.connectors.devin.apiKey` | `DEVIN_API_KEY` |
| Cursor AI | OpenAI-compat HTTP | `toddspect.connectors.cursor.endpoint` | `CURSOR_API_KEY` |
| Claude Code | CLI subprocess | `toddspect.connectors.claude.path` | `ANTHROPIC_API_KEY` |
| AWS KIRO | REST | `toddspect.connectors.kiro.endpoint` | `KIRO_API_KEY` |

### MCP Servers

Add MCP servers to `.toddspect/config.yaml`:

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
| **[docs/user-guide.md](docs/user-guide.md)** | Install, configure, and use ToddSpect (full reference) |
| [docs/getting-started.md](docs/getting-started.md) | Developer setup: clone, build, F5 hot-reload |
| [docs/architecture.md](docs/architecture.md) | System design: extension ↔ CLI ↔ agents |
| [docs/ipc-protocol.md](docs/ipc-protocol.md) | stdin/stdout newline-JSON protocol reference |
| [docs/sdd-specs.md](docs/sdd-specs.md) | ToddSpect specs: Skills, Tools, Workflows |
| [docs/sdd-speckit.md](docs/sdd-speckit.md) | spec-kit aligned SDD workflow (`.toddspect/sdd/`) |
| [docs/backlog-features.md](docs/backlog-features.md) | Roadmap features: session, budgets, fan-out, web UI |
| [docs/agent-connectors.md](docs/agent-connectors.md) | Per-agent configuration and protocol details |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to add connectors, commit conventions, PR checklist |

---

## Contributing

We welcome PRs, docs, tests, and new agent connectors. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines, commit conventions, and the connector checklist. Join the discussion on [Issues](https://github.com/nbsjunior/todd/issues) — especially if you have ideas for keeping **everything in one interaction**.

---

## Roadmap

- [x] Session persistence across VSCode restarts — `.toddspect/chat-session.json` ([backlog-features.md](docs/backlog-features.md))
- [x] Token and request usage tracking (Spending tab + `.toddspect/usage-stats.json`)
- [x] Budget alerts and spending limits per provider — `toddspect.spending.*` settings
- [x] Spec auto-discovery — `toddspect spec:discover`
- [x] Multi-agent parallel execution — `toddspect agent:fanout`
- [x] GitHub Actions integration — [docs/github-actions.md](docs/github-actions.md)
- [x] Plugin marketplace (manifest preview) — [docs/plugins.md](docs/plugins.md)
- [x] Web UI for remote instances (MVP) — `toddspect web:serve`
- [x] GitHub spec-kit SDD workflow in UI — `.toddspect/sdd/` + SDD view wizard — [docs/sdd-speckit.md](docs/sdd-speckit.md)

---

## License

MIT © Nelson Borges
