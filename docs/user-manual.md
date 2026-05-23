<p align="center">
  <img src="images/toddspect-icon.png" alt="ToddSpect logo" width="80" />
</p>

# User Manual — ToddSpect

> Wiki copy (same content): [User-Manual](https://github.com/nbsjunior/todd/wiki/User-Manual)

**ToddSpect** is a meta-agent orchestrator for VS Code: one sidebar for **Copilot**, **Claude**, **Cursor**, **Devin**, and **Kiro**, with shared file context and Spec-Driven Development (SDD).

**In the app:** `Ctrl+Shift+P` → **ToddSpect: Open User Manual**.

---

## 1. Install

1. Download `toddspect-vscode-*.vsix` from [Releases](https://github.com/nbsjunior/todd/releases).
2. `Ctrl+Shift+P` → **Extensions: Install from VSIX...**
3. **Developer: Reload Window**
4. Click the **ToddSpect** icon in the Activity Bar.

---

## 2. Welcome & setup wizard

The welcome screen lists unified chat, shared context, specs (SDD), and MCP. Click **Get started →** to configure agents, or **Skip** for later. The wizard ends with the **User Manual** step before setup completes.

| Feature | Description |
|---------|-------------|
| Unified chat | All major coding agents in one panel |
| Shared context | Attach files once; any provider on the next message |
| Specs (SDD) | Versioned workflows in `.toddspect/specs/` |
| MCP | External tool servers |

---

## 3. Chat & shared context

By default ToddSpect attaches:

- Files you add with **Add to ToddSpect Context**
- **Open editor tabs** (`toddspect.context.includeOpenEditors`, default on)
- The **workspace folder** (`toddspect.context.includeWorkspaceRoot`, default on) — scanned as text files (depth/limits apply)

You can turn auto-attach off in VS Code settings under **ToddSpect → Context**.

Manual chips are still useful to focus on a subdirectory or specific files.

- Right-click → **Add to ToddSpect Context**
- **+ New chat** / **Clear context** / **Clear Chat & Context**
- Provider pills: **Auto**, Copilot, Claude, Cursor, Devin, Kiro

### Modes and local file edits

| Mode | Copilot | Cursor |
|------|---------|--------|
| **Ask** | Chat only (Copilot API) | **Cloud** agent (plan) — remote |
| **Agent** | Local workspace via Copilot tool loop | **Local** via **Cursor SDK** when API key is set (default `auto`) |
| **Spec+Agent** | Like Agent + active specs | Like Agent + specs |

**Copilot Agent** uses ToddSpect tools (`read_file`, `write_file`, …) against `TODDSPECT_WORKSPACE` through the GitHub Copilot API (requires `gh auth login` with `copilot` scope).

**Cursor Agent** (with a **Cursor API key**) uses `@cursor/sdk` **local runtime** to edit files in your open VS Code folder — **no Copilot quota**. **Live Edits** shows each change. See [cursor-agent.md](cursor-agent.md).

Setting **`toddspect.cursor.agentExecution`**: `auto` | `local` | `cloud`. Use `cloud` only if you want remote Cursor Cloud (no local file edits).

For GitHub with Copilot Agent: `run_git` / `run_gh` tools (needs `gh auth login` for `gh`).

---

## 4. Configure agents

**ToddSpect: Open Configuration** → **Agents** → **Configure** each provider → **Test Connection**.

**Workspace** tab — **Prompt optimization** (on by default): trims history, dedupes messages, caps context file size, and injects quality rules so prompts use fewer tokens and get more focused answers on every provider. See [prompt-optimization.md](prompt-optimization.md).

**Spending** tab — estimated requests and tokens per provider after each chat turn (`.toddspect/usage-stats.json`).

---

## 5. API servers

Built-in endpoints for Copilot, Devin, and Cursor; optional custom OpenAI-compatible servers via **+ Add API server**.

---

## 6. More documentation

- [starter-kit.md](starter-kit.md) — quick install
- [user-guide.md](user-guide.md) — full reference
- [why-toddspect.md](why-toddspect.md) — benefits of a single interaction model
- [prompt-optimization.md](prompt-optimization.md) — efficiency and quality pipeline
