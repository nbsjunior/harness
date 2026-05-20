# User Manual — Harness of AI

> Wiki copy (same content): [User-Manual](https://github.com/nbsjunior/harness/wiki/User-Manual)

**Harness of AI** is a meta-agent orchestrator for VS Code: one sidebar for **Copilot**, **Claude**, **Cursor**, **Devin**, and **Kiro**, with shared file context and Spec-Driven Development (SDD).

**In the app:** `Ctrl+Shift+P` → **Harness of AI: Open User Manual**.

---

## 1. Install

1. Download `harness-vscode-*.vsix` from [Releases](https://github.com/nbsjunior/harness/releases).
2. `Ctrl+Shift+P` → **Extensions: Install from VSIX...**
3. **Developer: Reload Window**
4. Click the **Harness of AI** icon in the Activity Bar.

---

## 2. Welcome & setup wizard

![Welcome screen](images/manual/03-welcome.png)

| Feature | Description |
|---------|-------------|
| Unified chat | All major coding agents in one panel |
| Shared context | Attach files once; any provider on the next message |
| Specs (SDD) | Versioned workflows in `.harness/specs/` |
| MCP | External tool servers |

The setup wizard ends with the **User Manual** screen before you finish.

---

## 3. Chat & shared context

![Chat with context](images/manual/04-chat-context.png)

- Right-click → **Add to Harness of AI Context**
- **+ New chat** / **Clear context** / **Clear Chat & Context**
- Provider pills: **Auto**, Copilot, Claude, Cursor, Devin, Kiro

---

## 4. Configure agents

![Agents tab](images/manual/01-chat-and-config-agents.png)

---

## 5. API servers

![API Servers tab](images/manual/02-config-api-servers.png)

---

## 6. More documentation

- [starter-kit.md](starter-kit.md) — quick install
- [user-guide.md](user-guide.md) — full reference
- [why-harness.md](why-harness.md) — benefits of a single interaction model
