<p align="center">
  <img src="images/harness-icon.png" alt="Harness of AI logo" width="80" />
</p>

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

The welcome screen lists unified chat, shared context, specs (SDD), and MCP. Click **Get started →** to configure agents, or **Skip** for later. The wizard ends with the **User Manual** step before setup completes.

| Feature | Description |
|---------|-------------|
| Unified chat | All major coding agents in one panel |
| Shared context | Attach files once; any provider on the next message |
| Specs (SDD) | Versioned workflows in `.harness/specs/` |
| MCP | External tool servers |

---

## 3. Chat & shared context

- Right-click → **Add to Harness of AI Context**
- **+ New chat** / **Clear context** / **Clear Chat & Context**
- Provider pills: **Auto**, Copilot, Claude, Cursor, Devin, Kiro

---

## 4. Configure agents

**Harness of AI: Open Configuration** → **Agents** → **Configure** each provider → **Test Connection**.

---

## 5. API servers

Built-in endpoints for Copilot, Devin, and Cursor; optional custom OpenAI-compatible servers via **+ Add API server**.

---

## 6. More documentation

- [starter-kit.md](starter-kit.md) — quick install
- [user-guide.md](user-guide.md) — full reference
- [why-harness.md](why-harness.md) — benefits of a single interaction model
