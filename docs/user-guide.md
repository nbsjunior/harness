# Harness — User Guide

> Complete guide to installing, configuring, and using Harness in VSCode.

---

## Table of Contents

1. [What is Harness?](#1-what-is-harness)
2. [Requirements](#2-requirements)
3. [Installation](#3-installation)
3b. [Starter Kit (quick path)](#starter-kit-quick-path)
4. [First-time setup](#4-first-time-setup)
5. [Configuring agents](#5-configuring-agents)
6. [Using the Chat](#6-using-the-chat)
7. [Adding context](#7-adding-context)
8. [Spec Manager](#8-spec-manager)
9. [Agent Menu](#9-agent-menu)
10. [Configuration Panel](#10-configuration-panel)
11. [Standalone CLI](#11-standalone-cli)
12. [Keyboard shortcuts](#12-keyboard-shortcuts)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. What is Harness?

Harness is a VSCode extension that works as a **Meta-Agent Orchestrator**. Its main advantage: you stay in **one IDE** and reuse **multiple AI providers** (Copilot, Claude, Cursor, Devin, Kiro) without opening a different editor for each vendor.

You also get **Spec-Driven Development (SDD)** and **context engineering** in the **same** chat:

- **SDD** — define behaviour in `.harness/specs/` and run **Spec+Agent** mode to inject specs into the prompt.
- **Context** — attach files/folders once; the same context is sent to **whichever provider** you pick next.

You write your request once; Harness routes it to the agent you choose (or **Auto**), with your selected files and active specs included.

**[→ Why Harness (detailed)](why-harness.md)**

```
┌─────────────────────────────────────────────────┐
│                  You (VSCode)                    │
│  Type a message  →  Add context  →  Pick agent  │
└────────────────────────┬────────────────────────┘
                         │
               Harness Extension
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

1. Download `harness-vscode-0.1.0.vsix` from the [Releases page](https://github.com/nbsjunior/harness/releases).
2. In VSCode, open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P` on macOS).
3. Run **Extensions: Install from VSIX...**
4. Select the downloaded `.vsix` file.
5. Click **Reload** when prompted.

You can also install from the terminal:

```bash
code --install-extension harness-vscode-0.1.0.vsix
```

### Option B — Build from source (developers)

```bash
git clone https://github.com/nbsjunior/harness.git
cd harness
npm install
npm run build:cli          # build the CLI daemon
cd packages/extension
npm run package            # generates harness-vscode-*.vsix
code --install-extension harness-vscode-*.vsix
```

> For development mode (F5 hot-reload), see [getting-started.md](getting-started.md).

---

## 4. First-time setup

After installing, you'll see the **Harness icon** (hexagon) in the VSCode Activity Bar on the left.

### 4.1 CLI daemon (bundled in the extension)

When you install from the official `.vsix`, the **Harness CLI is already compiled** inside the extension:

```
extensions/harness-ai.harness-vscode-0.1.0/cli/dist/index.js
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
  "harness.cliPath": "C:/path/to/harness/packages/cli/dist/index.js"
}
```

### 4.2 Initialize your workspace

Open the project folder you want to use Harness with, then:

```
Ctrl+Shift+P → Harness: Initialize Workspace
```

This creates a `.harness/` directory in your project root:

```
your-project/
└── .harness/
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
Ctrl+Shift+P → Harness: Open Configuration
```

Fill in the API key for the agent(s) you want to use and click **Save**.

### 5.2 Via VSCode settings

Open `File → Preferences → Settings`, search for `harness`, or edit `settings.json` directly:

```jsonc
{
  // GitHub Copilot (fine-grained token with 'copilot' scope)
  "harness.connectors.copilot.token": "ghp_xxxxxxxxxxxxxxxxxxxx",
  "harness.connectors.copilot.endpoint": "https://api.githubcopilot.com",

  // Anthropic Claude Code
  "harness.connectors.claude.apiKey": "sk-ant-xxxxxxxxxxxxxxxxxxxx",
  "harness.connectors.claude.model": "claude-opus-4-5",

  // AWS KIRO
  "harness.connectors.kiro.region": "us-east-1",
  "harness.connectors.kiro.modelId": "amazon.kiro-v1",

  // Devin (Cognition AI)
  "harness.connectors.devin.apiKey": "devin-xxxxxxxxxxxxxxxxxxxx",

  // Cursor AI
  "harness.connectors.cursor.apiKey": "cursor-xxxxxxxxxxxxxxxxxxxx"
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

Click the **Harness icon** in the Activity Bar to open the Chat sidebar.

```
┌──────────────────────────────────────────┐
│ 🔷 Harness Chat                    ⚙ ⋮  │
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

Context tells Harness which files the agent should read before answering.

### Via the Explorer (recommended)

1. Right-click any **file** or **folder** in the Explorer sidebar
2. Click **Add to Harness Context**
3. The file/folder label appears in the chat input bar

### Via the Command Palette

```
Ctrl+Shift+P → Harness: Add Current File to Context
```

### Managing context

- **Remove an item:** click the ✕ next to its label in the chat input bar
- **Clear all context:** `Ctrl+Shift+P → Harness: Clear Context`
- **View current context:** hover over the context chips in the input bar

> **How context works internally:** Harness sends the selected absolute paths to the CLI daemon, which reads the files, estimates token counts, and includes the content in the system prompt before calling the AI agent. Files are never read by the Extension Host — only the CLI daemon accesses the file system.

---

## 8. Spec Manager

The **Spec Manager** lets you define reusable **Skills**, **Tools**, and **Workflows** that guide how the AI agent responds.

### Opening the Spec Manager

Click the **Harness icon** → switch to the **Specs** tab, or:

```
Ctrl+Shift+P → Harness: Open Spec Manager
```

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

The file is saved to `.harness/specs/<name>.md` in your workspace.

### Using a spec in the chat

Active specs in `.harness/specs/` are automatically picked up by the CLI. When you select an agent that supports a spec's `agents` list, the spec's instructions are injected into the system prompt.

You can also explicitly reference a spec:

```
/skill security-review Review the auth module
/workflow refactor-solid Refactor the PaymentService class
```

---

## 9. Agent Menu

Switch between agents without leaving the conversation.

### Open the Agent Menu

```
Ctrl+Shift+P → Harness: Select Agent
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

## 10. Configuration Panel

```
Ctrl+Shift+P → Harness: Open Configuration
```

The panel has three sections:

### Connectors

Configure API keys and endpoints for each agent. Values are stored in VSCode's secret storage (not in plain text on disk).

### CLI

| Setting | Key | Default | Description |
|---|---|---|---|
| CLI path | `harness.cliPath` | auto-detect | Absolute path to `packages/cli/dist/index.js` |
| Workspace specs dir | `harness.specsDir` | `.harness/specs` | Where to look for SDD spec files |
| Timeout | `harness.cliTimeout` | `30000` | ms before a CLI request times out |

### MCP Servers

Add external Model Context Protocol servers:

```jsonc
// settings.json
{
  "harness.mcpServers": [
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

## 11. Standalone CLI

The Harness CLI can be used independently of the VSCode extension — useful in CI/CD pipelines, terminal workflows, or scripting.

### Installation

```bash
cd packages/cli
npm link        # or: npm install -g .
```

### Commands

#### `harness init`

Initialize `.harness/` in the current directory:

```bash
harness init
harness init --dir ./my-project
```

#### `harness agent:run`

One-shot agent call — sends a prompt and exits:

```bash
harness agent:run \
  --agent copilot \
  --prompt "Review this code for security issues" \
  --dirs ./src ./lib \
  --specs ./.harness/specs
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

#### `harness spec:parse`

Parse and validate spec files in a directory:

```bash
harness spec:parse .harness/specs/
harness spec:parse .harness/specs/skill-code-review.md --output yaml
```

#### `harness context:build`

Read files from directories and output a consolidated context:

```bash
harness context:build ./src ./lib --output json
harness context:build ./src --format prompt
```

### Scripting example

```bash
#!/bin/bash
# pr-review.sh — run a security review on changed files

CHANGED=$(git diff --name-only HEAD~1)
echo "$CHANGED" | xargs -I{} harness agent:run \
  --agent claude \
  --prompt "Security review" \
  --dirs {} \
  --specs .harness/specs | jq .response
```

---

## 12. Keyboard shortcuts

| Action | Windows / Linux | macOS |
|---|---|---|
| Focus Harness Chat | `Ctrl+Shift+H` | `Cmd+Shift+H` |
| Send message | `Enter` | `Enter` |
| New line in input | `Shift+Enter` | `Shift+Enter` |
| Select agent | `Ctrl+Shift+P` → *Harness: Select Agent* | same |
| Add file to context | Right-click → *Add to Harness Context* | same |
| Clear context | `Ctrl+Shift+P` → *Harness: Clear Context* | same |
| Initialize workspace | `Ctrl+Shift+P` → *Harness: Initialize Workspace* | same |
| Open configuration | `Ctrl+Shift+P` → *Harness: Open Configuration* | same |

---

## 13. Troubleshooting

### "Harness CLI not found"

The extension cannot locate the CLI daemon.

**Fix:**

```bash
# 1. Build the CLI
cd packages/cli && npm run build

# 2. Point the extension to it
# settings.json:
{ "harness.cliPath": "/absolute/path/to/harness/packages/cli/dist/index.js" }
```

---

### "CLI ping timed out"

The daemon started but didn't respond to the startup handshake.

**Diagnose:**

1. Open the Harness output channel: `View → Output → Harness`
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

- Increase the model's `maxTokens` in `.harness/config.yaml`
- Your context may be too large — remove some files from the context selector
- Check the agent's rate limits or quota in their respective dashboards

---

### Extension is not activating

Check the VSCode version (`Help → About`). Harness requires VSCode ≥ 1.85.

Verify the extension is enabled:
```
Ctrl+Shift+P → Extensions: Show Installed Extensions → search "Harness"
```

---

### Debug logging

Enable verbose output for the CLI daemon:

```jsonc
// settings.json
{
  "harness.logLevel": "debug"
}
```

All CLI stderr output appears in the **Harness** output channel (`View → Output → Harness`).

---

## Further reading

| Document | Description |
|---|---|
| [getting-started.md](getting-started.md) | Developer setup: clone, build, and run with F5 |
| [architecture.md](architecture.md) | How the extension, CLI, and agents fit together |
| [sdd-specs.md](sdd-specs.md) | Deep dive into Spec-Driven Development |
| [agent-connectors.md](agent-connectors.md) | All configuration options per agent |
| [ipc-protocol.md](ipc-protocol.md) | The stdin/stdout JSON protocol between extension and CLI |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | How to add new agent connectors or fix bugs |
