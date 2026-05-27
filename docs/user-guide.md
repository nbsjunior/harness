# Todd of AIDLC — User Guide

> Complete guide to installing, configuring, and using Todd of AIDLC in VSCode.

---

## Table of Contents

1. [What is Todd of AIDLC?](#1-what-is-toddspect)
2. [Requirements](#2-requirements)
3. [Installation](#3-installation)
3b. [Starter Kit (quick path)](#starter-kit-quick-path)
4. [First-time setup](#4-first-time-setup)
5. [Configuring agents](#5-configuring-agents)
6. [Using the Chat](#6-using-the-chat)
7. [Adding context](#7-adding-context)
8. [SDD & Spec Manager](#8-sdd--spec-manager)
9. [SDD Workflow (spec-kit)](#9-sdd-workflow-spec-kit)
10. [Agent Menu](#10-agent-menu)
11. [Configuration Panel](#11-configuration-panel)
12. [Standalone CLI](#12-standalone-cli)
13. [Keyboard shortcuts](#13-keyboard-shortcuts)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. What is Todd of AIDLC?

Todd of AIDLC is a VSCode extension that works as a **Meta-Agent Orchestrator**. Its main advantage: you stay in **one IDE** and reuse **multiple AI providers** (Copilot, Claude, Cursor, Devin, Kiro) without opening a different editor for each vendor.

You also get **Spec-Driven Development (SDD)** and **context engineering** in the **same** chat:

- **SDD** — define behaviour in `.toddspect/specs/` and run **Spec+Agent** mode to inject specs into the prompt.
- **Context** — attach files/folders once; the same context is sent to **whichever provider** you pick next.

You write your request once; Todd of AIDLC routes it to the agent you choose (or **Auto**), with your selected files and active specs included.

**[→ Why Todd of AIDLC (detailed)](why-todd-of-aidlc.md)**

```
┌─────────────────────────────────────────────────┐
│                  You (VSCode)                    │
│  Type a message  →  Add context  →  Pick agent  │
└────────────────────────┬────────────────────────┘
                         │
               Todd of AIDLC Extension
                         │
             Node.js CLI daemon (IPC)
                         │
     ┌───────────────────┼───────────────────┐
     ▼                   ▼                   ▼
GitHub Copilot       Claude Code         AWS KIRO
   Devin            Cursor AI           (+ MCP servers)
```

The heavy lifting (reading files, parsing specs, calling APIs) happens inside the CLI daemon, keeping the VSCode UI fast and responsive.

---

## 2. Requirements

| Requirement | Minimum | How to check |
|---|---|---|
| VSCode | 1.85 | `Help → About` |
| Node.js | 20 | `node --version` |
| npm | 10 | `npm --version` |

> **Why Node.js?** The extension UI loads in VSCode, but agent calls run in a **bundled CLI** process (`cli/dist/index.js` inside the extension folder). Node.js 20+ must be on your `PATH`.

---

## Starter Kit (quick path)

For a guided flow (install `.vsix`, open extension, configure **GitHub Copilot**, first chat, and how to **update**), see **[starter-kit.md](starter-kit.md)**.

---

## 3. Installation

### Option A — Install from VSIX (recommended)

1. Download `toddspect-vscode-0.1.0.vsix` from the [Releases page](https://github.com/nbsjunior/todd/releases).
2. In VSCode, open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P` on macOS).
3. Run **Extensions: Install from VSIX...**
4. Select the downloaded `.vsix` file.
5. Click **Reload** when prompted.

You can also install from the terminal:

```bash
code --install-extension toddspect-vscode-0.1.0.vsix
```

### Option B — Build from source (developers)

```bash
git clone https://github.com/nbsjunior/todd.git
cd toddspect
npm install
npm run build:cli          # build the CLI daemon
cd packages/extension
npm run package            # generates toddspect-vscode-*.vsix
code --install-extension toddspect-vscode-*.vsix
```

> For development mode (F5 hot-reload), see [getting-started.md](getting-started.md).

---

## 4. First-time setup

After installing, you'll see the **Todd of AIDLC icon** (hexagon) in the VSCode Activity Bar on the left.

### 4.1 CLI daemon (bundled in the extension)

When you install from the official `.vsix`, the **Todd of AIDLC CLI is already compiled** inside the extension:

```
extensions/ToDD-HarnessofAI.toddspect-vscode-0.1.0/cli/dist/index.js
```

No `npm link` or manual build is required. The extension starts it automatically with:

```text
node <extension>/cli/dist/index.js --ipc
```

**Developers only** (monorepo checkout):

```bash
npm run build:cli
npm run bundle:cli    # copies CLI into packages/extension/cli/dist/
```

Override path only if needed:

```json
{
  "toddspect.cliPath": "C:/path/to/toddspect/packages/cli/dist/index.js"
}
```

### 4.2 Initialize your workspace

Open the project folder you want to use Todd of AIDLC with, then:

```
Ctrl+Shift+P → Todd of AIDLC: Initialize Workspace
```

This creates a `.toddspect/` directory in your project root:

```
your-project/
└── .toddspect/
    ├── config.yaml                    # agent settings (safe to commit)
    └── specs/
        ├── skill-code-review.md       # example skill spec
        └── workflow-refactor-solid.md # example workflow spec
```

---

## 5. Configuring agents

You must configure at least one agent before chatting. There are three ways to set credentials:

### 5.1 Via the Configuration Panel (recommended)

```
Ctrl+Shift+P → Todd of AIDLC: Open Configuration
```

Fill in the API key for the agent(s) you want to use and click **Save**.

### 5.2 Via VSCode settings

Open `File → Preferences → Settings`, search for `todd`, or edit `settings.json` directly:

```jsonc
{
  // GitHub Copilot (fine-grained token with 'copilot' scope)
  "toddspect.connectors.copilot.token": "ghp_xxxxxxxxxxxxxxxxxxxx",
  "toddspect.connectors.copilot.endpoint": "https://api.githubcopilot.com",

  // Anthropic Claude Code
  "toddspect.connectors.claude.apiKey": "sk-ant-xxxxxxxxxxxxxxxxxxxx",
  "toddspect.connectors.claude.model": "claude-opus-4-5",

  // AWS KIRO
  "toddspect.connectors.kiro.region": "us-east-1",
  "toddspect.connectors.kiro.modelId": "amazon.kiro-v1",

  // Devin (Cognition AI)
  "toddspect.connectors.devin.apiKey": "devin-xxxxxxxxxxxxxxxxxxxx",

  // Cursor AI
  "toddspect.connectors.cursor.apiKey": "cursor-xxxxxxxxxxxxxxxxxxxx"
}
```

### 5.3 Via environment variables

Set these before launching VSCode so secrets are never written to disk:

```bash
# macOS / Linux
export GITHUB_TOKEN=ghp_xxxx
export ANTHROPIC_API_KEY=sk-ant-xxxx
export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=...

code /path/to/your-project
```

```powershell
# Windows PowerShell
$env:GITHUB_TOKEN = "ghp_xxxx"
$env:ANTHROPIC_API_KEY = "sk-ant-xxxx"
code C:\path\to\your-project
```

### 5.4 Agent quick-reference

| Agent | What you need | Notes |
|---|---|---|
| **GitHub Copilot** | GitHub token (PAT) with `copilot` scope | Cheapest to start |
| **Claude Code** | Anthropic API key | Best for large context |
| **AWS KIRO** | AWS credentials + region | AWS Bedrock required |
| **Devin** | Cognition AI API key | Autonomous task execution |
| **Cursor AI** | Cursor API key | Pair with Cursor IDE |

---

## 6. Using the Chat

Click the **Todd of AIDLC icon** in the Activity Bar to open the Chat sidebar.

```
┌──────────────────────────────────────────┐
│ 🔷 Todd of AIDLC Chat                    ⚙ ⋮  │
├──────────────────────────────────────────┤
│                                          │
│  🤖  How can I help you today?           │
│                                          │
│  You  Review the authentication module   │
│       for security vulnerabilities       │
│                                          │
│  🤖  I found 3 issues in auth.ts:        │
│       1. JWT secret is hardcoded...      │
│       [streaming response...]            │
│                                          │
├──────────────────────────────────────────┤
│ [Type your message...      ] [Send ⏎]   │
│  📎 context: src/auth.ts  ✕             │
└──────────────────────────────────────────┘
```

### Sending messages

- Type your message in the input at the bottom
- Press **Enter** or click **Send** to submit
- Use **Shift+Enter** for a new line without sending
- Responses stream in real-time

### Message history

The conversation persists for the current VSCode session. Use the **Clear chat** button (trash icon) to start a new conversation.

### Example prompts

```
Review the selected files for security vulnerabilities

Generate unit tests for the UserService class

Refactor this module to use the Repository pattern

Explain what this regex does: /^(?=.*[A-Z])(?=.*\d).{8,}$/

Create a SOLID-compliant architecture for an e-commerce cart

Fix the TypeScript errors in the current context
```

---

## 7. Adding context

Context tells Todd of AIDLC which files the agent should read before answering.

### Via the Explorer (recommended)

1. Right-click any **file** or **folder** in the Explorer sidebar
2. Click **Add to Todd of AIDLC Context**
3. The file/folder label appears in the chat input bar

### Via the Command Palette

```
Ctrl+Shift+P → Todd of AIDLC: Add Current File to Context
```

### Managing context

- **Remove an item:** click the ✕ next to its label in the chat input bar
- **Clear all context:** `Ctrl+Shift+P → Todd of AIDLC: Clear Context`
- **View current context:** hover over the context chips in the input bar

> **How context works internally:** Todd of AIDLC sends the selected absolute paths to the CLI daemon, which reads the files, estimates token counts, and includes the content in the system prompt before calling the AI agent. Files are never read by the Extension Host — only the CLI daemon accesses the file system.

---

## 8. SDD & Spec Manager

The **SDD** sidebar view has two tabs:

| Tab | Purpose |
|-----|---------|
| **SDD Workflow** | Full [GitHub spec-kit](https://github.com/github/spec-kit) pipeline — see [§9](#9-sdd-workflow-spec-kit) |
| **Specs** | Todd of AIDLC Skills, Tools, and Workflows in `.toddspect/specs/` |

### Opening SDD

Click the **Todd of AIDLC icon** → **SDD** view, or:

```
Ctrl+Shift+P → Todd of AIDLC: Open Spec Manager
```

### Specs tab — Todd of AIDLC specs

Define reusable **Skills**, **Tools**, and **Workflows** that guide how the AI agent responds.

### Understanding specs

| Type | Purpose | Example |
|---|---|---|
| **Skill** | Agent capability definition | "You are an expert in security reviews" |
| **Tool** | External tool or API the agent can call | Jira ticket creator, Slack notifier |
| **Workflow** | Step-by-step process definition | SOLID refactoring in 4 steps |

### Spec file format (Markdown with YAML frontmatter)

```markdown
---
kind: skill
name: security-review
version: "1.0.0"
description: >
  Perform OWASP-based security reviews focusing on injection,
  authentication and data exposure vulnerabilities.
tags: [security, owasp, review]
agents: [copilot, claude]
---

## Instructions

When performing a security review:

1. Check for SQL injection and XSS vulnerabilities
2. Verify JWT/session token handling
3. Look for secrets hardcoded in source files
4. Validate input sanitization on all user-facing endpoints

## Output format

Return findings as a structured list with severity (Critical / High / Medium / Low).
```

### Creating a new spec

1. Click **+ New Spec** in the Spec Manager panel
2. Fill in the form fields (kind, name, description, tags)
3. Add instructions in the Markdown body
4. Click **Save Spec**

The file is saved to `.toddspect/specs/<name>.md` in your workspace.

### Using a spec in the chat

Active specs in `.toddspect/specs/` are automatically picked up by the CLI. When you select an agent that supports a spec's `agents` list, the spec's instructions are injected into the system prompt.

You can also explicitly reference a spec:

```
/skill security-review Review the auth module
/workflow refactor-solid Refactor the PaymentService class
```

---

## 9. SDD Workflow (spec-kit)

The **SDD Workflow** tab implements the spec-kit development flow inside Todd of AIDLC — without leaving VS Code.

### Quick start

1. Open **SDD** → **SDD Workflow**
2. Click **Initialize SDD** — creates `.toddspect/sdd/` (constitution, `specs/`, templates)
3. Click **+ New feature** — enter name and optional description → folder `001-<slug>/`
4. For each step (`/speckit.constitution` … `/speckit.implement`):
   - **Scaffold** — create or refresh the artifact template
   - **Open** — edit in VS Code
   - **Run in chat** — sends the spec-kit prompt with SDD files in context (**Spec+Agent** mode)

### Workflow steps

| Step | spec-kit command | Artifact |
|------|------------------|----------|
| Constitution | `/speckit.constitution` | `memory/constitution.md` |
| Specify | `/speckit.specify` | `specs/<id>/spec.md` |
| Clarify | `/speckit.clarify` | `clarifications.md` (optional) |
| Plan | `/speckit.plan` | `plan.md` |
| Tasks | `/speckit.tasks` | `tasks.md` |
| Analyze | `/speckit.analyze` | prompt-only (optional) |
| Checklist | `/speckit.checklist` | `checklist.md` (optional) |
| Implement | `/speckit.implement` | executes via Agent |
| Tasks → Issues | `/speckit.taskstoissues` | GitHub issues (optional) |

Use **Notes for next step** to append context before **Run in chat**.

**Discover** runs repo-based suggestions for Todd of AIDLC specs (`todd spec:discover`).

Full reference: **[sdd-speckit.md](sdd-speckit.md)**.

---

## 10. Agent Menu

Switch between agents without leaving the conversation.

### Open the Agent Menu

```
Ctrl+Shift+P → Todd of AIDLC: Select Agent
```

Or click the agent badge at the top-right of the Chat panel.

A **Quick Pick** dropdown lists all configured agents:

```
> Select Agent
  ● GitHub Copilot    (active)
  ○ Claude Code
  ○ AWS KIRO
  ○ Devin
  ○ Cursor AI
```

The selected agent applies to all subsequent messages in the session.

---

## 11. Configuration Panel

```
Ctrl+Shift+P → Todd of AIDLC: Open Configuration
```

The panel has three sections:

### Connectors

Configure API keys and endpoints for each agent. Values are stored in VSCode's secret storage (not in plain text on disk).

### CLI

| Setting | Key | Default | Description |
|---|---|---|---|
| CLI path | `toddspect.cliPath` | auto-detect | Absolute path to `packages/cli/dist/index.js` |
| Workspace specs dir | `toddspect.specsDir` | `.toddspect/specs` | Where to look for SDD spec files |
| Timeout | `toddspect.cliTimeout` | `30000` | ms before a CLI request times out |

### MCP Servers

Add external Model Context Protocol servers:

```jsonc
// settings.json
{
  "toddspect.mcpServers": [
    {
      "name": "filesystem",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"]
    },
    {
      "name": "github",
      "transport": "http",
      "url": "http://localhost:3100"
    }
  ]
}
```

---

## 12. Standalone CLI

The Todd of AIDLC CLI can be used independently of the VSCode extension — useful in CI/CD pipelines, terminal workflows, or scripting.

### Installation

```bash
cd packages/cli
npm link        # or: npm install -g .
```

### Commands

#### `todd init`

Initialize `.toddspect/` in the current directory:

```bash
todd init
todd init --dir ./my-project
```

#### `todd agent:run`

One-shot agent call — sends a prompt and exits:

```bash
todd agent:run \
  --agent copilot \
  --prompt "Review this code for security issues" \
  --dirs ./src ./lib \
  --specs ./.toddspect/specs
```

Output (JSON, stdout):

```json
{
  "agent": "copilot",
  "model": "gpt-4o",
  "response": "I found the following security issues...",
  "tokensUsed": 1842
}
```

#### `todd spec:parse`

Parse and validate spec files in a directory:

```bash
todd spec:parse .toddspect/specs/
todd spec:parse .toddspect/specs/skill-code-review.md --output yaml
```

#### `todd context:build`

Read files from directories and output a consolidated context:

```bash
todd context:build ./src ./lib --output json
todd context:build ./src --format prompt
```

### Scripting example

```bash
#!/bin/bash
# pr-review.sh — run a security review on changed files

CHANGED=$(git diff --name-only HEAD~1)
echo "$CHANGED" | xargs -I{} todd agent:run \
  --agent claude \
  --prompt "Security review" \
  --dirs {} \
  --specs .toddspect/specs | jq .response
```

---

## 13. Keyboard shortcuts

| Action | Windows / Linux | macOS |
|---|---|---|
| Focus Todd of AIDLC Chat | `Ctrl+Shift+H` | `Cmd+Shift+H` |
| Send message | `Enter` | `Enter` |
| New line in input | `Shift+Enter` | `Shift+Enter` |
| Select agent | `Ctrl+Shift+P` → *Todd of AIDLC: Select Agent* | same |
| Add file to context | Right-click → *Add to Todd of AIDLC Context* | same |
| Clear context | `Ctrl+Shift+P` → *Todd of AIDLC: Clear Context* | same |
| Initialize workspace | `Ctrl+Shift+P` → *Todd of AIDLC: Initialize Workspace* | same |
| Open configuration | `Ctrl+Shift+P` → *Todd of AIDLC: Open Configuration* | same |

---

## 14. Troubleshooting

### "Todd of AIDLC CLI not found"

The extension cannot locate the CLI daemon.

**Fix:**

```bash
# 1. Build the CLI
cd packages/cli && npm run build

# 2. Point the extension to it
# settings.json:
{ "toddspect.cliPath": "/absolute/path/to/toddspect/packages/cli/dist/index.js" }
```

---

### "CLI ping timed out"

The daemon started but didn't respond to the startup handshake.

**Diagnose:**

1. Open the Todd of AIDLC output channel: `View → Output → Todd of AIDLC`
2. Look for `[cli]` prefixed error lines
3. Test manually:

```bash
echo '{"id":"1","action":"ping","payload":{}}' | node packages/cli/dist/index.js --ipc
# Expected: {"id":"1","action":"pong","payload":{}}
```

---

### "HTTP 401 — unauthorized"

Your API key is missing, expired, or has incorrect permissions.

| Agent | Where to regenerate the key |
|---|---|
| GitHub Copilot | [github.com/settings/tokens](https://github.com/settings/tokens) — needs `copilot` scope |
| Claude Code | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |
| AWS KIRO | AWS IAM Console → Bedrock permissions |
| Devin | [app.devin.ai/settings](https://app.devin.ai/settings) |

---

### Responses are empty or truncated

- Increase the model's `maxTokens` in `.toddspect/config.yaml`
- Your context may be too large — remove some files from the context selector
- Check the agent's rate limits or quota in their respective dashboards

---

### Extension is not activating

Check the VSCode version (`Help → About`). Todd of AIDLC requires VSCode ≥ 1.85.

Verify the extension is enabled:
```
Ctrl+Shift+P → Extensions: Show Installed Extensions → search "Todd of AIDLC"
```

---

### Debug logging

Enable verbose output for the CLI daemon:

```jsonc
// settings.json
{
  "toddspect.logLevel": "debug"
}
```

All CLI stderr output appears in the **Todd of AIDLC** output channel (`View → Output → Todd of AIDLC`).

---

## Further reading

| Document | Description |
|---|---|
| [getting-started.md](getting-started.md) | Developer setup: clone, build, and run with F5 |
| [architecture.md](architecture.md) | How the extension, CLI, and agents fit together |
| [sdd-specs.md](sdd-specs.md) | Todd of AIDLC specs (Skills, Tools, Workflows) |
| [sdd-speckit.md](sdd-speckit.md) | spec-kit SDD workflow in `.toddspect/sdd/` |
| [agent-connectors.md](agent-connectors.md) | All configuration options per agent |
| [ipc-protocol.md](ipc-protocol.md) | The stdin/stdout JSON protocol between extension and CLI |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | How to add new agent connectors or fix bugs |
