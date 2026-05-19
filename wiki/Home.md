# Harness Wiki

**Harness** is a meta-agent orchestrator for VS Code — one chat interface for GitHub Copilot, Cursor, Claude Code, Devin, and Kiro (AI-DLC).

---

## Quick links

| I want to… | Start here |
|------------|------------|
| Install and send my first message | [Getting Started](Getting-Started) |
| Use the chat UI (providers, modes) | [Chat Interface](Chat-Interface) |
| Configure API keys | [Configuration](Configuration) |
| Set up GitHub Copilot | [Copilot Modes](Copilot-Modes) |
| Set up Cursor AI | [Agent Connectors → Cursor](Agent-Connectors#cursor-ai-cloud-agents-api) |
| Use Specs (SDD) | [SDD Specs](SDD-Specs) |
| Run without VS Code (CLI only) | [Dual Mode](Dual-Mode) |
| Fix errors | [Troubleshooting](Troubleshooting) |

---

## What is Harness?

```
VS Code Extension (UI)  ←→  CLI daemon (IPC)  ←→  Agent connectors
                              │
         Copilot · Devin · Cursor · Claude · Kiro
```

- **Extension** — chat sidebar, spec manager, configuration panel
- **CLI** — all file I/O, authentication, agent routing (bundled inside the `.vsix`)
- **Specs** — YAML skills/tools/workflows in `.harness/specs/`

Repository: [github.com/nbsjunior/harness](https://github.com/nbsjunior/harness)

---

## Documentation map

### Users
- [Getting Started](Getting-Started)
- [Installation](Installation)
- [User Guide](User-Guide)
- [Chat Interface](Chat-Interface)
- [Configuration](Configuration)
- [Context and Specs](Context-and-Specs)

### Agents
- [Agent Connectors](Agent-Connectors)
- [Copilot Modes](Copilot-Modes) (Ask / Agent / Spec+Agent)

### Developers
- [Architecture](Architecture)
- [IPC Protocol](IPC-Protocol)
- [Dual Mode](Dual-Mode) (Extension vs CLI)
- [AI-DLC and Kiro](AI-DLC-and-Kiro)
- [Development Guide](Development-Guide)

### Help
- [Troubleshooting](Troubleshooting)
- [FAQ](FAQ)

---

## AI assistants

If you are an AI model working on this codebase, read **[AGENTS.md](https://github.com/nbsjunior/harness/blob/main/AGENTS.md)** in the repository first.
