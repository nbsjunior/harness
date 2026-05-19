# Context and Specs

Harness combines **context engineering** (which files the model sees) and **Spec-Driven Development** (how the agent should behave) in **one workflow** — regardless of whether you use Copilot, Claude, Cursor, or another provider.

## Context files

Add files or folders to the agent context:

- Right-click in Explorer → **Add to Harness Context**
- Or command **Harness: Add to Context**

Context chips appear above the composer. Click a chip to open the file; **×** removes one item.

**Clear context** removes all chips and clears the input field.

Context paths are sent to the CLI on each message — the daemon reads file contents (never the extension host).

**Provider-agnostic:** attach context once, then switch from Copilot to Claude (or **Auto**) — the same files are still included. You do not re-upload context in another IDE.

## Spec Manager

`Ctrl+Shift+P` → **Harness: Open Spec Manager**

Browse, create, and edit spec files in `.harness/specs/`.

Specs are used automatically in **Spec+Agent** Copilot mode. See [SDD Specs](SDD-Specs).

## Workspace layout

```
your-project/
├── .harness/
│   ├── config.yaml
│   └── specs/
│       ├── my-skill.yaml
│       └── review-workflow.yaml
└── ...
```
