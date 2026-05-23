<p align="center">
  <img src="images/toddspect-icon.png" alt="Todd of AIDLC logo" width="80" />
</p>

# User Guide

Day-to-day usage of Todd of AIDLC in VS Code.

Todd of AIDLC keeps you in **one IDE** while you use **Copilot, Claude, Cursor, Devin, or Kiro**, with **specs** and **context files** applied in the same chat. Overview: [Why Todd of AIDLC](Why-Todd-of-AIDLC).

## Open panels

| Panel | Command |
|-------|---------|
| Chat | Click Todd of AIDLC icon in Activity Bar |
| Spec Manager | **Todd of AIDLC: Open Spec Manager** |
| Configuration | **Todd of AIDLC: Open Configuration** |
| Context | **Todd of AIDLC: Show Context** |

## Chat workflow

1. Optionally add files to context (right-click → Add to Todd of AIDLC Context)
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

**Todd of AIDLC: Copilot Login** runs `gh auth refresh --scopes copilot`.

## MCP servers

Configure in **Configuration → MCP** tab. Todd of AIDLC connects MCP servers defined in workspace settings for tool augmentation (extension-side).

## Check getGoat

**Todd of AIDLC: Check getGoat** prints agent readiness in a notification and the Output channel.

More: [Configuration](Configuration) · [Troubleshooting](Troubleshooting)
