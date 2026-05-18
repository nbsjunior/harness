# GitHub Copilot — Interaction Modes

Harness exposes three modes in the chat **mode bar** (below the agent selector).
They map to different behaviours in `AgentRouter.routeCopilot()`.

| Mode | UI label | What it does | When to use |
|------|----------|--------------|-------------|
| **ask** | Ask | Streaming Q&A via `api.githubcopilot.com/chat/completions`. No file tools. | Explaining code, questions, reviews without edits. |
| **agent** | Agent | Autonomous loop with tools: `read_file`, `write_file`, `list_files`, `search_in_files` (max 10 turns). | "Implement X", refactors, multi-file changes. |
| **spec+agent** | Spec+Agent | Same as Agent, plus all `*.yaml` / `*.yml` / `*.json` in `.harness/specs/` injected as `<spec>` system context. | Team workflows defined in Spec Manager (SDD). |

## Data flow (Spec+Agent)

```
User selects Spec+Agent
  → webview sends mode: 'spec+agent'
  → ChatViewProvider.resolveSpecPaths() lists .harness/specs/*
  → AgentService includes specPaths in chat:send
  → IpcServer reads each spec file, prepends system message with <spec> blocks
  → AgentRouter runs tool loop with spec-aware system prompt
```

## Auth requirement

All modes require a GitHub token with the **`copilot`** scope:

```bash
gh auth refresh --scopes copilot
```

See [starter-kit.md](starter-kit.md) and [ai-reference.md](ai-reference.md#copilot-authentication--why-so-many-steps).

## Implementation references

| Layer | File |
|-------|------|
| UI mode bar | `packages/extension/src/webview/chat/main.ts` |
| Mode + spec paths | `packages/extension/src/providers/ChatViewProvider.ts` |
| Spec injection | `packages/cli/src/ipc/IpcServer.ts` (`handleChatSend`) |
| Ask vs Agent routing | `packages/cli/src/router/AgentRouter.ts` |
