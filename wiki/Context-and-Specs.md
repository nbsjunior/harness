# Context and Specs

## Context files

Add files or folders to the agent context:

- Right-click in Explorer → **Add to Harness Context**
- Or command **Harness: Add to Context**

Context chips appear above the composer. Click a chip to open the file; **×** removes one item.

**Clear context** removes all chips and clears the input field.

Context paths are sent to the CLI on each message — the daemon reads file contents (never the extension host).

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
