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

By default Harness attaches:

- Files you add with **Add to Harness of AI Context**
- **Open editor tabs** (`harness.context.includeOpenEditors`, default on)
- The **workspace folder** (`harness.context.includeWorkspaceRoot`, default on) — scanned as text files (depth/limits apply)

You can turn auto-attach off in VS Code settings under **Harness of AI → Context**.

Manual chips are still useful to focus on a subdirectory or specific files.

- Right-click → **Add to Harness of AI Context**
- **+ New chat** / **Clear context** / **Clear Chat & Context**
- Provider pills: **Auto**, Copilot, Claude, Cursor, Devin, Kiro

### Modes and local file edits

| Mode | Copilot | Cursor |
|------|---------|--------|
| **Ask** | Chat only | Cloud agent (plan) — remote; uses full context in prompt |
| **Agent** | Reads/writes files **in your VS Code workspace** | Same local tools as Copilot Agent (not Cursor Cloud) |
| **Spec+Agent** | Like Agent + active specs | Like Agent + specs |

**Agent** and **Spec+Agent** use Harness **local workspace tools** (`read_file`, `write_file`, `list_files`, `search_in_files`, `run_git`, `run_gh`) against `HARNESS_WORKSPACE`. Changes appear in the IDE. Cursor Cloud API does not write to your disk — that is why Cursor + Agent routes through local tools (requires GitHub Copilot configured).

For GitHub: use Agent mode and the model can call `run_git` / `run_gh` (needs `gh auth login` for `gh`).

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
