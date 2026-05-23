<p align="center">
  <img src="images/toddspect-icon.png" alt="ToddSpect logo" width="80" />
</p>

# Architecture

## Overview

```
┌─────────────────────┐     IPC (JSON lines)     ┌─────────────────────┐
│  VS Code Extension  │ ◄──────────────────────► │  CLI daemon         │
│  - Chat webview     │      stdin / stdout      │  - IpcServer        │
│  - Config panels    │      stderr = logs       │  - AgentRouter      │
│  - CliService       │                          │  - Connectors       │
└─────────────────────┘                          └──────────┬──────────┘
                                                            │
                    Copilot · Devin · Cursor · Claude · Kiro
```

## Rules

1. **Extension never reads file contents** for agent calls
2. **stdout** = JSON IPC only (daemon mode)
3. **stderr** = human logs (`toddspectLog`)
4. **Secrets** in VS Code Secret Storage or env — not in YAML

## Packages

| Package | Role |
|---------|------|
| `packages/extension` | UI, IPC client, webviews |
| `packages/cli` | Daemon, router, connectors, specs |

## Bundling

The CLI is bundled as a single ESM file inside the `.vsix` (`extension/cli/dist/index.js`).

## More detail

- Repository: [docs/architecture.md](https://github.com/nbsjunior/todd/blob/main/docs/architecture.md)
- AI reference: [AGENTS.md](https://github.com/nbsjunior/todd/blob/main/AGENTS.md)
