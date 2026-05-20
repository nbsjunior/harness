# Cursor — Agent mode and local file edits

Harness supports **Cursor** in three interaction modes (shared with Copilot in the chat UI): **Ask**, **Agent**, and **Spec+Agent**.

| Mode | Behaviour | Local VS Code files |
|------|-----------|---------------------|
| **Ask** | Cursor **Cloud** Agents API (plan) | No — remote agent only |
| **Agent** | **Local** by default when a Cursor API key is set | Yes — edits `HARNESS_WORKSPACE` |
| **Spec+Agent** | Like Agent + `.harness/specs/` injected | Yes |

## Local edits (recommended)

When provider is **Cursor** and mode is **Agent** or **Spec+Agent**, Harness uses the **[Cursor TypeScript SDK](https://cursor.com/docs/api/sdk/typescript)** (`@cursor/sdk`) with **local runtime**:

```text
HARNESS_WORKSPACE (your open VS Code folder)
  → Agent.create({ local: { cwd } })
  → agent.send(prompt) → tools run on disk
  → Live Edits + diffs in the extension
```

**Requirements:**

1. **Cursor API key** — [cursor.com/dashboard/integrations](https://cursor.com/dashboard/integrations) or `CURSOR_API_KEY` / `harness.connectors.cursor.apiKey`
2. VS Code setting **`harness.cursor.agentExecution`**: `auto` (default) or `local`

**Does not use GitHub Copilot quota** for this path — you do not need `gh auth login` for Cursor local Agent.

## Setting: `harness.cursor.agentExecution`

| Value | Agent / Spec+Agent behaviour |
|-------|------------------------------|
| **`auto`** (default) | Try **Cursor SDK local** when API key is set; optional fallback to Copilot tool loop if SDK unavailable and Copilot is configured; otherwise Cloud |
| **`local`** | Prefer Cursor SDK local; error if neither Cursor key nor Copilot is available |
| **`cloud`** | Always **Cursor Cloud** — no local file writes; Live Edits stays empty |

## Cursor Cloud (remote)

**Ask** mode and **`cloud`** execution use the [Cursor Cloud Agents API](https://cursor.com/docs/cloud-agent/api/endpoints) (`https://api.cursor.com`). The agent runs on Cursor infrastructure against a cloned repo — it **cannot** change files in your open VS Code workspace. **Live Edits** will not show local changes.

Use Cloud for long-running remote tasks or when you do not need IDE-side file edits.

## Legacy fallback (Copilot tool loop)

If **`auto`** is set, the Cursor SDK cannot load, and **GitHub Copilot** is configured, Harness may fall back to the same **Copilot tool loop** (`read_file`, `write_file`, …) used by Copilot Agent mode. That path consumes **Copilot API quota** and can return HTTP 429 when quota is exceeded.

To avoid Copilot entirely for Cursor Agent: set a **Cursor API key** and ensure the extension bundle includes `@cursor/sdk` (shipped under `extension/cli/node_modules/@cursor/`).

## Implementation references

| Layer | File |
|-------|------|
| Routing | `packages/cli/src/router/AgentRouter.ts` (`routeCursor`) |
| Cursor SDK local | `packages/cli/src/connectors/cursorLocal.ts` |
| Cursor Cloud | `packages/cli/src/connectors/cursorCloud.ts` |
| Shared prompt | `buildCursorPrompt()` in `cursorCloud.ts` |
| VS Code setting | `harness.cursor.agentExecution` in `packages/extension/package.json` |
| Live Edits IPC | `chat:tool` → `AgentEditTracker` |

See also [copilot-modes.md](copilot-modes.md) for Copilot-specific Ask/Agent/Spec+Agent details.
