# User Guide

Day-to-day usage of Harness in VS Code.

Harness keeps you in **one IDE** while you use **Copilot, Claude, Cursor, Devin, or Kiro**, with **specs** and **context files** applied in the same chat. Overview: [Why Harness](Why-Harness).

## Open panels

| Panel | Command |
|-------|---------|
| Chat | Click Harness icon in Activity Bar |
| Spec Manager | **Harness: Open Spec Manager** |
| Configuration | **Harness: Open Configuration** |
| Context | **Harness: Show Context** |

## Chat workflow

1. Optionally add files to context (right-click → Add to Harness Context)
2. Select **provider** pill (Copilot, Cursor, etc.)
3. Select **mode** (Ask / Agent / Spec+Agent for Copilot)
4. Type message → `Ctrl+Enter`
5. Click file links in responses to jump to code

See [Chat Interface](Chat-Interface).

## New conversation

Click **+ New chat** — clears history and starts a fresh session. Context files are kept unless you click **Clear context**.

## Switch agent mid-project

Change the provider pill before sending the next message. History remains in the UI but the new agent only receives messages sent after the switch (per session routing).

## Copilot login

**Harness: Copilot Login** runs `gh auth refresh --scopes copilot`.

## MCP servers

Configure in **Configuration → MCP** tab. Harness connects MCP servers defined in workspace settings for tool augmentation (extension-side).

## Check getGoat

**Harness: Check getGoat** prints agent readiness in a notification and the Output channel.

More: [Configuration](Configuration) · [Troubleshooting](Troubleshooting)
