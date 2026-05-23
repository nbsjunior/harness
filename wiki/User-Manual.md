<p align="center">
  <img src="images/toddspect-icon.png" alt="ToddSpect logo" width="80" />
</p>

# User Manual — ToddSpect

**ToddSpect** is a meta-agent orchestrator for VS Code: one sidebar for **Copilot**, **Claude**, **Cursor**, **Devin**, and **Kiro**, with shared file context and Spec-Driven Development (SDD).

> **In the app:** `Ctrl+Shift+P` → **ToddSpect: Open User Manual** (dedicated editor tab).

---

## 1. Install

1. Download `toddspect-vscode-*.vsix` from [Releases](https://github.com/nbsjunior/ToddSpect/releases).
2. `Ctrl+Shift+P` → **Extensions: Install from VSIX...**
3. **Developer: Reload Window**
4. Click the **ToddSpect** icon (fox) in the Activity Bar.

---

## 2. Welcome & setup wizard

On first configuration, the welcome screen summarizes what you get in **one place**:

| Feature | Description |
|---------|-------------|
| Unified chat | Copilot, Claude, Devin, Cursor, and Kiro in the same panel |
| Shared context | Right-click → **Add to ToddSpect Context** |
| Specs (SDD) | Skills, Tools, and Workflows in `.toddspect/specs/` |
| MCP | External tool servers |

Click **Get started →** to configure agents, or **Skip** and configure later. The setup wizard ends with the **User Manual** step before you finish.

---

## 3. Chat & shared context

By default ToddSpect attaches: manual context chips, **open editor tabs**, and the **workspace folder** (see settings `toddspect.context.includeOpenEditors` and `toddspect.context.includeWorkspaceRoot`).

- **Explorer** or editor → right-click → **Add to ToddSpect Context**
- The **same context** is sent to whichever provider you pick next
- **+ New chat** / **Clear context** / **Clear Chat & Context**

**Providers:** Auto, Copilot, Claude, Cursor, Devin, Kiro.  
**Modes:** Ask | Agent | Spec+Agent.

### Local edits in VS Code (Agent / Spec+Agent)

| Mode | Copilot | Cursor |
|------|---------|--------|
| **Ask** | Chat | Cursor Cloud (remote) |
| **Agent** | Local read/write in workspace | Local tools (same as Copilot Agent; needs Copilot token) |
| **Spec+Agent** | Local + specs | Local + specs |

**Copilot Agent** uses local tools via the Copilot API (`read_file`, `write_file`, …). **Cursor Agent** (with a Cursor API key) uses the **Cursor SDK** to edit files in your open workspace — no Copilot quota. **Cursor Cloud** (Ask or `agentExecution: cloud`) is remote and does not edit local files. See [cursor-agent.md](../docs/cursor-agent.md).

For GitHub CLI: configure `gh auth login`; Agent mode can call `run_gh`.

---

## 4. Configure agents

Open **ToddSpect: Open Configuration** → **Agents** tab. Each card shows the provider name, a short description, and **Not configured** until you add credentials.

Use **Configure** on each agent, paste the API key or token, then **Test Connection**. Tokens are stored in VS Code Secret Storage (never in plain-text settings).

| Agent | Typical use |
|-------|-------------|
| GitHub Copilot | Code review and generation via GitHub |
| Claude Code | Large context and complex reasoning |
| Devin | Autonomous engineering tasks |
| Cursor AI | SDK local (Agent) or Cloud API (`api.cursor.com`) |
| Kiro (AI-DLC) | Kiro CLI + steering rules in `.kiro/steering/` |

---

## 5. API servers

In configuration, open the **API Servers** tab:

- **Built-in agents** — default endpoints for Copilot, Devin, and Cursor (read-only rows).
- **Custom API servers** — add OpenAI-compatible backends with **+ Add API server** (name, base URL, optional model).

---

## 6. Other configuration tabs

| Tab | Purpose |
|-----|---------|
| **MCP** | Connect Model Context Protocol servers (stdio or HTTP) |
| **Workspace** | Default workspace path, default agent, **prompt optimization** (see below) |
| **Spending** | Token and request usage per provider |

### Prompt optimization (Workspace tab)

Enabled by default. ToddSpect optimizes every outgoing prompt **before** routing:

- **Efficiency** — trims history (24 messages), dedupes repeated user lines, caps context files (12 000 chars), merges duplicate system text
- **Quality** — injects a response contract (goal first, minimal diffs, mode-specific rules for Ask / Agent / Spec+Agent)

Works on **all** providers. Tune via `toddspect.promptOptimization.*` or the checkbox in Workspace.

See [Prompt Optimization](Prompt-Optimization) and use **Spending** to compare estimated tokens over time.

---

## 7. Commands

| Command | Purpose |
|---------|---------|
| `ToddSpect: Open User Manual` | This guide (dedicated tab) |
| `ToddSpect: Open Configuration` | Agents, MCP, workspace, spending |
| `ToddSpect: Initialize Workspace` | Create `.toddspect/` |
| `ToddSpect: Check getGoat` | Agent diagnostics |

---

## 8. Help

- [Troubleshooting](Troubleshooting)
- [Auto Routing](Auto-Routing)
- [Getting Started](Getting-Started)

Repository: [github.com/nbsjunior/ToddSpect](https://github.com/nbsjunior/ToddSpect)
