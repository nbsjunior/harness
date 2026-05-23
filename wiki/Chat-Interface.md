<p align="center">
  <img src="images/toddspect-icon.png" alt="Todd of AIDLC logo" width="80" />
</p>

# Chat Interface

The Todd of AIDLC chat is designed like **Cursor**: messages on top, composer at the bottom, provider pills below the input.

This is where you **switch AI providers without leaving VS Code** — Copilot, Claude, Cursor, Devin, Kiro, or **Auto** — while keeping the same **context chips** and (for Copilot) **Spec+Agent** mode. See [Why Todd of AIDLC](Why-Todd-of-AIDLC).

## Layout

```
┌─────────────────────────────┐
│  Messages (scroll)          │
├─────────────────────────────┤
│  + New chat | Clear context │
│  [ context chips ]          │
│  ┌───────────────────── ↑ ┐ │
│  │ Ask anything…        │ │
│  └───────────────────────┘ │
│  Ask | Agent | Spec+Agent │
│  Copilot | Claude | …  ⚙  │
└─────────────────────────────┘
```

## Composer actions

| Button | Action |
|--------|--------|
| **+ New chat** | Clears conversation history, new session ID, clears input |
| **Clear context** | Removes all context files **and** clears the input text |
| **↑** | Send (`Ctrl+Enter`). Becomes **■** while streaming (stop) |

## Provider pills (bottom)

Click a provider to switch: **Auto**, **Copilot**, **Devin**, **Cursor**, **Claude**, **Kiro**.

**Auto** (default) lets Todd of AIDLC pick the best provider per message — see [Auto Routing](Auto-Routing).

The selected pill is highlighted. Changing provider applies to the next message.

## Mode pills

| Mode | Description |
|------|-------------|
| **Ask** | Conversational Q&A (Copilot SSE streaming) |
| **Agent** | Autonomous tool loop (read/write files) |
| **Spec+Agent** | Agent + active Spec YAML as system context |

Copilot modes only apply when **Copilot** is selected. See [Copilot Modes](Copilot-Modes).

## File references

When the agent mentions files like `` `src/app.ts:42` ``, they appear as **clickable links**. Click to open the file at that line in the editor.

Context chips also open files on click (× removes from context).

## Slash commands

| Command | Effect |
|---------|--------|
| `/clear` | Clear conversation (webview only) |
| `/agent copilot` | Switch provider |

## Output trace

**View → Output → Todd of AIDLC** — full IPC trace (secrets redacted). Use for debugging daemon issues.
