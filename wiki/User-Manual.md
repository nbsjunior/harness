<p align="center">
  <img src="images/harness-icon.png" alt="Harness of AI logo" width="80" />
</p>

# User Manual — Harness of AI

**Harness of AI** is a meta-agent orchestrator for VS Code: one sidebar for **Copilot**, **Claude**, **Cursor**, **Devin**, and **Kiro**, with shared file context and Spec-Driven Development (SDD).

> **In the app:** `Ctrl+Shift+P` → **Harness of AI: Open User Manual** (dedicated editor tab).

---

## 1. Install

1. Download `harness-vscode-*.vsix` from [Releases](https://github.com/nbsjunior/harness/releases).
2. `Ctrl+Shift+P` → **Extensions: Install from VSIX...**
3. **Developer: Reload Window**
4. Click the **Harness of AI** icon (fox) in the Activity Bar.

---

## 2. Welcome & setup wizard

On first configuration, the welcome screen summarizes what you get in **one place**:

| Feature | Description |
|---------|-------------|
| Unified chat | Copilot, Claude, Devin, Cursor, and Kiro in the same panel |
| Shared context | Right-click → **Add to Harness of AI Context** |
| Specs (SDD) | Skills, Tools, and Workflows in `.harness/specs/` |
| MCP | External tool servers |

Click **Get started →** to configure agents, or **Skip** and configure later. The setup wizard ends with the **User Manual** step before you finish.

---

## 3. Chat & shared context

Everything happens in one interaction surface — no copy-paste between tools:

- **Explorer** or editor → right-click → **Add to Harness of AI Context**
- File chips appear above the composer; the **same context** is sent to whichever provider you pick next
- **+ New chat** — new thread, keeps context
- **Clear context** — removes file chips only
- View title → **Clear Chat & Context** — full reset

**Providers:** Auto, Copilot, Claude, Cursor, Devin, Kiro.  
**Copilot modes:** Ask | Agent | Spec+Agent.

---

## 4. Configure agents

Open **Harness of AI: Open Configuration** → **Agents** tab. Each card shows the provider name, a short description, and **Not configured** until you add credentials.

Use **Configure** on each agent, paste the API key or token, then **Test Connection**. Tokens are stored in VS Code Secret Storage (never in plain-text settings).

| Agent | Typical use |
|-------|-------------|
| GitHub Copilot | Code review and generation via GitHub |
| Claude Code | Large context and complex reasoning |
| Devin | Autonomous engineering tasks |
| Cursor AI | Cloud Agents API (`api.cursor.com`) |
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
| **Workspace** | Default workspace path, default agent, prompt optimization |
| **Spending** | Token and request usage per provider |

---

## 7. Commands

| Command | Purpose |
|---------|---------|
| `Harness of AI: Open User Manual` | This guide (dedicated tab) |
| `Harness of AI: Open Configuration` | Agents, MCP, workspace, spending |
| `Harness of AI: Initialize Workspace` | Create `.harness/` |
| `Harness of AI: Check getGoat` | Agent diagnostics |

---

## 8. Help

- [Troubleshooting](Troubleshooting)
- [Auto Routing](Auto-Routing)
- [Getting Started](Getting-Started)

Repository: [github.com/nbsjunior/harness](https://github.com/nbsjunior/harness)
